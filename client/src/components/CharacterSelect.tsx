import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BUILTIN_CHARACTERS,
  BUILTIN_CHARACTER_MAP,
  CHARACTER_RPG,
  ROLE_COLOR,
  ROLE_LABEL,
  type CharacterDef,
} from '@bombcat/shared';
import { sfx } from '../lib/sound';
import { portraitUrl } from '../lib/portraits';

interface Props {
  selectedId: string | null;
  onSelect: (characterId: string | null) => void;
}

/** 触发条件标签文本 */
function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'gameStart':
      return '开局';
    case 'turnStart':
      return '回合开始';
    case 'onStolenFrom':
      return '被偷牌时';
    case 'onNoped':
      return '被否认时';
    case 'active':
      return '主动';
    default:
      return trigger;
  }
}

/** 技能类型徽章 */
function SkillBadge({ skill }: { skill: CharacterDef['skills'][0] }) {
  const isPassive = skill.trigger !== 'active';
  const color = isPassive ? '#d4a557' : '#4a90c2';
  return (
    <span
      className="skill-badge"
      style={{ borderColor: color, color }}
    >
      {isPassive ? '被动' : '主动'} · {triggerLabel(skill.trigger)}
    </span>
  );
}

/** 难度指示 */
function Difficulty({ level }: { level: number }) {
  return (
    <span className="difficulty-dots" title={`难度 ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= level ? 'dot is-on' : 'dot'} />
      ))}
    </span>
  );
}

/**
 * RPG 式角色选择界面（炉石战棋式：竖版大卡 + 详情侧栏 + 底部小卡条）
 */
export function CharacterSelect({ selectedId, onSelect }: Props) {
  const [hoverId, setHoverId] = useState<string>(selectedId ?? 'none');
  const displayId = hoverId || selectedId || 'none';
  const char = BUILTIN_CHARACTER_MAP.get(displayId) ?? BUILTIN_CHARACTERS[0]!;
  const rpg = CHARACTER_RPG[displayId] ?? CHARACTER_RPG['none']!;
  const roleColor = rpg.themeColor;
  const isSelected = selectedId === displayId;

  return (
    <div className="char-select" style={{ ['--theme' as string]: roleColor }}>
      {/* 主题色渐变背景 */}
      <div className="char-select-bg" />

      <div className="char-select-main">
        {/* 竖版大卡 */}
        <div className="char-select-card-scene">
          <AnimatePresence mode="wait">
            <motion.div
              key={displayId}
              className="char-select-card"
              initial={{ opacity: 0, y: 24, rotateY: -8 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              exit={{ opacity: 0, y: -16, rotateY: 8 }}
              transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
              style={{
                borderColor: roleColor,
                boxShadow: `0 0 30px ${roleColor}44, var(--shadow-2)`,
              }}
            >
              <div
                className="char-portrait"
                style={{
                  backgroundImage: `url(${portraitUrl(displayId)})`,
                }}
              />
              <div className="char-card-info">
                <h3 className="char-name">{char.name}</h3>
                <span className="char-title">{char.title}</span>
              </div>
              {isSelected && <div className="char-selected-check">✓</div>}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 详情侧栏 */}
        <div className="char-select-detail">
          <AnimatePresence mode="wait">
            <motion.div
              key={displayId}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="detail-name">{char.name}</h2>
              <div className="detail-title">{char.title}</div>

              <div className="h-row" style={{ gap: 10, margin: '10px 0 14px' }}>
                <span
                  className="role-badge"
                  style={{ background: `${roleColor}22`, borderColor: roleColor, color: roleColor }}
                >
                  {ROLE_LABEL[rpg.role]}
                </span>
                <Difficulty level={rpg.difficulty} />
              </div>

              {/* 技能展示（多技能角色全部列出，如数学老师四则运算） */}
              {char.skills.length > 0 ? (
                <div className="skill-panel" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {char.skills.map((sk) => (
                    <div key={sk.id} style={{ marginBottom: 10 }}>
                      <div className="h-row" style={{ gap: 8, marginBottom: 6 }}>
                        <SkillBadge skill={sk} />
                        <strong style={{ fontSize: 15 }}>{sk.name}</strong>
                      </div>
                      <p className="skill-desc">{sk.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="skill-panel">
                  <p className="skill-desc muted">无技能，纯靠牌技。</p>
                </div>
              )}

              {/* 背景故事 */}
              <p className="char-lore">{rpg.lore}</p>

              {/* 确认按钮 */}
              <button
                className={`char-confirm ${isSelected ? 'is-locked' : ''}`}
                style={{ borderColor: roleColor }}
                onClick={() => {
                  sfx('skill');
                  onSelect(isSelected ? 'none' : displayId);
                }}
              >
                {isSelected ? '✓ 已出战' : '确认出战'}
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* 底部小卡条 */}
      <div className="char-select-strip">
        {BUILTIN_CHARACTERS.map((c) => {
          const r = CHARACTER_RPG[c.id] ?? CHARACTER_RPG['none']!;
          const isSel = selectedId === c.id;
          const isHover = hoverId === c.id;
          return (
            <div
              key={c.id}
              className={`char-mini ${isSel ? 'is-selected' : ''} ${isHover ? 'is-hovered' : ''}`}
              onMouseEnter={() => setHoverId(c.id)}
              onClick={() => {
                setHoverId(c.id);
                onSelect(c.id);
              }}
              style={{ borderColor: isSel || isHover ? r.themeColor : 'var(--border)' }}
            >
              <div
                className="char-mini-portrait"
                style={{ backgroundImage: `url(${portraitUrl(c.id)})` }}
              />
              <span className="char-mini-name">{c.name}</span>
              {isSel && <span className="char-mini-check">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
