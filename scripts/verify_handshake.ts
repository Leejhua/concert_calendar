
import https from 'https';

const APP_KEY = '12574478';

function makeRequest(api: string, dataObj: any, cookie: string = ''): Promise<{ headers: any, body: any }> {
    return new Promise((resolve, reject) => {
        const t = Date.now();
        const dataStr = JSON.stringify(dataObj);
        
        // For the first request (handshake), we don't have a token, so we can't sign properly yet?
        // Or does mtop expect a sign even if token is empty?
        // Usually, for the first request, we might send a dummy sign or just no sign?
        // Actually, the standard mtop protocol is:
        // 1. Client sends request.
        // 2. Server responds with FAIL_SYS_TOKEN_EMPTY and Set-Cookie: _m_h5_tk=...
        
        // Let's try sending with a dummy sign or just valid params but no token-based sign.
        // But the sign param is required. 
        // Let's try to sign with an empty token first.
        const token = '';
        const strToSign = `${token}&${t}&${APP_KEY}&${dataStr}`;
        const crypto = require('crypto');
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

        const options: https.RequestOptions = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/1.2/?${params.toString()}`,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                // 'cookie': cookie // Intentionally empty for first request
            }
        };

        if (cookie && options.headers) {
            (options.headers as any)['cookie'] = cookie;
        }

        console.log(`Sending request to ${api}... Cookie: ${cookie ? 'Yes' : 'No'}`);
        
        const req = https.request(options, (res) => {
            let chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                resolve({
                    headers: res.headers,
                    body: JSON.parse(body)
                });
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    console.log('--- Step 1: Handshake (No Cookie) ---');
    try {
        const res1 = await makeRequest('mtop.damai.wireless.area.groupcity', {
            platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        });

        console.log('Response 1 Code:', res1.body.ret);
        console.log('Set-Cookie:', res1.headers['set-cookie']);

        const setCookie = res1.headers['set-cookie'];
        if (!setCookie) {
            console.error('❌ Failed: No Set-Cookie received.');
            return;
        }

        // Extract token
        const cookieStr = setCookie.join('; ');
        const tokenMatch = cookieStr.match(/_m_h5_tk=([^;]+)/);
        const encMatch = cookieStr.match(/_m_h5_tk_enc=([^;]+)/);

        if (!tokenMatch || !encMatch) {
            console.error('❌ Failed: Token not found in cookies.');
            return;
        }

        const tokenWithTime = tokenMatch[1];
        const token = tokenWithTime.split('_')[0];
        const enc = encMatch[1];
        
        console.log(`✅ Token Acquired: ${token}`);
        console.log(`✅ Token Full: ${tokenWithTime}`);

        // Construct Cookie for Step 2
        // Note: mtop requires _m_h5_tk and _m_h5_tk_enc
        const newCookie = `_m_h5_tk=${tokenWithTime}; _m_h5_tk_enc=${enc}`;
        
        console.log('\n--- Step 2: Retry with Token ---');
        const res2 = await makeRequest('mtop.damai.wireless.area.groupcity', {
             platform: "8",
            comboChannel: "2",
            dmChannel: "damai@damaih5_h5"
        }, newCookie);

        console.log('Response 2 Code:', res2.body.ret);
        if (res2.body.ret && res2.body.ret[0] === 'SUCCESS::调用成功') {
            console.log('🎉 Success! Data received.');
            // console.log(JSON.stringify(res2.body.data, null, 2).substring(0, 200) + '...');
        } else {
            console.error('❌ Failed with token:', res2.body);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
