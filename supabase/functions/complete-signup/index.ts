import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.2";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

// Initialize Supabase client with service role (can create auth users, read/write otp_codes)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// SHA256 hash helper using Web Crypto API
async function sha256(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

Deno.serve(async (req: Request) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const { email, password, code } = body;

    // Validate inputs
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4-digit code to match the app's 4-box OTP UI
    if (!code || typeof code !== "string" || code.length !== 4 || !/^\d+$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "Valid 4-digit code required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const codeHash = await sha256(code);
    const now = new Date();

    // ===== STEP 1: Verify the OTP code =====
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("code_hash, expires_at, attempts")
      .eq("email", normalizedEmail)
      .single();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification code" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if code has expired
    if (new Date(otpRecord.expires_at) < now) {
      // Clean up expired record
      await supabase.from("otp_codes").delete().eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ error: "Verification code has expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if too many failed attempts
    if (otpRecord.attempts >= 5) {
      // Clean up after too many attempts
      await supabase.from("otp_codes").delete().eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Please request a new code." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if code matches (compare hashes)
    if (otpRecord.code_hash !== codeHash) {
      // Increment attempts and return error
      const newAttempts = otpRecord.attempts + 1;
      await supabase
        .from("otp_codes")
        .update({ attempts: newAttempts })
        .eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ error: "Incorrect verification code" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ===== STEP 2: Create auth user with email confirmed =====
    const { data: authData, error: authError } = await supabase.auth.admin.createUser(
      {
        email: normalizedEmail,
        password: password,
        email_confirm: true, // Mark email as confirmed immediately
      },
    );

    if (authError || !authData.user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: authError?.message || "Failed to create account" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // ===== STEP 3: Delete OTP record (cleanup) =====
    await supabase.from("otp_codes").delete().eq("email", normalizedEmail);

    // ===== STEP 4: Return success with user info =====
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
