import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fetchAllMoreTicketsConcerts } from './moretickets-crawler';
import { mergeConcertLists } from './deduplication';

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

// Cities to exclude (Overseas + Taiwan)
// Keeping ONLY Mainland China + Hong Kong + Macau
const CITY_BLACKLIST = [
    // Taiwan
    '台北', '高雄', '桃园', '台中', '台南', '新北', '台湾',
    // Asia - Japan
    '东京', '大阪', '名古屋', '福冈', '横滨', '神户', '札幌', '埼玉',
    // Asia - SE
    '曼谷', '清迈', '普吉',
    '新加坡',
    '吉隆坡', '槟城', '新山',
    '雅加达', '巴厘岛',
    '河内', '胡志明', '胡志明市',
    '马尼拉',
    '金边',
    // Asia - KR
    '首尔', '仁川', '釜山',
    // Oceania
    '悉尼', '墨尔本', '布里斯班', '珀斯', '阿德莱德', '堪培拉',
    '奥克兰', '惠灵顿',
    // Europe
    '伦敦', '曼彻斯特', '爱丁堡', '伯明翰',
    '巴黎',
    '柏林', '慕尼黑', '法兰克福', '汉堡',
    '米兰', '罗马',
    '马德里', '巴塞罗那',
    '阿姆斯特丹',
    '莫斯科', '圣彼得堡',
    '捷克', '布拉格',
    '瑞典', '斯德哥尔摩',
    // North America
    '纽约', '洛杉矶', '旧金山', '拉斯维加斯', '芝加哥', '波士顿', '华盛顿', '西雅图',
    '多伦多', '温哥华', '蒙特利尔',
    // Middle East
    '迪拜', '阿布扎比'
];

interface DamaiConfig {
    appKey: string;
    tokenWithTime: string;
    cookie: string;
    referer: string;
    deepseekApiKey?: string;
    onProgress?: (message: string, progress: number) => void;
}

// Default config (will be overridden)
let DAMAI_CONFIG: DamaiConfig = {
    appKey: '12574478',
    tokenWithTime: '',
    cookie: '',
    referer: 'https://m.damai.cn/shows/category.html?categoryId=2394&clicktitle=%E6%BC%94%E5%94%B1%E4%BC%9A',
    deepseekApiKey: '',
    onProgress: undefined
};

// --- Helpers ---

async function fetchInitialToken(): Promise<void> {
    console.log('🔄 Auto-Handshake: Fetching fresh token...');
    
    // 1. First, fetch home page to get base cookies (optional but good practice)
    // In my test, I didn't get cookies from home page, but let's skip it to keep it simple and fast 
    // since the API call itself returns the token.
    
    return new Promise((resolve, reject) => {
        // We use a light API for handshake
        const api = 'mtop.damai.wireless.area.groupcity';
        const t = Date.now();
        const dataObj = { 
            platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5" 
        };
        const dataStr = JSON.stringify(dataObj);
        // Empty token for first sign
        const sign = generateSign('', t, DAMAI_CONFIG.appKey, dataStr);
        
        const params = new URLSearchParams({
            jsv: '2.7.5',
            appKey: DAMAI_CONFIG.appKey,
            t: String(t),
            sign: sign,
            api: api,
            v: '1.2',
            type: 'json',
            dataType: 'json',
            data: dataStr
        });

        const options = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/1.2/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            }
        };

        const req = https.request(options, (res) => {
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                const cookies = setCookie.map(c => c.split(';')[0]).join('; ');
                const tokenMatch = cookies.match(/_m_h5_tk=([^;]+)/);
                
                if (tokenMatch) {
                    DAMAI_CONFIG.cookie = cookies;
                    DAMAI_CONFIG.tokenWithTime = tokenMatch[1];
                    console.log(`✅ Auto-Handshake Success! Token: ${DAMAI_CONFIG.tokenWithTime.split('_')[0]}`);
                    resolve();
                } else {
                    reject(new Error('Handshake failed: No token in Set-Cookie'));
                }
            } else {
                reject(new Error('Handshake failed: No Set-Cookie received'));
            }
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function generateSign(token: string, t: number, appKey: string, dataStr: string) {
    const strToSign = `${token}&${t}&${appKey}&${dataStr}`;
    return crypto.createHash('md5').update(strToSign).digest('hex');
}

function makeRequest(api: string, dataObj: any, callbackName?: string, retryCount = 0): Promise<any> {
    return new Promise((resolve, reject) => {
        const token = DAMAI_CONFIG.tokenWithTime ? DAMAI_CONFIG.tokenWithTime.split('_')[0] : '';
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
            // Capture and update cookies
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                const newCookies = setCookie.map(c => c.split(';')[0]).join('; ');
                // Check for token update
                const tokenMatch = newCookies.match(/_m_h5_tk=([^;]+)/);
                if (tokenMatch) {
                    DAMAI_CONFIG.tokenWithTime = tokenMatch[1];
                    // Simple cookie update: overwrite or append. 
                    // Since we primarily need the token, overwriting or ensuring it's present is key.
                    // For simplicity and effectiveness, we use the new cookies as they usually contain the necessary session info.
                    DAMAI_CONFIG.cookie = newCookies; 
                }
            }

            let chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                
                let json: any = null;

                if (callbackName && body.includes(callbackName + '(')) {
                    try {
                        const start = body.indexOf(callbackName + '(') + callbackName.length + 1;
                        const end = body.lastIndexOf(')');
                        const jsonStr = body.substring(start, end);
                        json = JSON.parse(jsonStr);
                    } catch (e: any) {
                        reject(new Error(`Failed to parse JSONP: ${e.message}`));
                        return;
                    }
                } else {
                    try {
                        json = JSON.parse(body);
                    } catch (e) {
                        // Fallback: try extracting if it looks like jsonp but failed check
                         if (body.trim().startsWith('mtopjsonp')) {
                             const start = body.indexOf('(') + 1;
                             const end = body.lastIndexOf(')');
                             try {
                                json = JSON.parse(body.substring(start, end));
                             } catch(err) {}
                        }
                    }
                }

                if (!json) {
                    console.error('Raw response parsing failed:', body.substring(0, 200));
                    reject(new Error('Failed to parse JSON response'));
                    return;
                }

                // Check for Token Expiry / Empty
                if (json.ret && json.ret[0] && (json.ret[0].startsWith('FAIL_SYS_TOKEN_EXPIRED') || json.ret[0].startsWith('FAIL_SYS_TOKEN_EMPTY'))) {
                    if (retryCount < 3) {
                        console.log(`🔄 Token expired or empty (${json.ret[0]}), retrying... (Attempt ${retryCount + 1})`);
                        // The response headers should have updated the token already.
                        // We assume DAMAI_CONFIG is updated by the set-cookie logic above.
                        resolve(makeRequest(api, dataObj, callbackName, retryCount + 1));
                        return;
                    } else {
                        console.error('❌ Token refresh failed after multiple retries.');
                    }
                }

                resolve(json);
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
    
    const { onProgress } = DAMAI_CONFIG;
    if (onProgress) onProgress('Starting sync...', 0);

    // Validate config or Auto-Handshake
    if (!DAMAI_CONFIG.cookie || !DAMAI_CONFIG.tokenWithTime) {
        console.log('⚠️ Missing Cookie or Token. Attempting Auto-Handshake...');
        if (onProgress) onProgress('Auto-authenticating...', 1);
        
        try {
            await fetchInitialToken();
        } catch (e: any) {
             console.error('❌ Auto-Handshake Failed:', e);
             return { success: false, totalNew: 0, totalCombined: 0, message: `Auto-Auth Failed: ${e.message}` };
        }
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

        // Also fetch all other cities from 'groups'
        let allCities: HotCity[] = [...hotCities];
        const groups = cityRes.data?.groups;
        if (Array.isArray(groups)) {
            console.log(`✅ Found ${groups.length} city groups (A-Z). Parsing...`);
            groups.forEach((group: any) => {
                if (Array.isArray(group.sites)) {
                    group.sites.forEach((site: any) => {
                        allCities.push({
                            cityId: site.cityId,
                            cityName: site.cityName,
                            url: site.url || ''
                        });
                    });
                }
            });
        }
        
        // Deduplicate cities by cityId
        const uniqueCitiesMap = new Map<string, HotCity>();
        allCities.forEach(c => uniqueCitiesMap.set(c.cityId, c));
        let uniqueCities = Array.from(uniqueCitiesMap.values());

        // --- Filter Blacklisted Cities ---
        const beforeFilterCount = uniqueCities.length;
        uniqueCities = uniqueCities.filter(c => {
            // Check if city name contains any blacklisted keyword
            const isBlacklisted = CITY_BLACKLIST.some(b => c.cityName.includes(b));
            if (isBlacklisted) {
                // console.log(`   🚫 Skipping city: ${c.cityName}`);
            }
            return !isBlacklisted;
        });
        const afterFilterCount = uniqueCities.length;
        
        console.log(`✅ Total Unique Cities Found: ${beforeFilterCount}`);
        if (beforeFilterCount > afterFilterCount) {
             console.log(`🚫 Filtered ${beforeFilterCount - afterFilterCount} overseas/excluded cities.`);
        }
        console.log(`✅ Final Cities to Fetch: ${afterFilterCount}`);
        
        if (onProgress) onProgress(`Found ${afterFilterCount} cities (Filtered ${beforeFilterCount - afterFilterCount} overseas). Starting crawl...`, 5);

        if (uniqueCities.length === 0) {
            console.error('❌ No cities found. Check Token.');
            return { success: false, totalNew: 0, totalCombined: 0, message: 'Token invalid (No cities found)' };
        }

        // 2. Fetch Concerts for each city
        let allConcerts: Concert[] = [];
        const citiesToFetch = uniqueCities; // Fetch ALL unique cities

        for (const [index, city] of citiesToFetch.entries()) {
            const percentage = 5 + Math.floor((index / citiesToFetch.length) * 85);
            if (onProgress) onProgress(`Fetching ${city.cityName} (${index + 1}/${citiesToFetch.length})...`, percentage);
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
        if (onProgress) onProgress('Processing and cleaning data...', 90);

        // DeepSeek Extraction
        if (DAMAI_CONFIG.deepseekApiKey) {
            console.log('🤖 DeepSeek API Key found, starting artist extraction...');
            if (onProgress) onProgress('Enhancing data with AI...', 92);
            allConcerts = await extractArtistsWithDeepSeek(allConcerts, DAMAI_CONFIG.deepseekApiKey);
        } else {
            console.log('ℹ️ No DeepSeek API Key provided, skipping artist extraction.');
        }

        // --- MoreTickets Integration ---
        try {
            console.log('🎫 Starting MoreTickets Sync...');
            if (onProgress) onProgress('Fetching from MoreTickets...', 95);
            
            let moreTicketsConcerts = await fetchAllMoreTicketsConcerts((msg) => console.log(msg));
            console.log(`🎫 Fetched ${moreTicketsConcerts.length} items from MoreTickets.`);

            if (DAMAI_CONFIG.deepseekApiKey && moreTicketsConcerts.length > 0) {
                console.log('🤖 Enhancing MoreTickets data with AI...');
                moreTicketsConcerts = await extractArtistsWithDeepSeek(moreTicketsConcerts, DAMAI_CONFIG.deepseekApiKey);
            }

            // Merge MoreTickets into allConcerts (Damai is primary)
            const combinedFetched = mergeConcertLists(allConcerts, moreTicketsConcerts);
            console.log(`✅ Combined Fetched: ${combinedFetched.length} (Original Damai: ${allConcerts.length})`);
            allConcerts = combinedFetched;
        } catch (mtError) {
            console.error('❌ MoreTickets Sync Failed (continuing with Damai only):', mtError);
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

        if (onProgress) onProgress('Saving data...', 98);
        fs.writeFileSync(DATA_FILE, JSON.stringify(mergedConcerts, null, 2));
        console.log(`🎉 Data saved to ${DATA_FILE}`);
        if (onProgress) onProgress('Sync complete!', 100);

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
