
import fs from 'fs';
import path from 'path';
import { getAllConcertsFromStorage, replaceConcertsInStorage } from '../lib/db';
import { extractArtistsWithDeepSeek, Concert } from '../lib/damai-crawler';

// Manually load .env.local
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
                process.env[key] = value;
            }
        });
    }
}

loadEnv();

const INVALID_ARTIST_VALUES = ['歌手', '音乐会'];

async function main() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('❌ DEEPSEEK_API_KEY not found in environment variables.');
        process.exit(1);
    }

    console.log('🔄 Loading all concerts...');
    const allConcerts = await getAllConcertsFromStorage();
    console.log(`✅ Loaded ${allConcerts.length} concerts.`);

    const concertsToFix: Concert[] = [];

    // Identify concerts that need fixing
    for (const concert of allConcerts) {
        if (concert.artist && INVALID_ARTIST_VALUES.includes(concert.artist)) {
            // Clear the legacy artist field so structured extraction can refill it.
            concert.artist = '';
            concert.artistPrimary = '';
            concert.artistAll = [];
            concertsToFix.push(concert);
        }
    }

    if (concertsToFix.length === 0) {
        console.log('✨ No concerts with invalid artist tags found.');
        return;
    }

    console.log(`🔍 Found ${concertsToFix.length} concerts with invalid artist tags (e.g. "歌手").`);
    console.log('🚀 Starting DeepSeek extraction...');

    // Process in batches to avoid overwhelming the API or hitting limits
    const BATCH_SIZE = 20;
    for (let i = 0; i < concertsToFix.length; i += BATCH_SIZE) {
        const batch = concertsToFix.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(concertsToFix.length / BATCH_SIZE)} (${batch.length} items)...`);
        
        await extractArtistsWithDeepSeek(batch, apiKey);
        
        // Save intermediate results (optional, but good for safety)
        // Note: We need to save ALL concerts, not just the batch, because saveConcertsToStorage overwrites or merges.
        // But since we modified objects in `allConcerts` (by reference), we can just save `allConcerts`.
    }

    console.log('\n💾 Saving updated data...');
    await replaceConcertsInStorage(allConcerts);

    console.log('✅ Fix completed successfully!');
}

main().catch(console.error);
