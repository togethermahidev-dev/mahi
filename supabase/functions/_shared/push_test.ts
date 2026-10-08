// deno test supabase/functions/_shared/push_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { expoHeaders } from "./push.ts";

Deno.test("no access token: the same JSON headers as before", () => {
  const plain = { "Content-Type": "application/json", Accept: "application/json" };
  assertEquals(expoHeaders(undefined), plain);
  assertEquals(expoHeaders(""), plain);
  assertEquals(expoHeaders("   "), plain);
});

Deno.test("with EXPO_ACCESS_TOKEN set, Expo gets it as a bearer token", () => {
  assertEquals(expoHeaders(" tok_123 "), {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Bearer tok_123",
  });
});
