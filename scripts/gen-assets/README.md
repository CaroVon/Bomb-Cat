# 资产生图脚本(`scripts/gen-assets/`)

批量把 `docs/ART_SPEC.md` 里的 14 卡 + 7 角色 + 3 背景 prompt,经任一图像生成 API 落到
`client/public/assets/` 下。Vite 自带的 `publicDir` 会直接映射到运行时 `/assets/`。

## 用法

```bash
# 1. 复制 .env.example → .env,填 PROVIDER 与对应 API key
cp .env.example .env

# 2. 一键全跑(14 + 7 + 3 = 24 张,视 provider 速度几分钟~半小时)
npm run gen-assets

# 只跑卡 / 角色 / 背景
npm run gen-assets -- --only=cards
npm run gen-assets -- --only=chars
npm run gen-assets -- --only=bgs

# 指定 id(逗号分隔)
npm run gen-assets -- --only=exploding,defuse,attack
npm run gen-assets -- --only=none
```

## Provider 配置

`.env.example` 里给出 6 种写法,**任选一种把别的注释掉**:

| PROVIDER | 需要的环境变量 | 备注 |
|---|---|---|
| `minimax` | `MINIMAX_IMAGE_URL` + `MINIMAX_API_KEY`(可选 model) | **改这里填你的 minimax image endpoint** |
| `openai` | `OPENAI_API_KEY` | DALL-E 3(¥0.16/张,只有 3 种画幅,会就近选取) |
| `replicate` | `REPLICATE_API_KEY` + `REPLICATE_MODEL_VERSION` | SDXL / Flux 都需要 model version hash |
| `zhipu` | `ZHIPU_API_KEY` | 智谱 CogView,中文友好,有免费额度 |
| `aliyun` | `ALIYUN_API_KEY` | 通义 Wanxiang,异步任务 |
| `custom` | `GENERATE_IMAGE_URL` + 可选 `GENERATE_IMAGE_AUTH` | 任意自部署代理,合同见下 |

`custom` 协议:`POST` JSON `{ prompt, negative, w, h }`,要求返回 `{ b64 }` 或 `{ url }`。
`minimax` adapter 同样兼容此协议(若你平台正好是 OpenAI 图像风格)。

## 输出结构

所有产物直接落到前端可访问路径,**无需重启前端**:

```
client/public/assets/cards/front/exploding.png     ...
client/public/assets/cards/front/defuse.png
...
client/public/assets/characters/none.png
client/public/assets/characters/echo-mage.png
...
client/public/assets/lobby/login-bg.jpg
client/public/assets/lobby/lobby-bg.jpg
client/public/assets/lobby/room-bg.jpg
```

若前端需要把图像切入到卡面 / 头像显示,请在 `CardView.tsx` 中按现有 `--skin` 模式接入。

## 故障排查

- 启动报 `provider 必须返回 Buffer`:API 返回结构与预期不同,改 `providers.cjs` 里对应适配
- 单项 `FAIL` 不中断整个批次,最后会汇总 OK / FAIL;查看错误末尾 `[FAIL] group/id: <msg>`
- `--only=__dryrun__` 这种空匹配用于**脚本自检**,会自动识别并跳过

## 调 prompt

不动主代码,只动 `prompts.cjs` 第 N 行。每个资产对象 `{ id, label, size, prompt, negative }`。
换风格(如不用浮世绘改水墨)只动 `COMMON_PREFIX` 常量。
