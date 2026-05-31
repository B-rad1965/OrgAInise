# OrgAInise

An all-purpose AI project context manager. Turns messy session notes into clean, approved project memory and reusable context blocks you can paste into any AI chat.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/orgainise run dev` — run the frontend (port 25292)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `OPENAI_API_KEY` — OpenAI API key for AI features

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, framer-motion, wouter
- API: Express 5 (proxies OpenAI calls)
- Data: localStorage (V1 — no database)
- AI: OpenAI gpt-4o via server-side proxy
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `artifacts/orgainise/src/lib/storage.ts` — localStorage data layer
- `artifacts/orgainise/src/pages/` — all page components
- `artifacts/api-server/src/routes/ai.ts` — OpenAI proxy routes

## Architecture decisions

- All project data (projects, memory items, session history) lives in localStorage — no DB for V1.
- OpenAI calls go through the Express backend to keep the API key server-side.
- Only 2 backend endpoints: `POST /api/ai/analyze-session` and `POST /api/ai/generate-context`.
- Session history is capped at 10 entries per project to avoid unbounded localStorage growth.
- `gpt-4o` with `response_format: json_object` for session analysis (predictable parsing).

## Product

- Dashboard: list saved projects with stats
- Create Project: 2-step form with type selection + category editor
- Project view with 4 tabs: Memory | Update Session | Context Block | History
- Memory tab: items grouped by category, editable with importance levels
- Update Session: paste notes → AI suggests updates → user approves/rejects each
- Context Block: generate short/medium/full refresher for pasting into any AI

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Fonts `@import url(...)` must be the VERY FIRST line of `index.css` — PostCSS fails silently if it comes after `@import "tailwindcss"`.
- After each OpenAPI spec change, run codegen before using updated types.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
