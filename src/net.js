import * as THREE from 'three';

const SEND_INTERVAL = 0.1; // 위치 전송 10Hz

// 원격 플레이어 아바타 (몸통 + 머리)
function makeAvatar(id) {
  const hue = (id * 137) % 360;
  const bodyColor = new THREE.Color(`hsl(${hue}, 60%, 45%)`);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.15, 0.35),
    new THREE.MeshBasicMaterial({ color: bodyColor })
  );
  body.position.y = 0.575;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xd9a878 })
  );
  head.position.y = 1.45;
  group.add(body, head);
  group.userData.target = new THREE.Vector3();
  return group;
}

export class Net {
  constructor(scene, world, player) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.ws = null;
    this.connected = false;
    this.avatars = new Map(); // id -> Group
    this.sendTimer = 0;
  }

  connect() {
    const url = new URLSearchParams(location.search).get('ws')
      || `ws://${location.hostname}:8081`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    ws.onopen = () => {
      this.connected = true;
      console.info('멀티플레이 접속:', url);
    };
    ws.onclose = ws.onerror = () => {
      if (this.connected) console.info('멀티플레이 연결 종료 → 싱글 플레이');
      this.connected = false;
      for (const a of this.avatars.values()) this.scene.remove(a);
      this.avatars.clear();
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.handle(msg);
    };
    this.ws = ws;
  }

  handle(msg) {
    switch (msg.type) {
      case 'init':
        for (const [k, b] of Object.entries(msg.edits || {})) {
          const [x, y, z] = k.split(',').map(Number);
          this.world.setBlock(x, y, z, b);
        }
        for (const p of msg.players || []) this.upsertAvatar(p.id, p);
        break;
      case 'join':
        this.upsertAvatar(msg.id, null);
        break;
      case 'pos':
        this.upsertAvatar(msg.id, msg);
        break;
      case 'block':
        this.world.setBlock(msg.x, msg.y, msg.z, msg.b);
        break;
      case 'leave': {
        const a = this.avatars.get(msg.id);
        if (a) { this.scene.remove(a); this.avatars.delete(msg.id); }
        break;
      }
    }
  }

  upsertAvatar(id, state) {
    let a = this.avatars.get(id);
    if (!a) {
      a = makeAvatar(id);
      this.avatars.set(id, a);
      this.scene.add(a);
      if (state?.x === undefined) a.visible = false; // 첫 pos 수신 전까지 숨김
    }
    if (state?.x !== undefined) {
      a.userData.target.set(state.x, state.y, state.z);
      if (!a.visible) {
        a.visible = true;
        a.position.copy(a.userData.target);
      }
      if (state.yaw !== undefined) a.rotation.y = state.yaw;
    }
  }

  sendBlock(x, y, z, b) {
    if (this.connected && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'block', x, y, z, b }));
    }
  }

  update(dt) {
    // 아바타 위치 보간
    for (const a of this.avatars.values()) {
      a.position.lerp(a.userData.target, Math.min(1, 12 * dt));
    }
    // 내 위치 전송
    this.sendTimer += dt;
    if (this.connected && this.ws.readyState === 1 && this.sendTimer >= SEND_INTERVAL) {
      this.sendTimer = 0;
      const p = this.player;
      this.ws.send(JSON.stringify({
        type: 'pos',
        x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
        yaw: +p.yaw.toFixed(2),
      }));
    }
  }

  get count() {
    return this.connected ? this.avatars.size + 1 : 1;
  }
}
