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

interface Props {
  def: CardDef | undefined;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
  /** 可打出/可交互时的金色发光 */
  glow?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function CardViewInner({
  def,
  size = 'hand',
  faceDown,
  selected,
  glow,
  onClick,
  style,
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
  const frame = KIND_FRAME[def.kind] ?? KIND_FRAME.action!;

  return (
    <div
      className={[
        'pcard',
        size,
        selected ? 'is-selected' : '',
        glow ? 'is-glow' : '',
        onClick ? 'is-clickable' : '',
      ].join(' ')}
      onClick={onClick}
      style={{
        backgroundImage: frame,
        ...(skin ? { ['--skin' as string]: `url(${skin})` } : {}),
        ...style,
      }}
      title={def.description}
    >
      <div className="pcard-face">
        <div className="pcard-art">
          <span className="pcard-emoji">{def.emoji}</span>
        </div>
        <div className="pcard-name">{def.name}</div>
      </div>
    </div>
  );
}

export const CardView = memo(CardViewInner);
