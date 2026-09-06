import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BUILTIN_CHARACTER_MAP, CHARACTER_RPG } from '@bombcat/shared';

export interface TableSeatData {
  sessionId: string;
  name: string;
  characterId: string;
  handCount: number;
  alive: boolean;
  connected: boolean;
  turnsLeft: number;
}

interface Props {
  seat: TableSeatData;
  isCurrent: boolean;
  bounced?: boolean;
  timer?: number | null;
  emote?: { emoji: string; id: number } | null;
  /** 座位位置（相对于桌面容器） */
  position: { top?: string; left?: string; right?: string; bottom?: string };
}

/**
 * 牌桌座位：大号角色立绘 + 玩家信息 + 状态。
 * 替代原 seat-v2 的小圆头像，用真实角色图片做视觉锚点。
 */
function TableSeatInner({ seat, isCurrent, bounced, timer, emote, position }: Props) {
  const char = BUILTIN_CHARACTER_MAP.get(seat.characterId);
  const rpg = CHARACTER_RPG[seat.characterId] ?? CHARACTER_RPG['none']!;
  const themeColor = rpg.themeColor;
  const portraitUrl = `/assets/characters/${seat.characterId || 'none'}.jpg`;

  return (
    <div
      className={`table-seat ${isCurrent ? 'is-current' : ''} ${!seat.alive ? 'is-dead' : ''} ${bounced ? 'is-bounced' : ''}`}
      style={{ ...position, ['--theme' as string]: themeColor }}
    >
      {/* 角色立绘框 */}
      <div className="table-seat-portrait" style={{ borderColor: themeColor }}>
        <div
          className="table-seat-img"
          style={{ backgroundImage: `url(${portraitUrl})` }}
        />
        {!seat.alive && (
          <div className="table-seat-dead-overlay">
            <span>💀</span>
          </div>
        )}
        {isCurrent && seat.alive && <div className="table-seat-turn-glow" />}
        {timer != null && timer > 0 && seat.alive && (
          <span className={`table-seat-timer ${timer <= 10 ? 'is-urgent' : ''}`}>
            {timer}
          </span>
        )}
      </div>

      {/* 信息条 */}
      <div className="table-seat-info">
        <span className="table-seat-name">{seat.name}</span>
        <span className="table-seat-char" style={{ color: themeColor }}>
          {char?.name ?? '路人'}
        </span>
        <div className="table-seat-meta">
          {seat.alive ? (
            <>
              <span title="手牌数">🂠 {seat.handCount}</span>
              {seat.turnsLeft > 1 && (
                <span className="table-seat-combo">⚡{seat.turnsLeft}</span>
              )}
            </>
          ) : (
            <span className="table-seat-out">出局</span>
          )}
          {!seat.connected && seat.alive && <span className="table-seat-offline">掉线</span>}
        </div>
      </div>

      {/* 表情气泡 */}
      <AnimatePresence>
        {emote && (
          <motion.div
            key={emote.id}
            className="table-seat-emote"
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

export const TableSeat = memo(TableSeatInner);

/**
 * 根据对手数量计算椭圆桌面上的座位分布位置。
 * 自己固定在底部中央（手牌区上方），对手围绕上方半圆分布。
 */
export function getSeatPositions(opponentCount: number): Array<{ top?: string; left?: string; right?: string }> {
  switch (opponentCount) {
    case 1:
      // 1 对手：正上方
      return [{ top: '0%', left: '50%', right: 'auto' }];
    case 2:
      // 2 对手：左上、右上
      return [
        { top: '0%', left: '20%' },
        { top: '0%', left: '80%' },
      ];
    case 3:
      // 3 对手：左、中上、右
      return [
        { top: '10%', left: '8%' },
        { top: '0%', left: '50%' },
        { top: '10%', left: '92%' },
      ];
    case 4:
      // 4 对手：左下、左上、右上、右下
      return [
        { top: '30%', left: '5%' },
        { top: '0%', left: '25%' },
        { top: '0%', left: '75%' },
        { top: '30%', left: '95%' },
      ];
    case 5:
      // 5 对手：左下、左、中上、右、右下
      return [
        { top: '35%', left: '3%' },
        { top: '0%', left: '15%' },
        { top: '0%', left: '50%' },
        { top: '0%', left: '85%' },
        { top: '35%', left: '97%' },
      ];
    case 6:
      // 6 对手：左下、左中、左上、右上、右中、右下
      return [
        { top: '40%', left: '2%' },
        { top: '10%', left: '10%' },
        { top: '0%', left: '30%' },
        { top: '0%', left: '70%' },
        { top: '10%', left: '90%' },
        { top: '40%', left: '98%' },
      ];
    case 7:
    default:
      // 7 对手（最大值）：围绕上方半圆均匀分布
      return [
        { top: '45%', left: '1%' },
        { top: '20%', left: '8%' },
        { top: '0%', left: '22%' },
        { top: '0%', left: '50%' },
        { top: '0%', left: '78%' },
        { top: '20%', left: '92%' },
        { top: '45%', left: '99%' },
      ];
  }
}
