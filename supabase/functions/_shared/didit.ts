// Shared pieces of the Didit identity check (app flag identity-verification):
//   didit-session  creates a Didit session for the signed-in person (POST /v3/session/)
//   didit-webhook  receives Didit's result and writes it to public.identity_verifications
// Migration 20261002150000_identity_verifications. Tests: didit_test.ts (deno test).
// Didit docs (checked 2026-10-02): https://docs.didit.me/sessions-api/create-session,
// https://docs.didit.me/integration/webhooks, https://docs.didit.me/integration/verification-statuses

export const DIDIT_SESSION_URL = "https://verification.didit.me/v3/session/";

/** Didit: reject a webhook whose X-Timestamp is more than 5 minutes from now. */
export const TIMESTAMP_TOLERANCE_S = 300;

/** New sessions per person per 24 hours (each one costs money at Didit). */
export const MAX_SESSIONS_PER_DAY = 5;

/** Statuses kept in identity_verifications.status (same check as the migration). */
export type IdentityStatus = "pending" | "in_review" | "approved" | "declined" | "expired";

const STATUS_MAP: Record<string, IdentityStatus> = {
  "Not Started": "pending",
  "In Progress": "pending",
  "Resubmitted": "pending",
  "Awaiting User": "pending",
  "In Review": "in_review",
  "Approved": "approved",
  "Declined": "declined",
  "Expired": "expired",
  "Abandoned": "expired",
  "Kyc Expired": "expired",
};

/** Didit's session status → ours, or null for one we don't know (the event is then ignored). */
export function mapDiditStatus(status: unknown): IdentityStatus | null {
  return typeof status === "string" && Object.hasOwn(STATUS_MAP, status) ? STATUS_MAP[status] : null;
}

export function sessionRequestBody(workflowId: string, userId: string) {
  return { workflow_id: workflowId, vendor_data: userId };
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** HMAC-SHA256 as lower-case hex. */
export async function hmacHex(secret: string, data: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return v;
}

/** Didit's X-Signature-V2 form: keys sorted, compact, Unicode kept (as their Node sample). */
export function canonicalJson(body: unknown): string {
  return JSON.stringify(sortKeys(body));
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the webhook came from Didit: a fresh X-Timestamp, and either X-Signature (HMAC of
 * the exact body bytes) or X-Signature-V2 (HMAC of the canonical JSON) matches. The deprecated
 * X-Signature-Simple covers only the envelope, not the decision, so it is not accepted.
 */
export async function verifyDiditWebhook(input: {
  rawBody: Uint8Array<ArrayBuffer>;
  signature: string | null;
  signatureV2: string | null;
  timestamp: string | null;
  secret: string;
  nowSec: number;
}): Promise<boolean> {
  if (!input.secret) return false;
  if (!input.timestamp || !/^\d+$/.test(input.timestamp)) return false;
  if (Math.abs(input.nowSec - Number(input.timestamp)) > TIMESTAMP_TOLERANCE_S) return false;

  if (input.signature) {
    const expected = await hmacHex(input.secret, input.rawBody);
    if (sameHex(expected, input.signature.trim().toLowerCase())) return true;
  }
  if (input.signatureV2) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(input.rawBody));
    } catch {
      return false;
    }
    const expected = await hmacHex(input.secret, new TextEncoder().encode(canonicalJson(parsed)));
    if (sameHex(expected, input.signatureV2.trim().toLowerCase())) return true;
  }
  return false;
}

type Json = Record<string, unknown>;

function statusOf(v: unknown): string | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const s = (v as Json).status;
    return typeof s === "string" ? s : null;
  }
  return null;
}

/**
 * What we keep of a webhook: the event, Didit's status and each check's status. Never names,
 * document numbers, dates of birth, images, addresses or IP details — the full decision stays at
 * Didit (GET /v3/session/{id}/decision/).
 */
export function minimalDecision(payload: Json) {
  const checks: Record<string, string | string[]> = {};
  const decision = payload.decision;
  if (decision !== null && typeof decision === "object" && !Array.isArray(decision)) {
    for (const [key, value] of Object.entries(decision as Json)) {
      if (Array.isArray(value)) {
        const statuses = value.map(statusOf).filter((s): s is string => s !== null);
        if (statuses.length > 0) checks[key] = statuses;
      } else {
        const s = statusOf(value);
        if (s !== null) checks[key] = s;
      }
    }
  }
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    event_id: str(payload.event_id),
    webhook_type: str(payload.webhook_type),
    didit_status: str(payload.status),
    workflow_id: str(payload.workflow_id),
    checks,
  };
}
