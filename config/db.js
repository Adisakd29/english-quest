const { Pool } = require('pg');

// Railway's PostgreSQL plugin injects DATABASE_URL automatically.
// SSL is required on Railway's managed Postgres but not on most local setups,
// so we enable it conditionally based on NODE_ENV / the connection string.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[db] DATABASE_URL is not set. Add a PostgreSQL plugin on Railway, or set DATABASE_URL in .env for local dev.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

module.exports = pool;
