const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;

if (DATABASE_URL) {
    pool = new Pool({ connectionString: DATABASE_URL });
    pool.on('error', (err) => {
        console.error('Unexpected database pool error:', err.message);
    });
} else {
    console.warn('DATABASE_URL not set — database features disabled');
}

async function query(text, params) {
    if (!pool) throw new Error('Database not configured');
    return pool.query(text, params);
}

async function getClient() {
    if (!pool) throw new Error('Database not configured');
    return pool.connect();
}

async function runMigrations() {
    if (!pool) {
        console.warn('Skipping migrations — DATABASE_URL not set');
        return;
    }

    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT now()
            )
        `);

        const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
        const applied = new Set(rows.map(r => r.version));

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const version = parseInt(file.split('-')[0], 10);
            if (isNaN(version) || applied.has(version)) continue;

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            console.log(`Applying migration ${file}...`);

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('COMMIT');
                console.log(`Migration ${file} applied.`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw new Error(`Migration ${file} failed: ${err.message}`);
            }
        }
    } finally {
        client.release();
    }
}

async function close() {
    if (pool) await pool.end();
}

module.exports = { query, getClient, runMigrations, close, get pool() { return pool; } };
