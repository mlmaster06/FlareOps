/**
 * FlareOps Worker — API entry point.
 *
 * Routes:
 *   POST /api/triage          → New incident: analyze logs, return triage
 *   POST /api/chat/:id        → Follow-up message within an incident
 *   POST /api/resolve/:id     → Mark incident as resolved
 *   GET  /api/incidents        → List past incidents
 *   GET  /api/incidents/:id    → Get a single incident with messages
 *   GET  /api/health           → Health check
 *   GET  /*                    → Serve frontend (static assets)
 */

import type { Env } from "./types";
import { triageIncident, followUp } from "./triage";
import {
  createIncident,
  updateIncident,
  getIncident,
  listIncidents,
  saveMessage,
  getMessages,
} from "./db";

export { IncidentSession } from "./durable-objects/incident-session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for frontend dev server.
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    try {
      // --- API Routes ---
      if (path === "/api/health" && request.method === "GET") {
        return corsResponse(Response.json({ status: "ok", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }));
      }

      if (path === "/api/triage" && request.method === "POST") {
        return corsResponse(await handleTriage(request, env));
      }

      if (path.startsWith("/api/chat/") && request.method === "POST") {
        const incidentId = path.split("/api/chat/")[1];
        return corsResponse(await handleChat(request, env, incidentId));
      }

      if (path.startsWith("/api/resolve/") && request.method === "POST") {
        const incidentId = path.split("/api/resolve/")[1];
        return corsResponse(await handleResolve(request, env, incidentId));
      }

      if (path === "/api/incidents" && request.method === "GET") {
        return corsResponse(await handleListIncidents(env));
      }

      if (path.startsWith("/api/incidents/") && request.method === "GET") {
        const incidentId = path.split("/api/incidents/")[1];
        return corsResponse(await handleGetIncident(env, incidentId));
      }

      // Serve frontend for non-API routes.
      return new Response("FlareOps API. Use /api/* endpoints.", { status: 200 });
    } catch (err) {
      console.error("Unhandled error:", err);
      return corsResponse(
        Response.json(
          { error: "internal", message: err instanceof Error ? err.message : "Unknown error" },
          { status: 500 }
        )
      );
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleTriage(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { message: string };
  if (!body.message || body.message.trim().length < 3) {
    return Response.json({ error: "Message is required (min 3 chars)." }, { status: 400 });
  }

  const triage = await triageIncident(env.AI, env.DB, body.message);

  // Sanitize — ensure no undefined values (D1 rejects undefined, only accepts null).
  triage.severity = triage.severity ?? "P3";
  triage.category = triage.category ?? "unknown";
  triage.summary = triage.summary ?? "Incident reported";
  triage.root_cause = triage.root_cause ?? "Under investigation";
  triage.suggested_steps = triage.suggested_steps ?? [];
  triage.questions = triage.questions ?? [];
  triage.affected_systems = triage.affected_systems ?? [];

  const incidentId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Save to D1.
  await createIncident(env.DB, {
    id: incidentId,
    severity: triage.severity,
    category: triage.category,
    summary: triage.summary,
    root_cause: triage.root_cause,
  });

  // Save user message to D1.
  await saveMessage(env.DB, {
    id: `msg-${Date.now()}-u`,
    incident_id: incidentId,
    role: "user",
    content: body.message,
  });

  // Save assistant triage as a message.
  const assistantContent = formatTriageForChat(triage);
  await saveMessage(env.DB, {
    id: `msg-${Date.now()}-a`,
    incident_id: incidentId,
    role: "assistant",
    content: assistantContent,
  });

  // Initialize Durable Object for this incident.
  const doId = env.INCIDENT_SESSION.idFromName(incidentId);
  const stub = env.INCIDENT_SESSION.get(doId);
  await stub.fetch(new Request("https://do/init", {
    method: "POST",
    body: JSON.stringify({
      incident_id: incidentId,
      severity: triage.severity,
      category: triage.category,
      root_cause: triage.root_cause,
    }),
  }));

  // Store messages in DO too.
  await stub.fetch(new Request("https://do/message", {
    method: "POST",
    body: JSON.stringify({
      id: `msg-${Date.now()}-u`,
      incident_id: incidentId,
      role: "user",
      content: body.message,
      created_at: new Date().toISOString(),
    }),
  }));
  await stub.fetch(new Request("https://do/message", {
    method: "POST",
    body: JSON.stringify({
      id: `msg-${Date.now()}-a`,
      incident_id: incidentId,
      role: "assistant",
      content: assistantContent,
      created_at: new Date().toISOString(),
    }),
  }));

  return Response.json({
    incident_id: incidentId,
    triage,
  });
}

async function handleChat(
  request: Request,
  env: Env,
  incidentId: string
): Promise<Response> {
  const body = (await request.json()) as { message: string };
  if (!body.message || body.message.trim().length < 2) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  // Get incident from D1.
  const incident = await getIncident(env.DB, incidentId);
  if (!incident) {
    return Response.json({ error: "Incident not found." }, { status: 404 });
  }

  // Get conversation history from DO.
  const doId = env.INCIDENT_SESSION.idFromName(incidentId);
  const stub = env.INCIDENT_SESSION.get(doId);
  const stateRes = await stub.fetch(new Request("https://do/state"));
  const session = (await stateRes.json()) as {
    messages: Array<{ id: string; incident_id: string; role: string; content: string; created_at: string }>;
    severity: string;
    root_cause: string | null;
  };

  // Call AI for follow-up.
  const result = await followUp(
    env.AI,
    session.messages,
    body.message,
    { severity: session.severity, root_cause: session.root_cause }
  );

  // Save user message.
  const userMsgId = `msg-${Date.now()}-u`;
  await saveMessage(env.DB, {
    id: userMsgId,
    incident_id: incidentId,
    role: "user",
    content: body.message,
  });

  // Save assistant response.
  const assistantMsgId = `msg-${Date.now()}-a`;
  await saveMessage(env.DB, {
    id: assistantMsgId,
    incident_id: incidentId,
    role: "assistant",
    content: result.response,
  });

  // Update DO state.
  await stub.fetch(new Request("https://do/message", {
    method: "POST",
    body: JSON.stringify({ id: userMsgId, incident_id: incidentId, role: "user", content: body.message, created_at: new Date().toISOString() }),
  }));
  await stub.fetch(new Request("https://do/message", {
    method: "POST",
    body: JSON.stringify({ id: assistantMsgId, incident_id: incidentId, role: "assistant", content: result.response, created_at: new Date().toISOString() }),
  }));

  // Update incident if severity or root cause changed.
  const updates: Record<string, string> = {};
  if (result.updated_severity) updates.severity = result.updated_severity;
  if (result.updated_root_cause) updates.root_cause = result.updated_root_cause;
  if (Object.keys(updates).length > 0) {
    await updateIncident(env.DB, incidentId, updates);
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify(updates),
    }));
  }

  // If resolved, update incident status.
  if (result.resolved) {
    await updateIncident(env.DB, incidentId, {
      status: "resolved",
      resolution: result.response,
      resolved_at: new Date().toISOString(),
    });
    await stub.fetch(new Request("https://do/update", {
      method: "POST",
      body: JSON.stringify({ resolved: true }),
    }));
  }

  return Response.json({
    incident_id: incidentId,
    result,
  });
}

async function handleResolve(
  request: Request,
  env: Env,
  incidentId: string
): Promise<Response> {
  const body = (await request.json()) as { resolution?: string };

  await updateIncident(env.DB, incidentId, {
    status: "resolved",
    resolution: body.resolution || "Manually resolved",
    resolved_at: new Date().toISOString(),
  });

  const doId = env.INCIDENT_SESSION.idFromName(incidentId);
  const stub = env.INCIDENT_SESSION.get(doId);
  await stub.fetch(new Request("https://do/update", {
    method: "POST",
    body: JSON.stringify({ resolved: true }),
  }));

  return Response.json({ ok: true, incident_id: incidentId, status: "resolved" });
}

async function handleListIncidents(env: Env): Promise<Response> {
  const incidents = await listIncidents(env.DB, 50);
  return Response.json({ incidents });
}

async function handleGetIncident(env: Env, id: string): Promise<Response> {
  const incident = await getIncident(env.DB, id);
  if (!incident) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const messages = await getMessages(env.DB, id);
  return Response.json({ incident, messages });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTriageForChat(triage: {
  severity: string;
  summary: string;
  root_cause: string;
  suggested_steps: string[];
  questions: string[];
  affected_systems: string[];
}): string {
  const parts = [
    `**Severity: ${triage.severity}**`,
    `**Summary:** ${triage.summary}`,
    `**Root Cause:** ${triage.root_cause}`,
    "",
    "**Suggested Steps:**",
    ...triage.suggested_steps.map((s, i) => `${i + 1}. ${s}`),
  ];
  if (triage.affected_systems.length > 0) {
    parts.push("", `**Affected Systems:** ${triage.affected_systems.join(", ")}`);
  }
  if (triage.questions.length > 0) {
    parts.push("", "**Questions for you:**", ...triage.questions.map((q) => `- ${q}`));
  }
  return parts.join("\n");
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
