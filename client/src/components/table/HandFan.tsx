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
}

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

/**
 * 手牌区：水平排布。
 * - 卡牌不旋转、不缩放，简单排列
 * - 牌多时容器可横向滚动（scrollbar 半透明）
 * - 选中/悬停时向上抬起
 */
export function HandFan({ cards, interactive, selected, playable, onCardClick }: Props) {
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
          const isPlayable = interactive && playable.has(card.instanceId);
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
                onClick={interactive ? () => onCardClick(card) : undefined}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {n === 0 && <div className="handfan-empty">（手牌空空如也）</div>}
    </div>
  );
}
