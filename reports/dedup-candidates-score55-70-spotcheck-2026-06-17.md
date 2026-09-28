# Dedup Candidates Score 55-70.54 Spotcheck Report

**Date**: 2026-06-17  
**Author**: Engineer (Alex)  
**Purpose**: Verify `artist_missing` dedup conflict guard effectiveness in the score 55-70.54 range  
**Mode**: Read-only (no DB writes, no `--rededup`, no push)

---

## 1. Execution

### Command

```bash
npx tsx scripts/report_dedup_candidates.ts --min-score 55 --max-score 70.54 --limit 10000
```

The script `scripts/report_dedup_candidates.ts` natively supports `--min-score` and `--max-score` parameters (lines 16-17), so no post-filtering was needed. Output was piped to `reports/score55-70-raw.json` for analysis.

### Regression Test

```bash
npx tsx scripts/test_dedup_regression.ts
# Output: ✅ Dedup regression passed (14 cases).
```

Regression unbroken — all 14 cases pass (including the 2 new `artist_missing` guard cases from commit `f612b4d`).

---

## 2. Range Summary

| Metric | Value |
|---|---|
| Total concerts in DB | 715 |
| Total candidates in score 55-70.54 | **257** |
| DUPLICATE_MERGE_THRESHOLD | 55 |
| **merge_candidate** | **0** |
| **review** | **257** |
| Candidates with zero conflict reasons | **0** |

**Key finding**: Zero `merge_candidate` items in this range. Every single one of the 257 candidates has at least one conflict reason and is correctly classified as `review`.

---

## 3. Conflict Reasons Distribution

| Conflict Reason | Count |
|---|---|
| `artist_conflict` | 198 |
| `artist_missing` | 59 |
| `date_range_conflict` | 39 |
| `product_variant_conflict` | 3 |
| *(no conflict reasons)* | **0** |

Note: Some candidates have multiple conflict reasons (e.g., `date_range_conflict` + `artist_missing`), so the sum exceeds 257.

---

## 4. Artist Missing Guard Analysis

### 4.1 Guard Effectiveness

| Metric | Value | Status |
|---|---|---|
| Items with `artist_missing` in conflictReasons | 59 | — |
| Downgraded to `review` | 59 (100%) | ✅ |
| Still `merge_candidate` | **0** | ✅ PASS |

All 59 artist-missing candidates are correctly forced into `review`. Zero slipped through as `merge_candidate`.

### 4.2 Bilateral Artist Missing Risk Assessment

| Metric | Value |
|---|---|
| Both sides artist empty | 12 |
| + titleSim >= 0.75 + venueSim >= 0.75 + dateExact | **0** |

Zero high-risk bilateral artist-missing items. The 12 bilateral artist-missing candidates that exist all have either low title similarity, different venues, or different dates, preventing them from meeting the high-risk criteria.

### 4.3 One-Side Artist Missing

| Metric | Value |
|---|---|
| One side artist empty | 47 |

These 47 candidates have one side with extractable artist info and the other without. The `artist_missing` guard correctly forces them all into `review`.

---

## 5. Strong Anchor Distribution

| Metric | Value |
|---|---|
| `strongAnchor=true` | 10 |

10 candidates have a strong anchor (shared source-id or date+near+venue). Without the `artist_missing` guard, those with empty artist data would have been auto-merged. With the guard, all 10 are correctly downgraded to `review` because they also carry conflict reasons (`artist_missing`, `artist_conflict`, or `date_range_conflict`).

---

## 6. Score Distribution

| Score Bucket | Count |
|---|---|
| 55-56 | 15 |
| 56-57 | 10 |
| 57-58 | 16 |
| 58-59 | 11 |
| 59-60 | 15 |
| 60-61 | 15 |
| 61-62 | 15 |
| 62-63 | 12 |
| 63-64 | 29 |
| 64-65 | 22 |
| 65-66 | 22 |
| 66-67 | 25 |
| 67-68 | 11 |
| 68-69 | 16 |
| 69-70 | 11 |
| 70-71 | 12 |
| **Total** | **257** |

Distribution is spread fairly evenly across the range, with a peak in the 63-64 bucket (29 candidates). No anomalies.

---

## 7. Sample Analysis — Artist Missing Review Items (Top 20 by Score)

All 59 `artist_missing` review items were examined. Below are the top 20 by score, demonstrating the guard working correctly on real production data:

| # | Score | titleSim | LEFT (artist/title) | RIGHT (artist/title) | Verdict |
|---|---|---|---|---|---|
| 1 | 70.31 | 0.813 | "" / ROLLING LOUD 悉尼站 | "" / ROLLING LOUD 墨尔本站 | ✅ Different cities/venues — correctly review |
| 2 | 69.69 | 0.188 | "" / BTS 埃尔帕索站 | "" / Bruno Mars 兰多弗站 | ✅ Completely different artists — correctly review |
| 3 | 69.38 | 0.375 | "2025-26 TREASURE" / TREASURE 曼谷站 | "" / EXO 曼谷站 | ✅ Different K-pop groups — correctly review |
| 4 | 69.09 | 0.182 | "杨丞琳" / 杨丞琳 澳门站 | "" / 汤令山 澳门站 | ✅ Different artists — correctly review |
| 5 | 68.48 | 0.316 | "张信哲" / 张信哲 悉尼站 | "" / oddshapes 墨尔本站 | ✅ Different artists — correctly review |
| 6 | 67.54 | 0.152 | "" / BTS 坦帕站 | "" / Bruno Mars 亚特兰大站 | ✅ Different artists — correctly review |
| 7 | 67.35 | 0.294 | "王嘉尔" / 王嘉尔 布鲁克林站 | "" / Bruno Mars 拉斯维加斯站 | ✅ Different artists — correctly review |
| 8 | 67.22 | 0.107 | "伍佰" / 伍佰 澳门站 | "" / DxS 澳门站 | ✅ Different artists — correctly review |
| 9 | 66.86 | 0.238 | "郑在玹" / 郑在玹 首尔站 | "" / 群星 Weverse音乐节 首尔站 | ✅ Different events — correctly review |
| 10 | 66.52 | 0.261 | "2026 李泰容" / 李泰容 吉隆坡站 | "" / CNBLUE 吉隆坡站 | ✅ Different artists — correctly review |
| 11 | 66.39 | 0.222 | "" / 王菀之×苏打绿 香港站 | "陈松伶" / 陈松伶 香港站 | ✅ Different artists — correctly review |
| 12 | 66.36 | 0.545 | "" / Kraftwerk 新加坡站 | "IVE" / IVE 新加坡站 | ✅ Different artists — correctly review |
| 13 | 66.35 | 0.188 | "" / Bruno Mars 芝加哥站 | "" / BTS 斯坦福站 | ✅ Different artists — correctly review |
| 14 | 66.25 | 0.25 | "" / FNC BAND 香港站 | "SEVENTEEN" / SEVENTEEN 香港站 | ✅ Different artists — correctly review |
| 15 | 66.00 | 0.458 | "" / EXO 澳门站 | "IVE" / IVE 澳门站 | ✅ Different artists — correctly review |
| 16 | 65.98 | 0.125 | "" / FNC BAND 香港站 | "2026金世正" / 金世正 香港站 | ✅ Different artists — correctly review |
| 17 | 65.83 | 0.633 | "" / I Don't Like Mondays 新加坡站 | "" / ONEREPUBLIC 新加坡站 | ✅ Different artists — correctly review |
| 18 | 65.64 | 0.133 | "" / XLOV 香港站 | "" / 卢广仲 香港站 | ✅ Different artists — correctly review |
| 19 | 65.48 | 0.619 | "ITZY" / ITZY 香港站 | "" / UNIDOTS 香港站 | ✅ Different artists — correctly review |
| 20 | 65.39 | 0.143 | "" / DxS 澳门站 | "iKON" / iKON 澳门站 | ✅ Different artists — correctly review |

**All 20 sampled items are genuinely different events** — different artists, different titles, often different venues — that happen to share the same date and/or city. The `artist_missing` guard correctly prevents auto-merging these.

---

## 8. Sample Analysis — Non-Artist-Missing Review Items (Top 20 by Score)

These 198 items have `artist_conflict` as the primary reason (both sides have artists but they differ). Top 20 by score:

| # | Score | titleSim | LEFT artist/title | RIGHT artist/title | Verdict |
|---|---|---|---|---|---|
| 1 | 70.52 | 0.364 | JIMMYSEA / JIMMYSEA 香港站 | 陈柏宇 / 陈柏宇 香港站 | ✅ Different artists — correctly review |
| 2 | 70.43 | 0.317 | 张与辰 / 张与辰 澳门站 | MARK段宜恩 / MARK 澳门站 | ✅ Different artists — correctly review |
| 3 | 70.34 | 0.414 | 2026 ONEUS / ONEUS 香港站 | NMIXX / NMIXX 香港站 | ✅ Different artists — correctly review |
| 4 | 70.33 | 0.28 | LiSA / LiSA 香港站 | 陈柏宇 / 陈柏宇 香港站 | ✅ Different artists — correctly review |
| 5 | 70.28 | 0.775 | ZUTOMAYO / ZUTOMAYO 香港站 | NEXZ / NEXZ 香港站 | ✅ Different artists — correctly review |
| 6 | 70.14 | 0.286 | LMSY / LMSY 曼谷站 | I.O.I / I.O.I 曼谷站 | ✅ Different artists — correctly review |
| 7 | 70.14 | 0.231 | Alessia Cara / Alessia Cara 首尔站 | HONNE / HONNE 首尔站 | ✅ Different artists — correctly review |
| 8 | 70.00 | 0.4 | 2026 AESPA / AESPA 东京站 | TWICE / TWICE 东京站 | ✅ Different artists — correctly review |
| 9 | 70.00 | 0.4 | NEXZ / NEXZ 香港站 | Hi-Fi Un!corn / Hi-Fi Un!corn 香港站 | ✅ Different artists — correctly review |
| 10 | 70.00 | 0.4 | David Byrne / David Byrne 新加坡站 | Kodaline / Kodaline 新加坡站 | ✅ Different artists — correctly review |

**All sampled items are genuinely different events** with different artists. The `artist_conflict` guard correctly prevents auto-merging.

---

## 9. Risk Assessment

### 9.1 Merge Candidate Risk

**Risk Level: NONE**

- Zero `merge_candidate` items in the entire 55-70.54 score range.
- Without the `artist_missing` guard, the 59 artist-missing candidates (especially those with `strongAnchor=true`) would have had `conflictReasons.length === 0` and would have been auto-merged as false positives.
- With the guard, all 59 are correctly forced into `review`.

### 9.2 Bilateral Artist Missing Residual Risk

**Risk Level: NONE**

- 12 bilateral artist-missing candidates exist in this range.
- Zero of them meet the high-risk criteria (titleSim >= 0.75 + venueSim >= 0.75 + dateExact).
- The highest-risk bilateral item is ROLLING LOUD 悉尼站 vs 墨尔本站 (titleSim=0.813) but it has venueSim=0 and different dates, so it does not meet the venue/date criteria.

### 9.3 False Negative Risk (Under-Merging)

**Risk Level: LOW**

- Every candidate in this range has at least one conflict reason (0 items with no conflict reasons).
- The main concern would be if two genuinely-identical events were incorrectly forced into `review` by the `artist_missing` guard. However, if both sides truly have no extractable artist, a human review is the correct action — auto-merging without artist verification is riskier.

### 9.4 False Positive Risk (Over-Merging)

**Risk Level: NONE**

- Zero `merge_candidate` items means zero risk of auto-merging different events.

---

## 10. Conclusion

| Check | Result |
|---|---|
| merge_candidate count in 55-70.54 range | **0** (expected: 0 or near-0) ✅ |
| All artist_missing items downgraded to review | **59/59 (100%)** ✅ |
| artist_missing items still merge_candidate | **0** (expected: 0) ✅ |
| Bilateral artist missing + titleSim>=0.75 + same venue + same date | **0** (expected: 0) ✅ |
| Candidates with zero conflict reasons | **0** (expected: 0) ✅ |
| Regression test (14 cases) | **PASS** ✅ |

### IS_PASS: **YES**

The `artist_missing` dedup conflict guard is fully effective in the score 55-70.54 range. Zero merge candidates, zero residual risk items, all artist-missing candidates correctly downgraded to review, regression unbroken.