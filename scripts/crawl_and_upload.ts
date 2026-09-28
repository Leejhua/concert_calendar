#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
/**
 * Local Crawler + Upload Script
 * 
 * Runs the full crawl pipeline locally (no server-side rate limiting issues),
 * then uploads the result to the remote server via POST /api/upload.
 * 
 * Usage:
 *   npx tsx scripts/crawl_and_upload.ts
 * 
 * Environment variables:
 *   DEEPSEEK_API_KEY  - (optional) for AI artist extraction
 *   UPLOAD_URL        - remote server URL, e.g. https://your-domain.com/api/upload
 *   UPLOAD_TOKEN      - auth token matching the server's UPLOAD_TOKEN
 *   UPLOAD_MODE       - 'merge' (default) or 'replace'
 * 
 * You can also create a .env.crawl file in the project root:
 *   DEEPSEEK_API_KEY=sk-xxx
 *   UPLOAD_URL=https://your-domain.com/api/upload
 *   UPLOAD_TOKEN=your-secret-token
 */

// Load .env.local into process.env FIRST — must happen before any module
// that reads process.env at import time (e.g. lib/db.ts creates a pg.Pool).
import '../lib/cli-env';
import fs from 'fs';
import path from 'path';

// --- Load .env.crawl if present ---
const envFile = path.join(process.cwd(), '.env.crawl');
if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    }
}

const UPLOAD_URL = process.env.UPLOAD_URL;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';
const UPLOAD_MODE = process.env.UPLOAD_MODE || 'merge';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

async function main() {
    console.log('='.repeat(60));
    console.log('🎵 Concert Calendar - Local Crawler');
    console.log('='.repeat(60));

    if (!UPLOAD_URL) {
        console.warn('⚠️  UPLOAD_URL not set. Data will be saved locally only.');
    }

    // 1. Run the full crawl
    console.log('\n📡 Starting crawl...\n');
    const startTime = Date.now();

    // Import crawler dependencies only after cli-env and .env.crawl are loaded.
    // syncData's import chain initializes lib/db.ts, so static imports here can
    // observe an incomplete process.env and create a pg.Pool without credentials.
    await import('../lib/proxy-agent');
    const { prepareProxyPool } = await import('../lib/proxy-pool');
    const { syncData } = await import('../lib/damai-crawler');

    console.log('[proxy-pool] Preparing proxy pool for damai...');
    await prepareProxyPool({ regionPreference: ['HK', 'TW', 'SG', 'JP'] });

    const result = await syncData({
        deepseekApiKey: DEEPSEEK_API_KEY,
        onProgress: (msg, progress) => {
            // Simple progress bar for terminal
            const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
            process.stdout.write(`\r  [${bar}] ${progress}% - ${msg}`);
        }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n✅ Crawl finished in ${elapsed}s`);
    console.log(`   Total: ${result.totalCombined} concerts`);

    if (result.timedOutSources?.length) {
        console.log(`   ⏱️  Timed out: ${result.timedOutSources.join(', ')}`);
    }
    if (result.failedSources?.length) {
        console.log(`   ❌ Failed: ${result.failedSources.join(', ')}`);
    }

    if (!result.success || result.totalCombined === 0) {
        console.error('\n❌ Crawl failed or returned no data. Aborting upload.');
        process.exit(1);
    }

    // 2. Read the crawled data from local storage
    const dataDir = path.join(process.cwd(), 'data', 'concerts');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    let allConcerts: any[] = [];
    for (const file of files) {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) allConcerts.push(...data);
    }

    console.log(`\n📦 Loaded ${allConcerts.length} concerts from local storage`);

    // 3. Upload to remote server
    if (!UPLOAD_URL) {
        console.log('\n✅ Done (local only, no upload URL configured).');
        process.exit(0);
    }

    console.log(`\n📤 Uploading to ${UPLOAD_URL} (mode: ${UPLOAD_MODE})...`);

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (UPLOAD_TOKEN) {
            headers['Authorization'] = `Bearer ${UPLOAD_TOKEN}`;
        }

        const response = await fetch(UPLOAD_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                concerts: allConcerts,
                mode: UPLOAD_MODE,
            }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log(`\n✅ Upload successful!`);
            console.log(`   Received: ${data.received}, Total on server: ${data.total}`);
        } else {
            console.error(`\n❌ Upload failed: ${data.message || response.statusText}`);
            process.exit(1);
        }
    } catch (err: any) {
        console.error(`\n❌ Upload error: ${err.message}`);
        process.exit(1);
    }

    console.log('\n🎉 All done!');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
