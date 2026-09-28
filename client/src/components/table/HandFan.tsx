import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

export interface FanCard {
  instanceId: string;
  def: CardDef;
}

interface Props {
  cards: FanCard[];
  interactive: boolean;
  selected: string[];
  playable: Set<string>;
  onCardClick: (card: FanCard) => void;
  /** 大香蕉之怒覆盖期间隐藏真实卡名/卡面 */
  masked?: boolean;
  /** 猪王消化完成必须打出/丢弃的牌（高亮 + 角标） */
  mustPlayIid?: string;
}

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

/**
 * 手牌区：水平排布。
 * - 卡牌不旋转、不缩放，简单排列
 * - 牌多时容器可横向滚动（scrollbar 半透明）
 * - 选中/悬停时向上抬起
 */
function HandFanInner({ cards, interactive, selected, playable, onCardClick, masked, mustPlayIid }: Props) {
  const n = cards.length;

  return (
    <div
      className="handfan"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: n > 0 ? 'flex-start' : 'center',
        gap: n > 10 ? 2 : n > 7 ? 4 : 8,
        paddingTop: 52, // 给选中/悬停抬升留空间（overflow 裁剪）
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((card, i) => {
          const isSel = selected.includes(card.instanceId);
          const isMust = mustPlayIid === card.instanceId;
          // 覆盖期间不显示"可打出"光晕（光晕会泄露牌种）；猪王必出牌例外
          const isPlayable = interactive && (isMust || (!masked && playable.has(card.instanceId)));
          return (
            <motion.div
              key={card.instanceId}
              layout
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: isSel ? -32 : 0 }}
              exit={{ opacity: 0, y: -100, scale: 0.5 }}
              whileHover={interactive ? { y: isSel ? -44 : -18 } : undefined}
              transition={SPRING}
              style={{ zIndex: i, position: 'relative', flexShrink: 0 }}
            >
              <CardView
                def={card.def}
                size="hand"
                selected={isSel}
                glow={isPlayable}
                masked={masked}
                onClick={interactive ? () => onCardClick(card) : undefined}
              />
              {isMust && <span className="must-play-badge">🐷必出</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {n === 0 && <div className="handfan-empty">（手牌空空如也）</div>}
    </div>
  );
}

export const HandFan = memo(HandFanInner);
