# ink.ai Dynamics

A hackathon project built on top of the ink.ai drawing canvas. While the base ink.ai app provides the core stroke processing, shape detection, and handwriting recognition, **this project adds the ability to seamlessly turn physics diagrams and hand-drawn sketches into fully interactive simulations** and UI components.

<video controls width="100%" src="./demo-ink-ai.mp4"></video>

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Environment Setup
Copy the example env file and configure:
```bash
cp .env.example .env
```

Required variables:
| Variable | Description | Default |
|----------|-------------|---------|
| `INK_RECOGNITION_API_URL` | Handwriting recognition API endpoint | *(none — must be set)* |

You'll need a running instance of the recognition API. Set the URL in your `.env` file.

### Running
```bash
npm run dev      # Start dev server, accessible on the local network
npm run build    # TypeScript compile + Vite production bundle
npm run lint     # ESLint check
npm run preview  # Preview production build locally
```

The dev server is exposed on all network interfaces. The terminal output will show your network URL (e.g. `http://<your-ip>:5173`) that other devices on the same network can use to access the app.

### How It Works
The base ink.ai application collects strokes from a pointer device, debounces them, and processes them to detect shapes and handwriting.

**Interactive Simulations (This Project):**
We added a new processing layer that seamlessly integrates the core `ink.ai` engine with advanced LLM inference and web technologies to bring drawings to life:

1. **Contextual Recognition**: As users draw complex scenes like physics diagrams (e.g., ramps, balls, springs), the system captures the spatial layout and intent.
2. **LLM Simulation Generation**: The parsed scene data is sent to an LLM, which intelligently interprets the physics context and generates a standalone, logic-driven HTML/JS simulation.
3. **Reactive Overlays with Arrow.js**: Using Arrow.js, the generated simulation is instantly rendered as a dynamic UI widget, overlaid and mapped perfectly to the original drawing's screen coordinates on the canvas.

The result is a fluid, magical transition from a static hand-drawn sketch into a fully playable, interactive physics simulation.

See `docs/New element HOWTO.md` for a guide on adding new element types.
