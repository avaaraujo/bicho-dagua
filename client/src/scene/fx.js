// Borrifos de água: cubinhos que voam e caem. Um único InstancedMesh.
import * as THREE from 'three';

const MAX = 260;

export function createSpray(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.32, 0.32, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const parts = Array.from({ length: MAX }, () => ({ life: 0, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let next = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  function emit(x, y, z, vx, vy, vz, size = 1) {
    const p = parts[next];
    next = (next + 1) % MAX;
    Object.assign(p, { life: 0.5 + Math.random() * 0.35, x, y, z, vx, vy, vz, s: size });
  }

  return {
    // rastro atrás de um barco andando
    trail(boat, speed, dt) {
      const n = Math.min(4, speed * dt * 4);
      const fx = Math.sin(boat.h);
      const fz = Math.cos(boat.h);
      for (let i = 0; i < n + Math.random(); i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        emit(
          boat.x - fx * 1.8 + -fz * side * 0.5,
          0.3,
          boat.z - fz * 1.8 + fx * side * 0.5,
          -fx * speed * 0.15 + -fz * side * (1.5 + Math.random() * 2),
          2.5 + Math.random() * speed * 0.18,
          -fz * speed * 0.15 + fx * side * (1.5 + Math.random() * 2),
          0.45 + Math.random() * 0.45,
        );
      }
    },
    splash(x, z, strength) {
      for (let i = 0; i < 14 * strength + 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 6 * strength;
        emit(x, 0.5, z, Math.cos(a) * sp, 4 + Math.random() * 7 * strength, Math.sin(a) * sp, 1.2);
      }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 22 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0) p.life = 0;
        }
        const s = p.life > 0 ? p.s * Math.min(1, p.life * 3) : 0;
        m.compose(v.set(p.x, p.y, p.z), q, sc.set(s, s, s));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
