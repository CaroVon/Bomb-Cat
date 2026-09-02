import confetti from 'canvas-confetti';

/** 爆炸碎片：从指定屏幕坐标迸发 */
export function explodeAt(x: number, y: number): void {
  confetti({
    particleCount: 46,
    spread: 75,
    startVelocity: 34,
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    colors: ['#e05252', '#d4a557', '#8f978d', '#3a2a1a'],
    shapes: ['square'],
    scalar: 0.9,
    gravity: 0.9,
    ticks: 160,
    disableForReducedMotion: true,
  });
}

/** 胜利彩带：两侧对射 */
export function winCelebration(): void {
  const opts = {
    particleCount: 70,
    spread: 68,
    colors: ['#d4a557', '#e8e6dd', '#5cb87a'],
    disableForReducedMotion: true,
    ticks: 220,
  };
  confetti({ ...opts, angle: 60, origin: { x: 0.05, y: 0.75 } });
  confetti({ ...opts, angle: 120, origin: { x: 0.95, y: 0.75 } });
  setTimeout(() => {
    confetti({ ...opts, particleCount: 40, angle: 90, origin: { x: 0.5, y: 0.4 } });
  }, 350);
}
