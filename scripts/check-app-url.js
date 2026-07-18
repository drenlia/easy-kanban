import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'kanban',
  user: process.env.POSTGRES_USER || 'kanban_user',
  password: process.env.POSTGRES_PASSWORD || 'kanban_password',
});

try {
  const result = await pool.query("SELECT key, value FROM settings WHERE key = 'APP_URL'");
  if (result.rows.length > 0) {
    console.log('APP_URL:', result.rows[0].value);
  } else {
    console.log('APP_URL: Not set in database');
  }
  await pool.end();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}


