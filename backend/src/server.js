const path = require("path");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const env = require("./config/env");
const { connectDB } = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const settingsRouter = require("./routes/settings");
const invitesRouter = require("./routes/invites");
const backupsRouter = require("./routes/backups");
const itemsRouter = require("./routes/items");
const companiesRouter = require("./routes/companies");
const billsRouter = require("./routes/bills");
const attentionRouter = require("./routes/attention");
const attachmentsRouter = require("./routes/attachments");
const figuresRouter = require("./routes/figures");
const cashRouter = require("./routes/cash");
const bankRouter = require("./routes/bank");
const periodsRouter = require("./routes/periods");
const statementsRouter = require("./routes/statements");
const taxRouter = require("./routes/tax");
const gstRouter = require("./routes/gst");
const importsRouter = require("./routes/imports");
const zohoRouter = require("./routes/zoho");
const salesRouter = require("./routes/sales");



const app = express();

// Standard security headers. The content security policy was watched in
// report-only mode first, and enforced once every page, signed in and public,
// on the desk and the phone, ran without a single report (23 September 2026).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  })
);

app.set("trust proxy", 1);
// The web app is served from this same origin in production, so no
// cross-origin credentialed request is legitimate. In development the Vite
// server runs on another port, so the configured allow-list applies there.
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin and server-to-server
      if (env.clientOrigins.includes(origin)) return cb(null, true);
      // The developer portal is this same app on its own subdomain.
      if (origin === `https://${env.portalHost}`) return cb(null, true);
      // A refusal, not a failure: 403 rather than a 500 in the logs.
      return cb(require("./utils/ApiError").forbidden("Origin not allowed"), false);
    },
    credentials: true,
  })
);
// Before the JSON parser: the webhook's signature is over the raw bytes.
app.use("/api/inbound", require("./routes/inbound"));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
// A write sent with its own key happens once, however often a weak signal resends it.
app.use("/api", require("./middleware/idempotency").idempotency);
// An assistant's key: where it may go and what it may write (middleware/apiKey.js).
app.use("/api", require("./middleware/apiKey").keyGate);
if (!env.isProd) app.use(morgan("dev"));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/passkeys", require("./routes/passkeys"));
app.use("/api/settings", settingsRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/backups", backupsRouter);
app.use("/api/platform", require("./routes/platform"));
app.use("/api/items", itemsRouter);
// The ledger side. Everything below here is scoped to a company by
// requireCompany, and every write goes through asCompany so the database
// knows whose books it is touching.
app.use("/api/companies", companiesRouter);
app.use("/api/bills", billsRouter);
app.use("/api/attention", attentionRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/figures", figuresRouter);
app.use("/api/cash", cashRouter);
app.use("/api/bank", bankRouter);
app.use("/api/periods", periodsRouter);
app.use("/api/assets", require("./routes/assets"));
app.use("/api/loans", require("./routes/loans"));
app.use("/api/dimensions", require("./routes/dimensions"));
app.use("/api/stock", require("./routes/stock"));
app.use("/api/shipments", require("./routes/shipments"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/recurring", require("./routes/recurring"));
app.use("/api", require("./routes/claims"));
app.use("/api/portal", require("./routes/portal").publicRouter);
app.use("/api/cfo", require("./routes/cfo"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/verify", require("./routes/documents").verify);
app.use("/api/keys", require("./routes/keys"));
app.use("/api/openapi.json", require("./routes/openapi"));
app.use("/api/mcp", require("./routes/mcp"));
app.use("/api/practice", require("./routes/practice"));
app.use("/api/webhooks", require("./routes/webhooks"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/push", require("./routes/notifications").devices);
app.use("/api/portal-links", require("./routes/portal"));
app.use("/api/statements", statementsRouter);
app.use("/api/tax", taxRouter);
app.use("/api/gst", gstRouter);
app.use("/api/imports", importsRouter);
app.use("/api/zoho", zohoRouter);
app.use("/api/sales", salesRouter);


// In production the API also serves the built web app, so Railway runs one
// service. Anything that is not /api falls through to the single page app.
if (env.isProd) {
  const clientDir = path.resolve(__dirname, "../../frontend/dist");

  // Gzip before serving. Without this the browser is sent the whole 2.3 MB
  // bundle uncompressed; with it, about 780 KB. That difference is most of a
  // minute on a phone with one bar on a jetty, which is where this app is
  // meant to be used.
  app.use(compression());

  // Two kinds of file, two answers. Everything under /assets carries a hash of
  // its own contents in its name, so it can be kept for a year and a new build
  // simply has different names. Everything else — the page, the service
  // worker, the manifest — has a fixed name, so it must be revalidated or a
  // phone would sit on a stale shell and a fix would never arrive.
  const forever = { maxAge: "1y", immutable: true };
  const check = { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") };

  app.use("/assets", express.static(path.join(clientDir, "assets"), forever));
  app.use(express.static(clientDir, { index: false, ...check }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // The service worker serves this offline; online it must always be checked,
    // or a phone keeps loading an old app against a new server.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDB();
    app.listen(env.port, () => {
      console.log(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`);
      require("./backup").schedule();
      require("./routes/recurring").schedule();
      require("./routes/cfo").schedule();
      require("./routes/notifications").schedule();
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

start();

module.exports = app;
