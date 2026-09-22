const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { pool } = require("../config/db");
const backup = require("../backup");
const s3 = require("../backup/s3");

/**
 * Whether the books are backed up, and proven to restore.
 *
 * ponytail: backups are of the whole system, so any company's administrator
 * sees the same runs; move this to a platform-owner role once there are
 * companies that are not ours.
 */

const router = express.Router();
router.use(requireAuth, requireCompany, requireCan("manage_settings"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, started_at, finished_at, bytes, companies, entries, restored, ok, problem
         FROM backup_runs ORDER BY started_at DESC LIMIT 14`
    );
    const missing = s3.config().missing;
    if (!process.env.BACKUP_KEY) missing.push("BACKUP_KEY");
    res.json({ setUp: missing.length === 0, missing, runs: rows });
  })
);

let running = null;

/** Starts one now. Answers at once; the page asks again for the result. */
router.post(
  "/run",
  asyncHandler(async (req, res) => {
    if (!running) running = backup.run().finally(() => (running = null));
    res.status(202).json({ started: true });
  })
);

module.exports = router;
