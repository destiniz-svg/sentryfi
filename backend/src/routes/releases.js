const express = require("express");
const { RELEASES, current } = require("../releases");

/** What's new (/api/releases): public, the same for everyone. */
const router = express.Router();

router.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ current: current(), releases: RELEASES });
});

module.exports = router;
