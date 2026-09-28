# Opportunity Score Distribution Analysis

**Date**: 2026-06-18
**Author**: Engineer (Alex)
**Purpose**: Analyse the full-distribution shape of the stored `opportunity_score` across the 714 concert records, identify virtual-high / virtual-low scoring anomalies, and propose scoring-rule improvements.
**Mode**: Read-only. Distribution data was produced by `npm run report:score-distribution -- --source db --limit 15` (raw JSON in `reports/score-distribution-raw.json`); supplementary anomaly queries are SELECT-only against the live DB.

---

## 1. Execution

### Commands

```bash
# Full distribution + top/high/low samples
npx tsx scripts/report_opportunity_score_distribution.ts --source db --limit 15
#   -> reports/score-distribution-raw.json

# Score regression (must stay green after case expansion)
npm run test:score
#   -> Opportunity score regression passed (16 cases).
```

### Score regression status

The score regression suite was expanded from **7 → 16 cases** in this iteration (see `scripts/test_opportunity_score_regression.ts`). New cases cover `tribute`, `fan_meeting`, `multi_artist` (3-artist lineup), low-info boundary, high-heat flagship, overseas/small-city (no city-tier bonus), beyond-120-day high-quality, fan-meeting-with-missing-date, and festival high-heat. All 16 pass.

---

## 2. Full-Distribution Histogram

### 2.1 Coarse buckets (stored `opportunity_score`)

| Bucket | Count | Share |
|---|---|---|
| 0–20 | 0 | 0.0% |
| 21–40 | 59 | 8.3% |
| 41–60 | **384** | **53.8%** |
| 61–80 | 79 | 11.1% |
| 81–100 | **192** | **26.9%** |
| **Total** | **714** | 100% |

The distribution is **bimodal-ish with a heavy mid-band**: a dominant 41–60 peak (384 records, 53.8%), a substantial 81–100 high band (192, 26.9%), a thin 61–80 band (79), and a small 21–40 low tail (59). There are **zero** records in 0–20 — the base score (50) plus at least one always-on signal (venue / status / date) keeps every record above 20.

### 2.2 Why the 41–60 peak is so large

The 41–60 band is dominated by **past events**. Date-status breakdown of the full 714:

| Date status | Count | Share |
|---|---|---|
| Past (`event_date < CURRENT_DATE`) | **508** | **71.1%** |
| Future / today | 205 | 28.7% |
| No date | 1 | 0.1% |

71% of the catalogue is already past. The `date_past_penalty` rule (−30) pulls records that would otherwise be 70–90 (artist + city + venue + near-date bonuses) down into the 41–60 band. The 41–60 peak is therefore largely an **artifact of the past-date penalty**, not a population of genuinely mediocre opportunities.

### 2.3 eventType distribution (for cross-reference)

| eventType | Count |
|---|---|
| solo | 565 |
| unknown | 91 |
| fan_meeting | 33 |
| festival | 15 |
| multi_artist | 9 |
| tribute | 1 |

`eventType` does **not** feed the score directly (asserted by the regression suite's `assertEventTypeHasNoDirectScoreEffect`). The 91 `unknown` eventType records overlap heavily with the 105 missing-`artistPrimary` records and tend to land in the lower buckets.

---

## 3. High-Score Segment Sampling (81–100, top 15)

All top-15 records are clamped at **100**. They share a consistent signal pattern: identified artist + tier-1 city + large known venue + premium price + selling status + near date.

| # | Score | artistPrimary | city | venue | date | title |
|---|---|---|---|---|---|---|
| 1 | 100 | EXO | 新加坡 | 新加坡室内体育馆 | 2026.07.24 | EXO PLANET #6 - EXhOrizON 2026亚洲巡回演唱会-新加坡站 |
| 2 | 100 | (G)I-DLE | 中国香港 | 启德主场馆 | 2026.06.27 | 2026 I-DLE 世界巡演 [Syncopation] -香港站 |
| 3 | 100 | 陈晓东 | 中国香港 | 红磡香港体育馆 | 2026.06.19 | 陈晓东 NEON Reflections 30 演唱会-香港站 |
| 4 | 100 | ITZY | 中国香港 | 亚洲国际博览馆 | 2026.06.20 | ITZY 3RD 世界巡回演唱会<TUNNEL VISION>-香港站 |
| 5 | 100 | I.O.I | 中国香港 | 亚洲国际博览馆10号馆 | 2026.06.20 | 2026 I.O.I <LOOP> 巡回演唱会-香港站 |
| 6 | 100 | BABYMONSTER | 韩国 | 蚕室室内体育馆 | 2026.06.26 | 2026-27 BABYMONSTER <CHOOM> 世界巡演-首尔站 |
| 7 | 100 | 郑秀文 | 中国香港 | 启德主场馆 | 2026.07.10 | 《You & Mi 郑秀文演唱会 2026》-香港站 |
| 8 | 100 | Massive Attack | 新加坡 | 新加坡星烁表演艺术中心 | 2026.07.29 | Massive Attack 巡回现场演唱会-新加坡站 |
| 9 | 100 | SVT 十周年 | 韩国 | 仁川亚运主体育场 | 2026.06.20 | SVT 十周年粉丝见面会〈SEVENTEEN in CARAT LAND〉-仁川站 |
| 10 | 100 | Kodaline | 新加坡 | 新加坡星烁表演艺术中心 | 2026.08.08 | Kodaline柯达线 告别巡回演唱会 - 新加坡站 |
| 11 | 100 | 姜涛 | 中国澳门 | 澳门银河综艺馆 | 2026.06.19 | 姜涛「LAVA」演唱会-澳门站 |
| 12 | 100 | NMIXX | 新加坡 | 新加坡星烁表演艺术中心 | 2026.06.20 | NMIXX <EPISODE 1 : ZERO FRONTIER> 首次世界巡回演唱会-新加坡站 |
| 13 | 100 | 草蜢 | 新加坡 | 新加坡室内体育馆 | 2026.06.20 | GRASSHOPPER THREE IN LOVE CONCERT 草蜢演唱会 2026 - 新加坡站 |
| 14 | 100 | LiSA | 中国香港 | 亚洲国际博览馆 | 2026.07.18 | LiSA‘LiVE is Smile Always～15～’亚洲巡回演唱会-香港站 |
| 15 | 100 | ChRocktikal 首次世界 | 中国澳门 | 澳门银河-G Box | 2026.06.27 | ChRocktikal 首次世界巡回演唱会 [CRTK : The Beginning] -澳门站 |

**Observation**: The high band is dominated by overseas/HK/Macau/SG/Korea stops of major acts. This is the band the sales team should prioritise — but note the virtual-high anomaly in §5.

---

## 4. Low-Score Segment Sampling (≤ 40, bottom 15)

| # | Score | artistPrimary | city | venue | date | title |
|---|---|---|---|---|---|---|
| 1 | 29 | (empty) | 阜阳 | 斑马音乐节草坪 | 2026.03.21 | 2026巅峰·斑马音乐节 |
| 2 | 29 | (empty) | 中国台湾 | 台北小巨蛋 | 2026.03.04 | ONEREPUBLIC “From Asia, With Love” 2026-台北站 |
| 3 | 29 | (empty) | 越南 | SECC Outdoor | 2026-04-25 | EXO PLANET #6 - EXhOrizON 2026亚洲巡回演唱会-胡志明站 |
| 4 | 33 | (empty) | 美国 | 帝国马球俱乐部 | 2026.04.10 | 科切拉谷音乐艺术节-印地欧站 |
| 5 | 33 | (empty) | 澳洲 | 百年纪念公园 | 2026.03.07 | ROLLING LOUD 澳洲2026音乐节-悉尼站 |
| 6 | 33 | (empty) | 泰国 | 暹罗百丽宫 | 2026.05.17 | Vir Das : Hey Stranger-曼谷站 |
| 7 | 33 | (empty) | 澳洲 | Sydney event centre | 2026.03.14 | 2026 CNBLUE “3LOGY”世界巡回演唱会-悉尼站 |
| 8 | 33 | (empty) | 澳洲 | 派拉蒙剧院 | 2026.03.12 | 2026 CNBLUE “3LOGY”世界巡回演唱会-墨尔本站 |
| 9 | 33 | (empty) | 韩国 | KINTEX Hall 9 | 2026.03.14 | Central Cee – CAN’T RUSH GREATNESS 2026亚洲巡演-首尔站 |
| 10 | 33 | (empty) | 泰国 | 开泰银行暹罗匹克-伽内什剧院 | 2026.03.09 | AVANTGARDEY 2026 LET’S GROOVE!!-曼谷站 |
| 11 | 33 | (empty) | 马来西亚 | Zepp Kuala Lumpur | 2026.03.31 | Anson Seabra : The I Must Be Dreaming巡回演唱会-吉隆坡站 |
| 12 | 33 | (empty) | 中国台湾 | 台北大巨蛋 | 2026.03.20 | TWICE＜THIS IS FOR＞世界巡演-台北站 |
| 13 | 33 | (empty) | 泰国 | 凤凰大宴会厅 | 2026.03.07 | 10CM 权正烈 ＜To 10CM: Chapter 1＞ 2026 亚洲巡回演唱会-曼谷站 |
| 14 | 33 | (empty) | 中国台湾 | Legacy TERA | 2026.05.25 | Anson Seabra : The I Must Be Dreaming巡回演唱会-台北站 |
| 15 | 33 | (empty) | 泰国 | UOB LIVE | 2026.05.31 | LingOrm Birthday Fan Party-曼谷站 |

**Observation**: Every low-band record has an **empty `artistPrimary`** AND a **past `event_date`** (all dated Mar–May 2026, before the 2026-06-01 scoring reference). The −30 past-date penalty plus the missing-artist bonus (−10 relative to a populated record) is what drives them to 29–33. Several of these are **genuinely high-heat events** (EXO, TWICE, ONEREPUBLIC, Coachella, ROLLING LOUD, CNBLUE, Central Cee) — see §5.2.

---

## 5. Virtual-High / Virtual-Low Identification

### 5.1 Virtual-high: high score but missing artist identity

**Definition**: `opportunity_score >= 80` AND `artist_primary = ''`.
**Count**: **10 records**.

These score high on city + venue + date + price + status alone, but the artist — the single most important commercial signal — is missing. The score overstates actionability: sales cannot engage without knowing who is performing.

| # | Score | city | venue | date | title |
|---|---|---|---|---|---|
| 1 | 98 | 中国香港 | 亚洲国际博览馆 | 2026-06-25 | 【群星】第八届 KKBOX 香港风云榜-香港站 |
| 2 | 93 | 中国澳门 | 伦敦人综艺馆 | 2026-06-30 | 卢瀚霆"KINGDOM" 巡回演唱会2026-澳门站 |
| 3 | 93 | 中国澳门 | 澳门银河综艺馆 | 2026-07-22 | K歌之王：陈辉阳作品演唱会-澳门站 |
| 4 | 93 | 中国澳门 | 澳门银河综艺馆 | 2026-07-01 | 汤令山 - 心零王子 -澳门站 |
| 5 | 92 | 中国香港 | PORTAL | 2026-06-18 | UNIDOTS／mizuki 瑞葵 2026 现场演唱会-香港站 |
| 6 | 88 | 中国香港 | 亚洲国际博览馆 | 2026-08-26 | 【群星】拉阔音乐会：她和她的秘密 卫兰x炎明熹-香港站 |
| 7 | 87 | 中国澳门 | 澳门百老汇舞台 | 2026-07-08 | 2026 HYERI（李惠利）<HYERIDE>亚洲巡回粉丝见面会-澳门站 |
| 8 | 87 | 新加坡 | 国会大剧院 | 2026-07-09 | NEXZ Global Showcase event Mmhk : Not Typical-新加坡 |
| 9 | 86 | 中国香港 | TIDES | 2026-06-25 | 王郑浚仁歌迷音乐会-香港站 |
| 10 | 84 | 澳洲 | Sydney event centre | 2026-06-24 | 汤令山 - 心零王子-悉尼站 |

**Pattern**: All 10 are `mtglobal` (overseas) records in HK / Macau / SG / AU. The artist name is visible in the title (卢瀚霆, 汤令山, 卫兰x炎明熹, 李惠利, NEXZ, 王郑浚仁) but the rule engine did not extract it into `artistPrimary`. These are the same population as the backfill report's "residual 105 unknown" — the overseas K-pop/Cantopop tail.

### 5.2 Virtual-low: low score but genuinely high-heat

**Definition**: `opportunity_score <= 40` AND `artist_primary <> ''` (artist IS identified, yet score is low).
**Count**: **4 records**.

| # | Score | artistPrimary | city | venue | date | title |
|---|---|---|---|---|---|---|
| 1 | 39 | EXO | 日本 | Osaka-jo Hall（大阪城ホール） | 2026-05-29 | EXO PLANET #6 - EXhOrizON 2026亚洲巡回演唱会-大阪站 |
| 2 | 39 | 信乐团 | 阳江 | 阳春东湖公园 | 2026-02-10 | 爱在春州演唱会 |
| 3 | 39 | 古淖文FOLLOWME | 东莞 | 聚橙院线东城影剧院 | 2026-02-10 | 古淖文FOLLOWME巡回演唱会 |
| 4 | 39 | 游鸿明 | 安顺 | 紫云县民族高级中学 | 2026-02-18 | 2026星耀紫云群星演唱会 |

**Pattern**: All four are **past events** (Feb / May 2026, before the 2026-06-01 scoring reference). The EXO Osaka stop is a flagship K-pop tour that would score ~100 if future-dated; it is under-scored purely because the date has passed and the `date_past_penalty` (−30) dominates. The other three are small-city (阳江 / 东莞 / 安顺 — not tier-1/2) small-venue events whose low score is mostly legitimate, but they still carry an identified artist, so they are not zero-value.

A broader virtual-low population exists among the **59 records in 21–40 with empty `artistPrimary`** (§4) — these include EXO 胡志明, TWICE 台北, ONEREPUBLIC 台北, Coachella, ROLLING LOUD 悉尼, CNBLUE 悉尼/墨尔本, Central Cee 首尔. They are high-heat overseas events under-scored by the combination of missing-artist (−10 relative) + past-date (−30). For these the missing artist is the root cause; fixing artist extraction would lift them out of the low band even with the past penalty.

---

## 6. Score-Rule Improvement Suggestions

### 6.1 Add an `artist_missing` penalty (highest impact)

**Problem**: 10 virtual-high records reach 84–98 with **no** artist identity, and 59 low-band records are under-scored partly because the artist is missing. The current rules give `+10` when an artist is present but apply **no penalty** when it is absent — so a missing-artist record can still ride city+venue+date to a high score, overstating actionability.

**Suggestion**: Add `artist_missing_penalty: -8` (symmetric with `missing_date_penalty`) when `getConcertSearchArtists(normalized).length === 0`. This:
- Pulls the 10 virtual-high records down by 8 (98→90, 84→76), better reflecting that sales cannot act on them without artist identity.
- Pulls the 59 low-band overseas records down a further 8, but they are already low so the marginal effect is small.
- Makes the score more honest about data completeness.

### 6.2 Decay `date_past_penalty` instead of a flat −30

**Problem**: 71% of the catalogue is past-dated, and the flat −30 dumps almost all of them into the 41–60 mid-band regardless of how recently they passed. A show that was yesterday and a show that was six months ago receive the same −30.

**Suggestion**: Tier the past penalty by recency:
- `date_past_0_7_days: -10` (just happened — may still have resale/secondary value)
- `date_past_8_30_days: -20`
- `date_past_31_plus_days: -30` (truly stale)

This re-spreads the 508 past records across the 41–60 and 61–80 bands by recency, giving the sales team a sharper "recently expired" signal vs. "long dead".

### 6.3 Re-score on read instead of relying on the stored snapshot

**Problem**: The stored `opportunity_score` is a snapshot computed at backfill/crawl time with the `NOW` active then. As dates drift into the past, the stored score goes stale — today's DB shows 508 past records still carrying their original (often high) score components plus the past penalty computed at write time. A record scored when its date was 14 days out still shows the `date_near_14_days +15` even though that date is now long past, *unless* the score is recomputed.

**Suggestion**: Either (a) recompute `opportunity_score` on read in the API layer (cheap — the rules are pure functions of the concert record + `now`), or (b) run a nightly `backfill:rescore` job that recomputes all scores with `NOW=today`. Option (a) is simpler and eliminates staleness entirely.

### 6.4 Extend artist extraction for `mtglobal` overseas titles

**Problem**: The 105 residual-unknown and 10 virtual-high records are almost all `mtglobal` overseas stops where the artist name is embedded in the title but the current rule engine does not extract it (e.g. "卢瀚霆"KINGDOM" 巡回演唱会", "EXO PLANET #6", "TWICE＜THIS IS FOR＞", "10CM 权正烈").

**Suggestion**: Add title-pattern rules for overseas records: leading ASCII/Latin artist tokens before "巡回/巡演/演唱会/见面会", K-pop group dictionary (EXO, TWICE, ITZY, NMIXX, CNBLUE, BABYMONSTER, SEVENTEEN, …), and Cantopop artist dictionaries for HK/Macau. This is the single highest-leverage data-quality fix: it simultaneously reduces virtual-high (§5.1), reduces virtual-low (§5.2 overseas tail), and lifts the 105-unknown residual identified in the backfill comparison report.

### 6.5 Differentiate `festival` / `fan_meeting` in scoring (low priority)

**Problem**: `eventType` currently has zero direct score effect (by design — asserted by the regression suite). But a `fan_meeting` and a `festival` have very different commercial profiles (fan meetings are typically small-venue, low-price, artist-driven; festivals are large-venue, lineup-driven).

**Suggestion**: Only pursue if the sales team reports that festival vs. fan-meeting opportunities are being mis-ranked. A small `festival_lineup_bonus` (e.g. +4 when `eventType=festival` AND `artistAll.length >= 3`) would reward genuine festival lineups without affecting solo shows. Low priority — the current rules already capture lineup strength via `artist_lineup_strong`.

---

## 7. Conclusion

| Check | Result |
|---|---|
| Distribution produced for all 714 records | ✅ |
| Histogram + segment statistics emitted | ✅ (0–20: 0, 21–40: 59, 41–60: 384, 61–80: 79, 81–100: 192) |
| High-score segment sampled (top 15, all = 100) | ✅ |
| Low-score segment sampled (bottom 15, 29–33) | ✅ |
| Virtual-high identified (score ≥ 80 + missing artist) | ✅ 10 records |
| Virtual-low identified (score ≤ 40 + artist present) | ✅ 4 records (all past-dated) |
| Root cause of 41–60 peak explained | ✅ 71% past-date records penalised −30 |
| Score-rule improvement suggestions emitted | ✅ 5 suggestions (artist_missing penalty, tiered past penalty, re-score-on-read, overseas artist extraction, eventType differentiation) |
| Score regression green after expansion | ✅ 16/16 cases pass |

### IS_PASS: **YES**

The distribution is healthy and well-understood. The two actionable data-quality levers are (1) adding an `artist_missing` penalty to deflate the 10 virtual-high records, and (2) extending the overseas title-artist extractor to lift the 105-unknown / 59-low-band overseas tail — both of which also close the loop with the backfill comparison report's residual-unknown finding.