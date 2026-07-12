import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { BLOCK, BLOCK_DEFS, tileIconURL } from './blocks.js';
import { loadSave, writeSave, clearSave } from './storage.js';
import { Sky } from './sky.js';
import { sfx } from './audio.js';

const REACH = 6;
const RADIUS = 5;

// ── 렌더러 / 씬 ──────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x8fc9ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 50, RADIUS * 16 * 0.95);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 600
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 월드 / 플레이어 ──────────────────────────────────────
const world = new World(scene);
const player = new Player(camera, world);

const sky = new Sky(scene);

// 세이브 복원 또는 신규 스폰
const save = loadSave();
if (typeof save?.time === 'number') sky.time = save.time;
if (save?.edits) world.loadEdits(save.edits);
if (save?.player) {
  const p = save.player;
  player.pos.set(p.x, p.y, p.z);
  player.yaw = p.yaw;
  player.pitch = p.pitch;
} else {
  player.spawn();
}
// 시작 지역은 동기 생성 (낙하 방지)
const scx = Math.floor(player.pos.x) >> 4, scz = Math.floor(player.pos.z) >> 4;
for (let dz = -1; dz <= 1; dz++)
  for (let dx = -1; dx <= 1; dx++)
    world.buildChunkMesh(scx + dx, scz + dz);

// ── 블록 하이라이트 ──────────────────────────────────────
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111 })
);
highlight.visible = false;
scene.add(highlight);

// ── 핫바 ─────────────────────────────────────────────────
const HOTBAR = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.PLANK, BLOCK.LOG,
  BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK, BLOCK.SAND,
];
let hotbarIdx = 0;
const hotbarEl = document.getElementById('hotbar');
HOTBAR.forEach((id, i) => {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.innerHTML =
    `<img src="${tileIconURL(BLOCK_DEFS[id].tiles[2])}" alt="">` +
    `<span class="num">${i + 1}</span>`;
  slot.title = BLOCK_DEFS[id].name;
  hotbarEl.appendChild(slot);
});
const blockNameEl = document.getElementById('block-name');

function selectHotbar(i) {
  hotbarIdx = (i + HOTBAR.length) % HOTBAR.length;
  [...hotbarEl.children].forEach((el, j) =>
    el.classList.toggle('selected', j === hotbarIdx));
  blockNameEl.textContent = BLOCK_DEFS[HOTBAR[hotbarIdx]].name;
  blockNameEl.style.opacity = 1;
  clearTimeout(selectHotbar._t);
  selectHotbar._t = setTimeout(() => (blockNameEl.style.opacity = 0), 1200);
}
selectHotbar(save?.hotbar ?? 0);

document.addEventListener('keydown', (e) => {
  const n = parseInt(e.key);
  if (n >= 1 && n <= HOTBAR.length) selectHotbar(n - 1);
});
document.addEventListener('wheel', (e) => {
  if (player.enabled) selectHotbar(hotbarIdx + Math.sign(e.deltaY));
});

// ── 자동 저장 ────────────────────────────────────────────
function persist() {
  writeSave({
    edits: world.exportEdits(),
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch,
    },
    hotbar: hotbarIdx,
    time: sky.time,
  });
  world.editsChanged = false;
}
setInterval(persist, 5000);
window.addEventListener('beforeunload', persist);

// ── 포인터락 / 오버레이 ─────────────────────────────────
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  sfx.unlock();
  renderer.domElement.requestPointerLock();
});
document.getElementById('new-game').addEventListener('click', (e) => {
  e.stopPropagation();
  if (confirm('저장된 월드를 삭제하고 새로 시작할까요?')) {
    window.removeEventListener('beforeunload', persist);
    clearSave();
    location.reload();
  }
});
document.addEventListener('pointerlockchange', () => {
  player.enabled = document.pointerLockElement === renderer.domElement;
  overlay.style.display = player.enabled ? 'none' : 'flex';
});

// ── 블록 캐기 / 설치 ─────────────────────────────────────
function getTarget() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return world.raycast(player.eyePos, dir, REACH);
}

document.addEventListener('mousedown', (e) => {
  if (!player.enabled) return;
  const hit = getTarget();
  if (!hit) return;
  if (e.button === 0) {
    world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
    sfx.break();
  } else if (e.button === 2) {
    const bx = hit.x + hit.nx, by = hit.y + hit.ny, bz = hit.z + hit.nz;
    const cur = world.getBlock(bx, by, bz);
    if ((cur === BLOCK.AIR || cur === BLOCK.WATER) && !player.intersectsBlock(bx, by, bz)) {
      world.setBlock(bx, by, bz, HOTBAR[hotbarIdx]);
      sfx.place();
    }
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ── HUD ──────────────────────────────────────────────────
const posEl = document.getElementById('pos');
const fpsEl = document.getElementById('fps');
let frames = 0, fpsTimer = 0;

// ── 게임 루프 ────────────────────────────────────────────
window.__game = { world, player, camera, sky, sfx };

// 발소리/착지/입수 사운드 상태
const prevPos = player.pos.clone();
let prevInWater = false;
let prevOnGround = false;
let walkAcc = 0;

function updateSfx() {
  const dxz = Math.hypot(player.pos.x - prevPos.x, player.pos.z - prevPos.z);
  if (player.onGround) {
    walkAcc += dxz;
    if (walkAcc > 2.2) { walkAcc = 0; sfx.step(); }
    if (!prevOnGround) sfx.step(); // 착지
  } else if (prevOnGround && player.vel.y > 5) {
    sfx.jump();
  }
  const inW = player.inWater();
  if (inW && !prevInWater) sfx.splash();
  prevInWater = inW;
  prevOnGround = player.onGround;
  prevPos.copy(player.pos);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);
  updateSfx();
  world.update(player.pos.x, player.pos.z, RADIUS);

  const brightness = sky.update(dt, camera);
  world.matSolid.color.setScalar(brightness);
  world.matTrans.color.setScalar(brightness);

  const hit = getTarget();
  if (hit) {
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    highlight.visible = true;
  } else {
    highlight.visible = false;
  }

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsTimer) + ' FPS';
    frames = 0; fpsTimer = 0;
  }
  posEl.textContent =
    `x ${player.pos.x.toFixed(1)}  y ${player.pos.y.toFixed(1)}  z ${player.pos.z.toFixed(1)}`;

  renderer.render(scene, camera);
}
loop();
