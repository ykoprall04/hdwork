const pool = require("../config/database");

async function findUserByUsername(username) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      name,
      username,
      password_hash,
      role,
      city_id,
      is_active
    FROM users
    WHERE username = ?
    LIMIT 1
    `,
    [username],
  );

  return rows[0] || null;
}

async function findAccessById(id) {
  const [rows] = await pool.query('SELECT id, name, username, city_id, role, is_active FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

module.exports = {
  findAccessById,
  findUserByUsername,
};