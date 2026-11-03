import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BUILTIN_CHARACTER_MAP, CHARACTER_RPG } from '@bombcat/shared';
import { portraitUrl } from '../../lib/portraits';

export interface TableSeatData {
  sessionId: string;
  name: string;
  characterId: string;
  handCount: number;
  alive: boolean;
  connected: boolean;
  turnsLeft: number;
  /** Pig King：消化剩余回合 */
  digestionTurns?: number;
  /** Pig King：饱腹剩余回合 */
  fullTurns?: number;
  /** bigEye：被积累的档案数 */
  archives?: number;
  /** 数学老师：减法/乘法/除法标记 */
  mathSubDraw?: number;
  mathMulNext?: number;
  mathDivNext?: number;
  /** 秀英：冰冻层数 / 荔枝数 */
  freezeLayers?: number;
  lychees?: number;
  /** 邪恶苹果头：身上的邪恶苹果剩余回合 */
  appleTurns?: number;
  /** 屠夫：剔骨层数 / 被哪位屠夫封锁 */
  boneStacks?: number;
  lockedBy?: string;
}

interface Props {
  seat: TableSeatData;
  isCurrent: boolean;
  bounced?: boolean;
  /** 回合截止时间（epoch ms；内部自计时显示秒数，null=不显示） */
  timerEndsAt?: number | null;
  emote?: { emoji: string; id: number } | null;
  /** 座位位置（相对于桌面容器） */
  position: { top?: string; left?: string; right?: string; bottom?: string };
  /** 正在被目标型效果指定（金色脉冲 1.6s） */
  targeted?: boolean;
  /**
   * 易变基元状态必须作为顶层 props 传入：seat 是 Colyseus 代理对象，
   * 字段原地变更不改引用，memo 浅比较会漏掉非当前座位的更新。
   */
  handCount?: number;
  alive?: boolean;
  connected?: boolean;
  turnsLeft?: number;
  digestionTurns?: number;
  fullTurns?: number;
  archives?: number;
  mathSubDraw?: number;
  mathMulNext?: number;
  mathDivNext?: number;
  freezeLayers?: number;
  lychees?: number;
  appleTurns?: number;
  boneStacks?: number;
  locked?: boolean;
}

/** 自计时倒计时角标（只在挂载期间 tick） */
function SeatTimer({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (sec <= 0) return null;
  return <span className={`table-seat-timer ${sec <= 10 ? 'is-urgent' : ''}`}>{sec}</span>;
}

/**
 * 牌桌座位：大号角色立绘 + 玩家信息 + 状态。
 * 替代原 seat-v2 的小圆头像，用真实角色图片做视觉锚点。
 */
function TableSeatInner({
  seat,
  isCurrent,
  bounced,
  timerEndsAt,
  emote,
  position,
  targeted,
  handCount,
  alive,
  connected,
  turnsLeft,
  digestionTurns,
  fullTurns,
  archives,
  mathSubDraw,
  mathMulNext,
  mathDivNext,
  freezeLayers,
  lychees,
  appleTurns,
  boneStacks,
  locked,
}: Props) {
  const char = BUILTIN_CHARACTER_MAP.get(seat.characterId);
  const rpg = CHARACTER_RPG[seat.characterId] ?? CHARACTER_RPG['none']!;
  const themeColor = rpg.themeColor;
  const portrait = portraitUrl(seat.characterId);
  const _handCount = handCount ?? seat.handCount;
  const _alive = alive ?? seat.alive;
  const _connected = connected ?? seat.connected;
  const _turnsLeft = turnsLeft ?? seat.turnsLeft;
  const _digestionTurns = digestionTurns ?? seat.digestionTurns ?? 0;
  const _fullTurns = fullTurns ?? seat.fullTurns ?? 0;
  const _archives = archives ?? seat.archives ?? 0;
  const _mathSub = mathSubDraw ?? seat.mathSubDraw ?? 0;
  const _mathMul = mathMulNext ?? seat.mathMulNext ?? 0;
  const _mathDiv = mathDivNext ?? seat.mathDivNext ?? 0;
  const _freeze = freezeLayers ?? seat.freezeLayers ?? 0;
  const _lychees = lychees ?? seat.lychees ?? 0;
  const _apple = appleTurns ?? seat.appleTurns ?? 0;
  const _bones = boneStacks ?? seat.boneStacks ?? 0;
  const _locked = locked ?? !!seat.lockedBy;

  return (
    <div
      className={`table-seat ${isCurrent ? 'is-current' : ''} ${!_alive ? 'is-dead' : ''} ${bounced ? 'is-bounced' : ''} ${targeted ? 'is-targeted' : ''}`}
      style={{ ...position, ['--theme' as string]: themeColor }}
    >
      {/* 角色立绘框 */}
      <div className="table-seat-portrait" style={{ borderColor: themeColor }}>
        <div
          className="table-seat-img"
          style={{ backgroundImage: `url(${portrait})` }}
        />
        {!_alive && (
          <div className="table-seat-dead-overlay">
            <span>💀</span>
          </div>
        )}
        {isCurrent && _alive && <div className="table-seat-turn-glow" />}
        {!!timerEndsAt && timerEndsAt > 0 && _alive && <SeatTimer endsAt={timerEndsAt} />}
      </div>

      {/* 信息条 */}
      <div className="table-seat-info">
        <span className="table-seat-name">{seat.name}</span>
        <span className="table-seat-char" style={{ color: themeColor }}>
          {char?.name ?? '路人'}
        </span>
        <div className="table-seat-meta">
          {_alive ? (
            <>
              <span title="手牌数">🂠 {_handCount}</span>
              {_turnsLeft > 1 && (
                <span className="table-seat-combo">⚡{_turnsLeft}</span>
              )}
              {_digestionTurns > 0 && (
                <span className="seat-status-badge is-digest" title="消化中">
                  🐷{_digestionTurns}
                </span>
              )}
              {_fullTurns > 0 && (
                <span className="seat-status-badge is-full" title="饱腹中（不能摸牌）">
                  🥱{_fullTurns}
                </span>
              )}
              {_archives > 0 && (
                <span className="seat-status-badge is-archive" title="档案：被大眼Nana监视中">
                  👁{_archives}
                </span>
              )}
              {_freeze > 0 && (
                <span className="seat-status-badge is-frozen" title="冰冻中（无法出牌/摸牌，且不受技能影响）">
                  ❄️{_freeze}
                </span>
              )}
              {_mathSub > 0 && (
                <span className="seat-status-badge is-mathsub" title="减法：下次摸牌少摸一张">
                  ➖{_mathSub}
                </span>
              )}
              {_mathMul > 0 && (
                <span className="seat-status-badge is-mathmul" title="乘法：下一张功能牌触发两次">
                  ✖️{_mathMul}
                </span>
              )}
              {_mathDiv > 0 && (
                <span className="seat-status-badge is-mathdiv" title="除法：下一张功能牌无法触发">
                  ➗{_mathDiv}
                </span>
              )}
              {_lychees > 0 && (
                <span className="seat-status-badge is-lychee" title="荔枝：集齐 2 颗获得一张普通小猫牌">
                  🍒{_lychees}
                </span>
              )}
              {_apple > 0 && (
                <span className="seat-status-badge is-apple" title="身上有邪恶苹果：N 回合后变成爆炸苹果混入牌堆">
                  🍏{_apple}
                </span>
              )}
              {seat.characterId === 'butcher' && _bones > 0 && (
                <span className="seat-status-badge is-bone" title="剔骨层数（满 3 层可封锁一名玩家）">
                  🔪{_bones}
                </span>
              )}
              {_locked && (
                <span className="seat-status-badge is-locked" title="被屠夫封锁：直到其下一回合结束前不能用技能和功能牌">
                  🔒
                </span>
              )}
            </>
          ) : (
            <span className="table-seat-out">出局</span>
          )}
          {!_connected && _alive && <span className="table-seat-offline">掉线</span>}
        </div>
      </div>

      {/* 表情气泡 */}
      <AnimatePresence>
        {emote && (
          <motion.div
            key={emote.id}
            className="table-seat-emote"
            initial={{ opacity: 0, scale: 0.4, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: -14 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          >
            {emote.emoji}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const TableSeat = memo(TableSeatInner);

/**
 * 对手座位：沿桌面上半椭圆弧均匀分布（自己在底部，不占座位）。
 * 坐标相对 .table-opponents（覆盖顶栏以下、我的区域以上的整块桌面）：
 * - 横向 50% ± 43%·cosθ；纵向 = 顶部留白 104px（避开顶栏） + (1 - sinθ)·46%
 * - 人越多张角越大（最多 20°~160°），两人时也不会挤在正中间
 * 手机端由 CSS 改为顶部横向头像条，这里的坐标会被覆盖。
 */
export function getSeatPositions(opponentCount: number): Array<{ top?: string; left?: string; right?: string }> {
  const n = Math.max(1, opponentCount);
  if (n === 1) return [{ top: '104px', left: '50%' }];
  const span = Math.min(140, 36 * (n - 1));
  const start = 90 + span / 2;
  return Array.from({ length: n }, (_, i) => {
    const deg = start - (span * i) / (n - 1);
    const rad = (deg * Math.PI) / 180;
    const left = 50 + 43 * Math.cos(rad);
    const drop = (1 - Math.sin(rad)) * 46;
    return { top: `calc(104px + ${drop.toFixed(2)}%)`, left: `${left.toFixed(2)}%` };
  });
}
