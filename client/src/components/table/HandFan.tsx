import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';
import { useI18n } from '../../i18n';

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

const SPRING = { type: 'spring', stiffness: 320, damping: 28 } as const;

/**
 * 手牌扇：居中、按张数自动重叠，带轻微弧度。
 * - 重叠量由 CSS 计算（`--n` + 卡宽 `--hand-w`，见 theme.css 的 .fan-card），容器宽度变化时自适应
 * - 每张牌按离中心的距离旋转（最多 ±8°）并沿弧线下沉
 * - 悬停/选中：摆正、抬起、置顶
 */
function HandFanInner({ cards, interactive, selected, playable, onCardClick, masked, mustPlayIid }: Props) {
  const { t } = useI18n();
  const n = cards.length;
  const mid = (n - 1) / 2;
  // 张数越多弧度越平：总张角不超过 16°（最外侧 ±8°，旋转后的外包框不越出手牌区）
  const step = n > 1 ? Math.min(3, 16 / (n - 1)) : 0;

  return (
    <div className="handfan" style={{ ['--n' as string]: Math.max(n, 1) }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((card, i) => {
          const isSel = selected.includes(card.instanceId);
          const isMust = mustPlayIid === card.instanceId;
          // 覆盖期间不显示"可打出"光晕（光晕会泄露牌种）；猪王必出牌例外
          const isPlayable = interactive && (isMust || (!masked && playable.has(card.instanceId)));
          const off = i - mid;
          const rotate = isSel ? 0 : off * step;
          const sink = isSel ? -34 : Math.abs(off) * Math.abs(off) * step * 0.25;
          return (
            <motion.div
              key={card.instanceId}
              className={`fan-card ${isSel ? 'is-selected' : ''}`}
              layout
              initial={{ opacity: 0, y: 90, rotate: 0 }}
              animate={{ opacity: 1, y: sink, rotate }}
              exit={{ opacity: 0, y: -110, scale: 0.6 }}
              whileHover={interactive ? { y: isSel ? -46 : -26, rotate: 0, scale: 1.06 } : undefined}
              transition={SPRING}
              style={{ zIndex: isSel ? 40 + i : i }}
            >
              <CardView
                def={card.def}
                size="hand"
                selected={isSel}
                glow={isPlayable}
                masked={masked}
                onClick={interactive ? () => onCardClick(card) : undefined}
              />
              {isMust && <span className="must-play-badge">🐷{t('table.mustPlay')}</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {n === 0 && <div className="handfan-empty">{t('table.handEmpty')}</div>}
    </div>
  );
}

export const HandFan = memo(HandFanInner);
