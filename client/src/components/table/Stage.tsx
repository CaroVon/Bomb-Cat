import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

export interface StageShow {
  /** 唯一 id（用 lastPlayAt） */
  id: number;
  byName: string;
  cards: CardDef[];
  noped: boolean;
  /** 目标型效果的目标名（"→ 🎯谁"） */
  targetName?: string;
  /** 否认窗口截止时间（进行中持续展示 + 倒计时秒数；内部自计时） */
  countdownEndsAt?: number;
}

/** 自计时秒数（只在挂载期间 tick，不牵动父组件） */
function CountdownSeconds({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (sec <= 0) return null;
  return <div className="stage-countdown">{sec}</div>;
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
              {show.targetName && (
                <>
                  {' → '}
                  <span className="stage-target">🎯{show.targetName}</span>
                </>
              )}
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
            {show.countdownEndsAt !== undefined && show.countdownEndsAt > 0 && (
              <CountdownSeconds endsAt={show.countdownEndsAt} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
