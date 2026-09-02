import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

export interface StageShow {
  /** 唯一 id（用 lastPlayAt） */
  id: number;
  byName: string;
  cards: CardDef[];
  noped: boolean;
  /** 否认窗口进行中（持续展示 + 倒计时秒数） */
  countdown?: number;
}

/**
 * 中央出牌舞台（四段演出：飞入 → 停留展示"谁打了什么牌" → （被否认盖 NOPE 章）→ 飞出）。
 * 调研参数：飞入 450ms ease-out、放大 1.6x；NOPE 盖章 scale 1.6→1 rotate -6° 250ms。
 */
export function Stage({ show }: { show: StageShow | null }) {
  return (
    <div className="stage">
      <AnimatePresence>
        {show && (
          <motion.div
            key={show.id}
            className="stage-inner"
            initial={{ opacity: 0, y: -140, scale: 0.55, rotate: -8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, x: 420, scale: 0.4, rotate: 20 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 26,
            }}
          >
            <div className="stage-cards">
              {show.cards.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -60 * (i + 1), rotate: -20 }}
                  animate={{ opacity: 1, x: i * 26, rotate: (i - (show.cards.length - 1) / 2) * 8 }}
                  transition={{ delay: 0.06 * i, type: 'spring', stiffness: 320, damping: 22 }}
                  style={{ zIndex: i }}
                >
                  <CardView def={c} size="stage" />
                </motion.div>
              ))}
            </div>
            <div className="stage-caption">
              <span className="stage-by">{show.byName}</span> 打出
            </div>
            {show.noped && (
              <motion.div
                className="nope-stamp"
                initial={{ scale: 1.6, rotate: -6, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                NOPE!
              </motion.div>
            )}
            {show.countdown !== undefined && show.countdown > 0 && (
              <div className="stage-countdown">{show.countdown}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
