import { getSettings } from './settings';

/**
 * WebAudio 合成音效（零资源、零版权、零依赖）。
 * 首次用户手势时解锁 AudioContext（浏览器自动播放策略）。
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function ac(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 在首个用户手势时调用一次（main.tsx / 大厅按钮挂载） */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  ac();
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number,
  delay = 0,
): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(duration: number, gain: number, lowpass: number, delay = 0): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

export type SfxName =
  | 'card' // 出牌
  | 'draw' // 摸牌
  | 'flip' // 翻看
  | 'nope' // 否认
  | 'boom' // 爆炸
  | 'defuse' // 拆解
  | 'win' // 胜利
  | 'turn' // 轮到你
  | 'error' // 非法操作
  | 'emote'; // 表情

export function sfx(name: SfxName): void {
  if (!getSettings().sound) return;
  switch (name) {
    case 'card': // whoosh：噪声扫频
      noise(0.16, 0.25, 3200);
      break;
    case 'draw':
      tone(520, 0.08, 'triangle', 0.12, 720);
      break;
    case 'flip':
      tone(880, 0.06, 'square', 0.06, 1200);
      break;
    case 'nope':
      tone(220, 0.16, 'sawtooth', 0.16, 110);
      tone(180, 0.2, 'sawtooth', 0.14, 90, 0.12);
      break;
    case 'boom':
      noise(0.7, 0.9, 900);
      tone(90, 0.55, 'sine', 0.5, 32);
      break;
    case 'defuse':
      tone(660, 0.1, 'triangle', 0.14);
      tone(880, 0.12, 'triangle', 0.14, undefined, 0.1);
      tone(1100, 0.16, 'triangle', 0.14, undefined, 0.2);
      break;
    case 'win':
      tone(523, 0.14, 'triangle', 0.16);
      tone(659, 0.14, 'triangle', 0.16, undefined, 0.14);
      tone(784, 0.14, 'triangle', 0.16, undefined, 0.28);
      tone(1046, 0.3, 'triangle', 0.18, undefined, 0.42);
      break;
    case 'turn':
      tone(740, 0.09, 'sine', 0.1);
      tone(988, 0.12, 'sine', 0.1, undefined, 0.09);
      break;
    case 'error':
      tone(196, 0.14, 'square', 0.08, 160);
      break;
    case 'emote':
      tone(987, 0.07, 'sine', 0.08, 1318);
      break;
  }
}
