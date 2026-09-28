import { memo } from 'react';
import type { CardDef } from '@bombcat/shared';

export type CardSize = 'hand' | 'stage' | 'mini' | 'tiny';

let skinMap: Record<string, string> = {};
export function setSkinMap(map: Record<string, string>): void {
  skinMap = map;
}

const KIND_FRAME: Record<string, string> = {
  exploding: 'linear-gradient(160deg,#7f1d1d,#ef4444 45%,#7f1d1d)',
  defuse: 'linear-gradient(160deg,#14532d,#22c55e 45%,#14532d)',
  action: 'linear-gradient(160deg,#1e3a5f,#4a90c2 45%,#1e3a5f)',
  plain: 'linear-gradient(160deg,#4a3f1e,#c9a54e 45%,#4a3f1e)',
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

  return (
    <div
      className={[
        'pcard',
        size,
        selected ? 'is-selected' : '',
        glow && !masked ? 'is-glow' : '',
        onClick ? 'is-clickable' : '',
        masked ? 'is-masked' : '',
      ].join(' ')}
      onClick={onClick}
      style={{
        backgroundImage: frame,
        ...(skinUrl && !masked ? { ['--skin' as string]: `url(${skinUrl})` } : {}),
        ...(masked ? { ['--skin' as string]: `url(${bananaSkin})` } : {}),
        ...style,
      }}
      title={masked ? '🍌 大香蕉之怒覆盖中……' : def.description}
    >
      <div className="pcard-face">
        <div className="pcard-art">
          <span className="pcard-emoji">{masked ? '🍌' : def.emoji}</span>
        </div>
        <div className="pcard-name">{masked ? '香蕉' : def.name}</div>
      </div>
    </div>
  );
}

export const CardView = memo(CardViewInner);
