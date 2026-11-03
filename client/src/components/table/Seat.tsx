import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { portraitUrl } from '../../lib/portraits';

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
  /** 当前回合剩余秒数（null=不显示） */
  timer?: number | null;
  /** 表情气泡 */
  emote?: { emoji: string; id: number } | null;
}

function SeatInner({ seat, isCurrent, bounced, emoji, timer, emote }: Props) {
  const avatarUrl = portraitUrl(seat.characterId);
  return (
    <div
      className={[
        'seat-v2',
        isCurrent ? 'is-current' : '',
        !seat.alive ? 'is-dead' : '',
        bounced ? 'is-bounced' : '',
      ].join(' ')}
      data-seat={seat.sessionId}
    >
      <div
        className="seat-avatar"
        style={{ ['--avatar' as string]: `url(${avatarUrl})` }}
      >
        <span className="seat-emoji" style={{ display: 'none' }}>{emoji}</span>
        {!seat.alive && <span className="seat-skull">💀</span>}
        {isCurrent && seat.alive && <span className="seat-marker">▼</span>}
        {timer != null && timer > 0 && seat.alive && (
          <span className={`seat-timer ${timer <= 10 ? 'is-urgent' : ''}`}>{timer}</span>
        )}
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
      <AnimatePresence>
        {emote && (
          <motion.div
            key={emote.id}
            className="seat-emote"
            initial={{ opacity: 0, scale: 0.4, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: -14 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          >
            {emote.emoji}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const Seat = memo(SeatInner);
