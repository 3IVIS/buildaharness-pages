# Kilo Code

Kilo Code is an open source, end-to-end AI coding agent, forked from Roo Code (itself a fork of Cline) and launched in March 2025. It works across VS Code, JetBrains, a standalone CLI, a cloud agent, and mobile apps, and routes to 500+ models across 60+ providers through its own model gateway. By mid-2026 it reported 1.5M+ users, 3M+ "Kilo Coders," 40T+ tokens processed, and an $8M seed round.

## Architecture Overview

- **Agents (modes)** — code (default, full tool access), ask (read-only), plan (read-only plus plan-file editing), and debug (full access, methodical troubleshooting). Orchestrator mode is deprecated; subagent delegation is now built into the other agents directly.
- **Context management** — an automatic context scan pulls in only files relevant to the task, `@`-mentions let the user point at specific files/functions, and a Memory Bank (`context.md`, `brief.md`, `history.md` under `.kilocode/rules/memory-bank`) is read at the start of every task to restore project-level memory across sessions.
- **Model gateway** — 500+ models across 60+ providers, zero markup on top of provider rates (BYOK or Kilo credits), with $20 free credits on signup and an optional Kilo Pass subscription.
- **Tool system** — read/edit/bash/webfetch/MCP tools, plus task delegation to isolated subagents for codebase exploration or autonomous subtasks.
- **Checkpoints** — every agent turn that edits files creates an automatic, git-based snapshot with a one-click revert to the state before that turn.
- **Context condensing** — conversation history is automatically summarized as it approaches the model's context window limit.
- **Tool-call parsing** — supports both XML-tag tool calls and native function-calling, with a translation/fallback layer between them. This matters because raw XML tool-call parsing fails on the order of 10% of the time even on top-tier models, and Roo Code's own issue tracker cites over 15% failure rates for the `apply_diff` file-edit tool specifically — a problem that's worse the more models (including weak or local ones) the harness has to support.

## The Agent Loop

Each turn follows a standard sequence:

1. User gives a task and selects an agent (code/ask/plan/debug), which fixes the available tools and system instructions.
2. Kilo assembles context: the agent's system prompt, relevant files found automatically, any `@`-mentions, and Memory Bank notes.
3. The assembled prompt and tool list are sent to whichever model is configured, via the Kilo Gateway.
4. The model replies with reasoning plus typically one tool call (read, edit, run a command, or delegate to a subagent).
5. State-changing actions (file edits, shell commands) pause for user approval unless auto-approve is enabled for that action type.
6. The approved action executes; its result (diff, command output, error) is captured.
7. If the model signals completion and nothing looks broken, the result is presented for review. Otherwise the new observation is appended to context and the loop returns to step 3.

On its own, this is a conventional ReAct-style tool-calling loop — structurally the same shape used by Cline, Roo Code, Claude Code, Cursor, and most other agent harnesses.

## What's Actually Different

The differentiation isn't in the loop shape — it's in the plumbing around it, and in the business model:

**Reliability plumbing for model heterogeneity.** Because Kilo has to work across 500+ models of wildly different tool-calling quality (not just one well-behaved frontier model), it carries real engineering to keep the loop from silently breaking: XML/native tool-call translation, diff-repair for malformed edits, checkpoints for one-click rollback, and context condensing tuned per model's window size. A harness locked to a single vendor's API can lean on that vendor's tuning and skip most of this.

**Zero-markup, model-agnostic pricing.** BYOK or pay the exact provider rate through the gateway, with the ability to switch models mid-task — versus competitors that bundle a markup into their own subscription and restrict model choice.

**Inherited, battle-tested codebase.** As a fork of Roo Code (itself a fork of Cline), Kilo started from a mature agent implementation rather than building one from scratch, which let it ship features and reach multiple platforms unusually fast ("Kilo speed").

**Multi-platform reach.** VS Code, JetBrains, CLI, cloud agent, and mobile, versus most competitors concentrating on one or two surfaces.

**Kilo's own additions on top of the inherited base** are comparatively thin: inline autocomplete (not present in Cline or Roo Code), polish on orchestrator/subagent delegation, and an active, fast-shipping open source community (Discord/Reddit-driven fixes, public dogfooding, stunts like a stealth model collaboration with Mistral).

Net: the popularity is driven more by pricing, openness, platform breadth, and shipping velocity than by any novel agent-loop architecture — the loop itself is commodity, shared across the whole Cline/Roo/Kilo lineage and beyond.

## Sources

- [Using Agents | Kilo Code Docs](https://kilo.ai/docs/code-with-ai/agents/using-agents)
- [Orchestrator Mode (Deprecated) | Kilo Code Docs](https://kilo.ai/docs/code-with-ai/agents/orchestrator-mode)
- [Checkpoints | Kilo Code Docs](https://kilo.ai/docs/features/checkpoints)
- [Inside Kilo Code: An open source AI coding agent — Tessl](https://tessl.io/blog/inside-kilo-code-an-open-source-ai-coding-agent-with-plans-to-reshape-software-development/)
- [Roo Code vs Cline vs Kilo Code — Kilo](https://kilo.ai/compare/roo-vs-cline-vs-kilo)
- [Kilo Code vs Cline vs Roo Code: Which AI Coding Assistant Wins in 2026?](https://adam.holter.com/kilo-code-the-hybrid-ai-coding-assistant-that-combines-cline-and-roo-code-for-cost-effective-development/)
- [Kilo Code Reviews 2026: Real Developer Feedback Summarized](https://kilo.ai/articles/kilo-code-reviews)
- [Kilo Code Review 2026 — vibecoding.app](https://vibecoding.app/blog/kilo-code-review)
- [Context Engineering Explained: How Kilo Code Manages Context — Jason Yang](https://medium.com/@jasonyang.algo/context-engineering-explained-how-kilo-code-manages-context-a3126d97d44f)
- [RFC: Native Tool Use for Top-Tier AI Models — Roo-Code #4047](https://github.com/RooCodeInc/Roo-Code/issues/4047)
- [bug: fast-xml-parser decodes HTML entities, causing diff mismatches — Roo-Code #7107](https://github.com/RooCodeInc/Roo-Code/issues/7107)
