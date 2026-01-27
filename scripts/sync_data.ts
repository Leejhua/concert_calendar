import { syncData } from '../lib/damai-crawler';

// Configuration (can be updated here manually if running script directly)
const DAMAI_CONFIG_OVERRIDE = {
    appKey: '12574478',
    tokenWithTime: '26b2acea19e075de7f7f0fb95c3153f3_1769501517944',
    cookie: '_samesite_flag_=true; cookie2=10d0a5c563236d4603e131f1c4d42fb4; t=21cbfe5c37d5d1cd01ab2d1d24b1e1e8; _tb_token_=56bbb355e115; isg=BEhIJ-tLtRMbxNmXl2kRtXxcGbZa8az7nDjT-QL5nkO23ehHqgAAi8LeVbWtbWTT; mtop_partitioned_detect=1; _m_h5_tk=26b2acea19e075de7f7f0fb95c3153f3_1769501517944; _m_h5_tk_enc=242a117cdae0c44965ee7794ffe79351',
    referer: 'https://m.damai.cn/shows/category.html?categoryId=2394&clicktitle=%E6%BC%94%E5%94%B1%E4%BC%9A'
};

// Run sync
syncData(DAMAI_CONFIG_OVERRIDE).then((res) => {
    if (res.success) {
        console.log('Sync completed successfully.');
        process.exit(0);
    } else {
        console.error('Sync failed:', res.message);
        process.exit(1);
    }
});
