# 中英名称对照表 / Chinese → English Names

英文文本源文件：`shared/src/i18n/content.ts`（按 id 查找，缺失时回退中文）。
一致性测试：`shared/test/i18n-content.test.ts`（检查每个内置条目都有英文，且描述中的阿拉伯数字与中文一致）。

## 卡牌 Cards

| id | 中文 | English |
|---|---|---|
| exploding | 爆炸猫 | Exploding Kitten |
| exploding-apple | 爆炸苹果 | Exploding Apple |
| defuse | 拆解 | Defuse |
| attack | 攻击 | Attack |
| skip | 跳过 | Skip |
| favor | 求赠 | Favor |
| shuffle | 洗牌 | Shuffle |
| peek | 预知未来 | See the Future |
| nope | 否认 | Nope |
| plain-melon | 西瓜猫 | Watermelon Cat |
| plain-potato | 土豆猫 | Potato Cat |
| plain-rainbow | 彩虹猫 | Rainbow Cat |
| plain-fuzzy | 毛球猫 | Yarnball Cat |
| plain-beard | 胡子猫 | Beard Cat |
| reverse | 反转 | Reverse |
| alter-future | 改变未来 | Alter the Future |
| draw-bottom | 摸牌底 | Draw from the Bottom |
| feral | 万能猫 | Feral Cat |
| streaking | 果奔猫 | Streaking Kitten |
| tear | 眼泪 | Tear |

## 角色 Characters

| id | 中文名 | English name | 中文副标题 | English title |
|---|---|---|---|---|
| none | 路人 | Bystander | 没有技能 | No skill |
| echo-mage | 回响法师 | Echo Mage | 被否认的牌回到手中 | Noped cards come back |
| oracle | 预言家 | Oracle | 回合开始看一眼牌堆顶 | Peeks at the top every turn |
| knight | 铁壁骑士 | Bulwark Knight | 第一次被偷牌无效 | First steal fails |
| phantom-thief | 怪盗基德 | Phantom Thief Kid | 弃 2 张，指名偷 1 张 | Discard 2, steal 1 by name |
| alchemist | 炼金术士 | Alchemist | 弃 1 张，回收弃牌堆顶 | Discard 1, recover the top discard |
| lucky-cat | 幸运绒球 | Lucky Pompom | 开局多 1 张跳过 | Starts with +1 Skip |
| voyage | Voyage | Voyage | 远航船长 | Seafaring Captain |
| nana | Nana | Nana | 前苏联最后一滴眼泪 | The Last Tear of the Soviet Union |
| banana | Banana | Banana | 香蕉女王 | Banana Queen |
| pig_king | Pig King | Pig King | 猪王 | Lord of the Swine |
| chaos_queen | 混沌女王 | Chaos Queen | 扭曲万象 | Warper of All Things |
| future_queen | Future女王 | Future Queen | 命运编织者 | Weaver of Fate |
| bigEye | 大眼Nana | Big-Eye Nana | 张兵监视者 | Zhang Bing's Watcher |
| soup | 数学老师 | Math Teacher | Super Soup | Super Soup |
| xiuying | 秀英 | Xiuying | 冰冻荔枝老奶 | Frozen Lychee Granny |
| apple | 邪恶苹果头 | Evil Apple | Evil Apple | Rotten to the Core |
| butcher | 屠夫 | Butcher | Butcher | The Cleaver |
| driver | 司机小贾 | Driver Jia | 撞大运 | Jackpot Ride |
| julia | Julia姐 | Julia | Julia | The Executive |
| lazy_sheep | 懒懒羊 | Lazy Sheep | Lazy Sheep | Dream Weaver |

## 技能 Skills

| 角色 | skill id | 中文 | English |
|---|---|---|---|
| 回响法师 | echo-return | 回响 | Echo |
| 预言家 | oracle-peek | 天眼 | Third Eye |
| 铁壁骑士 | knight-wall | 铁壁 | Bulwark |
| 怪盗基德 | thief-steal | 精确犯罪 | Perfect Crime |
| 炼金术士 | alch-recycle | 等价交换 | Equivalent Exchange |
| 幸运绒球 | lucky-skip | 小幸运 | Little Luck |
| Voyage | voyage-skill | 大海胸怀无量 | Heart as Vast as the Sea |
| Nana | nana-tear | 无尽泪海 | Endless Sea of Tears |
| Banana | banana-rage | 大香蕉之怒 | Big Banana Rage |
| Pig King | pig-gluttony | 暴食 | Gluttony |
| 混沌女王 | chaos-ripple | 涟漪 | Ripple |
| 混沌女王 | chaos-warp | 扭曲空间 | Warp Space |
| 混沌女王 | chaos-touch | 混沌之触 | Chaos Touch |
| Future女王 | future-eye | 天眼强化 | Enhanced Sight |
| Future女王 | future-rewrite | 命运改写 | Rewrite Fate |
| 大眼Nana | bigeye-expose | 揭发 | Expose |
| 数学老师 | soup-add | 加法 | Add |
| 数学老师 | soup-sub | 减法 | Subtract |
| 数学老师 | soup-mul | 乘法 | Multiply |
| 数学老师 | soup-div | 除法 | Divide |
| 秀英 | ice-frozen | 冰冻老奶 | Frozen Granny |
| 秀英 | ice-help | 救救老奶 | Save Granny |
| 秀英 | ice-lychee | 乖孩子 | Good Kid |
| 邪恶苹果头 | apple-bomb | 苹果 | Bad Apple |
| 邪恶苹果头 | apple-throw | 投掷邪恶苹果 | Throw Evil Apple |
| 屠夫 | butcher-skill | 剔骨 | Bone Carve |
| 司机小贾 | driver-ride | 上车 | Hop In |
| 司机小贾 | driver-lane | 变道 | Lane Change |
| 司机小贾 | driver-luck | 老司机 | Old Hand |
| Julia姐 | julia-invest | 建仓 | Open Position |
| Julia姐 | julia-cashout | 平仓 | Cash Out |
| 懒懒羊 | sheep-dream | 数羊 | Count Sheep |

### 技能内术语 Skill terms

| 中文 | English |
|---|---|
| 功能牌 / 技能牌 | action card |
| 普通猫 / 普通小猫牌 | plain cat (card) |
| 对子 / 三连 | pair / triple |
| 冷却 N 回合 | N-turn cooldown |
| 愤怒香蕉 | Angry Banana |
| 消化区 / 饱腹 | digestion zone / Stuffed |
| 档案 | File |
| 冰冻（层） | Freeze (layers) |
| 荔枝 | lychee |
| 剔骨（层） | Carve stack |
| 封锁 | Lock |

## 全局规则 World Rules

| id | 中文 | English |
|---|---|---|
| mad-draw | 疯狂抽卡 | Draw Frenzy |
| double-down | 双倍下注 | Double Down |
| pass-joy | 传递快乐 | Pass the Joy |
| defuse-plenty | 防爆过剩 | Defuse Surplus |
| overdrive | 火力全开 | Overdrive |
| all-seeing | 全员天眼 | All-Seeing |

## 秘密任务 Secret Objectives

| id | 中文 | English |
|---|---|---|
| steal-3 | 偷牌大师 | Master Thief |
| hand-10 | 手牌大亨 | Card Tycoon |
| outlive | 比命长 | Outlive |
| pacifist | 和平主义 | Pacifist |
| combo-3 | 连出王 | Combo King |
| defuse-2 | 拆弹部队 | Bomb Squad |

## 无尽挑战增益 Run Bonuses

| id | 中文 | English |
|---|---|---|
| extra-deal | 厚实起手 | Thick Hand |
| extra-defuse | 随身工具箱 | Pocket Toolkit |
| steal-immune | 第一次防偷 | Steal Guard |
| start-peek | 先知 | Foresight |
| boom-shield | 免死金牌 | Get Out of Death Free |

## 角色职责 Roles

| 中文 | English |
|---|---|
| 控制 | Control |
| 辅助 | Support |
| 进攻 | Aggressive |
| 诡诈 | Trickster |

## 待确认的翻译取舍

- **邪恶苹果头 / 屠夫**：原 `title` 已是英文名（Evil Apple / Butcher），所以用作英文名；英文副标题另起为 "Rotten to the Core" / "The Cleaver"，避免名字和副标题重复。苹果头的被动技能「苹果」译作 "Bad Apple"（双关）。
- **数学老师**：名字译为 "Math Teacher"，副标题保留 "Super Soup"。
- **怪盗基德** → "Phantom Thief Kid"（致敬《名侦探柯南》Kaito Kid）。
- **毛球猫** → "Yarnball Cat"（配 🧶 emoji）；也可以用 "Furball Cat"。
- **大眼Nana 的「张兵」**、Nana 背景里的「张兵」统一音译为 "Zhang Bing"。
- **香蕉女王「2 张 = 任意技能牌」**：「技能牌」按 CUSTOM_CHARACTERS.md 理解为功能牌，译作 "any action card"。
- **屠夫「对每名玩家冷却 5 回合，自己无冷却」**：按设计文档（只要有层数就能一直用）译为 "5-turn cooldown per target player; no cooldown otherwise"。
- **混沌女王背景「爱人如养花，逢异惹心潮」**为意译诗句。
- **免死金牌** → "Get Out of Death Free"（化用 Monopoly 的 "Get Out of Jail Free"）。

## 梦境牌（懒懒羊专属）

| id | 中文 | English |
|---|---|---|
| dream-snooze | 回笼觉 | Snooze |
| dream-fleece | 羊毛毯 | Fleece Blanket |
| dream-sense | 预知梦 | Prophetic Dream |
| dream-weave | 造梦 | Dream Weave |
| dream-nightmare | 噩梦 | Nightmare |
| dream-sleepwalk | 梦游 | Sleepwalk |

游戏术语：投资组合 = portfolio，大盘 = Market，牛市 / 震荡 / 熊市 = bull run / flat / crash，梦乡 = asleep，梦境牌 = dream card。
