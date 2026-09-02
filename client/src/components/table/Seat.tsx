import { memo } from 'react';

export interface SeatData {
  sessionId: string;
  name: string;
  characterId: string;
  handCount: number;
  alive: boolean;
  connected: boolean;
  turnsLeft: number;
}

interface Props {
  seat: SeatData;
  isCurrent: boolean;
  /** 刚出过牌时头像弹跳 */
  bounced?: boolean;
  emoji: string;
}

function SeatInner({ seat, isCurrent, bounced, emoji }: Props) {
  return (
    <div
      className={[
        'seat-v2',
        isCurrent ? 'is-current' : '',
        !seat.alive ? 'is-dead' : '',
        bounced ? 'is-bounced' : '',
      ].join(' ')}
    >
      <div className="seat-avatar">
        <span className="seat-emoji">{emoji}</span>
        {!seat.alive && <span className="seat-skull">💀</span>}
        {isCurrent && seat.alive && <span className="seat-marker">▼</span>}
      </div>
      <div className="seat-meta">
        <span className="seat-name">{seat.name}</span>
        <span className="seat-sub">
          {seat.alive ? (
            <>
              <span className="seat-handcount" title="手牌数">🂠 {seat.handCount}</span>
              {seat.turnsLeft > 1 && (
                <span className="seat-combo" title={`连击 ${seat.turnsLeft} 回合`}>⚡{seat.turnsLeft}</span>
              )}
            </>
          ) : (
            <span className="seat-out">出局</span>
          )}
          {!seat.connected && seat.alive && <span className="seat-offline">掉线</span>}
        </span>
      </div>
    </div>
  );
}

export const Seat = memo(SeatInner);
