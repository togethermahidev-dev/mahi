import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

// Initialize Supabase client with service role (can write to otp_codes)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Generate a random 4-digit code (1000-9999) to match the app's 4-box OTP UI
function generateOtpCode(): string {
  const code = Math.floor(1000 + Math.random() * 9000);
  return String(code);
}

// SHA256 hash helper using Web Crypto API
async function sha256(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// Send OTP email via Resend
async function sendOtpEmail(
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: "Resend API key not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: email,
        subject: "Your Mahi Verification Code",
        html: `
          <h2>Verify your email</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 8px; font-weight: bold;">${code}</h1>
          <p>This code expires in 10 minutes.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Email send error" };
  }
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
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generate 4-digit code SERVER-SIDE
    const code = generateOtpCode();
    const codeHash = await sha256(code);

    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Upsert into otp_codes: if email exists, update; otherwise insert
    // This resets attempts to 0 on resend
    const { error: dbError } = await supabase.from("otp_codes").upsert({
      email: normalizedEmail,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      created_at: new Date().toISOString(),
    });

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to store OTP" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Send email with the code
    const emailResult = await sendOtpEmail(normalizedEmail, code);
    if (!emailResult.success) {
      // Clean up the otp_codes row if email send fails
      await supabase.from("otp_codes").delete().eq("email", normalizedEmail);
      return new Response(
        JSON.stringify({ error: emailResult.error || "Failed to send email" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Success: return ok=true. NEVER return the code.
    return new Response(
      JSON.stringify({ ok: true }),
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
