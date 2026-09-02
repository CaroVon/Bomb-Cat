/** 本地偏好设置（不依赖登录态） */

const KEY = 'bombcat:settings';

export interface Settings {
  sound: boolean;
  emotes: boolean;
  fastAnim: boolean;
}

const DEFAULTS: Settings = {
  sound: true,
  emotes: true,
  fastAnim: false,
};

let current: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(): void {
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function getSettings(): Settings {
  return current;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  current = { ...current, [key]: value };
  save();
}

/** 动画时长缩放：快速模式减半（EK2"动画太慢不可跳过"差评的直接对策） */
export function animMs(ms: number): number {
  return current.fastAnim ? ms / 2 : ms;
}
