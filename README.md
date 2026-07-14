# 🧱 Blocky Agent • 3D LEGO-Style Builder

An interactive, keyboard-primary 3D LEGO-style block builder powered by Three.js and React, featuring **Blocky**—an intelligent, autonomous assembly agent integrated with OpenRouter models (like Tencent Hy3, Poolside Laguna, and Gemma).

<p align="center">
  <img src="src/assets/hero.png" alt="Blocky Agent Interface Preview" width="100%" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</p>

## ✨ Features

* **🎨 Tactile 3D Builder Interface:** Build Declaratively in 3D using standard Lego snapping parameters, realistic plastic gloss shaders, bevel lines, and a true infinite floor grid.
* **🤖 Autonomous Blocky Agent:** Give natural language instructions (e.g. *"build a medieval tower with red arches"*, *"add clothes to my character"*, or *"make a soccer field"*) and watch Blocky assemble it block-by-block.
* **⚡ High-Efficiency Architectural Macros:** Specialized structural macros (round towers, integrated fort corners, massive plates, and mega wall segments) allow Blocky to assemble huge fortress landscapes in record turns.
* **🛑 Live Stream & Assembly Controls:** Real-time character-by-character text streams, a live rolling terminal to watch Blocky's Chain of Thought (CoT), tactile clack audio soundscapes, and an immediate Abort button to stop generation mid-flight.
* **🩹 Atomic Undos & Reverts:** Blocky can fetch current sandbox states, inspect unique block IDs, and selectively delete its errors using the newly designed `remove_piece` tool without clearing your workspace.
* **💾 Local Auditing & Persistence:** Automatic local storage saves, JSON exports/imports, and comprehensive markdown run log generations downloaded right to your local system for benchmarking.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, TypeScript, Tailwind CSS 4
* **3D Rendering:** Three.js, React Three Fiber (R3F), `@react-three/drei`
* **State & Audio:** Zustand, Web Audio API
* **Agent Engine:** OpenRouter APIs, Server-Sent Events (SSE) Streaming

---

## 🚀 Quickstart

### 1. Clone & Install Dependencies
```bash
git clone git@github.com:alonsosolisg/blocky-agent.git
cd blocky-agent
npm install
```

### 2. Configure Environment Keys
Create a `.env` (or `.env.local`) file in the root folder and add your OpenRouter API Key (the `VITE_` prefix is required to expose it to the client bundle):
```env
VITE_OPENROUTER_API_KEY=your_sk_or_api_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open your browser to `http://localhost:5174` and start building!

---

## 📂 Project Architecture

```text
├── src/
│   ├── assets/             # Graphic previews and icons
│   ├── components/         # React panels (Blocky panel, Piece Palette, Overlays)
│   ├── lib/                # Audio, snapped calculations, and parts catalog
│   ├── store/              # Zustand state (Placed blocks, History, Undo/Redo)
│   ├── three/              # Scene parameters, Camera flyers, and Lego renders
│   ├── types.ts            # Type definitions
│   └── main.tsx            # App bootstrapping
├── logs/                   # Performance benchmarks and run logs
├── vite.config.ts          # Server ports (strict 5174) and PWA configs
└── package.json            # Scripts & dependencies
```

---

## 🛡️ Security & Self-Preservation

* **No Secrets Committed:** Local API keys are strictly loaded through the system environment `.env` which is fully blacklisted in `.gitignore`.
* **Board Protection:** Blocky is forbidden from calling `clear_all` to clear the sandbox unless you explicitly use permission words like *"wipe"*, *"clear"*, or *"reset"*. Your existing creations stay 100% safe!
* **Auto-Snap Avoidance:** If you build something on coordinates Blocky wanted, Blocky will automatically sweep outward, find empty adjacent grid space, and snap its build next to yours.

---

<p align="center">
  Made with 🧱 and ⚡. Licensed under the MIT License.
</p>
