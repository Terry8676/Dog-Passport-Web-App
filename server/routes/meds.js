const express = require("express");
const pool = require("../db");
const { toId, parseCount } = require("../access");
const router = express.Router();

const STATUSES = ["given", "skipped", "unable"];

function notFound(res) {
  return res.status(404).json({ error: "Medication not found" });
}

// History for one medication (any member of its dog)
router.get("/:id/logs", async (req, res) => {
  const medId = toId(req.params.id);
  if (!medId) return notFound(res);
  try {
    const access = await pool.query(
      `SELECT 1 FROM medications m
       JOIN dog_members dm ON dm.dog_id = m.dog_id AND dm.user_id = $2
       WHERE m.id = $1`,
      [medId, req.user.id]
    );
    if (!access.rows.length) return notFound(res);
    const { rows } = await pool.query(
      `SELECT l.id, l.status, l.note, l.pills_used, l.logged_at,
              u.email AS logged_by_email
       FROM med_logs l
       LEFT JOIN users u ON u.id = l.logged_by
       WHERE l.medication_id = $1
       ORDER BY l.logged_at DESC
       LIMIT 50`,
      [medId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load logs" });
  }
});

// Record given / skipped / unable (owner or sitter); subtracts pills when given
router.post("/:id/logs", async (req, res) => {
  const medId = toId(req.params.id);
  if (!medId) return notFound(res);
  const b = req.body || {};
  if (!STATUSES.includes(b.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const note = b.note ? String(b.note).trim().slice(0, 500) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE locks this medication until we finish, so two people tapping
    // "Given" at the same moment can't both read the same pill count.
    const found = await client.query(
      `SELECT m.id, m.pills_per_dose, m.pills_remaining
       FROM medications m
       JOIN dog_members dm ON dm.dog_id = m.dog_id AND dm.user_id = $2
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [medId, req.user.id]
    );
    const med = found.rows[0];
    if (!med) {
      await client.query("ROLLBACK");
      return notFound(res);
    }

    let used = 0;
    if (b.status === "given" && med.pills_remaining !== null) {
      used = Math.min(med.pills_per_dose, med.pills_remaining);
      if (used > 0) {
        await client.query(
          "UPDATE medications SET pills_remaining = pills_remaining - $1 WHERE id = $2",
          [used, medId]
        );
      }
    }

    const log = await client.query(
      `INSERT INTO med_logs (medication_id, status, note, logged_by, pills_used)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, note, pills_used, logged_at`,
      [medId, b.status, note, req.user.id, used]
    );
    await client.query("COMMIT");

    res.status(201).json({
      ...log.rows[0],
      logged_by_email: req.user.email,
      pills_remaining: med.pills_remaining === null ? null : med.pills_remaining - used,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not save log" });
  } finally {
    client.release();
  }
});

// Start a new bottle (owner only): resets total and remaining
router.post("/:id/refill", async (req, res) => {
  const medId = toId(req.params.id);
  if (!medId) return notFound(res);
  const pills = parseCount((req.body || {}).pills, { min: 1, max: 10000 });
  if (pills === null || Number.isNaN(pills)) {
    return res.status(400).json({ error: "Enter how many pills are in the bottle" });
  }
  try {
    const who = await pool.query(
      `SELECT dm.role FROM medications m
       JOIN dog_members dm ON dm.dog_id = m.dog_id AND dm.user_id = $2
       WHERE m.id = $1`,
      [medId, req.user.id]
    );
    if (!who.rows[0]) return notFound(res);
    if (who.rows[0].role !== "owner") {
      return res.status(403).json({ error: "Only the owner can change the pill count" });
    }
    const { rows } = await pool.query(
      `UPDATE medications SET pills_total = $1, pills_remaining = $1
       WHERE id = $2
       RETURNING id, pills_total, pills_remaining`,
      [pills, medId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the bottle" });
  }
});

module.exports = router;
