import { memo } from 'react';
import type { CardDef } from '@bombcat/shared';

let skinMap: Record<string, string> = {};
export function setSkinMap(map: Record<string, string>): void {
  skinMap = map;
}

interface Props {
  def: CardDef | undefined;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  style?: React.CSSProperties;
}

function CardViewInner({ def, faceDown, selected, onClick, small, style }: Props) {
  if (faceDown || !def) {
    return (
      <div
        className={`card back ${small ? 'small' : ''} ${selected ? 'selected' : ''}`}
        onClick={onClick}
        style={style}
      />
    );
  }
  const skin = skinMap[def.id];
  return (
    <div
      className={[
        'card',
        small ? 'small' : '',
        selected ? 'selected' : '',
        skin ? 'skin' : '',
      ].join(' ')}
      onClick={onClick}
      style={{ ...(skin ? { backgroundImage: `url(${skin})` } : {}), ...style }}
      title={def.description}
    >
      <span className="emoji">{def.emoji}</span>
      <span className="card-name">{def.name}</span>
    </div>
  );
}

export const CardView = memo(CardViewInner);
