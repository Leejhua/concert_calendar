
import fs from 'fs';
import path from 'path';
import { getAllConcertsFromStorage, saveConcertsToStorage } from '../lib/db';
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
    let fixCount = 0;

    // Identify concerts that need fixing
    for (const concert of allConcerts) {
        if (concert.artist && INVALID_ARTIST_VALUES.includes(concert.artist)) {
            // Reset to Unknown to trigger AI extraction
            concert.artist = 'Unknown';
            concertsToFix.push(concert);
            fixCount++;
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
    // We pass the entire list because `saveConcertsToStorage` handles distribution to monthly files.
    // However, `saveConcertsToStorage` appends/merges. To ensure updates are applied, it should be fine as long as IDs match.
    // But `saveConcertsToStorage` logic:
    // It loads existing monthly file, merges `newConcerts` into it.
    // The merge logic prioritizes existing data unless we force update?
    // Let's check `db.ts`.
    
    // Actually, `saveConcertsToStorage` calls `mergeConcertLists`.
    // In `mergeConcertLists` (deduplication.ts):
    // If duplicate found:
    //   Enrich artist if existing is invalid and new is valid.
    
    // Here, `allConcerts` contains the UPDATED objects (with real artist names).
    // The files on disk contain the OLD objects (with "歌手").
    // When we call `saveConcertsToStorage(allConcerts)`, it will:
    // 1. Group `allConcerts` by month.
    // 2. For each month, load file from disk (OLD data).
    // 3. Merge `allConcerts` (NEW data) INTO file data (OLD data).
    //    `mergeConcertLists(primary=OLD, secondary=NEW)`
    
    // Wait! `saveConcertsToStorage` implementation:
    // const existing = getConcertsByMonth(month);
    // const merged = mergeConcertLists(existing, monthConcerts);
    
    // In `mergeConcertLists(primary, secondary)`:
    // Primary is OLD (from disk), Secondary is NEW (our fixed list).
    // If duplicate found:
    //   `isExistingArtistInvalid` checks `primary.artist`.
    //   If primary is "歌手", and secondary is "Jay Chou", it WILL update!
    //   Wait, I just updated `deduplication.ts` to treat "歌手" as invalid.
    //   So yes, it should work!
    
    await saveConcertsToStorage(allConcerts);

    console.log('✅ Fix completed successfully!');
}

main().catch(console.error);
