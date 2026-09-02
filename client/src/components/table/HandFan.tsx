import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

export interface FanCard {
  instanceId: string;
  def: CardDef;
  /** 出牌后飞向弃牌堆的退场方向 */
  exitTo?: number;
}

interface Props {
  cards: FanCard[];
  /** 允许交互（我的回合且可行动） */
  interactive: boolean;
  selected: string[];
  /** 可以打出的卡 instanceId 集合（发光提示） */
  playable: Set<string>;
  onCardClick: (card: FanCard) => void;
}

const CARD_W = 128;
const SPRING = { type: 'spring', stiffness: 260, damping: 24 } as const;

/**
 * 炉石式扇形手牌：
 * - 角度：中间 0° 向两侧步进，总开角 clamp ±40°（每张 ≤10°）
 * - 抛物线下沉：y = |i-mid|² × 6
 * - transform-origin: center 120%（枢轴在牌下方，弧线自然）
 * - 悬停抬升 44px + 放大 1.1 + z 置顶；重排 spring 补位
 */
export function HandFan({ cards, interactive, selected, playable, onCardClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = cards.length;
  const mid = (n - 1) / 2;
  const spacing = n > 1 ? Math.min(88, Math.max(44, (width - CARD_W - 40) / (n - 1))) : 0;
  const step = Math.min(10, 40 / Math.max(mid, 1));

  return (
    <div className="handfan" ref={ref}>
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((card, i) => {
          const off = i - mid;
          const angle = off * step;
          const y = off * off * 7;
          const x = off * spacing;
          const isSel = selected.includes(card.instanceId);
          const isPlayable = interactive && playable.has(card.instanceId);
          return (
            <motion.div
              key={card.instanceId}
              layout
              initial={{ opacity: 0, y: 260, rotate: -18, scale: 0.7 }}
              animate={{
                opacity: 1,
                x,
                y: isSel ? y - 56 : y,
                rotate: angle,
                scale: isSel ? 1.08 : 1,
              }}
              exit={{ opacity: 0, y: -200, scale: 0.5, rotate: angle + 14 }}
              whileHover={
                interactive
                  ? { y: y - 44, scale: 1.12, rotate: angle * 0.4, zIndex: 90 }
                  : undefined
              }
              transition={SPRING}
              style={{ zIndex: i, transformOrigin: 'center 120%' }}
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
