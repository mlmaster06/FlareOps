/**
 * Durable Object: IncidentSession
 *
 * Holds the live conversation state for a single incident. Each incident
 * gets its own Durable Object instance (keyed by incident ID).
 *
 * This is like Sieve's session.py — but persistent, distributed, and
 * survives Worker restarts. Cloudflare guarantees single-threaded access
 * per instance, so no race conditions.
 */

import type { Message } from "../types";

interface SessionState {
  incident_id: string;
  severity: string;
  category: string;
  root_cause: string | null;
  messages: Message[];
  resolved: boolean;
}

export class IncidentSession implements DurableObject {
  private state: DurableObjectState;
  private session: SessionState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      return this.handleInit(request);
    }
    if (request.method === "POST" && url.pathname === "/message") {
      return this.handleMessage(request);
    }
    if (request.method === "POST" && url.pathname === "/update") {
      return this.handleUpdate(request);
    }
    if (request.method === "GET" && url.pathname === "/state") {
      return this.handleGetState();
    }

    return new Response("Not Found", { status: 404 });
  }

  /** Initialize a new incident session. */
  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      incident_id: string;
      severity: string;
      category: string;
      root_cause: string | null;
    };

    this.session = {
      incident_id: body.incident_id,
      severity: body.severity,
      category: body.category,
      root_cause: body.root_cause,
      messages: [],
      resolved: false,
    };

    await this.state.storage.put("session", this.session);
    return Response.json({ ok: true });
  }

  /** Add a message to the conversation. */
  private async handleMessage(request: Request): Promise<Response> {
    await this.loadSession();
    if (!this.session) {
      return Response.json({ error: "Session not initialized" }, { status: 400 });
    }

    const msg = (await request.json()) as Message;
    this.session.messages.push(msg);
    await this.state.storage.put("session", this.session);

    return Response.json({ ok: true, message_count: this.session.messages.length });
  }

  /** Update triage state (severity, root_cause, resolved). */
  private async handleUpdate(request: Request): Promise<Response> {
    await this.loadSession();
    if (!this.session) {
      return Response.json({ error: "Session not initialized" }, { status: 400 });
    }

    const updates = (await request.json()) as Partial<SessionState>;
    if (updates.severity) this.session.severity = updates.severity;
    if (updates.root_cause) this.session.root_cause = updates.root_cause;
    if (updates.resolved !== undefined) this.session.resolved = updates.resolved;

    await this.state.storage.put("session", this.session);
    return Response.json({ ok: true });
  }

  /** Return the full session state. */
  private async handleGetState(): Promise<Response> {
    await this.loadSession();
    if (!this.session) {
      return Response.json({ error: "Session not initialized" }, { status: 404 });
    }
    return Response.json(this.session);
  }

  private async loadSession(): Promise<void> {
    if (!this.session) {
      this.session =
        (await this.state.storage.get<SessionState>("session")) ?? null;
    }
  }
}
