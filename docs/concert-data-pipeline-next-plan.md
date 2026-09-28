# 演唱会数据管道后续工作计划

## 背景

当前项目已经围绕“主演/阵容提取、去重、商业评分”推进了一轮数据管道重构。核心方向已经从旧逻辑的“演出形式影响价值判断”调整为：

- `eventType` 只描述演出形式，不直接决定商业价值。
- 单人、多人、tribute、fan meeting、festival 都不天然加分或扣分。
- 商业价值应由艺人/阵容热度、城市、场馆、票价、销售状态、时间窗口、项目匹配度等独立信号决定。
- 主演提取只负责识别“谁在演”和“是什么类型”，不负责判断“值不值得跟”。

目前已看到项目里已经实现了不少基础设施：

- `lib/concert-identity.ts`：演出身份规范化、艺人集合、展示标题清理、eventType 识别。
- `lib/location-normalization.ts`：城市/场馆归一化。
- `lib/deduplication.ts`：基于城市、日期、标题、场馆、艺人集合的打分去重。
- `lib/opportunity-score.ts`：独立商机评分，不再按演出形式直接扣分。
- `scripts/backfill_concert_identity.ts`：历史数据身份字段回填脚本。
- 回归脚本：artist identity、dedup、score、location，目前均可运行通过。

本计划用于梳理剩余工作，目标是把“已完成的核心模块”推进到“可安全上线/可长期维护”的状态。

---

## 当前进度判断

首期数据管道改造约完成 **70%**。

已完成或基本完成：

1. 演出形式与商业价值初步解耦。
2. 新增结构化身份字段：`rawTitle`、`rawArtistTag`、`artistPrimary`、`artistAll`、`eventType`、`artistConfidence`、`artistSource`。
3. DeepSeek prompt 已改为结构化身份抽取，不再因为 tribute/fan meeting/multi-artist 抹掉艺人。
4. 城市/场馆归一化已实现。
5. 去重已改为打分制，并有基础回归测试。
6. 商业评分已抽到 `opportunity-score.ts`，按商业信号评分。
7. DB 层已接入新增字段。
8. 已有 backfill 脚本和回归测试命令。

主要未完成：

1. 旧逻辑残留审计还没做完。
2. UI/API 是否全面使用新字段还需确认。
3. 历史数据回填是否正式完成还需确认。
4. 真实数据抽样验收还没系统化。
5. build/lint 未确认通过。
6. 去重阈值和评分权重还需要用真实样本校准。

---

## 后续执行顺序

### Phase 1：收尾审计与安全网补齐

目标：确认当前代码没有继续使用旧价值判断逻辑，保证已有改造不会被旧字段污染。

#### 1.1 搜索并审计旧逻辑残留

重点检查：

- `is_famous`
- `is_tribute`
- `Unknown`
- `群星`
- `artist ===`
- `artist !==`
- `title.startsWith('【')`
- `opportunityScore`
- `eventType`

关注点：

- 是否还有 `is_famous === false -> artist = Unknown`。
- 是否还有 `is_tribute === true -> artist = Unknown`。
- 是否还有 tribute/fan meeting/multi_artist/festival 直接降分或过滤。
- 是否还有把 `artist` 直接写回 `title` 的逻辑。
- 是否还有 UI/API 直接展示旧 `title` 导致 `【歌手】` 前缀出现。

代表文件：

- `lib/damai-crawler.ts`
- `lib/deduplication.ts`
- `lib/concert-utils.ts`
- `lib/opportunity-score.ts`
- `lib/db.ts`
- `app/api/concerts/route.ts`
- `app/dashboard/dashboard-client.tsx`
- `components/CalendarEventCard.tsx`
- `components/MobileConcertCalendar.tsx`
- `components/MobileDashboard.tsx`

#### 1.2 扩充回归用例

在现有测试基础上补充高风险样本：

- tribute 保留艺人且不降商业分。
- fan meeting 保留艺人且不降商业分。
- 多人阵容保留 `artistAll`，商业评分因阵容信号可加分。
- `【歌手】xxx` 展示标题清理。
- `artist = 歌手 / 音乐会 / Unknown` 不应污染 `artistPrimary`。
- 同城同日不同艺人不能误合并。
- 同艺人同城但不同日期跨度不能误合并。
- 英文标题/中英文混排标题的艺人提取。

涉及文件：

- `scripts/test_artist_identity_regression.ts`
- `scripts/test_dedup_regression.ts`
- `scripts/test_opportunity_score_regression.ts`
- `scripts/test_location_normalization_regression.ts`

#### 1.3 运行基础验证

必须通过：

```bash
npm run test:artist-identity
npm run test:dedup
npm run test:score
npm run test:location
npm run lint
npm run build
```

如果在项目外层运行，需要使用：

```bash
npm --prefix "D:\演唱会日历\concert-calendar" run test:artist-identity
npm --prefix "D:\演唱会日历\concert-calendar" run test:dedup
npm --prefix "D:\演唱会日历\concert-calendar" run test:score
npm --prefix "D:\演唱会日历\concert-calendar" run test:location
npm --prefix "D:\演唱会日历\concert-calendar" run lint
npm --prefix "D:\演唱会日历\concert-calendar" run build
```

验收标准：

- 所有 regression 通过。
- lint/build 通过。
- 没有发现会把 eventType 当作直接负向商业信号的逻辑。

---

### Phase 2：UI/API 新字段适配确认

目标：保证新数据管道的结果真的被页面、搜索、排序和 API 使用，而不是只存在于 DB 和 helper 里。

#### 2.1 API 层检查

重点文件：

- `app/api/concerts/route.ts`
- `app/api/upload/route.ts`

检查内容：

- 返回值是否包含新增字段：
  - `rawTitle`
  - `artistPrimary`
  - `artistAll`
  - `eventType`
  - `artistConfidence`
  - `artistSource`
  - `opportunityScoreBreakdown`
- 排序是否使用新的 `opportunityScore`。
- 搜索是否覆盖 `artistPrimary`、`artistAll` 和 legacy `artist`。
- 上传/导入路径是否调用 `normalizeConcertRecord`。

验收标准：

- API 返回的新字段完整。
- 前端搜索可搜到 `artistAll` 中的非 primary 艺人。
- 旧 `artist` 字段仍兼容，但不作为唯一真值。

#### 2.2 页面展示检查

重点文件：

- `components/CalendarEventCard.tsx`
- `components/MobileConcertCalendar.tsx`
- `components/MobileDashboard.tsx`
- `app/dashboard/dashboard-client.tsx`

检查内容：

- 标题展示是否使用 `getConcertDisplayTitle`。
- 艺人展示是否使用 `getConcertDisplayArtist`。
- 搜索是否使用 `getConcertSearchArtists`。
- 页面上是否仍出现 `【歌手】`、`Unknown`、`音乐会` 这类脏艺人。
- eventType 是否只作为标签/筛选项，不影响价值判断。

验收标准：

- 页面展示不再出现由旧回写逻辑造成的脏前缀。
- 多人阵容能被搜索和展示。
- tribute/fan meeting 不被 UI 默认标成低价值。

---

### Phase 3：历史数据回填与差异审查

目标：将现有历史数据统一补齐新身份字段，并在正式写入前审查变化。

#### 3.1 先跑 dry-run

```bash
npm run backfill:identity -- --dry-run
```

或：

```bash
npm --prefix "D:\演唱会日历\concert-calendar" run backfill:identity -- --dry-run
```

记录输出：

- 总记录数。
- low-confidence 数量。
- recovered artists 数量。
- cleaned titles 数量。
- structured event types 数量。

#### 3.2 评估是否启用 rededup

先 dry-run：

```bash
npm run backfill:identity -- --dry-run --rededup
```

重点看：

- 行数减少多少。
- 是否有误合并风险。
- 是否合并了已有 `projectId` 的记录。

只有在抽样确认后，才允许正式 `--rededup`。

#### 3.3 是否启用 LLM

只有低置信样本较多时，再考虑：

```bash
npm run backfill:identity -- --dry-run --with-llm
```

注意：

- LLM 只作为低置信兜底。
- 不依赖本地 GPU。
- 不应让 LLM 判断商业价值。

#### 3.4 正式回填

建议分两步：

1. 不 rededup，只补身份字段：

```bash
npm run backfill:identity
```

2. 若确认去重质量稳定，再单独做 rededup：

```bash
npm run backfill:identity -- --rededup
```

验收标准：

- `artist = 歌手 / 音乐会` 显著减少或不再作为展示艺人。
- `eventType` 覆盖率提升。
- `artistPrimary / artistAll` 覆盖率提升。
- 数据行数变化可解释。
- 没有误合并关键项目记录。

---

### Phase 4：真实数据质量抽样

目标：用真实数据验证规则，而不是只依赖单元/回归样本。

#### 4.1 抽样集合

至少抽样以下类别：

1. `eventType = multi_artist`
2. `eventType = tribute`
3. `eventType = fan_meeting`
4. `artistPrimary = ''`
5. `artist = Unknown`
6. `artistAll.length >= 2`
7. `opportunityScore >= 80`
8. `opportunityScore <= 40`
9. dedup 合并后的记录
10. 含英文/日韩艺人名的记录

#### 4.2 人工检查字段

每条检查：

- `rawTitle` 是否保留原始标题。
- `title` 是否没有被错误加 `【artist】`。
- `artistPrimary` 是否合理。
- `artistAll` 是否完整。
- `eventType` 是否准确。
- `opportunityScore` 是否符合商业直觉。
- 是否被错误合并/漏合并。

#### 4.3 输出问题清单

每个问题记录：

- 原始标题
- 当前字段结果
- 期望结果
- 错误类型
  - 艺人漏提
  - 艺人误提
  - 类型误判
  - 误合并
  - 漏合并
  - 分数不合理
- 建议修正规则

验收标准：

- 抽样通过率达到可接受水平。
- 关键错误能归类到具体规则并补测试。

---

### Phase 5：评分权重校准

目标：让 `opportunityScore` 更贴近当前业务目标。

当前评分在 `lib/opportunity-score.ts`，主要规则包括：

- 可识别艺人
- 艺人置信度
- 阵容人数
- 城市层级
- 场馆规模
- 票价
- 销售状态
- 日期窗口

后续需要校准：

1. `artist_lineup_strong` 当前按人数加分，但还没有艺人热度表。
2. `venue_large` 现在主要靠关键词，可能过宽。
3. `price_premium` 阈值需要结合真实票价分布调整。
4. 城市 tier 需要根据项目实际市场调整。
5. 未来可引入手工维护的艺人热度表，但不需要机器学习/GPU。

建议新增轻量配置：

- `lib/artist-heat.ts`
  - 维护头部/高热/中热艺人名单。
  - 用于补强 `artistAll` 的商业判断。

或先在 `opportunity-score.ts` 中加静态表，等稳定后再拆文件。

验收标准：

- 高价值样本排序靠前。
- tribute/fan meeting/multi_artist 只要艺人/阵容强，也能获得高分。
- 低信息质量记录不会因为标题噱头获得虚高分。

---

### Phase 6：去重阈值校准与疑似重复池

目标：降低误合并风险，同时提升漏合并召回。

当前去重已有：

- `getDuplicateScoreDetail`
- `DUPLICATE_MERGE_THRESHOLD = 55`
- `hasStrongAnchor`
- `hasArtistConflict`

后续建议：

1. 输出 dry-run dedup report。
2. 对 55~75 的边界样本单独查看。
3. 为疑似重复增加人工审查能力，至少先输出 JSON/CSV 报告。
4. 针对误合并/漏合并补 regression case。

建议新增脚本：

- `scripts/report_dedup_candidates.ts`

输出字段：

- left id/title/artist/city/date/venue
- right id/title/artist/city/date/venue
- total score
- title similarity
- venue similarity
- artist overlap
- date exact/near
- recommended action

验收标准：

- 自动合并样本 precision 高。
- 边界样本可人工检查。
- 每次调整阈值后有回归测试保护。

---

### Phase 7：文档化和运维流程

目标：让后续维护时不再把旧逻辑加回来。

建议补充文档：

1. 数据字段说明
   - `rawTitle` vs `title`
   - `artistPrimary` vs `artistAll` vs legacy `artist`
   - `eventType` vs `opportunityScore`

2. 回填流程
   - dry-run
   - with-llm
   - rededup
   - 正式写入

3. 质量验收流程
   - 跑哪些测试
   - 抽哪些样本
   - 如何判断误合并

4. 业务原则
   - 演出形式不直接决定商业价值。
   - 商业价值由独立信号评分。
   - LLM 不负责价值判断。

---

## 优先级建议

### P0：必须先做

1. 旧逻辑残留审计。
2. 跑 regression + lint + build。
3. backfill dry-run。
4. UI/API 是否使用新字段的确认。

### P1：上线前应做

1. 历史数据正式回填。
2. 真实数据抽样验收。
3. 去重边界样本报告。
4. 补充高风险 regression case。

### P2：质量提升

1. 艺人热度表。
2. 场馆容量/等级表。
3. dedup candidates 报告脚本。
4. opportunity score 权重校准。

---

## 当前下一步建议

建议马上按这个顺序推进：

1. 继续审计旧逻辑残留，确认没有形式即价值的判断。
2. 跑完整 `lint` 和 `build`。
3. 跑 `backfill:identity -- --dry-run`，保存输出。
4. 抽样检查 `multi_artist / tribute / fan_meeting / Unknown / artistAll>=2`。
5. 根据抽样问题补 regression case。
6. 再决定是否正式回填，以及是否启用 `--rededup`。

---

## 验收标准总表

首期数据管道可以认为完成，需要满足：

- [ ] regression tests 全部通过。
- [ ] lint/build 通过。
- [ ] API 返回新身份字段。
- [ ] 页面展示使用 display title/display artist。
- [ ] 搜索覆盖 `artistPrimary` 和 `artistAll`。
- [ ] backfill dry-run 输出可解释。
- [ ] 历史数据抽样中，tribute/fan meeting/multi_artist 不再因形式被降级。
- [ ] 去重没有明显误合并关键项目记录。
- [ ] `artist = 歌手 / 音乐会 / Unknown` 不再污染展示和去重。
- [ ] 商业评分不直接基于 eventType 加减分。
