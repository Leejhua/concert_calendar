
import fs from 'fs';
import path from 'path';
import { Concert } from './damai-crawler';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONCERTS_DIR = path.join(DATA_DIR, 'concerts');

// Ensure directory exists
if (!fs.existsSync(CONCERTS_DIR)) {
    fs.mkdirSync(CONCERTS_DIR, { recursive: true });
}

/**
 * Extract YYYY-MM from concert date string
 */
function getMonthKey(dateStr: string): string {
    const match = dateStr.match(/(\d{4})[-./](\d{1,2})/);
    if (match) {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        return `${year}-${month}`;
    }
    return 'undated';
}

/**
 * Save all concerts, splitting them into monthly JSON files
 */
export async function saveConcertsToStorage(concerts: Concert[]): Promise<void> {
    // 1. Group by month
    const groups: Record<string, Concert[]> = {};
    
    concerts.forEach(concert => {
        const key = getMonthKey(concert.date);
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(concert);
    });

    // 2. Clear existing files (optional, but safer to avoid stale months)
    // For now, we overwrite. If we want to support incremental updates, we'd need to read first.
    // Given the sync logic is usually "full sync" or "merge then save", overwriting is fine 
    // IF we pass the FULL dataset to this function.
    
    // Check if we need to clean up old files? 
    // Let's assume this function receives the COMPLETE state of the world.
    if (fs.existsSync(CONCERTS_DIR)) {
        const files = fs.readdirSync(CONCERTS_DIR);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(CONCERTS_DIR, file));
            }
        });
    } else {
        fs.mkdirSync(CONCERTS_DIR, { recursive: true });
    }

    // 3. Write new files
    for (const [month, monthConcerts] of Object.entries(groups)) {
        const filePath = path.join(CONCERTS_DIR, `${month}.json`);
        fs.writeFileSync(filePath, JSON.stringify(monthConcerts, null, 2), 'utf-8');
    }
}

/**
 * Read all concerts from all monthly files
 */
export async function getAllConcertsFromStorage(): Promise<Concert[]> {
    if (!fs.existsSync(CONCERTS_DIR)) {
        return [];
    }

    const files = fs.readdirSync(CONCERTS_DIR).filter(f => f.endsWith('.json'));
    let allConcerts: Concert[] = [];

    for (const file of files) {
        const filePath = path.join(CONCERTS_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                allConcerts = allConcerts.concat(data);
            }
        } catch (err) {
            console.error(`Error reading ${file}:`, err);
        }
    }

    return allConcerts;
}

/**
 * Read concerts for a specific month (YYYY-MM)
 */
export async function getConcertsByMonth(month: string): Promise<Concert[]> {
    const filePath = path.join(CONCERTS_DIR, `${month}.json`);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error reading ${month}.json:`, err);
        return [];
    }
}
