export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (v: Vec3, s: number): Vec3 => v3(v.x * s, v.y * s, v.z * s);
export const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
export const flatDist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (v: Vec3): Vec3 => mul(v, 1 / (len(v) || 1));
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const angleLerp = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const forward = (yaw: number): Vec3 => v3(-Math.sin(yaw), 0, -Math.cos(yaw));
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function raySphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): number | null {
  const oc = sub(origin, center),
    b = oc.x * direction.x + oc.y * direction.y + oc.z * direction.z;
  const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - radius * radius,
    d = b * b - c;
  if (d < 0) return null;
  const t = -b - Math.sqrt(d);
  return t >= 0 ? t : -b + Math.sqrt(d) >= 0 ? -b + Math.sqrt(d) : null;
}
