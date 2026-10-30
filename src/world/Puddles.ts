import * as THREE from 'three';

// Puddles left by a tipsy player against a wall; they fade after a minute.

const LIFE = 60; // real seconds

export class Puddles {
  readonly group = new THREE.Group();
  private list: { mesh: THREE.Mesh; age: number }[] = [];
  private geo = new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2);

  add(x: number, z: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8b84a, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, 0.04, z);
    mesh.scale.set(1, 1, 0.7 + Math.random() * 0.5);
    mesh.rotation.y = Math.random() * 6;
    this.group.add(mesh);
    this.list.push({ mesh, age: 0 });
    if (this.list.length > 12) this.remove(0);
  }

  private remove(i: number) {
    const p = this.list[i];
    this.group.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    this.list.splice(i, 1);
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = 0.6 * Math.max(0, 1 - p.age / LIFE);
      if (p.age > LIFE) this.remove(i);
    }
  }

  reset() { while (this.list.length) this.remove(0); }
}
