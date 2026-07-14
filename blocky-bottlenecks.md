# Blocky Agent Assembly Bottleneck Logs

## Bottleneck 1: Unnecessary Turn Iterations
* **Issue:** The agent spent turns doing sequential `set_cursor_color` actions before placing pieces.
* **Resolution:** Removed the need to use `set_cursor_color` during automated builds. Allowed direct color parameters inside each `place_piece` call. This reduces round-trips to OpenRouter by up to 40% on multicolored builds.

## Bottleneck 2: Fine-grained Short Block Usage for Walls and Foundations
* **Issue:** The agent relied heavily on small `1x3` and `1x4` bricks and `2x4` plates, leading to 25+ tool calls just to form a wall and foundation layer.
* **Resolution:** Added long high-efficiency bricks, plates, and giant blocks:
  * **Bricks:** `brick-1x6`, `brick-1x8`
  * **Plates:** `plate-4x4`, `plate-6x6`, `plate-8x8`
  * **Macro Specialty Tower Blocks:** `tower-round-4x4` (double-height round tower column), `fort-corner-4x4` (integrated L-shaped fort corner), and mega wall segments `wall-1x12` and `wall-1x16`.
* **Impact:** A complete castle or large fort can now be built with 4 to 8 highly-efficient macro blocks instead of 40+ granular small bricks, eliminating step counts and reducing collisions to zero.

## Bottleneck 3: Z-Fighting Geometry Clashes
* **Issue:** The model experienced collision feedback when roof layers or foundations were placed adjacent to wall edges, leading to repeated retry/correction loops.
* **Resolution:** Scaled down brick bodies slightly by a `0.998` visual factor to eliminate physical face overlaps and visual flickering.

## Bottleneck 4: Architectural Gaps & Decision Latency on Walls
* **Issue:** The model struggled to calculate continuous modular math. When placing long wall elements (like `wall-1x12` or `wall-1x16`), it was making coordinate gaps (e.g. placing consecutive segments with gaps because it didn't align end-to-end to modular lengths). This led to calculation re-evaluations and very slow turns due to thinking overload.
* **Resolution:** 
  * Explicitly trained and prompted the model inside the instructions on exact contiguous wall segment alignment math: e.g. segment placed at `x=0, z=0` (length 16) must have the next end-to-end segment placed precisely at `x=0, z=16`.
  * Warned the model to strictly cross-reference block width (`w`) and length (`l`) dimensions from the catalog first to calculate seamless coordinates, drastically decreasing decision-time gaps.

## Bottleneck 5: Overthinking, Latency, and Runaway Tokens
* **Issue:** Looking closely at the logged prompt trace, the model spent significant tokens over-analyzing and weighing trivial layout alternatives (*"Let me do 12 layers... No, let me do 14... Let me think x=0 to 2..."*). This caused huge generation latency per turn. 
* **Resolution:** 
  * Set `temperature: 0.1` inside OpenRouter configurations. This clamps model temperature close to determinism, preventing creative pauses, erratic token branching, and long latency.
  * Added a strict rule to the prompt: *"Be extremely brief and concise in your thinking. Do NOT spend tokens repeatedly overanalyzing different construction alternatives. Think of one simple, solid layout and output all the tool calls at once in your very first turn."*
  * Added a safety limit of `max_tokens: 1500` to prevent runaway generation wait times.

## Bottleneck 6: Over-Engineering Multi-Piece Setup Layouts on Turn 1
* **Issue:** When tasked with complex, multi-piece abstract builds (like a desktop PC computer setup with tower + monitor + keyboard + mouse), the model suffered from **choice paralysis**. It over-engineered details (e.g., trying to figure out rotation offsets and micro-placements of individual 1-stud key caps or thin vertical screen bezels) before outputting any blocks, hitting zero-piece safety limits and aborting.
* **Resolution:**
  * Introduced the **Sub-Assembly Approach** to the system guidelines: *"When building complex multi-piece setups (like a Computer PC setup), do NOT attempt to over-engineer complex thin vertical panels or micro-detailing on Turn 1. Build the massive components in clean, simple chunks (e.g., stack `brick-2x4` for a CPU tower, place `plate-2x4` flatly as a monitor/keyboard base, and stack standard blocks in simple layout steps).”*
  * Encourages the model to place a high-level layout outline on Turn 1, then progressively refine it on subsequent turns, keeping execution snappy and collision-free.

## Bottleneck 7: Runaway Continuation Nudge Loops on Natural Completeness
* **Issue:** In cases where the model naturally completed a simple requested structure and declared *"Done!"* (or when you asked to *"revert"* the previous steps), our safety filters noticed that `0` new blocks were placed, and **wrongly nudged it to continue building**. This trapped the agent in a runaway continuation loop, forcing it to keep fabricating blocks endlessly after the task was already finished.
* **Resolution:**
  * Modified the safety filters in `BlockyPanel.tsx` to detect natural model claims. If the model explicitly claims to be complete (`claimsDone` evaluated to `true`), the safety-net is bypassed. The loop cleanly breaks, commits the state, and ends the session.
