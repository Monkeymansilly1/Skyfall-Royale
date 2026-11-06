import { BUILD_HEALTH, CONFIG, type Material } from '../config';
import { sampleGround } from './map';
import { v3, type Vec3 } from './math';
import type { Actor, BoxShape, BuildPiece, BuildRequest } from './types';
const S = CONFIG.buildSize;
export function rotateLocal(p: Vec3, quarter: number): Vec3 {
  const a = (quarter * Math.PI) / 2,
    c = Math.cos(a),
    s = Math.sin(a);
  return v3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
export function buildShapes(piece: BuildRequest & { edit?: number }): BoxShape[] {
  const base = v3(piece.gx * S, piece.gy * S, piece.gz * S),
    rot = piece.rotation,
    yaw = (rot * Math.PI) / 2,
    edit = piece.edit ?? 0;
  const local = (p: Vec3, half: Vec3, vertices?: number[]): BoxShape => {
    const r = rotateLocal(p, rot);
    return { center: v3(base.x + r.x, base.y + r.y, base.z + r.z), half, yaw, vertices };
  };
  switch (piece.kind) {
    case 'wall': {
      if (!edit) return [local(v3(0, 2, -2), v3(2, 2, 0.12))];
      const cells: BoxShape[] = [];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
          if (!(edit & (1 << (row * 3 + col))))
            cells.push(
              local(v3(((col - 1) * S) / 3, ((row + 0.5) * S) / 3, -2), v3(S / 6, S / 6, 0.12)),
            );
      return cells;
    }
    case 'floor': {
      if (!edit) return [local(v3(0, 0.06, 0), v3(2, 0.08, 2))];
      const cells: BoxShape[] = [];
      for (let i = 0; i < 4; i++)
        if (!(edit & (1 << i)))
          cells.push(local(v3(i % 2 ? 1 : -1, 0.06, i >= 2 ? 1 : -1), v3(1, 0.08, 1)));
      return cells;
    }
    case 'ramp':
      return [
        local(
          v3(0, 2, 0),
          v3(2, 2, 2),
          [-2, -2, -2, 2, -2, -2, -2, -2, 2, 2, -2, 2, -2, 2, -2, 2, 2, -2],
        ),
      ];
    case 'cone':
      return [
        local(v3(0, 1, 0), v3(2, 1, 2), [-2, -1, -2, 2, -1, -2, -2, -1, 2, 2, -1, 2, 0, 1, 0]),
      ];
  }
}
export function groundSupported(p: BuildRequest): boolean {
  const corners = [
    [-1.8, -1.8],
    [1.8, -1.8],
    [-1.8, 1.8],
    [1.8, 1.8],
    [0, 0],
  ];
  return corners.some(
    ([x, z]) => Math.abs(p.gy * S - sampleGround(p.gx * S + x, p.gz * S + z)) < 2.3,
  );
}
/** Edges describe physical contact, including stair endpoints at the next level. */
export function connected(a: BuildRequest, b: BuildRequest): boolean {
  const dx = Math.abs(a.gx - b.gx),
    dz = Math.abs(a.gz - b.gz),
    dy = Math.abs(a.gy - b.gy);
  if (dx > 1 || dz > 1 || dx + dz > 1 || dy > 1.001) return false;
  const bounds = (p: BuildRequest) =>
    buildShapes(p).map((s) => {
      const yaw = s.yaw ?? 0,
        c = Math.abs(Math.cos(yaw)),
        n = Math.abs(Math.sin(yaw));
      return {
        x: s.center.x,
        y: s.center.y,
        z: s.center.z,
        hx: c * s.half.x + n * s.half.z,
        hy: s.half.y,
        hz: n * s.half.x + c * s.half.z,
      };
    });
  return bounds(a).some((x) =>
    bounds(b).some(
      (y) =>
        Math.abs(x.x - y.x) <= x.hx + y.hx + 0.05 &&
        Math.abs(x.y - y.y) <= x.hy + y.hy + 0.05 &&
        Math.abs(x.z - y.z) <= x.hz + y.hz + 0.05,
    ),
  );
}
export function supportedIds(pieces: BuildPiece[]): Set<number> {
  const supported = new Set(pieces.filter(groundSupported).map((p) => p.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of pieces)
      if (!supported.has(p.id) && pieces.some((q) => supported.has(q.id) && connected(p, q))) {
        supported.add(p.id);
        changed = true;
      }
  }
  return supported;
}
export function sameBuild(a: BuildRequest, b: BuildRequest) {
  return (
    a.kind === b.kind &&
    a.gx === b.gx &&
    a.gy === b.gy &&
    a.gz === b.gz &&
    (a.kind === 'floor' || a.kind === 'cone' || a.rotation % 4 === b.rotation % 4)
  );
}
export function actorOverlapsBuild(p: BuildRequest, actor: Pick<Actor, 'pos' | 'alive'>): boolean {
  if (!actor.alive) return false;
  const a = rotateLocal(
    v3(actor.pos.x - p.gx * S, actor.pos.y - p.gy * S, actor.pos.z - p.gz * S),
    -p.rotation,
  );
  if (a.y > 4 || a.y + CONFIG.playerHeight < -0.12) return false;
  if (p.kind === 'wall') return Math.abs(a.x) < 2.34 && Math.abs(a.z + 2) < 0.48;
  if (Math.abs(a.x) > 2.3 || Math.abs(a.z) > 2.3) return false;
  if (p.kind === 'floor') return a.y < 0.18 && a.y + CONFIG.playerHeight > -0.12;
  const top = p.kind === 'ramp' ? 2 - a.z : 2 - Math.max(Math.abs(a.x), Math.abs(a.z));
  return a.y < top - 0.1 && a.y + CONFIG.playerHeight > 0;
}
export function validatePlacement(
  p: BuildRequest,
  pieces: BuildPiece[],
  actors: Pick<Actor, 'pos' | 'alive'>[],
  resources: Record<Material, number>,
  origin: Vec3,
): string | null {
  if (resources[p.material] < CONFIG.buildCost) return `Need ${CONFIG.buildCost} ${p.material}`;
  if (Math.hypot(p.gx * S - origin.x, p.gz * S - origin.z) > CONFIG.maxBuildDistance + 2)
    return 'Out of reach';
  if (p.gy < -1 || p.gy > 35) return 'Outside build height';
  if (pieces.some((q) => sameBuild(p, q))) return 'Already built';
  if (actors.some((a) => actorOverlapsBuild(p, a))) return 'Player in the way';
  if (
    p.gy * S + (p.kind === 'wall' || p.kind === 'ramp' ? 4 : 1) <
    sampleGround(p.gx * S, p.gz * S) - 0.3
  )
    return 'Blocked by terrain';
  if (!groundSupported(p) && !pieces.some((q) => connected(p, q)))
    return 'Needs structural support';
  return null;
}
export function newPiece(request: BuildRequest, id: number, owner: number): BuildPiece {
  return {
    ...request,
    id,
    owner,
    edit: 0,
    health: 35,
    age: 0,
    maxHealth: BUILD_HEALTH[request.material],
    handles: [],
  };
}
export function validEdit(kind: BuildRequest['kind'], mask: number) {
  if (kind === 'wall') return Number.isInteger(mask) && mask >= 0 && mask < 511;
  if (kind === 'floor') return Number.isInteger(mask) && mask >= 0 && mask < 15;
  return mask >= 0 && mask < 4;
}
