-- FlareOps D1 Schema
-- Two tables: incidents (triage records) and messages (conversation history)

CREATE TABLE IF NOT EXISTS incidents (
    id          TEXT PRIMARY KEY,
    severity    TEXT NOT NULL DEFAULT 'P3',      -- P0, P1, P2, P3, P4
    category    TEXT NOT NULL DEFAULT 'unknown',  -- connection_pool, memory_leak, deployment, dns, etc.
    summary     TEXT NOT NULL,
    root_cause  TEXT,
    resolution  TEXT,                             -- what actually fixed it (filled later)
    status      TEXT NOT NULL DEFAULT 'open',     -- open, investigating, resolved
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id),
    role        TEXT NOT NULL,                    -- 'user' or 'assistant'
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_incident ON messages(incident_id);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
