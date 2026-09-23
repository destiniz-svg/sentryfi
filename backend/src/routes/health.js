const express = require("express");
const { pool } = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
  let db = "unknown";
  try {
    await pool.query("SELECT 1");
    db = "connected";
  } catch {
    db = "disconnected";
  }
  res.json({
    status: "ok",
    uptime: process.uptime(),
    db,
    timestamp: new Date().toISOString(),
  });
});

/**
 * The public status (the trust page reads it): is the app up, is the database
 * answering, and when the last backup was restored and proven. Nothing about
 * any company: no counts, no names.
 */
router.get("/status", async (req, res) => {
  let db = "unknown";
  let backup = null;
  try {
    await pool.query("SELECT 1");
    db = "connected";
    const { rows } = await pool.query("SELECT finished_at FROM backup_runs WHERE ok AND restored ORDER BY started_at DESC LIMIT 1");
    backup = rows[0]?.finished_at || null;
  } catch {
    db = "disconnected";
  }
  res.set("Cache-Control", "no-store");
  res.json({ app: "up", database: db, lastProvenBackup: backup, checkedAt: new Date().toISOString() });
});

module.exports = router;
