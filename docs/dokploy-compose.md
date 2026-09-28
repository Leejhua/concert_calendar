# Dokploy Compose 部署

此配置同时部署 Next.js 应用和一个新的 PostgreSQL 16 数据库，不会迁移已有数据库或本地 JSON 数据。

## 1. 配置代码来源

在 Dokploy 项目中创建 **Docker Compose** 服务，选择 Git 仓库与部署分支。
使用 **Compose** 模式，不使用 Stack 模式（本配置需要 `build`）。
若仓库根目录包含 `package.json`，Compose 路径填写 `docker-compose.yml`。
若仓库外面还有一层目录，填写 `concert-calendar/docker-compose.yml`。

## 2. 设置 Environment

```dotenv
POSTGRES_PASSWORD=替换为独立生成的64位十六进制随机字符串
UPLOAD_TOKEN=替换为另一个独立生成的64位十六进制随机字符串
PROXY_URL=false
AI_ENABLED=false
BACKGROUND_SYNC_ENABLED=true
```

可以在本机分别执行两次以下命令生成密钥，不要复用示例值：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

数据库密码会插入连接 URL，推荐只使用上述生成的十六进制字符，避免 `@`、`:`、`/`、`#` 等字符引起 URL 解析问题。
`DATABASE_URL` 已在 Compose 内部组装，无需手填；应用连接 `postgres:5432`。
Dokploy 的环境变量通过 Compose 的 `environment` 显式传入容器。

`BACKGROUND_SYNC_ENABLED=false` 可关闭定时采集，适合部署验收；不会禁用手动同步接口。
开启后首次无成功同步记录时会尝试采集。采集是否成功还取决于服务器出网和上游响应。
进程中断后遗留 `running` 状态的恢复机制仍需后续完善。
服务器没有代理时保留 `PROXY_URL=false`，容器的 `127.0.0.1` 并不是本机电脑。

## 3. 域名与部署

在 Domains 中选择服务 **concert-calendar**，容器端口 **3000**，路径 `/`。
配置域名 DNS，开启 HTTPS / Let's Encrypt，然后部署。
Compose 域名配置变更后需要重新部署。应用和数据库均不直接发布主机端口。
保持应用单副本；当前定时采集和文件状态不支持多实例协调。

本项目尚无统一登录保护。接入真实联系人、报价等业务数据前，应为网站和 API 设置访问控制。
上传令牌只保护 `/api/upload`，不是全站登录。

## 4. 验收与持久化

- 等待 `postgres` 和 `concert-calendar` 均为 healthy。
- 打开 `/dashboard` 检查页面；打开 `/api/concerts?pageSize=1` 检查数据库访问，空数据库返回空列表正常。
- 应用健康检查只检查页面服务；数据接口和采集需要单独验收。
- `postgres-data` 命名卷保存数据库；`concert-data` 命名卷保存采集状态和本地文件。
- 原来的 `./data` 绑定目录不会自动迁入新命名卷。
- 不要删除生产卷或执行 `docker compose down -v`；更改 Compose 项目名可能切换到新的卷。
- 数据库首次初始化后，修改 `POSTGRES_PASSWORD` 不会自动修改库内账户密码；需同步修改数据库账户密码。
- 为 PostgreSQL 配置数据库备份，并另行备份必要的采集状态文件。

## 5. 本地校验

提供上述环境变量后，在仓库根目录运行：

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait
```

默认不映射主机端口，本地验收可在应用容器内检查：

```sh
docker compose exec -T concert-calendar node -e "fetch('http://127.0.0.1:3000/api/concerts?pageSize=1').then(async r => {console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1)})"
```

构建阶段会下载 npm 依赖和 `next/font/google` 使用的字体，需要可用的网络连接。

参考：[Dokploy Compose 文档](https://docs.dokploy.com/docs/core/docker-compose)。
