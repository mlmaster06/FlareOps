import type { Incident } from "../api";

interface Props {
  incidents: Incident[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function HistoryPanel({ incidents, onSelect, onClose }: Props) {
  return (
    <div className="history-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2>Incident History</h2>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            padding: "4px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Close
        </button>
      </div>

      {incidents.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          No incidents yet. Report your first incident to get started.
        </p>
      )}

      {incidents.map((inc) => (
        <div
          key={inc.id}
          className="history-item"
          onClick={() => onSelect(inc.id)}
        >
          <div className="hi-header">
            <span className={`severity-badge ${inc.severity}`}>
              {inc.severity}
            </span>
            <span className={`status-badge ${inc.status}`}>{inc.status}</span>
          </div>
          <div className="hi-summary">{inc.summary}</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginTop: 6,
            }}
          >
            {new Date(inc.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
