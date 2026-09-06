import { getSettings } from './settings';

/**
 * WebAudio 合成音效 v2 —— 柔和版（零资源、零版权）。
 *
 * 调研落地的关键改进：
 * - 波形：sine 主体 + triangle 辅助（彻底去掉 square/sawtooth）
 * - 包络：5-15ms linear attack + exponentialRamp(0.0001) decay（消灭 click 爆音）
 * - 音量：单音效峰值 0.05-0.22，sfxBus 0.5 + DynamicsCompressor
 * - 滤波：highpass(80Hz) 去泥 + lowpass(8kHz) 去刺；tone 类 cutoff 高→低扫描
 * - 噪声：共享 pink-noise buffer（一阶低通近似，自然柔和）
 * - 随机化：detune ±80 cents + gain ±15%（防重复感）
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function init(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    // 主链：sfxBus(0.5) → highpass(80Hz) → compressor → destination
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    sfxBus.connect(hp).connect(comp).connect(ctx.destination);

    // 共享 pink-noise buffer（一阶低通近似）
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.97 + white * 0.03; // 简单一阶低通 → 近似粉噪
      data[i] = last * 8; // 补偿低通衰减
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 在首个用户手势时调用一次 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  init();
}

/* ---------------- 基础合成原语 ---------------- */

/** 随机化 detune（±80 cents ≈ ±0.8 半音） */
function detune(): number {
  return (Math.random() * 2 - 1) * 80;
}

/** 随机化 gain（±15%） */
function varyGain(base: number): number {
  return base * (0.85 + Math.random() * 0.3);
}

interface ToneOpts {
  freq: number;
  endFreq?: number; // 结束频率（下滑/上滑）
  type?: OscillatorType;
  duration: number;
  gain: number;
  attack?: number; // 秒，默认 0.008
  delay?: number; // 秒，默认 0
  cutoff?: number; // lowpass 截止频率（默认 8000）
  cutoffEnd?: number; // 结束截止频率（亮度衰减扫描）
}

function tone(o: ToneOpts): void {
  const c = init();
  if (!c || !sfxBus) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  osc.detune.value = detune();
  if (o.endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.endFreq), t0 + o.duration);
  }

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(o.cutoff ?? 8000, t0);
  if (o.cutoffEnd) {
    lp.frequency.exponentialRampToValueAtTime(Math.max(60, o.cutoffEnd), t0 + o.duration);
  }

  const g = c.createGain();
  const peak = varyGain(o.gain);
  const attack = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);

  osc.connect(lp).connect(g).connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + o.duration + 0.05); // 多留 50ms 余量，确保淡出完成
}

interface NoiseOpts {
  duration: number;
  gain: number;
  attack?: number;
  bandpass?: { freq: number; endFreq?: number; q?: number };
  lowpass?: number;
  delay?: number;
}

function noise(o: NoiseOpts): void {
  const c = init();
  if (!c || !sfxBus || !noiseBuf) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.2; // pitch 随机化

  let node: AudioNode = src;
  if (o.bandpass) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = o.bandpass.q ?? 1.2; // 低 Q = 宽带 = 柔和
    bp.frequency.setValueAtTime(o.bandpass.freq, t0);
    if (o.bandpass.endFreq) {
      bp.frequency.exponentialRampToValueAtTime(
        Math.max(60, o.bandpass.endFreq),
        t0 + o.duration,
      );
    }
    node = node.connect(bp);
  }
  if (o.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lowpass;
    node = node.connect(lp);
  }

  const g = c.createGain();
  const peak = varyGain(o.gain);
  const attack = o.attack ?? 0.06; // 噪声类用较慢的 attack
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);

  node.connect(g).connect(sfxBus);
  src.start(t0);
  src.stop(t0 + o.duration + 0.05);
}

/** FM 钟声（carrier + modulator 比率 1:3.5，经典 FM tubular bell） */
function fmDing(baseFreq: number, gain: number): void {
  const c = init();
  if (!c || !sfxBus) return;
  const t0 = c.currentTime;
  const carrier = c.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = baseFreq;
  carrier.detune.value = detune();

  const mod = c.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = baseFreq * 3.5; // 钟声比

  const modGain = c.createGain();
  modGain.gain.setValueAtTime(baseFreq * 2, t0);
  modGain.gain.exponentialRampToValueAtTime(1, t0 + 0.12); // 亮度快速衰减 = 柔

  mod.connect(modGain).connect(carrier.frequency);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(varyGain(gain), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);

  carrier.connect(g).connect(sfxBus);
  mod.start(t0);
  carrier.start(t0);
  mod.stop(t0 + 0.65);
  carrier.stop(t0 + 0.65);
}

/* ---------------- 音效配方 ---------------- */

export type SfxName =
  | 'card' // 出牌 whoosh
  | 'draw' // 摸牌
  | 'flip' // 翻看
  | 'nope' // 否认
  | 'boom' // 爆炸
  | 'defuse' // 拆解
  | 'win' // 胜利
  | 'turn' // 轮到你
  | 'error' // 非法操作
  | 'emote' // 表情
  | 'skill'; // 技能触发

export function sfx(name: SfxName): void {
  if (!getSettings().sound) return;
  switch (name) {
    case 'card':
      // whoosh：粉噪 + 带通上扫 + 顶层低通
      noise({
        duration: 0.22,
        gain: 0.12,
        bandpass: { freq: 400, endFreq: 1800, q: 1.2 },
        lowpass: 3000,
      });
      break;

    case 'draw':
      // 极简 flip：短促 triangle
      tone({ freq: 520, endFreq: 720, type: 'triangle', duration: 0.07, gain: 0.06 });
      break;

    case 'flip':
      tone({ freq: 420, type: 'triangle', duration: 0.05, gain: 0.04 });
      break;

    case 'nope':
      // 降调双音（下行 = 负面语义，不刺耳）
      tone({ freq: 196, endFreq: 165, type: 'triangle', duration: 0.15, gain: 0.06, cutoff: 2500 });
      tone({
        freq: 196,
        endFreq: 165,
        type: 'triangle',
        duration: 0.15,
        gain: 0.05,
        cutoff: 2500,
        delay: 0.12,
      });
      break;

    case 'boom':
      // 柔和爆炸：sub sine 下坠 + 噪声低通衰减
      tone({ freq: 90, endFreq: 28, duration: 0.6, gain: 0.22, attack: 0.01 });
      noise({
        duration: 0.8,
        gain: 0.18,
        attack: 0.01,
        lowpass: 2000,
        bandpass: { freq: 6000, endFreq: 180, q: 0.8 },
      });
      break;

    case 'defuse':
      // 三连上行（安全感）
      tone({ freq: 660, type: 'triangle', duration: 0.08, gain: 0.07, cutoff: 4000 });
      tone({ freq: 880, type: 'triangle', duration: 0.08, gain: 0.07, cutoff: 4000, delay: 0.1 });
      tone({
        freq: 1100,
        type: 'triangle',
        duration: 0.12,
        gain: 0.07,
        cutoff: 4000,
        delay: 0.2,
      });
      break;

    case 'win':
      // C 大调琶音 C-E-G-C 上行 + 尾部上滑
      tone({ freq: 523, duration: 0.1, gain: 0.06, attack: 0.012 });
      tone({ freq: 659, duration: 0.1, gain: 0.06, attack: 0.012, delay: 0.07 });
      tone({ freq: 784, duration: 0.1, gain: 0.06, attack: 0.012, delay: 0.14 });
      tone({ freq: 1046, duration: 0.25, gain: 0.08, attack: 0.012, delay: 0.21 });
      break;

    case 'turn':
      tone({ freq: 740, duration: 0.08, gain: 0.06 });
      tone({ freq: 988, duration: 0.1, gain: 0.06, delay: 0.09 });
      break;

    case 'error':
      // 降调三角波，比确认音低 ~3dB，不惩罚
      tone({ freq: 196, endFreq: 165, type: 'triangle', duration: 0.18, gain: 0.04, cutoff: 2000 });
      break;

    case 'emote':
      fmDing(880, 0.08);
      break;

    case 'skill':
      // 技能触发：FM 钟声 + 上行琶音
      fmDing(660, 0.1);
      tone({ freq: 523, type: 'triangle', duration: 0.08, gain: 0.05, delay: 0.05 });
      tone({ freq: 784, type: 'triangle', duration: 0.1, gain: 0.05, delay: 0.13 });
      break;
  }
}
