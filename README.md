# FlareOps — AI-Powered Incident Triage Assistant

An on-call engineer's AI assistant built entirely on Cloudflare's platform. Paste error logs or describe an incident → get instant triage with severity classification, root cause analysis, and actionable steps. Continue the conversation for refined diagnosis. Every incident is stored for future pattern matching.

## Architecture

```
┌──────────┐    ┌───────────────┐    ┌────────────┐
│  Pages   │───▶│  Worker (API) │───▶│ Workers AI │
│ (React)  │◀───│               │◀───│ Llama 3.3  │
└──────────┘    └──────┬────────┘    └────────────┘
                       │
                  ┌────┴─────┐
                  │          │
            ┌─────▼──┐  ┌───▼───┐
            │Durable  │  │  D1   │
            │Objects  │  │(SQLite)│
            │(session)│  │       │
            └─────────┘  └───────┘
```

### Component Roles

| Component | Role |
|-----------|------|
| **Cloudflare Pages** | Hosts the React chat interface |
| **Cloudflare Worker** | API layer — routes requests, orchestrates triage pipeline |
| **Workers AI (Llama 3.3)** | Analyzes logs, classifies severity, suggests remediation |
| **Durable Objects** | Per-incident live conversation state (survives restarts) |
| **D1 (SQLite)** | Persistent incident history + message log for pattern matching |

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Wrangler CLI: `npm install -g wrangler`

### Steps

```bash
# 1. Clone and install
git clone <repo-url> && cd flareops
npm install
cd frontend && npm install && cd ..

# 2. Login to Cloudflare
wrangler login

# 3. Create the D1 database
wrangler d1 create flareops-db
# Copy the database_id from the output into wrangler.toml

# 4. Initialize the database schema
npm run db:init          # local dev
npm run db:init:remote   # remote (production)

# 5. Run locally
wrangler dev             # backend on http://localhost:8787
cd frontend && npm run dev  # frontend on http://localhost:3000
```

**No external API keys needed.** Workers AI (Llama 3.3) is built into Cloudflare — free tier covers 10,000 neurons/day.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/triage` | New incident — analyze logs, return structured triage |
| `POST` | `/api/chat/:id` | Follow-up message within an incident |
| `POST` | `/api/resolve/:id` | Mark incident as resolved |
| `GET` | `/api/incidents` | List past incidents |
| `GET` | `/api/incidents/:id` | Get incident with full message history |
| `GET` | `/api/health` | Health check + model info |

## LLM Prompts

Prompts are stored as separate files in `src/prompts/`:

- **`triage.ts`** — Initial incident analysis. Classifies severity (P0–P4), identifies root cause, suggests ordered steps (highest-impact first), and asks clarifying questions. Includes strict rules: be specific ("PostgreSQL connection pool exhaustion" not "database issue"), never invent details, always check for recent deployments.

- **`followup.ts`** — Ongoing conversation. Incorporates new context from the engineer, updates severity/root cause if warranted, and detects when the incident is resolved.

## Decisions

### What I prioritised

1. **Structured triage output** — Severity, category, root cause, ordered steps. Not prose. On-call engineers need scannable information under pressure.
2. **Conversation memory** — Durable Objects hold the live session so follow-up context is never lost. D1 stores history so future incidents benefit from past resolutions.
3. **Pattern matching** — When a new incident arrives, the system searches D1 for resolved incidents with the same category and includes them as context in the LLM prompt. The more incidents it handles, the better it gets.
4. **All-Cloudflare stack** — Workers AI (no API key needed), D1 (no database server), Durable Objects (no Redis). Zero external dependencies.

### What I cut

- **Webhook ingestion** — In production, monitoring tools (Datadog, PagerDuty) would push alerts via webhook. For this assignment, manual input via chat.
- **Auto-remediation** — The production vision includes triggering rollbacks and creating PRs. For this assignment, the AI suggests steps and the engineer acts.
- **Multi-user/auth** — No login system. Single-user demo. In production, integrate with Cloudflare Access.
- **Runbook knowledge base** — In production, KV would store team-specific runbooks. For this demo, the LLM uses its general infrastructure knowledge.

### Production vision

```
Monitoring (Datadog/PagerDuty) → Webhook → FlareOps Worker → AI Triage
    → Slack notification to on-call
    → Engineer reviews in dashboard
    → Approves fix → CI/CD deploys
    → Resolution stored → Future incidents benefit
```

## Repository Layout

```
flareops/
├── src/
│   ├── index.ts                 # Worker entry — API router
│   ├── triage.ts                # Workers AI integration + triage logic
│   ├── types.ts                 # TypeScript interfaces + Env bindings
│   ├── prompts/
│   │   ├── triage.ts            # System prompt: initial triage
│   │   ├── followup.ts          # System prompt: conversation follow-up
│   │   └── index.ts             # Barrel export
│   ├── db/
│   │   ├── queries.ts           # D1 database operations
│   │   └── index.ts             # Barrel export
│   └── durable-objects/
│       └── incident-session.ts  # Per-incident conversation state
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main chat interface
│   │   ├── api.ts               # API client
│   │   ├── components/
│   │   │   ├── TriageCard.tsx    # Structured triage display
│   │   │   ├── ChatMessage.tsx   # Chat bubble
│   │   │   └── HistoryPanel.tsx  # Past incidents sidebar
│   │   ├── index.css            # Styles
│   │   └── main.tsx             # React entry
│   └── index.html
├── sql/
│   └── schema.sql               # D1 database schema
├── wrangler.toml                 # Cloudflare config
└── README.md
```

## Prompt History

AI-assisted coding was used throughout development. The prompt history is available in the repository as required.
