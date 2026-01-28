import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// --- Type Definitions ---
export interface Concert {
    id: string;
    title: string;
    image: string;
    date: string;
    city: string;
    venue: string;
    price: string;
    status: string;
    category?: string;
    artist?: string;
    is_tribute?: boolean; // Whether it's a tribute/imitation concert
    is_famous?: boolean;  // Whether the artist is well-known
    updatedAt: number;
}

interface HotCity {
    cityId: string;
    cityName: string;
    url: string;
}

// --- Configuration ---
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'concerts.json');

// Keywords that indicate a "low value" or "fake" concert (tribute, imitation, etc.)
// These will be skipped by AI extraction to save tokens and avoid pollution.
const BLACKLIST_KEYWORDS = ['烛光', '致敬', '模仿', '重现', '同人', '纪念', '追忆', '作品音乐会', '见面会', '金曲', '情歌', '表白'];

// Keywords that indicate a "fake" artist tag (e.g. marketing tags)
// If showTag contains these, we will ignore it and let AI extract the real artist.
const INVALID_ARTIST_TAGS = ['演唱会', '榜', '热销', '上新', '优选', '折扣', '推荐', '必看', '演出', '麦'];

interface DamaiConfig {
    appKey: string;
    tokenWithTime: string;
    cookie: string;
    referer: string;
    deepseekApiKey?: string;
}

// Default config (will be overridden)
let DAMAI_CONFIG: DamaiConfig = {
    appKey: '12574478',
    tokenWithTime: '',
    cookie: '',
    referer: 'https://m.damai.cn/shows/category.html?categoryId=2394&clicktitle=%E6%BC%94%E5%94%B1%E4%BC%9A',
    deepseekApiKey: ''
};

// --- Helpers ---

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function generateSign(token: string, t: number, appKey: string, dataStr: string) {
    const strToSign = `${token}&${t}&${appKey}&${dataStr}`;
    return crypto.createHash('md5').update(strToSign).digest('hex');
}

function makeRequest(api: string, dataObj: any, callbackName?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const token = DAMAI_CONFIG.tokenWithTime.split('_')[0];
        const t = Date.now();
        const dataStr = JSON.stringify(dataObj);
        const sign = generateSign(token, t, DAMAI_CONFIG.appKey, dataStr);

        const params = new URLSearchParams({
            jsv: '2.7.5',
            appKey: DAMAI_CONFIG.appKey,
            t: String(t),
            sign: sign,
            api: api,
            v: '1.2',
            H5Request: 'true',
            type: 'jsonp',
            timeout: '10000',
            forceAntiCreep: 'true',
            AntiCreep: 'true',
            dataType: 'jsonp',
            data: dataStr
        });

        if (callbackName) {
            params.set('callback', callbackName);
        }

        // Concert API specific overrides
        if (api === 'mtop.damai.mec.aristotle.get') {
            params.set('v', '3.0');
            params.set('type', 'json');
            params.set('dataType', 'json');
            params.delete('callback');
        }

        const options = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/${params.get('v')}/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': 'zh-CN,zh;q=0.9',
                'cookie': DAMAI_CONFIG.cookie,
                'referer': DAMAI_CONFIG.referer,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            }
        };

        const req = https.request(options, (res) => {
            let chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                
                if (callbackName && body.includes(callbackName + '(')) {
                    try {
                        const start = body.indexOf(callbackName + '(') + callbackName.length + 1;
                        const end = body.lastIndexOf(')');
                        const jsonStr = body.substring(start, end);
                        resolve(JSON.parse(jsonStr));
                    } catch (e: any) {
                        reject(new Error(`Failed to parse JSONP: ${e.message}`));
                    }
                } else {
                    try {
                        // Try parsing directly
                        resolve(JSON.parse(body));
                    } catch (e) {
                        // Fallback: try extracting if it looks like jsonp but failed check
                         if (body.trim().startsWith('mtopjsonp')) {
                             const start = body.indexOf('(') + 1;
                             const end = body.lastIndexOf(')');
                             try {
                                resolve(JSON.parse(body.substring(start, end)));
                                return;
                             } catch(err) {}
                        }
                        console.error('Raw response parsing failed:', body.substring(0, 200));
                        reject(new Error('Failed to parse JSON response'));
                    }
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

// Recursive finder for concert items
function parseConcertNodes(nodes: any[], cityName: string): Concert[] {
    const results: Concert[] = [];
    if (!nodes) return results;

    for (const node of nodes) {
        if (node.type === '7587' && node.data && (node.data.itemId || node.data.id)) {
            const item = node.data;
            const showTag = item.showTag;
            // Validate showTag: it must exist, and NOT contain any invalid keywords
            const isValidTag = showTag && !INVALID_ARTIST_TAGS.some(k => showTag.includes(k));

            results.push({
                id: item.id || item.itemId || '',
                title: item.name || item.showTag || item.projectName || '',
                image: item.verticalPic || '',
                date: item.showTime || '',
                city: (item.cityName || '').trim(), 
                venue: item.venueName || '',
                price: item.priceShowText || item.priceStr || item.priceLow || 'Pending',
                status: item.showStatus?.desc || 'Unknown',
                category: item.topRight?.tag || 'Concert',
                artist: isValidTag ? showTag : '', // Only use valid tags
                is_famous: isValidTag,  // Only trust it's famous if the tag is valid
                updatedAt: Date.now()
            });
        }
        if (node.nodes) {
            results.push(...parseConcertNodes(node.nodes, cityName));
        }
    }
    return results;
}

// --- DeepSeek Extraction ---

async function extractArtistsWithDeepSeek(concerts: Concert[], apiKey: string): Promise<Concert[]> {
    if (!concerts.length) return concerts;
    console.log(`🤖 DeepSeek: Processing ${concerts.length} items...`);

    // 1. Pre-filter with Blacklist
    const concertsToProcess: Concert[] = [];
    const titlesToProcess: string[] = [];

    concerts.forEach(c => {
        const isBlacklisted = BLACKLIST_KEYWORDS.some(keyword => c.title.includes(keyword));
        if (isBlacklisted) {
            c.artist = 'Unknown';
            c.is_tribute = true;
            // console.log(`   🚫 Blacklisted: ${c.title}`);
        } else {
            // Check if we already have a valid artist from showTag
            // Valid means: not empty, not "群星", and doesn't contain blacklist words
            let hasValidOfficialArtist = false;
            if (c.artist && c.artist !== '群星' && c.artist !== 'Unknown') {
                const isArtistBlacklisted = BLACKLIST_KEYWORDS.some(keyword => c.artist!.includes(keyword));
                if (!isArtistBlacklisted) {
                    hasValidOfficialArtist = true;
                }
            }

            if (hasValidOfficialArtist) {
                // Already have valid artist, just format title if needed
                if (!c.title.startsWith('【')) {
                    c.title = `【${c.artist}】${c.title}`;
                }
            } else {
                // Need AI extraction
                concertsToProcess.push(c);
                titlesToProcess.push(c.title);
            }
        }
    });

    if (titlesToProcess.length === 0) {
        console.log('✨ All items were handled by blacklist or official tags. Skipping AI.');
        return concerts;
    }

    console.log(`   📝 Sending ${titlesToProcess.length} titles to DeepSeek (filtered ${concerts.length - titlesToProcess.length} by blacklist)...`);

    const prompt = `
You are a music data expert. Extract the main artist/performer from the following concert titles. 
Return ONLY a valid JSON object where keys are the EXACT titles provided and values are objects with:
- "artist": string (the artist name, or "Unknown")
- "is_tribute": boolean (true if it's a tribute, memorial, imitation, "Candlelight", or fan meeting/Gala where the original artist is NOT performing)
- "is_famous": boolean (true if the artist is a well-known professional singer/band; false for amateur, obscure, local performers, or non-concert events like fan meetings)

Rules:
1. STRICTLY identify tribute acts and non-concert events (e.g., "致敬Beyond", "纪念张国荣", "粉丝见面会", "金曲专场"). For these, set "is_tribute": true and "artist": "Unknown".
2. If it's a music festival or multi-artist event, set "artist": "群星".
3. If the performer is not a famous commercial artist (e.g., obscure local bands, university choirs), set "is_famous": false.
4. Return JSON ONLY. No markdown.

Titles:
${JSON.stringify(titlesToProcess)}
    `;

    // Actual implementation with fetch
    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that extracts artist names and filters low-value events.' },
                    { role: 'user', content: prompt }
                ],
                stream: false,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`DeepSeek API Failed: ${response.status} ${errText}`);
            return concerts;
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        let result: any = {};
        try {
            result = JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse DeepSeek response JSON:', content);
            return concerts;
        }
        
        // Update concerts with extracted data
        concertsToProcess.forEach(c => {
            const info = result[c.title];
            if (info) {
                if (typeof info === 'string') {
                    // Fallback for simple string response (should not happen with new prompt but good for safety)
                    c.artist = info;
                    c.is_tribute = false;
                    c.is_famous = true;
                } else {
                    c.artist = info.artist || 'Unknown';
                    c.is_tribute = info.is_tribute || false;
                    c.is_famous = info.is_famous !== undefined ? info.is_famous : true;
                }

                // Post-processing logic
                if (c.is_tribute || !c.is_famous) {
                    // Double check: if AI marked it as tribute or not famous, we treat artist as Unknown
                    // This ensures they don't clutter the artist list
                    if (c.is_tribute) c.artist = 'Unknown'; 
                    // For is_famous: false, we might still want to keep the name but maybe not highlight it?
                    // User said "not real artists... good solution?", implying they want to filter them.
                    // Let's set artist to 'Unknown' if not famous, to be safe and clean.
                    if (!c.is_famous) c.artist = 'Unknown';
                }

                if (c.artist !== 'Unknown' && !c.title.startsWith('【')) {
                    c.title = `【${c.artist}】${c.title}`;
                }
            }
        });

        console.log('✅ Artist extraction complete');
        return concerts;

    } catch (error) {
        console.error('DeepSeek Request Error:', error);
        return concerts;
    }
}


// --- Main Execution ---

export interface SyncResult {
    success: boolean;
    totalNew: number;
    totalCombined: number;
    message?: string;
}

export async function syncData(config?: Partial<DamaiConfig>): Promise<SyncResult> {
    console.log('🚀 Starting Data Sync...');
    
    // Update config if provided
    if (config) {
        DAMAI_CONFIG = { ...DAMAI_CONFIG, ...config };
    }
    
    // Validate config
    if (!DAMAI_CONFIG.cookie || !DAMAI_CONFIG.tokenWithTime) {
        console.error('❌ Missing Cookie or Token.');
        return { success: false, totalNew: 0, totalCombined: 0, message: 'Missing Cookie or Token' };
    }

    ensureDataDir();

    try {
        // 1. Fetch City List
        console.log('1. Fetching City List...');
        const cityDataObj = {
            platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        };
        const cityRes = await makeRequest('mtop.damai.wireless.area.groupcity', cityDataObj, 'mtopjsonp4');
        
        const hotCities: HotCity[] = cityRes.data?.hotCities || cityRes.data?.hotCity || [];
        console.log(`✅ Found ${hotCities.length} hot cities.`);

        if (hotCities.length === 0) {
            console.error('❌ No cities found. Check Token.');
            return { success: false, totalNew: 0, totalCombined: 0, message: 'Token invalid (No cities found)' };
        }

        // 2. Fetch Concerts for each city
        let allConcerts: Concert[] = [];
        const citiesToFetch = hotCities; // Fetch all hot cities

        for (const [index, city] of citiesToFetch.entries()) {
            console.log(`\n[${index + 1}/${citiesToFetch.length}] Fetching ${city.cityName}...`);
            
            const fetchedIdsInThisCity = new Set<string>();

            // Fetch all pages until no more items
            for (let page = 1; page <= 50; page++) { // Safety cap at 50 pages per city
                // Sleep a bit to avoid rate limiting
                const delay = Math.floor(Math.random() * 1000) + 500;
                await new Promise(r => setTimeout(r, delay));

                const args = {
                    comboConfigRule: "true",
                    sortType: "3",
                    latitude: "0",
                    longitude: "0",
                    groupId: "2394",
                    comboCityId: city.cityId,
                    currentCityId: city.cityId,
                    platform: "8",
                    comboChannel: "2",
                    dmChannel: "damai@damaih5_h5",
                    pageIndex: String(page),
                    pageSize: "20"
                };
                
                const concertDataObj = {
                    args: JSON.stringify(args),
                    patternName: "category_solo",
                    patternVersion: "4.2",
                    platform: "8",
                    comboChannel: "2",
                    dmChannel: "damai@damaih5_h5"
                };

                try {
                    const res = await makeRequest('mtop.damai.mec.aristotle.get', concertDataObj);
                    if (res.ret && res.ret[0].startsWith('SUCCESS')) {
                        // Debug: Log raw structure of the first item to analyze fields
                        if (page === 1 && res.data?.nodes?.length > 0) {
                            const firstItem = res.data.nodes.find((n: any) => n.type === '7587')?.data;
                            if (firstItem) {
                                console.log(`\n🔍 Debug: Raw Data Structure for "${firstItem.name || 'Unknown'}"`);
                                console.log(JSON.stringify(firstItem, null, 2));
                                console.log('--------------------------------------------------\n');
                            }
                        }

                        const items = parseConcertNodes(res.data?.nodes, city.cityName);
                        console.log(`   Page ${page}: Found ${items.length} items`);
                        
                        if (items.length === 0) {
                            // No more items, stop fetching this city
                            break;
                        }

                        let newItemsCount = 0;
                        for (const item of items) {
                            if (!fetchedIdsInThisCity.has(item.id)) {
                                fetchedIdsInThisCity.add(item.id);
                                allConcerts.push(item);
                                newItemsCount++;
                            }
                        }

                        if (newItemsCount === 0) {
                            console.log(`   Page ${page}: No new items (Duplicate page). Stopping.`);
                            break;
                        }

                        // If less than full page, stop fetching this city
                        if (items.length < 20) break; 
                    } else {
                        console.warn(`   Page ${page}: Failed (${res.ret?.[0]})`);
                        break;
                    }
                } catch (err: any) {
                    console.error(`   Page ${page}: Error - ${err.message}`);
                    break;
                }
            }
        }

        // 3. Deduplicate and Save
        console.log('\n3. Processing Data...');

        // DeepSeek Extraction
        if (DAMAI_CONFIG.deepseekApiKey) {
            console.log('🤖 DeepSeek API Key found, starting artist extraction...');
            allConcerts = await extractArtistsWithDeepSeek(allConcerts, DAMAI_CONFIG.deepseekApiKey);
        } else {
            console.log('ℹ️ No DeepSeek API Key provided, skipping artist extraction.');
        }
        
        // Load existing data if available to prevent data loss
        let existingConcerts: Concert[] = [];
        if (fs.existsSync(DATA_FILE)) {
            try {
                existingConcerts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
                console.log(`📚 Loaded ${existingConcerts.length} existing items.`);
            } catch (e) {
                console.warn('⚠️ Failed to load existing data, starting fresh.');
            }
        }

        const concertMap = new Map<string, Concert>();
        
        // 1. Add existing concerts first
        existingConcerts.forEach(c => concertMap.set(c.id, c));
        
        // 2. Add/Update with new concerts
        allConcerts.forEach(c => concertMap.set(c.id, c));

        const mergedConcerts = Array.from(concertMap.values());
        
        console.log(`✅ Total new items fetched: ${allConcerts.length}`);
        console.log(`✅ Total combined items: ${mergedConcerts.length}`);

        fs.writeFileSync(DATA_FILE, JSON.stringify(mergedConcerts, null, 2));
        console.log(`🎉 Data saved to ${DATA_FILE}`);

        return {
            success: true,
            totalNew: allConcerts.length,
            totalCombined: mergedConcerts.length
        };

    } catch (err: any) {
        console.error('❌ Fatal Error:', err);
        return { success: false, totalNew: 0, totalCombined: 0, message: err.message };
    }
}
