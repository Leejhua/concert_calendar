
import fs from 'fs';
import path from 'path';
import { saveConcertsToStorage } from '../lib/db';

const DATA_FILE = path.join(process.cwd(), 'data', 'concerts.json');

async function migrate() {
    console.log('Starting migration...');
    
    if (!fs.existsSync(DATA_FILE)) {
        console.error('No concerts.json found!');
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        const concerts = JSON.parse(content);
        console.log(`Loaded ${concerts.length} concerts.`);

        await saveConcertsToStorage(concerts);
        console.log('Migration completed successfully!');
        
        // Verify
        const files = fs.readdirSync(path.join(process.cwd(), 'data', 'concerts'));
        console.log(`Created ${files.length} monthly files:`, files.join(', '));

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
