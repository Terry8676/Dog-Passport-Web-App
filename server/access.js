const pool = require("./db");

// Turn a URL value like "7" into a safe integer, or null if it isn't one.
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
}

// Returns "owner", "sitter", or null if this user has no access to the dog.
async function getRole(dogId, userId) {
  const { rows } = await pool.query(
    "SELECT role FROM dog_members WHERE dog_id = $1 AND user_id = $2",
    [dogId, userId]
  );
  return rows[0] ? rows[0].role : null;
}

// Blank -> null (not provided). Valid whole number -> number. Anything else -> NaN.
function parseCount(value, { min = 0, max = 100000 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}

module.exports = { toId, getRole, parseCount };
