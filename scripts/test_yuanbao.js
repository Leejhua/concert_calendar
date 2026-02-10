
const url = 'https://yuanbao.tencent.com/api/chat/e0eb2719-120b-4c2d-a86e-6848a2c18e65';

const headers = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'chat_version': 'v1',
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://yuanbao.tencent.com',
    'priority': 'u=1, i',
    'referer': 'https://yuanbao.tencent.com/chat/naQivTmsDa',
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Microsoft Edge";v="144"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
    'x-agentid': 'naQivTmsDa',
    'x-bus-params-md5': '046a6c5786d4df38ab657123c7af367a',
    'x-commit-tag': '971d04e3',
    'x-device-id': '19903121426100e031a71060306a9c2cfa18e18f1b',
    // 'x-hy106': '', // Skipped as value was ambiguous in logs
    'x-hy92': '8f95bdf831a71060306a9c2c02000007619c03',
    'x-hy93': '19903121426100e031a71060306a9c2cfa18e18f1b',
    'x-input-type': 'text',
    'x-instance-id': '5',
    'x-language': 'zh-CN',
    'x-os_version': 'Windows(10)-Blink',
    'x-platform': 'win',
    'x-requested-with': 'XMLHttpRequest',
    'x-source': 'web',
    'x-timestamp': '1770707291548',
    'x-trid-channel': 'undefined',
    'x-uskey': 'DCAxFeb05pDmvvCtOP3B8IOqDrUH5%2F8iba2rGlUpGHRtKIb47nMQesTDg30q2WNwYweR85Vp52Fp%0AvrekG7RB%2FIOjXfpHzLemZuxmZTLCWfDtLiN12M%2BseB1%2F4xQ3sXJ1chyA%2Bc9p5IDwudOpN8OG8Vmi%0AA6aE59EpMLfpPUTIWNZ2LQBsh9foHUxy4TY3sXJ1eSkF7YS352F5%2B9tnYHHXnwtzBrIK5dP3bulq%0ANTTEXf4qbX%2BgwbA7OBMwkpFq002mcl7G8GJ061DmrvHxPeZR7VOmCrUG9%2F8iZ62rGlSQW%2FYiLXVs%0Ah%2Bfqe16%2F9Bsq2WN2eT7G5kw%2F4xQ8sbkxaoWv7CC%2FJ%2BKO4%2FF5fL%2F9NArCWdRzNsLxq%2Bxte2wl8xWt%0A03rmeAQK7H9q5VPordO3PeEE8qHyWrdO4vXwbb%2FlZTwSW6WqfCL51MfuGI%2Fz8wiqsFTmdx8QkcI6%0AkAyo6rekG7DV4Jy%2FWG%2BO5dycbbqpKUavUf5dLCL2mLUOeUa7hls1t0wjJh5E8MLv4JPx9Hk3POFY%0ApVmoC%2BKR8MG3fLVmKAfCUdR9LR%2FhlM%2FtdI6l8xY303rmYxER7kx06VPwudesG7zB72mjA%2BKR8MF2%0AfLV2YIwJQuWmfEIl3bSwOJNoyU3tqgNkOpjKuPhGlBY986EnZHOEnt4AbHuriLQTfra2KUwfEbO3%0AOFIrtfvqGwb9zJZimEI3PURfndKGnwep%2B%2Fgjc4QC61tzWG%2FhhZz2KzwNGISUDKi3OFovxaMqbwuo%0AuVCkmDMlHB3CzOS6zg0D%2B9D7ecsCzAR7JuNXvaRrLfh7eIaZTKyvdXay5kpOFgrog0yq2WN0cx7G%0A5zp%2FnUED0LzgfYXB6pOrDMKJ4%2F8ibLf2NlTcQ%2FR5Nsq3mfTieqw34SiqsjBmdw3M',
    'x-web-ch-id': 'null',
    'x-webdriver': '0',
    'x-webversion': '2.56.0',
    'x-ybuitest': '0',
    'cookie': 'pgv_pvid=5746397250; _qimei_uuid42=19903121426100e031a71060306a9c2cfa18e18f1b; _qimei_i_3=44f151d79552578ac896f8360ed625b4fee9a5f240525580b6db2b5a70c1716c673732943a89e29bd68f; _qimei_fingerprint=c0b8d5fb051e52451b5c974f35fe4900; _qimei_h38=8f95bdf831a71060306a9c2c02000007619c03; _qimei_i_1=7fed738ac353558995c1f6335ad574e1f7e8a4f2125d528be78d7b582493206c616330933980b1dcd5fcc586; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%22100041432286%22%2C%22first_id%22%3A%22197ee0ee6b91518-0819fc7d03dce2-4c657b58-2073600-197ee0ee6ba1f4f%22%2C%22props%22%3A%7B%22%24latest_traffic_source_type%22%3A%22%E8%87%AA%E7%84%B6%E6%90%9C%E7%B4%A2%E6%B5%81%E9%87%8F%22%2C%22%24latest_utm_medium%22%3A%22cpc%22%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfY29va2llX2lkIjoiMTk3ZWUwZWU2YjkxNTE4LTA4MTlmYzdkMDNkY2UyLTRjNjU3YjU4LTIwNzM2MDAtMTk3ZWUwZWU2YmExZjRmIiwiJGlkZW50aXR5X2xvZ2luX2lkIjoiMTAwMDQxNDMyMjg2In0%3D%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%24identity_login_id%22%2C%22value%22%3A%22100041432286%22%7D%2C%22%24device_id%22%3A%221994caebf8cd0d-0d1374605c255d-4c657b58-2073600-1994caebf8d193a%22%7D; hy_source=web; hy_user=a26e0710746446f098e4f8d36691cc48; hy_token=8tE8bq6InCxff5mUqQZfc9aGHP6NPD80Cr/k258SiLJ0SRKVmpnUylkLLyDfCVTFNHwh3Ih/7b5EZdt+1/bmpWHX2kahAsukXCq20uQsUNGaOJ0rwPA/CzlxYHOLtBMwQkE7VgXt3GLfFwUo/XrMfOigMyHYfHSIt34gB/PmH67QtT7USbAO8ddzO40XX8dr0FTmnj1UFXPE2oU6Z6aNXOL/Im1CxS9kROd7eJovo4oUFT1TQBpn7f4adxb9mkjezc7V8f1ukWCZ86DS922RomH9QdyGqYJl+hUSd0RIioQl1agJ0W86YTxKcR913vABfJKRJOOPpMHDzTaBp9+FrCL2tPyQyAPIwazbKOIPX3vAibJxCYs0LxOQgSIcsyhbMnxrVYfS/NPHJEdT4zNimJBltsPcNyqn8co+TuzSU0eKleZMGjh7VS0uUSg5jeBuuEV/NQ7J6KJhvgiw0YY18Jtu5DOpGqOA2enk2bmxGe+MOirhKmEPeg3PpIY8aOAuBoPJHuLwKSlQKyBTJz0gcTv0O5TCaAQWFhlslALdJ8Boy4EZF2wuGse1dEZLxk3y1ZmtnBnQIAZ34haf3oFDqZFKfRe/F2JAw+j1kiDxZ3ExmZh2/FQyODLg/1od6iJclB9YDLyJsmC3flYiJzMKOFDUf94AEGXcNOOJu+Lvj8k='
};

const body = {
    "model": "gpt_175B_0404",
    "prompt": "近期QQ音乐独家的演唱会有哪些",
    "plugin": "Adaptive",
    "displayPrompt": "近期QQ音乐独家的演唱会有哪些",
    "displayPromptType": 1,
    "agentId": "naQivTmsDa",
    "isTemporary": false,
    "projectId": "",
    "chatModelId": "deep_seek",
    "supportFunctions": ["openInternetSearch"],
    "docOpenid": "",
    "options": {
        "imageIntention": {
            "needIntentionModel": true,
            "backendUpdateFlag": 2,
            "intentionStatus": true
        }
    },
    "multimedia": [],
    "supportHint": 1,
    "chatModelExtInfo": "{\"modelId\":\"deep_seek_v3\",\"subModelId\":\"deep_seek\",\"supportFunctions\":{\"internetSearch\":\"openInternetSearch\"}}",
    "applicationIdList": [],
    "version": "v2",
    "extReportParams": null,
    "isAtomInput": false,
    "offsetOfHour": 8,
    "offsetOfMinute": 0
};

async function run() {
    try {
        console.log('Sending request to Yuanbao...');
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const text = await response.text();
            console.error('Error response:', text);
            return;
        }

        const text = await response.text();
        console.log('Response body:', text.substring(0, 2000) + '...');
        
    } catch (error) {
        console.error('Request failed:', error);
    }
}

run();
