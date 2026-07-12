import * as THREE from 'three';
import { BLOCK } from './blocks.js';
import { WATER_LEVEL, HEIGHT as WORLD_HEIGHT } from './world.js';

const HALF_W = 0.3;   // 플레이어 반너비
const HEIGHT = 1.8;   // 키
export const EYE = 1.62;
const GRAVITY = 24;
const JUMP_V = 8.4;
const WALK = 5.6;
const SPRINT = 8.8;
const EPS = 0.001;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(8.5, 45, 8.5); // 발 위치
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.keys = new Set();
    this.enabled = false;
    camera.rotation.order = 'YXZ';

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch -= e.movementY * 0.0024;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });
  }

  // (8,8) 주변을 나선 탐색해 물/나무가 없는 안전한 스폰 지점 선택
  spawn() {
    for (let r = 0; r < 32; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = 8 + dx, z = 8 + dz;
          this.world.ensureData(x >> 4, z >> 4);
          const h = this.world.terrainHeight(x, z);
          if (h <= WATER_LEVEL) continue;
          if (!this.world.isSolid(x, h, z)) continue; // 동굴로 뚫린 표면 제외
          if (this.world.getBlock(x, h + 1, z) !== BLOCK.AIR ||
              this.world.getBlock(x, h + 2, z) !== BLOCK.AIR ||
              this.world.getBlock(x, h + 3, z) !== BLOCK.AIR) continue;
          this.pos.set(x + 0.5, h + 1.01, z + 0.5);
          this.vel.set(0, 0, 0);
          return;
        }
      }
    }
    this.pos.set(8.5, WORLD_HEIGHT, 8.5);
    this.vel.set(0, 0, 0);
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  inWater() {
    return this.world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 0.9),
      Math.floor(this.pos.z)
    ) === BLOCK.WATER;
  }

  // 현재 AABB와 겹치는 복셀 중 solid가 있는지
  collides() {
    const minX = Math.floor(this.pos.x - HALF_W), maxX = Math.floor(this.pos.x + HALF_W);
    const minY = Math.floor(this.pos.y), maxY = Math.floor(this.pos.y + HEIGHT);
    const minZ = Math.floor(this.pos.z - HALF_W), maxZ = Math.floor(this.pos.z + HALF_W);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (this.world.isSolid(x, y, z)) return true;
    return false;
  }

  // 새 블록 배치가 플레이어와 겹치는지
  intersectsBlock(bx, by, bz) {
    return bx + 1 > this.pos.x - HALF_W && bx < this.pos.x + HALF_W &&
           by + 1 > this.pos.y && by < this.pos.y + HEIGHT &&
           bz + 1 > this.pos.z - HALF_W && bz < this.pos.z + HALF_W;
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    this.pos[axis] += delta;
    if (!this.collides()) return;
    // 충돌 → 면에 맞춰 되밀기
    if (axis === 'y') {
      if (delta < 0) {
        this.pos.y = Math.floor(this.pos.y) + 1 + EPS;
        this.onGround = true;
      } else {
        this.pos.y = Math.floor(this.pos.y + HEIGHT) - HEIGHT - EPS;
      }
      this.vel.y = 0;
    } else {
      const half = HALF_W;
      if (delta > 0) {
        this.pos[axis] = Math.floor(this.pos[axis] + half) - half - EPS;
      } else {
        this.pos[axis] = Math.floor(this.pos[axis] - half) + 1 + half + EPS;
      }
      this.vel[axis === 'x' ? 'x' : 'z'] = 0;
    }
  }

  update(dt) {
    // 플레이어 위치 청크가 아직 없으면 물리 정지 (낙하 방지)
    if (!this.world.hasData(Math.floor(this.pos.x) >> 4, Math.floor(this.pos.z) >> 4)) return;

    const water = this.inWater();
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? SPRINT : WALK)
      * (water ? 0.5 : 1);

    // 입력 → 이동 방향 (yaw 기준)
    let fx = 0, fz = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW')) fz -= 1; // 시선(head) 방향으로 전진
      if (this.keys.has('KeyS')) fz += 1;
      if (this.keys.has('KeyA')) fx -= 1;
      if (this.keys.has('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    let dx = 0, dz = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      // 입력 벡터를 yaw만큼 Y축 회전 → 항상 시선(head) 기준으로 이동
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      dx = fx * cos + fz * sin;
      dz = -fx * sin + fz * cos;
    }

    // 수평 속도는 목표치로 감쇠 보간
    const accel = this.onGround || water ? 20 : 6;
    this.vel.x += (dx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (dz * speed - this.vel.z) * Math.min(1, accel * dt);

    // 중력 / 점프 / 수영
    if (water) {
      this.vel.y -= 6 * dt;
      this.vel.y *= 1 - Math.min(1, 3 * dt);
      if (this.enabled && this.keys.has('Space')) this.vel.y = 4.5;
      this.vel.y = Math.max(this.vel.y, -4);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.enabled && this.keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_V;
      }
    }

    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);

    // 낙사 방지 (월드 밖으로 떨어지면 리스폰)
    if (this.pos.y < -10) this.spawn();

    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
