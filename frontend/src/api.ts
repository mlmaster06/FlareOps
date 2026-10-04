const API_BASE = "/api";

export interface TriageResult {
  severity: string;
  category: string;
  summary: string;
  root_cause: string;
  suggested_steps: string[];
  questions: string[];
  affected_systems: string[];
}

export interface TriageResponse {
  incident_id: string;
  triage: TriageResult;
}

export interface FollowupResult {
  updated_severity: string | null;
  updated_root_cause: string | null;
  response: string;
  additional_steps: string[];
  resolved: boolean;
}

export interface ChatResponse {
  incident_id: string;
  result: FollowupResult;
}

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

export interface Message {
  id: string;
  incident_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message || `Request failed: ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

export function triageIncident(message: string): Promise<TriageResponse> {
  return request("/triage", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function sendMessage(
  incidentId: string,
  message: string
): Promise<ChatResponse> {
  return request(`/chat/${incidentId}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function resolveIncident(
  incidentId: string,
  resolution?: string
): Promise<{ ok: boolean }> {
  return request(`/resolve/${incidentId}`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  });
}

export function listIncidents(): Promise<{ incidents: Incident[] }> {
  return request("/incidents");
}

export function getIncident(
  id: string
): Promise<{ incident: Incident; messages: Message[] }> {
  return request(`/incidents/${id}`);
}

export function healthCheck(): Promise<{ status: string; model: string }> {
  return request("/health");
}
