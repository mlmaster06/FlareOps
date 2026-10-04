/**
 * D1 database queries for incidents and messages.
 *
 * All persistence goes through these functions. The rest of the app
 * never writes raw SQL — swap D1 for Postgres and only this file changes.
 */

import type { Incident, Message } from "../types";

export async function createIncident(
  db: D1Database,
  incident: {
    id: string;
    severity: string;
    category: string;
    summary: string;
    root_cause: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO incidents (id, severity, category, summary, root_cause)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      incident.id,
      incident.severity ?? "P3",
      incident.category ?? "unknown",
      incident.summary ?? "No summary provided",
      incident.root_cause ?? null
    )
    .run();
}

export async function updateIncident(
  db: D1Database,
  id: string,
  updates: {
    severity?: string;
    root_cause?: string;
    resolution?: string;
    status?: string;
    resolved_at?: string;
  }
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.severity) {
    fields.push("severity = ?");
    values.push(updates.severity);
  }
  if (updates.root_cause) {
    fields.push("root_cause = ?");
    values.push(updates.root_cause);
  }
  if (updates.resolution) {
    fields.push("resolution = ?");
    values.push(updates.resolution);
  }
  if (updates.status) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.resolved_at) {
    fields.push("resolved_at = ?");
    values.push(updates.resolved_at);
  }

  if (fields.length === 0) return;

  values.push(id);
  await db
    .prepare(`UPDATE incidents SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function getIncident(
  db: D1Database,
  id: string
): Promise<Incident | null> {
  const row = await db
    .prepare("SELECT * FROM incidents WHERE id = ?")
    .bind(id)
    .first<Incident>();
  return row ?? null;
}

export async function listIncidents(
  db: D1Database,
  limit = 20
): Promise<Incident[]> {
  const { results } = await db
    .prepare("SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<Incident>();
  return results;
}

export async function searchSimilarIncidents(
  db: D1Database,
  category: string,
  limit = 5
): Promise<Incident[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM incidents WHERE category = ? AND status = 'resolved' ORDER BY created_at DESC LIMIT ?"
    )
    .bind(category, limit)
    .all<Incident>();
  return results;
}

export async function saveMessage(
  db: D1Database,
  msg: { id: string; incident_id: string; role: string; content: string }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO messages (id, incident_id, role, content) VALUES (?, ?, ?, ?)"
    )
    .bind(msg.id, msg.incident_id, msg.role ?? "user", msg.content ?? "")
    .run();
}

export async function getMessages(
  db: D1Database,
  incidentId: string
): Promise<Message[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM messages WHERE incident_id = ? ORDER BY created_at ASC"
    )
    .bind(incidentId)
    .all<Message>();
  return results;
}
