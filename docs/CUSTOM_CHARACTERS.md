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
      "description": "选择任意一名玩家，和对方交换全部手牌，回合结束。每局一次。",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": 1
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
      "description": "1. Banana可以在自己没有拆解牌后使用大香蕉之怒；
                    2. 发动大香蕉之怒后，场上所有人的手牌蒙上香蕉牌图案，持续3个回合，这三个回合的摸牌均显示为香蕉牌（底牌不变）；
                    3. 其他玩家一局可以打出一张香蕉牌，打出后触发原有牌面的效果，且必须进入弃牌堆；大香蕉可以将4张香蕉牌作为拆解使用，三张香蕉牌作为任意技能牌",
      "trigger": "active",
      "effect": {
        "kind": "None",
        "uses": 1
      }
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
