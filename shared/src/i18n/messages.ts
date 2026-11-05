/**
 * 服务端日志 / 报错 / 私密提示的双语模板。
 * 键名约定：`log.*` 公开日志，`err.*` 操作被拒（invalid），`note.*` 私密提示，`room.*` 房间级报错。
 * 占位符 `{name}`；参数可以是引用字符串（见 ./index.ts 文件头），渲染时会本地化。
 */
export const MESSAGES: Record<string, { zh: string; en: string }> = {

  /* ---------- public logs ---------- */
  "log.join": {
    zh: "{player} 加入了房间",
    en: "{player} joined the room",
  },
  "log.leave": {
    zh: "{player} 离开了房间",
    en: "{player} left the room",
  },
  "log.gameStart": {
    zh: "游戏开始！卡组【{deck}】，{n} 名玩家，{player} 先手（牌堆 {deckCount} 张）",
    en: "Game on! Deck [{deck}], {n} players, {player} goes first ({deckCount} cards in the deck)",
  },
  "log.gameStartRule": {
    zh: "游戏开始！卡组【{deck}】，{n} 名玩家，{player} 先手（牌堆 {deckCount} 张）；本局规则 {emoji}【{rule}】",
    en: "Game on! Deck [{deck}], {n} players, {player} goes first ({deckCount} cards in the deck); rule this round: {emoji} [{rule}]",
  },
  "log.gameStartClassic": {
    zh: "游戏开始！卡组【经典卡组】，{n} 名玩家，{player} 先手（牌堆 {deckCount} 张）",
    en: "Game on! Deck [Classic Deck], {n} players, {player} goes first ({deckCount} cards in the deck)",
  },
  "log.gameStartClassicRule": {
    zh: "游戏开始！卡组【经典卡组】，{n} 名玩家，{player} 先手（牌堆 {deckCount} 张）；本局规则 {emoji}【{rule}】",
    en: "Game on! Deck [Classic Deck], {n} players, {player} goes first ({deckCount} cards in the deck); rule this round: {emoji} [{rule}]",
  },
  "log.skillActive": {
    zh: "{player} 的「{skill}」生效",
    en: "{player}'s \"{skill}\" takes effect",
  },
  "log.appleHidden": {
    zh: "🍏 {player} 往牌堆里藏了一张爆炸苹果……",
    en: "🍏 {player} hides an Exploding Apple in the deck...",
  },
  "log.blindBanana": {
    zh: "{player} 盲打了一张香蕉（【{card}】），没有产生效果",
    en: "{player} blindly plays a banana ([{card}]) — no effect",
  },
  "log.playDivided": {
    zh: "➗ {player} 打出【{cards}】，被除法干扰没有产生效果",
    en: "➗ {player} plays [{cards}], but Divide cancels the effect",
  },
  "log.play": {
    zh: "{player} 打出【{cards}】",
    en: "{player} plays [{cards}]",
  },
  "log.playTarget": {
    zh: "{player} 打出【{cards}】→ {target}",
    en: "{player} plays [{cards}] → {target}",
  },
  "log.mulTriggered": {
    zh: "✖️ 乘法生效：【{cards}】的效果触发了两次",
    en: "✖️ Multiply: [{cards}] triggers twice",
  },
  "log.suppressSteal": {
    zh: "🔪 屠夫压制：【{cards}】对 {target} 的偷牌效果翻倍",
    en: "🔪 Butcher's Suppression: [{cards}] steals twice from {target}",
  },
  "log.nope": {
    zh: "{player} 否认了 {target} 的牌 ❌",
    en: "{player} nopes {target}'s card ❌",
  },
  "log.unnope": {
    zh: "{player} 反否认了 {target} 的牌 ❌",
    en: "{player} un-nopes {target}'s card ❌",
  },
  "log.nopeReturned": {
    zh: "{player} 的「{skill}」生效，被否认的牌回到了手中",
    en: "{player}'s \"{skill}\" takes effect — the noped card returns to their hand",
  },
  "log.noped": {
    zh: "【{cards}】被否认，进入弃牌堆",
    en: "[{cards}] is noped and goes to the discard pile",
  },
  "log.shuffled": {
    zh: "牌堆被洗乱了 🌀",
    en: "The deck is shuffled 🌀",
  },
  "log.stealNoCards": {
    zh: "{player} 没有牌可被偷",
    en: "{player} has no cards to steal",
  },
  "log.stealNoTarget": {
    zh: "目标 没有牌可被偷",
    en: "The target has no cards to steal",
  },
  "log.stealMiss": {
    zh: "{player} 没有对方想要的牌，偷取落空",
    en: "{player} doesn't have the requested card — the steal misses",
  },
  "log.steal": {
    zh: "{player} 从 {target} 那里偷走了 1 张牌 🤏",
    en: "{player} steals 1 card from {target} 🤏",
  },
  "log.swapHands": {
    zh: "{player} 与 {target} 交换了手牌 🔄",
    en: "{player} swaps hands with {target} 🔄",
  },
  "log.reverse": {
    zh: "{player} 反转了出牌方向 🔁",
    en: "{player} reverses the turn order 🔁",
  },
  "log.drawExtra": {
    zh: "{player} 额外摸了 {n} 张牌",
    en: "{player} draws {n} extra card(s)",
  },
  "log.frozenBlockSkill": {
    zh: "🧊 {player} 处于冰冻中，「{skill}」没有产生效果（冰冻 -1，剩 {n} 层）",
    en: "🧊 {player} is frozen — \"{skill}\" has no effect (freeze -1, {n} left)",
  },
  "log.thawed": {
    zh: "🧊 {player} 解冻了！可以正常出牌和摸牌了",
    en: "🧊 {player} thaws out! They can play and draw normally again",
  },
  "log.frozenHitCard": {
    zh: "🧊 {player} 被【{card}】命中，冰冻 -1（剩 {n} 层）",
    en: "🧊 {player} is hit by [{card}] — freeze -1 ({n} left)",
  },
  "log.subNoDrawMark": {
    zh: "🧊 {player} 因减法标记，这次一张牌都没摸到",
    en: "🧊 {player} draws nothing this time due to the Subtract mark",
  },
  "log.ripple": {
    zh: "🌀 涟漪：{player} 感知到手牌变化，摸了 1 张牌",
    en: "🌀 Ripple: {player} senses a hand change and draws 1 card",
  },
  "log.cleaveStack": {
    zh: "🔪 {target} 失去了手牌，{player} 剔骨 +{n}（{have}/{max}）",
    en: "🔪 {target} loses a card — {player} gains +{n} Bone ({have}/{max})",
  },
  "log.immuneSteal": {
    zh: "{player} 的「{skill}」生效，偷牌无效 🛡️",
    en: "{player}'s \"{skill}\" takes effect — the steal fails 🛡️",
  },
  "log.fullSkipDraw": {
    zh: "🐷 {player} 饱腹中，跳过摸牌结束回合",
    en: "🐷 {player} is stuffed — skips the draw and ends the turn",
  },
  "log.frozenSkipDraw": {
    zh: "🧊 {player} 冰冻中（剩 {n} 层），跳过摸牌结束回合",
    en: "🧊 {player} is frozen ({n} left) — skips the draw and ends the turn",
  },
  "log.subNoDraw": {
    zh: "📐 {player} 受减法影响，这次一张牌都没摸到",
    en: "📐 {player} is hit by Subtract and draws nothing this time",
  },
  "log.doubleDown": {
    zh: "{player} 双倍下注，摸了 2 张牌 🎰",
    en: "{player} doubles down and draws 2 cards 🎰",
  },
  "log.gluttonyDraw": {
    zh: "{player} 暴食发动，摸了 {n} 张牌 🐷",
    en: "{player}'s Gluttony kicks in — draws {n} cards 🐷",
  },
  "log.draw": {
    zh: "{player} 摸了一张牌",
    en: "{player} draws a card",
  },
  "log.chaosNoTarget": {
    zh: "{player} 的混沌摸牌无目标可偷",
    en: "{player}'s chaos draw has no one to steal from",
  },
  "log.chaosSteal": {
    zh: "🌀 混沌之触：{player} 从 {target} 手中夺取了 1 张牌",
    en: "🌀 Chaos Touch: {player} snatches 1 card from {target}",
  },
  "log.nanaTearSelf": {
    zh: "💧 {player} 收下了自己的眼泪（{n}/3）",
    en: "💧 {player} takes back her own tear ({n}/3)",
  },
  "log.tearDeath": {
    zh: "💀 {player} 被眼泪彻底淹没了……（永久死亡）",
    en: "💀 {player} drowns in tears... (permanently dead)",
  },
  "log.tearDrawn": {
    zh: "💧 {player} 摸到了 Nana 的眼泪……",
    en: "💧 {player} draws Nana's tear...",
  },
  "log.defused": {
    zh: "{player} 摸到了爆炸猫，打出拆解 🔧",
    en: "{player} draws an Exploding Kitten and plays a Defuse 🔧",
  },
  "log.bananaDefusePrompt": {
    zh: "🍌 {player} 摸到了爆炸猫！可以用 4 张香蕉兑换拆解……",
    en: "🍌 {player} draws an Exploding Kitten! They can trade 4 bananas for a Defuse...",
  },
  "log.appleRot": {
    zh: "🍏 {player} 出局，身上的邪恶苹果也烂掉了",
    en: "🍏 {player} is out, and their Evil Apple rots away too",
  },
  "log.nanaTear": {
    zh: "💧 {player} 化作一滴眼泪，流向了牌堆……",
    en: "💧 {player} turns into a tear and flows into the deck...",
  },
  "log.explodeNana": {
    zh: "💥 {player} 摸到了爆炸猫，出局！（等待眼泪……）",
    en: "💥 {player} draws an Exploding Kitten and is out! (Waiting for the tear...)",
  },
  "log.explode": {
    zh: "💥 {player} 摸到了爆炸猫，当场爆炸出局！手牌已洗回牌堆",
    en: "💥 {player} draws an Exploding Kitten and blows up! Their hand is shuffled back into the deck",
  },
  "log.defusePlaced": {
    zh: "{player} 把爆炸猫放回了牌堆的某个位置 🔧",
    en: "{player} puts the Exploding Kitten back somewhere in the deck 🔧",
  },
  "log.altered": {
    zh: "{player} 重排了牌堆顶的未来 👁️‍🗨️",
    en: "{player} rearranges the future on top of the deck 👁️‍🗨️",
  },
  "log.drawBottom": {
    zh: "{player} 从牌堆底摸了一张牌",
    en: "{player} draws a card from the bottom of the deck",
  },
  "log.unlocked": {
    zh: "🔓 {player} 的屠夫封锁解除了",
    en: "🔓 {player} is no longer locked by the Butcher",
  },
  "log.attacked": {
    zh: "{player} 被攻击，要连续行动 {n} 个回合 ⚡",
    en: "{player} is attacked and must take {n} turns in a row ⚡",
  },
  "log.attackedSuppressed": {
    zh: "{player} 被攻击，要连续行动 {n} 个回合 ⚡（屠夫压制加倍）",
    en: "{player} is attacked and must take {n} turns in a row ⚡ (doubled by Butcher's Suppression)",
  },
  "log.attackedMul": {
    zh: "{player} 被攻击，要连续行动 {n} 个回合 ⚡（乘法加倍）",
    en: "{player} is attacked and must take {n} turns in a row ⚡ (doubled by Multiply)",
  },
  "log.turnsLeft": {
    zh: "{player} 的连击回合还剩 {n} 个 ⚡",
    en: "{player} has {n} attack turn(s) left ⚡",
  },
  "log.chaosEnd": {
    zh: "🌀 混沌之触效果消退了",
    en: "🌀 Chaos Touch wears off",
  },
  "log.rageEnd": {
    zh: "🍌 大香蕉之怒效果消退了",
    en: "🍌 Big Banana Rage wears off",
  },
  "log.digestDone": {
    zh: "🐷 {player} 消化完成，获得了一张牌！",
    en: "🐷 {player} finishes digesting and gains a card!",
  },
  "log.pigFull": {
    zh: "🐷 {player} 吃太饱了！{n} 回合内不能摸牌",
    en: "🐷 {player} is too full! Can't draw for {n} turn(s)",
  },
  "log.pigHungry": {
    zh: "🐷 {player} 饿了！下一回合必须连摸 3 张牌",
    en: "🐷 {player} is hungry! Must draw 3 cards next turn",
  },
  "log.appleRipe": {
    zh: "🍏 {player} 身上的邪恶苹果熟透了——它变成了爆炸苹果混进了牌堆！",
    en: "🍏 The Evil Apple on {player} is ripe — it turns into an Exploding Apple and joins the deck!",
  },
  "log.appleCountdown": {
    zh: "🍏 {player} 身上的邪恶苹果还剩 {n} 回合（{n} 回合后变成爆炸苹果）",
    en: "🍏 The Evil Apple on {player} has {n} turn(s) left (becomes an Exploding Apple in {n} turn(s))",
  },
  "log.passJoy": {
    zh: "🎁 {player} 传了一张牌给 {target}（是…才不告诉你）",
    en: "🎁 {player} passes a card to {target} (which one? not telling)",
  },
  "log.win": {
    zh: "🏆 {player} 获得胜利！",
    en: "🏆 {player} wins!",
  },
  "log.skillBlocked": {
    zh: "{player} 发动「{skill}」，但被挡下了 🎭",
    en: "{player} uses \"{skill}\", but it's blocked 🎭",
  },
  "log.skillSteal": {
    zh: "{player} 发动「{skill}」，偷走了 {target} 的 1 张牌 🦹",
    en: "{player} uses \"{skill}\" and steals 1 card from {target} 🦹",
  },
  "log.skillRecycle": {
    zh: "{player} 发动「{skill}」，回收了弃牌堆顶的【{card}】⚗️",
    en: "{player} uses \"{skill}\" and recovers [{card}] from the top of the discard pile ⚗️",
  },
  "log.skillSwapAll": {
    zh: "{player} 发动「{skill}」，与 {target} 交换了全部手牌 ⚓（{a} 张 ↔ {b} 张）",
    en: "{player} uses \"{skill}\" and swaps entire hands with {target} ⚓ ({a} ↔ {b} cards)",
  },
  "log.rage": {
    zh: "🍌 {player} 发动「{skill}」！全场手牌变成了愤怒香蕉并被打乱！（持续一轮：所有存活玩家各行动一次）",
    en: "🍌 {player} uses \"{skill}\"! Every hand turns into angry bananas and gets shuffled! (Lasts one round: each living player acts once)",
  },
  "log.mathAdd": {
    zh: "📐 {player} 对 {target} 使用「加法」，{target} 立即摸一张牌",
    en: "📐 {player} uses \"Add\" on {target} — {target} draws a card right away",
  },
  "log.mathSub": {
    zh: "📐 {player} 对 {target} 使用「减法」，其下次摸牌少摸一张",
    en: "📐 {player} uses \"Subtract\" on {target} — they draw one fewer card next time",
  },
  "log.mathMul": {
    zh: "📐 {player} 对 {target} 使用「乘法」，其下一张功能牌触发两次",
    en: "📐 {player} uses \"Multiply\" on {target} — their next action card triggers twice",
  },
  "log.mathDiv": {
    zh: "📐 {player} 对 {target} 使用「除法」，其下一张功能牌无法触发",
    en: "📐 {player} uses \"Divide\" on {target} — their next action card won't trigger",
  },
  "log.helpAsk": {
    zh: "🧊 {player} 向 {target} 求助：「救救我，孩子们！」",
    en: "🧊 {player} asks {target} for help: \"Save me, kids!\"",
  },
  "log.lychee": {
    zh: "🍒 {player} 喂给 {target} 一颗荔枝（{n}/2）",
    en: "🍒 {player} feeds {target} a lychee ({n}/2)",
  },
  "log.lycheeReward": {
    zh: "🍒 {player} 集齐 2 颗荔枝，获得了一张普通小猫牌！",
    en: "🍒 {player} collects 2 lychees and gains a plain cat card!",
  },
  "log.appleThrow": {
    zh: "🍏 {player} 朝 {target} 扔了一个邪恶苹果！（3 回合内不吃就会变成爆炸苹果）",
    en: "🍏 {player} throws an Evil Apple at {target}! (Becomes an Exploding Apple if not eaten within 3 turns)",
  },
  "log.cleave": {
    zh: "🔪 {player} 发动「{skill}」：封锁了 {target}（直到其下一回合结束）",
    en: "🔪 {player} uses \"{skill}\": {target} is locked (until the end of their next turn)",
  },
  "log.cleaveSteal": {
    zh: "🔪 {player} 发动「{skill}」：封锁了 {target}（直到其下一回合结束），并抽走 1 张手牌",
    en: "🔪 {player} uses \"{skill}\": {target} is locked (until the end of their next turn) and loses 1 card",
  },
  "log.devour": {
    zh: "🐷 {player} 吞噬了 {target} 的一张牌，正在消化……（{n} 回合后可用）",
    en: "🐷 {player} devours one of {target}'s cards and starts digesting... (usable in {n} turn(s))",
  },
  "log.warp": {
    zh: "🌀 {player} 发动「{skill}」，出牌顺序反转！",
    en: "🌀 {player} uses \"{skill}\" — the turn order reverses!",
  },
  "log.chaosTouch": {
    zh: "🌀 {player} 发动「{skill}」！接下来一轮所有摸牌变为夺取！",
    en: "🌀 {player} uses \"{skill}\"! For the next round, every draw becomes a snatch!",
  },
  "log.rewriteStart": {
    zh: "🌠 {player} 开始编织命运……（查看了牌堆顶 {n} 张）",
    en: "🌠 {player} begins weaving fate... (looks at the top {n} cards)",
  },
  "log.skillSwapN": {
    zh: "⚓ {player} 发动「{skill}」，与 {target} 交换了 {n} 张手牌",
    en: "⚓ {player} uses \"{skill}\" and swaps {n} card(s) with {target}",
  },
  "log.expose": {
    zh: "👀 {player} 揭发了 {target}！（{n} 个档案）",
    en: "👀 {player} exposes {target}! ({n} files)",
  },
  "log.nanaRevived": {
    zh: "💧 {player} 喂了 Nana 一张牌，Nana 复活了！",
    en: "💧 {player} feeds Nana a card — Nana is revived!",
  },
  "log.tearBackNana": {
    zh: "💧 眼泪流回了 Nana 手中（{n}/3）",
    en: "💧 The tear flows back to Nana ({n}/3)",
  },
  "log.tearPassed": {
    zh: "💧 眼泪流到了 {player} 手中",
    en: "💧 The tear flows into {player}'s hand",
  },
  "log.tearRefused": {
    zh: "{player} 拒绝了眼泪，摸了 2 张牌，眼泪回到牌堆顶",
    en: "{player} refuses the tear, draws 2 cards, and the tear returns to the top of the deck",
  },
  "log.bananaDefuse": {
    zh: "🍌 {player} 用 4 张香蕉兑换了拆解！爆炸猫放回了牌堆某处 🔧",
    en: "🍌 {player} trades 4 bananas for a Defuse! The Exploding Kitten goes back somewhere in the deck 🔧",
  },
  "log.bananaPlay": {
    zh: "🍌 {player} 用 2 张香蕉兑换，打出了【{card}】",
    en: "🍌 {player} trades 2 bananas and plays [{card}]",
  },
  "log.bananaPlayTarget": {
    zh: "🍌 {player} 用 2 张香蕉兑换，打出了【{card}】→ {target}",
    en: "🍌 {player} trades 2 bananas and plays [{card}] → {target}",
  },
  "log.rewrite": {
    zh: "🌠 {player} 改写了命运，激活了【{card}】！",
    en: "🌠 {player} rewrites fate and activates [{card}]!",
  },
  "log.rewriteTarget": {
    zh: "🌠 {player} 改写了命运，激活了【{card}】！→ {target}",
    en: "🌠 {player} rewrites fate and activates [{card}]! → {target}",
  },
  "log.digestDiscard": {
    zh: "🐷 {player} 丢弃了消化完成的牌",
    en: "🐷 {player} discards the digested card",
  },
  "log.helpRefused": {
    zh: "🧊 {player} 拒绝了 {target} 的求助",
    en: "🧊 {player} turns down {target}'s plea for help",
  },
  "log.helped": {
    zh: "🧊 {player} 帮助了 {target}（冰冻 -1，剩 {n} 层），本回合可以正常行动",
    en: "🧊 {player} helps {target} (freeze -1, {n} left) — they can act normally this turn",
  },
  "log.appleEaten": {
    zh: "🍏 {player} 吃掉了邪恶苹果，把一张手牌交给了 {target}",
    en: "🍏 {player} eats the Evil Apple and hands a card to {target}",
  },
  "log.appleEatenGone": {
    zh: "🍏 {player} 吃掉了邪恶苹果（投掷者已出局，牌进了弃牌堆）",
    en: "🍏 {player} eats the Evil Apple (the thrower is out, so the card goes to the discard pile)",
  },
  "log.exposeDiscard": {
    zh: "👀 {player} 指定 {target} 弃掉了一张牌",
    en: "👀 {player} makes {target} discard a card",
  },
  "log.exposeTake": {
    zh: "👀 {player} 从 {target} 手中抽走了一张牌",
    en: "👀 {player} takes a card from {target}'s hand",
  },
  "log.timeoutOut": {
    zh: "{player} 掉线超时，遗憾出局",
    en: "{player} timed out after disconnecting and is out",
  },

  /* ---------- private notices ---------- */
  "note.appleConvert": {
    zh: "🍏 你摸到了爆炸苹果，悄悄把它塞回了牌堆，并再摸一张",
    en: "🍏 You drew an Exploding Apple, quietly slipped it back into the deck, and drew again",
  },
  "note.streaking": {
    zh: "🐱‍💨 果奔猫生效：爆炸猫已秘密藏进你的手牌！持有期间无法获胜，再摸到一张会当场爆炸。",
    en: "🐱‍💨 Streaking Kitten: the Exploding Kitten is secretly hidden in your hand! You can't win while holding it, and drawing another one blows you up.",
  },
  "note.rage": {
    zh: "🍌 大香蕉之怒已发动！覆盖持续一轮：点击手牌只会选中，2 张=任意技能牌，4 张=1 拆解；同名猫组合不可用。",
    en: "🍌 Big Banana Rage is on! The overlay lasts one round: tapping cards only selects them; 2 cards = any action card, 4 cards = 1 Defuse; same-name cat combos are disabled.",
  },

  /* ---------- invalid (dynamic) ---------- */
  "err.deckInvalid": {
    zh: "卡组不合法：{errors}",
    en: "Invalid deck: {errors}",
  },
  "err.buildInvalid": {
    zh: "{player} 的构筑不合法：{error}",
    en: "{player}'s build is invalid: {error}",
  },
  "err.frozenNoPlay": {
    zh: "冰冻中无法出牌（剩 {n} 层）",
    en: "You're frozen and can't play cards ({n} left)",
  },
  "err.needCost": {
    zh: "需要弃置 {n} 张牌作为代价",
    en: "You must discard {n} card(s) as the cost",
  },
  "err.rageCooldown": {
    zh: "大香蕉之怒冷却中（剩 {n} 回合）",
    en: "Big Banana Rage is on cooldown ({n} turn(s) left)",
  },
  "err.skillCooldownNamed": {
    zh: "「{skill}」冷却中（剩 {n} 回合）",
    en: "\"{skill}\" is on cooldown ({n} turn(s) left)",
  },
  "err.helpCooldown": {
    zh: "求助冷却中（剩 {n} 回合）",
    en: "Asking for help is on cooldown ({n} turn(s) left)",
  },
  "err.appleCooldown": {
    zh: "投掷苹果冷却中（剩 {n} 回合）",
    en: "Apple throw is on cooldown ({n} turn(s) left)",
  },
  "err.boneShort": {
    zh: "剔骨层数不足（{have}/{need}）",
    en: "Not enough Bone stacks ({have}/{need})",
  },
  "err.cleaveCooldown": {
    zh: "对 {player} 的剔骨冷却中（剩 {n} 回合）",
    en: "Bone Carve on {player} is on cooldown ({n} turn(s) left)",
  },
  "err.devourCooldown": {
    zh: "吞噬冷却中（剩 {n} 回合）",
    en: "Devour is on cooldown ({n} turn(s) left)",
  },
  "err.warpCooldown": {
    zh: "扭曲空间冷却中（剩 {n} 回合）",
    en: "Warp Space is on cooldown ({n} turn(s) left)",
  },
  "err.chaosCooldown": {
    zh: "混沌之触冷却中（剩 {n} 回合）",
    en: "Chaos Touch is on cooldown ({n} turn(s) left)",
  },
  "err.rewriteCooldown": {
    zh: "命运改写冷却中（剩 {n} 回合）",
    en: "Rewrite Fate is on cooldown ({n} turn(s) left)",
  },
  "err.skillCooldown": {
    zh: "技能冷却中（剩 {n} 回合）",
    en: "Skill is on cooldown ({n} turn(s) left)",
  },
  "err.swapNeedCards": {
    zh: "双方手牌都需要至少 {n} 张才能交换 ⚓",
    en: "Both players need at least {n} card(s) to swap ⚓",
  },
  "err.swapPickCards": {
    zh: "需要指定 {n} 张不重复的手牌交出 ⚓",
    en: "Pick {n} distinct card(s) from your hand to give ⚓",
  },
  "err.exposeCooldown": {
    zh: "揭发冷却中（剩 {n} 回合）",
    en: "Expose is on cooldown ({n} turn(s) left)",
  },
  "err.exchangeCost": {
    zh: "需要 {n} 张不重复的手牌作为代价",
    en: "You need {n} distinct card(s) from your hand as the cost",
  },
  "err.activateNeedTarget": {
    zh: "激活【{card}】需要选择一名其他存活玩家",
    en: "Activating [{card}] requires choosing another living player",
  },

  /* ---------- invalid (static) ---------- */
  "err.roomFull": {
    zh: "房间已满",
    en: "The room is full",
  },
  "err.joinStarted": {
    zh: "对局已开始，无法加入",
    en: "The game has already started — you can't join",
  },
  "err.gameStarted": {
    zh: "对局已开始",
    en: "The game has already started",
  },
  "err.unknownCharacter": {
    zh: "未知角色",
    en: "Unknown character",
  },
  "err.notInRoom": {
    zh: "你不在房间里",
    en: "You're not in this room",
  },
  "err.gameInProgress": {
    zh: "对局已在进行",
    en: "A game is already in progress",
  },
  "err.hostOnlyStart": {
    zh: "只有房主能开始游戏",
    en: "Only the host can start the game",
  },
  "err.needTwoPlayers": {
    zh: "至少需要 2 名玩家",
    en: "At least 2 players are needed",
  },
  "err.deckTooSmall": {
    zh: "卡组牌太少，无法支撑这么多玩家",
    en: "The deck is too small for this many players",
  },
  "err.notPlaying": {
    zh: "对局未开始或已结束",
    en: "The game hasn't started or is already over",
  },
  "err.cannotPlayNow": {
    zh: "当前不能出牌",
    en: "You can't play a card right now",
  },
  "err.eliminated": {
    zh: "你已出局",
    en: "You're out",
  },
  "err.notYourTurn": {
    zh: "还没轮到你",
    en: "It's not your turn yet",
  },
  "err.lockedCards": {
    zh: "你被屠夫封锁了，本回合不能使用功能牌 🔒",
    en: "You're locked by the Butcher and can't use action cards this turn 🔒",
  },
  "err.cardNotInHand": {
    zh: "手中没有这张牌",
    en: "You don't have that card",
  },
  "err.mustHandleDigest": {
    zh: "必须先处理消化获得的牌 🐷",
    en: "You must deal with the digested card first 🐷",
  },
  "err.overlayBananaOnly": {
    zh: "覆盖期间只能通过香蕉兑换出牌 🍌",
    en: "During the overlay you can only play cards via banana trades 🍌",
  },
  "err.explodingNotPlayable": {
    zh: "爆炸猫不能主动打出",
    en: "Exploding Kittens can't be played",
  },
  "err.tearNotPlayable": {
    zh: "眼泪不能主动打出",
    en: "Tears can't be played",
  },
  "err.overlayNoCombo": {
    zh: "覆盖期间无法使用同名猫组合 🍌",
    en: "Same-name cat combos are disabled during the overlay 🍌",
  },
  "err.defuseAuto": {
    zh: "拆解会在摸到爆炸猫时自动使用",
    en: "Defuse is used automatically when you draw an Exploding Kitten",
  },
  "err.nopeWindowOnly": {
    zh: "否认牌只能在别人出牌的 8 秒窗口内打出",
    en: "Nope can only be played during the 8-second window after someone else plays",
  },
  "err.comboPlainOnly": {
    zh: "只有普通猫能组合打出",
    en: "Only plain cats can be played as combos",
  },
  "err.comboNotInHand": {
    zh: "组合牌必须是手中存在的牌",
    en: "Combo cards must be in your hand",
  },
  "err.comboMustBePlain": {
    zh: "组合牌必须是普通猫",
    en: "Combo cards must be plain cats",
  },
  "err.comboSize": {
    zh: "组合只能是 2 张或 3 张",
    en: "Combos must be 2 or 3 cards",
  },
  "err.comboSameName": {
    zh: "组合必须是同名普通猫（万能猫可通配）",
    en: "Combos must be matching plain cats (Feral Cats count as any)",
  },
  "err.comboNeedWant": {
    zh: "三张组合需要指定要偷的牌",
    en: "A 3-card combo needs you to name the card to steal",
  },
  "err.plainComboOnly": {
    zh: "普通猫只能 2 张或 3 张组合打出",
    en: "Plain cats can only be played as 2- or 3-card combos",
  },
  "err.streakingPassive": {
    zh: "果奔猫是被动牌，不能主动打出",
    en: "Streaking Kitten is passive and can't be played",
  },
  "err.nanaNoSteal": {
    zh: "大眼Nana无法使用求赠和偷牌效果 👀",
    en: "Big-Eye Nana can't use favor or steal effects 👀",
  },
  "err.noTargets": {
    zh: "没有其他存活玩家可以作为目标",
    en: "There are no other living players to target",
  },
  "err.needTarget": {
    zh: "需要选择一名其他存活玩家作为目标",
    en: "Choose another living player as the target",
  },
  "err.nothingToNope": {
    zh: "现在没有可以否认的牌",
    en: "There's nothing to nope right now",
  },
  "err.cannotNope": {
    zh: "你无法否认",
    en: "You can't nope",
  },
  "err.nopeOwn": {
    zh: "不能否认自己的牌",
    en: "You can't nope your own card",
  },
  "err.nopeNeedOther": {
    zh: "需要别人先否认，你才能再次否认",
    en: "Someone else has to nope before you can nope again",
  },
  "err.lockedNope": {
    zh: "你被屠夫封锁了，不能否认 🔒",
    en: "You're locked by the Butcher and can't nope 🔒",
  },
  "err.noNopeCard": {
    zh: "你手中没有否认牌",
    en: "You don't have a Nope card",
  },
  "err.cannotDrawNow": {
    zh: "当前不能摸牌",
    en: "You can't draw right now",
  },
  "err.mustHandleDigestFull": {
    zh: "必须先处理消化获得的牌（打出或丢弃）",
    en: "You must deal with the digested card first (play or discard it)",
  },
  "err.noPendingDefuse": {
    zh: "现在没有拆解待结算",
    en: "There's no pending defuse",
  },
  "err.notYourDefuse": {
    zh: "不是你的拆解",
    en: "That's not your defuse",
  },
  "err.noDefuseBanana": {
    zh: "你没有拆解，需要用 4 张香蕉兑换 🍌",
    en: "You have no Defuse — trade 4 bananas instead 🍌",
  },
  "err.badPosition": {
    zh: "位置无效",
    en: "Invalid position",
  },
  "err.noPendingAlter": {
    zh: "现在没有重排待结算",
    en: "There's no pending rearrangement",
  },
  "err.notYourAlter": {
    zh: "不是你的重排",
    en: "That's not your rearrangement",
  },
  "err.badAlterOrder": {
    zh: "重排顺序无效",
    en: "Invalid order",
  },
  "err.cannotSkillNow": {
    zh: "当前不能使用技能",
    en: "You can't use a skill right now",
  },
  "err.cannotSkill": {
    zh: "你无法使用技能",
    en: "You can't use skills",
  },
  "err.lockedSkill": {
    zh: "你被屠夫封锁了，不能使用角色技能 🔒",
    en: "You're locked by the Butcher and can't use character skills 🔒",
  },
  "err.noSuchSkill": {
    zh: "你没有这个主动技能",
    en: "You don't have that active skill",
  },
  "err.notActiveSkill": {
    zh: "该技能不是主动技能",
    en: "That skill isn't an active skill",
  },
  "err.skillUsedUp": {
    zh: "技能次数已用完",
    en: "No skill uses left",
  },
  "err.costNotInHand": {
    zh: "代价牌不在你手中",
    en: "The cost card isn't in your hand",
  },
  "err.needOtherPlayer": {
    zh: "需要选择一名其他存活玩家",
    en: "Choose another living player",
  },
  "err.needWantCard": {
    zh: "需要指定要偷的牌",
    en: "Name the card to steal",
  },
  "err.targetLacksCard": {
    zh: "对方没有这张牌（技能未消耗）",
    en: "They don't have that card (skill not used up)",
  },
  "err.discardEmpty": {
    zh: "弃牌堆是空的",
    en: "The discard pile is empty",
  },
  "err.rageActive": {
    zh: "大香蕉之怒正在生效，无法再次发动",
    en: "Big Banana Rage is already active",
  },
  "err.rageHasDefuse": {
    zh: "手中有拆解时不能发动大香蕉之怒",
    en: "You can't use Big Banana Rage while holding a Defuse",
  },
  "err.needOtherNotSelf": {
    zh: "需要选择一名其他存活玩家（不能指定自己）",
    en: "Choose another living player (not yourself)",
  },
  "err.alreadyThawed": {
    zh: "已经解冻了，不需要求助",
    en: "You've already thawed — no need for help",
  },
  "err.needHelpTarget": {
    zh: "需要选择一名其他存活玩家求助",
    en: "Choose another living player to ask for help",
  },
  "err.alreadyAsked": {
    zh: "本回合已经问过这位玩家了",
    en: "You already asked this player this turn",
  },
  "err.frozenNoLychee": {
    zh: "冰冻中无法喂荔枝（可先向其他玩家求助）",
    en: "You can't feed lychees while frozen (ask someone for help first)",
  },
  "err.needLycheeTarget": {
    zh: "需要选择一名其他存活玩家（不能喂自己）",
    en: "Choose another living player (you can't feed yourself)",
  },
  "err.lycheeUsed": {
    zh: "本回合已经喂过荔枝了",
    en: "You already fed a lychee this turn",
  },
  "err.needAppleTarget": {
    zh: "需要选择一名其他存活玩家（不能扔自己）",
    en: "Choose another living player (you can't throw at yourself)",
  },
  "err.alreadyHasApple": {
    zh: "这位玩家身上已经有邪恶苹果了",
    en: "That player already has an Evil Apple",
  },
  "err.digesting": {
    zh: "正在消化中，不能吞噬",
    en: "You're still digesting and can't devour",
  },
  "err.nothingToDevour": {
    zh: "对方没有可吞噬的牌（全是拆解）",
    en: "They have nothing to devour (only Defuses)",
  },
  "err.deckEmpty": {
    zh: "牌堆是空的",
    en: "The deck is empty",
  },
  "err.rewriteNeedsCard": {
    zh: "命运改写需要 1 张手牌来交换",
    en: "Rewrite Fate needs 1 card from your hand to swap",
  },
  "err.handNotYours": {
    zh: "指定的手牌不在你手中",
    en: "The chosen card isn't in your hand",
  },
  "err.exposeTooFew": {
    zh: "该玩家的档案不足 2 个，无法揭发 👀",
    en: "That player has fewer than 2 files — can't expose 👀",
  },
  "err.noPendingTear": {
    zh: "现在没有眼泪待处理",
    en: "There's no pending tear",
  },
  "err.notYourTear": {
    zh: "不是你的眼泪",
    en: "That's not your tear",
  },
  "err.nanaCannotRevive": {
    zh: "Nana 已无法复活，只能拒绝",
    en: "Nana can't be revived anymore — you can only refuse",
  },
  "err.needFeedCard": {
    zh: "需要选择一张要喂的牌",
    en: "Choose a card to feed",
  },
  "err.feedNotInHand": {
    zh: "要给的牌不在你手中",
    en: "The card to give isn't in your hand",
  },
  "err.cannotExchange": {
    zh: "你无法使用香蕉兑换",
    en: "You can't use banana trades",
  },
  "err.bananaOnly": {
    zh: "只有香蕉女王能用香蕉兑换",
    en: "Only Banana can make banana trades",
  },
  "err.rageInactive": {
    zh: "大香蕉之怒未激活",
    en: "Big Banana Rage isn't active",
  },
  "err.lockedExchange": {
    zh: "你被屠夫封锁了，不能兑换功能牌 🔒",
    en: "You're locked by the Butcher and can't trade for action cards 🔒",
  },
  "err.noDefuseNeeded": {
    zh: "现在不需要拆解",
    en: "No Defuse is needed right now",
  },
  "err.cannotExchangeNow": {
    zh: "当前不能兑换",
    en: "You can't trade right now",
  },
  "err.needExchangeCard": {
    zh: "需要指定要兑换的动作牌",
    en: "Choose an action card to trade for",
  },
  "err.exchangeActionOnly": {
    zh: "只能兑换动作牌（不含否认）",
    en: "You can only trade for action cards (not Nope)",
  },
  "err.exchangeNeedTarget": {
    zh: "这张牌需要选择一名其他存活玩家作为目标",
    en: "This card needs another living player as the target",
  },
  "err.noPendingRewrite": {
    zh: "现在没有命运待改写",
    en: "There's no pending fate rewrite",
  },
  "err.badActivate": {
    zh: "生效牌选择无效",
    en: "Invalid card choice to activate",
  },
  "err.swapNotInHand": {
    zh: "交换牌不在你手中",
    en: "The swap card isn't in your hand",
  },
  "err.badReturnOrder": {
    zh: "放回顺序无效",
    en: "Invalid return order",
  },
  "err.cannotDiscardNow": {
    zh: "现在不能丢弃",
    en: "You can't discard right now",
  },
  "err.discardDigestOnly": {
    zh: "只能丢弃消化获得的那张牌",
    en: "You can only discard the digested card",
  },
  "err.cardNotInYourHand": {
    zh: "这张牌不在你手中",
    en: "That card isn't in your hand",
  },
  "err.noHelpRequest": {
    zh: "现在没有向你发起的求助",
    en: "No one is asking you for help right now",
  },
  "err.helpPartiesGone": {
    zh: "求助双方已离场",
    en: "The players involved have left",
  },
  "err.pickCardToGive": {
    zh: "请选择一张要交出的手牌",
    en: "Choose a card from your hand to give",
  },
  "err.cannotEatApple": {
    zh: "你无法吃苹果",
    en: "You can't eat the apple",
  },
  "err.appleOwnTurn": {
    zh: "只能在自己回合吃苹果",
    en: "You can only eat the apple on your own turn",
  },
  "err.noApple": {
    zh: "你身上没有邪恶苹果",
    en: "You don't have an Evil Apple",
  },
  "err.noPendingExpose": {
    zh: "现在没有揭发待处理",
    en: "There's no pending exposure",
  },
  "err.targetEliminated": {
    zh: "目标已出局",
    en: "The target is out",
  },
  "err.cardNotInTargetHand": {
    zh: "这张牌不在对方手中",
    en: "That card isn't in their hand",
  },

  /* ---------- room ---------- */
  "room.gameStarted": {
    zh: "对局已开始",
    en: "The game has already started",
  },
  "room.buildInvalid": {
    zh: "构筑不合法：{error}",
    en: "Invalid build: {error}",
  },
  "room.hostOnlyDeck": {
    zh: "只有房主能设置卡组",
    en: "Only the host can set the deck",
  },
  "room.deckTooLarge": {
    zh: "卡组数据过大",
    en: "Deck data is too large",
  },
  "room.deckInvalid": {
    zh: "卡组不合法：{errors}",
    en: "Invalid deck: {errors}",
  },
  "room.internalError": {
    zh: "服务器内部错误",
    en: "Internal server error",
  },
  "room.errorRaw": {
    zh: "{text}",
    en: "{text}",
  },
  "log.rideAsk": {
    zh: "🚕 {player} 邀请 {target} 上车",
    en: "🚕 {player} invites {target} to hop in",
  },
  "log.rideRefused": {
    zh: "🚕 {player} 没有上 {target} 的车",
    en: "🚕 {player} turns down {target}'s ride",
  },
  "log.rideAccepted": {
    zh: "🚕 {player} 上了 {target} 的车，付了一张牌当车费（下回合到站不用摸牌）",
    en: "🚕 {player} hops in with {target} and pays a card as the fare (no draw at the end of their next turn)",
  },
  "log.rideArrive": {
    zh: "🚕 {player} 安全到站，本回合结束不摸牌",
    en: "🚕 {player} arrives safely and ends the turn without drawing",
  },
  "log.luckGain": {
    zh: "🍀 {player} 收满车费，攒下一层「撞大运」（共 {n} 层）",
    en: "🍀 {player} has collected enough fares — +1 Jackpot stack ({n} total)",
  },
  "log.luckDodge": {
    zh: "🍀 撞大运！{player} 摸到【{card}】，一个急转弯把它甩回了牌堆（剩 {n} 层）",
    en: "🍀 Jackpot! {player} draws [{card}] and swerves it back into the deck ({n} stacks left)",
  },
  "log.laneChange": {
    zh: "🛣️ {player} 变道：{a} 和 {b} 交换了座次",
    en: "🛣️ {player} changes lanes: {a} and {b} swap seats",
  },
  "err.rideCooldown": {
    zh: "上车冷却中（剩 {n} 回合）",
    en: "Hop In is on cooldown ({n} turns left)",
  },
  "err.needRideTarget": {
    zh: "需要选择一名其他存活玩家",
    en: "Pick another living player",
  },
  "err.alreadyAskedRide": {
    zh: "本回合已经邀请过这位玩家了",
    en: "You already asked this player this turn",
  },
  "err.rideFrozen": {
    zh: "对方处于冰冻中，没法上车",
    en: "They're frozen and can't hop in",
  },
  "err.rideNoCards": {
    zh: "对方没有手牌，付不起车费",
    en: "They have no cards to pay the fare",
  },
  "err.rideAlready": {
    zh: "对方已经在车上了",
    en: "They're already riding",
  },
  "err.laneCooldown": {
    zh: "变道冷却中（剩 {n} 回合）",
    en: "Lane Change is on cooldown ({n} turns left)",
  },
  "err.laneTooFew": {
    zh: "至少需要 3 名存活玩家才能变道",
    en: "Lane Change needs at least 3 living players",
  },
  "err.needLaneTarget": {
    zh: "需要选择一名存活玩家",
    en: "Pick a living player",
  },
  "log.investOpen": {
    zh: "💼 {player} 建仓：{n} 张牌进入投资组合（{turns} 个回合后按大盘交割）",
    en: "💼 {player} opens a position: {n} cards go into the portfolio (settles by the Market in {turns} turns)",
  },
  "log.marketBull": {
    zh: "📈 牛市！大盘 {market}：{player} 拿回 {n} 张本金，另从弃牌堆收获 {bonus} 张",
    en: "📈 Bull market! Market {market}: {player} gets the {n}-card stake back plus {bonus} cards from the discard pile",
  },
  "log.marketFlat": {
    zh: "📊 震荡市，大盘 {market}：{player} 原样拿回 {n} 张本金",
    en: "📊 Flat market at {market}: {player} gets the {n}-card stake back as is",
  },
  "log.marketBear": {
    zh: "📉 熊市！大盘 {market}：{player} 的 {n} 张本金亏掉了 {lost} 张",
    en: "📉 Bear market! Market {market}: {player} loses {lost} of the {n}-card stake",
  },
  "log.cashout": {
    zh: "💼 {player} 提前平仓（大盘 {market}）：扣 1 张手续费，拿回 {n} 张",
    en: "💼 {player} cashes out early (Market {market}): 1 card paid as a fee, {n} back to hand",
  },
  "log.portfolioLost": {
    zh: "💼 {player} 出局，投资组合里的 {n} 张牌进入弃牌堆",
    en: "💼 {player} is out — the {n} cards in the portfolio go to the discard pile",
  },
  "log.sheepSleep": {
    zh: "🐑 {player} 发动「{skill}」：一只羊、两只羊……摸完牌就睡着了 💤",
    en: "🐑 {player} uses \"{skill}\": one sheep, two sheep... draws and drifts off to sleep 💤",
  },
  "log.sheepWake": {
    zh: "🐑 {player} 醒了，还记得刚才的梦……",
    en: "🐑 {player} wakes up, still remembering the dream...",
  },
  "log.dreamKeep": {
    zh: "🌙 {player} 把一个梦留给了自己",
    en: "🌙 {player} keeps a dream card",
  },
  "log.dreamGive": {
    zh: "🌙 {player} 把一个梦送给了 {target}",
    en: "🌙 {player} gives a dream card to {target}",
  },
  "log.stealAsleep": {
    zh: "💤 {player} 在梦乡里，偷牌落空了",
    en: "💤 {player} is fast asleep — the steal fizzles",
  },
  "log.snooze": {
    zh: "🛌 {player} 睡了个回笼觉：结束回合不摸牌（下次摸牌多摸 {n} 张）",
    en: "🛌 {player} hits snooze: ends the turn without drawing (next draw takes {n} extra)",
  },
  "log.dreamExtraDraw": {
    zh: "😴 {player} 的梦还没醒：这次要多摸 {n} 张",
    en: "😴 {player}'s dreams linger: {n} extra cards on this draw",
  },
  "log.drawN": {
    zh: "{player} 摸了 {n} 张牌",
    en: "{player} draws {n} cards",
  },
  "log.buryBombs": {
    zh: "🌙 {player} 造了个梦：牌堆顶 3 张里的 {n} 张爆炸牌沉到了牌堆底",
    en: "🌙 {player} weaves a dream: {n} exploding cards from the top 3 sink to the bottom of the deck",
  },
  "log.nightmareShed": {
    zh: "😱 {player} 把噩梦扔掉了",
    en: "😱 {player} throws the nightmare away",
  },
  "log.fleece": {
    zh: "🧶 {player} 盖上羊毛毯，少挨 1 个回合（需连续行动 {n} 回合）",
    en: "🧶 {player} wraps up in the Fleece Blanket — one turn fewer ({n} turns in a row)",
  },
  "log.sleepwalk": {
    zh: "🚶 {player} 在梦游中打出了【{card}】",
    en: "🚶 {player} plays [{card}] while sleepwalking",
  },
  "log.sleepwalkNothing": {
    zh: "🚶 {player} 梦游了一圈，手里没有能打的功能牌，什么也没发生",
    en: "🚶 {player} sleepwalks around but has no action card to play — nothing happens",
  },
  "err.fleecePassive": {
    zh: "羊毛毯不能主动打出，被攻击时会自动生效",
    en: "The Fleece Blanket can't be played — it triggers automatically when you're attacked",
  },
  "err.sleepwalkNotPlayable": {
    zh: "梦游不能打出",
    en: "Sleepwalk can't be played",
  },
  "err.asleepNope": {
    zh: "你在梦乡里，不能打否认 💤",
    en: "You're asleep and can't play Nope 💤",
  },
  "err.noPendingDream": {
    zh: "现在没有要选的梦",
    en: "There's no dream to pick right now",
  },
  "err.notYourDream": {
    zh: "这不是你的梦",
    en: "That's not your dream",
  },
  "err.badDreamCard": {
    zh: "只能从翻出的梦境牌里选",
    en: "Pick one of the revealed dream cards",
  },
  "err.badDreamTarget": {
    zh: "只能送给一名存活玩家",
    en: "You can only give it to a living player",
  },
  "err.investCooldown": {
    zh: "建仓冷却中（剩 {n} 回合）",
    en: "Open Position is on cooldown ({n} turns left)",
  },
  "err.investHolding": {
    zh: "已经有一笔持仓了，先交割或平仓",
    en: "You already hold a position — settle or cash out first",
  },
  "err.investCount": {
    zh: "请选择 1~{n} 张手牌建仓",
    en: "Pick 1 to {n} cards from your hand to invest",
  },
  "err.investNotInHand": {
    zh: "要投资的牌不在你手里",
    en: "That card isn't in your hand",
  },
  "err.investBadCard": {
    zh: "【{card}】不能放进投资组合",
    en: "[{card}] can't go into the portfolio",
  },
  "err.noPortfolio": {
    zh: "你现在没有持仓",
    en: "You don't hold a position",
  },
  "err.sheepCooldown": {
    zh: "数羊冷却中（剩 {n} 回合）",
    en: "Count Sheep is on cooldown ({n} turns left)",
  },
};
