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

## Observatory indexes

Six live indexes of open-source projects, each fed by a hand-curated list and refreshed daily from the GitHub API:

| Page | Curated list | Data file | Workflow |
|---|---|---|---|
| `ai_agent_frameworks.html` | `repos.txt` | `data.json` | `fetch-stats.yml` |
| `ai_agents.html` | `agents-repos.txt` | `agents-data.json` | `fetch-stats.yml` |
| `agent_harnesses.html` | `harness-repos.txt` (first tag = role) | `harness-data.json` | `fetch-stats.yml` |
| `mcp_servers.html` | `mcp-repos.txt` | `mcp-data.json` | `fetch-stats.yml` |
| `agent_skills.html` | `skills-repos.txt` | `skills-data.json` | `fetch-stats.yml` |
| `ai_agent_memory_frameworks.html` | `memory-repos.txt` (extra classification columns) | `memory-data.json` | `fetch-memory-stats.yml` |

- **Adding or removing an entry** means editing the list (`owner/repo tag1,tag2`). The workflow re-runs on push and rewrites the data file.
- **Fetch logic** lives in `scripts/fetch-stats.mjs`. Run it locally with `GITHUB_TOKEN=$(gh auth token) node scripts/fetch-stats.mjs <list> <out> [array-key]`.
- **Review policy:** every slug should resolve to its current name and be unarchived. Remove archived repos, 404s, anything without a push for roughly 300 days, and anything that is not what the page is about. The fetch summary prints renamed slugs so the lists can be updated.
- **Shared code:** every index page is editorial HTML plus a few lines of config. The table, filters, hero stats, sorting, search, shareable URLs and nav menu live in `assets/observatory.js`; the styles in `assets/observatory.css`. To add a column, filter or stat, add it to the registries at the top of the engine and list it in the page's `Observatory.init({...})` call. Bump the `?v=` on the asset links when you change them.
- **Shareable views:** filter state is kept in the URL, for example `ai_agent_frameworks.html?topic=harness&sort=updated:desc` (params: `q`, `topic`, `lang`, `role`, `layer`, `maturity`, `kind`, `sort=col:dir`).
- **Scope:** frameworks are what you *build* agents with; agents are what you *run*; MCP servers, skills libraries and memory frameworks are the pieces around them.
- Repo names, descriptions and topics are third-party text: the pages escape them before rendering. Keep it that way if you touch the row templates.

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
