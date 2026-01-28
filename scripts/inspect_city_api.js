
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

// --- Configuration (from .env or hardcoded for test) ---
// Note: We need a valid token. Since I can't interactively ask for one in this script easily,
// I will try to read it from a recently saved log or just ask the user to provide it if this fails.
// However, the user provided a curl command earlier. I'll try to reuse that if possible, 
// or just use the logic from damai-crawler.ts but simplified.

// Mock Config - REPLACE THESE WITH REAL VALUES IF NEEDED
const APP_KEY = '12574478';

// Helper to generate sign
function generateSign(token, t, appKey, dataStr) {
    const strToSign = `${token}&${t}&${appKey}&${dataStr}`;
    return crypto.createHash('md5').update(strToSign).digest('hex');
}

async function makeRequest(api, dataObj, cookie, tokenWithTime) {
    return new Promise((resolve, reject) => {
        const token = tokenWithTime.split('_')[0];
        const t = Date.now();
        const dataStr = JSON.stringify(dataObj);
        const sign = generateSign(token, t, APP_KEY, dataStr);

        const params = new URLSearchParams({
            jsv: '2.7.5',
            appKey: APP_KEY,
            t: String(t),
            sign: sign,
            api: api,
            v: '1.2',
            H5Request: 'true',
            type: 'jsonp',
            dataType: 'jsonp',
            data: dataStr
        });

        const options = {
            hostname: 'mtop.damai.cn',
            path: `/h5/${api}/1.2/?${params.toString()}`,
            method: 'GET',
            headers: {
                'cookie': cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
                'referer': 'https://m.damai.cn/'
            }
        };

        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                // console.log('Raw body:', body); 
                try {
                     // Simple JSONP parse
                     const start = body.indexOf('(');
                     const end = body.lastIndexOf(')');
                     if (start > -1 && end > -1) {
                         const jsonStr = body.substring(start + 1, end);
                         resolve(JSON.parse(jsonStr));
                     } else {
                         resolve(JSON.parse(body));
                     }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function run() {
    // 1. Get Cookie/Token (Simulated - User needs to update this or I need to read from file)
    // I will try to read from the last successful sync if possible, or just fail and ask user.
    // For now, I'll check if I can find the cookie in the project files or logs? No, that's risky.
    // I will just use the hardcoded values from the user's previous message if they are still valid.
    
    // User's provided curl command contained this (I will try to use it):
    const cookie = "t=fce3db9c757d69c75298829ffef53de1; sgcookie=E100nr3wmCnLx7xwVeBYj9seoWX2tNZtbEshG7RBLqzpY2UtdAap4dFTZXVb9b%2FC2V8opZshzG6EDxCzKIw0K8sNbnyjU5GeU0LluoC586rRaA4%3D; damai.cn_nickName=%E9%BA%A6%E5%AD%90cl0FW; cna=7Tu9IbjhjGcCAXBeGu9m5pyT; _samesite_flag_=true; cookie2=16dfcc1c3cd7a0a139b7df1976871414; _tb_token_=ef3e605df13bb; isg=BCcnCifLAkZeD4aAq139ZzWQtlvxrPuOi4aIcfmUYbbd6EeqAHrq3kj5DO72ANMG; mtop_partitioned_detect=1; _m_h5_tk=08e216e8888ea29ffb19dbe5dc6d855f_1769576295401; _m_h5_tk_enc=c994d2c568e247518ecb0f895fc15e95; tfstk=gaSrUxmnjuEra6VGQOxUbRNI2ZtJYHP1-MOBK9XHFQAlF9veYs1FFeVRdsRhwshSV3VJYpf16Q9IP9DeKs1cTeeJOBAFO9b7hlZ1eTKpxHP_flgGwcXCaLYkKJmDBpwXEl69ZDtpx5NjlDY8bHCrFYT6xt22dpdHE6Yko-JHCHmk-00miIpHxHYkZqDDednkKUA33tAvKHAhtU22mIpHxBfHxXocyZwWeU2lF7zt4r9BzCXkgcWP0LYoyTOqxDXAuURifIonxiJPKZ-EoczBsNdW5IC0c0-Fnp5wQ_l0gHXV2G8cqSnF_s7M0KQYT2RN-T_O-Eyuqt-yaFSXlY0e4wfRYUQrpRBDqsQ96U4YMKS5feR9ujVlhtRk7w57MDA57tf25iGjfnXGunSPvXpch2SdzX0erKp21-y2LblAmHCR143KJUNM3Cwm223prKp21-yqJ2L7sKR_n0C..";
    
    const tokenMatch = cookie.match(/_m_h5_tk=([^;]+)/);
    if (!tokenMatch) {
        console.error('No token found in hardcoded cookie. Please update script.');
        return;
    }
    const tokenWithTime = tokenMatch[1];

    console.log('Fetching city list...');
    const cityDataObj = {
        platform: "8",
        comboChannel: "2",
        dmChannel: "damai@damaih5_h5"
    };

    try {
        const res = await makeRequest('mtop.damai.wireless.area.groupcity', cityDataObj, cookie, tokenWithTime);
        
        if (!res.data) {
            console.log('Response:', JSON.stringify(res, null, 2));
            return;
        }

        const hotCities = res.data.hotCities || [];
        const groups = res.data.groups || [];

        console.log(`Hot Cities: ${hotCities.length}`);
        
        // Inspect one hot city
        if (hotCities.length > 0) {
            console.log('\n--- Sample Hot City ---');
            console.log(JSON.stringify(hotCities[0], null, 2));
        }

        // Search for known overseas cities in groups
        const targetCities = ['香港', '澳门', '伦敦', '曼谷', '东京', '新加坡'];
        console.log('\n--- Searching for specific cities ---');
        
        groups.forEach(group => {
            if (group.sites) {
                group.sites.forEach(site => {
                    if (targetCities.includes(site.cityName)) {
                        console.log(`Found ${site.cityName}:`);
                        console.log(JSON.stringify(site, null, 2));
                    }
                    // Also print any site that has extra fields just in case
                    if (site.countryId || site.region || site.siteType) {
                         console.log(`Found Special Site ${site.cityName}:`, JSON.stringify(site));
                    }
                });
            }
        });

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
