/** 公网多人联机验证：2 真人 + fillTo:4 补机器人，经 Cloudflare 隧道 */
import { Client } from '@colyseus/sdk';

const WS = process.argv[2];
if (!WS) {
  console.error('用法: node verify-mp.mjs wss://<tunnel>');
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms, hint) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('等待超时: ' + hint);
    await wait(100);
  }
}
function snapshot(room) {
  const players = [];
  room.state.players.forEach((p, sid) =>
    players.push({ sid, name: p.name, handCount: p.handCount, connected: p.connected }),
  );
  return players;
}

// 1. 玩家A 建房
const c1 = new Client(WS);
const host = await c1.create('game', { mode: 'guest', name: '玩家A' });
await waitFor(() => host.state?.phase === 'lobby', 10000, '进入大厅');
const code = host.state.roomCode;
console.log('[1] 建房成功，房间码:', code);

// 2. 玩家B 凭码加入
const c2 = new Client(WS);
const guest = await c2.joinById(code, { mode: 'guest', name: '玩家B' });
await waitFor(() => snapshot(host).length === 2, 10000, '两位玩家就位');
console.log('[2] 玩家B 已加入:', snapshot(host).map((p) => p.name).join(', '));

// 3. 房主开局：补机器人至 4 人
host.send('act', { action: 'startGame', fillTo: 4 });
await waitFor(() => host.state.phase === 'playing', 10000, '对局开始');

const players = snapshot(host);
const bots = players.filter((p) => p.sid.startsWith('bot:'));
console.log('[3] 对局开始！总人数:', players.length, '| 机器人:', bots.length);
console.log('    名单:', players.map((p) => `${p.name}(${p.handCount}张)`).join(', '));
console.log('[4] deckCount =', host.state.deckCount, '（期望 39：55-24 起手 +2 拆解 +6 爆炸猫；defuse-plenty 规则时 41）');
const startLog = host.state.log.find((l) => l.includes('游戏开始'));
console.log('[5] 开局日志:', startLog);
console.log('    World Rule:', host.state.worldRuleEmoji, host.state.worldRuleName);

// 4. 观察 25 秒：真人自动摸牌推进，验证机器人轮流行动
const logLen0 = host.state.log.length;
const t0 = Date.now();
let humanDraws = 0;
while (Date.now() - t0 < 25000) {
  if (host.state.phase !== 'playing') break;
  const cur = host.state.turnOrder[host.state.turnIndex];
  if (cur === host.sessionId && host.state.subPhase === 'awaiting-action') {
    host.send('act', { action: 'draw' });
    humanDraws++;
  } else if (cur === guest.sessionId && host.state.subPhase === 'awaiting-action') {
    guest.send('act', { action: 'draw' });
    humanDraws++;
  }
  await wait(400);
}

const logs = host.state.log.slice(logLen0);
const botLogs = logs.filter((l) => l.includes('AI·'));
console.log('[6] 25 秒观察：真人自动摸牌', humanDraws, '次；日志增量', logs.length, '条，其中机器人行动', botLogs.length, '条');
console.log('    最近日志:');
for (const l of logs.slice(-8)) console.log('     -', l);

const ok = players.length === 4 && bots.length === 2 && botLogs.length > 0;
console.log(ok ? '\n✅ 验证通过：2 真人 + 2 机器人 4 人局，公网联机正常，机器人持续行动' : '\n❌ 验证未通过');
process.exit(ok ? 0 : 2);
