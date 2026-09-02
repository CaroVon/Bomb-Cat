# 💥 炸弹猫 BombCat

联机 + 深度定制 + 用户系统的网页版炸弹猫（Exploding Kittens 规则复刻，全部原创实现）。

> 规则本身不受版权保护；本项目未使用任何官方美术与文案，游戏名与卡面均为原创/自定义。

## 功能

- **联机对战**：2-5 人房间制实时对局，4 位房间码邀请；断线 60 秒内自动重连（刷新页面也不丢）
- **完整规则**：攻击/跳过/求赠/洗牌/预知未来/否认（8 秒窗口、可叠加反否认）/拆解自选放回位置/对子偷牌/三连指名偷/连击叠加
- **角色系统**：7 个预置角色，技能覆盖被动（回合看牌、被偷免疫、被否认返还）与主动（弃牌偷牌、弃牌回收）
- **深度定制**：
  - 📷 **卡面皮肤包**：上传朋友照片（浏览器端 canvas 压缩到 ~200KB）替换任意卡面，仅影响自己视角
  - 🃏 **自定义卡组**：调整内置卡数量 + 用效果原语（13 种：偷牌/换手/看牌/反转/自摸…每卡最多 3 个）设计全新特殊卡，房主开局选用，服务端强校验防作弊
- **用户系统**：可选 Supabase（邮箱注册登录 / 云端卡组与皮肤同步 / 战绩表），**不配置则以纯游客模式完整可玩**
- **防作弊架构**：权威服务器；手牌永不进同步状态（只见 handCount），看牌等私密信息点对点下发

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 游戏服务器 | [Colyseus](https://github.com/colyseus/colyseus) 0.18 | Room = 一局游戏；掉线重连内置；CORS 内置 |
| 状态同步 | @colyseus/schema 5（`schema()` 构建器） | 公开状态增量同步；隐藏信息走私密消息 |
| 规则引擎 | 自研纯 TS（`server/src/engine`） | 不依赖 Colyseus，20 个单测全覆盖；可播种随机源保证可测性 |
| 前端 | React 19 + Vite 8 + motion 13 | SPA；motion 做发牌/出牌/手牌重排动画 |
| 客户端 SDK | @colyseus/sdk 0.18 | 与服务端版本配对（注意：colyseus.js 0.16 与服务端 0.18 的 matchmaking 协议不兼容） |
| 用户系统 | Supabase（可选） | Auth + Postgres + Storage 三合一；游客模式零配置降级 |
| 部署 | 本地 / Railway + Vercel | 游戏服务器是长连接 WebSocket 进程，**不能部署到 Vercel serverless** |

```
bombcat/
├─ shared/     前后端共用：卡牌/角色/效果类型、内置数据、防作弊校验（含单测）
├─ server/     Colyseus Room + 纯逻辑规则引擎 + JWT 验证（单测 + 集成测试）
├─ client/     React SPA：登录/大厅/等待室/牌桌/定制工坊
├─ supabase/   建表 SQL + RLS + 存储桶 + 配置指南
└─ scripts/    冒烟测试脚本
```

## 快速开始（本地开发）

要求：Node ≥ 20，npm ≥ 10。

```bash
npm install        # 安装全部 workspace 依赖
npm run dev        # 同时启动：游戏服务器 :2567 + 前端 :5173
```

浏览器打开 http://localhost:5173 —— 输入昵称 → 创建房间 → 把 4 位房间码发给朋友
（同机测试：开第二个标签页即可，身份按标签页隔离）→ 房主开始游戏。

其他命令：

```bash
npm test           # 全部测试（shared 校验 + 引擎规则 + 房间集成）
npm run typecheck  # 三个包的类型检查
npm run build      # 生产构建
```

### 局域网试玩

前端开发服务器默认监听所有网卡（`host: true`）。朋友访问 `http://你的局域网IP:5173`，
游戏服务器地址由前端按页面主机名自动推导（`ws://IP:2567`），同一局域网即可联机。

### Supabase（可选）

见 [supabase/README.md](supabase/README.md)。配置后获得：邮箱登录、云端卡组/皮肤同步、战绩表；
服务端启用 Supabase JWT 验证（HS256 secret 或 JWKS）。

## 部署

| 组件 | 推荐 | 说明 |
|---|---|---|
| 前端 | Vercel / 任意静态托管 | `npm run build -w @bombcat/client` 产物为纯静态文件；记得设置 `VITE_GAME_URL` 指向游戏服务器 |
| 游戏服务器 | Railway（~$5/月）/ 任意 VPS / 家用电脑 + 内网穿透 | 长连接进程，`tsx src/index.ts` 直接跑；设置 `VITE_GAME_URL=wss://你的域名` |
| Supabase | 免费层 | 见 supabase/README.md |

> ⚠️ 游戏服务器不能放 Vercel/Netlify serverless——WebSocket 长连接不受支持。
> 多进程横向扩展时，房间码注册表需换成 Colyseus RedisPresence/RedisDriver（单进程开发部署无需）。

## 测试

```bash
npm test
```

- `shared/test/validation.test.ts` —— 卡组/自定义卡/技能校验（防作弊边界）
- `server/test/engine.test.ts` —— 规则引擎 20 例：发牌构成、跳过/攻击/连击叠加、否认窗口交替、
  对子/三连偷牌、爆炸/拆解位置、阵亡与胜负、全部 6 个角色技能、自定义卡组
- `server/test/room.integration.test.ts` —— 真实服务器 + SDK 客户端：建房/加入/开局/出牌/整局到 gameEnd
- `server/test/log-sync.test.ts` —— 日志双端同步

## 设计要点

- **数据驱动卡牌**：卡 = JSON（id/名称/emoji/效果原语列表），自定义卡只能从有界原语组合，服务端用
  `validateDeck` 双重校验（客户端提前提示 + 服务端拒绝），爆炸猫/拆解数量由规则锁定不可定制。
- **隐藏信息不进同步状态**：手牌只同步 handCount，本人手牌由房间层私发；牌堆内容不编码。
  （Colyseus 0.18 的 StateView 是另一种实现路径，本项目选择了更版本无关的私密消息方案。）
- **无人持否认牌时跳过 8 秒窗口**：服务器知道所有人的手牌，没人能否认时立即结算，节奏更顺。
- **引擎与传输解耦**：`GameEngine` 是纯函数式输入输出（返回事件数组），可独立单测、可移植。

## 致谢

规则实现参考了开源社区的多个 Exploding Kittens 复刻项目（ekittens、wwwcats、eggsplode 等）的
设计思路，全部代码为本项目原创。动画由 [motion](https://motion.dev/) 驱动。
