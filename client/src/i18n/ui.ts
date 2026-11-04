/**
 * 客户端 UI 文案（中 / English）。`{param}` 为占位符。
 * 按页面拆分到 ./ui/*.ts，这里合并。
 */
import { COMMON } from './ui/common';
import { GAME } from './ui/game';

export type UiEntry = { zh: string; en: string };

export const UI = {
  ...COMMON,
  ...GAME,
} satisfies Record<string, UiEntry>;

export type UiKey = keyof typeof UI;
