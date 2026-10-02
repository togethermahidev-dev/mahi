// deno test supabase/functions/_shared/didit_test.ts
// Signature vectors were computed independently with
//   printf '%s' '<body>' | openssl dgst -sha256 -hmac 'whsec_test' -hex
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  canonicalJson,
  hmacHex,
  isUuid,
  mapDiditStatus,
  MAX_SESSIONS_PER_DAY,
  minimalDecision,
  sessionRequestBody,
  TIMESTAMP_TOLERANCE_S,
  verifyDiditWebhook,
} from "./didit.ts";

const SECRET = "whsec_test";
const NOW = 1_790_000_000;
const RAW = '{"session_id":"abc","status":"Approved","webhook_type":"status.updated"}';
const RAW_SIG = "bc6fa4ac90207d5e1f7c7b94181580537fc8bf9d92bac25e8ad562664bf77d4e";
// Same JSON as the V2 vector once sorted and compacted, sent with spaces and keys out of order.
const LOOSE = '{ "status": "Approved", "b": { "d": [2, 1], "c": "é" }, "a": 1 }';
const V2_SIG = "6f269edb9e7a609cb5a1f01b8d841b82f4a7e846a7a7577a2b88fd38c08c2220";

const base = {
  rawBody: new TextEncoder().encode(RAW),
  signature: RAW_SIG as string | null,
  signatureV2: null as string | null,
  timestamp: String(NOW) as string | null,
  secret: SECRET,
  nowSec: NOW,
};

Deno.test("hmacHex matches openssl", async () => {
  assertEquals(await hmacHex(SECRET, new TextEncoder().encode(RAW)), RAW_SIG);
});

Deno.test("canonical JSON: sorted keys, compact, unicode kept", () => {
  assertEquals(canonicalJson(JSON.parse(LOOSE)), '{"a":1,"b":{"c":"é","d":[2,1]},"status":"Approved"}');
});

Deno.test("accepts X-Signature over the raw body", async () => {
  assert(await verifyDiditWebhook(base));
});

Deno.test("accepts X-Signature-V2 over the canonical JSON", async () => {
  assert(
    await verifyDiditWebhook({
      ...base,
      rawBody: new TextEncoder().encode(LOOSE),
      signature: "0".repeat(64),
      signatureV2: V2_SIG,
    }),
  );
});

Deno.test("refuses a changed body", async () => {
  const tampered = RAW.replace("Approved", "Declined");
  assert(!(await verifyDiditWebhook({ ...base, rawBody: new TextEncoder().encode(tampered) })));
});

Deno.test("refuses the wrong secret, and an empty one", async () => {
  assert(!(await verifyDiditWebhook({ ...base, secret: "other" })));
  assert(!(await verifyDiditWebhook({ ...base, secret: "" })));
});

Deno.test("refuses with no signature headers", async () => {
  assert(!(await verifyDiditWebhook({ ...base, signature: null, signatureV2: null })));
});

Deno.test("refuses a stale or missing timestamp (replays)", async () => {
  assert(await verifyDiditWebhook({ ...base, timestamp: String(NOW - TIMESTAMP_TOLERANCE_S) }));
  assert(!(await verifyDiditWebhook({ ...base, timestamp: String(NOW - TIMESTAMP_TOLERANCE_S - 1) })));
  assert(!(await verifyDiditWebhook({ ...base, timestamp: String(NOW + TIMESTAMP_TOLERANCE_S + 1) })));
  assert(!(await verifyDiditWebhook({ ...base, timestamp: null })));
  assert(!(await verifyDiditWebhook({ ...base, timestamp: "soon" })));
});

Deno.test("maps every Didit status", () => {
  assertEquals(mapDiditStatus("Not Started"), "pending");
  assertEquals(mapDiditStatus("In Progress"), "pending");
  assertEquals(mapDiditStatus("Resubmitted"), "pending");
  assertEquals(mapDiditStatus("Awaiting User"), "pending");
  assertEquals(mapDiditStatus("In Review"), "in_review");
  assertEquals(mapDiditStatus("Approved"), "approved");
  assertEquals(mapDiditStatus("Declined"), "declined");
  assertEquals(mapDiditStatus("Expired"), "expired");
  assertEquals(mapDiditStatus("Abandoned"), "expired");
  assertEquals(mapDiditStatus("Kyc Expired"), "expired");
});

Deno.test("an unknown status maps to null (ignored)", () => {
  assertEquals(mapDiditStatus("Something New"), null);
  assertEquals(mapDiditStatus(undefined), null);
  assertEquals(mapDiditStatus(42), null);
});

Deno.test("minimal decision keeps statuses only, never personal details", () => {
  const out = minimalDecision({
    event_id: "e1",
    webhook_type: "status.updated",
    status: "Approved",
    workflow_id: "w1",
    vendor_data: "user",
    decision: {
      session_id: "s1",
      status: "Approved",
      id_verification: { status: "Approved", first_name: "Ann", document_number: "X123", date_of_birth: "1990-01-01" },
      liveness: { status: "Approved", score: 99.1 },
      face_matches: [{ status: "Approved", score: 90 }, { status: "Declined" }],
      ip_analysis: { ip_address: "1.2.3.4" },
    },
  });
  assertEquals(out, {
    event_id: "e1",
    webhook_type: "status.updated",
    didit_status: "Approved",
    workflow_id: "w1",
    checks: { id_verification: "Approved", liveness: "Approved", face_matches: ["Approved", "Declined"] },
  });
  const text = JSON.stringify(out);
  for (const pii of ["Ann", "X123", "1990", "1.2.3.4"]) assert(!text.includes(pii), pii);
});

Deno.test("minimal decision copes with no decision object", () => {
  assertEquals(minimalDecision({ status: "In Progress" }), {
    event_id: null,
    webhook_type: null,
    didit_status: "In Progress",
    workflow_id: null,
    checks: {},
  });
});

Deno.test("session request: the workflow and the user id as vendor_data", () => {
  assertEquals(sessionRequestBody("wf-1", "00000000-0000-0000-0000-000000000001"), {
    workflow_id: "wf-1",
    vendor_data: "00000000-0000-0000-0000-000000000001",
  });
});

Deno.test("uuid check", () => {
  assert(isUuid("00000000-0000-0000-0000-00000000d1d1"));
  assert(!isUuid("user_42"));
  assert(!isUuid(null));
});

Deno.test("a sane daily cap on new sessions", () => {
  assert(MAX_SESSIONS_PER_DAY >= 1 && MAX_SESSIONS_PER_DAY <= 10);
});
