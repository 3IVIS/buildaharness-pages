# Build A Harness

Developer-facing static site for **Build A Harness** — the open-source visual canvas and
runtime for AI agent harnesses (11 layers, FlowSpec, four framework adapters), plus the
architecture, comparison, evaluation and observatory pages. Apache 2.0.

**Live site:** https://buildaharness.com
**Product repository:** https://github.com/3IVIS/buildaharness

> **Looking for Aielia?** The user-facing assistant site (home, how it works, and the hosted
> `/try` browser build) lives in its own repo and is served at https://myaielia.com.
> `/personal-assistant` and `/try` here are redirect stubs to it.

## What the product ships today

- **Aielia**, the reference assistant — `npx @buildaharness/personal-assistant`, or the
  hosted browser build at https://myaielia.com/try (see the note above)
- Visual canvas with 27 node types (14 execution + 13 harness)
- FlowSpec v1.0.0 — open, portable JSON format
- 4 framework adapters: LangGraph, CrewAI, Mastra, Microsoft Agent Framework
- Langfuse observability across all 4 runtimes
- HITL pause/resume, REST/MCP/A2A deployment
- 12 services, single `docker compose up`

## Supported runtimes

- LangGraph (Python / JS)
- CrewAI (Python)
- Mastra (TypeScript)
- Microsoft Agent Framework (C# / Python / Java)
- A2A protocol for framework-agnostic invocation

## License

Apache 2.0

## Local preview

This repo is a static site. Open `index.html` in a browser or serve the root with any static server.

```sh
# Python 3
python3 -m http.server 8080
# or Node
npx serve .
```

## Contributing

See the **Get Involved** section on the site, or open a GitHub Discussion at https://github.com/3IVIS/buildaharness/discussions.
