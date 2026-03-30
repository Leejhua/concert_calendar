import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fetchAllMoreTicketsConcerts } from './moretickets-crawler';
import { fetchMoreTicketsGlobalConcerts } from './moretickets-global-crawler';
import { mergeConcertLists } from './deduplication';
import { saveConcertsToStorage, getAllConcertsFromStorage } from './db';

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

interface DamaiConfig {
    appKey: string;
    tokenWithTime: string;
    cookie: string;
    referer: string;
    deepseekApiKey?: string;
    onProgress?: (message: string, progress: number) => void;
}

export interface SyncResult {
    success: boolean;
    totalNew: number;
    totalCombined: number;
    message?: string;
    timedOutSources?: string[];   // sources that hit the timeout
    failedSources?: string[];     // sources that errored out
}

// --- Configuration ---
const DATA_DIR = path.join(process.cwd(), 'data');

// Keywords that indicate a "low value" or "fake" concert
const BLACKLIST_KEYWORDS = ['烛光', '致敬', '模仿', '重现', '同人', '纪念', '追忆', '作品音乐会', '见面会', '金曲', '情歌', '表白'];

// Keywords that indicate a "fake" artist tag
const INVALID_ARTIST_TAGS = ['演唱会', '榜', '热销', '上新', '优选', '折扣', '推荐', '必看', '演出', '麦', '歌手', '音乐会'];

// Cities to exclude (Overseas + Taiwan)
// Keeping ONLY Mainland China + Hong Kong + Macau + Taiwan + Selected Asia
export const CITY_BLACKLIST = [
    // --- Allowed Regions (Commented out = Allowed) ---
    // Taiwan: '台北', '高雄', '桃园', '台中', '台南', '新北', '台湾',
    // Japan: '东京', '大阪', '名古屋', '福冈', '横滨', '神户', '札幌', '埼玉', '日本',
    // SE Asia: '曼谷', '清迈', '普吉', '泰国', '新加坡', '吉隆坡', '槟城', '新山', '雅加达', '巴厘岛', '河内', '胡志明', '马尼拉', '金边',
    // Korea: '首尔', '仁川', '釜山', '高阳', '韩国',
    
    // --- Blacklisted Regions ---
    // Oceania
    '悉尼', '墨尔本', '布里斯班', '珀斯', '阿德莱德', '堪培拉', '奥克兰', '惠灵顿', '新西兰',
    // Europe
    '伦敦', '曼彻斯特', '爱丁堡', '伯明翰', '英国', '巴黎', '法国', '柏林', '慕尼黑', '法兰克福', '汉堡', '德国',
    '米兰', '罗马', '意大利', '马德里', '巴塞罗那', '西班牙', '阿姆斯特丹', '荷兰', '莫斯科', '圣彼得堡', '俄罗斯',
    '捷克', '布拉格', '瑞典', '斯德哥尔摩', '爱尔兰', '都柏林',
    // North America
    '纽约', '洛杉矶', '旧金山', '拉斯维加斯', '芝加哥', '波士顿', '华盛顿', '西雅图', '多伦多', '温哥华', '蒙特利尔',
    // Middle East
    '迪拜', '阿布扎比'
];

// Default config
let DAMAI_CONFIG: DamaiConfig = {
    appKey: '12574478',
    tokenWithTime: '',
    cookie: '',
    referer: 'https://m.damai.cn/shows/category.html?categoryId=2394&clicktitle=%E6%BC%94%E5%94%B1%E4%BC%9A',
    deepseekApiKey: '',
    onProgress: undefined
};

const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_MAX_RETRY = 3;
const TASK_TIMEOUT_MS = 30 * 60 * 1000;
const RETRYABLE_RET_MARKERS = [
    'FAIL_SYS_TOKEN_EXPIRED',
    'FAIL_SYS_TOKEN_EMPTY',
    'FAIL_SYS_ILLEGAL_ACCESS',
    'FAIL_SYS_USER_VALIDATE',
    'RGV587_ERROR',
    'FAIL_BIZ_SYSTEM_ERROR',
    'FAIL_SYS_TRAFFIC_LIMIT'
];

// --- Anti-Detection: Rotating User-Agents ---
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
];

function getRandomUA(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Random delay between min and max ms */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
    return delay(minMs + Math.floor(Math.random() * (maxMs - minMs)));
}

function getBackoffMs(retryCount: number): number {
    return Math.min(2000 * Math.pow(2, retryCount), 16000) + Math.floor(Math.random() * 1000);
}

function getPrimaryRetMessage(json: any): string {
    if (!json || !Array.isArray(json.ret) || !json.ret.length) return '';
    return String(json.ret[0] || '');
}

function isRetryableRet(message: string): boolean {
    return RETRYABLE_RET_MARKERS.some(marker => message.includes(marker));
}

export async function fetchInitialToken(): Promise<void> {
    console.log('🔄 Auto-Handshake: Fetching fresh token...');
    return new Promise((resolve, reject) => {
        const api = 'mtop.damai.wireless.area.groupcity';
        const t = Date.now();
        const dataObj = { platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5" };
        const dataStr = JSON.stringify(dataObj);
        const sign = generateSign('', t, DAMAI_CONFIG.appKey, dataStr);
        
        const params = new URLSearchParams({
            jsv: '2.7.5', appKey: DAMAI_CONFIG.appKey, t: String(t), sign: sign,
            api: api, v: '1.2', type: 'json', dataType: 'json', data: dataStr
        });

        const options = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/1.2/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'user-agent': getRandomUA(),
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

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`Handshake timeout after ${REQUEST_TIMEOUT_MS}ms`));
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

export function makeRequest(api: string, dataObj: any, callbackName?: string, retryCount = 0): Promise<any> {
    return new Promise((resolve, reject) => {
        const token = DAMAI_CONFIG.tokenWithTime ? DAMAI_CONFIG.tokenWithTime.split('_')[0] : '';
        const t = Date.now();
        const dataStr = JSON.stringify(dataObj);
        const sign = generateSign(token, t, DAMAI_CONFIG.appKey, dataStr);

        const params = new URLSearchParams({
            jsv: '2.7.5', appKey: DAMAI_CONFIG.appKey, t: String(t), sign: sign,
            api: api, v: '1.2', H5Request: 'true', type: 'jsonp', timeout: '10000',
            forceAntiCreep: 'true', AntiCreep: 'true', dataType: 'jsonp', data: dataStr
        });

        if (callbackName) params.set('callback', callbackName);

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
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cookie': DAMAI_CONFIG.cookie,
                'referer': DAMAI_CONFIG.referer,
                'user-agent': getRandomUA(),
            }
        };

        const retryWithBackoff = (reason: string, refreshToken = false) => {
            if (retryCount >= REQUEST_MAX_RETRY) {
                reject(new Error(`[${api}] ${reason} | reached max retry ${REQUEST_MAX_RETRY}`));
                return;
            }
            const nextAttempt = retryCount + 1;
            const waitMs = getBackoffMs(retryCount);
            const runRetry = async () => {
                try {
                    if (refreshToken) {
                        await fetchInitialToken();
                    }
                    resolve(makeRequest(api, dataObj, callbackName, nextAttempt));
                } catch (err: any) {
                    reject(new Error(`[${api}] retry preparation failed: ${err.message}`));
                }
            };
            console.warn(`⚠️ [${api}] ${reason}, retrying in ${waitMs}ms (attempt ${nextAttempt}/${REQUEST_MAX_RETRY})`);
            setTimeout(runRetry, waitMs);
        };

        const req = https.request(options, (res) => {
            const statusCode = res.statusCode || 0;
            if (statusCode >= 500) {
                retryWithBackoff(`HTTP ${statusCode}`);
                return;
            }

            // Update cookies
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                const newCookies = setCookie.map(c => c.split(';')[0]).join('; ');
                const tokenMatch = newCookies.match(/_m_h5_tk=([^;]+)/);
                if (tokenMatch) {
                    DAMAI_CONFIG.tokenWithTime = tokenMatch[1];
                    DAMAI_CONFIG.cookie = newCookies; 
                }
            }

            let chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                let json: any = null;

                // JSONP/JSON Parsing
                if (callbackName && body.includes(callbackName + '(')) {
                    try {
                        const start = body.indexOf(callbackName + '(') + callbackName.length + 1;
                        const end = body.lastIndexOf(')');
                        json = JSON.parse(body.substring(start, end));
                    } catch (e: any) {
                        retryWithBackoff(`Failed to parse JSONP: ${e.message}`);
                        return;
                    }
                } else {
                    try {
                        json = JSON.parse(body);
                    } catch (e) {
                        // Fallback for mtopjsonp
                         if (body.trim().startsWith('mtopjsonp')) {
                             const start = body.indexOf('(') + 1;
                             const end = body.lastIndexOf(')');
                             try { json = JSON.parse(body.substring(start, end)); } catch(err) {}
                        }
                    }
                }

                if (!json) {
                    console.error('Raw response parsing failed:', body.substring(0, 200));
                    retryWithBackoff('Failed to parse JSON response');
                    return;
                }

                const primaryRet = getPrimaryRetMessage(json);
                if (primaryRet) {
                    if (primaryRet.startsWith('FAIL_SYS_TOKEN_EXPIRED') || primaryRet.startsWith('FAIL_SYS_TOKEN_EMPTY')) {
                        retryWithBackoff(primaryRet, true);
                        return;
                    }
                    if (isRetryableRet(primaryRet)) {
                        retryWithBackoff(primaryRet);
                        return;
                    }
                }
                resolve(json);
            });
        });

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`));
        });
        req.on('error', (e: any) => {
            retryWithBackoff(e.message || 'Network error');
        });
        req.end();
    });
}

export function parseConcertNodes(nodes: any[], cityName: string): Concert[] {
    const results: Concert[] = [];
    if (!nodes) return results;

    for (const node of nodes) {
        if (node.type === '7587' && node.data && (node.data.itemId || node.data.id)) {
            const item = node.data;
            const showTag = item.showTag;
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
                artist: isValidTag ? showTag : '',
                is_famous: isValidTag,
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

export async function extractArtistsWithDeepSeek(concerts: Concert[], apiKey: string): Promise<Concert[]> {
    if (!concerts.length) return concerts;
    console.log(`🤖 DeepSeek: Processing ${concerts.length} items...`);

    const concertsToProcess: Concert[] = [];
    const titlesToProcess: string[] = [];

    concerts.forEach(c => {
        const isBlacklisted = BLACKLIST_KEYWORDS.some(keyword => c.title.includes(keyword));
        if (isBlacklisted) {
            c.artist = 'Unknown';
            c.is_tribute = true;
        } else {
            let hasValidOfficialArtist = false;
            if (c.artist && c.artist !== '群星' && c.artist !== 'Unknown') {
                const isArtistBlacklisted = BLACKLIST_KEYWORDS.some(keyword => c.artist!.includes(keyword));
                if (!isArtistBlacklisted) hasValidOfficialArtist = true;
            }

            if (hasValidOfficialArtist) {
                if (!c.title.startsWith('【')) c.title = `【${c.artist}】${c.title}`;
            } else {
                concertsToProcess.push(c);
                titlesToProcess.push(c.title);
            }
        }
    });

    if (titlesToProcess.length === 0) {
        console.log('✨ All items were handled by blacklist or official tags. Skipping AI.');
        return concerts;
    }

    console.log(`   📝 Sending ${titlesToProcess.length} titles to DeepSeek (in batches)...`);

    // Process in batches of 50 to avoid oversized prompts
    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < titlesToProcess.length; i += BATCH_SIZE) {
        batches.push(titlesToProcess.slice(i, i + BATCH_SIZE));
    }

    const allResults: Record<string, any> = {};

    for (const [batchIdx, batch] of batches.entries()) {
        console.log(`   🤖 DeepSeek batch ${batchIdx + 1}/${batches.length} (${batch.length} titles)...`);

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
${JSON.stringify(batch)}
    `;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 1000); // 2 min per batch

        let response: Response;
        try {
            response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant that extracts artist names and filters low-value events.' },
                        { role: 'user', content: prompt }
                    ],
                    stream: false,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            console.error(`DeepSeek API Failed on batch ${batchIdx + 1}: ${response.status}`);
            continue; // skip this batch, keep going
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        try {
            const batchResult = JSON.parse(content);
            Object.assign(allResults, batchResult);
        } catch (e) {
            console.error(`DeepSeek batch ${batchIdx + 1} parse error, skipping.`);
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error(`DeepSeek batch ${batchIdx + 1} timed out after 2 minutes, skipping.`);
        } else {
            console.error(`DeepSeek batch ${batchIdx + 1} error:`, error);
        }
        // continue with next batch
    }
    }

    // Apply results
    const result = allResults;

        concertsToProcess.forEach(c => {
            const info = result[c.title];
            if (info) {
                if (typeof info === 'string') {
                    c.artist = info; c.is_tribute = false; c.is_famous = true;
                } else {
                    c.artist = info.artist || 'Unknown';
                    c.is_tribute = info.is_tribute || false;
                    c.is_famous = info.is_famous !== undefined ? info.is_famous : true;
                }

                if (c.is_tribute || !c.is_famous) c.artist = 'Unknown';
                if (!c.is_famous) c.artist = 'Unknown';

                if (c.artist !== 'Unknown' && !c.title.startsWith('【')) {
                    c.title = `【${c.artist}】${c.title}`;
                }
            }
        });
        return concerts;
}

export async function getTargetCityList(): Promise<string[]> {
    if (!DAMAI_CONFIG.cookie || !DAMAI_CONFIG.tokenWithTime) {
        await fetchInitialToken();
    }

    const cityRes = await makeRequest('mtop.damai.wireless.area.groupcity', {
        platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5"
    }, 'mtopjsonp4');

    const hotCities: HotCity[] = cityRes.data?.hotCities || cityRes.data?.hotCity || [];
    let allCities: HotCity[] = [...hotCities];
    const groups = cityRes.data?.groups;
    if (Array.isArray(groups)) {
        groups.forEach((group: any) => {
            if (Array.isArray(group.sites)) {
                group.sites.forEach((site: any) => allCities.push({ cityId: site.cityId, cityName: site.cityName, url: site.url || '' }));
            }
        });
    }

    // Deduplicate & Filter Cities
    const uniqueCitiesMap = new Map<string, HotCity>();
    allCities.forEach(c => uniqueCitiesMap.set(c.cityId, c));
    const uniqueCities = Array.from(uniqueCitiesMap.values())
        .filter(c => !CITY_BLACKLIST.some(b => c.cityName.includes(b)))
        .map(c => c.cityName);

    return uniqueCities;
}

// --- Independent Task Runners ---

async function runDamaiTask(onProgress: (msg: string, percent: number) => void): Promise<Concert[]> {
    console.log('1. Fetching Damai City List...');
    if (onProgress) onProgress('Fetching Damai City List...', 0);

    const cityRes = await makeRequest('mtop.damai.wireless.area.groupcity', {
        platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5"
    }, 'mtopjsonp4');

    const hotCities: HotCity[] = cityRes.data?.hotCities || cityRes.data?.hotCity || [];
    let allCities: HotCity[] = [...hotCities];
    const groups = cityRes.data?.groups;
    if (Array.isArray(groups)) {
        groups.forEach((group: any) => {
            if (Array.isArray(group.sites)) {
                group.sites.forEach((site: any) => allCities.push({ cityId: site.cityId, cityName: site.cityName, url: site.url || '' }));
            }
        });
    }

    // Deduplicate & Filter Cities
    const uniqueCitiesMap = new Map<string, HotCity>();
    allCities.forEach(c => uniqueCitiesMap.set(c.cityId, c));
    const uniqueCities = Array.from(uniqueCitiesMap.values()).filter(c => !CITY_BLACKLIST.some(b => c.cityName.includes(b)));

    console.log(`✅ Final Cities to Fetch: ${uniqueCities.length}`);
    if (uniqueCities.length === 0) {
        console.warn('No cities found for Damai.');
        return [];
    }

    if (onProgress) onProgress(`Found ${uniqueCities.length} cities. Starting Damai crawl...`, 5);

    let allConcerts: Concert[] = [];
    const citiesToFetch = uniqueCities;
    // Track failed cities for logging (don't block the whole sync)
    const failedCities: string[] = [];

    for (const [index, city] of citiesToFetch.entries()) {
        const percentage = 5 + Math.floor((index / citiesToFetch.length) * 85); // 5% -> 90%
        if (onProgress) onProgress(`Fetching Damai: ${city.cityName} (${index + 1}/${citiesToFetch.length})...`, percentage);
        
        const fetchedIdsInThisCity = new Set<string>();
        let cityErrorCount = 0;
        let consecutiveEmptyPages = 0;

        for (let page = 1; page <= 50; page++) {
            // Randomized delay: 1.5-4s between pages (longer for later pages to avoid rate limits)
            const baseDelay = page <= 3 ? 1500 : 2500;
            await randomDelay(baseDelay, baseDelay + 2000);

            const cityStartPercent = 5 + Math.floor((index / citiesToFetch.length) * 85);
            const citySpanPercent = Math.max(1, Math.floor(85 / citiesToFetch.length));
            const pageProgress = cityStartPercent + Math.min(citySpanPercent, Math.floor((page / 50) * citySpanPercent));
            if (onProgress) onProgress(`Fetching Damai: ${city.cityName} (${index + 1}/${citiesToFetch.length}) - page ${page}`, pageProgress);

            const args = {
                comboConfigRule: "true", sortType: "3", latitude: "0", longitude: "0",
                groupId: "2394", comboCityId: city.cityId, currentCityId: city.cityId,
                platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5",
                pageIndex: String(page), pageSize: "20"
            };
            
            try {
                const res = await makeRequest('mtop.damai.mec.aristotle.get', {
                    args: JSON.stringify(args), patternName: "category_solo", patternVersion: "4.2",
                    platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5"
                });

                if (res.ret && res.ret[0].startsWith('SUCCESS')) {
                    const items = parseConcertNodes(res.data?.nodes, city.cityName);
                    cityErrorCount = 0; // reset on success

                    if (items.length === 0) {
                        consecutiveEmptyPages++;
                        if (consecutiveEmptyPages >= 2) break; // 2 empty pages = done
                        continue;
                    }
                    consecutiveEmptyPages = 0;

                    let newItemsCount = 0;
                    for (const item of items) {
                        if (!fetchedIdsInThisCity.has(item.id)) {
                            fetchedIdsInThisCity.add(item.id);
                            allConcerts.push(item);
                            newItemsCount++;
                        }
                    }
                    if (newItemsCount === 0 || items.length < 20) break;
                } else {
                    cityErrorCount++;
                    const retMsg = getPrimaryRetMessage(res) || 'Unknown ret';
                    console.warn(`Damai ${city.cityName} page ${page} non-success: ${retMsg}`);

                    // If risk control detected, back off longer before retry
                    const isRiskControl = retMsg.includes('RGV587') || retMsg.includes('TRAFFIC_LIMIT') || retMsg.includes('ILLEGAL_ACCESS');
                    if (isRiskControl) {
                        console.warn(`⚠️ Risk control detected for ${city.cityName}. Backing off 15-30s...`);
                        await randomDelay(15000, 30000);
                    }

                    if (cityErrorCount >= 3) {
                        console.warn(`Damai ${city.cityName} reached error threshold, skipping.`);
                        failedCities.push(city.cityName);
                        break;
                    }
                    await delay(getBackoffMs(cityErrorCount));
                }
            } catch (err: any) {
                cityErrorCount++;
                console.error(`Damai ${city.cityName} page ${page}: ${err.message}`);
                if (cityErrorCount >= 3) {
                    console.warn(`Damai ${city.cityName} skipped after repeated errors.`);
                    failedCities.push(city.cityName);
                    break;
                }
                await delay(getBackoffMs(cityErrorCount));
            }
        }

        // Inter-city delay: 3-7s to avoid triggering rate limits across cities
        if (index < citiesToFetch.length - 1) {
            await randomDelay(3000, 7000);
        }
    }

    if (failedCities.length > 0) {
        console.warn(`⚠️ Damai: ${failedCities.length} cities were skipped due to errors: ${failedCities.join(', ')}`);
    }

    // DeepSeek Enhancement
    if (DAMAI_CONFIG.deepseekApiKey && allConcerts.length > 0) {
        if (onProgress) onProgress('Enhancing Damai data with AI...', 95);
        allConcerts = await extractArtistsWithDeepSeek(allConcerts, DAMAI_CONFIG.deepseekApiKey);
    }
    
    if (onProgress) onProgress('Damai task complete', 100);
    return allConcerts;
}

async function runMobileTask(onProgress: (msg: string, percent: number) => void): Promise<Concert[]> {
    console.log('🎫 Starting MoreTickets (Mobile) Sync...');
    if (onProgress) onProgress('Fetching from MoreTickets (Mobile)...', 0);
    
    let concerts = await fetchAllMoreTicketsConcerts((msg, prog) => {
        if (onProgress && prog !== undefined) {
            onProgress(msg, Math.floor(prog * 0.9)); // 0-90%
        }
    });

    if (DAMAI_CONFIG.deepseekApiKey && concerts.length > 0) {
        console.log('🤖 Enhancing MoreTickets (Mobile) data with AI...');
        if (onProgress) onProgress('Enhancing MoreTickets (Mobile) data with AI...', 95);
        concerts = await extractArtistsWithDeepSeek(concerts, DAMAI_CONFIG.deepseekApiKey);
    }
    
    if (onProgress) onProgress('Mobile task complete', 100);
    return concerts;
}

async function runGlobalTask(onProgress: (msg: string, percent: number) => void): Promise<Concert[]> {
    console.log('🌍 Starting MoreTickets (Global PC) Sync...');
    if (onProgress) onProgress('Fetching from MoreTickets (Global PC)...', 0);

    let concerts = await fetchMoreTicketsGlobalConcerts((msg, prog) => {
        if (onProgress && prog !== undefined) {
            onProgress(msg, Math.floor(prog * 0.9)); // 0-90%
        }
    });

    if (DAMAI_CONFIG.deepseekApiKey && concerts.length > 0) {
        console.log('🤖 Enhancing MoreTickets (Global) data with AI...');
        if (onProgress) onProgress('Enhancing MoreTickets (Global) data with AI...', 95);
        concerts = await extractArtistsWithDeepSeek(concerts, DAMAI_CONFIG.deepseekApiKey);
    }

    if (onProgress) onProgress('Global task complete', 100);
    return concerts;
}

async function withTaskTimeout<T>(taskName: string, task: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`${taskName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        return await Promise.race([task, timeoutPromise]);
    } finally {
        clearTimeout(timeoutHandle!);
    }
}

// --- Main Execution ---

export async function syncData(config?: Partial<DamaiConfig>): Promise<SyncResult> {
    console.log('🚀 Starting Parallel Data Sync...');
    if (config) DAMAI_CONFIG = { ...DAMAI_CONFIG, ...config };
    
    const { onProgress } = DAMAI_CONFIG;
    if (onProgress) onProgress('Starting parallel sync...', 0);

    // 1. Authentication (Global prerequisite)
    if (!DAMAI_CONFIG.cookie || !DAMAI_CONFIG.tokenWithTime) {
        if (onProgress) onProgress('Auto-authenticating...', 1);
        try { await fetchInitialToken(); } 
        catch (e: any) { return { success: false, totalNew: 0, totalCombined: 0, message: `Auto-Auth Failed: ${e.message}` }; }
    }

    ensureDataDir();

    // 2. Setup Progress Tracker
    const progressState = {
        damai: 0,
        mobile: 0,
        global: 0
    };

    const updateProgress = (source: 'damai' | 'mobile' | 'global', percent: number, msg: string) => {
        progressState[source] = percent;
        // Weights: Damai 55%, Mobile 25%, Global 20%
        const total = Math.floor(
            (progressState.damai * 0.55) + 
            (progressState.mobile * 0.25) + 
            (progressState.global * 0.20)
        );
        // Only update if total > 0 to avoid 0 flickering
        if (onProgress) onProgress(msg, total);
    };

    try {
        // 3. Launch Parallel Tasks
        console.log('⚡ Launching tasks in parallel...');
        
        const settledResults = await Promise.allSettled([
            withTaskTimeout('Damai task', runDamaiTask((msg, p) => updateProgress('damai', p, msg)), TASK_TIMEOUT_MS),
            withTaskTimeout('MoreTickets mobile task', runMobileTask((msg, p) => updateProgress('mobile', p, msg)), TASK_TIMEOUT_MS),
            withTaskTimeout('MoreTickets global task', runGlobalTask((msg, p) => updateProgress('global', p, msg)), TASK_TIMEOUT_MS)
        ]);

        const damaiResult = settledResults[0].status === 'fulfilled' ? settledResults[0].value : [];
        const mobileResult = settledResults[1].status === 'fulfilled' ? settledResults[1].value : [];
        const globalResult = settledResults[2].status === 'fulfilled' ? settledResults[2].value : [];

        const timedOutSources: string[] = [];
        const failedSources: string[] = [];

        const taskMeta = [
            { name: '大麦网', result: settledResults[0] },
            { name: '摩天轮(移动)', result: settledResults[1] },
            { name: '摩天轮(全球)', result: settledResults[2] },
        ];

        for (const { name, result } of taskMeta) {
            if (result.status === 'rejected') {
                const msg = result.reason?.message || '';
                if (msg.includes('timed out')) {
                    timedOutSources.push(name);
                    console.error(`⏱️ ${name} timed out`);
                } else {
                    failedSources.push(name);
                    console.error(`❌ ${name} failed:`, msg);
                }
            }
        }

        if (!damaiResult.length && !mobileResult.length && !globalResult.length) {
            throw new Error('All data sources failed or timed out.');
        }

        // 4. Merge Results (Priority: Damai > Mobile > Global)
        console.log('🔄 Merging results...');
        if (onProgress) onProgress('Merging data...', 98);
        
        let combined = mergeConcertLists(damaiResult, mobileResult);
        combined = mergeConcertLists(combined, globalResult);

        // 5. Save Data
        let existingConcerts: Concert[] = [];
        try {
            existingConcerts = await getAllConcertsFromStorage();
        } catch (e) {
            console.warn('⚠️ Failed to load existing data from storage.');
        }

        const mergedConcerts = mergeConcertLists(existingConcerts, combined);

        await saveConcertsToStorage(mergedConcerts);
        console.log(`🎉 Data saved to storage`);
        if (onProgress) onProgress('Sync complete!', 100);

        const parts: string[] = [];
        if (timedOutSources.length) parts.push(`超时: ${timedOutSources.join('、')}`);
        if (failedSources.length) parts.push(`失败: ${failedSources.join('、')}`);
        const summaryMsg = parts.length ? parts.join(' | ') : undefined;

        return {
            success: true,
            totalNew: mergedConcerts.length - existingConcerts.length,
            totalCombined: mergedConcerts.length,
            message: summaryMsg,
            timedOutSources,
            failedSources,
        };

    } catch (err: any) {
        console.error('❌ Fatal Error in Parallel Sync:', err);
        return { success: false, totalNew: 0, totalCombined: 0, message: err.message };
    }
}
