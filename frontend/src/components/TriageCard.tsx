import type { TriageResult } from "../api";

interface Props {
  triage: TriageResult;
  incidentId: string;
}

export default function TriageCard({ triage, incidentId }: Props) {
  return (
    <div className="triage-card">
      <h3>Incident Triage — {incidentId}</h3>

      <div className="triage-header">
        <span className={`severity-badge ${triage.severity}`}>
          {triage.severity}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {triage.category.replace(/_/g, " ")}
        </span>
      </div>

      <div className="triage-section">
        <label>Summary</label>
        <p>{triage.summary}</p>
      </div>

      <div className="triage-section">
        <label>Root Cause</label>
        <p>{triage.root_cause}</p>
      </div>

      <div className="triage-section">
        <label>Suggested Steps</label>
        <ol>
          {triage.suggested_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      {triage.affected_systems.length > 0 && (
        <div className="triage-section">
          <label>Affected Systems</label>
          <div className="affected-tags">
            {triage.affected_systems.map((sys, i) => (
              <span key={i} className="affected-tag">
                {sys}
              </span>
            ))}
          </div>
        </div>
      )}

      {triage.questions.length > 0 && (
        <div className="triage-section">
          <label>Questions for You</label>
          <ul>
            {triage.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
