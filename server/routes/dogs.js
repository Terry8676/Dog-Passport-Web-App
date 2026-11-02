const crypto = require("crypto");
const express = require("express");
const pool = require("../db");
const { toId, getRole, parseCount } = require("../access");
const router = express.Router();

// Resolves the dog from the URL and the caller's role, or sends a 404.
// A 404 (not 403) means outsiders can't tell whether a dog exists.
async function access(req, res) {
  const dogId = toId(req.params.id);
  const role = dogId ? await getRole(dogId, req.user.id) : null;
  if (!role) {
    res.status(404).json({ error: "Dog not found" });
    return null;
  }
  return { dogId, role };
}

function fail(res, err, message) {
  console.error(err);
  res.status(500).json({ error: message });
}

// Every dog this user owns or sits for
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, dm.role
       FROM dogs d JOIN dog_members dm ON dm.dog_id = d.id
       WHERE dm.user_id = $1
       ORDER BY d.name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    fail(res, err, "Could not load dogs");
  }
});

// Create a dog (the creator becomes its owner)
router.post("/", async (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name || name.length > 60) {
    return res.status(400).json({ error: "Enter a dog name (60 characters max)" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dog = await client.query(
      "INSERT INTO dogs (name, owner_id) VALUES ($1, $2) RETURNING id, name",
      [name, req.user.id]
    );
    await client.query(
      "INSERT INTO dog_members (dog_id, user_id, role) VALUES ($1, $2, 'owner')",
      [dog.rows[0].id, req.user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ ...dog.rows[0], role: "owner" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(res, err, "Could not create dog");
  } finally {
    client.release();
  }
});

// Who is linked to this dog
router.get("/:id/members", async (req, res) => {
  const a = await access(req, res);
  if (!a) return;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, dm.role, dm.joined_at
       FROM dog_members dm JOIN users u ON u.id = dm.user_id
       WHERE dm.dog_id = $1
       ORDER BY (dm.role = 'owner') DESC, u.email`,
      [a.dogId]
    );
    res.json(rows);
  } catch (err) {
    fail(res, err, "Could not load members");
  }
});

// Owner creates a single-use invite code
router.post("/:id/invites", async (req, res) => {
  const a = await access(req, res);
  if (!a) return;
  if (a.role !== "owner") {
    return res.status(403).json({ error: "Only the owner can invite sitters" });
  }
  try {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO invites (code, dog_id, created_by, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days')
       RETURNING code, expires_at`,
      [code, a.dogId, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    fail(res, err, "Could not create invite");
  }
});

// Owner removes a sitter, or a sitter removes themselves
router.delete("/:id/members/:userId", async (req, res) => {
  const a = await access(req, res);
  if (!a) return;
  const targetId = toId(req.params.userId);
  if (!targetId) return res.status(404).json({ error: "Member not found" });
  if (a.role !== "owner" && targetId !== req.user.id) {
    return res.status(403).json({ error: "Only the owner can remove other people" });
  }
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM dog_members WHERE dog_id = $1 AND user_id = $2 AND role = 'sitter'",
      [a.dogId, targetId]
    );
    if (!rowCount) return res.status(404).json({ error: "Sitter not found" });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "Could not remove member");
  }
});

// Medications for one dog (owner or sitter)
router.get("/:id/meds", async (req, res) => {
  const a = await access(req, res);
  if (!a) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, dog_id, name, dose, schedule, pills_per_dose,
              pills_total, pills_remaining, created_at
       FROM medications WHERE dog_id = $1
       ORDER BY created_at DESC`,
      [a.dogId]
    );
    res.json(rows);
  } catch (err) {
    fail(res, err, "Could not load medications");
  }
});

// Add a medication (owner only)
router.post("/:id/meds", async (req, res) => {
  const a = await access(req, res);
  if (!a) return;
  if (a.role !== "owner") {
    return res.status(403).json({ error: "Only the owner can add medications" });
  }
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name || name.length > 100) {
    return res.status(400).json({ error: "Enter a medication name" });
  }
  const dose = b.dose ? String(b.dose).trim().slice(0, 100) : null;
  const schedule = b.schedule ? String(b.schedule).trim().slice(0, 100) : null;
  const perDose = parseCount(b.pills_per_dose, { min: 1, max: 100 });
  const total = parseCount(b.pills_total, { min: 0, max: 10000 });
  if (Number.isNaN(perDose) || Number.isNaN(total)) {
    return res.status(400).json({ error: "Pill counts must be whole numbers" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO medications
         (dog_id, name, dose, schedule, pills_per_dose, pills_total, pills_remaining, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       RETURNING id, dog_id, name, dose, schedule, pills_per_dose,
                 pills_total, pills_remaining, created_at`,
      [a.dogId, name, dose, schedule, perDose ?? 1, total, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    fail(res, err, "Could not save medication");
  }
});

module.exports = router;
