// Sign in with Apple, the server side: the client secret Apple wants on every call, the form
// bodies for https://appleid.apple.com/auth/token (swap the app's one-time authorization code for
// a refresh token) and /auth/revoke (revoke that refresh token when the account is deleted, App
// Store guideline 5.1.1(v)), and the rule for when to revoke. Used by apple-token and
// delete-account. Tests: apple_test.ts.
//
// Secrets (Supabase function secrets, never in code): APPLE_TEAM_ID, APPLE_KEY_ID,
// APPLE_PRIVATE_KEY (the whole .p8 file), APPLE_CLIENT_ID (optional, defaults to com.mahi.app).

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";
const DEFAULT_CLIENT_ID = "com.mahi.app";
// Apple allows up to six months; each secret here is made for one call, so ten minutes is plenty.
export const MAX_SECRET_SECONDS = 600;

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string };

/** The Apple secrets, or null when any is missing (the callers then answer 503 / skip revoking). */
export function appleConfig(get: (key: string) => string | undefined): AppleConfig | null {
  const read = (k: string) => (get(k) ?? "").trim();
  const teamId = read("APPLE_TEAM_ID");
  const keyId = read("APPLE_KEY_ID");
  const privateKey = read("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientId: read("APPLE_CLIENT_ID") || DEFAULT_CLIENT_ID };
}

/** The client secret's JWT header and claims, as Apple's "Creating a client secret" lists them. */
export function clientSecretParts(cfg: AppleConfig, nowSeconds: number) {
  return {
    header: { alg: "ES256", kid: cfg.keyId },
    payload: {
      iss: cfg.teamId,
      iat: nowSeconds,
      exp: nowSeconds + MAX_SECRET_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: cfg.clientId,
    },
  };
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The .p8 file is a PEM PKCS#8 P-256 key. A key pasted with literal "\n" is accepted too.
async function importP8(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** The signed client secret (ES256). Web Crypto's ECDSA signature is raw r||s, which JWS wants. */
export async function clientSecret(
  cfg: AppleConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const { header, payload } = clientSecretParts(cfg, nowSeconds);
  const enc = new TextEncoder();
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await importP8(cfg.privateKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

/** /auth/token body for the app's authorization code. No redirect_uri: native sign-in sends none. */
export function tokenForm(cfg: AppleConfig, secret: string, code: string): string {
  return new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: secret,
    code,
    grant_type: "authorization_code",
  }).toString();
}

/** /auth/revoke body for a kept refresh token. */
export function revokeForm(cfg: AppleConfig, secret: string, refreshToken: string): string {
  return new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: secret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  }).toString();
}

/** What delete-account does about Apple: nothing kept → skip; kept but no secrets → report it. */
export function revokePlan(input: {
  refreshToken: string | null;
  configured: boolean;
}): "revoke" | "skip" | "not_configured" {
  if (!input.refreshToken) return "skip";
  return input.configured ? "revoke" : "not_configured";
}

/** POSTs a form to Apple. Apple answers 200 on success; anything else is a failure. */
export async function postToApple(
  url: string,
  body: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}
