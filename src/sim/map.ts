import { CONFIG } from '../config';
import { clamp, lerp, random, v3, type Vec3 } from './math';
import type { BoxShape, MapObject } from './types';
export const LOCATIONS = [
  {
    name: 'SUNSTONE SQUARE',
    short: 'Sunstone',
    x: -63,
    z: -46,
    y: 12,
    color: 0xf2ae70,
    radius: 28,
  },
  { name: 'TIDEBREAK BAY', short: 'Tidebreak', x: 65, z: -50, y: 9, color: 0x60bab6, radius: 28 },
  { name: 'LOOKOUT LODGE', short: 'Lookout', x: 27, z: 66, y: 22, color: 0xc57464, radius: 24 },
  { name: 'AMBER ACRES', short: 'Amber Acres', x: -83, z: 56, y: 14, color: 0xe4bd5f, radius: 22 },
] as const;
export function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x, z * 1.06);
  const shore = 162 + Math.sin(Math.atan2(z, x) * 5) * 7 + Math.sin(z * 0.027) * 5;
  const land = clamp((shore - r) / 23, 0, 1);
  let y =
    -7 +
    land *
      (20 + Math.sin(x * 0.032) * 5 + Math.cos(z * 0.037) * 5 + Math.sin((x + z) * 0.052) * 2.8);
  y += Math.exp(-((x - 37) ** 2 + (z - 64) ** 2) / 1500) * 10 * land;
  for (const p of LOCATIONS) {
    const d = Math.hypot(x - p.x, z - p.z),
      t = clamp((d - p.radius) / 18, 0, 1);
    y = lerp(p.y, y, t * t * (3 - 2 * t));
  }
  return y;
}
/** Identical triangles feed both Three and Rapier. */
export function terrainMesh() {
  const n = CONFIG.terrainSegments,
    size = CONFIG.terrainSize,
    positions = new Float32Array((n + 1) ** 2 * 3),
    indices: number[] = [];
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const wx = (x / n - 0.5) * size,
        wz = (z / n - 0.5) * size,
        i = (z * (n + 1) + x) * 3;
      positions.set([wx, terrainHeight(wx, wz), wz], i);
      if (x < n && z < n) {
        const a = z * (n + 1) + x,
          b = a + 1,
          c = a + n + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  return { positions, indices: new Uint32Array(indices) };
}
export function sampleGround(x: number, z: number) {
  const s = CONFIG.terrainSize / CONFIG.terrainSegments;
  const ax = Math.floor((x + CONFIG.terrainSize / 2) / s) * s - CONFIG.terrainSize / 2;
  const az = Math.floor((z + CONFIG.terrainSize / 2) / s) * s - CONFIG.terrainSize / 2;
  const u = (x - ax) / s,
    v = (z - az) / s;
  return u + v <= 1
    ? terrainHeight(ax, az) * (1 - u - v) +
        terrainHeight(ax + s, az) * u +
        terrainHeight(ax, az + s) * v
    : terrainHeight(ax + s, az + s) * (u + v - 1) +
        terrainHeight(ax + s, az) * (1 - v) +
        terrainHeight(ax, az + s) * (1 - u);
}
export function createMap(seed = 901): MapObject[] {
  const objects: MapObject[] = [];
  let id = 1000;
  const rnd = random(seed);
  const box = (
    kind: MapObject['kind'],
    pos: Vec3,
    size: Vec3,
    color: number,
    health = 160,
    yaw = 0,
    resource?: MapObject['resource'],
  ) => {
    const o: MapObject = {
      id: id++,
      kind,
      pos,
      size,
      color,
      health,
      yaw,
      resource,
      handles: [],
      shapes: [{ center: pos, half: v3(size.x / 2, size.y / 2, size.z / 2), yaw }],
    };
    objects.push(o);
    return o;
  };
  function house(x: number, z: number, color: number, floors = 2) {
    const y = sampleGround(x, z) + 0.15,
      w = 9,
      d = 9,
      story = 3.5;
    box('floor', v3(x, y, z), v3(w + 0.4, 0.3, d + 0.4), 0xb7a082, 800);
    for (let f = 0; f < floors; f++) {
      const fy = y + f * story,
        h = story;
      // Front door and two real window openings, with a traversable interior.
      box('wall', v3(x - 3.15, fy + h / 2, z + d / 2), v3(2.7, h, 0.25), color, 300);
      box('wall', v3(x + 3.15, fy + h / 2, z + d / 2), v3(2.7, h, 0.25), color, 300);
      box('wall', v3(x, fy + 3, z + d / 2), v3(3.6, 1, 0.25), color, 180);
      if (f === 0) box('door', v3(x, fy + 1.2, z + d / 2), v3(1.5, 2.4, 0.16), 0x674b38, 150);
      for (const sx of [-1, 1]) {
        box('wall', v3(x + (sx * w) / 2, fy + 0.55, z), v3(0.25, 1.1, d), color, 300);
        box('wall', v3(x + (sx * w) / 2, fy + 3, z), v3(0.25, 1, d), color, 220);
        for (const dz of [-3.3, 0, 3.3])
          box('wall', v3(x + (sx * w) / 2, fy + 1.8, z + dz), v3(0.25, 1.5, 2), color, 200);
      }
      box('wall', v3(x, fy + h / 2, z - d / 2), v3(w, h, 0.25), color, 320);
      if (f < floors - 1) {
        box('floor', v3(x + 1, fy + story, z), v3(7, 0.2, d), 0xb29a77, 400);
        for (let k = 0; k < 12; k++)
          box(
            'stairs',
            v3(x - 3.4, fy + 0.145 * (k + 1), z + 3.5 - k * 0.55),
            v3(1.8, 0.29 * (k + 1), 0.58),
            0x9a785a,
            400,
          );
      }
      box('crate', v3(x + 2.8, fy + 0.65, z - 3.2), v3(1.2, 1.3, 1.2), 0x93734f, 90, 0, 'wood');
    }
    box('floor', v3(x, y + floors * story, z), v3(9.5, 0.25, 9.5), 0xe4c59a, 400);
    const roof = box(
      'roof',
      v3(x, y + floors * story + 1.7, z),
      v3(10.4, 3.4, 10.4),
      0x426a78,
      350,
    );
    const b = roof.pos,
      hx = 5.2,
      hz = 5.2;
    roof.shapes = [
      {
        center: b,
        half: v3(hx, 1.7, hz),
        vertices: [
          -hx,
          -1.7,
          -hz,
          hx,
          -1.7,
          -hz,
          -hx,
          -1.7,
          hz,
          hx,
          -1.7,
          hz,
          0,
          1.7,
          -hz,
          0,
          1.7,
          hz,
        ],
      },
    ];
    box(
      'crate',
      v3(x + 2, y + floors * story + 0.7, z + 2),
      v3(1.1, 1.2, 1.1),
      0xe5b655,
      70,
      0,
      'wood',
    );
  }
  for (const [i, p] of LOCATIONS.entries()) {
    house(p.x - 10, p.z - 4, p.color, i === 3 ? 1 : 2);
    house(p.x + 11, p.z + 7, i === 1 ? 0xe7ce91 : 0xedd5ad, i === 2 ? 2 : 1);
    // Picnic cover, painted supply crates and low garden fences.
    for (let j = 0; j < 4; j++)
      box(
        'crate',
        v3(p.x - 5 + j * 3, p.y + 0.65, p.z + 17),
        v3(1.5, 1.3, 1.5),
        j % 2 ? 0x77a6a4 : 0xbe9159,
        j % 2 ? 160 : 100,
        0,
        j % 2 ? 'metal' : 'wood',
      );
    for (let j = 0; j < 5; j++)
      box(
        'wall',
        v3(p.x - 22, p.y + 0.65, p.z - 15 + j * 3),
        v3(0.2, 1.3, 2.6),
        0xdec99a,
        75,
        0,
        'wood',
      );
  }
  for (let i = 0; i < 175; i++) {
    const x = (rnd() - 0.5) * 325,
      z = (rnd() - 0.5) * 325,
      y = sampleGround(x, z);
    if (
      y < 3 ||
      LOCATIONS.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + 3) ||
      Math.abs(x + z * 0.3) < 5
    )
      continue;
    const h = 5 + rnd() * 5;
    const tree = box(
      'tree',
      v3(x, y, z),
      v3(3.2 + rnd() * 2, h, 3.2),
      0x388659,
      150,
      rnd() * Math.PI * 2,
      'wood',
    );
    tree.shapes = [{ center: v3(x, y + h * 0.3, z), half: v3(0.43, h * 0.3, 0.43) }];
  }
  for (let i = 0; i < 60; i++) {
    const x = (rnd() - 0.5) * 310,
      z = (rnd() - 0.5) * 310,
      y = sampleGround(x, z);
    if (y < 2 || LOCATIONS.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius)) continue;
    const s = 1.1 + rnd() * 1.9;
    const rock = box(
      'rock',
      v3(x, y + s * 0.45, z),
      v3(s * 1.8, s, s * 1.5),
      0x829ca0,
      180,
      rnd() * Math.PI,
      'brick',
    );
    rock.shapes = [{ center: rock.pos, half: v3(s * 0.73, s * 0.45, s * 0.6), yaw: rock.yaw }];
  }
  for (const p of [v3(-7, 0, -8), v3(1, 0, -8), v3(9, 0, -8)]) {
    p.y = sampleGround(p.x, p.z) + 1.3;
    box('target', p, v3(1, 2, 0.28), 0xff7052, 200);
  }
  return objects;
}
export function shapeLocal(center: Vec3, half: Vec3, yaw = 0): BoxShape {
  return { center, half, yaw };
}
