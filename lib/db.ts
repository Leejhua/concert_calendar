import { Pool } from 'pg';
import { Concert } from './damai-crawler';

// --- Connection Pool ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// --- Schema Initialization ---
let initialized = false;

async function ensureTable(): Promise<void> {
    if (initialized) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS concerts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            image TEXT DEFAULT '',
            date TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT '',
            venue TEXT DEFAULT '',
            price TEXT DEFAULT '',
            status TEXT DEFAULT 'Unknown',
            category TEXT DEFAULT 'Concert',
            artist TEXT DEFAULT '',
            is_tribute BOOLEAN DEFAULT FALSE,
            is_famous BOOLEAN DEFAULT TRUE,
            updated_at BIGINT DEFAULT 0
        )
    `);

    // Index for common queries
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_concerts_date ON concerts (date)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_concerts_city ON concerts (city)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_concerts_artist ON concerts (artist)
    `);

    initialized = true;
}

// --- Helpers ---

function concertToRow(c: Concert) {
    return [
        c.id,
        c.title,
        c.image || '',
        c.date,
        c.city || '',
        c.venue || '',
        c.price || '',
        c.status || 'Unknown',
        c.category || 'Concert',
        c.artist || '',
        c.is_tribute || false,
        c.is_famous !== undefined ? c.is_famous : true,
        c.updatedAt || Date.now(),
    ];
}

function rowToConcert(row: any): Concert {
    return {
        id: row.id,
        title: row.title,
        image: row.image || '',
        date: row.date,
        city: row.city || '',
        venue: row.venue || '',
        price: row.price || '',
        status: row.status || 'Unknown',
        category: row.category || 'Concert',
        artist: row.artist || '',
        is_tribute: row.is_tribute || false,
        is_famous: row.is_famous !== undefined ? row.is_famous : true,
        updatedAt: Number(row.updated_at) || 0,
    };
}

// --- Public API (same interface as before) ---

/**
 * Save all concerts (upsert). Replaces existing records by id.
 */
export async function saveConcertsToStorage(concerts: Concert[]): Promise<void> {
    await ensureTable();

    if (concerts.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Batch upsert in chunks of 100
        const CHUNK_SIZE = 100;
        for (let i = 0; i < concerts.length; i += CHUNK_SIZE) {
            const chunk = concerts.slice(i, i + CHUNK_SIZE);

            const values: any[] = [];
            const placeholders: string[] = [];

            chunk.forEach((c, idx) => {
                const offset = idx * 13;
                placeholders.push(
                    `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`
                );
                values.push(...concertToRow(c));
            });

            await client.query(`
                INSERT INTO concerts (id, title, image, date, city, venue, price, status, category, artist, is_tribute, is_famous, updated_at)
                VALUES ${placeholders.join(', ')}
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    image = EXCLUDED.image,
                    date = EXCLUDED.date,
                    city = EXCLUDED.city,
                    venue = EXCLUDED.venue,
                    price = EXCLUDED.price,
                    status = EXCLUDED.status,
                    category = EXCLUDED.category,
                    artist = EXCLUDED.artist,
                    is_tribute = EXCLUDED.is_tribute,
                    is_famous = EXCLUDED.is_famous,
                    updated_at = EXCLUDED.updated_at
            `, values);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Read all concerts from the database
 */
export async function getAllConcertsFromStorage(): Promise<Concert[]> {
    await ensureTable();
    const result = await pool.query('SELECT * FROM concerts ORDER BY date ASC');
    return result.rows.map(rowToConcert);
}

/**
 * Read concerts for a specific month (YYYY-MM)
 */
export async function getConcertsByMonth(month: string): Promise<Concert[]> {
    await ensureTable();

    // Match dates starting with the month pattern (e.g. "2026-04" or "2026.04")
    const dashPattern = `${month}%`;
    const dotPattern = `${month.replace('-', '.')}%`;

    const result = await pool.query(
        `SELECT * FROM concerts WHERE date LIKE $1 OR date LIKE $2 ORDER BY date ASC`,
        [dashPattern, dotPattern]
    );
    return result.rows.map(rowToConcert);
}

/**
 * Delete all concerts (used for 'replace' mode uploads)
 */
export async function clearAllConcerts(): Promise<void> {
    await ensureTable();
    await pool.query('DELETE FROM concerts');
}

/**
 * Get total concert count
 */
export async function getConcertCount(): Promise<number> {
    await ensureTable();
    const result = await pool.query('SELECT COUNT(*) as count FROM concerts');
    return parseInt(result.rows[0].count, 10);
}
