import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { Lang } from '@bombcat/shared';
import { UI, type UiKey } from './ui';

export type { Lang };
export type UiParams = Record<string, string | number>;

const STORAGE_KEY = 'bombcat.lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/* ---- 全局语言状态（非组件模块也能读：getLang / tr） ---- */
let current: Lang = detectLang();
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 按语言查 UI 文案；`{param}` 占位符替换 */
export function translate(lang: Lang, key: UiKey, params?: UiParams): string {
  const entry = UI[key];
  const tpl = entry ? entry[lang] ?? entry.zh : key;
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] !== undefined ? String(params[name]) : m));
}

/** 非组件模块用：按当前语言翻译 */
export function tr(key: UiKey, params?: UiParams): string {
  return translate(current, key, params);
}

export type TFn = (key: UiKey, params?: UiParams) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  const t = useCallback<TFn>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  const t = useCallback<TFn>((key, params) => translate(lang, key, params), [lang]);
  return ctx ?? { lang, setLang, t };
}
