import { useState, useRef, useEffect, useCallback } from "react";
import TriageCard from "./components/TriageCard";
import ChatMessage from "./components/ChatMessage";
import HistoryPanel from "./components/HistoryPanel";
import {
  triageIncident,
  sendMessage,
  resolveIncident,
  listIncidents,
  getIncident,
  type TriageResult,
  type Incident,
} from "./api";

interface ChatEntry {
  type: "user" | "assistant" | "triage" | "system";
  content: string;
  triage?: TriageResult;
  incidentId?: string;
}

const EXAMPLE_LOGS = [
  'Production API returning 503 errors for all /checkout endpoints. Started 10 mins ago. Logs show "Connection pool exhausted" from PostgreSQL.',
  "Memory usage on worker nodes spiking to 95%. Pods being OOMKilled. Deployed auth-service v2.4.1 an hour ago.",
  "DNS resolution failing intermittently for api.internal.company.com. Some requests succeed, others timeout after 30s.",
  "SSL certificate for *.example.com expired. All HTTPS traffic getting ERR_CERT_DATE_INVALID.",
];

export default function App() {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIncidentId, setCurrentIncidentId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chat, loading, scrollToBottom]);

  // Auto-resize textarea.
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const loadHistory = async () => {
    try {
      const data = await listIncidents();
      setIncidents(data.incidents);
      setShowHistory(true);
    } catch {
      console.error("Failed to load history");
    }
  };

  const loadIncident = async (id: string) => {
    try {
      const data = await getIncident(id);
      const entries: ChatEntry[] = [];

      for (const msg of data.messages) {
        entries.push({
          type: msg.role,
          content: msg.content,
        });
      }

      setChat(entries);
      setCurrentIncidentId(id);
      setResolved(data.incident.status === "resolved");
      setShowHistory(false);
    } catch {
      console.error("Failed to load incident");
    }
  };

  const handleSubmit = async () => {
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    setChat((prev) => [...prev, { type: "user", content: message }]);
    setLoading(true);

    try {
      if (!currentIncidentId) {
        // New incident — initial triage.
        const res = await triageIncident(message);
        setCurrentIncidentId(res.incident_id);
        setChat((prev) => [
          ...prev,
          {
            type: "triage",
            content: "",
            triage: res.triage,
            incidentId: res.incident_id,
          },
        ]);
      } else {
        // Follow-up within existing incident.
        const res = await sendMessage(currentIncidentId, message);

        setChat((prev) => [
          ...prev,
          { type: "assistant", content: res.result.response },
        ]);

        if (res.result.updated_severity) {
          setChat((prev) => [
            ...prev,
            {
              type: "system",
              content: `Severity updated to ${res.result.updated_severity}`,
            },
          ]);
        }
        if (res.result.updated_root_cause) {
          setChat((prev) => [
            ...prev,
            {
              type: "system",
              content: `Root cause updated: ${res.result.updated_root_cause}`,
            },
          ]);
        }
        if (res.result.resolved) {
          setResolved(true);
          setChat((prev) => [
            ...prev,
            { type: "system", content: "Incident marked as resolved." },
          ]);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setChat((prev) => [
        ...prev,
        { type: "system", content: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!currentIncidentId) return;
    try {
      await resolveIncident(currentIncidentId, "Manually resolved by engineer.");
      setResolved(true);
      setChat((prev) => [
        ...prev,
        { type: "system", content: "Incident marked as resolved." },
      ]);
    } catch {
      console.error("Failed to resolve");
    }
  };

  const handleNewIncident = () => {
    setChat([]);
    setCurrentIncidentId(null);
    setResolved(false);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isNew = chat.length === 0;

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>FlareOps</h1>
        <span className="tagline">AI-Powered Incident Triage</span>
        <div style={{ flex: 1 }} />
        {currentIncidentId && !resolved && (
          <button className="resolve-btn" onClick={handleResolve}>
            Resolve
          </button>
        )}
        {currentIncidentId && (
          <button
            onClick={handleNewIncident}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              marginLeft: 8,
            }}
          >
            New Incident
          </button>
        )}
        <button className="history-toggle" onClick={loadHistory}>
          History
        </button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          incidents={incidents}
          onSelect={loadIncident}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Welcome screen */}
      {isNew && (
        <div className="welcome">
          <h2>Report an Incident</h2>
          <p>
            Paste error logs, describe the issue, or share an alert. FlareOps
            will analyze it, classify severity, identify the root cause, and
            suggest next steps.
          </p>
          <div className="examples">
            {EXAMPLE_LOGS.map((ex, i) => (
              <div
                key={i}
                className="example-chip"
                onClick={() => setInput(ex)}
              >
                {ex.length > 80 ? ex.slice(0, 80) + "..." : ex}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="chat-container">
        {chat.map((entry, i) =>
          entry.type === "triage" && entry.triage ? (
            <TriageCard
              key={i}
              triage={entry.triage}
              incidentId={entry.incidentId || ""}
            />
          ) : (
            <ChatMessage key={i} content={entry.content} role={entry.type === "triage" ? "assistant" : entry.type} />
          )
        )}

        {loading && (
          <div className="loading">
            <span className="loading-dots">
              <span>●</span>
              <span>●</span>
              <span>●</span>
            </span>
            Analyzing...
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              resolved
                ? "Incident resolved. Click 'New Incident' to start another."
                : currentIncidentId
                  ? "Provide more context, ask a question, or describe what you tried..."
                  : "Paste error logs, describe the incident, or share an alert..."
            }
            disabled={loading || resolved}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={loading || !input.trim() || resolved}
          >
            {currentIncidentId ? "Send" : "Triage"}
          </button>
        </div>
      </div>
    </div>
  );
}
