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
  interactive: boolean;
  selected: string[];
  playable: Set<string>;
  onCardClick: (card: FanCard) => void;
}

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;
const CARD_ASPECT = 7 / 5; // 5:7

/**
 * 炉石式扇形手牌（溢出完全防护版 v3）。
 *
 * 全部计算在 JS 内完成（不依赖 CSS 变量避免循环依赖）：
 * 1. 读取容器实际宽度 & 当前 CSS 断点的基础卡宽
 * 2. 计算旋转扩展（最外层卡旋转后 bounding box 增量）
 * 3. spacing = (可用宽 - 卡宽) / (n-1)，上限 88px
 * 4. 若 spacing < 24 → 按比例缩小卡宽直到 spacing ≥ 24（最低 48px）
 * 5. 若缩小后仍不够 → 允许 spacing 低至 16px（密集堆叠）
 */
export function HandFan({ cards, interactive, selected, playable, onCardClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [baseCardW, setBaseCardW] = useState(128);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let measureCount = 0;
    const measure = () => {
      setWidth(el.clientWidth);
      // 读取当前 CSS 断点下 .pcard.hand 的计算宽度，还原 shrink 得到基础宽
      const probe = el.querySelector<HTMLElement>('.pcard.hand');
      if (probe) {
        const w = probe.offsetWidth;
        const shrinkStr = el.style.getPropertyValue('--card-shrink') || '1';
        const shrinkVal = parseFloat(shrinkStr) || 1;
        setBaseCardW(Math.round(w / shrinkVal));
      }
      // 防振荡：连续 5 次测量后停止 ResizeObserver 回调中的状态更新
      // （布局已稳定）
      measureCount++;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cards.length]);

  const n = cards.length;
  const mid = (n - 1) / 2;

  // ---- 溢出防护计算 ----
  const safeMargin = 16;
  let cardW = baseCardW;
  let shrink = 1;

  // 总开角随牌数收紧
  const maxAngle = n <= 4 ? 38 : n <= 6 ? 32 : n <= 8 ? 26 : n <= 10 ? 22 : 18;
  const step = Math.min(10, maxAngle / Math.max(mid, 1));

  // 计算可用宽（扣除旋转扩展）
  const computeUsable = (cw: number): number => {
    const ch = cw * CARD_ASPECT;
    const maxAngleRad = ((step * mid) * Math.PI) / 180;
    const projected = cw * Math.cos(maxAngleRad) + ch * Math.sin(maxAngleRad);
    const expansion = Math.max(0, (projected - cw) / 2);
    return Math.max(120, width - safeMargin * 2 - expansion * 2);
  };

  let usable = computeUsable(cardW);
  let spacing = n > 1 ? Math.min(88, (usable - cardW) / (n - 1)) : 0;

  // 需要缩小卡牌
  if (spacing < 24 && n > 1) {
    // 目标：spacing = 24 时的最大卡宽
    const targetW = (usable - 24 * (n - 1)) / 1;
    shrink = Math.max(0.4, Math.min(1, targetW / baseCardW));
    cardW = Math.round(baseCardW * shrink);
    usable = computeUsable(cardW);
    spacing = Math.max(16, Math.min(88, (usable - cardW) / (n - 1)));
  }

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
          const y = off * off * 6;
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
                scale: isSel ? 1.06 : 1,
              }}
              exit={{ opacity: 0, x: x + 120, y: -160, rotate: angle + 25, scale: 0.5 }}
              whileHover={interactive ? { y: y - 44, scale: 1.1, rotate: angle * 0.3, zIndex: 90 } : undefined}
              transition={SPRING}
              style={{
                zIndex: i,
                transformOrigin: 'center 120%',
                position: 'absolute',
                bottom: 6,
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
