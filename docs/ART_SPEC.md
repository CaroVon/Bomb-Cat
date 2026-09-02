# 🎨 炸弹猫 · 美术与图像资产规范

> 风格基调:**日式和风浮世绘(浮世絵 Ukiyo-e) × 现代妖怪绘卷 × 戏谑谐谑**
> 本文档为设计师 / AI 绘图工具提供**完整的设计语言、单卡 prompt、配色、字体、尺寸、文件组织**规范。
> 所有产出落到 `client/public/assets/` 下,前端代码不动 — `CardView` 已通过 `--skin` 变量接管所有自定义卡面。

---

## 0. 设计原则

| 项 | 规范 |
|---|---|
| **风格** | 浮世绘墨绘 + 现代妖怪风;线描 × 平涂 × 朱砂点缀;戏谑中带妖冶 |
| **情绪** | 「江户巷弄里玩着炸弹的猫咪妖怪」——不是恐怖,而是滑稽的怪谈 |
| **构图** | 主图占卡面 64-72%;边框做装饰纹样;留白有呼吸感 |
| **字体** | 卡名=装饰书法(类似「龍」「鳳」汉字);卡描述=明朝体;UI=思源黑体 |
| **配色** | 墨色主线 + 朱砂红强调;辅以群青/莺绿/樱色;底色偏象牙宣纸(暖白) |
| **纹理** | 整图叠加宣纸纹(2-4% 透明度);不堆细节;**统一调性优先于华丽** |
| **避免** | 渐变色块、霓虹色、3D 投影、写实猫咪、写实人物描线 |

---

## 1. 调色板(Hex / 用途)

### 1.1 系统色

| Token | Hex | 用途 |
|---|---|---|
| `--sumi-900` | `#1a1714` | 主文本 / 边框描线(浓墨) |
| `--sumi-700` | `#3a322a` | 次级描线 |
| `--sumi-300` | `#8a7e6f` | 弱化文字 |
| `--washi-50` | `#f5ead0` | 主背景(象牙宣纸) |
| `--washi-100` | `#ede0c0` | 卡面底 |
| `--washi-200` | `#e0cfa3` | 边纹底 |
| `--shu-600` | `#c03028` | 朱砂(强调色 / 危险卡边框) |
| `--shu-500` | `#d6493d` | 朱砂亮 |
| `--shu-300` | `#e8958b` | 朱砂淡(高光) |
| `--gunjo-600` | `#254b7a` | 群青(动作卡边框) |
| `--gunjo-400` | `#4170b0` | 群青亮 |
| `--uguisu-500` | `#7b8b3a` | 莺绿(拆解卡边框) |
| `--kon-700` | `#3a2418` | 暗赭(底色 / 桌面阴影) |
| `--sakura-400` | `#e8a4b8` | 樱色(柔和高光) |
| `--kin-500` | `#c6a14a` | 金(桌布描金/装饰) |

### 1.2 卡类边框色映射(替换现有 `CardView` 中的 `KIND_FRAME`)

| 卡 kind | 主边框 | 副色 | 来源 |
|---|---|---|---|
| `exploding` | `--shu-600` | `--kin-500` 边角 | 朱砂符咒调 |
| `defuse` | `--uguisu-500` | `--washi-50` | 莺色/竹叶绿 |
| `action` | `--gunjo-600` | `--washi-50` | 群青/流水纹 |
| `plain-beard` | `#b87a3a` | `--washi-50` | 胡粉焦茶 |
| `plain-fuzzy` | `--sakura-400` | `--washi-50` | 樱色 |
| `plain-melon` | `#4a8b3a` | `--washi-50` | 抹茶绿 |
| `plain-potato` | `#b87a3a` | `--washi-50` | 烤薯色 |
| `plain-rainbow` | `#7a4ba0` | `--washi-50` | 紫苑色 |

### 1.3 牌桌底色

| 层 | 颜色 | 说明 |
|---|---|---|
| 主底 | `--kon-700` → `--kon-900`(径向) | 深赭木桌 |
| 中央聚焦光 | `rgba(245,234,208,0.10)` 椭圆 | 桌面聚光 |
| 外围暗角 | `rgba(0,0,0,0.55)` 椭圆 | vignette |
| 装饰光点 | `--kin-500` 0.5% | 金粉 |

---

## 2. 字体系统

| 用途 | 字体 | 来源建议 |
|---|---|---|
| **卡名**(装饰) | 装饰行书 / 楷书中文;衬底小字盘用 kanji 装饰 | 站酷小薇楷书 / 方正黄陵毛体 / M+ FONTS 1系 |
| **卡描述**(明体) | 明朝体 / 黑体简中 | 思源宋体(Source Han Serif) |
| **UI 文字** | 思源黑体 SC + Noto Sans JP | 思源黑体 SC |
| **数字 / 房间码** | 等宽中文:JetBrains Mono + 思源黑体 | — |

> 卡名字号:`stage` 24px / `hand` 14px / `mini` 9px / `tiny` 不显示
> 所有日文/中文使用同一 TextHint 调整:`text-rendering: geometricPrecision; letter-spacing: 0.05em;`

---

## 3. 图像资产清单

### 3.1 文件组织

```
client/public/assets/
├─ cards/
│  ├─ front/                 # 14 张内置卡卡面(420×588 透明 PNG)
│  │  ├─ exploding.png
│  │  ├─ defuse.png
│  │  ├─ attack.png
│  │  ├─ targeted-attack.png
│  │  ├─ skip.png
│  │  ├─ favor.png
│  │  ├─ shuffle.png
│  │  ├─ peek.png
│  │  ├─ nope.png
│  │  ├─ plain-beard.png
│  │  ├─ plain-fuzzy.png
│  │  ├─ plain-melon.png
│  │  ├─ plain-potato.png
│  │  └─ plain-rainbow.png
│  └─ back/                  # 卡背(单图)
│     ├─ card-back.png       # 600×840
│     └─ card-back-frame.svg # 矢量版本(可选)
├─ characters/               # 7 个角色头像(256×256 透明 PNG)
│  ├─ none.png
│  ├─ echo-mage.png
│  ├─ oracle.png
│  ├─ knight.png
│  ├─ phantom-thief.png
│  ├─ alchemist.png
│  └─ lucky-cat.png
├─ table/                    # 牌桌 / 中央舞台
│  ├─ table-bg.jpg           # 1920×1080 桌面背景
│  ├─ table-felt-pattern.png # 240×240 平铺毡布图案
│  ├─ stage-light.png        # 512×512 径向光晕(透明)
│  ├─ pile-shadow.png        # 256×128 牌堆落地阴影(透明)
│  └─ wood-grain.png         # 240×240 平铺桌沿木纹
├─ lobby/                    # 登录/lobby/房间页背景
│  ├─ login-bg.jpg           # 1920×1080
│  ├─ lobby-bg.jpg           # 1920×1080
│  └─ room-bg.jpg            # 1920×1080
├─ ui/                       # UI 装饰
│  ├─ boom-stamp.png         # 「爆」朱印章(280×280,透明)
│  ├─ nope-stamp.png         # 「否」朱印章
│  ├─ gold-divider.png       # 12×200 描金分隔条
│  ├─ seat-frame.png         # 80×80 座位外环装饰
│  ├─ turn-arrow.png         # 64×64 当前回合光点
│  └─ dead-skull.png         # 64×64 阵亡骷髅图标
└─ overlays/                 # 全屏演出
   ├─ explosion-flash.png    # 1920×1080 黄红爆闪(60% 透明)
   ├─ vignette-d.png         # 1920×1080 圆形暗角
   └─ paper-grain.png        # 512×512 宣纸纹(平铺)
```

### 3.2 命名约定

- 小写 + 连字符;**卡面 = 卡 id 字串**与 `cards.ts` 完全对应
- 每个文件**必须有透明 PNG**(除 `*-bg.jpg` 三个页背景)
- sprite 集保留目录命名:cards-front.atlas / chars.atlas(若后续切换图集)

### 3.3 通用输出规格

| 项 | 值 |
|---|---|
| 卡面尺寸 | **420 × 588** px(5:7 长宽比,与 `.pcard` 严格一致) |
| 卡背尺寸 | **600 × 840** px(含 8.5% 安全出血) |
| 角色头像 | **256 × 256** px(透明) |
| 桌/页背景 | **1920 × 1080** px / JPG q=85 |
| UI 装饰 | 24 位 PNG + alpha |
| 色彩空间 | sRGB |
| DPI | 96(网页标准) |
| 命名 | `{cardId}.png` 或 `{用途}.{格式}` |

---

## 4. 卡牌美术规范

### 4.1 统一构图模板

每张卡「三层结构」(正面):

```
┌─────────────────────────────────┐
│  ⛩️ 边框(2.5%)─樱花/水波/竹叶─┐ │  ← 装饰框(类别)
│  ┌─────────────────────────┐ │
│  │ [卡名小印 8%]              │ │  ← 卡名
│  │                           │ │
│  │                           │ │
│  │      【主视觉 64%】         │ │  ← 主体插画
│  │      · 主角 + 道具        │ │
│  │      · 留白 ⅓ 上方         │ │
│  │                           │ │
│  │                           │ │
│  │ ────────── 文样分隔 5% ───── │ │  ← 装饰波/云
│  │ 描述文字 12px 横排 / 最多3行│ │  ← 卡描述
│  └─────────────────────────┘ │
│   🐾 角落小角章                │  ← 类别小印
└─────────────────────────────────┘
```

**通用参数:**

- **边框**:每类的边纹不同(见 4.5 节),由设计师统一制一套 SVG 边纹后合成到各卡
- **构图**:主视觉**居中 + 略偏左**(模仿浮世绘非对称)
- **主图视角**:正面或 3/4 侧;**俯视避免**
- **背景**:空白宣纸留白或场景化(同卡)
- **景深**:扁平(浮世绘无焦散)
- **细节量**:**中**;过多细节缩小后会糊

### 4.2 必含纹理层

| 层 | 操作 |
|---|---|
| 主图 | 平涂 + 墨线描边 + 1 处点高光 |
| 宣纸底 | 整图叠加 `paper-grain.png`(multiply / opacity 4-6%) |
| 年份印章 | 右下角小印,宋朱文「日日是好日」章(戏仿) |
| 边角章 | 左下/右上小角章,有类别符号 |

---

### 4.3 14 张内置卡 · 每张专属 prompt

> 所有 prompt 已按 Midjourney / SD / DALL-E 通用格式整理。
> 末尾的"Negative Prompt"用在 SD,DALL-E 直接忽略。

#### 通用前缀

> **前置 prompt** —— 适用于所有卡面图(AI 绘图时放在最前):
>
> `Ukiyo-e Japanese woodblock print style, Edo period, hand-painted sumi ink outline, washi paper texture, flat color, asymmetric composition, slightly off-center subject, no realistic shading, no gradients, no 3D, no neon colors, no photographic style, no anime cel-shading`
>
> 通用负向:`photorealistic, 3d render, cgi, neon glow, gradient background, modern clothing, western elements, comic book style, blurry, low detail, low quality, watermark, text, signature`

#### `exploding.png` — 爆炸猫

> **Variant theme**:朱砂符咒 + 引爆的猫咪妖怪
>
> **Prompt**:
> ```
> Ukiyo-e Japanese woodblock print style, Edo period, hand-painted sumi ink outline,
> washi paper texture, flat color, asymmetric composition.
> Subject: an evil-eyed cute cat yokai opening its mouth wide, with red and orange
> flame exhalation explosion bursting out in swirling smoke clouds, holding a small
> lit fuse makiwara, traditional Japanese house shimenawa rope in background.
> Foreground: scattered shogi pieces and burning ema wooden plaque.
> Background: vertical sumi ink splatter, gold dust, traditional Japanese kanji
> stamp "爆" (explosion).
> Colors: shu vermilion red, sumi ink black, gold ochre, washi cream.
> Composition: cat centered in lower-right, explosion swirls upward to top-left,
> 30% empty washi paper space in upper-left corner.
> ```
>
> **Negative**: `cute chibi, kawaii pastel, round face cartoon, hi-soft style, gradient fill`

#### `defuse.png` — 拆解

> **Variant theme**:工匠修理镇魂猫咪
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a kind old Japanese swordsmith master (kaji) in
> traditional indigo-dyed hanten coat, calmly holding pliers and a wrench,
> taming a hissing cursed cat yokai with a gentle hand. The cat is restrained
> with rope, looking impish. Tools: bamboo-handled pliers, kanna plane, nokogiri saw.
> Background: green bamboo grove with sumi ink wind lines.
> Colors: bamboo green (uguisu-500), indigo (kon-700), sumi ink, washi cream.
> Composition: master on left, restrained cat on right, tools floating between them.
> Small stamp: "解" in green seal.
> ```

#### `attack.png` — 攻击 / 闪电符

> **Variant theme**:雷神雷击数珠 / 雷符
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: two cats tumbling mid-air as a giant jagged blue-white
> lightning bolt strikes between them. Foreground: shimenawa rope with shide
> paper zigzags burning. Background: Raijin thunder god's face emerging in dark
> stylized clouds, holding drum taiko. A lone cat-samurai prepares to strike
> with bokken wooden sword. Dynamic ink-line motion. Colors: gunjo indigo blue,
> white lightning, washi cream, sumi black.
> Composition: lightning bolt vertical center, two cats flanking at top.
> Stamp: "双" or "撃" small kanji.
> ```

#### `targeted-attack.png` — 精准攻击

> **Variant theme**:弓道猫 / 远矢
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a focused feline samurai archer (neko samurai) drawing
> a yumi longbow, single arrow aimed off-frame. Background: rising sun vermilion
> sun flag, distant torii gate silhouette. Charred target boards stack at lower
> right. A target reticle as red sumi circle hovers in upper-right corner.
> Colors: shu vermilion, gunjo blue (bow wrap), sumi ink.
> Composition: archer centered, arrow points to upper-right where target reticle
> floats. Negative space behind archer.
> Stamp: "狙" small kanji seal.
> ```

#### `skip.png` — 跳过 / 阻断

> **Variant theme**:封印小猫 / 入定
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a small cat yokai sitting zen-like in meditative pose
> (lotus) with eyes closed peacefully, surrounded by a luminous barrier ofuda
> paper talismans arranged in concentric rings. Behind: a single sumi ink circle
> void. Foreground: a player cat trying to push but halted by invisible wall,
> paws flat on barrier.
> Colors: washi cream, gunjo blue (talisman), shu red (border seal),
> sumi ink. Composition: meditating cat centered, player cat smaller upper-right.
> Stamp: "停" small kanji.
> ```

#### `favor.png` — 求赠 / 礼贡

> **Variant theme**:玉串奉纳猫
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a mysterious refined cat wearing a tiny eboshi hat and
> kariginu ceremonial robe, ceremoniously offering a wrapped furoshiki gift
> bundle. Behind: a shy/suspicious cat looking sideways. Gifts: small sakura
> blossoms trail floating, hinting at hidden contents. Composition: giver on
> left, smaller receiver on right, gift bundle bridges them.
> Colors: sakura pink, sumi ink, gold ochre, washi cream.
> Stamp: "贈" small kanji.
> ```

#### `shuffle.png` — 洗牌 / 翻弄

> **Variant theme**:风神翻弄
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: Fujin wind god mask face in upper-left exhaling swirling
> wind lines (suminagashi ink spirals), scattering a deck of uchiwa fans and
> origami cranes through the air across the whole canvas. Three cat paws reaching
> up trying to catch them. Wind spirals in blue-sumigashi ink.
> Colors: gunjo blue, sumi ink, sakura accents.
> Composition: Fujin upper-left, debris filling middle, paws at lower-right edge.
> Stamp: "風" kanji.
> ```

#### `peek.png` — 预知未来 / 三眼

> **Variant theme**:三日月·占卜
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a fortune-telling nekomata (two-tailed cat) with a
> third eye opening on its forehead, peering into a bronze hand mirror
> (kagami) showing three glowing tarot-card-style cat faces within.
> Surrounding: mokugyo wooden beads floating. Background: crescent moon,
> scrolls, dream clouds. Colors: gunjo blue (mirror), silver-gray (moon),
> gold ochre (beads), sumi ink.
> Composition: cat eye-line draws down to mirror in lower-right; three cat
> faces visible inside mirror. Stamp: "視" kanji.
> ```

#### `nope.png` — 否认 / 朱印

> **Variant theme**:酒吞童子退散符
>
> **Prompt**:
> ```
> Ukiyo-e style. Subject: a giant red shu vermilion seal stamp (hanko) slamming
> down with kanji "否" (NO) in white-on-red, accompanied by a cat yokai swiping
> its paw to push away a faint ghost card escaping. Speed lines radiate outward
> from stamp impact point. Background: white washi paper with subtle gold
> borders. Colors: dominant shu vermilion red, white, gold. Composition: red
> stamp takes 60% of upper-left area, cat paw lower-right.
> Stamp (additional): "退" small kanji.
> ```

#### `plain-*.png` — 5 种普通猫(花色卡)

每张构图模板相同:**一只拟人化猫咪为主角 + 一个**其花色对应的道具 + 印章花色字。

> **通用前置**(花色卡):
> ```
> Ukiyo-e style. Single cat yokai centered, front 3/4 view, no background
> beyond washi paper. Subject holds a single symbolic prop. Empty upper-left
> quadrant for breathing space. Sumi ink outline, flat color, gentle expression,
> slightly mischievous smile.
> ```

##### `plain-melon.png` — 西瓜猫(绿)

> **道具**:巨大切开的西瓜(suika)切片露红瓤黑籽
> **Prompt 末尾**:`A round jolly green-and-white striped cat cradling a huge
> cut watermelon slice, juice dripping, summer uchiwa fan behind. Colors:
> matcha green, watermelon red, sumi black seeds, washi cream. Stamp: "瓜" kanji.`
> **负向**:`realistic cat, photo, gradient`

##### `plain-potato.png` — 土豆猫(焦茶)

> **道具**:烤红薯(石焼きいも)冒热气
> **Prompt 末尾**:`A scruffy brown tabby cat wearing a bandana, holding a steaming
> baked sweet potato on bamboo leaves, embers glowing at its feet. Colors: brown
> sumi, burnt orange heat, washi cream, ember gold. Stamp: "芋" kanji.`

##### `plain-rainbow.png` — 彩虹猫(紫)

> **道具**:彩虹流 + 五彩风铃
> **Prompt 末尾**:`A magical long-haired cat with multi-colored fur stripes
> (rainbow band), standing on a gold bridge amid arcing rainbow ribbons, furin
> glass wind chimes hanging from ears. Colors: spectrum bands, gold, sumi ink.
> Stamp: "虹" kanji.`

##### `plain-fuzzy.png` — 毛球猫(粉樱)

> **道具**:一团粉色毛线 + 编到一半的袜
> **Prompt 末尾**:`A small fluffy kitten tangled in pink and white wool yarn,
> knitting needles stuck in fluff, half-knitted sock dangling. Sakura petals
> scattered in background. Colors: sakura pink, cream white, sumi outlines.
> Stamp: "毛" kanji.`

##### `plain-beard.png` — 胡子猫(白胡·爷)

> **道具**:老翁姿态 + 烟管 + 小火
> **Prompt 末尾**:`An elderly grandpa-cat with bushy white whiskers and a
> long white beard, wearing round glasses and a bowler-like kasa hat,
> smoking a kiseru pipe with curling blue smoke, sitting on tatami mat.
> Colors: washi cream, sumi ink, gunjo blue smoke, gold-trimmed hat.
> Stamp: "髭" kanji.`

### 4.4 卡背 `card-back.png`

> **Prompt**:
> ```
> Ukiyo-e style. Decorative card back design featuring a large central
> circular mon (family crest) emblem of a stylized white cat face (yokai mask)
> with red collar and gold bell, surrounded by concentric rings: outer ring
> of sakura petals, inner ring of asanoha (hemp leaf) geometric pattern,
> innermost ring of stylized mountain waves (seigaiha).
> Background: deep washi cream.
> Colors: shu vermilion, sumi ink, kin gold, washi cream, subtle gunjo blue.
> Composition: perfectly symmetrical centered.
> ```
>
> **尺寸**:600×840(含出血)
> **额外**:同时输出 **SVG 矢量版** `card-back-frame.svg`(CSS 复用)

### 4.5 卡类边框纹样(SVG 矢量,设计师手绘统一)

> 由设计师手工制作 4 套,**不交给 AI 出**(保证曲线精确):

| 类 | 主纹 | 配色 | 文件 |
|---|---|---|---|
| `exploding` | 火焰/咒符卷轴边 | 朱砂+金 | `border-shu.svg` |
| `defuse` | 竹叶/叶脉 | 莺绿+象牙 | `border-uguisu.svg` |
| `action` | 流水纹 seigaiha | 群青+白 | `border-gunjo.svg` |
| `plain-*` | 花纹(各色不同) | 见 4.6 | 各 `border-{plain}.svg` |

### 4.6 普通猫边框配色

| id | 边框主色 | 花纹主题 |
|---|---|---|
| `plain-melon` | `#4a8b3a` | 切西瓜格纹 |
| `plain-potato` | `#b87a3a` | 麦穗 |
| `plain-rainbow` | `#7a4ba0` | 七宝 |
| `plain-fuzzy` | `#e8a4b8` | 樱花 |
| `plain-beard` | `#b87a3a` | 麻叶 |

---

## 5. 角色头像规范

### 5.1 共性

- **尺寸**:256 × 256,透明 PNG
- **构图**:圆形内(用于 `seat-avatar` 44×44 显示),实际留 12% 边距给圆形遮挡
- **风格**:**大头像版用浮世绘人物立绘**(完整躯干 + 服饰道具)
- **表情**:戏谑、自信、隐恶;不呆萌不凶残
- **背景**:纯色 / 渐隐至透明,不画场景
- **小细节**:角色名字印章(右下,小朱印)

### 5.2 7 个角色 · Prompt

#### `none.png` — 路人(默认)

> **Prompt**:`Ukiyo-e style portrait, head-and-shoulders of a modest
> merchant-class Japanese woman with simple indigo kosode, hair tied in
> low chignon, neutral expression looking slightly upward, washi cream
> background. Stamp: "凡" small kanji seal at lower-right.
> Colors: indigo, sumi ink, washi cream, faint sakura blush on cheeks.`

#### `echo-mage.png` — 回响法师

> **Prompt**:`Ukiyo-e style portrait, a powerful onmyoji-style mage cat with
> long flowing robes, holding a gofu shakujiao staff, three concentric rings
> of glowing magic circles radiating behind head like a halo, mystical
> cat-slit eyes glowing shu vermilion. Stamp: "響" small kanji.
> Colors: deep gunjo, shu red, gold, sumi ink.`

#### `oracle.png` — 预言家

> **Prompt**:`Ukiyo-e style portrait, a blindfolded mystic cat in white and
> cream priestess robes, third eye visible on forehead, holding a crystal ball
> (suishou) with floating cat constellation inside. Stamp: "視" small kanji.
> Colors: washi cream, gunjo blue, sakura pink crystals, sumi.`

#### `knight.png` — 铁壁骑士

> **Prompt**:`Ukiyo-e style portrait, a stoic samurai cat wearing full
> ōyoroi great armor with green cords, holding a naginata polearm, a giant
> war fan (gunbai) behind as shield, iron expression. Stamp: "鉄" kanji.
> Colors: uguisu green, sumi armor black, gold accents, washi cream.`

#### `phantom-thief.png` — 怪盗基德

> **Prompt**:`Ukiyo-e style portrait, a sly thief cat wearing an eboshi
> hat tilted to one side, half-mask across face, monokuro checkered
> kimono (ishitsumi cat-print), holding a tiny gold key and a folding fan.
> Smirking expression. Stamp: "怪" kanji.
> Colors: sumi black & white, gold key, sakura lining.`

#### `alchemist.png` — 炼金术士

> **Prompt**:`Ukiyo-e style portrait, a scholar cat with round
> rim-eyes (tortoiseshell frame), wearing deep teal kariginu robe,
> holding a swirling alembic flask emitting phosphorescent mist,
> behind: hexagram alchemy sigil floating. Stamp: "錬" kanji.
> Colors: teal green, gunjo blue, sakura mist, sumi ink.`

#### `lucky-cat.png` — 幸运绒球(招财猫)

> **Prompt**:`Ukiyo-e style portrait, a chubby calico cat (三毛) with one
> paw raised beckoning (maneki-neko gesture), wearing a red bib with gold
> koban coin, bell on collar. Lucky sparkles (starburst) and sakura around.
> Smiling wide. Stamp: "福" kanji.
> Colors: cream calico (orange-white-black), shu red, gold, sakura.`

---

## 6. 牌桌背景

### 6.1 `table-bg.jpg` — 主牌桌

> **用**:游戏进行中 `.table-root` 背景
>
> **Prompt**:`Ukiyo-e ink painting overhead top-down view of an old Japanese
> mahjong/playing table surface in dark warm wood, with subtle wood grain
> (mokume), small gold lacquer inlay radial lines converging to center,
> wear marks and rings from teacups, two paper lantern's light spots in
> upper-left and upper-right corners. Faintly visible hand-painted
> sakura petal scattered (5-6 petals). Vignetted darker at corners.
> Colors: dark sumi brown (kon-700), gold ochre lines, washi warm cream,
> subtle sakura accents. Soft focus, painterly, NOT photorealistic.
> Style: classical Japanese ink painting sumi-e, hand-painted texture.
> Size: 1920x1080. Aspect 16:9.`
>
> **注**:如 AI 输出不到位,可改为**实物摄影风格**(深色木桌+手写宣纸卡牌)+ 滤镜(sepia -40 / contrast +12 / grain +5)模拟和风

### 6.2 `table-felt-pattern.png` — 平铺毡布纹

> **用**:DOM 平铺(`background-repeat`),模拟牌桌绒布
>
> **Prompt**:`Seamless tileable pattern, Japanese dark felt cloth surface,
> deep kon brown, with very subtle asanoha hemp-leaf gold threads woven in.
> Solid background, very low contrast. 240x240 px tileable.
> Color: kon brown #3a2418 with 8% gold ochre thread highlight.`
>
> **叠加使用**(CSS):
> ```css
> .table-root {
>   background:
>     radial-gradient(ellipse at 50% 38%, transparent 0%, rgba(0,0,0,0.5) 90%),
>     url(/assets/table/table-felt-pattern.png) repeat,
>     linear-gradient(180deg, #1a1410, #0d0a08);
> }
> ```

### 6.3 `stage-light.png` — 中央聚光

> **用**:`.stage` 区域径向光晕
>
> **Prompt**:`Radial soft light glow PNG, transparent background, warm white
> center fading to fully transparent at edges, slight warm yellow tint,
> subtle hand-painted brush stroke edges, no hard lines. Size 512x512.
> Center color rgba(245,234,208,0.45) fading to transparent.`

### 6.4 `pile-shadow.png` — 牌堆落地阴影

> **用**:`.pile` 底部投影
>
> **SVG 直接生成**(无需 AI):椭圆阴影 + 软羽化
> ```html
> <svg viewBox="0 0 256 64">
>   <ellipse cx="128" cy="40" rx="120" ry="14" fill="black" opacity="0.35"
>     filter="url(#blur)"/>
>   <defs><filter id="blur"><feGaussianBlur stdDeviation="6"/></filter></defs>
> </svg>
> ```

---

## 7. 页面背景(登录 / Lobby / 房间)

### 7.1 `login-bg.jpg` — 登录页

> **Prompt**:`Wide cinematic Ukiyo-e scene, Japanese Edo-era hilltop shrine at
> twilight, torii gate silhouetted against warm dusk sky, sakura trees in
> mid bloom on either side, paper lanterns lit at lower-left, distant
> village below misted valley, ascending flock of crows. Style: classical
> Hiroshige landscape meets modern cinematic light grading. Slight glow at
> upper-center (warm amber). Colors: dusk sakura pink, gunjo blue sky,
> warm amber, sumi ink silhouettes. NOT a flat illustration — atmospheric
> depth and haze. 1920x1080, soft focus edges.`

### 7.2 `lobby-bg.jpg` — 大厅页

> **Prompt**:`Ukiyo-e interior of a bustling Edo-period teahouse tatami room
> with paper shoji screens, hanging noren curtains with cat-mon emblem,
> low table center with scattered uchiwa fans and cats lounging, paper
> lanterns glowing warm, autumn maple visible through shoji slits.
> Colors: warm amber light, sumi ink, sakura accents, gold lanterns. 1920x1080.`

### 7.3 `room-bg.jpg` — 等待室

> **Prompt**:`Ukiyo-e scene of a serene Japanese garden at morning with
> koi pond, stone lantern, stepping stones crossing water, distant
> pagoda, cherry petals drifting. Soft gold-glow at top center (sunrise).
> Tranquil mood. Colors: pale gold morning light, sumi ink silhouettes,
> pale sakura, koi orange-red dots. 1920x1080.`

---

## 8. UI 装饰资产

### 8.1 `boom-stamp.png` — 「爆」章

> **Prompt**:`Ukiyo-e red shu vermilion seal stamp (hanko) impression of kanji
> "爆" (BOOM), worn distressed edges like real ink stamp, slight ink bleed,
> irregular saturated red. Transparent background. 280x280.
> Color: shu vermilion #c03028 with slight transparent edges.`

### 8.2 `nope-stamp.png` — 「否」章

> 同上,字「否」(NO)。配色可换:**shu vermilion → 深群青 gunjo #254b7a**,以与 BOOM 区分。

### 8.3 `gold-divider.png` — 描金分隔条

> **SVG**:`Linear gradient gold to transparent, 12px wide × 200px tall,
> asymmetric tapered ends, hand-painted brush feel.`

### 8.4 `seat-frame.png` — 座位外环

> **Prompt**:`Ukiyo-e circular katagami (paper stencil) frame design with
> sakura and waves, gold ochre, transparent inner, 80x80 PNG.`

### 8.5 `turn-arrow.png` — 当前回合光点

> **Prompt**:`Ukiyo-e small hovering golden sun-disc (maru-mon) with
> radiating thin gold rays like a tibetan halo, 64x64 PNG. Colors: gold ochre.

### 8.6 `dead-skull.png` — 阵亡骷髅

> **Prompt**:`Ukiyo-e stylized cat skull (not human) with two pointed cat
> ears still attached, faintly smiling/humorous, on washi paper. 64x64 PNG.
> Colors: sumi ink + cream.`

---

## 9. 全屏演出图层

### 9.1 `explosion-flash.png` — 爆炸闪屏

> **用**:`.flash-overlay` 白闪替代品(可与 CSS mix-blend-mode 叠加)
>
> **Prompt**:`Radial explosion flash PNG with intense yellow-white center
> fading to red-orange edges, transparent outside. 1920x1080.
> Center rgba(255,255,255,0.95) → fades through #ffcc55 → #c03028 → transparent.
> Slight irregular hand-painted brush edges, not perfect circle.`

### 9.2 `vignette-d.png` — 圆形暗角

> **SVG**(`<svg width="1920" height="1080">`)
> ```html
> <defs>
>   <radialGradient id="v"><stop offset="50%" stop-color="black" stop-opacity="0"/>
>     <stop offset="100%" stop-color="black" stop-opacity="0.55"/></radialGradient>
> </defs>
> <rect width="100%" height="100%" fill="url(#v)"/>
> ```

### 9.3 `paper-grain.png` — 宣纸纹(平铺)

> **Prompt**:`Seamless tileable washi paper texture, 512x512, subtle fiber
> pattern, faint dark spots and warm cream tones (#f5ead0 base).
> Top-down view, visible pulp fibers, NOT crumpled. Used as multiply overlay.`

---

## 10. CSS 集成规范

### 10.1 把现有样式映射到新资源

#### A. 卡面背景替换(`pcard-art`)

```css
.pcard-art {
  background-size: cover;
  background-position: center top;
  /* 由 CardView 注入 --skin,优先级最高 */
  background-image: var(--skin, url(/assets/cards/front/{cardId}.png));
}
```

#### B. 卡背替换

```css
.pcard.pcard-back::before {
  content: '';
  position: absolute; inset: 0;
  border-radius: 9px;
  background: url(/assets/cards/back/card-back.png) center/cover;
}
```

#### C. 桌布替换(`.table-root`)

```css
.table-root {
  background:
    radial-gradient(ellipse 50% 35% at 50% 38%, rgba(245,234,208,0.10), transparent 70%),
    url(/assets/table/stage-light.png) center/cover no-repeat,
    url(/assets/table/table-felt-pattern.png) repeat,
    linear-gradient(180deg, #1a1410, #0d0a08);
}
```

#### D. 头像替换

```css
.seat-avatar {
  background: center/cover, radial-gradient(circle at 35% 30%, #2e3830, #171d18);
  /* 由 Seat 组件传 --avatar 变量 */
  background-image: var(--avatar, radial-gradient(circle at 35% 30%, #2e3830, #171d18));
}
```

#### E. 整体宣纸叠加

```css
body::before {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  background: url(/assets/overlays/paper-grain.png);
  opacity: 0.04;
  mix-blend-mode: multiply;
  z-index: 9999;
}
```

### 10.2 新增动效建议

> 全部 easing:cubic-bezier(.22,1,.36,1)「江户曲线」——像浮世绘木板落下一样轻快而非弹跳。

| 行为 | 现状 | 新建议 |
|---|---|---|
| 卡牌 hover 上移 | `translateY(-8px)` | hover 时上移 6px + 微微逆时针 1.2° + `box-shadow` 加深 |
| 出牌入场 | `y: -140` | 改为 `y: -240, scale 0.4` 然后叠 `filter: blur(8px) → 0`(模拟印刷品下落的瞬间) |
| 爆炸闪屏 | white flash | 改用 `explosion-flash.png` + mix-blend-mode |
| 否认章盖 | 红色字 | 切换为 `nope-stamp.png`,scale 1.7 → 1 |

---

## 11. AI 绘图工具适配参数

### 11.1 Midjourney v6+

```
/imagine prompt: <spec prompt> --ar 5:7 --v 6 --style raw --s 250 --c 25
--no photographic, 3d render, neon, gradient, modern
```

- `--ar 5:7` 为卡面;`--ar 16:9` 为背景;`--ar 1:1` 为头像
- `--s 250` 适中的风格化(更高会偏离浮世绘)
- `--c 25` 低随机性以保统一调性

### 11.2 Stable Diffusion + Anything-Ukiyo / Counterfeit

```
Prompt: <spec prompt>, masterwork, best quality, ultra detailed,
oil painting on canvas with sumi-e brush strokes
Negative: <common negative>
Sampler: DPM++ 2M Karras, Steps 28, CFG 7.5
Size: 420x588 (card) / 768x768 (char) / 1920x1080 (bg)
```

### 11.3 DALL-E 3

直接粘贴 prompt,显式标注:`Traditional ukiyo-e woodblock print style`。

### 11.4 批量 prompt 模板

设计师可基于上方 prompt 微调后,用 ComfyUI / Midjourney `--repeat` 批量出 14 张卡。

---

## 12. 版权与原创声明

- 浮世绘风格属公共艺术遗产,无版权;但**不得使用**特定历史艺术家署名作品(歌川一派、葛饰北斋真迹等)
- 不使用任何版权角色;**所有形象为原创拟人化妖怪猫**
- 角色名 / 形象均避开《Exploding Kittens》官方美术
- 字体使用开源字体(思源系列 / Noto Sans JP)或商用免费授权

---

## 13. 验收清单(Definition of Done)

每张资产交付前检查:

- [ ] 尺寸与文件名严格匹配 3.3 表
- [ ] 透明度正确(卡面/卡背/头像/UI 装饰均透明;背景为 JPG)
- [ ] 整体调色板取自 1.1 节,无未授权色
- [ ] 浮世绘风格底线:墨线、平涂、宣纸纹理
- [ ] 不使用 emoji / 写实 / 渐变色块 / 3D / 霓虹
- [ ] 在 `mini` (66px) 尺寸下主体仍可辨
- [ ] 印章 / 边框 / 主图三层结构完整
- [ ] 已在公开 Exploding Kittens 美术对比,**视觉上明确区别**

---

## 14. 后续路线图

| 阶段 | 内容 |
|---|---|
| **v1 (本周)** | 14 张内置卡 + 7 角色头像 + 1 卡背 + 4 边框 SVG + 3 页背景 + 桌布 |
| **v2 (下一迭代)** | 自定义卡包描述位:新增「工坊艺术」(纯黑角色剪影 8 套供房主选风格) |
| **v3** | 玩家自定义头像上传交互回查(v1 中 skin 系统预留了 `--skin` 钩子,后续可拓展为 `--avatar`) |

---

> **最后一条建议**:浮世绘的成败在**统一调性**,不在单图惊艳。
> 出图时**所有资产统一用一个 seed / batch**,会比分 5 批出更连贯。
