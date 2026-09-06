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
  "id": "another-character",
  "name": "另一个角色",
  "title": "另一个称号",
  "emoji": "🔥",
  "role": "aggressive",
  "themeColor": "#e05252",
  "difficulty": 3,
  "lore": "火爆脾气，牌桌上的定时炸弹。",
  "skills": [
    {
      "id": "another-skill",
      "name": "怒火中烧",
      "description": "主动技（每局 2 次）：弃 1 张手牌，从弃牌堆顶拿回 1 张。",
      "trigger": "active",
      "effect": {
        "kind": "activeRecycle",
        "costCards": 1,
        "uses": 2
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
