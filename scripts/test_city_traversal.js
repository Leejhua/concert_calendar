const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// Configuration - reusing the same valid cookie/token for now
const DAMAI_CONFIG = {
  appKey: '12574478',
  tokenWithTime: 'fef1bb3f75685c328ca3b4c8d1190eb6_1769486307570',
  cookie: 'mtop_partitioned_detect=1; _m_h5_tk=fef1bb3f75685c328ca3b4c8d1190eb6_1769486307570; _m_h5_tk_enc=e665aecb9e7b9811198bdbc1665de31b',
  referer: 'https://m.damai.cn/shows/category.html?categoryId=2394&clicktitle=%E6%BC%94%E5%94%B1%E4%BC%9A&spm=a2o71.home.icon.ditem_0&sqm=dianying.h5.unknown.value'
};

// --- Helper: Generate Signature ---
function generateSign(token, t, appKey, dataStr) {
  const strToSign = `${token}&${t}&${appKey}&${dataStr}`;
  return crypto.createHash('md5').update(strToSign).digest('hex');
}

// --- Helper: Make HTTP Request ---
function makeRequest(api, dataObj, callbackName) {
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
      type: 'jsonp', // The curl used jsonp
      timeout: '10000',
      forceAntiCreep: 'true',
      AntiCreep: 'true',
      dataType: 'jsonp',
      callback: callbackName,
      data: dataStr
    });

    // Override v for concerts API if needed, but city API uses 1.2
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
        // Crucial: Simulate Mobile UA
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        // Optional: extra headers from curl
        'sec-fetch-dest': 'script',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-site'
      }
    };

    const req = https.request(options, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        
        // Handle JSONP callback if present
        if (callbackName && body.includes(callbackName + '(')) {
            try {
                // Robust JSONP extraction: find first '(' and last ')'
                const start = body.indexOf(callbackName + '(') + callbackName.length + 1;
                const end = body.lastIndexOf(')');
                const jsonStr = body.substring(start, end);
                resolve(JSON.parse(jsonStr));
            } catch (e) {
                reject(new Error(`Failed to parse JSONP: ${e.message}`));
            }
        } else {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                // If it's just raw text or HTML, log it for debug
                // Sometimes city API returns JSONP but without callback name if parameter is ignored
                if (body.trim().startsWith('mtopjsonp')) {
                     const start = body.indexOf('(') + 1;
                     const end = body.lastIndexOf(')');
                     try {
                        resolve(JSON.parse(body.substring(start, end)));
                        return;
                     } catch(err) {}
                }
                console.log('Raw response:', body.substring(0, 200));
                reject(new Error('Failed to parse JSON response'));
            }
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

// --- Main Flow ---
async function run() {
  try {
    console.log('1. Fetching City List...');
    
    // City List API Params
    const cityDataObj = {
      platform: "8",
      comboChannel: "2",
      dmChannel: "damai@damaih5_h5"
    };

    const cityRes = await makeRequest(
      'mtop.damai.wireless.area.groupcity', 
      cityDataObj, 
      'mtopjsonp4'
    );

    if (!cityRes.data || (!cityRes.data.hotCities && !cityRes.data.hotCity)) {
        console.error('Failed to get city list. Response:', JSON.stringify(cityRes).substring(0, 200));
        return;
    }

    // Extract some city IDs (Hot Cities)
    // Note: API might return 'hotCity' (singular) or 'hotCities'
    const hotCities = cityRes.data.hotCities || cityRes.data.hotCity;
    console.log(`Success! Found ${hotCities.length} hot cities.`);
    
    // Pick 3 test cities: Beijing (852), Shanghai (850), and one more
    const testCities = hotCities.slice(0, 3); 
    console.log('Test Targets:', testCities.map(c => `${c.cityName}(${c.cityId})`).join(', '));

    console.log('\n2. Fetching Concerts for each city (simulating traversal)...');

    for (const city of testCities) {
        console.log(`\n--- Fetching for ${city.cityName} (${city.cityId}) ---`);
        
        // Update args based on current route.ts implementation
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
            pageIndex: "1",
            pageSize: "20"
        };
        
        // The API requires 'patternName' inside the data object now (seen in route.ts)
        const concertDataObj = {
            args: JSON.stringify(args),
            patternName: "category_solo",
            patternVersion: "4.2",
            platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        };

        // Note: Concert API uses v3.0 and regular JSON (not JSONP usually, but let's check response)
        // Using the same makeRequest but with logic for 3.0 inside
        const concertRes = await makeRequest(
            'mtop.damai.mec.aristotle.get',
            concertDataObj,
            null // No callback for this one usually
        );

        if (concertRes.ret && concertRes.ret[0].startsWith('SUCCESS')) {
            const items = [];
            // Basic recursive finder to count items
            const findItems = (nodes) => {
                if (!nodes) return;
                for (const node of nodes) {
                    if (node.type === '7587' && node.data) {
                         // Check fields: name or showTag
                         const name = node.data.name || node.data.showTag || node.data.projectName;
                         if (name) items.push(name);
                    }
                    if (node.nodes) findItems(node.nodes);
                }
            };
            findItems(concertRes.data?.nodes);
            console.log(`  > Status: SUCCESS`);
            console.log(`  > Found ${items.length} items.`);
            if (items.length > 0) {
                console.log(`  > First item: ${items[0]}`);
            } else {
                console.log(`  > Warning: 0 items found (Might be empty for this city or blocked)`);
            }
        } else {
            console.error(`  > Failed: ${concertRes.ret ? concertRes.ret[0] : 'Unknown error'}`);
        }

        // Random delay between requests to be nice (1-3 seconds)
        const delay = Math.floor(Math.random() * 2000) + 1000;
        await new Promise(r => setTimeout(r, delay));
    }

  } catch (err) {
    console.error('Fatal Error:', err);
  }
}

run();
