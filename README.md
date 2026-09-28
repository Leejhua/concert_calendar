# Concert Intel

Concert Intel 是一个面向演唱会与现场演出数据的情报系统。它不只是日历，而是把抓取到的演出信息沉淀成可搜索、可去重、可评分、可跟进的商机数据资产。

## 核心能力

- 演唱会数据采集与上传：支持从外部爬虫导入演出数据。
- 演出身份识别：提取 `artistPrimary`、`artistAll`、`eventType`、置信度和来源。
- 城市与场馆归一化：减少同城、同馆不同写法带来的重复和搜索问题。
- 自动去重：基于城市、日期、标题、场馆、艺人集合等信号打分合并。
- 商机评分：用艺人、阵容、城市、场馆、票价、销售状态、时间窗口等独立信号评估机会。
- 项目跟进看板：支持商机状态、项目、联系人、跟进任务等业务管理。
- 回归测试：覆盖艺人身份识别、去重、商业评分和地点归一化。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- PostgreSQL / 本地数据快照
- `tsx` 脚本工具链

## 快速开始

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 常用命令

### 开发

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm run start
```

### Lint

```bash
npm run lint
```

当前 lint 允许 warning，但不允许 error。

### 数据抓取/上传

```bash
npm run crawl
```

### 身份字段回填

Dry-run：

```bash
npm run backfill:identity -- --dry-run
```

正式回填：

```bash
npm run backfill:identity
```

规则修复后刷新旧 identity 字段的 dry-run：

```bash
npm run backfill:identity -- --dry-run --force-reinfer-identity
```

规则修复后正式刷新旧 identity 字段：

```bash
npm run backfill:identity -- --force-reinfer-identity
```

`--force-reinfer-identity` 仅用于刷新已有 `rule` / `legacy` / `unknown` / 空来源的结构化身份字段，不覆盖 `manual` / `llm` / `official_tag`。正式执行前必须先 dry-run，并核对 `Force reinfer candidates` 和 `Identity changes` 输出。

带重新去重的 dry-run：

```bash
npm run backfill:identity -- --dry-run --rededup
```

注意：正式使用 `--rededup` 前必须先抽样确认误合并风险。

### 去重候选报告

只读输出 JSON 到 stdout，不写数据库：

```bash
npm run report:dedup-candidates -- --min-score 45 --max-score 100 --limit 100
```

建议在正式 `--rededup` 前查看边界分数样本，例如 `--min-score 45 --max-score 75`。

### 数据质量抽样报告

只读输出 JSON 到 stdout，不写数据库，用于正式 backfill/rededup 前验收真实数据样本：

```bash
npm run report:data-quality-samples -- --source file --data-dir data/concerts --limit 10
```

覆盖 `multi_artist`、`tribute`、`fan_meeting`、空 `artistPrimary`、legacy `artist = Unknown`、多人阵容、高低分、英文/日韩标题或艺人名，以及可用的 dedup/merged 线索。

### 商机评分分布报告

只读输出 JSON 到 stdout，不写数据库，用于正式 backfill/rededup 前检查分数分布和高低分样本：

```bash
npm run report:score-distribution -- --source file --data-dir data/concerts --limit 10
```

输出总量、分数桶、`eventType` 计数、高低分样本、缺失 `artistPrimary` 数和 `artistAll>=2` 数。

## 回归测试

```bash
npm run test:artist-identity
npm run test:dedup
npm run test:score
npm run test:location
```

建议在改动数据管道、评分、去重、展示字段前后都跑一遍。

## 数据管道原则

### 1. 演出形式不等于商业价值

`eventType` 只描述演出形式，例如：

- `solo`
- `multi_artist`
- `tribute`
- `fan_meeting`
- `festival`
- `other`
- `unknown`

它不能直接决定商机价值。tribute、fan meeting、festival、多艺人阵容不应天然加分或扣分。

### 2. 商业评分只看独立商业信号

`opportunityScore` 应由这些信号共同决定：

- 艺人/阵容是否可识别
- 艺人置信度
- 阵容人数
- 城市层级
- 场馆规模或场馆信息完整度
- 票价区间
- 销售状态
- 距离演出时间窗口

### 3. 原始字段和识别字段分离

关键字段：

- `rawTitle`：原始标题
- `title`：展示/业务标题
- `rawArtistTag`：原始艺人标签
- `artistPrimary`：主艺人
- `artistAll`：完整艺人集合
- `eventType`：演出形式
- `artistConfidence`：艺人识别置信度
- `artistSource`：艺人识别来源

不要把旧的 `artist` 当唯一真值。它只保留兼容意义。

## 当前验证状态

最近一次本地验证结果：

- `npm run test:artist-identity`：通过
- `npm run test:dedup`：通过
- `npm run test:score`：通过
- `npm run test:location`：通过
- `npm run lint`：通过，仍有少量 warning
- `npm run build`：通过

`backfill:identity -- --dry-run` 需要正确的数据库连接环境变量。若出现：

```text
SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

请检查 PostgreSQL 连接配置，尤其是密码是否作为字符串正确传入。

## 目录说明

```text
app/                    Next.js App Router 页面和 API
components/             UI 组件和业务面板
contexts/               前端状态上下文
lib/                    数据管道、DB、去重、评分、归一化逻辑
scripts/                抓取、回填、测试和调试脚本
data/                   本地数据快照
docs/                   规划和设计文档
```

## 上线前检查清单

- [ ] 回归测试全部通过
- [ ] lint 无 error
- [ ] build 通过
- [ ] API 返回新身份字段
- [ ] 页面展示使用 display title/display artist
- [ ] 搜索覆盖 `artistPrimary` 和 `artistAll`
- [ ] backfill dry-run 输出可解释
- [ ] 正式回填前备份当前数据
- [ ] `--rededup` 前抽样确认误合并风险

## License

Private / Internal use.
