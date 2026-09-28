/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fetchAllMoreTicketsConcerts } from './moretickets-crawler';
import { fetchMoreTicketsGlobalConcerts } from './moretickets-global-crawler';
import { splitArtistNames } from './concert-identity';
import { extractConcertIdentityWithAI } from './concert-identity-ai';
import { mergeConcertLists } from './deduplication';
import { saveConcertsToStorage, getAllConcertsFromStorage } from './db';
// Proxy support: side-effect import configures the global fetch dispatcher; the
// per-request agent is injected into every `https.request` call below.
import { getProxyAgent } from './proxy-agent';
// Proxy pool: node management for risk-control resilience
import { handleNodeFailure, markNodeCooldown, getCurrentNode } from './proxy-pool';
// Checkpoint persistence for resumable crawls
import { getCompletedCities, updateSourceProgress, clearProgress } from './crawl-progress';
// Proxy-aware retry logic
import { withProxyRetry } from './proxy-retry';

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
    rawTitle?: string;
    rawArtistTag?: string;
    artistPrimary?: string;
    artistAll?: string[];
    eventType?: 'solo' | 'multi_artist' | 'tribute' | 'fan_meeting' | 'festival' | 'other' | 'unknown';
    artistConfidence?: number | null;
    artistSource?: 'official_tag' | 'rule' | 'llm' | 'manual' | 'legacy' | 'unknown';
    is_tribute?: boolean; // Whether it's a tribute/imitation concert
    is_famous?: boolean;  // Whether the artist is well-known
    updatedAt: number;
    source?: 'damai' | 'moretickets' | 'moretickets-global';
    sourceUrl?: string;
    eventDate?: string | null;
    eventTime?: string | null;
    sortAt?: string | null;
    opportunityStatus?: 'new' | 'watching' | 'qualified' | 'ignored' | 'converted';
    opportunityScore?: number;
    opportunityScoreBreakdown?: Array<{ key: string; label: string; delta: number; matched: boolean }>;
    lastSeenAt?: number;
    projectId?: string | null;
    notes?: string;
    normalizedCity?: string;
    normalizedVenue?: string;
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
const TASK_TIMEOUT_MS = 60 * 60 * 1000;
const RETRYABLE_RET_MARKERS = [
    'FAIL_SYS_TOKEN_EXPIRED',
    'FAIL_SYS_TOKEN_EMPTY',
    'FAIL_SYS_ILLEGAL_ACCESS',
    'FAIL_SYS_USER_VALIDATE',
    'RGV587_ERROR',
    'FAIL_BIZ_SYSTEM_ERROR',
    'FAIL_SYS_TRAFFIC_LIMIT'
];

// --- Anti-Detection: UA Pool (20 entries, city-bound) ---
const UA_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];

function hashCode(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function getUAForCity(cityName: string): string {
    return UA_POOL[Math.abs(hashCode(cityName)) % UA_POOL.length];
}

/** Fallback: random UA from the pool for non-city requests (handshake, city list). */
function getRandomUA(): string {
    return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

// --- Anti-Detection: Accept-Language randomization ---
const ACCEPT_LANGUAGES = [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'zh-CN,zh;q=0.9',
    'zh-TW,zh;q=0.8,en;q=0.7',
    'en-US,en;q=0.9,zh-CN;q=0.8',
];

function getRandomAcceptLanguage(): string {
    return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
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

        const options: https.RequestOptions = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/1.2/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'user-agent': getRandomUA(),
            },
            // Route through the configured HTTP proxy (null => default agent).
            agent: getProxyAgent() ?? undefined,
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

/**
 * Make an HTTP request to the Damai MTOP API.
 *
 * The request is wrapped in two independent retry layers:
 * 1. Proxy retry (via withProxyRetry): handles ECONNRESET/ECONNREFUSED/ETIMEDOUT
 *    with up to 3 attempts and escalating delays.
 * 2. API-level retry (via retryWithBackoff): handles HTTP 5xx, parse failures,
 *    token expiry, and retryable `ret` messages with up to REQUEST_MAX_RETRY attempts.
 *
 * Proxy retry is exhausted first; only then does the error fall through to
 * API-level retry. The two retry counters (proxyRetryCount inside withProxyRetry
 * and retryCount for API retries) are independent.
 */
export function makeRequest(api: string, dataObj: any, callbackName?: string, retryCount = 0, cancelled?: { value: boolean }, cityName?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // Check cancellation before even starting
        if (cancelled?.value) {
            reject(new Error('cancelled'));
            return;
        }

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

        const options: https.RequestOptions = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/${params.get('v')}/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': getRandomAcceptLanguage(),
                'cookie': DAMAI_CONFIG.cookie,
                'referer': DAMAI_CONFIG.referer,
                'user-agent': cityName ? getUAForCity(cityName) : getRandomUA(),
            },
            // Route through the configured HTTP proxy (null => default agent).
            agent: getProxyAgent() ?? undefined,
        };

        /**
         * API-level retry with exponential backoff.
         * Called when proxy retry is exhausted or the error is not proxy-related.
         */
        const retryWithBackoff = (reason: string, refreshToken = false) => {
            if (retryCount >= REQUEST_MAX_RETRY) {
                reject(new Error(`[${api}] ${reason} | reached max retry ${REQUEST_MAX_RETRY}`));
                return;
            }
            const nextAttempt = retryCount + 1;
            const waitMs = getBackoffMs(retryCount);
            const runRetry = async () => {
                try {
                    if (cancelled?.value) {
                        reject(new Error('cancelled'));
                        return;
                    }
                    if (refreshToken) {
                        await fetchInitialToken();
                    }
                    resolve(makeRequest(api, dataObj, callbackName, nextAttempt, cancelled, cityName));
                } catch (err: any) {
                    reject(new Error(`[${api}] retry preparation failed: ${err.message}`));
                }
            };
            console.warn(`⚠️ [${api}] ${reason}, retrying in ${waitMs}ms (attempt ${nextAttempt}/${REQUEST_MAX_RETRY})`);
            setTimeout(runRetry, waitMs);
        };

        /**
         * Inner HTTP request function — the raw https.request call.
         * This is wrapped by withProxyRetry for proxy-level retry.
         * On any error (network, HTTP, parse), it rejects so the caller
         * can decide whether to proxy-retry or fall through to API retry.
         */
        const doHttpRequest = (): Promise<any> => {
            return new Promise((innerResolve, innerReject) => {
                if (cancelled?.value) {
                    innerReject(new Error('cancelled'));
                    return;
                }

                const req = https.request(options, (res) => {
                    const statusCode = res.statusCode || 0;
                    if (statusCode >= 500) {
                        innerReject(new Error(`HTTP ${statusCode}`));
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
                                innerReject(new Error(`Failed to parse JSONP: ${e.message}`));
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
                            innerReject(new Error('Failed to parse JSON response'));
                            return;
                        }

                        const primaryRet = getPrimaryRetMessage(json);
                        if (primaryRet && !primaryRet.startsWith('SUCCESS')) {
                            innerReject(new Error(primaryRet));
                            return;
                        }
                        innerResolve(json);
                    });
                });

                req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                    req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`));
                });
                req.on('error', (e: any) => {
                    // Reject so withProxyRetry can catch proxy errors for retry,
                    // or fall through to API-level retry for non-proxy errors.
                    innerReject(e);
                });
                req.end();
            });
        };

        // Wrap the HTTP request in proxy-aware retry.
        // Proxy errors (ECONNRESET/ECONNREFUSED/ETIMEDOUT) are retried up to 3 times.
        // Non-proxy errors and exhausted proxy retries fall through to API-level retry.
        withProxyRetry(() => doHttpRequest())
            .then(json => resolve(json))
            .catch((err: any) => {
                if (cancelled?.value || err.message === 'cancelled') {
                    reject(new Error('cancelled'));
                    return;
                }
                const msg: string = err.message || 'Network error';
                if (msg.startsWith('FAIL_SYS_TOKEN_EXPIRED') || msg.startsWith('FAIL_SYS_TOKEN_EMPTY')) {
                    retryWithBackoff(msg, true);
                } else if (isRetryableRet(msg)) {
                    retryWithBackoff(msg);
                } else {
                    retryWithBackoff(msg);
                }
            });
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
                rawTitle: item.name || item.showTag || item.projectName || '',
                image: item.verticalPic || '',
                date: item.showTime || '',
                city: (item.cityName || '').trim(), 
                venue: item.venueName || '',
                price: item.priceShowText || item.priceStr || item.priceLow || 'Pending',
                status: item.showStatus?.desc || 'Unknown',
                category: item.topRight?.tag || 'Concert',
                artist: isValidTag ? showTag : '',
                rawArtistTag: isValidTag ? showTag : '',
                artistPrimary: isValidTag ? splitArtistNames(showTag)[0] || '' : '',
                artistAll: isValidTag ? splitArtistNames(showTag) : [],
                artistSource: isValidTag ? 'official_tag' : 'unknown',
                artistConfidence: isValidTag ? 0.95 : 0,
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

// --- AI Identity Extraction ---

export async function extractArtistsWithDeepSeek(
    concerts: Concert[],
    apiKey: string = '',
    source?: Concert['source']
): Promise<Concert[]> {
    return extractConcertIdentityWithAI(concerts, { apiKey, source });
}

function getConfiguredAiApiKey(): string {
    return DAMAI_CONFIG.deepseekApiKey || process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
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

// Batch concurrency constants
const CITY_BATCH_SIZE = 8;
const INTER_BATCH_DELAY_MS = 10000;

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

    console.log(`✅ Total cities available: ${uniqueCities.length}`);
    if (uniqueCities.length === 0) {
        console.warn('No cities found for Damai.');
        return [];
    }

    // --- Checkpoint: filter out already-completed cities ---
    const completedCities = await getCompletedCities('damai');
    const citiesToFetch = completedCities.length > 0
        ? uniqueCities.filter(c => !completedCities.includes(c.cityName))
        : uniqueCities;

    if (completedCities.length > 0) {
        console.log(`📋 Resuming Damai from checkpoint: ${completedCities.length} cities done, ${citiesToFetch.length} remaining`);
    }

    if (citiesToFetch.length === 0) {
        console.log('✅ All cities already completed. Skipping Damai crawl.');
        if (onProgress) onProgress('Damai task complete (all cached)', 100);
        return [];
    }

    if (onProgress) onProgress(`Found ${citiesToFetch.length} cities to fetch. Starting Damai crawl...`, 5);

    let allConcerts: Concert[] = [];
    const failedCities: string[] = [];

    // Per-city timeout: 90s.
    // We use a shared `cancelled` flag because Promise.race alone cannot interrupt
    // an async function that is already awaiting inside — the flag lets fetchCity
    // bail out cooperatively after each await point.
    const CITY_TIMEOUT_MS = 90 * 1000;

    async function fetchCity(city: HotCity, index: number, cancelled: { value: boolean }): Promise<Concert[]> {
        const cityResults: Concert[] = [];
        const fetchedIds = new Set<string>();
        let cityErrorCount = 0;
        let consecutiveEmptyPages = 0;

        for (let page = 1; page <= 50; page++) {
            if (cancelled.value) break;

            const baseDelay = page <= 3 ? 1500 : 2500;
            await randomDelay(baseDelay, baseDelay + 2000);
            if (cancelled.value) break;

            // 10% chance of a long random pause for fingerprint dispersion
            if (Math.random() < 0.1) {
                console.log(`[fingerprint] Random long pause on ${city.cityName} page ${page}...`);
                await randomDelay(15000, 30000);
                if (cancelled.value) break;
            }

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
                }, undefined, 0, cancelled, city.cityName);
                if (cancelled.value) break;

                if (res.ret && res.ret[0].startsWith('SUCCESS')) {
                    const items = parseConcertNodes(res.data?.nodes, city.cityName);
                    cityErrorCount = 0;

                    if (items.length === 0) {
                        consecutiveEmptyPages++;
                        if (consecutiveEmptyPages >= 2) break;
                        continue;
                    }
                    consecutiveEmptyPages = 0;

                    let newItemsCount = 0;
                    for (const item of items) {
                        if (!fetchedIds.has(item.id)) {
                            fetchedIds.add(item.id);
                            cityResults.push(item);
                            newItemsCount++;
                        }
                    }
                    if (newItemsCount === 0 || items.length < 20) break;
                } else {
                    cityErrorCount++;
                    const retMsg = getPrimaryRetMessage(res) || 'Unknown ret';
                    console.warn(`Damai ${city.cityName} page ${page} non-success: ${retMsg}`);

                    const isRiskControl = retMsg.includes('RGV587') || retMsg.includes('TRAFFIC_LIMIT') || retMsg.includes('ILLEGAL_ACCESS');
                    if (isRiskControl) {
                        if (retMsg.includes('RGV587')) {
                            console.warn(`⚠️ RGV587 on ${city.cityName}, switching proxy node...`);
                            try {
                                const currentNode = await getCurrentNode();
                                await handleNodeFailure(Object.assign(new Error('RGV587'), { retMsg }));
                                markNodeCooldown(currentNode, 15 * 60 * 1000);
                            } catch (_e) { console.warn('Node switch failed, continuing'); }
                            // Retry current page with new node
                            continue;
                        }
                        if (retMsg.includes('TRAFFIC_LIMIT')) {
                            console.warn(`⚠️ TRAFFIC_LIMIT on ${city.cityName}, slowing down...`);
                            await randomDelay(10000, 20000);
                            if (cancelled.value) break;
                            continue;
                        }
                        if (retMsg.includes('ILLEGAL_ACCESS')) {
                            console.warn(`⚠️ ILLEGAL_ACCESS on ${city.cityName}, switching proxy node...`);
                            try {
                                const currentNode = await getCurrentNode();
                                await handleNodeFailure(Object.assign(new Error('ILLEGAL_ACCESS'), { retMsg }));
                                markNodeCooldown(currentNode, 30 * 60 * 1000);
                            } catch (_e) { console.warn('Node switch failed, continuing'); }
                            continue;
                        }
                    }

                    if (cityErrorCount >= 3) {
                        console.warn(`Damai ${city.cityName} reached error threshold, skipping.`);
                        break;
                    }
                    await delay(getBackoffMs(cityErrorCount));
                    if (cancelled.value) break;
                }
            } catch (err: any) {
                if (cancelled.value || err.message === 'cancelled') break;
                cityErrorCount++;
                console.error(`Damai ${city.cityName} page ${page}: ${err.message}`);
                if (cityErrorCount >= 3) break;
                await delay(getBackoffMs(cityErrorCount));
                if (cancelled.value) break;
            }
        }

        return cityResults;
    }

    // --- Batch concurrent execution: 8 cities per batch, 10s between batches ---
    for (let batchStart = 0; batchStart < citiesToFetch.length; batchStart += CITY_BATCH_SIZE) {
        const batch = citiesToFetch.slice(batchStart, batchStart + CITY_BATCH_SIZE);

        // Concurrently execute all cities in this batch
        const batchResults = await Promise.allSettled(
            batch.map((city, i) => {
                const globalIndex = batchStart + i;
                const cancelled = { value: false };
                const timeoutHandle = setTimeout(() => {
                    cancelled.value = true;
                    console.warn(`⏱️ Damai ${city.cityName} cancelled after ${CITY_TIMEOUT_MS / 1000}s timeout.`);
                }, CITY_TIMEOUT_MS);

                return fetchCity(city, globalIndex, cancelled).then(data => {
                    clearTimeout(timeoutHandle);
                    return { city, data, cancelled: cancelled.value, error: undefined as any };
                }).catch(err => {
                    clearTimeout(timeoutHandle);
                    console.warn(`Damai ${city.cityName} skipped: ${err.message}`);
                    return { city, data: [] as Concert[], cancelled: false, error: err };
                });
            })
        );

        // Collect results and write checkpoint per completed city
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                const { city, data, cancelled, error } = result.value;
                if (cancelled) {
                    failedCities.push(`${city.cityName}(超时)`);
                } else if (error) {
                    failedCities.push(city.cityName);
                } else {
                    allConcerts.push(...data);
                    // Write checkpoint immediately after each successful city
                    await updateSourceProgress('damai', city.cityName, data.length);
                }
            } else {
                // Promise.allSettled rejection (should not happen — fetchCity catches internally)
                console.warn(`Damai batch city unexpected rejection:`, result.reason);
            }
        }

        // Inter-batch delay (skip after the last batch)
        if (batchStart + CITY_BATCH_SIZE < citiesToFetch.length) {
            await delay(INTER_BATCH_DELAY_MS);
        }
    }

    if (failedCities.length > 0) {
        console.warn(`⚠️ Damai: ${failedCities.length} cities skipped: ${failedCities.join(', ')}`);
    }

    // AI identity enhancement
    const aiApiKey = getConfiguredAiApiKey();
    if (aiApiKey && allConcerts.length > 0) {
        if (onProgress) onProgress('Enhancing Damai data with AI...', 95);
        allConcerts = await extractArtistsWithDeepSeek(allConcerts, aiApiKey, 'damai');
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

    const aiApiKey = getConfiguredAiApiKey();
    if (aiApiKey && concerts.length > 0) {
        console.log('🤖 Enhancing MoreTickets (Mobile) data with AI...');
        if (onProgress) onProgress('Enhancing MoreTickets (Mobile) data with AI...', 95);
        concerts = await extractArtistsWithDeepSeek(concerts, aiApiKey, 'moretickets');
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

    const aiApiKey = getConfiguredAiApiKey();
    if (aiApiKey && concerts.length > 0) {
        console.log('🤖 Enhancing MoreTickets (Global) data with AI...');
        if (onProgress) onProgress('Enhancing MoreTickets (Global) data with AI...', 95);
        concerts = await extractArtistsWithDeepSeek(concerts, aiApiKey, 'moretickets-global');
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

        // 4. Segmented save: persist each source immediately after completion
        console.log('💾 Saving results per source...');
        if (onProgress) onProgress('Saving data...', 95);

        if (damaiResult.length > 0) {
            console.log(`💾 Saving ${damaiResult.length} Damai concerts...`);
            await saveConcertsToStorage(damaiResult);
        }
        if (mobileResult.length > 0) {
            console.log(`💾 Saving ${mobileResult.length} MoreTickets concerts...`);
            await saveConcertsToStorage(mobileResult);
        }
        if (globalResult.length > 0) {
            console.log(`💾 Saving ${globalResult.length} MoreTickets Global concerts...`);
            await saveConcertsToStorage(globalResult);
        }

        // 5. Final cross-source merge & dedup
        const mergeJobStartedAt = Date.now();
        console.log('MERGE_JOB_START');
        console.log('🔄 Performing final cross-source merge...');
        if (onProgress) onProgress('Merging data...', 98);

        const existingConcerts = await getAllConcertsFromStorage();
        console.log(`MERGE_JOB_EXISTING_COUNT count=${existingConcerts.length}`);
        const allNew = mergeConcertLists(damaiResult, mergeConcertLists(mobileResult, globalResult));
        console.log(`MERGE_JOB_ALL_NEW_COUNT count=${allNew.length}`);
        const finalMerged = mergeConcertLists(existingConcerts, allNew);
        console.log(`MERGE_JOB_FINAL_COUNT count=${finalMerged.length}`);
        await saveConcertsToStorage(finalMerged);
        console.log(`MERGE_JOB_DONE existing=${existingConcerts.length} allNew=${allNew.length} final=${finalMerged.length} durationMs=${Date.now() - mergeJobStartedAt}`);
        console.log(`🎉 Final merge: ${finalMerged.length} total concerts in storage`);

        // 6. Clear checkpoint on successful completion
        await clearProgress();
        console.log('🧹 Checkpoint cleared after successful sync.');

        if (onProgress) onProgress('Sync complete!', 100);

        const parts: string[] = [];
        if (timedOutSources.length) parts.push(`超时: ${timedOutSources.join('、')}`);
        if (failedSources.length) parts.push(`失败: ${failedSources.join('、')}`);
        const summaryMsg = parts.length ? parts.join(' | ') : undefined;

        return {
            success: true,
            totalNew: finalMerged.length - existingConcerts.length,
            totalCombined: finalMerged.length,
            message: summaryMsg,
            timedOutSources,
            failedSources,
        };

    } catch (err: any) {
        console.error('❌ Fatal Error in Parallel Sync:', err);
        return { success: false, totalNew: 0, totalCombined: 0, message: err.message };
    }
}
