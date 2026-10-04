# Prompt History

AI-assisted coding (Cursor IDE + Claude) was used during development. Below are the key prompts used throughout the build.

---

## Architecture & Setup

- "Cloudflare Workers AI — does ai.run() for llama-3.3-70b return { response: string } or openai-compatible { choices: [{ message: { content } }] }? docs aren't clear"
- "for per-incident conversation state with frequent reads/writes, should i use Durable Objects or KV? sessions last minutes to hours"
- "whats the d1 schema best practice for an incident + messages setup? two tables enough or should i normalize further"
- "do i need to add indexes on d1 tables or does it auto-index primary keys only"
- "how to configure wrangler.toml to bind Workers AI, D1, and Durable Objects together"

## Backend Development

- "scaffold a cloudflare worker with typescript, need routes for POST /api/triage, POST /api/chat/:id, GET /api/incidents"
- "write d1 query functions — createIncident, getIncident, listIncidents, saveMessage, getMessages. prepared statements with .bind()"
- "durable object for incident session — need init, addMessage, updateState, getState methods"
- "how to search past resolved incidents by category in d1 and pass them as context to the llm prompt"
- "cors headers needed for worker on 8787 accepting requests from vite dev server on 3000"

## Prompt Engineering

- "writing a system prompt for incident triage. model keeps classifying everything as P2/P3. how to make it use full P0-P4 range"
- "should i include example severities in the prompt or just definitions? model is being too conservative"
- "for the followup prompt — how to structure conversation history so the model knows whats the latest message vs old context"
- "model sometimes wraps json in markdown fences even when told not to. need a defensive json parser"

## Debugging

- "getting error: text.trim is not a function at parseJsonLoose. stack trace: [pasted trace]. workers ai response seems to not be a string"
- "logged the raw response — its { choices: [{ message: { content: '...' } }] } not { response: '...' }. need to update callAI to handle openai format"
- "D1_TYPE_ERROR: Type undefined not supported for value undefined — happening in createIncident bind(). some triage fields are missing from llm response"
- "import error: could not resolve '../prompts' from src/triage.ts — are relative imports different in workers?"
- "wrangler login expired after 4 days, getting InferenceUpstreamError authentication error on ai.run()"

## Frontend

- "scaffold react chat ui with vite + typescript. dark theme, message bubbles, text input with enter-to-send, loading dots"
- "need a triage card component showing severity badge (color coded P0-P4), summary, root cause, steps as ordered list, affected systems as tags"
- "history panel as a sidebar — list past incidents with severity badge and open/resolved status"
- "vite proxy config to forward /api requests to wrangler dev on 8787"

## Testing

- "give me realistic error logs to test incident triage — need cases for connection pool, memory leak, ssl cert, dns"
- "what edge cases should i test — vague input, non-infra requests, follow-up memory, resolution detection"
