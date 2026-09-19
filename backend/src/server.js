const path = require("path");
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const env = require("./config/env");
const { connectDB } = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const clientsRouter = require("./routes/clients");
const invoicesRouter = require("./routes/invoices");
const dashboardRouter = require("./routes/dashboard");
const reportsRouter = require("./routes/reports");
const settingsRouter = require("./routes/settings");
const itemsRouter = require("./routes/items");
const expensesRouter = require("./routes/expenses");
const paymentsRouter = require("./routes/payments");
const aiRouter = require("./routes/ai");
const companiesRouter = require("./routes/companies");
const billsRouter = require("./routes/bills");



const app = express();

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
app.use("/api/clients", clientsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/items", itemsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/ai", aiRouter);
// The ledger side. Everything below here is scoped to a company by
// requireCompany, and every write goes through asCompany so the database
// knows whose books it is touching.
app.use("/api/companies", companiesRouter);
app.use("/api/bills", billsRouter);


// In production the API also serves the built web app, so Railway runs one
// service. Anything that is not /api falls through to the single page app.
if (env.isProd) {
  const clientDir = path.resolve(__dirname, "../../frontend/dist");

  // Gzip before serving. Without this the browser is sent the whole 2.3 MB
  // bundle uncompressed; with it, about 780 KB. That difference is most of a
  // minute on a phone with one bar on a jetty, which is where this app is
  // meant to be used.
  app.use(compression());
  app.use(express.static(clientDir, { maxAge: "1h", index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
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
