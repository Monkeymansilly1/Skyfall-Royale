import * as THREE from 'three';
import { RARITY_COLORS, type ItemId } from '../config';
import type { Actor, MapObject } from '../sim/types';
import { sampleGround } from '../sim/map';
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const coneGeo = new THREE.ConeGeometry(1, 1, 7);
const icoGeo = new THREE.IcosahedronGeometry(1, 0);
for (const geometry of [boxGeo, cylinderGeo, coneGeo, icoGeo]) geometry.userData.shared = true;
export function mat(color: THREE.ColorRepresentation, roughness = 0.9, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    m.userData.shared = true;
    materialCache.set(key, m);
  }
  return m;
}
export function box(
  parent: THREE.Object3D,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  shadow = true,
) {
  const mesh = new THREE.Mesh(boxGeo, mat(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function cylinder(
  parent: THREE.Object3D,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
) {
  const mesh = new THREE.Mesh(cylinderGeo, mat(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(r, h, r);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function hullGeometry(vertices: number[]) {
  // All supported map and build hulls have known convex surfaces.
  const g = new THREE.BufferGeometry(),
    n = vertices.length / 3,
    indices: number[] = [];
  if (n === 5) indices.push(0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4);
  else if (n === 6)
    indices.push(0, 2, 1, 1, 2, 3, 0, 1, 4, 1, 5, 4, 0, 4, 2, 1, 3, 5, 2, 4, 3, 3, 4, 5);
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function weaponModel(kind: ItemId, rarity = 0): THREE.Group {
  const g = new THREE.Group(),
    dark = 0x273c4b,
    accent = RARITY_COLORS[rarity];
  if (kind === 'shield') {
    cylinder(g, 0x305d6f, 0, 0.24, 0, 0.14, 0.36);
    cylinder(g, 0x77e2f5, 0, 0.22, 0, 0.11, 0.23);
    cylinder(g, 0xdee7c9, 0, 0.47, 0, 0.09, 0.08);
    box(g, 0xdafaff, 0, 0.24, -0.126, 0.1, 0.13, 0.03);
    return g;
  }
  if (kind === 'medkit') {
    box(g, 0xe6dbbd, 0, 0.16, 0, 0.42, 0.3, 0.31);
    box(g, 0xeb6b5b, 0, 0.32, 0, 0.44, 0.035, 0.33);
    box(g, 0xf7f5d7, 0, 0.34, 0, 0.23, 0.04, 0.07);
    box(g, 0xf7f5d7, 0, 0.34, 0, 0.07, 0.04, 0.23);
    return g;
  }
  if (kind === 'pickaxe') {
    const shaft = cylinder(g, 0x775f4e, 0, 0, 0, 0.035, 1.05);
    shaft.rotation.z = 0.16;
    box(g, 0xbacdd3, 0, 0.48, 0, 0.78, 0.13, 0.12).rotation.z = -0.12;
    box(g, 0xedd05a, 0.3, 0.36, 0, 0.13, 0.29, 0.13).rotation.z = -0.4;
    return g;
  }
  const length = kind === 'sniper' ? 1.1 : kind === 'shotgun' ? 0.9 : kind === 'smg' ? 0.55 : 0.8;
  box(g, dark, 0, 0, -0.05, 0.12, 0.17, 0.38);
  box(g, 0x6e7d83, 0, 0.025, -length * 0.55, 0.065, 0.075, length * 0.9);
  box(g, accent, 0, 0.035, -0.12, 0.13, 0.06, 0.25);
  box(g, 0x6d5144, 0, -0.055, 0.25, 0.12, 0.2, 0.24);
  box(g, dark, 0, -0.15, -0.05, 0.08, 0.23, 0.12).rotation.x = -0.15;
  if (kind === 'sniper') {
    const scope = cylinder(g, dark, 0, 0.18, -0.13, 0.057, 0.3);
    scope.rotation.x = Math.PI / 2;
    cylinder(g, 0x6fc3d6, 0, 0.18, -0.29, 0.045, 0.035).rotation.x = Math.PI / 2;
  }
  if (kind === 'shotgun') box(g, 0xb6a17c, 0, -0.03, -0.44, 0.13, 0.13, 0.2);
  return g;
}
export interface CharacterModel {
  group: THREE.Group;
  body: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  gun: THREE.Group;
  weapon: ItemId;
  glider: THREE.Group;
}
export function characterModel(index = 0): CharacterModel {
  const group = new THREE.Group(),
    body = new THREE.Group();
  group.add(body);
  const colors = [0x4498b4, 0xe6ad5b, 0xcf7871, 0x83a779, 0xa48cc9],
    coat = colors[index % colors.length],
    pants = 0x354d62,
    skin = 0xe5b38d;
  box(body, coat, 0, 1.14, 0, 0.61, 0.65, 0.37);
  box(body, 0xf2dfba, 0, 1.24, -0.197, 0.15, 0.44, 0.035);
  box(body, 0x284756, 0, 0.87, 0, 0.63, 0.1, 0.39);
  box(body, 0xf1c854, 0.14, 0.88, -0.215, 0.12, 0.09, 0.04);
  box(body, skin, 0, 1.65, -0.015, 0.36, 0.38, 0.34);
  box(body, 0x314c5d, 0, 1.85, 0, 0.43, 0.18, 0.41);
  box(body, 0xdbc895, 0, 1.71, -0.195, 0.44, 0.11, 0.08);
  box(body, 0x254b61, 0, 1.71, -0.24, 0.32, 0.075, 0.035);
  box(body, 0x80cdd7, -0.08, 1.725, -0.261, 0.09, 0.025, 0.01);
  for (const x of [-0.23, 0.23]) box(body, 0x324d58, x, 1.64, 0, 0.12, 0.2, 0.19);
  box(body, 0xf7bc54, 0, 1.45, -0.08, 0.65, 0.12, 0.37);
  box(body, 0xeeb04a, 0.26, 1.24, 0.24, 0.16, 0.5, 0.06).rotation.z = -0.23;
  box(body, 0x85795e, 0, 1.2, 0.28, 0.44, 0.48, 0.24);
  box(body, 0xc5b487, 0, 1.23, 0.42, 0.3, 0.28, 0.07);
  function leg(x: number) {
    const p = new THREE.Group();
    p.position.set(x, 0.84, 0);
    body.add(p);
    box(p, pants, 0, -0.3, 0, 0.25, 0.55, 0.27);
    box(p, 0x263e50, 0, -0.62, -0.04, 0.27, 0.24, 0.38);
    box(p, 0x6c8b96, 0, -0.36, -0.147, 0.2, 0.16, 0.06);
    return p;
  }
  function arm(x: number) {
    const p = new THREE.Group();
    p.position.set(x, 1.39, 0);
    body.add(p);
    box(p, coat, 0, -0.18, 0, 0.23, 0.34, 0.25);
    box(p, skin, 0, -0.4, -0.03, 0.18, 0.21, 0.19);
    box(p, 0x324b55, 0, -0.52, -0.045, 0.2, 0.14, 0.2);
    return p;
  }
  const leftLeg = leg(-0.17),
    rightLeg = leg(0.17),
    leftArm = arm(-0.43),
    rightArm = arm(0.43),
    gun = new THREE.Group();
  gun.position.set(0.43, 1.17, -0.48);
  body.add(gun);
  gun.add(weaponModel('pickaxe'));
  const glider = new THREE.Group();
  group.add(glider);
  glider.position.y = 3.9;
  const wing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.45, 0.12, 6, 1, false, 0, Math.PI),
    mat(0x50c4bc),
  );
  wing.rotation.x = -0.12;
  wing.scale.z = 0.68;
  glider.add(wing);
  box(glider, 0xf7d55b, 0, 0.08, 0, 0.25, 0.1, 3.1);
  box(glider, 0x385d72, 0, -0.15, 0, 0.16, 0.25, 0.8);
  for (const x of [-1.3, 1.3]) {
    const rope = cylinder(glider, 0x344e5a, x * 0.65, -1.1, 0, 0.018, 2.1);
    rope.rotation.z = x > 0 ? -0.25 : 0.25;
  }
  glider.visible = false;
  return { group, body, leftLeg, rightLeg, leftArm, rightArm, gun, weapon: 'pickaxe', glider };
}
export function updateCharacter(model: CharacterModel, a: Actor, weapon: ItemId, time: number) {
  const { group, body, leftLeg, rightLeg, leftArm, rightArm, gun, glider } = model;
  group.visible = a.alive;
  group.position.set(a.pos.x, a.pos.y, a.pos.z);
  group.rotation.y = a.yaw;
  const speed = Math.hypot(a.velocity.x, a.velocity.z),
    stride = Math.sin(a.animation * 2.5) * Math.min(0.85, speed * 0.09);
  leftLeg.rotation.x = stride;
  rightLeg.rotation.x = -stride;
  body.position.y = a.crouched ? -0.35 : Math.abs(Math.sin(a.animation * 2.5)) * 0.025;
  body.rotation.x = a.sliding ? 0.45 : !a.grounded && !a.gliding && a.velocity.y < -10 ? 0.5 : 0;
  leftArm.rotation.x = weapon === 'pickaxe' ? -stride * 0.6 : -0.95;
  rightArm.rotation.x = weapon === 'pickaxe' ? stride * 0.6 : -1.2;
  rightArm.rotation.z = weapon === 'pickaxe' ? Math.max(0, 1 - (time - a.lastShot) * 3) * -1.7 : 0;
  if (model.weapon !== weapon) {
    gun.clear();
    gun.add(weaponModel(weapon));
    model.weapon = weapon;
  }
  gun.visible = !a.gliding;
  gun.rotation.x =
    weapon === 'pickaxe'
      ? -1.1 + Math.max(0, 1 - (time - a.lastShot) * 3) * -1.6
      : Math.max(0, 1 - (time - a.lastShot) * 9) * -0.13;
  glider.visible = a.gliding;
  glider.rotation.z = Math.sin(time * 1.5 + a.id) * 0.025;
  if (a.gliding) {
    leftArm.rotation.x = -2.6;
    rightArm.rotation.x = -2.6;
    leftLeg.rotation.x = 0.25;
    rightLeg.rotation.x = 0.35;
  }
}
export function mapObjectModel(o: MapObject): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.pos.x, o.pos.y, o.pos.z);
  g.rotation.y = o.yaw;
  if (o.kind === 'tree') {
    cylinder(g, 0x735943, 0, o.size.y * 0.28, 0, 0.44, o.size.y * 0.56);
    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(icoGeo, mat([0x418752, 0x509450, 0x67a451][i]));
      crown.position.set((i - 1) * 0.4, o.size.y * (0.62 + i * 0.13), 0);
      crown.scale.set(o.size.x * (0.7 - i * 0.1), o.size.y * 0.25, o.size.x * (0.6 - i * 0.08));
      crown.rotation.y = i * 1.3;
      g.add(crown);
      crown.castShadow = true;
    }
  } else if (o.kind === 'rock') {
    const rock = new THREE.Mesh(icoGeo, mat(o.color));
    rock.scale.set(o.size.x * 0.65, o.size.y * 0.65, o.size.z * 0.65);
    rock.rotation.set(0.1, 0.3, 0.2);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  } else if (o.kind === 'roof') {
    const mesh = new THREE.Mesh(hullGeometry(o.shapes[0].vertices!), mat(o.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    box(g, 0xf4dbb1, 2.5, 1.15, -1.7, 0.85, 2.6, 0.85);
  } else if (o.kind === 'target') {
    box(g, 0x5d6c64, 0, -0.65, 0, 0.13, 2.2, 0.13);
    box(g, 0xe8c697, 0, 0.1, 0, 1.15, 1.45, 0.22);
    for (const [r, col, z] of [
      [0.46, 0xed755b, -0.13],
      [0.3, 0xf8e8bc, -0.14],
      [0.14, 0xe56b51, -0.15],
    ] as const) {
      const target = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat(col));
      target.position.set(0, 0.26, z);
      target.rotation.y = Math.PI;
      g.add(target);
    }
  } else {
    box(g, o.color, 0, 0, 0, o.size.x, o.size.y, o.size.z);
    if (o.kind === 'crate') {
      for (const x of [-0.36, 0.36])
        box(g, 0x5f614b, x * o.size.x, 0, -o.size.z * 0.505, 0.06, o.size.y, 0.025);
      box(
        g,
        o.resource === 'metal' ? 0xb9c7ce : 0xc4ab70,
        0,
        0,
        -o.size.z * 0.51,
        o.size.x,
        0.09,
        0.04,
      ).rotation.z = 0.6;
    }
    if (o.kind === 'door') {
      box(g, 0xc8b16e, 0.48, 0, -0.12, 0.08, 0.08, 0.08);
      box(g, 0x86694e, 0, 0.5, -0.09, o.size.x * 0.7, 0.65, 0.025);
      if (o.opened) {
        g.rotation.y += Math.PI / 2;
        g.position.x += 0.7;
        g.position.z -= 0.7;
      }
    }
    if (o.kind === 'wall' && o.size.y > 3) {
      box(g, 0xf1dfb8, 0, -o.size.y * 0.44, 0, o.size.x + 0.035, 0.2, o.size.z + 0.035);
    }
  }
  return g;
}
export function busModel() {
  const g = new THREE.Group();
  box(g, 0xefc851, 0, 0, 0, 3.5, 2.9, 7.6);
  box(g, 0x345571, 0, 0.4, -0.2, 3.6, 1.1, 6.1);
  box(g, 0x74c9d4, 0, 0.5, -3.85, 3.2, 1.2, 0.05);
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++)
      box(g, 0x80cbd1, side * 1.77, 0.6, -2.4 + i * 1.15, 0.05, 0.9, 0.82);
  for (const x of [-1.7, 1.7])
    for (const z of [-2.6, 2.6]) {
      const wheel = cylinder(g, 0x293f4d, x, -1.4, z, 0.65, 0.38);
      wheel.rotation.z = Math.PI / 2;
    }
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat(0x63c4d7));
  balloon.position.y = 9;
  balloon.scale.set(7, 7.8, 6.3);
  g.add(balloon);
  for (const x of [-2, 2])
    for (const z of [-2.8, 2.8]) {
      const rope = cylinder(g, 0x6c6b59, x, 3.2, z, 0.04, 6);
      rope.rotation.z = x * 0.04;
    }
  box(g, 0xf6e9ae, 0, 1.7, 0, 3.8, 0.3, 8);
  return g;
}
export function terrainColor(x: number, y: number, z: number) {
  const color = new THREE.Color();
  if (y < 1) color.setHex(0x78aaa3);
  else if (y < 4.5) color.setHex(0xe2cc88);
  else {
    const variation = Math.sin(x * 0.07 + z * 0.04) * 0.025 + Math.cos(z * 0.13) * 0.018;
    color.setHex(0x569447).multiplyScalar(0.91 + variation * 2 + Math.min(0.12, y * 0.002));
  }
  return color;
}
export function roadGeometry(points: THREE.Vector2[], width = 4.5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.y))),
    path = curve.getPoints(100),
    verts: number[] = [],
    indices: number[] = [];
  path.forEach((p, i) => {
    const next = path[Math.min(i + 1, path.length - 1)],
      prev = path[Math.max(0, i - 1)],
      d = next.clone().sub(prev).normalize(),
      side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(width / 2);
    for (const sign of [-1, 1]) {
      const x = p.x + side.x * sign,
        z = p.z + side.z * sign;
      verts.push(x, sampleGround(x, z) + 0.045, z);
    }
    if (i < path.length - 1) {
      const j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
