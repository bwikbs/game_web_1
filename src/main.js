import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { BLOCK, BLOCK_DEFS, tileIconURL } from './blocks.js';

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

// 초기 스폰 지역은 동기 생성 (낙하 방지)
for (let dz = -1; dz <= 1; dz++)
  for (let dx = -1; dx <= 1; dx++)
    world.buildChunkMesh(dx, dz);
player.spawn();

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
selectHotbar(0);

document.addEventListener('keydown', (e) => {
  const n = parseInt(e.key);
  if (n >= 1 && n <= HOTBAR.length) selectHotbar(n - 1);
});
document.addEventListener('wheel', (e) => {
  if (player.enabled) selectHotbar(hotbarIdx + Math.sign(e.deltaY));
});

// ── 포인터락 / 오버레이 ─────────────────────────────────
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());
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
  } else if (e.button === 2) {
    const bx = hit.x + hit.nx, by = hit.y + hit.ny, bz = hit.z + hit.nz;
    const cur = world.getBlock(bx, by, bz);
    if ((cur === BLOCK.AIR || cur === BLOCK.WATER) && !player.intersectsBlock(bx, by, bz)) {
      world.setBlock(bx, by, bz, HOTBAR[hotbarIdx]);
    }
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ── HUD ──────────────────────────────────────────────────
const posEl = document.getElementById('pos');
const fpsEl = document.getElementById('fps');
let frames = 0, fpsTimer = 0;

// ── 게임 루프 ────────────────────────────────────────────
window.__game = { world, player, camera };

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);
  world.update(player.pos.x, player.pos.z, RADIUS);

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
