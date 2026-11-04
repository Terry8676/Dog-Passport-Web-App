const express = require("express");
const pool = require("../db");
const router = express.Router();

router.post("/redeem", async (req, res) => {
  const code = String((req.body || {}).code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!code) return res.status(400).json({ error: "Enter an invite code" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invite = await client.query(
      `SELECT i.dog_id, d.name
       FROM invites i JOIN dogs d ON d.id = i.dog_id
       WHERE i.code = $1 AND i.used_at IS NULL AND i.expires_at > now()
       FOR UPDATE OF i`,
      [code]
    );
    if (!invite.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "That code is invalid or has expired" });
    }
    const { dog_id, name } = invite.rows[0];

    const existing = await client.query(
      "SELECT 1 FROM dog_members WHERE dog_id = $1 AND user_id = $2",
      [dog_id, req.user.id]
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "You already have access to this dog" });
    }

    await client.query(
      "INSERT INTO dog_members (dog_id, user_id, role) VALUES ($1, $2, 'sitter')",
      [dog_id, req.user.id]
    );
    await client.query(
      "UPDATE invites SET used_at = now(), used_by = $2 WHERE code = $1",
      [code, req.user.id]
    );
    await client.query("COMMIT");
    res.json({ id: dog_id, name, role: "sitter" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not use that code" });
  } finally {
    client.release();
  }
});

module.exports = router;
