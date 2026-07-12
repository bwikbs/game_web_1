import * as THREE from 'three';

const DAY_LENGTH = 240; // 하루 = 240초
const DAY_SKY = new THREE.Color(0x8fc9ff);
const NIGHT_SKY = new THREE.Color(0x0b1230);

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.35; // 0=자정, 0.5=정오 → 아침에 시작
    this.tmp = new THREE.Color();

    const mkDisc = (r, color) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 24),
        new THREE.MeshBasicMaterial({ color, fog: false })
      );
      scene.add(m);
      return m;
    };
    this.sun = mkDisc(22, 0xfff2ae);
    this.moon = mkDisc(13, 0xe8eeff);
  }

  // 시간 진행 + 하늘/해/달 갱신, 지형 밝기 계수를 반환
  update(dt, camera) {
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    const a = this.time * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(a);
    const d = Math.min(1, Math.max(0, (elev + 0.12) * 4)); // 낮 정도 0~1

    this.tmp.copy(NIGHT_SKY).lerp(DAY_SKY, d);
    this.scene.background.copy(this.tmp);
    this.scene.fog.color.copy(this.tmp);

    const R = 280;
    const dir = new THREE.Vector3(Math.cos(a), elev, 0.3).normalize();
    this.sun.position.copy(camera.position).addScaledVector(dir, R);
    this.moon.position.copy(camera.position).addScaledVector(dir, -R);
    this.sun.lookAt(camera.position);
    this.moon.lookAt(camera.position);

    return 0.14 + 0.86 * d;
  }
}
