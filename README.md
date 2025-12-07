# Veridebug - FPGA Transformer Debugger

A beautiful, reactive frontend for running transformer inference on FPGAs with a Gemini 3-based "vibe debugging" assistant that helps generate code, debug it, and optimize LUT usage.

![Veridebug Screenshot](./screenshot.png)

## Features

### 🔲 Circuit & LUT Visualization Panel
- Visual, node-based view of FPGA circuit topology using ReactFlow
- Shows logical elements (LUTs, Registers, DSPs, I/O, MUX) as color-coded nodes
- Displays LUT utilization with color-coded bars
- Critical path highlighting with pulsing indicators
- Zoom, pan, and node selection
- Real-time signal value display (0/1/X/Z states)
- Interactive minimap for navigation

### ⚡ Simulation & Controls Panel
- Start/Stop/Pause/Resume simulation controls
- Single-step mode for detailed debugging
- Progress bar with timestep counter
- Clock frequency display
- Transformer model selection (Tiny/Small/Medium)
- Precision configuration (FP32/FP16/INT8/INT4)
- Sequence length and pipeline depth settings

### 📊 Signal Waveforms
- Time-based waveform view of key signals
- Input/output signal indicators
- Click-to-seek timeline navigation
- Auto-scroll to follow simulation progress
- Signal selection for context

### 📋 LUT Analysis Table
- Sortable table of all LUT nodes
- Per-LUT utilization bars
- Fan-in/fan-out information
- Critical path indicators
- Current signal values

### 💡 Optimization Suggestions
- AI-generated LUT optimization suggestions
- Before/after LUT count comparison
- Latency impact indicators
- Confidence scores
- One-click apply optimization

### 💬 Vibe Debugging Chat Panel
- Chat interface for Gemini 3 assistant
- Context-aware conversations (selected nodes, signals, timestep)
- Code snippet display with syntax highlighting
- Copy-to-clipboard functionality
- Quick prompt suggestions
- Streaming responses

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **ReactFlow** for circuit visualization
- **Framer Motion** for animations
- **Zustand** for state management
- **Lucide React** for icons

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
cd veridebug

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Project Structure

```
src/
├── api/
│   ├── client.ts      # Mock API client
│   └── mockData.ts    # Mock data generators
├── components/
│   ├── Chat/          # Chat panel components
│   ├── Circuit/       # Circuit visualization
│   ├── Layout/        # Main layout
│   └── Simulation/    # Simulation controls & waveforms
├── store/
│   └── index.ts       # Zustand state management
├── types/
│   └── index.ts       # TypeScript interfaces
├── App.tsx
├── App.css
└── index.css
```

## TypeScript Types

The app defines comprehensive TypeScript interfaces for:
- FPGA nodes and connections
- Simulation state and signals
- Transformer configurations
- Optimization suggestions
- Chat messages and context

## API Integration

The frontend is designed to connect to backend APIs for:
- FPGA control and simulation
- Gemini 3 + LangGraph orchestration
- HDL analysis and optimization

Currently uses mock API clients that simulate realistic responses.

## Design Philosophy

- **Clean, professional UI** - No purple gradients, neutral colors with blue/green accents
- **Flashy via motion** - Smooth animations and transitions, not loud colors
- **Information density** - Multiple panels with relevant data visible at once
- **Cross-panel interaction** - Selecting nodes/signals updates all panels
- **Developer-friendly** - Monospace fonts for code, clear visual hierarchy

## License

MIT
