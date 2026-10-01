// send-push — drains the push outbox into Expo's push service.
//
// Called only by pg_cron (public.invoke_send_push) with the shared X-Internal-Secret.
//   {"mode":"send"}      claim due outbox rows, group them per user, send, record tickets
//   {"mode":"receipts"}  check Expo receipts for recent tickets and drop dead device tokens
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), SEND_PUSH_SECRET.
// Deployed with verify_jwt: false like every function in this project; the secret is the gate.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SEND_PUSH_SECRET = Deno.env.get("SEND_PUSH_SECRET") || "";
const EXPO_PUSH = "https://exp.host/--/api/v2/push";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type OutboxRow = {
  id: number;
  user_id: string;
  kind: string;
  body: string;
  data: Record<string, unknown>;
  tokens: string[];
};
type Ticket = { status: "ok"; id: string } | {
  status: "error";
  message: string;
  details?: { error?: string };
};
type TicketRef = { ticket: string; token: string };

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function expo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${EXPO_PUSH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Expo ${path} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function sendDue() {
  const { data, error } = await supabase.rpc("claim_push_batch", { p_limit: 500 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return { claimed: 0 };

  // One message per user per batch: several rows for the same person become one push.
  const byUser = new Map<string, OutboxRow[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  type Message = { to: string; title: string; body: string; data: unknown; sound: string };
  const messages: Message[] = [];
  const messageRows: OutboxRow[][] = [];
  const results = new Map<number, { id: number; tickets: TicketRef[]; error: string | null }>();

  for (const group of byUser.values()) {
    const latest = group[group.length - 1];
    const body = group.length === 1 ? latest.body : `${latest.body} (+${group.length - 1} more)`;
    for (const row of group) results.set(row.id, { id: row.id, tickets: [], error: null });
    if (latest.tokens.length === 0) {
      for (const row of group) results.get(row.id)!.error = "no_tokens";
      continue;
    }
    for (const token of latest.tokens) {
      messages.push({ to: token, title: "Mahi", body, data: latest.data, sound: "default" });
      messageRows.push(group);
    }
  }

  const deadTokens: string[] = [];
  let offset = 0;
  for (const part of chunk(messages, 100)) {
    let tickets: Ticket[];
    try {
      tickets = (await expo<{ data: Ticket[] }>("send", part)).data;
    } catch (e) {
      // Leave these rows claimed but unsent: the claim expires and they are retried.
      for (const group of messageRows.slice(offset, offset + part.length)) {
        for (const row of group) results.delete(row.id);
      }
      console.error("[send-push] send failed", e);
      offset += part.length;
      continue;
    }
    tickets.forEach((t, i) => {
      const token = part[i].to;
      for (const row of messageRows[offset + i]) {
        const r = results.get(row.id);
        if (!r) continue;
        if (t.status === "ok") r.tickets.push({ ticket: t.id, token });
        else {
          r.error = t.details?.error ?? t.message;
          if (t.details?.error === "DeviceNotRegistered") deadTokens.push(token);
        }
      }
    });
    offset += part.length;
  }

  const done = [...results.values()].map((r) => ({
    id: r.id,
    tickets: r.tickets.length ? r.tickets : null,
    error: r.error,
  }));
  if (done.length) {
    const { error: e } = await supabase.rpc("complete_push", { p_results: done });
    if (e) throw new Error(e.message);
  }
  if (deadTokens.length) await supabase.rpc("remove_push_tokens", { p_tokens: deadTokens });
  return { claimed: rows.length, completed: done.length, messages: messages.length, deadTokens: deadTokens.length };
}

async function checkReceipts() {
  const { data, error } = await supabase.rpc("pending_push_receipts", { p_limit: 1000 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: number; tickets: TicketRef[] }[];
  if (rows.length === 0) return { checked: 0 };

  const tokenByTicket = new Map<string, string>();
  for (const row of rows) for (const t of row.tickets) tokenByTicket.set(t.ticket, t.token);

  const deadTokens = new Set<string>();
  for (const ids of chunk([...tokenByTicket.keys()], 1000)) {
    const receipts = (await expo<{ data: Record<string, Ticket> }>("getReceipts", { ids })).data;
    for (const [id, receipt] of Object.entries(receipts)) {
      if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
        deadTokens.add(tokenByTicket.get(id)!);
      }
    }
  }

  if (deadTokens.size) await supabase.rpc("remove_push_tokens", { p_tokens: [...deadTokens] });
  const { error: e } = await supabase.rpc("mark_push_receipts_checked", {
    p_ids: rows.map((r) => r.id),
  });
  if (e) throw new Error(e.message);
  return { checked: rows.length, deadTokens: deadTokens.size };
}

Deno.serve(async (req) => {
  if (
    req.method !== "POST" || !SEND_PUSH_SECRET ||
    !timingSafeEqual(req.headers.get("X-Internal-Secret") ?? "", SEND_PUSH_SECRET)
  ) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  try {
    const { mode } = await req.json().catch(() => ({ mode: "send" }));
    const result = mode === "receipts" ? await checkReceipts() : await sendDue();
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[send-push]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
