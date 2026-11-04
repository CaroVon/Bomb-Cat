import { useI18n } from './index';

/** 语言切换「中 / EN」 */
export default function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label={t('lang.toggle')}>
      <button
        type="button"
        className={lang === 'zh' ? 'on' : ''}
        aria-pressed={lang === 'zh'}
        onClick={() => setLang('zh')}
      >
        中
      </button>
      <span className="lang-sep">/</span>
      <button
        type="button"
        className={lang === 'en' ? 'on' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </div>
  );
}
