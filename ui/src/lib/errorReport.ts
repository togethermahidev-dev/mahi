/**
 * Turns anything that went wrong into one clear Sentry report. Pure: no Sentry import, so it is
 * tested in node; `reportError` in `@/lib/sentry` sends what this builds.
 *
 * The title reads "<flow>.<action> failed: <what the server or code said> [code …]" so an issue
 * list says where it broke and why without opening it. Supabase's code, details, hint and HTTP
 * status are lifted out of the error; the original stays attached as `cause` for its stack.
 */

export type ErrorLevel = 'fatal' | 'error' | 'warning';

export type ErrorKind = 'database' | 'auth' | 'server-function' | 'storage' | 'network' | 'app';

export interface ErrorContext {
  /** The feature, e.g. 'posts', 'auth', 'messages'. */
  flow: string;
  /** What was being done, e.g. 'create', 'signIn', 'loadThread'. */
  action: string;
  /** Ids and inputs that help explain it later. Secrets are removed. */
  extra?: Record<string, unknown>;
  /** Defaults to 'error' ('warning' for a lost connection). */
  level?: ErrorLevel;
}

export interface ErrorReport {
  error: Error;
  level: ErrorLevel;
  tags: Record<string, string>;
  context: Record<string, unknown>;
  fingerprint: string[];
}

const KIND_NAMES: Record<ErrorKind, string> = {
  database: 'DatabaseError',
  auth: 'AuthError',
  'server-function': 'ServerFunctionError',
  storage: 'StorageError',
  network: 'NetworkError',
  app: 'Error',
};

const NETWORK = /network request failed|failed to fetch|network error|timed? ?out|aborted|offline/i;
const SECRET_KEY = /password|token|secret|otp|pin|authorization|cookie/i;

function field(raw: unknown, key: string): string | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const v = (raw as Record<string, unknown>)[key];
  return v === undefined || v === null || v === '' ? undefined : String(v);
}

function rawMessage(raw: unknown): string {
  if (typeof raw === 'string') return raw || 'empty message';
  const m = field(raw, 'message');
  if (m) return m;
  if (raw === null || raw === undefined) return `unknown error (${String(raw)})`;
  try {
    return `unknown error ${JSON.stringify(raw).slice(0, 300)}`;
  } catch {
    return 'unknown error (not readable)';
  }
}

function kindOf(raw: unknown, name: string | undefined, message: string): ErrorKind {
  if (NETWORK.test(message)) return 'network';
  if (name?.startsWith('Postgrest')) return 'database';
  if (name?.startsWith('Auth') || field(raw, '__isAuthError')) return 'auth';
  if (name?.startsWith('Functions')) return 'server-function';
  if (name?.startsWith('Storage') || field(raw, '__isStorageError')) return 'storage';
  if (!(raw instanceof Error) && field(raw, 'code')) return 'database';
  return 'app';
}

/** Ids, numbers and quoted values change per person; strip them so one bug is one issue. */
function groupingKey(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .replace(/"[^"]*"|'[^']*'/g, '<v>')
    .slice(0, 200);
}

function cleanExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra ?? {})) out[k] = SECRET_KEY.test(k) ? '[removed]' : v;
  return out;
}

/** An error re-thrown as `new Error(msg, { cause })` keeps Supabase's fields on the cause. */
function detailSource(raw: unknown): unknown {
  const cause = raw instanceof Error ? (raw as Error & { cause?: unknown }).cause : undefined;
  return cause && typeof cause === 'object' && !field(raw, 'code') ? cause : raw;
}

export function buildErrorReport(raw: unknown, ctx: ErrorContext): ErrorReport {
  const message = rawMessage(raw);
  const source = detailSource(raw);
  const rawName = source instanceof Error ? source.name : field(source, 'name');
  const kind = kindOf(source, rawName, message);
  const code = field(source, 'code');
  const status = field(source, 'status');

  let title = `${ctx.flow}.${ctx.action} failed: ${message}`;
  if (code) title += ` [code ${code}]`;
  if (status) title += ` [HTTP ${status}]`;

  const error = new Error(title, raw instanceof Error ? { cause: raw } : undefined);
  error.name = rawName && rawName !== 'Error' ? rawName : KIND_NAMES[kind];
  if (raw instanceof Error && raw.stack) {
    // Keep the original frames; the first line is replaced by the clearer title.
    error.stack = `${error.name}: ${title}\n${raw.stack.split('\n').slice(1).join('\n')}`;
  }

  const tags: Record<string, string> = { flow: ctx.flow, action: ctx.action, kind };
  if (code) tags.code = code;
  if (status) tags.http_status = status;

  const context: Record<string, unknown> = {
    flow: ctx.flow,
    action: ctx.action,
    original_message: message,
    ...(code && { code }),
    ...(field(source, 'details') && { details: field(source, 'details') }),
    ...(field(source, 'hint') && { hint: field(source, 'hint') }),
    ...(status && { status }),
    ...cleanExtra(ctx.extra),
  };

  return {
    error,
    level: ctx.level ?? (kind === 'network' ? 'warning' : 'error'),
    tags,
    context,
    fingerprint: [ctx.flow, ctx.action, kind, code ?? groupingKey(message)],
  };
}

/** Sentry's environment: the update channel the app listens to, or development on a dev machine. */
export function sentryEnvironment(channel: string | null | undefined, isDev: boolean): string {
  if (isDev || !channel) return 'development';
  return channel;
}
