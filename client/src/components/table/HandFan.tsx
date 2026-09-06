import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

export interface FanCard {
  instanceId: string;
  def: CardDef;
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

const DEFAULT_CARD_W = 128;
const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;
const HOVER_SPRING = { type: 'spring', stiffness: 250, damping: 20 } as const;

/**
 * 炉石式扇形手牌：
 * - 角度：中间 0° 向两侧步进，总开角动态收紧（牌多时 ±24°，牌少时 ±40°）
 * - 抛物线下沉：y = |i-mid|² × 7
 * - transform-origin: center 120%（枢轴在牌下方，弧线自然）
 * - 溢出防护：spacing 无硬下限 + 牌多时自动缩小卡牌 + 总角度收紧
 * - 悬停 3D 倾斜视差（桌面端，rotateX/Y ±8°）+ 抬升放大
 */
export function HandFan({ cards, interactive, selected, playable, onCardClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [cardW, setCardW] = useState(DEFAULT_CARD_W);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setWidth(el.clientWidth);
      const card = el.querySelector<HTMLElement>('.pcard');
      if (card) setCardW(card.offsetWidth || DEFAULT_CARD_W);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cards.length]);

  const n = cards.length;
  const mid = (n - 1) / 2;

  // 溢出防护三重策略：
  // 1. spacing 无硬下限，按视口均分
  const spacing = n > 1 ? Math.min(88, Math.max(28, (width - cardW - 16) / (n - 1))) : 0;
  // 2. 牌多时收紧总开角（3 张 ±40° → 12+ 张 ±22°）
  const maxAngle = n <= 5 ? 40 : n <= 8 ? 32 : n <= 11 ? 26 : 22;
  const step = Math.min(10, maxAngle / Math.max(mid, 1));
  // 3. spacing 极窄时缩小卡牌（通过 CSS 变量 --card-shrink）
  const shrink = spacing < 42 ? Math.max(0.72, spacing / 58) : 1;

  return (
    <div
      className="handfan"
      ref={ref}
      style={{ ['--card-shrink' as string]: String(shrink) }}
    >
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
                scale: (isSel ? 1.08 : 1) * shrink,
              }}
              exit={{ opacity: 0, x: x + 120, y: -160, rotate: angle + 25, scale: 0.5 }}
              whileHover={
                interactive
                  ? {
                      y: y - 44,
                      scale: 1.12 * shrink,
                      rotate: angle * 0.3,
                      zIndex: 90,
                    }
                  : undefined
              }
              transition={SPRING}
              style={{
                zIndex: i,
                transformOrigin: 'center 120%',
                left: '50%',
                marginLeft: -cardW / 2,
              }}
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
