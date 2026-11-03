import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDef } from '@bombcat/shared';
import { CardView } from '../CardView';

/* ---------------- 确定性种子随机（各端渲染一致的散乱堆） ---------------- */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 抽牌堆：整齐微差叠放 + 计数角标 */
export function DrawPile({ count }: { count: number }) {
  const layers = Math.min(5, Math.max(1, Math.ceil(count / 8)));
  return (
    <div className="pile-wrap">
      <div className="pile draw-pile" title={`牌堆剩余 ${count} 张`}>
        {count === 0 && <div className="pile-slot">空</div>}
        {count > 0 && Array.from({ length: layers }).map((_, i) => (
          <div
            key={i}
            className="pcard pcard-back mini pile-layer"
            style={{ transform: `translate(${i * 1.5}px, ${-i * 2}px) rotate(${i * 0.6 - 1}deg)` }}
          />
        ))}
      </div>
      <span className="pile-count">{count}</span>
      <span className="pile-label">牌堆</span>
    </div>
  );
}

/**
 * 弃牌堆：散乱堆叠（调研参数：±12° 旋转 + ±7px 位移，确定性种子；顶部 3 张乱、底部稳定堆）。
 */
export function DiscardPile({
  topIds,
  total,
  cardMap,
}: {
  topIds: string[];
  total: number;
  cardMap: Map<string, CardDef>;
}) {
  const scattered = useMemo(() => {
    const arr = topIds.slice(-8);
    return arr.map((cardId, i) => {
      const isTop = i >= arr.length - 3; // 顶部 3 张散乱，底下是稳定堆
      const r = mulberry32(hashStr(`${cardId}-${i}`));
      const rotate = isTop ? (r() - 0.5) * 26 : (r() - 0.5) * 8;
      const x = isTop ? (r() - 0.5) * 15 : (r() - 0.5) * 5;
      const y = isTop ? (r() - 0.5) * 11 : (r() - 0.5) * 4;
      // 全局弃牌序号作为 key：窗口滑动时旧牌 key 不变，只有新牌入场动画
      const absIndex = total - (arr.length - 1 - i);
      return { cardId, rotate, x, y, z: i, key: `${cardId}-${absIndex}` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIds.join(','), total]);

  return (
    <div className="pile-wrap">
      <div className="pile discard-pile" title={`弃牌堆共 ${total} 张`}>
        {scattered.length === 0 && <div className="pile-slot">捨</div>}
        <AnimatePresence initial={false}>
          {scattered.map((c) => (
            <motion.div
              key={c.key}
              className="pile-layer"
              initial={{ opacity: 0, scale: 1.5, rotate: 0, y: -60 }}
              animate={{ opacity: 1, scale: 1, rotate: c.rotate, x: c.x, y: c.y }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{ zIndex: c.z }}
            >
              <CardView def={cardMap.get(c.cardId)} size="mini" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <span className="pile-count">{total}</span>
      <span className="pile-label">弃牌堆</span>
    </div>
  );
}
