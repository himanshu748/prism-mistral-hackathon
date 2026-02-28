# 🔮 Prism — Multi-Agent Decision Intelligence

> **Mistral Worldwide Hackathon 2026** | Built with Mistral AI Agents

Prism is a Multi-Agent Decision Intelligence platform that analyzes complex questions from every angle. 4 specialized AI agents collaborate in real-time with **function calling**, **live debate**, and **confidence scoring** to deliver actionable insights.

---

## 🎯 What It Does

Enter any question and watch AI agents analyze it in real-time:

1. **🔍 Researcher** — Uses Mistral's **Function Calling API** to invoke tools (`search_knowledge_base`, `get_expert_opinion`, `analyze_trends`), gathering facts and data before writing analysis
2. **⚖️ Advocate** — Builds the strongest case FOR the proposition
3. **🛡️ Critic** — Finds weaknesses, risks, and counter-arguments
4. **⚔️ Debate Round** — Advocate and Critic rebut each other's arguments
5. **🧠 Synthesizer** — Weighs all perspectives and delivers a verdict with **confidence score**

All of this happens with **real-time SSE streaming**, an **interactive D3.js argument graph**, and an **animated confidence gauge**.

---

## ✨ Key Features

| Feature | Details |
|---|---|
| 🛠️ **Function Calling** | Researcher uses Mistral Tools API with 3 custom functions |
| ⚔️ **Agent Debate** | Advocate vs Critic rebuttals in Round 2 |
| 📊 **Confidence Gauge** | Animated radial SVG with gradient and counter |
| 🌊 **Real-time Streaming** | Server-Sent Events with 6 event types |
| 🕸️ **Argument Graph** | Interactive D3.js force-directed visualization |
| 🎨 **Premium UI** | Glassmorphism, particle effects, animated gradients |
| ⚙️ **API Key Management** | Settings modal with validation |
| 🔄 **Parallel Execution** | Advocate and Critic run simultaneously |
| 📝 **Markdown Rendering** | Rich formatted agent responses |

---

## 🏗️ Architecture

```
User Question
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                  Express Server (SSE)                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Phase 1: Researcher + Function Calling             │
│    ├── search_knowledge_base()                      │
│    ├── get_expert_opinion()                         │
│    └── analyze_trends()                             │
│                                                     │
│  Phase 2: Advocate ║ Critic (parallel)              │
│                                                     │
│  Phase 3: Debate Arena (rebuttals)                  │
│    ├── Advocate rebuts Critic                       │
│    └── Critic rebuts Advocate                       │
│                                                     │
│  Phase 4: Argument Graph (JSON generation)          │
│                                                     │
│  Phase 5: Synthesizer (final verdict + confidence)  │
│                                                     │
└─────────────────────────────────────────────────────┘
      │
      ▼
  Frontend (SSE → streaming UI)
  D3.js Graph + Confidence Gauge
```

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/prism-mistral-hackathon.git
cd prism-mistral-hackathon

# Install
npm install

# Run
MISTRAL_API_KEY=your_key_here node server.js

# Open http://localhost:3000
```

Or configure the API key through the ⚙️ Settings modal in the UI.

---

## 🧰 Tech Stack

- **Backend**: Node.js, Express, Server-Sent Events (SSE)
- **Frontend**: Vanilla JS, HTML5, CSS3
- **AI**: Mistral AI API (Chat Completions, Streaming, Function Calling, JSON Mode)
- **Visualization**: D3.js (force-directed graph), SVG (confidence gauge)
- **Rendering**: Marked.js (markdown)

---

## 📁 Project Structure

```
prism/
├── server.js          # Express server, agent orchestration, tools API
├── package.json       # Dependencies
└── public/
    ├── index.html     # UI structure (hero, agents, debate, graph)
    ├── style.css      # Dark-mode glassmorphism design
    └── app.js         # SSE handling, animations, D3.js graph
```

---

## 🏆 Mistral AI Features Used

1. **Chat Completions API** — All 4 agents use streaming chat completions
2. **Function Calling (Tools API)** — Researcher invokes tools to gather data
3. **Streaming** — Real-time token-by-token streaming via SSE
4. **JSON Mode** — Structured graph data generation
5. **Multi-Agent Orchestration** — Sequential + parallel agent coordination

---

## 📜 License

MIT — Built with ❤️ for the Mistral Worldwide Hackathon 2026
