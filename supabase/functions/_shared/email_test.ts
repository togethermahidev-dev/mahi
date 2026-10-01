// deno test supabase/functions/_shared/email_test.ts
import { assert } from "jsr:@std/assert@1";
import { codeEmailHtml } from "./email.ts";

Deno.test("code email: every digit in its own box, with the words given", () => {
  const html = codeEmailHtml("042917", {
    title: "Reset your Mahi password",
    heading: "Choose a new password",
    intro: "Enter this code in the app to choose a new password.",
    ignoreNote: "Your password stays the same without this code.",
  });
  for (const d of "042917") assert(html.includes(`>${d}</span>`));
  assert(html.includes("<title>Reset your Mahi password</title>"));
  assert(html.includes("Choose a new password"));
  assert(html.includes("Enter this code in the app to choose a new password."));
  assert(html.includes("Your password stays the same without this code."));
  assert(html.includes("10 minutes"));
});
