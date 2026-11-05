# 🎭 自定义角色定义文档

> 在下面的 ```json 代码块中填写你的角色定义，保存后交给开发者即可增添到游戏中。
> 每个角色一个 json 块，可以添加任意多个。

## 填写说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | ✅ | 唯一英文 ID（如 `ice-queen`），不要与现有角色重复 |
| name | string | ✅ | 角色名（中文，≤6 字） |
| title | string | ✅ | 称号（如「冰霜女王」，≤10 字） |
| emoji | string | ✅ | 头像 emoji（1 个字符，如 ❄️） |
| role | string | ✅ | 职责：`control`(控制) / `support`(辅助) / `aggressive`(进攻) / `trickster`(诡诈) |
| themeColor | string | ✅ | 主题色 HEX（如 `#4a90c2`），驱动大卡边框光晕/背景渐变 |
| difficulty | number | ✅ | 难度 1-3（●=简单 ●●=中等 ●●●=困难） |
| lore | string | ✅ | 背景故事（1-2 句话，要有味道） |
| portrait | string | ⬜ | 立绘文件路径（放到 `client/public/assets/characters/` 下，如 `ice-queen.jpg`；不填则用 emoji 放大） |
| skills | array | ✅ | 技能列表（通常 1 个） |

### 技能字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | ✅ | 技能唯一 ID |
| name | string | ✅ | 技能名（中文，≤6 字） |
| description | string | ✅ | 技能描述（玩家可读） |
| trigger | string | ✅ | 触发时机，见下表 |
| effect.kind | string | ✅ | 技能原型，见下表 |
| effect.count | number | ⬜ | 数量类原型用（如 peek 张数） |
| effect.times | number | ⬜ | 免疫/返还类原型用（次数限制） |
| effect.costCards | number | ⬜ | 主动技能代价（弃几张牌） |
| effect.uses | number | ⬜ | 主动技能每局可用次数 |

### 可用触发时机（trigger）

| 值 | 含义 | 类型 |
|---|---|---|
| `gameStart` | 游戏开始时 | 被动 |
| `turnStart` | 自己回合开始时 | 被动 |
| `onStolenFrom` | 自己被偷牌时 | 被动 |
| `onNoped` | 自己的牌被否认时 | 被动 |
| `active` | 自己回合内主动使用 | 主动 |

### 可用技能原型（effect.kind）

| 值 | 说明 | 适用 trigger |
|---|---|---|
| `gainCardAtStart` | 开局获得指定卡 | gameStart |
| `peekAtTurnStart` | 回合开始看牌堆顶 N 张 | turnStart |
| `immuneSteal` | 前 N 次被偷牌无效 | onStolenFrom |
| `returnNoped` | 前 N 张被否认的牌返还 | onNoped |
| `activeSteal` | 弃 N 张偷 1 张指定牌 | active |
| `activeRecycle` | 弃 N 张回收弃牌堆顶 | active |
| `startWithSkip` | 开局多 N 张跳过 | gameStart |

---

## 你的角色定义（在下面填写）

```json
{
  "id": "Voyage",
  "name": "Voyage",
  "title": "远航船长",
  "emoji": "⚓",
  "role": "trickster",
  "themeColor": "#4a90c2",
  "difficulty": 2,
  "lore": "下一次航程也许是在月球。“孩子们，还有谁没有收到明信片吗！”",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\Voyage.jpg",
  "skills": [
    {
      "id": "voyage-skill",
      "name": "大海胸怀无量",
      "description": "选择一名玩家，双方各随机选 3 张手牌互换（双方手牌均需 ≥3 张），回合立即结束。冷却 5 回合。",
      "trigger": "active",
      "effect": {
        "kind": "voyageSwap",
        "count": 3,
        "cooldownTurns": 5
      }
    }
  ]
}
```

<!-- 可以继续添加更多角色，每个角色一个 json 块 -->

```json
{
  "id": "Nana",
  "name": "Nana",
  "title": "前苏联最后一滴眼泪",
  "emoji": "💧",
  "role": "aggressive",
  "themeColor": "#be0c0c",
  "difficulty": 3,
  "lore": "同志们，我先走一步。等会张兵再来接我。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\Nana.jpg"
  "skills": [
    {
      "id": "Nana-skill",
      "name": "无尽泪海",
      "description": "1. Nana开局没有拆解，死亡后，会在牌堆中加入一张‘眼泪’牌；
                    2. 眼泪牌：摸到的玩家可以选择弃一张牌，Nana获取这张手牌并复活，将眼泪牌传递给下一位玩家，或者拒绝获取眼泪牌，抽取两张牌后，将眼泪牌放在牌堆顶部；
                    3. 但是Nana不能拒绝获取眼泪牌，她可以选择传递给下一位玩家，当Nana手里存在3张眼泪牌时，Nana会直接死亡且无法复活",
      "trigger": "death",
      "effect": {
        "kind": "None",
        "uses": -1（无限制）
      }
    }
  ]
}
```

```json
{
  "id": "Banana",
  "name": "Banana",
  "title": "香蕉女王",
  "emoji": "🍌",
  "role": "control",
  "themeColor": "#e5f509f7",
  "difficulty": 2,
  "lore": "听说有人曾拜倒在她的香蕉裙下，但应该是滑倒的。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\banana.jpg",
  "banana_portrait":"D:\dev\bombcat\client\public\assets\characters\angry_banana.jpg",
  "skills": [
    {
      "id": "banana-skill",
      "name": "大香蕉之怒",
      "description": "1. Banana可以在自己没有拆解牌后使用大香蕉之怒（整局 3 次，冷却 3 回合，覆盖期间不能再次发动）；
                    2. 发动大香蕉之怒后，场上所有人的手牌蒙上香蕉牌图案并洗乱，持续一轮（所有存活玩家各行动一次），这一轮摸到的牌均显示为香蕉牌（底牌不变）；
                    3. 覆盖期间所有人只能盲打单牌（卡面/边框完全统一，看不出牌种）：普通小猫/拆解/否认打出后无效果直接进弃牌堆，动作牌触发原有效果（需要目标时随机指定）；
                    4. 覆盖期间同名猫组合被禁用；香蕉女王本人无法直接出牌——她可以指定选中的 2 张香蕉牌作为任意技能牌打出，4 张香蕉牌作为拆解使用",
      "trigger": "active",
      "effect": {
        "kind": "bananaRage",
        "overlayTurns": 1,
        "uses": 3
      },
      "cooldownTurns": 3
    }
  ]
}
```

```json
{
  "id": "pig_king",
  "name": "Pig King",
  "title": "猪王",
  "emoji": "🐷",
  "role": "trickster",
  "themeColor": "#f681d3f7",
  "difficulty": 3,
  "lore": "没人知道为什么他成为了众猪之王，但战场永远会变成他的餐桌。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\pig_king.jpg",
  "skills": [
    {
      "id": "pig_king-skill",
      "name": "暴食",
      "description": "1. 被动：猪王每次摸牌时，必须多摸一张牌；
                    2. 主动：猪王获取场上一位玩家的手牌（无法获取拆解）进入消化区，三回合后可以使用这张牌，必须使用且进入弃牌区，冷却为3回合；
                    3. 猪王消化3次后会进入饱腹状态，无法抽牌持续3回合，但在饱腹状态解除后，必须连抽3张牌",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": -1
      }
    }
  ]
}
```

```json
{
  "id": "chaos_queen",
  "name": "chaos_queen",
  "title": "混沌女王",
  "emoji": "🌀",
  "role": "trickster",
  "themeColor": "#9906def7",
  "difficulty": 3,
  "lore": "爱人如养花，逢异惹心潮。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\chaos_queen.jpg",
  "skills": [
    {
      "id": "chaos_queen-skill",
      "name": "扭曲",
      "description": "1. 被动：场上有玩家因为其他玩家的手牌数量发生变化时，混沌女王摸一张牌，每回合一次；
                    2. 主动1：反转出牌顺序，冷却时间5回合；
                    3. 主动2：接下来一轮，所有摸牌变为从随机玩家手中随机抽取1张牌，冷却时间5回合",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": -1
      }
    }
  ]
}
```

```json
{
  "id": "future_queen",
  "name": "future_queen",
  "title": "Future女王",
  "emoji": "🌠",
  "role": "trickster",
  "themeColor": "#0505f3f7",
  "difficulty": 2,
  "lore": "你不是喜欢高智眼镜大厂技术男吗？",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\future_queen.jpg",
  "skills": [
    {
      "id": "future_queen-skill",
      "name": "预言",
      "description": "1. 被动：使用预知未来牌时，可以查看顶部5张牌，且按任意顺序放回牌堆顶部，开局自带两张预知未来；
                    2. 主动：查看牌堆顶部5张牌，并选择一张立即生效，然后将自己的一张手牌替换这张牌，并将5张牌按照任意顺序放回牌堆顶部，冷却时间5回合",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": -1
      }
    }
  ]
}
```

```json
{
  "id": "bigEye",
  "name": "大眼Nana",
  "title": "张兵监视者",
  "emoji": "👀",
  "role": "trickster",
  "themeColor": "#9c05f3f7",
  "difficulty": 2,
  "lore": "她的双眼一直注视着每一位小猫，不要轻易和她对视。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\big_eye.jpg",
  "skills": [
    {
      "id": "big_eye-skill",
      "name": "揭发",
      "description": "1. 被动：每当一名其他玩家使用一张功能牌时（不包括拆解，包括多张猫咪的技能），在该玩家面前放置一个“档案”标记，上限4个档案，监视者无法使用求赠和偷牌效果；
                    2. 主动：选择一名玩家，根据该玩家档案的数量，执行相应效果：
                    - 2个档案：查看该玩家的牌面
                    - 3个档案：查看该玩家的牌面，指定该玩家弃掉一张牌
                    - 4个档案：查看该玩家的牌面，抽取一张牌
                    冷却时间3回合",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": -1
      }
    }
  ]
}
```

```json
{
  "id": "soup",
  "name": "数学老师",
  "title": "Super Soup",
  "emoji": "📐",
  "role": "support",
  "themeColor": "#075bf5f7",
  "difficulty": 2,
  "lore": "准备好上课了吗孩子们，下面老师要讲这个公式了。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\soup.jpg",
  "skills": [
    {
      "id": "soup-skill",
      "name": "计算",
      "description": "四则运算（四个子技能各自独立冷却 4 回合，都不能指定自己）：
                    1. 加法：指定一位玩家立即摸一张牌（走正常摸牌管线：爆炸猫→拆解、受猪王暴食/减法影响，不结束其回合）；
                    2. 减法：指定一名玩家下一次摸牌少摸一张（最少 0 张）；
                    3. 乘法：指定一位玩家下一张功能牌（攻击/跳过/洗牌/求赠/预知未来/同名猫组合等）效果触发两次；
                    4. 除法：指定一位玩家下一张功能牌无法触发（直接进弃牌堆）；与乘法同时存在时除法优先。
                    所有标记对全场可见（座位角标 ➖/✖️/➗）。",
      "trigger": "active",
      "effect": { "kind": "mathOp", "op": "add | sub | mul | div", "cooldownTurns": 4 }
    }
  ]
}
```

```json
{
  "id": "xiuying",
  "name": "秀英",
  "title": "冰冻荔枝老奶",
  "emoji": "🧙‍♀️",
  "role": "support",
  "themeColor": "#fafaf7f7",
  "difficulty": 2,
  "lore": "救救我孩子们，奶奶给你好吃的荔枝。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\ice.png",
  "skills": [
    {
      "id": "ice-skill",
      "name": "拯救老奶",
      "description": "1. 被动·冰冻老奶：开局 10 层冰冻，无法出牌和摸牌，且不受任何技能影响（被主动技指定时技能无效，但冰冻 -1）；只有被帮助/被技能指定才能减层，减到 0 后恢复正常；
                    2. 主动·救救老奶（冰冻时可用）：指定一名玩家求助，对方可拒绝或同意（同意则由对方自选一张牌交给你）——成功帮助后冰冻 -1，且本回合可以正常出牌和摸牌；被拒后可继续问其他人（同一人本回合不能重复问），回应超时 15 秒视为拒绝；
                    3. 主动·乖孩子（解冻时可用，每回合 1 次）：喂给一名其他玩家一颗荔枝（不能喂自己），集齐 2 颗荔枝的玩家随机获得一张普通小猫牌，荔枝清零。
                    冰冻期间被卡牌指定（偷牌/求赠/看牌等）照常生效。",
      "trigger": "active",
      "effect": { "kind": "iceFrozen | iceHelp | iceLychee", "layers": 10, "perTurn": 1 }
    }
  ]
}
```

```json
{
  "id": "apple",
  "name": "邪恶苹果头",
  "title": "Evil Apple",
  "emoji": "🍎",
  "role": "aggressive",
  "themeColor": "#fc2104f7",
  "difficulty": 1,
  "lore": "参见女王大人。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\apple.jpg",
  "apple_portrait": "D:\dev\bombcat\client\public\assets\characters\evil_apple.jpg",
  "skills": [
    {
      "id": "apple-skill",
      "name": "苹果",
      "description": "1. 被动：开局公开公告，并往牌堆随机位置藏 1 张「爆炸苹果」——其他玩家摸到等同摸到爆炸猫（有拆解就拆解，拆解后仍以爆炸苹果身份回到牌堆；香蕉女王同样可用 4 张香蕉兑换）；邪恶苹果头本人摸到时可以悄悄把它放回牌堆（插在非顶位置）并再摸一张；
                    2. 主动：指定一位没有苹果的玩家投掷邪恶苹果（每人最多 1 个），冷却 5 回合——被投掷者可以在自己回合内随时吃掉它（交出一张手牌给苹果头，苹果消失）；不吃的话苹果存在 3 个回合，第 4 个回合开始时变成爆炸苹果混入牌堆（牌堆里的爆炸苹果数量会因此累积）。",
      "trigger": "active",
      "effect": { "kind": "appleBomb | appleThrow", "count": 1, "cooldownTurns": 5 }
    }
  ]
}
```

```json
{
  "id": "butcher",
  "name": "屠夫",
  "title": "Butcher",
  "emoji": "🔪",
  "role": "aggressive",
  "themeColor": "#5e0d02f7",
  "difficulty": 3,
  "lore": "白天砍下来的牌，晚上放在口袋里嚼一嚼。",
  "portrait": "D:\dev\bombcat\client\public\assets\characters\butcher.jpg",
  "skills": [
    {
      "id": "butcher-skill",
      "name": "剔骨",
      "description": "1. 被动：场内任何玩家手牌数量变少时（自行出牌不包括），屠夫获得一层剔骨标记，最多获得5层；
                    2. 主动：屠夫消耗3层剔骨，封锁指定一名玩家的所有角色技能和功能牌（拆除除外）直到该玩家的下一个回合，并抽取该玩家一张手牌（不计剔骨），封锁期间屠夫对该玩家形成压制，使用任何攻击性技能牌（抽牌、攻击、求赠等）对该玩家造成双倍效果。冷却时间：对每名玩家5回合，自己没有冷却时间，只要有剔骨层数就可以一直用。",
      "trigger": "active",
      "effect": { "kind": "butcherCleave", "maxStacks": 5, "cost": 3, "targetCooldown": 5 }
    }
  ]
}
```

> **屠夫实现细则（已确认）**
> - 剔骨只在手牌**被他人拿走**时计入：求赠、对子/三连偷、怪盗、猪王吞噬、大眼揭发、传递快乐、混沌之触；每张 +1，上限 5。屠夫自己拿走的牌、自己出牌、技能代价、拆解、主动交牌、死亡都不计。
> - 剔骨（主动）：只能在自己回合发动，消耗 3 层，随机抽目标 1 张；封锁持续到**目标下一回合结束**；对同一目标冷却 5 个屠夫回合。冰冻的秀英免疫（层数与冷却照常消耗）。
> - 封锁：主动技、所有功能牌（含否认、猫牌组合、香蕉兑换功能牌）不可用；拆解与被动照常。
> - 压制：屠夫对被自己封锁的目标求赠/对子/三连偷 2 张；目标是下家时攻击变成连续 4 回合；与数学老师「乘」不叠加。

```json
{
  "id": "driver",
  "name": "司机小贾",
  "title": "撞大运",
  "emoji": "🚕",
  "role": "control",
  "themeColor": "#e8b923",
  "difficulty": 2,
  "lore": "师傅，去哪儿？上了车就是缘分。",
  "portrait": "client/public/assets/characters/Driver_jia.jpg",
  "skills": [
    { "id": "driver-ride", "name": "上车", "trigger": "active", "effect": { "kind": "driverRide", "cooldownTurns": 3 } },
    { "id": "driver-lane", "name": "变道", "trigger": "active", "effect": { "kind": "driverLane", "cooldownTurns": 4 } },
    { "id": "driver-luck", "name": "老司机", "trigger": "gameStart", "effect": { "kind": "driverLuck", "faresPerLuck": 3 } }
  ]
}
```

> **司机小贾设计说明（撞大运）**：主打现有角色都没碰过的两条线——**玩家间交易**与**座次**。
> - 上车（主动，冷却 3，对方同意后才开始计）：邀请一名玩家拼车，对方可拒绝。同意则自选一张手牌交给小贾当车费，他的下一回合结束不摸牌（只抵一个回合）。被拒可换人再问，同一回合不能重复问同一人。冰冻的秀英、没手牌的人、已在车上的人不能被邀请；被屠夫封锁的人仍可上车。
> - 变道（主动，冷却 4）：选一名玩家与他当前方向上的下家交换座次（可包括自己），至少 3 名存活玩家。改变攻击落点、屠夫压制的下家判定、传递快乐等。
> - 老司机（被动）：每收满 3 份车费得 1 层「撞大运」（可叠加）；摸到爆炸猫 / 爆炸苹果时自动消耗 1 层放回牌堆随机位置，不爆炸、不消耗拆解。
> - 玩法：牌堆越危险越多人愿意付费上车，小贾靠车费攒保命层数；变道让座次成为可争夺的资源。

```json
{
  "id": "julia",
  "name": "Julia姐",
  "emoji": "💼",
  "role": "trickster",
  "themeColor": "#9b2c4a",
  "difficulty": 3,
  "lore": "风险和收益永远成正比。今天的会议，我只听结论。",
  "portrait": "client/public/assets/characters/julia.jpg",
  "skills": [
    { "id": "julia-invest", "name": "建仓", "trigger": "active", "effect": { "kind": "juliaInvest", "maxCards": 3, "holdTurns": 2, "cooldownTurns": 3 } },
    { "id": "julia-cashout", "name": "平仓", "trigger": "active", "effect": { "kind": "juliaCashout" } }
  ]
}
```

> **Julia 姐设计说明（投资）**：盈亏不靠纯运气，而看全场公开、人人可影响的「大盘」。
> - 建仓：1~3 张手牌进投资组合（暗置、不可被偷/求赠/吞噬、不能打出；爆炸猫/果奔猫/眼泪不能投），同时只有一笔持仓，冷却 3。第 2 个 Julia 回合开始时交割。
> - 大盘：持仓期间全场每打出一张功能牌（含梦境牌）+1，每张猫牌（按张数）或否认 −1。
> - 交割：≥ +2 牛市，本金全回 + 从弃牌堆随机再拿同样张数的非爆炸牌；−1~+1 震荡，原样拿回；≤ −2 熊市，随机亏一半（向上取整）。
> - 平仓：随时提前撤资，随机扣 1 张手续费；被屠夫封锁时不能平仓（自动交割不受影响）。Julia 出局时持仓作废。
> - 玩法：Julia 想拉盘就得自己多出功能牌，对手看到她持仓可以故意出猫牌砸盘；把拆解藏进投资组合可以防偷，但此时摸到爆炸猫就没有拆解可用。

```json
{
  "id": "lazy_sheep",
  "name": "懒懒羊",
  "emoji": "🐑",
  "role": "support",
  "themeColor": "#cfd8f0",
  "difficulty": 2,
  "lore": "一只羊、两只羊……zzz……梦里什么都有。",
  "portrait": "client/public/assets/characters/lazy_sheep.jpg",
  "skills": [
    { "id": "sheep-dream", "name": "数羊", "trigger": "active", "effect": { "kind": "sheepDream", "options": 2, "cooldownTurns": 3 } }
  ]
}
```

> **懒懒羊设计说明（梦境）**：
> - 数羊（冷却 3）：立刻结束回合（照常摸牌）进入梦乡，持续到她下一回合开始；梦乡中别人对她的偷牌（求赠、对子、三连、怪盗）落空，但她不能打否认。
> - 醒来：翻 2 张随机梦境牌选 1 张，自己收下或送给任意存活玩家，另一张作废；超时自动收下第一张。
> - 梦境牌（kind `dream`，不进普通牌堆、不能放进卡组，算功能牌——会被屠夫封锁、计入 Julia 大盘）：
>   - 🛌 回笼觉：结束回合不摸牌，但下一次摸牌多摸 1 张（摸牌延期）。
>   - 🧶 羊毛毯：不能主动打出；被攻击时自动生效，少连续行动 1 回合（最少 1），用完弃掉。
>   - 🔮 预知梦：私密得知牌堆顶 5 张里哪几个位置是爆炸牌。
>   - 🌙 造梦：把牌堆顶 3 张里的爆炸牌全部移到牌堆底。
>   - 😱 噩梦：持有期间每次摸牌多摸 1 张；可以花一次出牌把它扔掉。
>   - 🚶 梦游：不进手牌，收到的人下一回合开始时自动随机打出一张功能牌（否认、拆解、梦境牌、猫牌除外）。

---

## 现有角色参考（不要重复这些 ID）

| ID | 名字 | 职责 | 技能 |
|---|---|---|---|
| `none` | 路人 | 辅助 | 无技能 |
| `echo-mage` | 回响法师 | 诡诈 | 被否认的牌回手（1次） |
| `oracle` | 预言家 | 控制 | 回合开始看牌堆顶 1 张 |
| `knight` | 铁壁骑士 | 辅助 | 第一次被偷牌无效 |
| `phantom-thief` | 怪盗基德 | 诡诈 | 弃 2 指名偷 1（1次） |
| `alchemist` | 炼金术士 | 控制 | 弃 1 回收弃牌堆顶（2次） |
| `lucky-cat` | 幸运绒球 | 辅助 | 开局多 1 张跳过 |
