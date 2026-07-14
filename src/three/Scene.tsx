import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useState, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { getPart } from '../lib/pieceCatalog'
import { playPlaceSound, playSelectSound, playDeleteSound, playLayerTick } from '../lib/audio'
import { useBuilderStore } from '../store/useBuilderStore'
import { LegoPiece } from './LegoPiece'
import { snapToGrid, snapYToPlate, canPlacePiece } from '../lib/snapUtils'
import type { PlacedPiece } from '../types'

// Shared stud geometry and material for both dense and far layers.
// This ensures identical visual appearance and avoids duplicating creation cost.
const STUD_GEO = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 6)
const STUD_MAT = new THREE.MeshPhongMaterial({ 
  color: '#4B9F3A', 
  shininess: 5 
})

/**
 * The main 3D scene content.
 * Self-contained: uses zustand store directly.
 * Handles environment, pieces, ghost cursor, controls, and keyboard input.
 */

function LegoClouds() {
  // Blocky Lego-like clouds using simple white boxes (no real texture needed)
  const cloudMat = useMemo(() => new THREE.MeshLambertMaterial({ 
    color: 0xeeeeee, 
    transparent: true, 
    opacity: 0.85 
  }), [])

  const clouds = useMemo(() => {
    const arr: THREE.Group[] = []
    // More visible Lego-style blocky clouds, spread out for infinite sky feel
    const positions = [
      [-90, 70, -80], [60, 85, -130], [150, 65, 50], 
      [-170, 95, 90], [80, 75, 160], [-40, 110, 40],
      [200, 82, -40], [-120, 60, 180]
    ]
    positions.forEach((pos) => {
      const group = new THREE.Group()
      // Larger chunky blocks for more noticeable Lego clouds
      const sizes = [[18,5,11], [14,6,15], [10,4,9], [8,3,7]]
      sizes.forEach((s, j) => {
        const cloudPart = new THREE.Mesh(
          new THREE.BoxGeometry(s[0], s[1], s[2]),
          cloudMat
        )
        cloudPart.position.set(
          (j-1.5)*4.5 + (Math.random()-0.5)*3, 
          (j-1)*1.5 + (Math.random()-0.5), 
          (j-1)*3 + (Math.random()-0.5)*2
        )
        group.add(cloudPart)
      })
      group.position.set(pos[0], pos[1], pos[2])
      arr.push(group)
    })
    return arr
  }, [cloudMat])

  return (
    <>
      {clouds.map((cloud, idx) => (
        <primitive key={idx} object={cloud} />
      ))}
    </>
  )
}

// Helper to (re)position a local grid of studs around a center point.
// Reuses the provided dummy object to avoid allocations.
function updateStudInstances(
  inst: THREE.InstancedMesh,
  centerX: number,
  centerZ: number,
  size: number,
  dummy: THREE.Object3D
) {
  const half = Math.floor(size / 2)
  let i = 0

  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      dummy.position.set(centerX + x, 0.015, centerZ + z)
      dummy.updateMatrix()
      inst.setMatrixAt(i++, dummy.matrix)
    }
  }
}

function InstancedGrassStuds() {
  // Large camera-oriented sliding grid of actual 3D studs.
  // The center is pushed far in the view direction (especially when high up).
  // This makes the visible floor feel completely studded no matter where
  // you orbit or look, giving a true infinite flat Lego baseplate feel.
  const localSize = 280 // 280x280 ≈ 78k dense studs close – larger window to push edges out
  const studCount = localSize * localSize

  // Use the shared geometry/material so FarStuds look identical
  const studGeo = STUD_GEO
  const studMat = STUD_MAT

  const instancedRef = useRef<THREE.InstancedMesh>(null!)
  const lastGridPos = useRef({ x: 0, z: 0 })
  const dummy = useRef(new THREE.Object3D()).current // reuse to avoid allocations on every recenter

  // Initial placement
  useEffect(() => {
    const inst = instancedRef.current
    if (!inst) return

    updateStudInstances(inst, 0, 0, localSize, dummy)
    inst.frustumCulled = false
    inst.computeBoundingSphere()

    return () => {
      if (inst) inst.dispose?.()
    }
  }, [localSize])

  // Compute a focus point on the ground that is heavily biased in the
  // direction the camera is facing. This is the key for "feels like all floor studs"
  // when orbiting and looking across a large area.
  function getLookFocus(camera: THREE.Camera) {
    const pos = camera.position
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0

    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1)
    } else {
      forward.normalize()
    }

    // Much stronger look-ahead. Scale with height, but allow very large values
    // when the camera is high up (god view). This pushes the stud grid far
    // into the direction the user is looking.
    const height = Math.max(5, pos.y)
    // Strong forward bias. Pushes the dense window forward.
    const lookAhead = 70 + height * 2.3

    const forwardFocusX = pos.x + forward.x * lookAhead
    const forwardFocusZ = pos.z + forward.z * lookAhead

    // Blend back toward camera position a bit. This gives better side and
    // rear coverage so you don't see hard "back edges" when panning or looking sideways.
    const blend = 0.65 // 0.65 = mostly forward, still good back/sides
    const focusX = pos.x * (1 - blend) + forwardFocusX * blend
    const focusZ = pos.z * (1 - blend) + forwardFocusZ * blend

    return {
      x: Math.round(focusX),
      z: Math.round(focusZ)
    }
  }

  useFrame(({ camera }) => {
    const inst = instancedRef.current
    if (!inst) return

    const desired = getLookFocus(camera)

    const dx = Math.abs(desired.x - lastGridPos.current.x)
    const dz = Math.abs(desired.z - lastGridPos.current.z)

    // Recenter only on larger movements (rarer jumps = less noticeable edges far away).
    if (dx > 25 || dz > 25) {
      lastGridPos.current = desired
      updateStudInstances(inst, desired.x, desired.z, localSize, dummy)
      inst.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <instancedMesh
      ref={instancedRef}
      args={[studGeo, studMat, studCount]}
      castShadow={false}
      receiveShadow={true}
    />
  )
}

// Far layer: full density (step=1, identical studs) placed further ahead.
// Extends coverage so you don't hit a hard "no more studs" edge when looking far/high.
// Uses blend + large size + rare updates to keep edges from feeling weird.
function FarStuds() {
  const step = 1
  const extent = 140 // ~280 unit diameter far dense band – sized to extend coverage without excessive instances
  const count = Math.floor((extent * 2) / step) + 1
  const studCount = count * count

  // Identical to dense layer for visual consistency
  const studGeo = STUD_GEO
  const studMat = STUD_MAT

  const ref = useRef<THREE.InstancedMesh>(null!)
  const lastFocus = useRef({ x: 0, z: 0 })
  const dummy = useRef(new THREE.Object3D()).current // reuse dummy for perf

  useEffect(() => {
    const inst = ref.current
    if (!inst) return
    updateCoarseStuds(inst, 0, 0, extent, step, dummy)
    inst.frustumCulled = false
    return () => inst.dispose?.()
  }, [])

  useFrame(({ camera }) => {
    const inst = ref.current
    if (!inst) return

    const pos = camera.position
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() > 0.0001) forward.normalize()

    const height = Math.max(5, pos.y)
    const lookAhead = 220 + height * 3.8  // place the far band well beyond the dense layer's forward edge

    const forwardFocusX = pos.x + forward.x * lookAhead
    const forwardFocusZ = pos.z + forward.z * lookAhead

    // Same blend logic for the far band so its edges feel natural too.
    const blend = 0.75 // a bit more forward bias for the distant layer
    const fx = Math.round( pos.x * (1 - blend) + forwardFocusX * blend )
    const fz = Math.round( pos.z * (1 - blend) + forwardFocusZ * blend )

    const dx = Math.abs(fx - lastFocus.current.x)
    const dz = Math.abs(fz - lastFocus.current.z)

    // Recenter far band very rarely. Any edge pop is way out in the distance.
    if (dx > 60 || dz > 60) {
      lastFocus.current = { x: fx, z: fz }
      updateCoarseStuds(inst, fx, fz, extent, step, dummy)
      inst.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <instancedMesh
      ref={ref}
      args={[studGeo, studMat, studCount]}
      castShadow={false}
      receiveShadow={true}
    />
  )
}

function updateCoarseStuds(
  inst: THREE.InstancedMesh,
  cx: number,
  cz: number,
  extent: number,
  step: number,
  dummy: THREE.Object3D
) {
  let i = 0
  for (let x = -extent; x <= extent; x += step) {
    for (let z = -extent; z <= extent; z += step) {
      dummy.position.set(cx + x, 0.012, cz + z)
      dummy.updateMatrix()
      inst.setMatrixAt(i++, dummy.matrix)
    }
  }
}

function InnerScene() {
  const pieces = useBuilderStore((s) => s.pieces)
  const cursor = useBuilderStore((s) => s.cursor)
  const placePiece = useBuilderStore((s) => s.placePiece)
  const removePiece = useBuilderStore((s) => s.removePiece)
  const setCursorPosition = useBuilderStore((s) => s.setCursorPosition)
  const rotateCursor = useBuilderStore((s) => s.rotateCursor)
  const setCursorPart = useBuilderStore((s) => s.setCursorPart)
  const setCursorColor = useBuilderStore((s) => s.setCursorColor)

  const { camera, scene } = useThree()

  const controlsRef = useRef<any>(null)
  // Held keys for smooth continuous camera flying (WASD + Q/E vertical)
  const moveKeys = useRef<Set<string>>(new Set())

  // Light fog for depth. Increased far plane so the infinite flat world feels bigger
  // before fading (pairs well with the 4000-unit background plane).
  useEffect(() => {
    scene.fog = new THREE.Fog(0x87ceeb, 120, 900)
  }, [scene])

  // Replicated floor tiles for close-up "lego baseplate" look.
  // Increased for a more substantial central area. Far area uses a huge single plane + fog.
  const floorTiles = useMemo(() => {
    const tiles: any[] = []
    const tileSize = 32
    const numTiles = 14 // ~448x448 central detailed area
    const offset = (numTiles * tileSize) / 2
    for (let i = 0; i < numTiles; i++) {
      for (let j = 0; j < numTiles; j++) {
        const px = i * tileSize - offset + tileSize / 2
        const pz = j * tileSize - offset + tileSize / 2
        tiles.push(
          <mesh
            key={`floor-${i}-${j}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[px, 0.01, pz]}
            receiveShadow
          >
            <planeGeometry args={[tileSize, tileSize]} />
            <meshLambertMaterial color="#4B9F3A" />
          </mesh>
        )
      }
    }
    return tiles
  }, [])

  // Local for ghost animation only (demo pop)
  const [ghostPop, setGhostPop] = useState(1)

  // Keyboard-driven cursor + game-like actions (wired to store)
  // Movement is relative to camera orientation for intuitive building.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keys when user is interacting with UI (inputs, panels, agent chat, etc.)
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest?.('.panel.left') ||
        target.closest?.('.blocky-panel')
      ) {
        return
      }

      // Track for smooth camera fly (WASD + Q/E)
      moveKeys.current.add(e.key)

      const step = e.shiftKey ? 4 : 1

      // Compute camera-relative directions (projected on XZ plane)
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() > 0.0001) {
        forward.normalize()
      } else {
        // Looking almost straight down — fall back to a stable direction (world +Z)
        // User can still rotate the view slightly for different relative mapping.
        forward.set(0, 0, 1)
      }

      const right = new THREE.Vector3().crossVectors(
        forward,
        new THREE.Vector3(0, 1, 0)
      ).normalize()

      let deltaX = 0
      let deltaZ = 0

      // Helper: convert camera direction into a pure world axis step (never diagonal).
      // This keeps piece movement intuitive on the grid while still being view-relative.
      const applyCardinal = (dir: THREE.Vector3, amount: number) => {
        const ax = Math.abs(dir.x)
        const az = Math.abs(dir.z)
        if (ax > az) {
          deltaX += Math.sign(dir.x || 1) * amount
        } else {
          deltaZ += Math.sign(dir.z || 1) * amount
        }
      }

      // Arrow keys move the build cursor (ghost piece) — always 4 pure directions on grid.
      if (['ArrowUp'].includes(e.key)) {
        applyCardinal(forward, +step)
      }
      if (['ArrowDown'].includes(e.key)) {
        applyCardinal(forward, -step)
      }
      if (['ArrowLeft'].includes(e.key)) {
        applyCardinal(right, -step)
      }
      if (['ArrowRight'].includes(e.key)) {
        applyCardinal(right, +step)
      }

      let newX = cursor.x + deltaX
      let newY = cursor.y
      let newZ = cursor.z + deltaZ

      if (e.key === '[' || e.key === 'PageUp') {
        newY = Math.max(0.09, newY - 0.4)
        playLayerTick()
      }
      if (e.key === ']' || e.key === 'PageDown') {
        // No artificial upper cap for god-mode building (was previously limited to 12)
        newY = newY + 0.4
        playLayerTick()
      }

      // Snap and update if changed
      const snappedX = snapToGrid(newX)
      const snappedY = snapYToPlate(newY)
      const snappedZ = snapToGrid(newZ)

      if (snappedX !== cursor.x || snappedY !== cursor.y || snappedZ !== cursor.z) {
        setCursorPosition(snappedX, snappedY, snappedZ)
      }

      if (e.key === ' ' || e.key === 'Enter') {
        const part = getPart(cursor.partId)
        const posY = snapYToPlate(cursor.y)
        const proposed: Omit<PlacedPiece, 'id'> = {
          partId: cursor.partId,
          position: [snapToGrid(cursor.x), posY, snapToGrid(cursor.z)],
          rotationY: cursor.rotationY,
          color: cursor.color,
        }

        if (canPlacePiece(proposed, pieces)) {
          placePiece(proposed)
          playPlaceSound()
          setGhostPop(0.3)
          setTimeout(() => setGhostPop(1), 120)
          console.log('%c[3D BUILDER] PLACE', 'color:#237841', {
            part: part.name,
            pos: proposed.position,
            color: cursor.color,
          })
        } else {
          playDeleteSound()
        }
      }

      if (e.key.toLowerCase() === 'x' || e.key === 'Delete' || e.key === 'Backspace') {
        if (pieces.length > 0) {
          const last = pieces[pieces.length - 1]
          playDeleteSound()
          removePiece(last.id)
        }
      }

      if (e.key.toLowerCase() === 'r') {
        rotateCursor(1)
        playSelectSound()
      }

      if (e.key.toLowerCase() === 'c') {
        // Demo color cycle - in real would be from palette
        const colors = ['#c91a09', '#f2c832', '#0055a4', '#237841', '#f4f4f4', '#1f2a3a']
        const idx = colors.indexOf(cursor.color)
        const newColor = colors[(idx + 1) % colors.length]
        setCursorColor(newColor)
        playSelectSound()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      moveKeys.current.delete(e.key)
    }

    const handleBlur = () => {
      moveKeys.current.clear()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [
    cursor,
    pieces,
    placePiece,
    removePiece,
    setCursorPosition,
    rotateCursor,
    setCursorPart,
    setCursorColor,
    camera,
  ])

  const currentPart = getPart(cursor.partId)
  const ghostScale = 0.55 + ghostPop * 0.45

  // Compute validity for ghost guide color (use snapped coords for consistency)
  const ghostX = snapToGrid(cursor.x)
  const ghostY = snapYToPlate(cursor.y)
  const ghostZ = snapToGrid(cursor.z)
  const proposedForGhost: Omit<PlacedPiece, 'id'> = {
    partId: cursor.partId,
    position: [ghostX, ghostY, ghostZ],
    rotationY: cursor.rotationY,
    color: cursor.color,
  }
  const isValid = canPlacePiece(proposedForGhost, pieces)

  // Smooth continuous "god flying" for WASD. Runs every frame with delta time.
  // Cursor arrows remain discrete grid steps (pure 4-dir).
  useFrame((_, delta) => {
    const baseSpeed = 15 // world units per second — feels good for large studded area
    const isFast = moveKeys.current.has('Shift') || moveKeys.current.has('shift')
    const flySpeed = baseSpeed * (isFast ? 3.0 : 1.0)
    const moveDist = flySpeed * delta

    if (moveDist <= 0) return

    // Fresh camera-relative axes
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() > 0.0001) {
      forward.normalize()
    } else {
      forward.set(0, 0, 1)
    }

    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize()

    const move = new THREE.Vector3()
    const has = (k: string) => moveKeys.current.has(k) || moveKeys.current.has(k.toUpperCase())

    if (has('w')) move.add(forward.clone().multiplyScalar(moveDist))
    if (has('s')) move.add(forward.clone().multiplyScalar(-moveDist))
    if (has('a')) move.add(right.clone().multiplyScalar(-moveDist))
    if (has('d')) move.add(right.clone().multiplyScalar(moveDist))

    // Vertical flying (Q = down, E = up) for true god-mode freedom
    if (has('q')) move.y -= moveDist * 0.75
    if (has('e')) move.y += moveDist * 0.75

    if (move.lengthSq() > 0) {
      camera.position.add(move)

      // Keep camera above the floor
      if (camera.position.y < 0.8) camera.position.y = 0.8

      if (controlsRef.current) {
        controlsRef.current.target.add(move)
        if (controlsRef.current.target.y < 0.3) controlsRef.current.target.y = 0.3
        controlsRef.current.update?.()
      }
    }
  })

  return (
    <>
      {/* Joyful light studio background — nostalgic clean Lego sky */}
      <color attach="background" args={['#A1D0F0']} />

      {/* Cheerful, tasteful lighting */}
      <ambientLight intensity={0.82} />
      <hemisphereLight args={['#d4e8f7', '#f4e9d2', 0.75]} position={[0, 1, 0]} />
      <directionalLight
        position={[18, 28, -12]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={10}
        shadow-camera-far={80}
      />
      <directionalLight position={[-14, 16, 22]} intensity={0.55} />

      {/* Lego-style sky with blocky white clouds */}
      <LegoClouds />

      {/* Replicated massive Lego flat blocks for the floor (tiled 32x32 baseplates in center) */}
      {floorTiles}

      {/* Huge background plane to give truly infinite flat world feel (like Minecraft flat) */}
      {/* This extends far beyond the detailed tiles + fog hides the edges */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
      >
        <planeGeometry args={[8000, 8000]} />
        <meshLambertMaterial color="#4B9F3A" />
      </mesh>

      {/* Dense close studs (orientation-aware) */}
      <InstancedGrassStuds />

      {/* Coarser far studs layer — extends the studded look much farther
          when looking across the world from a height. */}
      <FarStuds />

      {/* Placed bricks from store */}
      {pieces.map((piece) => (
        <group
          key={piece.id}
          onClick={(e) => {
            e.stopPropagation()
            useBuilderStore.getState().selectPiece(piece.id)
          }}
        >
          <LegoPiece piece={piece} />
        </group>
      ))}

      {/* Live ghost cursor preview - movement relative to camera */}
      <group position={[cursor.x, cursor.y, cursor.z]}>
        <LegoPiece
          piece={{
            id: 'ghost',
            partId: cursor.partId,
            position: [0, 0, 0],
            rotationY: cursor.rotationY,
            color: cursor.color,
          }}
          isGhost
        />
        {/* Validity guide: rotated + offset exactly like the brick body so it matches shape + rotation */}
        <group rotation={[0, cursor.rotationY, 0]}>
          <mesh
            position={[
              (currentPart.w - 1) * 0.5,
              (currentPart.hPlates * 0.4) / 2 + 0.03,
              (currentPart.l - 1) * 0.5,
            ]}
            scale={ghostScale}
          >
            <boxGeometry
              args={[
                currentPart.w + 0.18,
                currentPart.hPlates * 0.4 + 0.08,
                currentPart.l + 0.18,
              ]}
            />
            <meshBasicMaterial
              color={isValid ? '#2e8b3e' : '#b33a2e'}
              wireframe
              transparent
              opacity={0.32}
            />
          </mesh>
        </group>
      </group>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        minDistance={2.5}
        maxDistance={120}
        maxPolarAngle={Math.PI * 0.48} // Prevent going under the floor
        target={[0, 3, 0]}
      />
    </>
  )
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [12, 14, 18], fov: 48, near: 0.5, far: 300 }}
      style={{ background: '#d6e0eb' }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <InnerScene />
    </Canvas>
  )
}
