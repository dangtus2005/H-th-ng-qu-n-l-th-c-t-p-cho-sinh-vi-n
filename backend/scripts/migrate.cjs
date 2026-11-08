const path = require('node:path');
const fs = require('node:fs/promises');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
(async () => {
  try {
    const directory = path.join(__dirname, '../migrations');
    for (const file of (await fs.readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await pool.query(await fs.readFile(path.join(directory, file), 'utf8'));
      console.log(`Migration ${file} applied`);
    }
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
