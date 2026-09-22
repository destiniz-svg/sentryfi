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

// Standard security headers. contentSecurityPolicy is off deliberately: the
// front end inlines styles, and a CSP that is subtly wrong gets switched off
// in a panic the first time it breaks a page. It belongs in its own change,
// measured against the real app.
app.use(helmet({ contentSecurityPolicy: false }));

app.set("trust proxy", 1);
// The web app is served from this same origin in production, so no
// cross-origin credentialed request is legitimate. In development the Vite
// server runs on another port, so the configured allow-list applies there.
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin and server-to-server
      if (env.clientOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan("dev"));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/settings", settingsRouter);
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
