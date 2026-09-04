# Hermes Agent

> **Research notes.** Background for the layer-by-layer mapping on
> [buildaharness.com/harness-comparison](https://buildaharness.com/harness-comparison),
> which is the canonical, maintained version — token-volume and star figures there
> are refreshed from OpenRouter and GitHub and take precedence over this file.

Hermes Agent is an open-source AI agent framework built by Nous Research, released under the MIT license in February 2026. By late June 2026 it had roughly 205,000 GitHub stars, and it overtook OpenClaw in mid-May 2026 as the top agent by daily token volume on OpenRouter (around 770 billion tokens/day vs. OpenClaw's 161 billion as of July 2026).

## Architecture Overview

The core of Hermes is the `AIAgent` class (`run_agent.py`), a synchronous orchestration engine that handles prompt assembly, provider/API mode selection, tool dispatch, retries, fallback, and persistence. It's platform-agnostic — the same `AIAgent` class serves the CLI, a messaging gateway, an ACP integration (VS Code/Zed/JetBrains), batch runs, and a Python API server, with platform differences living in the entry point rather than the agent itself.

Key subsystems:

- **Agent Loop** — the turn-by-turn conversation engine, detailed below.
- **Prompt System** — assembles the system prompt in ordered tiers (stable → context → volatile: identity/tools/skills, then context files, then memory/profile/timestamp), with Anthropic prompt caching and lossy context compression for long conversations.
- **Provider Resolution** — a shared resolver mapping `(provider, model)` to `(api_mode, api_key, base_url)`, supporting 18+ providers, OAuth, and credential pools.
- **Tool System** — a central registry of 70+ tools across ~28 toolsets, with terminal execution across 6 backends (local, Docker, SSH, Daytona, Modal, Singularity).
- **Session Persistence** — SQLite storage with FTS5 full-text search and session lineage tracking.
- **Messaging Gateway** — 20 platform adapters (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, email, SMS, DingTalk, Feishu, WeCom, WeChat, BlueBubbles, QQ, Home Assistant, webhook, and more), with user authorization, hooks, and cron ticking.
- **Cron** — first-class scheduled agent tasks (not shell cron), which can attach skills/scripts and deliver results to any platform.
- **Plugin System** — three discovery sources (user, project, pip entry points) for tools, hooks, memory providers, and context engines.

## The Agent Loop

Each turn of `run_conversation()` follows this sequence:

1. Generate a task ID (if not provided) and append the user message to history.
2. Build or reuse the cached system prompt.
3. Check whether preflight compression is needed (context over 50% full).
4. Build API messages from conversation history, formatted per API mode (`chat_completions`, `codex_responses`, or `anthropic_messages`).
5. Inject ephemeral prompt layers (budget warnings, context pressure).
6. Apply prompt caching markers if on Anthropic.
7. Make an interruptible API call.
8. Parse the response: if it contains tool calls, execute them (single calls run in the main thread; multiple calls run concurrently via a thread pool, except interactive tools like `clarify`, which force sequential execution), append the results, and loop back to step 4. If it's a plain text response, persist the session, flush memory, and return.

Supporting mechanics: an iteration budget (default 90 turns, with subagents getting their own capped budget via `delegate_task`), automatic fallback to configured backup providers on 429/5xx/401 errors, and compression that flushes memory to disk first, summarizes middle turns, and always keeps the last 20 messages and tool call/result pairs intact.

On its own, this loop is a fairly conventional ReAct-style tool-calling loop — structurally similar to what Claude Code, OpenClaw, and most other agent harnesses do (call model → get tool calls → execute → append results → repeat).

## What's Actually Different

The differentiation isn't in the loop — it's in what's built around it:

**Persistent cross-session memory.** Most harnesses treat each session as its own world. Hermes keeps a SQLite database with full-text search (FTS5) over every session ever run. Ask it to pick up a bug from last Friday in a new Monday session, and it can grep that transcript and pull the relevant turns back into context.

**Self-improving skills.** After a non-trivial task succeeds, the agent evaluates the outcome — did it succeed, was the approach non-obvious, did it involve recoveries or multiple steps — and if so, abstracts the reasoning into a named, reusable skill document. Skills get refined through continued use and retrieved for similar future tasks, so the agent accumulates its own playbook over time.

**Always-on, multi-platform reach.** With 20 messaging platform adapters and a first-class cron scheduler, Hermes is built to be a 24/7 assistant reachable from wherever you already message, rather than a tool tied to an IDE or terminal session.

**Provider-agnostic and cheap to run.** It supports 18+ providers and open-weight models, and people run it on VPS instances costing a few dollars a month. Combined with the MIT license, this removes vendor lock-in and per-seat pricing as adoption barriers.

One head-to-head comparison against Claude Code and OpenClaw across 18 real tasks found Hermes won the majority — attributed specifically to the memory feature, since it was the only one of the three that "remembered last Tuesday."

## Sources

- [Architecture | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Agent Loop Internals | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)
- [Nous Research's Hermes Agent Dethrones OpenClaw as the World's Most-Used Open-Source AI Agent — Tech Times](https://www.techtimes.com/articles/316694/20260515/nous-researchs-hermes-agent-dethrones-openclaw-worlds-most-used-open-source-ai-agent.htm)
- [OpenClaw vs. Hermes Agent: The race to build AI assistants that never forget — The New Stack](https://thenewstack.io/persistent-ai-agents-compared/)
- [I Tested Hermes Agent vs Claude Code vs OpenClaw on 18 Real Tasks — Towards AI](https://pub.towardsai.net/i-tested-hermes-agent-vs-claude-code-vs-openclaw-on-18-real-tasks-the-10-week-old-one-cheats-by-0f2881a10213?gi=994e218c433b)
- [Hermes Agent vs. Claude Code vs. OpenClaw — Which Self-Improving AI Agent Is Right for Your Workflow? — MindStudio](https://www.mindstudio.ai/blog/hermes-agent-vs-claude-code-vs-openclaw-which-self-improving-ai-agent-right-for-workflow)
