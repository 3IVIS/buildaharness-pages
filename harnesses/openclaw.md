# OpenClaw

> **Research notes.** Background for the layer-by-layer mapping on
> [buildaharness.com/harness-comparison](https://buildaharness.com/harness-comparison),
> which is the canonical, maintained version — figures there take precedence over this file.

OpenClaw (originally released as Clawdbot in November 2025, briefly renamed Moltbot, then OpenClaw) is a free and open-source autonomous AI agent built by Austrian developer Peter Steinberger, distributed under the MIT license. It runs locally and connects to an external LLM (Claude, GPT, DeepSeek, or a local model), with messaging apps as its primary interface. As of March 2026 the project had roughly 247,000 GitHub stars and 47,700 forks, with an estimated half a million installs worldwide. On February 14, 2026, Steinberger announced he was joining OpenAI, with future stewardship of OpenClaw moving to a non-profit foundation.

## The Agent Loop

An OpenClaw run — a single serialized "turn" per session — follows this sequence:

1. **Intake.** A Gateway RPC (`agent`) or CLI command validates params, resolves the session, persists session metadata, and returns `{ runId, acceptedAt }` immediately.
2. **Queue & resolve.** `runEmbeddedAgent` serializes the run through per-session and global queues (to avoid tool/session races), resolves the model and auth profile, and builds the OpenClaw session.
3. **Session & workspace prep.** The workspace is resolved (or a sandboxed copy for non-main sessions), skills are loaded from the workspace/personal/managed/bundled skill directories, bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`) are injected into context, and a session write lock is acquired before the transcript is touched.
4. **Prompt assembly.** The system prompt is built from OpenClaw's base prompt, the skills prompt, bootstrap context, and per-run overrides, with model-specific token limits and compaction reserve enforced.
5. **Model inference ⇄ tool execution (the loop proper).** The model streams assistant text and tool-call deltas; tool calls are executed and their results fed back to the model; this repeats until the model stops calling tools and produces a final response. Every step streams live as `assistant`, `tool`, and `lifecycle` events.
6. **Reply shaping.** The final payload is assembled from assistant text, optional reasoning, and inline tool summaries; the silent `NO_REPLY` token is filtered out; duplicate messaging-tool confirmations are removed.
7. **Persist & emit.** The transcript is written to JSONL under the session write lock; auto-compaction can trigger a retry; a `lifecycle: end` event resolves `agent.wait` and closes out the channel reply.

On its own, this is a conventional ReAct-style tool-calling loop — structurally the same "call model → get tool calls → execute → append results → repeat" pattern used by Claude Code, Hermes, and most other agent harnesses. The loop mechanics are not OpenClaw's differentiator.

## What's Actually Different

The differentiation is in what's built around the loop, not the loop itself:

**Messaging apps as the interface.** Instead of a terminal or IDE, the agent lives inside WhatsApp, Telegram, Discord, Signal, iMessage, Slack, or Microsoft Teams — for most users, "running an agent" means texting a bot.

**A device/companion-app ecosystem.** Native macOS, iOS, and Android "node" apps expose real device capabilities (camera, screen recording, location) as callable tools, plus an agent-editable canvas (A2UI) and voice/talk mode (ElevenLabs, voice wake, push-to-talk) — closer to an embodied personal assistant than a sandboxed process.

**A persona/identity layer.** Bootstrap files (`SOUL.md`, `IDENTITY.md`, `AGENTS.md`) give each installation a distinct, persistent "character" that users name and grow attached to — a major driver of the project's cultural traction (in China, installing it is called "raising a lobster").

**Open, self-hosted, provider-agnostic.** Works with Claude, GPT, DeepSeek, or local models, and can piggyback on an existing Claude Pro or ChatGPT subscription via OAuth instead of requiring separate API billing.

**A large skills marketplace (ClawHub)** for extending capability without touching code.

By comparison, a rival harness ("Hermes") is often described as the "brain" to OpenClaw's "body": Hermes has a genuine self-improving skill/learning loop and pluggable memory backends, while OpenClaw's skills are static, authored files with no self-improvement — its edge is presence (voice, canvas, desktop/mobile control) rather than cognition.

**Popularity was mostly timing and narrative, not technology.** Steinberger built in public as a well-known indie developer; a viral case study (a 60-year-old brewer running an automated brewing business off a WhatsApp bot) and meme-friendly lobster branding drove attention; an AI-only social network (Moltbook) built around OpenClaw agents generated significant press; and Chinese tech firms (Tencent, Z.ai) built OpenClaw-based services and adapted it for domestic models and messaging super-apps.

**The same popularity outpaced its security posture.** OpenClaw requires broad permissions (email, calendar, messaging, files) to be useful, which drew scrutiny from security researchers; it has a known RCE CVE (CVSS 8.8), a marketplace incident involving over a thousand malicious third-party skills, and is susceptible to prompt injection. In March 2026, Chinese regulators restricted state agencies, state-owned enterprises, and banks from running it, citing security risk and energy usage, even as local tech hubs subsidized its adoption.

## Sources

- [Agent loop | OpenClaw docs](https://docs.openclaw.ai/concepts/agent-loop)
- [Agent runtime | OpenClaw docs](https://docs.openclaw.ai/concepts/agent)
- [Agent Harness Plugins | OpenClaw docs](https://docs.openclaw.ai/plugins/sdk-agent-harness)
- [Gateway architecture | OpenClaw docs](https://docs.openclaw.ai/concepts/architecture)
- [OpenClaw — Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [Hermes vs OpenClaw — The Two Leading Open Agent Harnesses Compared — The Real Cat Labs](https://therealcat.ai/hermes-vs-openclaw-the-two-leading-open-agent-harnesses-compared/)
- [Everything you need to know about viral personal AI assistant Clawdbot (now Moltbot) — TechCrunch](https://techcrunch.com/2026/01/27/everything-you-need-to-know-about-viral-personal-ai-assistant-clawdbot-now-moltbot/)
- [From Clawdbot to Moltbot to OpenClaw: Meet the AI agent generating buzz and fear globally — CNBC](https://www.cnbc.com/2026/02/02/openclaw-open-source-ai-agent-rise-controversy-clawdbot-moltbot-moltbook.html)
- [Lobster buffet: China's tech firms feast on OpenClaw — CNBC](https://www.cnbc.com/2026/03/12/china-openclaw-ai-agent-adoption-tech-companies-government-support-lobster-shrimp.html)
- [OpenClaw creator Peter Steinberger joins OpenAI — TechCrunch](https://techcrunch.com/2026/02/15/openclaw-creator-peter-steinberger-joins-openai/)
