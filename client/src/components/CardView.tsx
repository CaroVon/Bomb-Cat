import { memo } from 'react';
import { cardText, type CardDef } from '@bombcat/shared';
import { useI18n } from '../i18n';

export type CardSize = 'hand' | 'stage' | 'mini' | 'tiny';

let skinMap: Record<string, string> = {};
export function setSkinMap(map: Record<string, string>): void {
  skinMap = map;
}

const KIND_FRAME: Record<string, string> = {
  // 浮世绘配色：朱（爆炸）/ 松（拆解）/ 藍（功能）/ 金（普通猫）
  exploding: 'linear-gradient(160deg,#5c1410,#c03028 45%,#5c1410)',
  defuse: 'linear-gradient(160deg,#1e2e1c,#5f8a52 45%,#1e2e1c)',
  action: 'linear-gradient(160deg,#142a46,#3f6fa8 45%,#142a46)',
  plain: 'linear-gradient(160deg,#4a3a18,#c6a14a 45%,#4a3a18)',
  // 懒懒羊梦境牌：靛紫梦幻
  dream: 'linear-gradient(160deg,#2a1f4a,#8f7bd6 45%,#2a1f4a)',
};

/** 香蕉覆盖期间统一边框：不按真实牌种着色，杜绝"看边框猜牌" */
const BANANA_FRAME = 'linear-gradient(160deg,#4a3a0a,#e5b809 45%,#4a3a0a)';

interface Props {
  def: CardDef | undefined;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
  /** 可打出/可交互时的金色发光 */
  glow?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  /** 大香蕉之怒覆盖期间：隐藏真实卡名/卡面（逻辑仍用真实 def） */
  masked?: boolean;
}

function CardViewInner({
  def,
  size = 'hand',
  faceDown,
  selected,
  glow,
  onClick,
  style,
  masked,
}: Props) {
  const { lang, t } = useI18n();
  if (faceDown || !def) {
    return (
      <div
        className={`pcard pcard-back ${size} ${selected ? 'is-selected' : ''}`}
        onClick={onClick}
        style={style}
      />
    );
  }

  const skin = skinMap[def.id];
  // 个别卡面的素材路径与卡 id 不同（如爆炸苹果用角色素材）
  const SKIN_OVERRIDE: Record<string, string> = {
    'exploding-apple': '/assets/characters/evil_apple.jpg',
  };
  // 内置卡 fallback:指向 scripts/gen-assets 生成的图(jpg|webp|png 自动 sniff)
  const defaultSkin = SKIN_OVERRIDE[def.id] ?? (def.id === 'exploding' || def.id === 'defuse' || def.id === 'attack' ||
    def.id === 'skip' || def.id === 'favor' ||
    def.id === 'shuffle' || def.id === 'peek' || def.id === 'nope' ||
    def.id.startsWith('plain-')
    ? `/assets/cards/front/${def.id}.jpg`
    : null);
  const skinUrl = skin || defaultSkin;
  const frame = masked ? BANANA_FRAME : (KIND_FRAME[def.kind] ?? KIND_FRAME.action!);
  const bananaSkin = '/assets/characters/angry_banana.jpg';
  const text = cardText(def, lang);

  return (
    <div
      className={[
        'pcard',
        size,
        selected ? 'is-selected' : '',
        glow && !masked ? 'is-glow' : '',
        onClick ? 'is-clickable' : '',
        masked ? 'is-masked' : '',
        def.kind === 'dream' && !masked ? 'is-dream' : '',
      ].join(' ')}
      onClick={onClick}
      style={{
        backgroundImage: frame,
        ...(skinUrl && !masked ? { ['--skin' as string]: `url(${skinUrl})` } : {}),
        ...(masked ? { ['--skin' as string]: `url(${bananaSkin})` } : {}),
        ...style,
      }}
      title={masked ? t('card.maskedTitle') : text.description}
    >
      <div className="pcard-face">
        <div className="pcard-art">
          <span className="pcard-emoji">{masked ? '🍌' : def.emoji}</span>
        </div>
        <div className="pcard-name">{masked ? t('card.maskedName') : text.name}</div>
      </div>
    </div>
  );
}

export const CardView = memo(CardViewInner);
