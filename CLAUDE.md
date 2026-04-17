# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Next.js dev server
npm run build          # Production build (Next.js 16 + Turbopack)
npm run lint           # ESLint
npm test               # Vitest: run all tests once
npm run test:watch     # Vitest watch mode
npm run setup:linear   # Idempotent Linear workspace bootstrap (workflow states, estimation, views)
```

Run a single test file: `npx vitest run src/lib/linear/retry.test.ts`

Deploy is **manual** — no GitHub → Vercel auto-deploy: `vercel deploy --prod`.

## Architecture

**Three-party integration** running as Vercel Functions under Next.js 16 App Router:

```
Slack → /api/slack/events → after(routeEvent) → Linear API
                               │
                               └──> Anthropic API (tool_use structured output)
```

- `src/app/api/slack/events` handles Slack events — responds `200 OK` in <3s, then processes via `after()` in the background (fire-and-forget without `after()` silently drops on Vercel).
- `src/app/api/cron/daily-scrum` + `cron/summary` fire on Vercel Cron schedule (`vercel.json`).
- `src/lib/ai` wraps Anthropic SDK. Two models: `AI_MODEL_FAST` (Haiku) for chat/summary, `AI_MODEL_SMART` (Sonnet) for issue extraction. `chatStructured<T>()` uses Anthropic `tool_use` to force valid JSON — prefer this over `chat()` + JSON parsing.
- `src/lib/linear` wraps `@linear/sdk`. All writes go through `withRetry()` (`retry.ts`) which handles rate limits, timeouts, 5xx with exponential backoff.
- `src/lib/slack` is the Slack surface. `events.ts:handleDMMessage` is the main interview loop.
- `src/prompts/*.md` are the AI system prompts — read by `ai/*.ts` at runtime via `fs.readFileSync`. Editing a prompt changes behavior without redeploy *if* Vercel cache misses, but you should redeploy to be safe.

**Conversation state** lives in a module-level `Map` in `src/lib/conversation/store.ts`. This is per-instance memory; Vercel Fluid Compute reuses instances during a user's active session but there is no cross-instance persistence. The code is written so interview sessions complete within one warm instance — avoid reintroducing interactive flows that require cross-invocation state (that was the old `askProjectSelection`/`checkDuplicateAndAsk` failure mode).

**Two Linear teams** in the target workspace: `PROJ` (프로젝트팀, client work) and `PRD` (프로덕트팀, internal product). The issue extractor prompt chooses between them based on content; team-level setup (states, estimation, views) runs against both via `scripts/setup-linear.ts`.

## Project-specific gotchas

- **`printf`, not `echo`**, when adding Vercel env vars (`echo` appends a newline which corrupts API keys / model IDs / tokens):
  ```bash
  printf "value" | vercel env add VAR_NAME production --yes
  ```
- **Anthropic model IDs must be exact** — no `-latest` suffix. Verify with `curl https://api.anthropic.com/v1/models -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01"` before using an unfamiliar ID.
- **Slack `url_verification` must skip signature check** (`src/app/api/slack/events/route.ts`) — Slack sends verification without a valid signature.
- **Bot-echo prevention**: the handler filters on `event.subtype === "bot_message" || event.bot_id || event.app_id`. Do not hardcode the bot user ID.
- **Label scope rule** (Linear): when attaching labels to an issue, only labels belonging to the issue's team OR workspace-level labels (team=null) are valid. `ensureLabels` enforces this; changing that logic breaks issue creation across teams.
- **Next.js 16 is not the Next.js from your training data** — see `AGENTS.md`. When in doubt, read `node_modules/next/dist/docs/` instead of guessing APIs.
- **Test isolation from build**: `tsconfig.json` excludes `**/*.test.ts` so Next.js doesn't try to bundle them. Keep this exclusion if adding more test patterns.

## Testing posture

Vitest, Node environment. Linear SDK clients are mocked with `vi.mock("./client", ...)` — see `src/lib/linear/labels.test.ts` for the pattern when testing any code that calls `getLinearClient()`. Pure utility functions (sanitize, retry) are tested directly.
