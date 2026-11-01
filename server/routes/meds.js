const express = require("express");
const pool = require("../db");
const router = express.Router();

// Every route here runs behind requireAuth, so req.user is set.

async function ownsMed(medId, userId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM medications WHERE id = $1 AND owner_id = $2",
    [medId, userId]
  );
  return rows.length > 0;
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM medications WHERE owner_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load medications" });
  }
});

router.post("/", async (req, res) => {
  const { dog_name, name, dose, schedule } = req.body;
  if (!dog_name || !name) {
    return res.status(400).json({ error: "dog_name and name are required" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO medications (dog_name, name, dose, schedule, owner_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [dog_name, name, dose, schedule, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save medication" });
  }
});

router.post("/:id/logs", async (req, res) => {
  const { status, note } = req.body;
  if (!["given", "skipped", "unable"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    if (!(await ownsMed(req.params.id, req.user.id))) {
      return res.status(404).json({ error: "Medication not found" });
    }
    const { rows } = await pool.query(
      `INSERT INTO med_logs (medication_id, status, note)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, status, note]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save log" });
  }
});

router.get("/:id/logs", async (req, res) => {
  try {
    if (!(await ownsMed(req.params.id, req.user.id))) {
      return res.status(404).json({ error: "Medication not found" });
    }
    const { rows } = await pool.query(
      "SELECT * FROM med_logs WHERE medication_id = $1 ORDER BY logged_at DESC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load logs" });
  }
});

module.exports = router;
