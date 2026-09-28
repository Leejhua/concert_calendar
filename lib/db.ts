import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Concert } from './damai-crawler';
import { getConcertDisplayArtist, normalizeConcertRecord } from './concert-identity';
import { buildConcertMetadata } from './concert-utils';
import { buildProjectTasks } from './project-template';
import {
    Contact,
    FollowUp,
    OpportunityStatus,
    Project,
    ProjectPriority,
    ProjectStage,
    ProjectStatus,
    ProjectTask,
    ProjectTaskStatus,
} from './types';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

let initialized = false;

type PoolClientLike = {
    query: Pool['query'];
};

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
            raw_title TEXT DEFAULT '',
            raw_artist_tag TEXT DEFAULT '',
            artist_primary TEXT DEFAULT '',
            artist_all JSONB DEFAULT '[]'::jsonb,
            event_type TEXT DEFAULT 'unknown',
            artist_confidence DOUBLE PRECISION DEFAULT 0,
            artist_source TEXT DEFAULT 'unknown',
            is_tribute BOOLEAN DEFAULT FALSE,
            is_famous BOOLEAN DEFAULT TRUE,
            updated_at BIGINT DEFAULT 0,
            source TEXT DEFAULT 'damai',
            source_url TEXT DEFAULT '',
            event_date DATE,
            event_time TEXT,
            sort_at TIMESTAMP,
            opportunity_status TEXT DEFAULT 'new',
            opportunity_score INTEGER DEFAULT 0,
            opportunity_score_breakdown JSONB DEFAULT '[]'::jsonb,
            last_seen_at BIGINT DEFAULT 0,
            project_id TEXT,
            notes TEXT DEFAULT ''
        )
    `);

    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'damai'`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS event_date DATE`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS event_time TEXT`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS sort_at TIMESTAMP`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS opportunity_status TEXT DEFAULT 'new'`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS opportunity_score INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS opportunity_score_breakdown JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS last_seen_at BIGINT DEFAULT 0`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS project_id TEXT`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS raw_title TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS raw_artist_tag TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS artist_primary TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS artist_all JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'unknown'`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS artist_confidence DOUBLE PRECISION DEFAULT 0`);
    await pool.query(`ALTER TABLE concerts ADD COLUMN IF NOT EXISTS artist_source TEXT DEFAULT 'unknown'`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            concert_id TEXT UNIQUE,
            title TEXT NOT NULL,
            artist TEXT DEFAULT '',
            city TEXT DEFAULT '',
            venue TEXT DEFAULT '',
            concert_date DATE,
            status TEXT DEFAULT 'active',
            stage TEXT DEFAULT 'planning',
            owner TEXT DEFAULT '',
            priority TEXT DEFAULT 'normal',
            notes TEXT DEFAULT '',
            created_at BIGINT DEFAULT 0,
            updated_at BIGINT DEFAULT 0
        )
    `);

    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_amount DECIMAL(12,2)`);
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_follow_up_at DATE`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            task_type TEXT DEFAULT 'milestone',
            status TEXT DEFAULT 'todo',
            due_date DATE,
            relative_offset_days INTEGER,
            sort_order INTEGER DEFAULT 0,
            auto_generated BOOLEAN DEFAULT TRUE,
            notes TEXT DEFAULT '',
            completed_at BIGINT
        )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_concerts_date ON concerts (date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_concerts_city ON concerts (city)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_concerts_artist ON concerts (artist)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_concerts_event_date ON concerts (event_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_concerts_status ON concerts (opportunity_status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_projects_concert_id ON projects (concert_id)`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            role TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            wechat TEXT DEFAULT '',
            company TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at BIGINT DEFAULT 0,
            updated_at BIGINT DEFAULT 0
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS follow_ups (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            follow_up_date DATE,
            created_at BIGINT DEFAULT 0
        )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks (project_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks (due_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follow_ups_project_id ON follow_ups (project_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follow_ups_follow_up_date ON follow_ups (follow_up_date)`);

    await backfillConcertMetadata();
    initialized = true;
}

function concertToRow(c: Concert) {
    const normalizedConcert = normalizeConcertRecord(c);
    const metadata = buildConcertMetadata(normalizedConcert);

    return [
        normalizedConcert.id,
        normalizedConcert.title,
        normalizedConcert.image || '',
        normalizedConcert.date,
        normalizedConcert.city || '',
        normalizedConcert.venue || '',
        normalizedConcert.price || '',
        normalizedConcert.status || 'Unknown',
        normalizedConcert.category || 'Concert',
        getConcertDisplayArtist(normalizedConcert),
        normalizedConcert.rawTitle || normalizedConcert.title,
        normalizedConcert.rawArtistTag || '',
        normalizedConcert.artistPrimary || '',
        JSON.stringify(normalizedConcert.artistAll || []),
        normalizedConcert.eventType || 'unknown',
        normalizedConcert.artistConfidence || 0,
        normalizedConcert.artistSource || 'unknown',
        normalizedConcert.is_tribute || false,
        normalizedConcert.is_famous !== undefined ? normalizedConcert.is_famous : true,
        normalizedConcert.updatedAt || Date.now(),
        metadata.source,
        metadata.sourceUrl,
        metadata.eventDate,
        metadata.eventTime,
        metadata.sortAt,
        metadata.opportunityStatus,
        metadata.opportunityScore,
        JSON.stringify(metadata.opportunityScoreBreakdown || []),
        metadata.lastSeenAt,
        normalizedConcert.projectId || null,
        normalizedConcert.notes || '',
    ];
}

type ConcertRow = {
    id: string;
    title: string;
    image: string | null;
    date: string;
    city: string | null;
    venue: string | null;
    price: string | null;
    status: string | null;
    category: string | null;
    artist: string | null;
    raw_title: string | null;
    raw_artist_tag: string | null;
    artist_primary: string | null;
    artist_all: unknown;
    event_type: Concert['eventType'] | null;
    artist_confidence: number | string | null;
    artist_source: Concert['artistSource'] | null;
    is_tribute: boolean | null;
    is_famous: boolean | null;
    updated_at: number | string | null;
    source: Concert['source'] | null;
    source_url: string | null;
    event_date: string | Date | null;
    event_time: string | null;
    sort_at: string | Date | null;
    opportunity_status: Concert['opportunityStatus'] | null;
    opportunity_score: number | string | null;
    opportunity_score_breakdown: unknown;
    last_seen_at: number | string | null;
    project_id: string | null;
    notes: string | null;
};

type ProjectRow = {
    id: string;
    concert_id: string | null;
    title: string;
    artist: string | null;
    city: string | null;
    venue: string | null;
    concert_date: string | Date | null;
    status: ProjectStatus | null;
    stage: ProjectStage | null;
    owner: string | null;
    priority: ProjectPriority | null;
    notes: string | null;
    quote_amount: number | string | null;
    quote_status: string | null;
    next_follow_up_at: string | Date | null;
    created_at: number | string | null;
    updated_at: number | string | null;
};

type ProjectTaskRow = {
    id: string;
    project_id: string;
    title: string;
    task_type: string | null;
    status: ProjectTaskStatus | null;
    due_date: string | Date | null;
    relative_offset_days: number | null;
    sort_order: number | null;
    auto_generated: boolean | null;
    notes: string | null;
    completed_at: number | string | null;
};

type ContactRow = {
    id: string;
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    wechat: string | null;
    company: string | null;
    notes: string | null;
    created_at: number | string | null;
    updated_at: number | string | null;
};

type FollowUpRow = {
    id: string;
    project_id: string;
    content: string;
    follow_up_date: string | Date | null;
    created_at: number | string | null;
};

function rowToConcert(row: ConcertRow): Concert {
    return normalizeConcertRecord({
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
        rawTitle: row.raw_title || row.title,
        rawArtistTag: row.raw_artist_tag || '',
        artistPrimary: row.artist_primary || '',
        artistAll: parseArtistAll(row.artist_all),
        eventType: row.event_type || 'unknown',
        artistConfidence: row.artist_confidence != null ? Number(row.artist_confidence) : 0,
        artistSource: row.artist_source || 'unknown',
        is_tribute: row.is_tribute ?? false,
        is_famous: row.is_famous ?? true,
        updatedAt: Number(row.updated_at) || 0,
        source: row.source || 'damai',
        sourceUrl: row.source_url || '',
        eventDate: formatDateValue(row.event_date),
        eventTime: row.event_time || null,
        sortAt: row.sort_at ? new Date(row.sort_at).toISOString() : null,
        opportunityStatus: row.opportunity_status || 'new',
        opportunityScore: Number(row.opportunity_score) || 0,
        opportunityScoreBreakdown: parseOpportunityScoreBreakdown(row.opportunity_score_breakdown),
        lastSeenAt: Number(row.last_seen_at) || 0,
        projectId: row.project_id || null,
        notes: row.notes || '',
    });
}

function rowToProject(row: ProjectRow, tasks: ProjectTask[] = [], contacts: Contact[] = [], followUps: FollowUp[] = []): Project {
    return {
        id: row.id,
        concertId: row.concert_id || null,
        title: row.title,
        artist: row.artist || '',
        city: row.city || '',
        venue: row.venue || '',
        concertDate: formatDateValue(row.concert_date),
        status: row.status || 'active',
        stage: row.stage || 'planning',
        owner: row.owner || '',
        priority: row.priority || 'normal',
        notes: row.notes || '',
        quoteAmount: row.quote_amount != null ? Number(row.quote_amount) : null,
        quoteStatus: row.quote_status || null,
        nextFollowUpAt: formatDateValue(row.next_follow_up_at),
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
        tasks,
        contacts,
        followUps,
    };
}

function rowToContact(row: ContactRow): Contact {
    return {
        id: row.id,
        name: row.name || '',
        role: row.role || '',
        phone: row.phone || '',
        email: row.email || '',
        wechat: row.wechat || '',
        company: row.company || '',
        notes: row.notes || '',
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
    };
}

function rowToFollowUp(row: FollowUpRow): FollowUp {
    return {
        id: row.id,
        projectId: row.project_id,
        content: row.content || '',
        followUpDate: formatDateValue(row.follow_up_date),
        createdAt: Number(row.created_at) || 0,
    };
}

function rowToProjectTask(row: ProjectTaskRow): ProjectTask {
    return {
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        taskType: row.task_type || 'milestone',
        status: row.status || 'todo',
        dueDate: formatDateValue(row.due_date),
        relativeOffsetDays: row.relative_offset_days,
        sortOrder: row.sort_order || 0,
        autoGenerated: row.auto_generated ?? true,
        notes: row.notes || '',
        completedAt: row.completed_at ? Number(row.completed_at) : null,
    };
}

function parseArtistAll(value: unknown) {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
        } catch {
            return [];
        }
    }

    return [] as string[];
}

function parseOpportunityScoreBreakdown(value: unknown): Concert['opportunityScoreBreakdown'] {
    if (Array.isArray(value)) {
        return value
            .filter((item): item is { key: string; label: string; delta: number; matched: boolean } => (
                typeof item === 'object' &&
                item !== null &&
                typeof (item as { key?: unknown }).key === 'string' &&
                typeof (item as { label?: unknown }).label === 'string' &&
                typeof (item as { delta?: unknown }).delta === 'number' &&
                typeof (item as { matched?: unknown }).matched === 'boolean'
            ));
    }

    if (typeof value === 'string') {
        try {
            return parseOpportunityScoreBreakdown(JSON.parse(value));
        } catch {
            return [];
        }
    }

    return [];
}

function formatDateValue(value: string | Date | null) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

async function backfillConcertMetadata() {
    const result = await pool.query(`
        SELECT * FROM concerts
        WHERE event_date IS NULL
           OR source IS NULL
           OR sort_at IS NULL
           OR opportunity_status IS NULL
           OR last_seen_at = 0
           OR opportunity_score_breakdown IS NULL
           OR raw_title IS NULL
           OR artist_primary IS NULL
           OR artist_all IS NULL
    `);

    if (result.rows.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of result.rows) {
            const concert = rowToConcert(row);
            const metadata = buildConcertMetadata(concert, concert.updatedAt || Date.now());
            const normalizedConcert = normalizeConcertRecord(concert);
            await client.query(
                `UPDATE concerts
                 SET source = $2,
                     source_url = $3,
                     event_date = $4,
                     event_time = $5,
                     sort_at = $6,
                     opportunity_status = $7,
                     opportunity_score = $8,
                     opportunity_score_breakdown = $9::jsonb,
                     last_seen_at = $10,
                     notes = COALESCE(notes, ''),
                     artist = $11,
                     raw_title = $12,
                     raw_artist_tag = $13,
                     artist_primary = $14,
                     artist_all = $15::jsonb,
                     event_type = $16,
                     artist_confidence = $17,
                     artist_source = $18
                 WHERE id = $1`,
                [
                    concert.id,
                    metadata.source,
                    metadata.sourceUrl,
                    metadata.eventDate,
                    metadata.eventTime,
                    metadata.sortAt,
                    metadata.opportunityStatus,
                    metadata.opportunityScore,
                    JSON.stringify(metadata.opportunityScoreBreakdown || []),
                    metadata.lastSeenAt,
                    getConcertDisplayArtist(normalizedConcert),
                    normalizedConcert.rawTitle || normalizedConcert.title,
                    normalizedConcert.rawArtistTag || '',
                    normalizedConcert.artistPrimary || '',
                    JSON.stringify(normalizedConcert.artistAll || []),
                    normalizedConcert.eventType || 'unknown',
                    normalizedConcert.artistConfidence || 0,
                    normalizedConcert.artistSource || 'unknown',
                ]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function saveConcertsToStorage(concerts: Concert[]): Promise<void> {
    await ensureTable();

    if (concerts.length === 0) return;

    const deduped = new Map<string, Concert>();
    for (const c of concerts) {
        deduped.set(c.id, c);
    }
    const uniqueConcerts = Array.from(deduped.values());

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await persistConcertRows(client, uniqueConcerts);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function replaceConcertsInStorage(concerts: Concert[]): Promise<void> {
    await ensureTable();

    const deduped = new Map<string, Concert>();
    for (const c of concerts) {
        deduped.set(c.id, c);
    }
    const uniqueConcerts = Array.from(deduped.values());

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM concerts');
        if (uniqueConcerts.length > 0) {
            await persistConcertRows(client, uniqueConcerts);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function persistConcertRows(client: PoolClientLike, concerts: Concert[]) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < concerts.length; i += CHUNK_SIZE) {
        const chunk = concerts.slice(i, i + CHUNK_SIZE);

        const values: Array<string | number | boolean | null> = [];
        const placeholders: string[] = [];

        chunk.forEach((c, idx) => {
            const offset = idx * 31;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25}, $${offset + 26}, $${offset + 27}, $${offset + 28}, $${offset + 29}, $${offset + 30}, $${offset + 31})`);
            values.push(...concertToRow(c));
        });

        await client.query(`
            INSERT INTO concerts (
                id, title, image, date, city, venue, price, status, category, artist,
                raw_title, raw_artist_tag, artist_primary, artist_all, event_type,
                artist_confidence, artist_source, is_tribute, is_famous, updated_at,
                source, source_url, event_date, event_time, sort_at,
                opportunity_status, opportunity_score, opportunity_score_breakdown,
                last_seen_at, project_id, notes
            )
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
                raw_title = EXCLUDED.raw_title,
                raw_artist_tag = EXCLUDED.raw_artist_tag,
                artist_primary = EXCLUDED.artist_primary,
                artist_all = EXCLUDED.artist_all,
                event_type = EXCLUDED.event_type,
                artist_confidence = EXCLUDED.artist_confidence,
                artist_source = EXCLUDED.artist_source,
                is_tribute = EXCLUDED.is_tribute,
                is_famous = EXCLUDED.is_famous,
                updated_at = EXCLUDED.updated_at,
                source = EXCLUDED.source,
                source_url = EXCLUDED.source_url,
                event_date = EXCLUDED.event_date,
                event_time = EXCLUDED.event_time,
                sort_at = EXCLUDED.sort_at,
                opportunity_status = CASE
                    WHEN concerts.opportunity_status IN ('watching', 'qualified', 'ignored', 'converted') THEN concerts.opportunity_status
                    ELSE EXCLUDED.opportunity_status
                END,
                opportunity_score = EXCLUDED.opportunity_score,
                opportunity_score_breakdown = EXCLUDED.opportunity_score_breakdown,
                last_seen_at = EXCLUDED.last_seen_at,
                project_id = COALESCE(concerts.project_id, EXCLUDED.project_id),
                notes = CASE
                    WHEN concerts.notes IS NULL OR concerts.notes = '' THEN EXCLUDED.notes
                    ELSE concerts.notes
                END
        `, values);
    }
}

export async function getAllConcertsFromStorage(): Promise<Concert[]> {
    await ensureTable();
    const result = await pool.query('SELECT * FROM concerts ORDER BY sort_at ASC NULLS LAST, date ASC');
    return result.rows.map(rowToConcert);
}

export async function getConcertsByMonth(month: string): Promise<Concert[]> {
    await ensureTable();

    const dashPattern = `${month}%`;
    const dotPattern = `${month.replace('-', '.')}%`;

    const result = await pool.query(
        `SELECT * FROM concerts
         WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
            OR date LIKE $2
            OR date LIKE $3
         ORDER BY sort_at ASC NULLS LAST, date ASC`,
        [month, dashPattern, dotPattern]
    );
    return result.rows.map(rowToConcert);
}

export async function updateConcertOpportunity(id: string, updates: { opportunityStatus?: OpportunityStatus; notes?: string }) {
    await ensureTable();

    const sets: string[] = [];
    const values: Array<string | null> = [id];

    if (updates.opportunityStatus) {
        values.push(updates.opportunityStatus);
        sets.push(`opportunity_status = $${values.length}`);
    }

    if (updates.notes !== undefined) {
        values.push(updates.notes);
        sets.push(`notes = $${values.length}`);
    }

    if (sets.length === 0) {
        return getConcertById(id);
    }

    const result = await pool.query(
        `UPDATE concerts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );

    return result.rows[0] ? rowToConcert(result.rows[0]) : null;
}

export async function getConcertById(id: string) {
    await ensureTable();
    const result = await pool.query('SELECT * FROM concerts WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ? rowToConcert(result.rows[0]) : null;
}

export async function getProjects(): Promise<Project[]> {
    await ensureTable();

    const projectsResult = await pool.query('SELECT * FROM projects ORDER BY concert_date ASC NULLS LAST, created_at DESC');
    const tasksResult = await pool.query('SELECT * FROM project_tasks ORDER BY sort_order ASC, due_date ASC NULLS LAST');
    const contactsResult = await pool.query('SELECT * FROM contacts');
    const followUpsResult = await pool.query('SELECT * FROM follow_ups ORDER BY follow_up_date DESC, created_at DESC');

    const tasksByProject = new Map<string, ProjectTask[]>();
    tasksResult.rows.map(rowToProjectTask).forEach((task) => {
        const tasks = tasksByProject.get(task.projectId) || [];
        tasks.push(task);
        tasksByProject.set(task.projectId, tasks);
    });

    const followUpsByProject = new Map<string, FollowUp[]>();
    followUpsResult.rows.map(rowToFollowUp).forEach((fu) => {
        const list = followUpsByProject.get(fu.projectId) || [];
        list.push(fu);
        followUpsByProject.set(fu.projectId, list);
    });

    const allContacts = contactsResult.rows.map(rowToContact);
    const contactsById = new Map<string, Contact>();
    allContacts.forEach((c) => contactsById.set(c.id, c));

    return projectsResult.rows.map((row) => {
        const projectId = row.id;
        const tasks = tasksByProject.get(projectId) || [];
        const followUps = followUpsByProject.get(projectId) || [];
        const contacts = allContacts;
        return rowToProject(row, tasks, contacts, followUps);
    });
}

export async function getProjectById(id: string): Promise<Project | null> {
    await ensureTable();

    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 LIMIT 1', [id]);
    if (!projectResult.rows[0]) return null;

    const tasksResult = await pool.query(
        'SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order ASC, due_date ASC NULLS LAST',
        [id]
    );

    const followUpsResult = await pool.query(
        'SELECT * FROM follow_ups WHERE project_id = $1 ORDER BY follow_up_date DESC, created_at DESC',
        [id]
    );

    const contactsResult = await pool.query('SELECT * FROM contacts');

    return rowToProject(
        projectResult.rows[0],
        tasksResult.rows.map(rowToProjectTask),
        contactsResult.rows.map(rowToContact),
        followUpsResult.rows.map(rowToFollowUp),
    );
}

export async function createProjectFromConcert(concertId: string): Promise<{ project: Project; concert: Concert }> {
    await ensureTable();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const concertResult = await client.query('SELECT * FROM concerts WHERE id = $1 FOR UPDATE', [concertId]);
        if (!concertResult.rows[0]) {
            throw new Error('Concert not found');
        }

        const concert = rowToConcert(concertResult.rows[0]);
        if (concert.projectId) {
            const existingProject = await getProjectById(concert.projectId);
            if (existingProject) {
                await client.query('COMMIT');
                return { project: existingProject, concert };
            }
        }

        const existingResult = await client.query('SELECT * FROM projects WHERE concert_id = $1 LIMIT 1', [concertId]);
        if (existingResult.rows[0]) {
            const existingProject = rowToProject(existingResult.rows[0]);
            await client.query(
                `UPDATE concerts
                 SET project_id = $2, opportunity_status = 'converted'
                 WHERE id = $1`,
                [concertId, existingProject.id]
            );
            await client.query('COMMIT');
            const projectWithTasks = await getProjectById(existingProject.id);
            const updatedConcert = await getConcertById(concertId);
            return { project: projectWithTasks || existingProject, concert: updatedConcert || concert };
        }

        const now = Date.now();
        const projectId = randomUUID();
        await client.query(
            `INSERT INTO projects (
                id, concert_id, title, artist, city, venue, concert_date,
                status, stage, owner, priority, notes, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'planning', '', 'normal', '', $8, $8)`,
            [
                projectId,
                concert.id,
                concert.title,
                getConcertDisplayArtist(concert),
                concert.city || '',
                concert.venue || '',
                concert.eventDate || null,
                now,
            ]
        );

        const templateTasks = buildProjectTasks(concert.eventDate || null);
        for (const task of templateTasks) {
            await client.query(
                `INSERT INTO project_tasks (
                    id, project_id, title, task_type, status, due_date,
                    relative_offset_days, sort_order, auto_generated, notes, completed_at
                 ) VALUES ($1, $2, $3, 'milestone', 'todo', $4, $5, $6, TRUE, '', NULL)`,
                [randomUUID(), projectId, task.title, task.dueDate, task.relativeOffsetDays, task.sortOrder]
            );
        }

        await client.query(
            `UPDATE concerts
             SET project_id = $2, opportunity_status = 'converted'
             WHERE id = $1`,
            [concert.id, projectId]
        );

        await client.query('COMMIT');

        const project = await getProjectById(projectId);
        const updatedConcert = await getConcertById(concertId);
        if (!project || !updatedConcert) {
            throw new Error('Project creation verification failed');
        }

        return { project, concert: updatedConcert };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function updateProjectTask(
    taskId: string,
    updates: { status?: ProjectTaskStatus; dueDate?: string | null; notes?: string }
): Promise<ProjectTask | null> {
    await ensureTable();

    const sets: string[] = [];
    const values: Array<string | number | null> = [taskId];

    if (updates.status) {
        values.push(updates.status);
        sets.push(`status = $${values.length}`);
        values.push(updates.status === 'done' ? Date.now() : null);
        sets.push(`completed_at = $${values.length}`);
    }

    if (updates.dueDate !== undefined) {
        values.push(updates.dueDate);
        sets.push(`due_date = $${values.length}`);
    }

    if (updates.notes !== undefined) {
        values.push(updates.notes);
        sets.push(`notes = $${values.length}`);
    }

    if (sets.length === 0) {
        const result = await pool.query('SELECT * FROM project_tasks WHERE id = $1 LIMIT 1', [taskId]);
        return result.rows[0] ? rowToProjectTask(result.rows[0]) : null;
    }

    const result = await pool.query(
        `UPDATE project_tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );

    if (result.rows[0]) {
        await pool.query('UPDATE projects SET updated_at = $2 WHERE id = $1', [result.rows[0].project_id, Date.now()]);
    }

    return result.rows[0] ? rowToProjectTask(result.rows[0]) : null;
}

export async function clearAllConcerts(): Promise<void> {
    await ensureTable();
    await pool.query('DELETE FROM concerts');
}

export async function getConcertCount(): Promise<number> {
    await ensureTable();
    const result = await pool.query('SELECT COUNT(*) as count FROM concerts');
    return parseInt(result.rows[0].count, 10);
}

export async function updateProject(
    projectId: string,
    updates: {
        stage?: ProjectStage;
        owner?: string;
        priority?: ProjectPriority;
        status?: ProjectStatus;
        notes?: string;
        quoteAmount?: number | null;
        quoteStatus?: string | null;
        nextFollowUpAt?: string | null;
    }
): Promise<Project | null> {
    await ensureTable();

    const sets: string[] = [];
    const values: Array<string | number | null> = [projectId];

    if (updates.stage !== undefined) { values.push(updates.stage); sets.push(`stage = $${values.length}`); }
    if (updates.owner !== undefined) { values.push(updates.owner); sets.push(`owner = $${values.length}`); }
    if (updates.priority !== undefined) { values.push(updates.priority); sets.push(`priority = $${values.length}`); }
    if (updates.status !== undefined) { values.push(updates.status); sets.push(`status = $${values.length}`); }
    if (updates.notes !== undefined) { values.push(updates.notes); sets.push(`notes = $${values.length}`); }
    if (updates.quoteAmount !== undefined) { values.push(updates.quoteAmount); sets.push(`quote_amount = $${values.length}`); }
    if (updates.quoteStatus !== undefined) { values.push(updates.quoteStatus); sets.push(`quote_status = $${values.length}`); }
    if (updates.nextFollowUpAt !== undefined) { values.push(updates.nextFollowUpAt); sets.push(`next_follow_up_at = $${values.length}`); }

    if (sets.length === 0) return getProjectById(projectId);

    values.push(Date.now());
    sets.push(`updated_at = $${values.length}`);

    await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $1`, values);

    return getProjectById(projectId);
}

export async function getContacts(): Promise<Contact[]> {
    await ensureTable();
    const result = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
    return result.rows.map(rowToContact);
}

export async function createContact(data: {
    name: string;
    role?: string;
    phone?: string;
    email?: string;
    wechat?: string;
    company?: string;
    notes?: string;
}): Promise<Contact> {
    await ensureTable();
    const id = randomUUID();
    const now = Date.now();
    const result = await pool.query(
        `INSERT INTO contacts (id, name, role, phone, email, wechat, company, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
        [id, data.name, data.role || '', data.phone || '', data.email || '', data.wechat || '', data.company || '', data.notes || '', now]
    );
    return rowToContact(result.rows[0]);
}

export async function updateContact(
    id: string,
    data: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Contact | null> {
    await ensureTable();
    const sets: string[] = [];
    const values: Array<string | number | null> = [id];

    for (const [key, col] of Object.entries({ name: 'name', role: 'role', phone: 'phone', email: 'email', wechat: 'wechat', company: 'company', notes: 'notes' })) {
        const val = (data as Record<string, string | undefined>)[key];
        if (val !== undefined) { values.push(val); sets.push(`${col} = $${values.length}`); }
    }

    if (sets.length === 0) {
        const result = await pool.query('SELECT * FROM contacts WHERE id = $1 LIMIT 1', [id]);
        return result.rows[0] ? rowToContact(result.rows[0]) : null;
    }

    values.push(Date.now());
    sets.push(`updated_at = $${values.length}`);

    const result = await pool.query(
        `UPDATE contacts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );
    return result.rows[0] ? rowToContact(result.rows[0]) : null;
}

export async function deleteContact(id: string): Promise<boolean> {
    await ensureTable();
    const result = await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}

export async function createFollowUp(data: {
    projectId: string;
    content: string;
    followUpDate?: string | null;
}): Promise<FollowUp> {
    await ensureTable();
    const id = randomUUID();
    const now = Date.now();
    const result = await pool.query(
        `INSERT INTO follow_ups (id, project_id, content, follow_up_date, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, data.projectId, data.content, data.followUpDate || null, now]
    );

    if (data.followUpDate) {
        await pool.query(
            `UPDATE projects SET next_follow_up_at = $2, updated_at = $3 WHERE id = $1`,
            [data.projectId, data.followUpDate, now]
        );
    }

    return rowToFollowUp(result.rows[0]);
}

export async function getOverdueFollowUps(): Promise<FollowUp[]> {
    await ensureTable();
    const result = await pool.query(
        `SELECT * FROM follow_ups
         WHERE follow_up_date IS NOT NULL
           AND follow_up_date < CURRENT_DATE
         ORDER BY follow_up_date ASC`
    );
    return result.rows.map(rowToFollowUp);
}
