
const https = require('https');
const crypto = require('crypto');

const APP_KEY = '12574478';

function makeRequest(api, dataObj, cookie = '') {
    return new Promise((resolve, reject) => {
        const t = Date.now();
        const dataStr = JSON.stringify(dataObj);
        
        let token = '';
        if (cookie) {
            const match = cookie.match(/_m_h5_tk=([^;]+)/);
            if (match) {
                token = match[1].split('_')[0];
            }
        }
        
        const strToSign = `${token}&${t}&${APP_KEY}&${dataStr}`;
        const sign = crypto.createHash('md5').update(strToSign).digest('hex');

        const params = new URLSearchParams({
            jsv: '2.7.2',
            appKey: APP_KEY,
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
                'referer': 'https://m.damai.cn/'
            }
        };

        if (cookie) {
            options.headers['cookie'] = cookie;
        }

        console.log(`Sending request to ${api}... Cookie: ${cookie ? 'Yes' : 'No'}`);
        
        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    resolve({
                        headers: res.headers,
                        body: JSON.parse(body)
                    });
                } catch (e) {
                    console.log('Body:', body);
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function fetchHomePage() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'm.damai.cn',
            path: '/',
            method: 'GET',
            headers: {
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            }
        };
        const req = https.request(options, (res) => {
            resolve(res.headers['set-cookie'] || []);
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    console.log('--- Step 0: Fetch Home Page ---');
    const homeCookies = await fetchHomePage();
    const homeCookieStr = homeCookies.map(c => c.split(';')[0]).join('; ');
    console.log('Home Cookies:', homeCookieStr);

    console.log('\n--- Step 1: Handshake (With Home Cookies) ---');
    try {
        const res1 = await makeRequest('mtop.damai.wireless.area.groupcity', {
            platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        }, homeCookieStr);

        console.log('Response 1 Code:', res1.body.ret);
        // console.log('Set-Cookie:', res1.headers['set-cookie']);

        const setCookie = res1.headers['set-cookie'];
        if (!setCookie) {
            console.error('❌ Failed: No Set-Cookie received.');
            return;
        }

        // Merge cookies
        const newCookies = setCookie.map(c => c.split(';')[0]).join('; ');
        // const fakeCookies = 'cookie2=10d0a5c563236d4603e131f1c4d42fb4; cna=7Tu9IbjhjGcCAXBeGu9m5pyT;'; 
        // const allCookies = `${fakeCookies} ${newCookies}`;
        const allCookies = homeCookieStr ? `${homeCookieStr}; ${newCookies}` : newCookies;
        
        console.log(`✅ Accumulated Cookies: ${allCookies}`);
        
        // Extract token for signing
        const tokenMatch = allCookies.match(/_m_h5_tk=([^;]+)/);

        if (!tokenMatch) {
            console.error('❌ Failed: Token not found in cookies.');
            return;
        }

        const tokenWithTime = tokenMatch[1];
        const token = tokenWithTime.split('_')[0];
        
        console.log(`✅ Token for Sign: ${token}`);

        console.log('\n--- Step 2: Retry with Token ---');
        const res2 = await makeRequest('mtop.damai.wireless.area.groupcity', {
             platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        }, allCookies);

        console.log('Response 2 Code:', res2.body.ret);
        if (res2.body.ret && res2.body.ret[0] === 'SUCCESS::调用成功') {
            console.log('🎉 Success! Data received.');
            const hotCities = res2.body.data.hotCities || [];
            console.log(`Found ${hotCities.length} hot cities.`);
        } else {
            console.error('❌ Failed with token:', JSON.stringify(res2.body).substring(0, 200));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
