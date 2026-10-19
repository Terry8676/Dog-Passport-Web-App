const express = require("express");
const pool = require("../db");
const router = express.Router();

// List all medications
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM medications ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load medications" });
  }
});

// Add a medication
router.post("/", async (req, res) => {
  const { dog_name, name, dose, schedule } = req.body;
  if (!dog_name || !name) {
    return res.status(400).json({ error: "dog_name and name are required" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO medications (dog_name, name, dose, schedule)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [dog_name, name, dose, schedule]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save medication" });
  }
});

// Log given / skipped / unable
router.post("/:id/logs", async (req, res) => {
  const { status, note } = req.body;
  if (!["given", "skipped", "unable"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
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

// History for one medication
router.get("/:id/logs", async (req, res) => {
  try {
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
