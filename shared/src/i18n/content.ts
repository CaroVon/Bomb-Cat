/**
 * 内置内容的英文文本（按 id）。中文在原定义里，这里缺失的条目自动回退中文。
 * 规则描述中的阿拉伯数字须与中文一致（见 test/i18n-content.test.ts）；
 * 中文用汉字写的数（"一张""两张"）英文也用单词（one / two）。
 * 中英名称对照表：docs/I18N_NAMES.md
 */
import type { CharacterRole } from '../characters';

export interface CardTextEn {
  name: string;
  description: string;
}

export interface CharTextEn {
  name: string;
  title?: string;
  description: string;
  lore?: string;
  skills?: Record<string, { name: string; description: string }>;
}

const PLAIN_CAT_DESC =
  'Plain cat. Play 2 of a kind to steal a random card; 3 of a kind to name the card you steal.';

export const CARD_EN: Record<string, CardTextEn> = {
  'dream-snooze': {
    name: 'Snooze',
    description: "Play: end your turn immediately without drawing — but your next draw takes 1 extra card (the draw is postponed, not skipped).",
  },
  'dream-fleece': {
    name: 'Fleece Blanket',
    description: "Just keep it in hand; it can't be played. When you're attacked it wraps you up automatically: take 1 fewer turn in a row (minimum 1), then it's discarded.",
  },
  'dream-sense': {
    name: 'Prophetic Dream',
    description: 'Play: secretly learn which of the top 5 cards of the deck are exploding cards (you don\'t see what the other cards are).',
  },
  'dream-weave': {
    name: 'Dream Weave',
    description: 'Play: move every exploding card among the top 3 cards of the deck to the bottom.',
  },
  'dream-nightmare': {
    name: 'Nightmare',
    description: 'While you hold it, every draw takes 1 extra card. You may spend a play to throw it away (no other effect).',
  },
  'dream-sleepwalk': {
    name: 'Sleepwalk',
    description: "Doesn't go into your hand: the receiver sleepwalks at the start of their next turn, automatically playing a random action card from their hand (Nope, Defuse, dream cards and cat cards excluded) with its normal effect.",
  },
  exploding: {
    name: 'Exploding Kitten',
    description: "Draw it and you explode! No Defuse means you're out.",
  },
  'exploding-apple': {
    name: 'Exploding Apple',
    description:
      'Draw it and you explode! If Evil Apple draws it herself, she may quietly slip it back into the deck and draw again.',
  },
  defuse: {
    name: 'Defuse',
    description: 'Defuse an Exploding Kitten and put it back anywhere in the deck.',
  },
  attack: {
    name: 'Attack',
    description: 'End your turn immediately without drawing. The next player takes 2 turns in a row.',
  },
  skip: {
    name: 'Skip',
    description: 'End your turn immediately without drawing.',
  },
  favor: {
    name: 'Favor',
    description: 'Pick a player; they give you 1 random card (they may Nope it).',
  },
  shuffle: {
    name: 'Shuffle',
    description: 'Shuffle the deck. No reason needed.',
  },
  peek: {
    name: 'See the Future',
    description: 'Secretly look at the top 3 cards of the deck.',
  },
  nope: {
    name: 'Nope',
    description:
      'Cancel the card someone just played (play it within the 8-second Nope window). A Nope can be Noped.',
  },
  'plain-melon': { name: 'Watermelon Cat', description: PLAIN_CAT_DESC },
  'plain-potato': { name: 'Potato Cat', description: PLAIN_CAT_DESC },
  'plain-rainbow': { name: 'Rainbow Cat', description: PLAIN_CAT_DESC },
  'plain-fuzzy': { name: 'Yarnball Cat', description: PLAIN_CAT_DESC },
  'plain-beard': { name: 'Beard Cat', description: PLAIN_CAT_DESC },
  reverse: {
    name: 'Reverse',
    description: 'Reverse the turn order immediately, then continue your turn.',
  },
  'alter-future': {
    name: 'Alter the Future',
    description: 'Look at the top 3 cards of the deck and rearrange them in any order, then continue your turn.',
  },
  'draw-bottom': {
    name: 'Draw from the Bottom',
    description: 'End your turn, but draw from the bottom of the deck instead of the top.',
  },
  feral: {
    name: 'Feral Cat',
    description:
      'Wild plain cat: pairs with any other plain cat (steal a random card) or completes a triple (name the card you steal).',
  },
  streaking: {
    name: 'Streaking Kitten',
    description:
      "Passive: when you draw an Exploding Kitten, you may secretly tuck it into your hand instead of exploding. You can't win while holding it — and if you draw another one, you explode on the spot!",
  },
  tear: {
    name: 'Tear',
    description:
      "Nana's tear. When you draw it, choose: discard 1 card to feed Nana and revive her (the Tear passes to the next player), or refuse and draw 2 extra cards (the Tear goes back on top of the deck).",
  },
};

export const CHAR_EN: Record<string, CharTextEn> = {
  none: {
    name: 'Bystander',
    title: 'No skill',
    description: 'No character — pure card play.',
    lore: 'An ordinary passer-by, looking for their next meal in a world of cats and explosions.',
  },
  'echo-mage': {
    name: 'Echo Mage',
    title: 'Noped cards come back',
    description:
      'Each game, the first of your action cards to get Noped skips the discard pile and returns to your hand.',
    lore: "Exiled for Noping one too many of the Magic Council's motions. Ever since, his voice echoes back at the crucial moment.",
    skills: {
      'echo-return': {
        name: 'Echo',
        description: 'Each game, the first of your action cards to be Noped returns to your hand.',
      },
    },
  },
  oracle: {
    name: 'Oracle',
    title: 'Peeks at the top every turn',
    description: 'At the start of each of your turns, you may privately look at the top 1 card of the deck.',
    lore: 'They say she can see three seconds into the future — and she only uses it to decide what to have for lunch.',
    skills: {
      'oracle-peek': {
        name: 'Third Eye',
        description: 'At the start of your turn, privately look at the top 1 card of the deck.',
      },
    },
  },
  knight: {
    name: 'Bulwark Knight',
    title: 'First steal fails',
    description: 'The first time someone steals from you each game, the steal has no effect.',
    lore: 'The last member of the Order of the Bulwark. His shield is engraved: "Single use only."',
    skills: {
      'knight-wall': {
        name: 'Bulwark',
        description: 'The first steal against you each game has no effect.',
      },
    },
  },
  'phantom-thief': {
    name: 'Phantom Thief Kid',
    title: 'Discard 2, steal 1 by name',
    description:
      'Active (1 use per game): on your turn, discard any 2 cards from your hand to steal 1 card by name from a chosen player.',
    lore: 'He only steals what he believes fate meant for him — and your card just happens to qualify.',
    skills: {
      'thief-steal': {
        name: 'Perfect Crime',
        description:
          'During your play phase, discard 2 cards to steal 1 card by name from a chosen player. 1 use per game.',
      },
    },
  },
  alchemist: {
    name: 'Alchemist',
    title: 'Discard 1, recover the top discard',
    description:
      'Active (2 uses per game): on your turn, discard 1 card from your hand and take 1 card from the top of the discard pile into your hand.',
    lore: 'The first law of alchemy is equivalent exchange. The second: steal first, exchange later.',
    skills: {
      'alch-recycle': {
        name: 'Equivalent Exchange',
        description:
          'During your play phase, discard 1 card and take back 1 card from the top of the discard pile. 2 uses per game.',
      },
    },
  },
  'lucky-cat': {
    name: 'Lucky Pompom',
    title: 'Starts with +1 Skip',
    description: 'At the start of the game, gain 1 extra Skip.',
    lore: 'Legend says rubbing its belly brings good luck — but nobody dares test that in a world of Exploding Kittens.',
    skills: {
      'lucky-skip': {
        name: 'Little Luck',
        description: 'Start the game with 1 extra Skip.',
      },
    },
  },
  voyage: {
    name: 'Voyage',
    title: 'Seafaring Captain',
    description:
      'Active (5-turn cooldown): choose a player and swap 3 cards of your choice for 3 random cards from their hand; your turn ends immediately. The next voyage might be to the Moon.',
    lore: 'The next voyage might be to the Moon. Kids, has anyone not gotten their postcard yet?',
    skills: {
      'voyage-skill': {
        name: 'Heart as Vast as the Sea',
        description:
          'Choose a player and pick 3 cards from your hand to swap with 3 random cards of theirs (both players must hold ≥3 cards); your turn ends immediately. Cooldown: 5 turns.',
      },
    },
  },
  nana: {
    name: 'Nana',
    title: 'The Last Tear of the Soviet Union',
    description:
      'Starts without a Defuse. On death she turns into a Tear card that flows into the deck — whoever draws the Tear may feed Nana a card to revive her, or refuse and draw two extra. Once Nana has gathered 3 Tears, she is gone forever.',
    lore: "Comrades, I'll go on ahead. Zhang Bing will come pick me up later.",
    skills: {
      'nana-tear': {
        name: 'Endless Sea of Tears',
        description: 'Starts without a Defuse; becomes a Tear card on death; 3 Tears = permanent death.',
      },
    },
  },
  banana: {
    name: 'Banana',
    title: 'Banana Queen',
    description:
      'With no Defuse in hand, unleash Big Banana Rage: every hand on the table turns into Angry Bananas and gets shuffled! The overlay lasts one round (every living player acts once). During it, same-name cat combos are off; 2 cards can be played as any action card, and 4 can be used as a Defuse. 3 uses per game, 3-turn cooldown.',
    lore: 'Rumor has it someone once fell for her banana skirt — though they probably just slipped.',
    skills: {
      'banana-rage': {
        name: 'Big Banana Rage',
        description:
          'Use with no Defuse in hand (3 per game, 3-turn cooldown): every hand turns into Angry Bananas and is shuffled, for one round (each living player acts once). During it, everyone can only blind-play single cards; the Banana Queen cannot play cards directly — 2 cards = any action card, 4 cards = 1 Defuse.',
      },
    },
  },
  pig_king: {
    name: 'Pig King',
    title: 'Lord of the Swine',
    description:
      "Gluttony: every time you draw, you must draw one extra. Devour: snatch an opponent's card into your digestion zone; it becomes usable after 3 turns. After digesting 3 times, you're Stuffed for 3 turns and can't draw.",
    lore: 'No one knows how he became king of all pigs, but every battlefield ends up as his dinner table.',
    skills: {
      'pig-gluttony': {
        name: 'Gluttony',
        description:
          "Passive: draw 1 extra card every time you draw. Active (3-turn cooldown): devour 1 non-Defuse card from an opponent's hand; after digesting for 3 turns it must be played. After 3 digests you become Stuffed.",
      },
    },
  },
  chaos_queen: {
    name: 'Chaos Queen',
    title: 'Warper of All Things',
    description:
      "Draws a card whenever a hand on the table changes (max 1 per turn). Can Warp Space to reverse the turn order, or cast Chaos Touch to turn everyone's draws into snatches.",
    lore: 'Loving someone is like tending a flower; every stranger stirs the tide of the heart.',
    skills: {
      'chaos-ripple': {
        name: 'Ripple',
        description: "Passive: whenever any player's hand size changes, draw 1 card (max 1 time per turn).",
      },
      'chaos-warp': {
        name: 'Warp Space',
        description: 'Active: reverse the turn order (5-turn cooldown).',
      },
      'chaos-touch': {
        name: 'Chaos Touch',
        description:
          "Active: for the next round, every draw instead takes a card from a random player's hand (5-turn cooldown).",
      },
    },
  },
  future_queen: {
    name: 'Future Queen',
    title: 'Weaver of Fate',
    description:
      'See the Future shows 5 cards instead of 3, and she starts with 2 See the Future. Rewrite Fate: view the top 5, activate 1 of them, replace it with a card from your hand, then arrange them freely.',
    lore: "Weren't you into smart, bespectacled big-tech engineers?",
    skills: {
      'future-eye': {
        name: 'Enhanced Sight',
        description: 'Passive: See the Future shows 5 cards; start the game with 2 of them.',
      },
      'future-rewrite': {
        name: 'Rewrite Fate',
        description:
          'Active (5-turn cooldown): view the top 5 cards of the deck, activate 1 to take effect immediately (as if you played it yourself), replace it with 1 card from your hand, and put all 5 back on top in any order.',
      },
    },
  },
  bigEye: {
    name: 'Big-Eye Nana',
    title: "Zhang Bing's Watcher",
    description:
      "Every action card (not Defuse) another player uses adds a File on them (max 4). Actively Expose a player with Files: 2 Files = see their hand; 3 Files = see their hand + pick a card for them to discard; 4 Files = see their hand + take a card. 3-turn cooldown. She can't use Favor or steal effects herself.",
    lore: "Her eyes are always on every little kitten. Don't meet her gaze lightly.",
    skills: {
      'bigeye-expose': {
        name: 'Expose',
        description:
          "Passive: each action card (not Defuse) another player uses gives them +1 File (max 4); you can't use Favor or steal effects. Active (3-turn cooldown): Expose a player with ≥2 Files and clear their Files — 2 Files: see their hand; 3 Files: see their hand + pick a card for them to discard; 4 Files: see their hand + take a card.",
      },
    },
  },
  soup: {
    name: 'Math Teacher',
    title: 'Super Soup',
    description:
      "Four operations (each on its own 4-turn cooldown; can't target yourself): Add = target draws 1 card now; Subtract = target draws 1 fewer card next time; Multiply = target's next action card triggers twice; Divide = target's next action card fails to trigger.",
    lore: "Ready for class, kids? Now let's go over this formula.",
    skills: {
      'soup-add': {
        name: 'Add',
        description: 'Active (4-turn cooldown): another player of your choice immediately draws a card.',
      },
      'soup-sub': {
        name: 'Subtract',
        description: 'Active (4-turn cooldown): choose another player; their next draw is one card fewer (minimum 0).',
      },
      'soup-mul': {
        name: 'Multiply',
        description: "Active (4-turn cooldown): choose another player; their next action card's effect triggers twice.",
      },
      'soup-div': {
        name: 'Divide',
        description:
          'Active (4-turn cooldown): choose another player; their next action card fails to trigger (it goes straight to the discard pile).',
      },
    },
  },
  xiuying: {
    name: 'Xiuying',
    title: 'Frozen Lychee Granny',
    description:
      'Starts with 10 layers of Freeze: can\'t play or draw cards, and is immune to all skills (being targeted by a skill gives Freeze -1). While frozen, she can call "Save Granny" to ask a player to help thaw her (they may refuse; if they agree, they give her a card, Freeze -1, and she can act normally this turn). On a turn when she\'s thawed or has been helped, she can play "Good Kid" and hand out lychees: whoever collects 2 gets a random plain cat card.',
    lore: 'Save me, kids — Granny will give you yummy lychees.',
    skills: {
      'ice-frozen': {
        name: 'Frozen Granny',
        description:
          "Passive: start with 10 layers of Freeze — can't play or draw cards, and immune to all skills. Being helped, targeted by a skill, or targeted by an action card gives Freeze -1; once it reaches zero, she returns to normal.",
      },
      'ice-help': {
        name: 'Save Granny',
        description:
          'Active (while frozen): ask a player to help thaw you — they may refuse; if they agree, they give you a card, Freeze -1, and you can play and draw normally this turn. If refused, you can keep asking others.',
      },
      'ice-lychee': {
        name: 'Good Kid',
        description:
          'Active (when thawed or helped this turn, 1 per turn): feed a lychee to another player; any player who collects 2 lychees gets a random plain cat card.',
      },
    },
  },
  apple: {
    name: 'Evil Apple',
    title: 'Rotten to the Core',
    description:
      'Passive: at the start she hides an Exploding Apple in the deck — anyone else who draws it treats it as an Exploding Kitten (it returns to the deck even after a Defuse); if she draws it herself, she quietly slips it back and draws again. Active "Throw Evil Apple" (5-turn cooldown): the target can eat it on their own turn (handing her a card); if left uneaten for 3 turns, it becomes an Exploding Apple and is shuffled into the deck.',
    lore: 'At your service, Your Majesty.',
    skills: {
      'apple-bomb': {
        name: 'Bad Apple',
        description:
          'Passive: at game start, hide 1 Exploding Apple at a random spot in the deck. Other players who draw it treat it as an Exploding Kitten (after a Defuse it goes back into the deck, and more pile up as thrown apples expire). If you draw it yourself, quietly put it back into the deck and draw another card.',
      },
      'apple-throw': {
        name: 'Throw Evil Apple',
        description:
          "Active (5-turn cooldown): pick a player who doesn't have an apple and throw the Evil Apple at them — they can eat it on their own turn (handing you a card); otherwise, after 3 turns it becomes an Exploding Apple and is shuffled into the deck.",
      },
    },
  },
  butcher: {
    name: 'Butcher',
    title: 'The Cleaver',
    description:
      'Passive: whenever any player\'s cards are taken by someone else, gain 1 Carve stack per card, up to 5. Active "Bone Carve": spend 3 stacks to take 1 random card from a player and Lock them until the end of their next turn — meanwhile they can\'t use character active skills or action cards (Defuse excepted), and your steals and Attacks against them are doubled. 5-turn cooldown per target.',
    lore: 'What he chops off by day, he chews from his pocket by night.',
    skills: {
      'butcher-skill': {
        name: 'Bone Carve',
        description:
          "Passive: whenever any player's cards are taken by someone else (playing or handing over your own cards doesn't count), gain +1 Carve stack per card (max 5). Active: spend 3 stacks and pick a player — take 1 random card from them (earns no stacks) and Lock their active skills and action cards (Defuse excepted) until the end of their next turn. While they're Locked, your Favor / pair / triple steals take 2 cards from them, and if they're next in turn order, your Attack makes them take 4 turns in a row (doesn't stack with Multiply). 5-turn cooldown per target player; no cooldown otherwise.",
      },
    },
  },
  driver: {
    name: 'Driver Jia',
    title: 'Jackpot Ride',
    description:
      'Active "Hop In": invite a player to carpool — if they accept, they hand you a card as the fare and skip drawing at the end of their next turn. Active "Lane Change": swap the seats of two adjacent players, changing who is next to whom. Passive "Old Hand": every 3 fares earns 1 Jackpot stack; when you draw an exploding card it is automatically put back into the deck.',
    lore: "Where to, boss? Once you're in the car, it's fate.",
    skills: {
      'driver-ride': {
        name: 'Hop In',
        description:
          "Active (3-turn cooldown, starting only once someone accepts): invite another player to carpool; they may refuse. Accept: they hand you a card of their choice as the fare, and they don't draw at the end of their next turn (covers one turn only). Refuse: you may ask someone else this turn, but not the same player twice.",
      },
      'driver-lane': {
        name: 'Lane Change',
        description:
          'Active (4-turn cooldown): pick a player and swap seats between them and the player after them (you may include yourself). Turn order, where Attacks land, and who counts as "next" all change from then on.',
      },
      'driver-luck': {
        name: 'Old Hand',
        description:
          'Passive: every 3 fares collected grants 1 Jackpot stack (stackable). When you draw an Exploding Kitten or Exploding Apple, 1 stack is spent automatically to put it back at a random spot in the deck — no explosion, no Defuse used.',
      },
    },
  },
  julia: {
    name: 'Julia',
    title: 'The Executive',
    description:
      'Active "Open Position": put 1–3 cards from your hand into a portfolio (face down, safe from steals, unplayable); it settles after 2 turns by the Market — every action card anyone plays is +1, every cat card or Nope is −1. Market ≥ +2 doubles your stake, ≤ −2 loses half, anything else returns it as is. Active "Cash Out": exit early at any time for a 1-card fee.',
    lore: 'Risk and reward always scale together. In today\'s meeting, I only want the conclusion.',
    skills: {
      'julia-invest': {
        name: 'Open Position',
        description:
          'Active (3-turn cooldown): put 1–3 cards from your hand into your portfolio (no Exploding Kittens, Streaking Kittens or Tears); only one position at a time. While held, those cards can\'t be stolen, begged for or devoured, and can\'t be played. It settles automatically at the start of your 2nd turn: Market ≥ +2 is a bull run — get your whole stake back plus the same number of random non-exploding cards from the discard pile; −1 to +1 is flat — get it back as is; ≤ −2 is a crash — lose a random half (rounded up).',
      },
      'julia-cashout': {
        name: 'Cash Out',
        description:
          'Active (no cooldown, needs an open position): exit early — 1 random card goes to the discard pile as the fee and the rest return to your hand.',
      },
    },
  },
  lazy_sheep: {
    name: 'Lazy Sheep',
    title: 'Dream Weaver',
    description:
      'Active "Count Sheep": end your turn right away (drawing as usual) and fall asleep — while asleep nobody can steal from you, but you can\'t play Nope. When you wake at your next turn, pick 1 of 2 random dream cards: keep it, or give it to any player. Dream cards are brand-new action cards — keep the sweet dreams, slip the nightmares to rivals.',
    lore: 'One sheep, two sheep… zzz… anything is possible in a dream.',
    skills: {
      'sheep-dream': {
        name: 'Count Sheep',
        description:
          'Active (3-turn cooldown): hypnotize yourself — end your turn right away (drawing as usual) and sleep until your next turn starts. While asleep, steals against you (Favor, pairs, triples, Phantom Thief) fizzle, but you can\'t play Nope. On waking, reveal 2 random dream cards and pick 1 to keep or give to a living player; the other is discarded.',
      },
    },
  },
};

export const ROLE_LABEL_EN: Record<CharacterRole, string> = {
  control: 'Control',
  support: 'Support',
  aggressive: 'Aggressive',
  trickster: 'Trickster',
};

export const WORLD_RULE_EN: Record<string, { name: string; description: string }> = {
  'mad-draw': {
    name: 'Draw Frenzy',
    description: 'After playing a Skip you must draw one extra card — Skip becomes "swap one out".',
  },
  'double-down': {
    name: 'Double Down',
    description: 'End your turn by drawing 2 cards instead of 1. Double the bomb pressure, double the thrill.',
  },
  'pass-joy': {
    name: 'Pass the Joy',
    description: "At the start of each turn, a random card from the current player's hand passes to the next player.",
  },
  'defuse-plenty': {
    name: 'Defuse Surplus',
    description: 'The deck gets 2 extra Defuse cards shuffled in.',
  },
  overdrive: {
    name: 'Overdrive',
    description: 'Attack turns double from 2 to 4.',
  },
  'all-seeing': {
    name: 'All-Seeing',
    description: 'At the start of each turn, the current player privately looks at the top 1 card of the deck.',
  },
};

export const OBJECTIVE_EN: Record<string, { name: string; description: string }> = {
  'steal-3': {
    name: 'Master Thief',
    description: 'Steal 3 cards in total (Favor, combos and skills all count).',
  },
  'hand-10': {
    name: 'Card Tycoon',
    description: 'Hold 10 cards at any moment.',
  },
  outlive: {
    name: 'Outlive',
    description: "Outlive the player the system assigns you (still be alive when they're eliminated).",
  },
  pacifist: {
    name: 'Pacifist',
    description: 'Play no Attack cards all game and survive until only 3 players remain.',
  },
  'combo-3': {
    name: 'Combo King',
    description: 'Play 3 cards in a single turn.',
  },
  'defuse-2': {
    name: 'Bomb Squad',
    description: 'Use Defuse 2 times.',
  },
};

export const RUN_BONUS_EN: Record<string, { name: string; description: string }> = {
  'extra-deal': { name: 'Thick Hand', description: '+1 starting card.' },
  'extra-defuse': { name: 'Pocket Toolkit', description: 'Start with 1 extra Defuse.' },
  'steal-immune': { name: 'Steal Guard', description: 'The first steal against you this game has no effect.' },
  'start-peek': { name: 'Foresight', description: 'At the start, privately look at the top 3 cards of the deck.' },
  'boom-shield': {
    name: 'Get Out of Death Free',
    description:
      'Survive your first explosion: discard your whole hand and the Exploding Kitten goes back on top of the deck.',
  },
};
