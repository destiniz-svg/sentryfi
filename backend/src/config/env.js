const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 8000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "sentryfi_token",
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // gemini-2.5-flash was retired for new API keys on 19 September 2026: the
  // API answers 404 with "no longer available to new users". Keep this
  // current, and keep it overridable, because it will happen again.
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  // Zoho Books, for bringing history in. A server-based client made at
  // api-console.zoho.com, with the redirect below registered on it.
  zohoClientId: process.env.ZOHO_CLIENT_ID || "",
  zohoClientSecret: process.env.ZOHO_CLIENT_SECRET || "",
  // Resend, for the few emails Sentryfi sends: confirming an address, a
  // forgotten password, and security alerts. Without a key nothing is sent and
  // addresses are not asked to be confirmed (local work and tests).
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendApiUrl: process.env.RESEND_API_URL || "https://api.resend.com/emails",
  // Replies to anything Sentryfi sends go to support@, which Resend receives
  // and routes/inbound.js forwards to the inbox the owner reads.
  mailReplyTo: process.env.MAIL_REPLY_TO || "Sentryfi Support <support@sentryfi.app>",
  supportForwardTo: process.env.SUPPORT_FORWARD_TO || "sentryfi.app@gmail.com",
  // A full-access key: Resend's sending-only keys cannot read received mail.
  resendReceivingKey: process.env.RESEND_RECEIVING_KEY || "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
  publicUrl: (process.env.PUBLIC_URL || "https://sentryfi.app").replace(/\/$/, ""),
  isProd: process.env.NODE_ENV === "production",
};
