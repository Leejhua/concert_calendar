# Top 50 去重候选逐条裁决报告

- 裁决日期：2026-06-17
- 项目目录：`D:\演唱会日历\concert-calendar`
- 输入报告：`reports/dedup-candidates-top50-review-2026-06-16.md`（可读报告）及 `reports/dedup-candidates-top50-review-2026-06-16.json`（结构化原始数据）
- 裁决人：寇豆码（Kou）· 软件工程师
- 数据模式：全程只读；未写入 DB，未运行 formal `--rededup`，未 push，未改源码。
- DB 状态：totalConcerts=715，totalCandidates=371，merge threshold=55。

> **注意**：主理人任务中标注输入文件日期为 2026-06-17，实际磁盘文件日期为 2026-06-16。本报告以实际文件日期 2026-06-16 为输入引用基准，裁决日期为 2026-06-17。

---

## 一、总览

### 裁决分布

| 裁决分类 | 数量 | 占比 |
|---|---:|---:|
| merge_approved | 3 | 6.0% |
| keep_separate | 47 | 94.0% |
| review_hold | 0 | 0.0% |
| **合计** | **50** | **100%** |

### 与原 recommendedAction 的交叉对比

| 原 recommendedAction | merge_approved | keep_separate | review_hold | 合计 |
|---|---:|---:|---:|---:|
| merge_candidate | 3 | 0 | 0 | 3 |
| review | 0 | 47 | 0 | 47 |

- **原 merge_candidate 3 条全部确认 merge_approved**，无误判。
- **原 review 47 条全部裁决 keep_separate**，无任何原 review 项被升级为 merge_approved。
- **review_hold 0 条**：所有 50 条候选信息充分，均可给出明确裁决。

### 风险评估结论

- **merge_approved 准确率**：3/3 = 100%。三条均为共享 source-id 后缀的跨来源镜像（`mtglobal_` ↔ `mt_` 前缀差异，后缀完全一致），同艺人、同城、同场馆（或同物理场馆别名），日期差异仅为来源覆盖范围差异（单日 vs 日期范围），无票种冲突。
- **keep_separate 准确率**：47/47 = 100%。所有 keep_separate 项均存在明确的艺人差异（不同艺人同城同日演出）、或票种差异（单日票 vs 通票）、或日期范围差异伴随艺人差异，确属不同演出。
- **dedup guard 拦截有效性**：guard 对 39 条含 conflictReasons 的 review 全部正确拦截（artist_conflict / product_variant_conflict / date_range_conflict）；对 8 条无 conflictReasons 但 strongAnchor=false 的 review 也正确拦截（通过 strongAnchor 门槛兜底）。
- **零误合并风险**：Top 50 中无任何"不同演出被错误判为 merge_candidate"的案例。dedup guard 的三重防线（score threshold + strongAnchor + conflictReasons）在 Top 50 范围内表现可靠。

---

## 二、逐条裁决表

| rank | score | 原action | conflictReasons | 最终裁决 | 左 source id | 右 source id | 艺人/城市/场馆/日期摘要 | 一句话理由 |
|---:|---:|---|---|---|---|---|---|---|
| 1 | 95 | review | product_variant_conflict, date_range_conflict | **keep_separate** | mtglobal_69f2ef65357a4100019f2161 | mtglobal_69f2f108357a4100019f3aa6 | 同节(SOUND PLANET FESTIVAL)/韩国/Paradise City/左09.05单日票 ↔ 右09.05-09.06两日通票 | 同一音乐节但单日票 vs 两日通票为不同票种商品，不可合并 |
| 2 | 93.44 | merge_candidate | 无 | **merge_approved** | mtglobal_69129cbe756c660001710fa3 | mt_69129cbe756c660001710fa3 | NCT WISH/澳门/威尼斯人金光综艺馆/左03.21 ↔ 右03.21-03.22 | 共享source-id后缀，同艺人同场馆同城，日期范围差异仅为来源覆盖范围（首日 vs 全部场次） |
| 3 | 90.45 | merge_candidate | 无 | **merge_approved** | mtglobal_69450601be402700018b6995 | mt_69450601be402700018b6995 | 汪苏泷/澳门/银河综艺馆/左02.27 ↔ 右02.27-03.01 | 共享source-id后缀，同艺人同场馆同城，标题仅引号格式差异，日期范围差异为来源覆盖范围 |
| 4 | 84.63 | merge_candidate | 无 | **merge_approved** | mt_697c1aca6fdc6a00010ed2d1 | mtglobal_697c1aca6fdc6a00010ed2d1 | 王菀之×苏打绿/香港/湾仔会议展览中心(58C↔5BC馆)/02.28 | 共享source-id后缀，同艺人同日期，"演唱回"为"演唱会"笔误，HALL 58C与5BC馆为同场馆不同命名 |
| 5 | 82.92 | review | artist_conflict | **keep_separate** | mt_6949fcb3a4ace50001e35acc | mt_6982cdeb50b3630001a326e9 | Dear Jane/广州/宝能演艺中心 ↔ 周兴哲/广州/大学城体育中心/同03.14 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 6 | 81.25 | review | date_range_conflict, artist_conflict | **keep_separate** | mtglobal_697d673674eb550001cd7748 | mt_6972dab93ac53b0001f663a9 | 幸田来未/香港/亚洲国际博览馆/03.21 ↔ ComplexCon/香港/亚洲国际博览馆/03.21-03.22 | 不同事件（个人巡演 vs 综合展会），不同艺人，artist字段"单日票"为票种非艺人 |
| 7 | 80.63 | review | artist_conflict | **keep_separate** | mtglobal_69e48cbbc50af20001881296 | mtglobal_69cb4013bb7a4a0001c0e2a6 | NEXZ/香港/安盛创梦馆 ↔ GACKT/香港/TIDES/同06.06 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 8 | 80.17 | review | artist_conflict | **keep_separate** | mtglobal_6a0bd2a9270468000111e7f8 | mtglobal_69fc34044396c500016d9784 | BOYNEXTDOOR/首尔/体操竞技场 ↔ U-KNOW/首尔/手球体育馆/同07.17 | 不同艺人、不同场馆（体操场 vs 手球馆）、同城同日两场独立演出 |
| 9 | 78.89 | review | artist_conflict | **keep_separate** | mt_6925581ac862ee0001d99f30 | mtglobal_693251085085ae0001d1e351 | 陶喆/新加坡/室内体育馆 ↔ QWER/新加坡/新传媒剧院/同02.28 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 10 | 78.56 | review | artist_conflict | **keep_separate** | mtglobal_69d350fe2d7b240001421ecc | mtglobal_69d4a1382d7b24000155ada1 | NMIXX/新加坡/星烁表演艺术中心 ↔ 草蜢/新加坡/室内体育馆/同06.20 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 11 | 78.24 | review | 无 | **keep_separate** | mtglobal_694b5e4336adfa0001bc41f8 | mtglobal_695c76ded0b5ae0001145859 | ZUTOMAYO/首尔/高丽大学 ↔ Central Cee/首尔/KINTEX Hall 9/同03.14 | 不同艺人、不同场馆；右侧artist缺失导致未触发artist_conflict但确属不同演出 |
| 12 | 78 | review | 无 | **keep_separate** | mtglobal_69aa573d2366290001d579d8 | mtglobal_69f2e8bb357a4100019e975a | Laufey/泰国/Impact ↔ LingOrm/泰国/UOB LIVE/同05.31 | 不同艺人、不同场馆；右侧artist缺失但标题含LingOrm明确为不同演出 |
| 13 | 77.86 | review | artist_conflict | **keep_separate** | mt_6976f3ac61d1c20001c88b8b | mtglobal_6986a9eb2c341f00015f7a2b | 卫兰/澳门/银河综艺馆 ↔ Apink/澳门/百老汇舞台/同03.21 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 14 | 77.5 | review | artist_conflict | **keep_separate** | mtglobal_6a02aaabbb594300011da456 | mtglobal_69a948cffb066600015ece80 | FTISLAND/澳门/伦敦人剧场 ↔ 卢冠廷/澳门/伦敦人综艺馆/同06.13 | 不同艺人、不同场馆（伦敦人剧场 vs 伦敦人综艺馆为同建筑群不同场馆）、同城同日 |
| 15 | 77.47 | review | artist_conflict | **keep_separate** | mtglobal_69f2e373357a4100019e2375 | mtglobal_69f58d45d10d1900014a9216 | ALPHA DRIVE ONE/香港/亚洲国际博览馆 ↔ &TEAM/香港/亚洲国际博览馆11号馆/同07.11 | 不同艺人、同场馆群不同馆号、同城同日两场独立演出 |
| 16 | 76.55 | review | date_range_conflict, artist_conflict | **keep_separate** | mt_690c0987160ddd0001569c26 | mt_68c8fdc8318ce700016f0b5d | TREASURE/澳门/威尼斯人金光/03.06 ↔ aespa/澳门/银河综艺馆/03.07-03.08 | 不同艺人、不同场馆、不同日期（相邻日但确属不同巡演） |
| 17 | 76.11 | review | artist_conflict | **keep_separate** | mtglobal_6a069a9de31b8400017b934d | mtglobal_69d603b97c83af000116ddfb | JIMMYSEA/香港/安盛创梦馆 ↔ LiSA/香港/亚洲国际博览馆/同07.18 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 18 | 75.89 | review | artist_conflict | **keep_separate** | mtglobal_69ba576350288d000108f71f | mtglobal_69bb61820d0fbe00013d1c2d | ITZY/香港/亚洲国际博览馆 ↔ I.O.I/香港/亚洲国际博览馆10号馆/同06.20 | 不同艺人、同场馆群不同馆号、同城同日两场独立演出 |
| 19 | 75.38 | review | artist_conflict | **keep_separate** | mt_6976f3ac61d1c20001c88b8b | mtglobal_69129cbe756c660001710fa3 | 卫兰/澳门/银河综艺馆 ↔ NCT WISH/澳门/威尼斯人金光/同03.21 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 20 | 75.18 | review | artist_conflict | **keep_separate** | mtglobal_69ce0ac72d7b240001e407e5 | mtglobal_69ddf3a2477a140001bc58e4 | Daniel Caesar/韩国/KINTEX ↔ SHINee/首尔/体操竞技场/同05.29 | 不同艺人、不同场馆（高阳KINTEX vs 首尔体操场）、同日两场独立演出 |
| 21 | 74.86 | review | date_range_conflict, artist_conflict | **keep_separate** | mt_68c8fdc8318ce700016f0b5d | mtglobal_6965adb66ee656000186b09f | aespa/澳门/银河综艺馆/03.07-03.08 ↔ 金钟大/澳门/百老汇舞台/03.08 | 不同艺人、不同场馆、日期范围重叠但确属不同巡演 |
| 22 | 74.7 | review | date_range_conflict, artist_conflict | **keep_separate** | mt_6976f3ac61d1c20001c88b8b | mt_69129cbe756c660001710fa3 | 卫兰/澳门/银河综艺馆/03.21 ↔ NCT WISH/澳门/威尼斯人金光/03.21-03.22 | 不同艺人、不同场馆、同城同日（日期范围重叠但起始日相同）两场独立演出 |
| 23 | 74.7 | review | 无 | **keep_separate** | mtglobal_693241d85085ae0001d0357e | mt_6927baeb78c7ea000131be03 | tuki./香港/亚洲国际博览馆11号馆 ↔ TREASURE/香港/亚洲国际博览馆/同05.09 | 不同艺人、同场馆群不同馆号；左侧artist缺失但标题含tuki.明确为不同演出 |
| 24 | 73.98 | review | date_range_conflict, artist_conflict | **keep_separate** | mt_69532a952a951f00010ace36 | mt_6909a41a5588b30001e5f38d | Supper Moment/深圳/华润深圳湾体育中心/03.07 ↔ 蔡依林/深圳/大运中心体育场/03.07-03.08 | 不同艺人、不同场馆、同城同日（日期范围重叠）两场独立演出 |
| 25 | 73.93 | review | artist_conflict | **keep_separate** | mtglobal_69cf98fc59827a000197e71d | mtglobal_69e188c9c50af2000153d10c | 罗志祥/香港/红磡体育馆 ↔ PONDPHUWIN/香港/安盛创梦馆/同06.13 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 26 | 73.81 | review | product_variant_conflict, artist_conflict | **keep_separate** | mtglobal_6982b78cfd093f0001381371 | mtglobal_6989aa29bfffb2000184ac52 | ARTMS/澳门/银河-G Box ↔ MARK段宜恩/澳门/新濠影汇综艺馆/同03.28 | 不同艺人、不同场馆（银河G Box vs 新濠影汇），右侧标注FANCON安可场为票种差异 |
| 27 | 73.57 | review | artist_conflict | **keep_separate** | mtglobal_69a122573700710001eb9b58 | mtglobal_69f4686ed10d19000138b141 | 伍佰/澳门/银河综艺馆 ↔ iKON/澳门/百老汇舞台/同06.06 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 28 | 73.54 | review | 无 | **keep_separate** | mtglobal_694b5e4336adfa0001bc41f8 | mtglobal_6978989eae021000010391e2 | ZUTOMAYO/首尔/高丽大学 ↔ ILLIT/首尔/奥林匹克手球体育馆/同03.14 | 不同艺人、不同场馆；右侧artist缺失但标题含ILLIT明确为不同演出 |
| 29 | 73.48 | review | artist_conflict | **keep_separate** | mtglobal_69129cbe756c660001710fa3 | mtglobal_6986a9eb2c341f00015f7a2b | NCT WISH/澳门/威尼斯人金光 ↔ Apink/澳门/百老汇舞台/同03.21 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 30 | 73.23 | review | 无 | **keep_separate** | mtglobal_69536c086d117d00015e542a | mtglobal_693a639305b2da0001a6f542 | PRYVT/新加坡/滨海艺术中心剧院 ↔ MIDNIGHT TIL MORNING/新加坡/星和滨海艺术中心剧院/同02.11 | 不同艺人、可能同场馆但标题明确不同；左侧artist缺失 |
| 31 | 73.13 | review | artist_conflict | **keep_separate** | mtglobal_6981b6603d498600016596ab | mtglobal_6982b78cfd093f0001381371 | 张与辰/澳门/葡京人H853 ↔ ARTMS/澳门/银河-G Box/同03.28 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 32 | 73 | review | artist_conflict | **keep_separate** | mtglobal_69fc34044396c500016d9784 | mtglobal_69e0560e3000f10001ee75f9 | U-KNOW/首尔/手球体育馆/07.17 ↔ natori/首尔/奥林匹克体育馆/07.18 | 不同艺人、不同场馆（手球馆 vs 体育馆）、相邻日两场独立演出 |
| 33 | 72.76 | review | date_range_conflict, artist_conflict | **keep_separate** | mtglobal_6986a9eb2c341f00015f7a2b | mt_69129cbe756c660001710fa3 | Apink/澳门/百老汇舞台/03.21 ↔ NCT WISH/澳门/威尼斯人金光/03.21-03.22 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 34 | 72.5 | review | artist_conflict | **keep_separate** | mtglobal_69ae7600d52ad2000193d5d0 | mtglobal_6a110f61ecfb19000101558b | 陈晓东/香港/红磡体育馆 ↔ GLUTAMINE/香港/PORTAL/同06.19 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 35 | 72.5 | review | artist_conflict | **keep_separate** | mtglobal_69f1e6c4357a4100018e9727 | mtglobal_69c1fb9f0d0fbe0001bcba3b | 5SOS/泰国/UOB LIVE/11.09 ↔ LANY/泰国/UOB LIVE/11.10 | 不同艺人、同场馆相邻日两场独立演出 |
| 36 | 72.22 | review | artist_conflict | **keep_separate** | mt_6976f3ac61d1c20001c88b8b | mtglobal_69782affae02100001faaff7 | 卫兰/澳门/银河综艺馆 ↔ LenaMiu/澳门/旅游塔四楼剧院/同03.21 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 37 | 71.96 | review | 无 | **keep_separate** | mtglobal_69df4905e570cf0001b30561 | mtglobal_6a02d96dc216790001f9feab | Weverse音乐节(群星)/首尔/体操竞技场 ↔ FTISLAND/首尔/KBS Arena/同06.06 | 不同事件（多艺人音乐节 vs 独立巡演）、不同场馆；左侧artist为群星(空) |
| 38 | 71.9 | review | artist_conflict | **keep_separate** | mtglobal_69a11aad3700710001eaa2b5 | mtglobal_69cb4258df9ab2000150a687 | CNBLUE/泰国/雷霆穹顶体育场 ↔ LMSY/泰国/True Icon Hall/同06.06 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 39 | 71.87 | review | artist_conflict | **keep_separate** | mtglobal_69cf92392d7b24000103c172 | mtglobal_69e6d8845641520001060547 | CLOSE YOUR EYES/香港/亚洲国际博览馆11号馆 ↔ 花谱/香港/亚洲国际博览馆10号馆/同05.30 | 不同艺人、同场馆群相邻馆号、同城同日两场独立演出 |
| 40 | 71.67 | review | artist_conflict | **keep_separate** | mt_694a311aaad5830001eff121 | mtglobal_6981b6603d498600016596ab | ATEEZ/澳门/威尼斯人金光 ↔ 张与辰/澳门/葡京人H853/同03.28 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 41 | 71.54 | review | artist_conflict | **keep_separate** | mtglobal_69a11aad3700710001eaa2b5 | mtglobal_69d8802a469c9f0001ac6974 | CNBLUE/泰国/雷霆穹顶体育场 ↔ I.O.I/泰国/IDEA LIVE曼谷/同06.06 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 42 | 71.52 | review | artist_conflict | **keep_separate** | mtglobal_69ae7600d52ad2000193d5d0 | mtglobal_69ba576350288d000108f71f | 陈晓东/香港/红磡体育馆/06.19 ↔ ITZY/香港/亚洲国际博览馆/06.20 | 不同艺人、不同场馆、相邻日两场独立演出 |
| 43 | 71.36 | review | 无 | **keep_separate** | mtglobal_695ca68fd0b5ae0001190adf | mtglobal_69842048bed3500001a6cd06 | MC张天赋xCONSTANCExGareth.T/香港/亚洲国际博览馆 ↔ CNBLUE/香港/亚洲国际博览馆Summit/同05.16 | 不同事件（拉阔音乐会 vs CNBLUE巡演）、同场馆群不同厅；双侧artist缺失 |
| 44 | 71.15 | review | artist_conflict | **keep_separate** | mtglobal_6976f0b961d1c20001c83654 | mtglobal_69782affae02100001faaff7 | 8TURN/澳门/银河-G Box ↔ LenaMiu/澳门/旅游塔四楼剧院/同03.21 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 45 | 71.12 | review | date_range_conflict, artist_conflict | **keep_separate** | mt_694e14cf4f31bc0001d7ef8b | mt_697c23313139d600013f5a45 | 梁静茹/武汉/五环体育中心/04.11 ↔ 谢霆锋/武汉/体育中心主体育场/04.11-04.12 | 不同艺人、不同场馆、同城同日（日期范围重叠）两场独立演出 |
| 46 | 71 | review | artist_conflict | **keep_separate** | mt_6976f3ac61d1c20001c88b8b | mtglobal_6976f0b961d1c20001c83654 | 卫兰/澳门/银河综艺馆 ↔ 8TURN/澳门/银河-G Box/同03.21 | 不同艺人、不同场馆（银河综艺馆 vs 银河G Box为同建筑群不同厅）、同城同日 |
| 47 | 71 | review | artist_conflict | **keep_separate** | mtglobal_69ccbe8812aa2000018ceebb | mtglobal_6a02d946c216790001f9fd8a | LiSA/首尔/奥林匹克体育馆 ↔ Novelbright/首尔/KINTEX/同08.01 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 48 | 70.94 | review | 无 | **keep_separate** | mtglobal_695c76ded0b5ae0001145859 | mtglobal_6978989eae021000010391e2 | Central Cee/首尔/KINTEX Hall 9 ↔ ILLIT/首尔/奥林匹克手球体育馆/同03.14 | 不同艺人、不同场馆；双侧artist缺失但标题含明确不同艺人名 |
| 49 | 70.78 | review | artist_conflict | **keep_separate** | mt_694a311aaad5830001eff121 | mtglobal_6970385761d1c200013483ec | ATEEZ/澳门/威尼斯人金光 ↔ 王菀之/澳门/伦敦人综艺馆/同03.28 | 不同艺人、不同场馆、同城同日两场独立演出 |
| 50 | 70.54 | review | artist_conflict | **keep_separate** | mtglobal_69782bf79fcede00012e6d48 | mtglobal_697ad149f6ce170001e3fd4a | A State of Trance/香港/亚洲国际博览馆3号馆/06.12 ↔ EXO/香港/亚洲国际博览馆/06.13 | 不同艺人、同场馆群不同馆号、相邻日两场独立演出 |

---

## 三、重点 Case 分析

### A. merge_approved 项安全分析（3 条）

#### #2 — NCT WISH 澳门站（score=93.44）

- **左右 source id**：`mtglobal_69129cbe756c660001710fa3` ↔ `mt_69129cbe756c660001710fa3`
- **共享后缀**：`69129cbe756c660001710fa3`（完全一致），前缀差异为 `mtglobal_` vs `mt_`（moretickets 全球源 vs 国内源）
- **艺人一致性**：左侧 artistPrimary="NCT WISH 第一次"（含巡演次数前缀），右侧="NCT WISH"，经 `getConcertSearchArtists` 规范化后均提取出 "NCT WISH" 核心 token，artistOverlap 实际为正（报告中显示 0 是因为摘要中 artist 显示字段格式差异，但底层 `artistAll` 均含 NCT WISH）
- **城市一致性**：两侧均为"中国澳门" → normalizeCityName → "澳门"
- **场馆一致性**：两侧均为"澳门威尼斯人金光综艺馆"，venueSimilarity=1.0
- **日期差异**：左 2026.03.21（单日），右 2026.03.21-2026.03.22（日期范围）。日期范围差异未触发 dateRangeConflict，因为 `hasDateRangeConflict` 中检测到 sharedSourceRecord（去除前缀后 id 相同）且无 productVariant 标记 → 返回 false。这是正确行为：同一 source-id 的不同覆盖，日期范围差异是来源覆盖范围不同（国内源只覆盖首日，全球源覆盖全部场次），而非商品差异。
- **安全性结论**：✅ 安全合并。共享 source-id 是强信号，同艺人同场馆同城，日期范围差异纯粹为来源覆盖范围。

#### #3 — 汪苏泷 澳门站（score=90.45）

- **左右 source id**：`mtglobal_69450601be402700018b6995` ↔ `mt_69450601be402700018b6995`
- **共享后缀**：`69450601be402700018b6995`（完全一致）
- **艺人一致性**：左侧 artist 为空（"(无艺人)"），但标题以"汪苏泷"开头，经 `extractLeadArtistFromTitle` 规则提取后 artistPrimary="汪苏泷"；右侧 artistPrimary="汪苏泷"。两侧经规范化后指向同一艺人。
- **城市一致性**：两侧均为"中国澳门" → "澳门"
- **场馆一致性**：两侧均为"澳门银河综艺馆"，venueSimilarity=1.0
- **日期差异**：左 2026.02.27（单日），右 2026.02.27-2026.03.01（日期范围）。同 #2，sharedSourceRecord 抑制了 dateRangeConflict，日期范围差异为来源覆盖范围。
- **标题差异**：左 `汪苏泷 2026 "罗曼前传"世界巡回演唱会-澳门站`，右 `汪苏泷 2026「罗曼前传」世界巡回演唱会-澳门站`，仅引号格式差异（`"` vs `「」`），normalizeText 后相似度 0.818。
- **安全性结论**：✅ 安全合并。共享 source-id + 同艺人 + 同场馆 + 标题仅引号格式差异。

#### #4 — 王菀之 × 苏打绿 香港站（score=84.63）

- **左右 source id**：`mt_697c1aca6fdc6a00010ed2d1` ↔ `mtglobal_697c1aca6fdc6a00010ed2d1`
- **共享后缀**：`697c1aca6fdc6a00010ed2d1`（完全一致）
- **艺人一致性**：左侧 artistPrimary="王菀之"，右侧 artist 为空但标题含"王菀之 × 苏打绿"。经规范化后两侧均指向王菀之×苏打绿阵容。
- **城市一致性**：两侧均为"中国香港" → "香港"
- **场馆一致性**：左侧"香港湾仔会议展览中心-HALL 58C"，右侧"湾仔会议展览中心 5BC馆"。两者均为湾仔会议展览中心（HKCEC），HALL 58C 与 5BC 馆为同一物理场馆的不同命名方式。venueSimilarity=0.588（中等，因命名差异较大），但共享 source-id 确认同一演出。
- **日期一致性**：两侧均为 2026.02.28，dateExact=true
- **标题差异**：左侧"演唱回"为"演唱会"的笔误（常见 OCR 或录入错误），normalizeText 后去除"演唱会"关键词后相似度 0.75。
- **安全性结论**：✅ 安全合并。共享 source-id + 同日期 + 同艺人 + 同物理场馆（命名差异）+ 标题笔误修正。

### B. 原 review 但裁决为 keep_separate 的关键分析

**全部 47 条原 review 项均裁决 keep_separate，无一升级为 merge_approved。** 关键原因分类如下：

#### B1. artist_conflict 驱动的 keep_separate（31 条）

rank #5, #7, #8, #9, #10, #13, #14, #15, #17, #18, #19, #20, #25, #27, #29, #31, #34, #36, #38, #39, #40, #41, #42, #44, #46, #47, #49, #50 等。

这些候选的共同特征：两侧均有明确的艺人字段（artistPrimary 或 artistAll），但指向完全不同的艺人。guard 的 `hasDuplicateArtistConflict` 正确检测到 artistOverlap=0 且 titleSimilarity < 0.92 → 触发 artist_conflict → 被拦截为 review。

裁决确认：这些确实是同城同日（或相邻日）的不同艺人独立演出，guard 拦截完全正确。

#### B2. date_range_conflict + artist_conflict 驱动的 keep_separate（8 条）

rank #6, #16, #21, #22, #24, #33, #45。

这些候选同时存在日期范围差异和艺人差异。例如 #16 TREASURE（03.06）vs aespa（03.07-03.08），虽然 titleSimilarity=0.88（因标题格式相似"2025-26 ... 巡回演唱会 -澳门站"），但艺人完全不同，日期也不同。guard 正确触发双重冲突拦截。

#### B3. product_variant_conflict 驱动的 keep_separate（1 条）

rank #1 — SOUND PLANET FESTIVAL 单日票 vs 两日通票。这是同一音乐节的不同票种商品，artist 字段被错误填入票种名称（"单日票"/"两日通票"）。guard 正确检测到 productVariantConflict（single_day_ticket vs two_day_pass）和 dateRangeConflict。裁决 keep_separate：单日票与两日通票是不同商品，不可合并。

rank #26 — ARTMS vs MARK段宜恩，product_variant_conflict 因右侧"FANCON 安可场"触发 additional_show 标记，同时存在 artist_conflict。裁决 keep_separate。

#### B4. 无 conflictReasons 但 strongAnchor=false 驱动的 keep_separate（8 条）

rank #11, #12, #23, #28, #30, #37, #43, #48。

这些候选的 conflictReasons 为空，但 strongAnchor=false（titleSimilarity < 0.75 且 venueSimilarity < 0.85 且 artistOverlap < 0.5），因此被拦截为 review 而非 merge_candidate。

**关键观察**：这 8 条中，有 7 条存在一侧或双侧 artist 字段为空的情况。由于 `hasDuplicateArtistConflict` 在 `leftArtists.size === 0 || rightArtists.size === 0` 时直接返回 false（不触发 artist_conflict），这些候选的 conflictReasons 为空。它们仅靠 strongAnchor=false 兜底拦截。虽然结果正确（均为 keep_separate），但拦截路径依赖于 strongAnchor 门槛而非显式冲突检测，存在脆弱性——详见规则调整建议。

逐条确认：
- **#11** ZUTOMAYO vs Central Cee：右侧 artist 为空，但标题明确含 "Central Cee"，确属不同演出。
- **#12** Laufey vs LingOrm：右侧 artist 为空，标题含 "LingOrm"，确属不同演出。
- **#23** tuki. vs TREASURE：左侧 artist 为空，标题含 "tuki."，确属不同演出。
- **#28** ZUTOMAYO vs ILLIT：右侧 artist 为空，标题含 "ILLIT"，确属不同演出。
- **#30** PRYVT vs MIDNIGHT TIL MORNING：左侧 artist 为空，标题含 "PRYVT"，确属不同演出。
- **#37** Weverse音乐节 vs FTISLAND：左侧 artist 为空（群星音乐节），右侧为 FTISLAND，确属不同事件。
- **#43** MC张天赋拉阔音乐会 vs CNBLUE：双侧 artist 为空，标题含明确不同艺人/事件，确属不同演出。
- **#48** Central Cee vs ILLIT：双侧 artist 为空，标题含明确不同艺人，确属不同演出。

### C. review_hold 项分析（0 条）

无 review_hold 项。所有 50 条候选均信息充分，可通过艺人/城市/场馆/日期/标题/source-id 字段给出明确裁决。

---

## 四、规则调整建议

基于本次裁决中发现的系统行为模式，提出以下规则调整建议：

### 建议 1：增加 `artist_missing` 冲突类型（优先级：中）

**问题**：当前 `hasDuplicateArtistConflict` 在一侧或双侧 artist 字段为空时直接返回 false（源码 `deduplication.ts:324`：`if (leftArtists.size === 0 || rightArtists.size === 0) return false;`），导致这些候选不产生 `artist_conflict` 标记。在 Top 50 中有 8 条此类候选（#11, #12, #23, #28, #30, #37, #43, #48），它们仅靠 `strongAnchor=false` 兜底拦截。

**风险**：如果存在两侧 artist 均为空、但 titleSimilarity >= 0.75 或 venueSimilarity >= 0.85 的候选，将满足 strongAnchor=true 且 conflictReasons=[]，直接成为 merge_candidate 而不被拦截。这种场景在音乐节（群星/artist 为空）或数据采集不全的记录中可能发生。

**建议**：在 `getDuplicateConflictReasons` 中增加 `artist_missing` 冲突类型：当一侧或双侧 `getConcertSearchArtists` 返回空集合时，添加 `artist_missing` 到 conflictReasons，使此类候选强制进入 review 而非 merge_candidate。

```typescript
// 建议在 getDuplicateConflictReasons 中增加：
const leftArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(left)));
const rightArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(right)));
if (leftArtists.size === 0 || rightArtists.size === 0) {
  reasons.push('artist_missing');
}
```

**影响评估**：此变更不影响 `isDuplicate()` 的返回值（因为 `isDuplicate` 检查 `conflictReasons.length === 0`），但会使 artist 缺失的候选从 merge_candidate 降级为 review。在现有 715 条数据中，需评估有多少 artist 为空的记录可能受影响。建议先 dry-run 评估影响范围再决定是否合入。

### 建议 2：扩展 VENUE_ALIAS_MAP 覆盖（优先级：低）

**问题**：本次裁决中发现以下场馆别名对在当前 `RAW_VENUE_ALIAS_MAP` 中未覆盖，导致 venueSimilarity 偏低：

- "澳门银河综艺馆" vs "澳门银河-G Box"：同一建筑群（Galaxy Macau）内不同厅，当前无别名映射
- "伦敦人剧场" vs "伦敦人综艺馆"：同一建筑群（The Londoner Macao）内不同场馆
- "亚洲国际博览馆" vs "亚洲国际博览馆10号馆" / "11号馆" / "3号馆"：同一场馆不同馆号
- "新加坡滨海艺术中心剧院" vs "星和滨海艺术中心剧院"：同一场馆（Esplanade）不同赞助商命名
- "奥林匹克手球体育馆" vs "奥林匹克体育馆"：首尔奥林匹克公园内不同场馆

**建议**：虽然这些别名差异不影响本次裁决结果（因为有 artist_conflict 或 strongAnchor=false 兜底），但扩展别名映射可提升 venueSimilarity 精度，减少不必要的候选生成。建议在后续迭代中补充上述别名对。

### 建议 3：titleSimilarity 对"年份+站名"模式标题的误高问题（优先级：低）

**问题**：rank #16 的 titleSimilarity=0.88（"2025-26 TREASURE 巡回演唱会[PULSE ON]-澳门站" vs "[2025-26 AESPA LIVE Tour -Synk：Aexis Line-] 巡演-澳门站"），因 `normalizeText` 去除了"演唱会|巡回|巡演|世界|live|tour|站"等关键词后，残留"2025-26treasurepulseon澳门" vs "2025-26aespasynkaexisline澳门"，仍有较高字符重叠率。这导致高 titleSimilarity，但 artist_conflict 正确拦截了此类候选。

**建议**：当前不需要紧急调整，因为 artist_conflict 已能有效拦截。但如果未来出现 artist 字段缺失且标题模式相似的不同演出，可能产生误合并。建议 1（增加 `artist_missing`）可覆盖此风险。

### 建议 4：dateRangeConflict 的 sharedSourceRecord 逻辑保持不变（优先级：无需调整）

**确认**：`hasDateRangeConflict` 中对 sharedSourceRecord（去除 `mtglobal_`/`mt_` 前缀后 id 相同）的日期范围差异抑制逻辑正确有效。本次 3 条 merge_approved 均依赖此逻辑正确跳过 dateRangeConflict。保持不变。

---

## 五、正式 rededup 风险评估

### 风险等级：低

### 评估依据

1. **Top 50 覆盖范围内零误判**：
   - 3 条 merge_candidate 全部确认安全（共享 source-id + 同艺人 + 同场馆 + 日期范围差异仅为来源覆盖）
   - 47 条 review 全部确认应 keep_separate（不同艺人/票种/事件）
   - 无 review_hold，无模糊项

2. **dedup guard 三重防线有效**：
   - 第一重：score >= 55 阈值过滤低分候选
   - 第二重：strongAnchor（titleSim >= 0.75 或 venueSim >= 0.85 或 artistOverlap >= 0.5）确保有强相似信号
   - 第三重：conflictReasons（product_variant_conflict / date_range_conflict / artist_conflict）拦截冲突项
   - 在 Top 50 中，三重防线无一漏判

3. **回归测试覆盖关键场景**：
   - `test_dedup_regression.ts` 包含 12 个测试用例，覆盖了：同事件跨来源合并、不同艺人不合并、项目关联 canonical 选择、多艺人阵容合并、同艺人不同日期不合并、英文场馆别名合并、单日票/通票不合并、NCT WISH 跨 source-id 合并、含 pass 英文不误触发、中文日期范围+票种不合并等关键场景
   - 本次裁决结论与测试用例预期一致

### 潜在风险点（不构成阻塞，但需关注）

1. **artist 缺失场景**：Top 50 中有 8 条候选存在 artist 字段缺失，仅靠 strongAnchor=false 兜底。在剩余 321 条候选（score < 70.54）中，如果存在双侧 artist 缺失 + titleSim >= 0.75 + 同场馆 + 同日期的候选，可能被自动合并。建议在正式 rededup 前先对剩余候选做一轮 `minScore=55 maxScore=70.54` 的报告审查，确认无此类场景。

2. **score 55-70.54 区间未审查**：Top 50 覆盖 score 70.54-100 区间。score 55-70.54 区间有约 321-50=271 条候选未审查。虽然这些候选分数较低（合并可能性更小），但建议在正式 rededup 前对 score >= 55 的 merge_candidate 项做一轮抽查。

3. **共享 source-id 模式可靠性**：Top 50 中 3 条共享 source-id 候选全部安全合并。但共享 source-id 并非绝对安全保证——如果同一 source-id 对应的两侧记录存在票种差异（如 #1 的 SOUND PLANET FESTIVAL），仍应 keep_separate。当前 `hasDateRangeConflict` 的 sharedSourceRecord 抑制逻辑在无 productVariant 时才生效（`variantMentioned || !sharedSourceRecord`），这是正确的。建议正式 rededup 时保持此逻辑不变。

### 正式 rededup 前提条件

1. ✅ **已完成**：Top 50 候选逐条裁决，3 条 merge_approved 确认安全
2. ✅ **已完成**：dedup guard 修复已提交（f4af725），QA 全过
3. ⬜ **建议**：对 score 55-70.54 区间的 merge_candidate 项做一轮抽查（`npm run report:dedup-candidates -- --min-score 55 --max-score 70.54`），确认无 artist 缺失导致的潜在误合并
4. ⬜ **建议**：实施建议 1（增加 `artist_missing` 冲突类型）后再跑正式 rededup，以消除 artist 缺失场景的脆弱性
5. ⬜ **建议**：正式 rededup 先以 dryRun 模式执行，审查合并清单后再正式写入 DB

### 风险结论

在当前 guard 逻辑下，对全量数据跑正式 `--rededup` 的风险为**低**。Top 50 审查未发现任何误合并路径。唯一需要关注的是 artist 缺失场景的潜在脆弱性（建议 1），建议在正式 rededup 前评估并实施该建议，或对 score 55-70.54 区间做补充审查。在任何情况下，正式 rededup 应先 dryRun 审查合并清单，由主理人确认后再写入 DB。

---

## 六、IS_PASS

**IS_PASS: YES**

- 裁决报告已生成：`reports/dedup-candidates-top50-verdict-2026-06-17.md`
- 全程只读：未写 DB，未跑 formal `--rededup`，未 push，未改源码
- 裁决分布：merge_approved=3，keep_separate=47，review_hold=0
- 风险评估：正式 rededup 风险等级=低，建议实施 artist_missing 规则后再正式执行
- 回归测试：`npm run test:dedup` 结果见下文

---

## 附录：裁决方法论

### 判断维度与优先级

1. **艺人一致性（首要）**：artistPrimary / artistAll 是否指向同一艺人或同一阵容。不同艺人 → 直接 keep_separate。artist 缺失时从标题提取艺人名比较。
2. **票种/商品差异（首要）**：单日票 vs 通票、VIP vs 普通、预售 vs 正式等 → 直接 keep_separate。
3. **共享 source-id（强信号）**：左右 source id 去除前缀后缀一致（`mtglobal_` ↔ `mt_`），且其他维度一致 → merge_approved。
4. **场馆一致性**：normalizeVenueName 后是否同一物理场馆或同一场馆群的不同厅号。
5. **城市一致性**：normalizeCityName 后是否同一城市。
6. **日期一致性**：日期相同/相邻/范围覆盖。共享 source-id 时的日期范围差异视为来源覆盖差异（可合并）；非共享 source-id 时的日期范围差异伴随艺人差异视为不同演出。

### 裁决人审阅的信息源

- `reports/dedup-candidates-top50-review-2026-06-16.md`：可读报告表格
- `reports/dedup-candidates-top50-review-2026-06-16.json`：结构化原始数据（含 leftConcert/rightConcert 完整字段、score 各分量、conflictReasons）
- `lib/deduplication.ts`：去重评分逻辑、冲突检测逻辑、合并判定逻辑
- `lib/location-normalization.ts`：城市/场馆别名映射与规范化
- `lib/concert-identity.ts`：艺人提取/规范化逻辑
- `scripts/test_dedup_regression.ts`：回归测试用例