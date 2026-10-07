// deno test supabase/functions/_shared/apple_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  appleConfig,
  clientSecret,
  clientSecretParts,
  MAX_SECRET_SECONDS,
  revokeForm,
  revokePlan,
  tokenForm,
} from "./apple.ts";

const cfg = { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: "unused", clientId: "com.mahi.app" };

function env(values: Record<string, string>) {
  return (k: string) => values[k];
}

Deno.test("config: all three secrets present, client id defaults to com.mahi.app", () => {
  assertEquals(
    appleConfig(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P" })),
    { teamId: "T", keyId: "K", privateKey: "P", clientId: "com.mahi.app" },
  );
  assertEquals(
    appleConfig(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P", APPLE_CLIENT_ID: "x.y" }))
      ?.clientId,
    "x.y",
  );
});

Deno.test("config: any missing or blank secret means not configured", () => {
  assertEquals(appleConfig(env({ APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P" })), null);
  assertEquals(appleConfig(env({ APPLE_TEAM_ID: "T", APPLE_PRIVATE_KEY: "P" })), null);
  assertEquals(appleConfig(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "  " })), null);
});

Deno.test("client secret header and claims follow Apple's rules", () => {
  const { header, payload } = clientSecretParts(cfg, 1_800_000_000);
  assertEquals(header, { alg: "ES256", kid: "KEY1234567" });
  assertEquals(payload, {
    iss: "TEAM123456",
    iat: 1_800_000_000,
    exp: 1_800_000_000 + MAX_SECRET_SECONDS,
    aud: "https://appleid.apple.com",
    sub: "com.mahi.app",
  });
  assert(MAX_SECRET_SECONDS <= 3600, "the secret lives an hour at most");
});

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function p8(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join("\n");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

Deno.test("client secret is an ES256 JWT that verifies with the key's public half", async () => {
  const { pem, publicKey } = await p8();
  const jwt = await clientSecret({ ...cfg, privateKey: pem }, 1_800_000_000);
  const [h, p, s] = jwt.split(".");
  assertEquals(JSON.parse(new TextDecoder().decode(fromB64url(h))), { alg: "ES256", kid: "KEY1234567" });
  assertEquals(JSON.parse(new TextDecoder().decode(fromB64url(p))).sub, "com.mahi.app");
  const sig = fromB64url(s);
  assertEquals(sig.length, 64, "raw r||s, as JWS wants");
  assert(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    ),
  );
  assertEquals(b64url(fromB64url(s)), s);
});

Deno.test("a key pasted with literal \\n line breaks still works", async () => {
  const { pem } = await p8();
  const jwt = await clientSecret({ ...cfg, privateKey: pem.replace(/\n/g, "\\n") }, 1_800_000_000);
  assertEquals(jwt.split(".").length, 3);
});

Deno.test("token form: authorization code grant, no redirect uri (native sign-in)", () => {
  const form = new URLSearchParams(tokenForm(cfg, "SECRET", "CODE"));
  assertEquals(Object.fromEntries(form), {
    client_id: "com.mahi.app",
    client_secret: "SECRET",
    code: "CODE",
    grant_type: "authorization_code",
  });
});

Deno.test("revoke form: the refresh token with its hint", () => {
  const form = new URLSearchParams(revokeForm(cfg, "SECRET", "RT"));
  assertEquals(Object.fromEntries(form), {
    client_id: "com.mahi.app",
    client_secret: "SECRET",
    token: "RT",
    token_type_hint: "refresh_token",
  });
});

Deno.test("revoke or skip", () => {
  assertEquals(revokePlan({ refreshToken: null, configured: true }), "skip");
  assertEquals(revokePlan({ refreshToken: "", configured: false }), "skip");
  assertEquals(revokePlan({ refreshToken: "RT", configured: false }), "not_configured");
  assertEquals(revokePlan({ refreshToken: "RT", configured: true }), "revoke");
});
