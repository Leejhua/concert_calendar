# P1 抓取侧优化 — 系统设计与任务分解

> Architect: Bob | Date: 2026-01-28 | Project: concert-calendar

---

## Part A: 系统设计

### 1. 实现方案

#### 1.1 核心技术挑战

| 挑战 | 分析 | 对策 |
|------|------|------|
| **代理节点健康检测** | 166 个 Clash 节点质量参差不齐，需在每次同步前筛选可用节点 | 调 Clash API `GET /proxies/{name}/delay` 逐节点测速，过滤超时/不通节点 |
| **风控自动切换** | 大麦 RGV587/ILLEGAL_ACCESS 触发后需自动换 IP，避免手动干预 | `handleNodeFailure` 联动 `rotateToNextNode` + `markNodeCooldown` |
| **冷却机制** | 被风控标记的节点短期内不应复用，否则加剧封禁 | `Map<string, number>` 内存冷却表，到期自动解禁 |
| **地区偏好** | 大麦/摩天轮移动端对非亚洲节点敏感，全球端无限制 | `REGION_PREFERENCE` 配置按 source 选节点，优先 HK/TW/SG/JP |
| **降级兼容** | Clash API 不可用时不能阻断同步 | `proxy-agent.ts` 保留 `PROXY_URL` 单节点 fallback，与 P0 行为一致 |

#### 1.2 框架与库选择

**不引入任何新依赖**。所有功能基于 Node.js 内置模块：

- `http` 模块 — 调 Clash API（`http://127.0.0.1:9097`，非 HTTPS）
- `https-proxy-agent` — 已有依赖，创建 `HttpsProxyAgent` 实例
- `undici` — 已有依赖，`setGlobalDispatcher` 全局 fetch 代理

Clash API 是标准 REST API，Authorization 用 `Bearer {secret}`，无需额外 SDK。

#### 1.3 架构模式

**模块级单例（Module Singleton）**：`proxy-pool.ts` 在模块作用域维护状态（`healthyPool`、`currentNode`、`cooldownMap`），与现有 `proxy-agent.ts` 风格一致。不引入类或 DI 容器，保持简单。

```
┌─────────────────────────────────────────────────────┐
│                   sync_data.ts                       │
│  prepareProxyPool('damai') → syncData()              │
└──────────┬──────────────────────────────┬────────────┘
           │                              │
     ┌─────▼──────┐                 ┌─────▼──────┐
     │ proxy-pool │                 │ damai-     │
     │   (NEW)    │◄────────────────│ crawler    │
     │            │ handleNodeFail  │            │
     │ 健康检查   │ rotateToNext    │ 风控检测   │
     │ 节点轮换   │ getCurrentAgent │ UA池       │
     │ 冷却管理   │                 │ 指纹分散   │
     └──┬───┬─────┘                 └────────────┘
        │   │
   ┌────▼┐ ┌▼──────────┐
   │Clash│ │proxy-agent│ (thin wrapper)
   │ API │ │proxy-retry │ (handleProxyFailure→pool)
   └─────┘ └───────────┘
```

### 2. 文件列表

| 文件 | 操作 | 说明 |
|------|------|------|
| `.env.local` | **修改** | 追加 `CLASH_API_URL`、`CLASH_API_SECRET`、`CLASH_PROXY_GROUP` |
| `lib/proxy-pool.ts` | **新建** | 代理节点池核心模块（~200 行） |
| `lib/proxy-agent.ts` | **重构** | 改为薄封装，调用 proxy-pool；保留 PROXY_URL fallback |
| `lib/proxy-retry.ts` | **修改** | `handleProxyFailure` 从占位改为调用 proxy-pool |
| `lib/damai-crawler.ts` | **修改** | 风控分级响应 + UA 池扩充 + 请求指纹分散 |
| `scripts/sync_data.ts` | **修改** | 同步前调用 `prepareProxyPool` |
| `scripts/crawl_and_upload.ts` | **修改** | 同步前调用 `prepareProxyPool` |

### 3. 数据结构与接口

```mermaid
classDiagram
    class ProxyPool {
        <<module singleton>>
        -healthyPool: string[]
        -currentNode: string | null
        -cooldownMap: Map~string, number~
        -poolPrepared: boolean
        -currentSource: string | null
        +prepareProxyPool(source) Promise~void~
        +getCurrentProxyAgent() HttpsProxyAgent | null
        +handleNodeFailure(error) Promise~void~
        +getPoolStatus() PoolStatus
        +getCurrentNode() string | null
        -checkNodeHealth(nodeName, testUrl, timeout) Promise~number | null~
        -buildHealthyPool(options) Promise~string[]~
        -switchNode(nodeName) Promise~void~
        -rotateToNextNode() Promise~string | null~
        -markNodeCooldown(nodeName, durationMs) void
        -isNodeAvailable(nodeName) boolean
        -clashApi(path, method, body) Promise~any~
        -extractRegion(nodeName) string
        -scoreNode(nodeName, latency, source) number
    }

    class PoolStatus {
        +healthyCount: number
        +cooldownCount: number
        +currentNode: string | null
        +healthyNodes: string[]
        +cooldownNodes: CooldownEntry[]
    }

    class CooldownEntry {
        +name: string
        +until: number
    }

    class BuildPoolOptions {
        +source: string
        +topN: number
        +testUrl: string
        +timeout: number
    }

    class REGION_PREFERENCE {
        <<const>>
        +damai: string[]
        +moretickets: string[]
        +moretickets-global: string[]
    }

    class ProxyAgentModule {
        <<refactored>>
        +getProxyAgent() HttpsProxyAgent | null
        +PROXY_CONFIG: object
        -ensureHttpsProxyAgent() HttpsProxyAgent | null
        -ensureGlobalDispatcher() void
    }

    class ProxyRetryModule {
        <<updated>>
        +isProxyError(err) boolean
        +withProxyRetry(fn, options) Promise~T~
        +handleProxyFailure(err) Promise~void~
    }

    class DamaiCrawlerModule {
        <<updated>>
        +UA_POOL: string[]
        +getUAForCity(cityName) string
        +getRandomAcceptLanguage() string
        +syncData(config) Promise~SyncResult~
        -fetchCity(city, index, cancelled) Promise~Concert[]~
        -makeRequest(api, dataObj, callbackName, retryCount, cancelled) Promise~any~
    }

    ProxyPool --> PoolStatus : returns
    ProxyPool --> BuildPoolOptions : uses
    ProxyPool ..> REGION_PREFERENCE : reads
    ProxyAgentModule --> ProxyPool : calls getCurrentProxyAgent
    ProxyRetryModule --> ProxyPool : calls handleNodeFailure
    DamaiCrawlerModule --> ProxyPool : calls handleNodeFailure, markNodeCooldown
    DamaiCrawlerModule --> ProxyAgentModule : calls getProxyAgent
```

### 4. 程序调用流程

#### 4.1 同步启动 → 建池 → 抓取 → 风控 → 切节点（主流程）

```mermaid
sequenceDiagram
    participant Entry as sync_data.ts
    participant Pool as proxy-pool.ts
    participant Clash as Clash API :9097
    participant Crawler as damai-crawler.ts
    participant Damai as 大麦 MTOP API

    Note over Entry: P1 启动流程

    Entry->>Pool: prepareProxyPool('damai')
    activate Pool

    Pool->>Clash: GET /proxies/GLOBAL
    Clash-->>Pool: { type: "Selector", all: ["HK-01", "JP-02", ...], now: "HK-01" }

    loop 遍历 GLOBAL.all 节点
        Pool->>Clash: GET /proxies/{name}/delay?url=...&timeout=5000
        alt 节点可达
            Clash-->>Pool: { delay: 123 }
            Pool->>Pool: 记录延迟 ms
        else 超时/不通
            Clash-->>Pool: 超时无响应
            Pool->>Pool: 标记为 null（死节点）
        end
    end

    Pool->>Pool: 过滤死节点 → 按延迟排序 → 地区偏好加权 → 取 Top N
    Pool->>Pool: healthyPool = ["HK-01", "SG-03", "JP-02", ...]
    Pool->>Clash: PUT /proxies/GLOBAL { name: "HK-01" }
    Clash-->>Pool: 204 No Content
    Pool->>Pool: currentNode = "HK-01"
    deactivate Pool

    Entry->>Crawler: syncData(config)
    activate Crawler

    Crawler->>Crawler: runDamaiTask → 分批并发 fetchCity

    loop 每个城市分页抓取
        Crawler->>Crawler: makeRequest(api, data)
        Crawler->>Damai: HTTPS request via proxy agent
        Damai-->>Crawler: response

        alt retMsg 含 RGV587
            Crawler->>Pool: handleNodeFailure(Error('RGV587'))
            activate Pool
            Pool->>Pool: markNodeCooldown(currentNode, 15min)
            Pool->>Pool: rotateToNextNode()
            Pool->>Clash: PUT /proxies/GLOBAL { name: "SG-03" }
            Clash-->>Pool: 204
            Pool->>Pool: currentNode = "SG-03"
            deactivate Pool
            Crawler->>Crawler: continue（重试当前页，新节点）
        else retMsg 含 TRAFFIC_LIMIT
            Crawler->>Crawler: randomDelay(10s, 20s) 降速不切节点
            Crawler->>Crawler: continue
        else retMsg 含 ILLEGAL_ACCESS
            Crawler->>Pool: handleNodeFailure(Error('ILLEGAL_ACCESS'))
            activate Pool
            Pool->>Pool: markNodeCooldown(currentNode, 30min)
            Pool->>Pool: rotateToNextNode()
            Pool->>Clash: PUT /proxies/GLOBAL { name: "JP-02" }
            Clash-->>Pool: 204
            deactivate Pool
            Crawler->>Crawler: continue
        else SUCCESS
            Crawler->>Crawler: 解析数据，写 checkpoint
        end
    end

    deactivate Crawler
```

#### 4.2 代理池降级流程（Clash API 不可用）

```mermaid
sequenceDiagram
    participant Entry as sync_data.ts
    participant Pool as proxy-pool.ts
    participant Clash as Clash API :9097
    participant Agent as proxy-agent.ts
    participant Crawler as damai-crawler.ts

    Entry->>Pool: prepareProxyPool('damai')
    Pool->>Clash: GET /proxies/GLOBAL
    Clash-->>Pool: ❌ ECONNREFUSED

    Pool->>Pool: poolPrepared = false（降级标记）
    Pool-->>Entry: 打印警告，不抛异常

    Entry->>Crawler: syncData(config)
    Crawler->>Agent: getProxyAgent()
    Agent->>Agent: 检测 pool 未就绪 → 走 PROXY_URL 单节点
    Agent-->>Crawler: HttpsProxyAgent(PROXY_URL)
    Note over Crawler: P0 单节点模式运行，行为不变
```

### 5. 待明确事项

| # | 事项 | 假设/决策 |
|---|------|-----------|
| 1 | **Clash API 测速 URL** | 默认用 `https://www.gstatic.com/generate_204`（Google 204 端点，轻量），可配置覆盖 |
| 2 | **Top N 取值** | 默认取延迟最低的前 10 个节点（`topN=10`），可配置 |
| 3 | **冷却到期后行为** | 冷却到期后节点自动回到可用池，不主动重新测速；下次 `prepareProxyPool` 时重新评估 |
| 4 | **摩天轮 crawler 是否需要 prepareProxyPool** | 是。`moretickets-crawler.ts` 和 `moretickets-global-crawler.ts` 各自在 `syncData` 并行启动前调用 `prepareProxyPool`，但当前 P1 范围仅大麦入口显式调用；摩天轮通过 `getProxyAgent()` 自动受益于当前已切换的节点 |
| 5 | **节点地区识别规则** | 从 Clash 节点名称提取：含 `HK`/`香港` → HK，含 `TW`/`台湾`/`台北` → TW，含 `SG`/`新加坡` → SG，含 `JP`/`日本`/`东京` → JP，其余 → `OTHER` |
| 6 | **handleProxyFailure 与 handleNodeFailure 的关系** | `handleProxyFailure`（proxy-retry.ts）处理网络层错误（ECONNRESET 等），调用 proxy-pool 切节点；`handleNodeFailure`（proxy-pool.ts）是统一的节点故障入口，被风控响应和 proxy-retry 共同调用 |
| 7 | **UA 池数量** | 20 个，覆盖 Chrome 122-131（Win/Mac）、Firefox 123-133、Edge 122-131、Safari 17.x、Mobile Chrome/Safari |
| 8 | **摩天轮 global crawler 的 UA 处理** | 摩天轮 global 已有硬编码 UA（Edg/144），P1 不改动；仅大麦 crawler 做 UA 池 + 城市绑定 |

---

## Part B: 任务分解

### 6. Required Packages

无新增依赖。所有功能基于已有依赖和 Node.js 内置模块：

```
- https-proxy-agent@^7.0.0: 已有，创建 HttpsProxyAgent
- undici@^6.0.0: 已有，setGlobalDispatcher 全局 fetch 代理
```

### 7. 任务列表

#### T01: 项目基础设施 + 代理节点池核心模块

| 属性 | 值 |
|------|-----|
| **Task ID** | T01 |
| **Priority** | P0 |
| **Dependencies** | 无 |

**源文件**：

| 文件 | 操作 | 关键内容 |
|------|------|----------|
| `.env.local` | 修改 | 追加 `CLASH_API_URL`、`CLASH_API_SECRET`、`CLASH_PROXY_GROUP` 三个环境变量 |
| `lib/proxy-pool.ts` | **新建** | 完整代理池模块（~200 行）：Clash API 通信、健康检查 `checkNodeHealth`、建池 `buildHealthyPool`、节点切换 `switchNode`/`rotateToNextNode`、冷却管理 `markNodeCooldown`/`isNodeAvailable`、地区偏好 `REGION_PREFERENCE`、对外 API `prepareProxyPool`/`getCurrentProxyAgent`/`handleNodeFailure`/`getPoolStatus` |
| `lib/proxy-agent.ts` | 重构 | 改为薄封装：`getProxyAgent()` 优先调 `getCurrentProxyAgent()`（proxy-pool），pool 未就绪时 fallback 到 `PROXY_URL` 单节点；保留 `setGlobalDispatcher` 逻辑和 `PROXY_CONFIG` 导出 |
| `lib/proxy-retry.ts` | 修改 | `handleProxyFailure` 从 `console.warn` 占位改为调用 `handleNodeFailure(err)`（来自 proxy-pool），实现代理层错误 → 切节点 |

**验收标准**：
- `.env.local` 含三个 Clash 环境变量
- `proxy-pool.ts` 可独立导入，`prepareProxyPool('damai')` 能完成建池并切换到最优节点
- Clash API 不通时 `prepareProxyPool` 不抛异常，打印警告，`poolPrepared=false`
- `proxy-agent.ts` 的 `getProxyAgent()` 在 pool 就绪时返回池节点 agent，否则返回 PROXY_URL agent
- `proxy-retry.ts` 的 `handleProxyFailure` 在 ECONNRESET 等错误时触发节点切换

---

#### T02: 大麦抓取全量优化 + 入口集成

| 属性 | 值 |
|------|-----|
| **Task ID** | T02 |
| **Priority** | P0 |
| **Dependencies** | T01 |

**源文件**：

| 文件 | 操作 | 关键内容 |
|------|------|----------|
| `lib/damai-crawler.ts` | 修改 | **(a) 风控分级响应**：`fetchCity` 中 ~755-760 行替换统一 backoff 为 RGV587→切节点+冷却15min、TRAFFIC_LIMIT→降速10-20s不切节点、ILLEGAL_ACCESS→切节点+冷却30min；**(b) UA 池扩充**：`USER_AGENTS` 从 8 个扩到 20 个，`getRandomUA()` 改为 `getUAForCity(cityName)` 按城市哈希绑定；**(c) 请求指纹分散**：`makeRequest` 中 `accept-language` 随机三选一；`fetchCity` 中 10% 概率插入 15-30s 长停顿 |
| `scripts/sync_data.ts` | 修改 | `syncData()` 调用前插入 `await prepareProxyPool('damai')`；导入 `prepareProxyPool` from `../lib/proxy-pool` |
| `scripts/crawl_and_upload.ts` | 修改 | 同上，`syncData()` 调用前插入 `await prepareProxyPool('damai')` |

**验收标准**：
- RGV587 触发后自动切节点 + 冷却 15 分钟，日志含 `switching proxy`
- TRAFFIC_LIMIT 触发后仅降速 10-20s，不切节点，日志含 `slowing down`
- ILLEGAL_ACCESS 触发后自动切节点 + 冷却 30 分钟
- UA 按城市维度绑定：同一城市多次请求 UA 不变，不同城市 UA 不同
- `accept-language` 在 `zh-CN,zh;q=0.9` / `zh-TW,zh;q=0.8` / `en-US,en;q=0.9` 间随机
- 约 10% 请求前有 15-30s 长停顿
- `sync_data.ts` 和 `crawl_and_upload.ts` 均在同步前完成建池

### 8. Shared Knowledge

跨任务共享的约定：

```
- Clash API 基址: http://127.0.0.1:9097，Authorization: Bearer {CLASH_API_SECRET}
- 测速默认 URL: https://www.gstatic.com/generate_204，timeout=5000ms
- 建池默认 Top N: 10
- 冷却时间: RGV587→15min, ILLEGAL_ACCESS→30min, 网络错误→5min
- 地区偏好: damai/moretickets→['HK','TW','SG','JP'], moretickets-global→[]
- 降级策略: Clash API 不可用时 poolPrepared=false，proxy-agent 走 PROXY_URL 单节点
- 所有 Clash API 调用超时 10s，超时视为不可用
- UA 池 20 个，hashCode(cityName) % 20 绑定
- Accept-Language 三选一: zh-CN,zh;q=0.9 | zh-TW,zh;q=0.8 | en-US,en;q=0.9
- 长停顿概率 10%，时长 15000-30000ms
- 不破坏 P0 的分批并发(CITY_BATCH_SIZE=8)、checkpoint、withProxyRetry 逻辑
```

### 9. 任务依赖图

```mermaid
graph TD
    T01["T01: 基础设施 + 代理池核心<br/>.env.local<br/>lib/proxy-pool.ts (NEW)<br/>lib/proxy-agent.ts (重构)<br/>lib/proxy-retry.ts (修改)"]
    T02["T02: 大麦抓取优化 + 入口集成<br/>lib/damai-crawler.ts<br/>scripts/sync_data.ts<br/>scripts/crawl_and_upload.ts"]

    T01 --> T02

    style T01 fill:#4CAF50,stroke:#2E7D32,color:#fff
    style T02 fill:#2196F3,stroke:#1565C0,color:#fff
```
