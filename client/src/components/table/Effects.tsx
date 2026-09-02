import { AnimatePresence, motion } from 'motion/react';

/** 爆炸白闪（80ms） */
export function FlashOverlay({ boomKey }: { boomKey: number }) {
  return (
    <AnimatePresence>
      {boomKey > 0 && (
        <motion.div
          key={boomKey}
          className="flash-overlay"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </AnimatePresence>
  );
}

/** 回合切换横幅（400ms 入 / 800ms 停 / 300ms 出） */
export function TurnBanner({ text, gold }: { text: string | null; gold: boolean }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text + String(gold)}
          className={`turn-banner ${gold ? 'is-gold' : ''}`}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 爆炸公告（谁炸了） */
export function BoomBanner({ name }: { name: string | null }) {
  return (
    <AnimatePresence>
      {name && (
        <motion.div
          key={name}
          className="boom-banner"
          initial={{ opacity: 0, scale: 1.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ pointerEvents: 'none' }}
        >
          <span className="boom-icon">💥</span>
          <span>{name} 爆炸出局！</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 偷牌等事件的浮动提示 */
export function EventToast({ text, id }: { text: string | null; id: number }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={id}
          className="event-toast"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
