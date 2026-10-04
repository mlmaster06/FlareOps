/**
 * Triage engine — calls Workers AI (Llama 3.3) for analysis.
 *
 * Two modes:
 *   1. Initial triage: engineer describes incident → structured triage result.
 *   2. Follow-up: engineer provides more context → refined diagnosis.
 *
 * Includes JSON extraction fallback for noisy model output (same pattern as Sieve).
 */

import { TRIAGE_SYSTEM, FOLLOWUP_SYSTEM } from "./prompts";
import { searchSimilarIncidents } from "./db";
import type { Env, TriageResult, FollowupResult, Message } from "./types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Initial triage — first message in an incident.
 */
export async function triageIncident(
  ai: Ai,
  db: D1Database,
  userMessage: string
): Promise<TriageResult> {
  const raw = await callAI(ai, TRIAGE_SYSTEM, userMessage);
  const result = parseJsonLoose<TriageResult>(raw);

  // Enrich with similar past incidents if available.
  try {
    const similar = await searchSimilarIncidents(db, result.category, 3);
    if (similar.length > 0) {
      const context = similar
        .map(
          (inc) =>
            `- [${inc.severity}] ${inc.summary} → Fixed by: ${inc.resolution || "unknown"}`
        )
        .join("\n");

      const enrichedPrompt = `${userMessage}\n\nSIMILAR PAST INCIDENTS (for reference):\n${context}`;
      const enrichedRaw = await callAI(ai, TRIAGE_SYSTEM, enrichedPrompt);
      return parseJsonLoose<TriageResult>(enrichedRaw);
    }
  } catch {
    // If enrichment fails, return the original triage — don't block on it.
  }

  return result;
}

/**
 * Follow-up — continuing conversation within an incident.
 */
export async function followUp(
  ai: Ai,
  history: Message[],
  newMessage: string,
  currentTriage: { severity: string; root_cause: string | null }
): Promise<FollowupResult> {
  const conversationContext = history
    .map((m) => `${m.role === "user" ? "Engineer" : "FlareOps"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = `CURRENT TRIAGE STATE:
Severity: ${currentTriage.severity}
Root Cause: ${currentTriage.root_cause || "Under investigation"}

CONVERSATION SO FAR:
${conversationContext}

ENGINEER'S NEW MESSAGE:
${newMessage}`;

  const raw = await callAI(ai, FOLLOWUP_SYSTEM, userPrompt);
  return parseJsonLoose<FollowupResult>(raw);
}

/**
 * Call Workers AI with system + user message.
 */
async function callAI(ai: Ai, system: string, user: string): Promise<string> {
  const response = await ai.run(MODEL, {
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: user + "\n\nRespond with a single JSON object. Start with {",
      },
    ],
    max_tokens: 2048,
    temperature: 0.1,
  }) as Record<string, unknown>;

  // DEBUG: Log the raw response shape so we know exactly what Workers AI returns.
  console.log("Workers AI raw response type:", typeof response);

  // Workers AI response format varies by model. Handle all cases.
  let text = "";
  if (typeof response === "string") {
    text = response;
  } else if (response && typeof response === "object") {
    // OpenAI-compatible format: { choices: [{ message: { content: "..." } }] }
    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    if (choices && choices.length > 0 && typeof choices[0]?.message?.content === "string") {
      text = choices[0].message.content;
    }
    // Simple format: { response: "..." }
    else if (typeof response.response === "string") {
      text = response.response;
    }
    // Nested format: { result: { response: "..." } }
    else if (response.result && typeof (response.result as Record<string, unknown>).response === "string") {
      text = (response.result as Record<string, unknown>).response as string;
    }
    // Fallback: stringify the whole thing
    else {
      console.log("Workers AI: unexpected shape, stringifying. Keys:", Object.keys(response));
      text = JSON.stringify(response);
    }
  }

  console.log("Extracted text (first 300 chars):", text.slice(0, 300));

  if (!text) {
    throw new Error(`Workers AI returned empty response. Raw: ${JSON.stringify(response).slice(0, 300)}`);
  }
  return text;
}

/**
 * Extract JSON from a possibly-noisy model response.
 * Same defensive pattern as Sieve's _parse_json_loose.
 */
function parseJsonLoose<T>(text: string): T {
  if (!text || typeof text !== "string") {
    throw new Error(`Expected string, got ${typeof text}: ${String(text).slice(0, 200)}`);
  }
  let cleaned = text.trim();

  // Strip markdown fences.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Extract the largest {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Model returned non-JSON output: ${cleaned.slice(0, 200)}`);
    }
    return JSON.parse(match[0]) as T;
  }
}
