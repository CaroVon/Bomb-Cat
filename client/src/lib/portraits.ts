/**
 * 角色立绘 URL：默认 `<id>.jpg`，个别角色素材文件名/格式不同时在此登记。
 * （立绘放在 client/public/assets/characters/ 下）
 */
const PORTRAIT_EXT: Record<string, string> = {
  xiuying: 'png',
};
/** 素材文件名与角色 id 不一致时的映射（文档里的素材名） */
const PORTRAIT_FILE: Record<string, string> = {
  xiuying: 'ice',
  butcher: 'butcher2',
};

export function portraitUrl(characterId: string | undefined | null): string {
  const id = characterId && characterId.length > 0 ? characterId : 'none';
  const file = PORTRAIT_FILE[id] ?? id;
  const ext = PORTRAIT_EXT[id] ?? 'jpg';
  return `/assets/characters/${file}.${ext}`;
}
