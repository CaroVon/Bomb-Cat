/**
 * 所有需要生成的资产清单 + prompt。
 * 来源:docs/ART_SPEC.md §4-§7。
 * 改提示词只动这里,不在主脚本散落。
 */

const COMMON_PREFIX =
  'Ukiyo-e Japanese woodblock print style, Edo period, hand-painted sumi ink outline, washi paper texture, flat color, asymmetric composition, slightly off-center subject, no realistic shading, no gradients, no 3D, no neon colors, no photographic style, no anime cel-shading';

const COMMON_NEGATIVE =
  'photorealistic, 3d render, cgi, neon glow, gradient background, modern clothing, western elements, comic book style, blurry, low detail, low quality, watermark, text, signature, cute chibi, kawaii pastel';

const FULL_CARD_NEGATIVE = COMMON_NEGATIVE + ', realistic cat, photo';

/* ---------- 14 张内置卡(420×588 透明 PNG) ---------- */

const CARDS = [
  {
    id: 'exploding',
    label: '爆炸猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: an evil-eyed cute cat yokai opening its mouth wide, with red and orange flame exhalation explosion bursting out in swirling smoke clouds, holding a small lit fuse makiwara, traditional Japanese house shimenawa rope in background. Foreground: scattered shogi pieces and burning ema wooden plaque. Background: vertical sumi ink splatter, gold dust, traditional Japanese kanji stamp "爆" (explosion). Colors: shu vermilion red, sumi ink black, gold ochre, washi cream. Composition: cat centered in lower-right, explosion swirls upward to top-left, 30% empty washi paper space in upper-left corner.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'defuse',
    label: '拆解',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a kind old Japanese swordsmith master (kaji) in traditional indigo-dyed hanten coat, calmly holding pliers and a wrench, taming a hissing cursed cat yokai with a gentle hand. The cat is restrained with rope, looking impish. Tools: bamboo-handled pliers, kanna plane, nokogiri saw. Background: green bamboo grove with sumi ink wind lines. Colors: bamboo green (uguisu-500), indigo (kon-700), sumi ink, washi cream. Composition: master on left, restrained cat on right, tools floating between them. Small stamp: "解" in green seal.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'attack',
    label: '攻击 / 闪电符',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: two cats tumbling mid-air as a giant jagged blue-white lightning bolt strikes between them. Foreground: shimenawa rope with shide paper zigzags burning. Background: Raijin thunder god's face emerging in dark stylized clouds, holding drum taiko. A lone cat-samurai prepares to strike with bokken wooden sword. Dynamic ink-line motion. Colors: gunjo indigo blue, white lightning, washi cream, sumi black. Composition: lightning bolt vertical center, two cats flanking at top. Stamp: "双" or "撃" small kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'targeted-attack',
    label: '精准攻击',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a focused feline samurai archer (neko samurai) drawing a yumi longbow, single arrow aimed off-frame. Background: rising sun vermilion sun flag, distant torii gate silhouette. Charred target boards stack at lower right. A target reticle as red sumi circle hovers in upper-right corner. Colors: shu vermilion, gunjo blue (bow wrap), sumi ink. Composition: archer centered, arrow points to upper-right where target reticle floats. Negative space behind archer. Stamp: "狙" small kanji seal.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'skip',
    label: '跳过 / 阻断',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a small cat yokai sitting zen-like in meditative pose (lotus) with eyes closed peacefully, surrounded by a luminous barrier ofuda paper talismans arranged in concentric rings. Behind: a single sumi ink circle void. Foreground: a player cat trying to push but halted by invisible wall, paws flat on barrier. Colors: washi cream, gunjo blue (talisman), shu red (border seal), sumi ink. Composition: meditating cat centered, player cat smaller upper-right. Stamp: "停" small kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'favor',
    label: '求赠 / 礼贡',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a mysterious refined cat wearing a tiny eboshi hat and kariginu ceremonial robe, ceremoniously offering a wrapped furoshiki gift bundle. Behind: a shy/suspicious cat looking sideways. Gifts: small sakura blossoms trail floating, hinting at hidden contents. Composition: giver on left, smaller receiver on right, gift bundle bridges them. Colors: sakura pink, sumi ink, gold ochre, washi cream. Stamp: "贈" small kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'shuffle',
    label: '洗牌 / 翻弄',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: Fujin wind god mask face in upper-left exhaling swirling wind lines (suminagashi ink spirals), scattering a deck of uchiwa fans and origami cranes through the air across the whole canvas. Three cat paws reaching up trying to catch them. Wind spirals in blue-sumigashi ink. Colors: gunjo blue, sumi ink, sakura accents. Composition: Fujin upper-left, debris filling middle, paws at lower-right edge. Stamp: "風" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'peek',
    label: '预知未来 / 三眼',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a fortune-telling nekomata (two-tailed cat) with a third eye opening on its forehead, peering into a bronze hand mirror (kagami) showing three glowing tarot-card-style cat faces within. Surrounding: mokugyo wooden beads floating. Background: crescent moon, scrolls, dream clouds. Colors: gunjo blue (mirror), silver-gray (moon), gold ochre (beads), sumi ink. Composition: cat eye-line draws down to mirror in lower-right; three cat faces visible inside mirror. Stamp: "視" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'nope',
    label: '否认 / 朱印',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Subject: a giant red shu vermilion seal stamp (hanko) slamming down with kanji "否" (NO) in white-on-red, accompanied by a cat yokai swiping its paw to push away a faint ghost card escaping. Speed lines radiate outward from stamp impact point. Background: white washi paper with subtle gold borders. Colors: dominant shu vermilion red, white, gold. Composition: red stamp takes 60% of upper-left area, cat paw lower-right. Stamp (additional): "退" small kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  /* 普通 5 花色 */
  {
    id: 'plain-melon',
    label: '西瓜猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Single cat yokai centered, front 3/4 view, no background beyond washi paper. A round jolly green-and-white striped cat cradling a huge cut watermelon slice, juice dripping, summer uchiwa fan behind. Colors: matcha green, watermelon red, sumi black seeds, washi cream. Stamp: "瓜" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'plain-potato',
    label: '土豆猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Single cat yokai centered, front 3/4 view. A scruffy brown tabby cat wearing a bandana, holding a steaming baked sweet potato on bamboo leaves, embers glowing at its feet. Colors: brown sumi, burnt orange heat, washi cream, ember gold. Stamp: "芋" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'plain-rainbow',
    label: '彩虹猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Single cat yokai centered, front 3/4 view. A magical long-haired cat with multi-colored fur stripes (rainbow band), standing on a gold bridge amid arcing rainbow ribbons, furin glass wind chimes hanging from ears. Colors: spectrum bands, gold, sumi ink. Stamp: "虹" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'plain-fuzzy',
    label: '毛球猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Single cat yokai centered, front 3/4 view. A small fluffy kitten tangled in pink and white wool yarn, knitting needles stuck in fluff, half-knitted sock dangling. Sakura petals scattered in background. Colors: sakura pink, cream white, sumi outlines. Stamp: "毛" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
  {
    id: 'plain-beard',
    label: '胡子猫',
    size: { w: 560, h: 784 },
    prompt: `${COMMON_PREFIX}. Single cat yokai centered, front 3/4 view. An elderly grandpa-cat with bushy white whiskers and a long white beard, wearing round glasses and a bowler-like kasa hat, smoking a kiseru pipe with curling blue smoke, sitting on tatami mat. Colors: washi cream, sumi ink, gunjo blue smoke, gold-trimmed hat. Stamp: "髭" kanji.`,
    negative: FULL_CARD_NEGATIVE,
  },
];

/* ---------- 7 个角色头像(256×256 透明 PNG) ---------- */

const CHARACTERS = [
  {
    id: 'none',
    label: '路人',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Head-and-shoulders portrait of a modest merchant-class Japanese woman with simple indigo kosode, hair tied in low chignon, neutral expression looking slightly upward, washi cream background. Stamp: "凡" small kanji seal at lower-right. Colors: indigo, sumi ink, washi cream, faint sakura blush on cheeks.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'echo-mage',
    label: '回响法师',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a powerful onmyoji-style mage cat with long flowing robes, holding a gofu shakujiao staff, three concentric rings of glowing magic circles radiating behind head like a halo, mystical cat-slit eyes glowing shu vermilion. Stamp: "響" small kanji. Colors: deep gunjo, shu red, gold, sumi ink.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'oracle',
    label: '预言家',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a blindfolded mystic cat in white and cream priestess robes, third eye visible on forehead, holding a crystal ball (suishou) with floating cat constellation inside. Stamp: "視" small kanji. Colors: washi cream, gunjo blue, sakura pink crystals, sumi.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'knight',
    label: '铁壁骑士',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a stoic samurai cat wearing full ōyoroi great armor with green cords, holding a naginata polearm, a giant war fan (gunbai) behind as shield, iron expression. Stamp: "鉄" kanji. Colors: uguisu green, sumi armor black, gold accents, washi cream.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'phantom-thief',
    label: '怪盗基德',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a sly thief cat wearing an eboshi hat tilted to one side, half-mask across face, monokuro checkered kimono (ishitsumi cat-print), holding a tiny gold key and a folding fan. Smirking expression. Stamp: "怪" kanji. Colors: sumi black & white, gold key, sakura lining.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'alchemist',
    label: '炼金术士',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a scholar cat with round rim-eyes (tortoiseshell frame), wearing deep teal kariginu robe, holding a swirling alembic flask emitting phosphorescent mist, behind: hexagram alchemy sigil floating. Stamp: "錬" kanji. Colors: teal green, gunjo blue, sakura mist, sumi ink.`,
    negative: COMMON_NEGATIVE,
  },
  {
    id: 'lucky-cat',
    label: '幸运绒球',
    size: { w: 512, h: 512 },
    prompt: `${COMMON_PREFIX}. Portrait of a chubby calico cat (三毛) with one paw raised beckoning (maneki-neko gesture), wearing a red bib with gold koban coin, bell on collar. Lucky sparkles (starburst) and sakura around. Smiling wide. Stamp: "福" kanji. Colors: cream calico (orange-white-black), shu red, gold, sakura.`,
    negative: COMMON_NEGATIVE,
  },
];

/* ---------- 3 张页面背景(1920×1080 JPG) ---------- */

const BACKGROUNDS = [
  {
    id: 'login-bg',
    label: '登录页',
    out: 'jpg',
    size: { w: 1280, h: 720 },
    prompt: `${COMMON_PREFIX}. Wide cinematic scene: Japanese Edo-era hilltop shrine at twilight, torii gate silhouetted against warm dusk sky, sakura trees in mid bloom on either side, paper lanterns lit at lower-left, distant village below misted valley, ascending flock of crows. Style: classical Hiroshige landscape meets modern cinematic light grading. Slight glow at upper-center (warm amber). Colors: dusk sakura pink, gunjo blue sky, warm amber, sumi ink silhouettes. Atmospheric depth and haze.`,
    negative: COMMON_NEGATIVE + ', flat illustration, modern architecture',
  },
  {
    id: 'lobby-bg',
    label: '大厅页',
    out: 'jpg',
    size: { w: 1280, h: 720 },
    prompt: `${COMMON_PREFIX}. Interior of a bustling Edo-period teahouse tatami room with paper shoji screens, hanging noren curtains with cat-mon emblem, low table center with scattered uchiwa fans and cats lounging, paper lanterns glowing warm, autumn maple visible through shoji slits. Colors: warm amber light, sumi ink, sakura accents, gold lanterns.`,
    negative: COMMON_NEGATIVE + ', bright daylight, modern interior',
  },
  {
    id: 'room-bg',
    label: '房间等待室',
    out: 'jpg',
    size: { w: 1280, h: 720 },
    prompt: `${COMMON_PREFIX}. Scene of a serene Japanese garden at morning with koi pond, stone lantern, stepping stones crossing water, distant pagoda, cherry petals drifting. Soft gold-glow at top center (sunrise). Tranquil mood. Colors: pale gold morning light, sumi ink silhouettes, pale sakura, koi orange-red dots.`,
    negative: COMMON_NEGATIVE + ', dark mood, dramatic lighting',
  },
];

module.exports = { CARDS, CHARACTERS, BACKGROUNDS };
