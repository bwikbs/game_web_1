import * as THREE from 'three';
import { BLOCK, BLOCK_DEFS, atlasTexture, tileUV } from './blocks.js';
import { createNoise2D, createNoise3D, fbm, hash2 } from './noise.js';

export const CHUNK = 16;
export const HEIGHT = 64;
export const WATER_LEVEL = 26;
const SNOW_LEVEL = 43;

// 면 정의: dir(법선), corners(pos + uv), 밝기
const FACES = [
  { dir: [-1, 0, 0], bright: 0.8, corners: [
    { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] },
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] } ] },
  { dir: [1, 0, 0], bright: 0.8, corners: [
    { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] },
    { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] } ] },
  { dir: [0, -1, 0], bright: 0.55, corners: [
    { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] },
    { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] } ] },
  { dir: [0, 1, 0], bright: 1.0, corners: [
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] } ] },
  { dir: [0, 0, -1], bright: 0.7, corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] },
    { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] } ] },
  { dir: [0, 0, 1], bright: 0.7, corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] },
    { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] } ] },
];

const idx = (x, y, z) => y * CHUNK * CHUNK + z * CHUNK + x;

export class World {
  constructor(scene, seed = 20260712) {
    this.scene = scene;
    this.chunks = new Map();   // "cx,cz" -> Uint8Array
    this.meshes = new Map();   // "cx,cz" -> { solid, trans }
    this.dirty = new Set();
    this.edits = new Map();    // "cx,cz" -> Map("lx,y,lz" -> id) : 사용자 수정 내역
    this.editsChanged = false;
    this.noise = createNoise2D(seed);
    this.caveNoiseA = createNoise3D(seed + 101);
    this.caveNoiseB = createNoise3D(seed + 202);
    this.heightCache = new Map();

    this.matSolid = new THREE.MeshBasicMaterial({
      map: atlasTexture, vertexColors: true,
    });
    this.matTrans = new THREE.MeshBasicMaterial({
      map: atlasTexture, vertexColors: true,
      transparent: true, side: THREE.DoubleSide,
    });
  }

  key(cx, cz) { return cx + ',' + cz; }

  terrainHeight(gx, gz) {
    const k = gx + ',' + gz;
    let h = this.heightCache.get(k);
    if (h === undefined) {
      const base = fbm(this.noise, gx / 110, gz / 110, 4);
      const detail = fbm(this.noise, gx / 34 + 100, gz / 34 + 100, 3);
      h = Math.floor(30 + base * 16 + detail * 6);
      h = Math.max(1, Math.min(HEIGHT - 12, h));
      this.heightCache.set(k, h);
      if (this.heightCache.size > 200000) this.heightCache.clear();
    }
    return h;
  }

  genChunkData(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const gx = cx * CHUNK + lx, gz = cz * CHUNK + lz;
        const h = this.terrainHeight(gx, gz);
        const sandy = h <= WATER_LEVEL + 1;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === h) {
            id = sandy ? BLOCK.SAND : (h >= SNOW_LEVEL ? BLOCK.SNOW : BLOCK.GRASS);
          } else if (y >= h - 3) {
            id = sandy ? BLOCK.SAND : BLOCK.DIRT;
          } else {
            id = BLOCK.STONE;
          }
          data[idx(lx, y, lz)] = id;
        }
        // 동굴 굴착: 두 3D 노이즈가 모두 0 근처인 곳 = 터널
        // (물가 기둥은 호수 바닥이 뚫리지 않게 표면 근처 보호)
        const capY = sandy ? h - 6 : h;
        for (let y = 3; y <= capY; y++) {
          const nA = this.caveNoiseA(gx / 35, y / 22, gz / 35);
          if (Math.abs(nA) >= 0.09) continue;
          const nB = this.caveNoiseB(gx / 35, y / 22, gz / 35);
          if (Math.abs(nB) < 0.09) data[idx(lx, y, lz)] = BLOCK.AIR;
        }
        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          data[idx(lx, y, lz)] = BLOCK.WATER;
        }
      }
    }
    // 나무 (수관이 청크를 넘지 않도록 가장자리 2칸 제외)
    for (let lz = 2; lz < CHUNK - 2; lz++) {
      for (let lx = 2; lx < CHUNK - 2; lx++) {
        const gx = cx * CHUNK + lx, gz = cz * CHUNK + lz;
        const h = this.terrainHeight(gx, gz);
        if (data[idx(lx, h, lz)] !== BLOCK.GRASS) continue;
        if (hash2(gx, gz) >= 0.02) continue;
        const th = 4 + Math.floor(hash2(gx + 7, gz + 3) * 3);
        const top = h + th;
        if (top + 2 >= HEIGHT) continue;
        // 수관
        for (let dy = -2; dy <= 1; dy++) {
          const r = dy < 0 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 &&
                  hash2(gx + dx, gz + dz + dy * 17) < 0.6) continue;
              const p = idx(lx + dx, top + dy, lz + dz);
              if (data[p] === BLOCK.AIR) data[p] = BLOCK.LEAVES;
            }
          }
        }
        // 줄기
        for (let y = h + 1; y <= top; y++) data[idx(lx, y, lz)] = BLOCK.LOG;
      }
    }
    // 저장된 사용자 수정 내역 재적용
    const edits = this.edits.get(this.key(cx, cz));
    if (edits) {
      for (const [k, id] of edits) {
        const [lx, y, lz] = k.split(',').map(Number);
        data[idx(lx, y, lz)] = id;
      }
    }
    return data;
  }

  ensureData(cx, cz) {
    const k = this.key(cx, cz);
    if (!this.chunks.has(k)) this.chunks.set(k, this.genChunkData(cx, cz));
  }

  hasData(cx, cz) { return this.chunks.has(this.key(cx, cz)); }

  getBlock(gx, gy, gz) {
    if (gy < 0) return BLOCK.STONE;
    if (gy >= HEIGHT) return BLOCK.AIR;
    const chunk = this.chunks.get(this.key(gx >> 4, gz >> 4));
    if (!chunk) return BLOCK.AIR;
    return chunk[idx(gx & 15, gy, gz & 15)];
  }

  isSolid(gx, gy, gz) {
    return BLOCK_DEFS[this.getBlock(gx, gy, gz)].solid;
  }

  isOpaque(gx, gy, gz) {
    const d = BLOCK_DEFS[this.getBlock(gx, gy, gz)];
    return d.solid && !d.transparent;
  }

  setBlock(gx, gy, gz, id) {
    if (gy < 0 || gy >= HEIGHT) return;
    const cx = gx >> 4, cz = gz >> 4;
    this.ensureData(cx, cz);
    const chunk = this.chunks.get(this.key(cx, cz));
    const lx = gx & 15, lz = gz & 15;
    chunk[idx(lx, gy, lz)] = id;
    const ck = this.key(cx, cz);
    if (!this.edits.has(ck)) this.edits.set(ck, new Map());
    this.edits.get(ck).set(`${lx},${gy},${lz}`, id);
    this.editsChanged = true;
    this.dirty.add(this.key(cx, cz));
    if (lx === 0) this.dirty.add(this.key(cx - 1, cz));
    if (lx === 15) this.dirty.add(this.key(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.key(cx, cz - 1));
    if (lz === 15) this.dirty.add(this.key(cx, cz + 1));
  }

  buildChunkMesh(cx, cz) {
    this.ensureData(cx, cz);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      this.ensureData(cx + dx, cz + dz);
    }
    const chunk = this.chunks.get(this.key(cx, cz));
    const ox = cx * CHUNK, oz = cz * CHUNK;

    const solid = { pos: [], col: [], uv: [], idx: [] };
    const trans = { pos: [], col: [], uv: [], idx: [] };

    for (let y = 0; y < HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const id = chunk[idx(lx, y, lz)];
          if (id === BLOCK.AIR) continue;
          const def = BLOCK_DEFS[id];
          const gx = ox + lx, gz = oz + lz;
          const buf = def.transparent ? trans : solid;

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const nId = this.getBlock(gx + dx, y + dy, gz + dz);
            const nDef = BLOCK_DEFS[nId];
            const visible = nId === BLOCK.AIR || (nDef.transparent && nId !== id);
            if (!visible) continue;

            const tile = dy === 1 ? def.tiles[0] : dy === -1 ? def.tiles[1] : def.tiles[2];
            const start = buf.pos.length / 3;
            const ao = [];

            for (const c of face.corners) {
              buf.pos.push(gx + c.pos[0], y + c.pos[1], gz + c.pos[2]);
              const [u, v] = tileUV(tile, c.uv[0], c.uv[1]);
              buf.uv.push(u, v);

              // 앰비언트 오클루전 (불투명 블록만 차폐물로 취급)
              let aoLevel = 0;
              if (def.transparent === false) {
                const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
                const t = [c.pos[0] * 2 - 1, c.pos[1] * 2 - 1, c.pos[2] * 2 - 1];
                t[axis] = 0;
                const s1 = [dx, dy, dz], s2 = [dx, dy, dz], cn = [dx, dy, dz];
                const [a1, a2] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
                s1[a1] += t[a1]; s2[a2] += t[a2];
                cn[a1] += t[a1]; cn[a2] += t[a2];
                const o1 = this.isOpaque(gx + s1[0], y + s1[1], gz + s1[2]) ? 1 : 0;
                const o2 = this.isOpaque(gx + s2[0], y + s2[1], gz + s2[2]) ? 1 : 0;
                const oc = this.isOpaque(gx + cn[0], y + cn[1], gz + cn[2]) ? 1 : 0;
                aoLevel = o1 && o2 ? 3 : o1 + o2 + oc;
              }
              ao.push(aoLevel);
              const b = face.bright * (1 - aoLevel * 0.16);
              buf.col.push(b, b, b);
            }

            // AO에 따라 대각선 방향 선택 (밴딩 방지)
            if (ao[1] + ao[2] > ao[0] + ao[3]) {
              buf.idx.push(start, start + 1, start + 3, start, start + 3, start + 2);
            } else {
              buf.idx.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
            }
          }
        }
      }
    }

    this.disposeChunkMesh(cx, cz);
    const entry = {};
    for (const [name, buf, mat] of [['solid', solid, this.matSolid], ['trans', trans, this.matTrans]]) {
      if (buf.idx.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.setIndex(buf.idx);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      entry[name] = mesh;
    }
    this.meshes.set(this.key(cx, cz), entry);
  }

  disposeChunkMesh(cx, cz) {
    const entry = this.meshes.get(this.key(cx, cz));
    if (!entry) return;
    for (const mesh of Object.values(entry)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(this.key(cx, cz));
  }

  // 플레이어 주변 청크 로드/언로드 (프레임당 예산 제한)
  update(px, pz, radius = 5) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;

    // 수정된 청크는 즉시 재메싱
    for (const k of this.dirty) {
      const [cx, cz] = k.split(',').map(Number);
      if (this.meshes.has(k) || this.chunks.has(k)) this.buildChunkMesh(cx, cz);
    }
    this.dirty.clear();

    // 필요한 청크를 거리순으로 정렬해 예산 내 생성
    let meshBudget = 2;
    const wanted = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius + 2) continue;
        wanted.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of wanted) {
      if (this.meshes.has(this.key(cx, cz))) continue;
      this.buildChunkMesh(cx, cz);
      if (--meshBudget <= 0) break;
    }

    // 범위 밖 메시 해제 (데이터는 보존 → 수정 내용 유지)
    for (const k of [...this.meshes.keys()]) {
      const [cx, cz] = k.split(',').map(Number);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > (radius + 2) * (radius + 2)) {
        this.disposeChunkMesh(cx, cz);
      }
    }
  }

  exportEdits() {
    const out = {};
    for (const [ck, m] of this.edits) out[ck] = Object.fromEntries(m);
    return out;
  }

  loadEdits(obj) {
    this.edits.clear();
    for (const [ck, m] of Object.entries(obj || {})) {
      this.edits.set(ck, new Map(Object.entries(m).map(([k, v]) => [k, v | 0])));
    }
  }

  // 복셀 DDA 레이캐스트 (물은 통과)
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = Math.abs(1 / dir.x), tDeltaY = Math.abs(1 / dir.y), tDeltaZ = Math.abs(1 / dir.z);
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;
    let normal = [0, 0, 0];
    let t = 0;

    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) {
        return { x, y, z, id, nx: normal[0], ny: normal[1], nz: normal[2] };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ];
      }
    }
    return null;
  }
}
