/**
 * Cloudflare Worker environment bindings.
 * These are configured in wrangler.toml and injected at runtime.
 */

export interface Env {
  AI: Ai;
  DB: D1Database;
  INCIDENT_SESSION: DurableObjectNamespace;
  ENVIRONMENT: string;
}

/** Initial triage result from the LLM. */
export interface TriageResult {
  severity: "P0" | "P1" | "P2" | "P3" | "P4";
  category: string;
  summary: string;
  root_cause: string;
  suggested_steps: string[];
  questions: string[];
  affected_systems: string[];
}

/** Follow-up response from the LLM. */
export interface FollowupResult {
  updated_severity: string | null;
  updated_root_cause: string | null;
  response: string;
  additional_steps: string[];
  resolved: boolean;
}

/** Incident record stored in D1. */
export interface Incident {
  id: string;
  severity: string;
  category: string;
  summary: string;
  root_cause: string | null;
  resolution: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

/** Chat message stored in D1 and Durable Objects. */
export interface Message {
  id: string;
  incident_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
