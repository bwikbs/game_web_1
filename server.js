// 웹크래프트 멀티플레이 서버 (블록/위치 동기화 릴레이)
// 실행: npm run server  →  클라이언트가 ws://<호스트>:8081 로 자동 접속
import { WebSocketServer } from 'ws';

const PORT = 8081;
const WORLD_HEIGHT = 64;   // src/world.js HEIGHT와 동일
const MAX_BLOCK_ID = 12;   // src/blocks.js BLOCK 최대값과 동일
const MAX_EDITS = 200000;  // 세션 edits 상한 (무한 성장 방지)
const wss = new WebSocketServer({ port: PORT });

let nextId = 1;
const clients = new Map(); // id -> { ws, state }
const edits = new Map();   // "x,y,z" -> 블록 id (세션 동안의 월드 수정 내역)

function broadcast(msg, exceptId = null) {
  const s = JSON.stringify(msg);
  for (const [pid, c] of clients) {
    if (pid !== exceptId && c.ws.readyState === 1) c.ws.send(s);
  }
}

wss.on('connection', (ws) => {
  const id = nextId++;
  clients.set(id, { ws, state: null });
  console.log(`[+] 플레이어 ${id} 접속 (현재 ${clients.size}명)`);

  ws.send(JSON.stringify({
    type: 'init',
    id,
    edits: Object.fromEntries(edits),
    players: [...clients]
      .filter(([pid]) => pid !== id)
      .map(([pid, c]) => ({ id: pid, ...(c.state || {}) })),
  }));
  broadcast({ type: 'join', id }, id);

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf); } catch { return; }
    if (msg.type === 'pos') {
      if (![msg.x, msg.y, msg.z, msg.yaw].every(Number.isFinite)) return;
      const c = clients.get(id);
      if (c) c.state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw };
      broadcast({ type: 'pos', id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw }, id);
    } else if (msg.type === 'block') {
      if (![msg.x, msg.y, msg.z, msg.b].every(Number.isInteger)) return;
      if (msg.y < 0 || msg.y >= WORLD_HEIGHT) return;
      if (msg.b < 0 || msg.b > MAX_BLOCK_ID) return;
      const k = `${msg.x},${msg.y},${msg.z}`;
      if (edits.size >= MAX_EDITS && !edits.has(k)) return;
      edits.set(k, msg.b);
      broadcast({ type: 'block', x: msg.x, y: msg.y, z: msg.z, b: msg.b }, id);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    console.log(`[-] 플레이어 ${id} 퇴장 (현재 ${clients.size}명)`);
    broadcast({ type: 'leave', id });
  });
});

console.log(`웹크래프트 멀티플레이 서버 시작: ws://0.0.0.0:${PORT}`);
