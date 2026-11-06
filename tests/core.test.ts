import { beforeAll, describe, expect, it } from 'vitest';
import { BUILD_HEALTH, CONFIG } from '../src/config';
import {
  buildShapes,
  newPiece,
  supportedIds,
  validatePlacement,
  validEdit,
} from '../src/sim/building';
import { Game } from '../src/sim/game';
import { activeItem, applyDamage, makeItem, transferItem } from '../src/sim/inventory';
import { sampleGround } from '../src/sim/map';
import { random, v3 } from '../src/sim/math';
import { initPhysics } from '../src/sim/physics';
import { Storm } from '../src/sim/storm';
import { emptyInput, type BuildRequest } from '../src/sim/types';
beforeAll(async () => {
  await initPhysics();
});
const request = (extra: Partial<BuildRequest> = {}): BuildRequest => ({
  kind: 'wall',
  material: 'wood',
  gx: 0,
  gz: 0,
  gy: Math.round(sampleGround(0, 0) / 4),
  rotation: 0,
  ...extra,
});
describe('inventory and damage', () => {
  it('transfers into five slots, swaps a full slot and preserves both item snapshots', () => {
    const incoming = makeItem('sniper', 4),
      slots = [
        makeItem('rifle'),
        makeItem('shotgun'),
        makeItem('smg'),
        makeItem('shield'),
        makeItem('medkit'),
      ];
    const result = transferItem(slots, incoming, 2);
    expect(result.slots).toHaveLength(5);
    expect(result.dropped?.kind).toBe('smg');
    expect(result.slots[2]?.kind).toBe('sniper');
    result.slots[2]!.ammo = 0;
    expect(incoming.ammo).toBe(1);
    expect(slots[2].kind).toBe('smg');
  });
  it('stacks consumables without losing weapons', () => {
    const result = transferItem(
      [makeItem('shield', 1, 2), null, null, null, null],
      makeItem('shield', 1, 3),
      0,
    );
    expect(result.slots[0]?.count).toBe(5);
    expect(result.dropped).toBeNull();
  });
  it('absorbs shield, spills into health and bypasses shield for storm damage', () => {
    const a = { health: 100, shield: 40 };
    expect(applyDamage(a, 60)).toEqual({ shield: 40, health: 20 });
    expect(a).toEqual({ health: 80, shield: 0 });
    a.shield = 100;
    applyDamage(a, 15, true);
    expect(a).toEqual({ health: 65, shield: 100 });
    applyDamage(a, 999);
    expect(a.health).toBe(0);
  });
});
describe('storm and structural rules', () => {
  it('moves through every wait/shrink stage and closes completely over playable land', () => {
    const s = new Storm(random(94));
    let stages = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      stages.add(s.stage);
      s.update(0.1);
      expect(sampleGround(s.target.x, s.target.z)).toBeGreaterThan(0);
      expect(
        Math.hypot(s.target.x - s.center.x, s.target.z - s.center.z) + s.targetRadius,
      ).toBeLessThanOrEqual(s.radius + 0.001);
    }
    expect(stages.size).toBe(5);
    expect(s.complete).toBe(true);
    expect(s.radius).toBe(0);
  });
  it('rejects empty wallets, duplicates, unsupported pieces, and player overlaps', () => {
    const p = request(),
      wallet = { wood: 0, brick: 0, metal: 0 },
      origin = v3(0, p.gy * 4, 0);
    expect(validatePlacement(p, [], [], wallet, origin)).toContain('Need');
    wallet.wood = 100;
    expect(validatePlacement(p, [newPiece(p, 1, 0)], [], wallet, origin)).toBe('Already built');
    expect(validatePlacement({ ...p, gy: p.gy + 4 }, [], [], wallet, origin)).toBe(
      'Needs structural support',
    );
    expect(
      validatePlacement(p, [], [{ pos: v3(0, p.gy * 4, -2), alive: true }], wallet, origin),
    ).toBe('Player in the way');
  });
  it('keeps connected upper floors and collapses them when the foundation disappears', () => {
    const p = request(),
      a = newPiece(p, 1, 0),
      b = newPiece({ ...p, kind: 'floor', gy: p.gy + 1 }, 2, 0),
      c = newPiece({ ...p, kind: 'floor', gx: 1, gy: p.gy + 1 }, 3, 0);
    expect([...supportedIds([a, b, c])].sort()).toEqual([1, 2, 3]);
    expect(supportedIds([b, c]).size).toBe(0);
  });
  it('edits wall cells, floor quadrants and ramp orientation without a full-piece deletion', () => {
    expect(buildShapes({ ...request(), edit: 18 })).toHaveLength(7);
    expect(buildShapes({ ...request({ kind: 'floor' }), edit: 1 })).toHaveLength(3);
    expect(validEdit('wall', 511)).toBe(false);
    expect(validEdit('floor', 15)).toBe(false);
    expect(validEdit('ramp', 3)).toBe(true);
  });
});
describe('Rapier gameplay integration', () => {
  it('walks, accelerates, stops and jumps on the shared terrain', () => {
    const g = new Game('practice', 3),
      a = g.player,
      start = { ...a.pos };
    for (let i = 0; i < 120; i++) g.tick(CONFIG.step, { ...emptyInput(), moveZ: 1, yaw: 0 });
    expect(a.pos.z).toBeLessThan(start.z - 8);
    expect(a.grounded).toBe(true);
    for (let i = 0; i < 30; i++) g.tick(CONFIG.step, emptyInput());
    expect(Math.hypot(a.velocity.x, a.velocity.z)).toBeLessThan(0.1);
    const y = a.pos.y;
    g.tick(CONFIG.step, { ...emptyInput(), jump: true });
    for (let i = 0; i < 15; i++) g.tick(CONFIG.step, emptyInput());
    expect(a.pos.y).toBeGreaterThan(y + 1);
    g.dispose();
  });
  it('updates actual wall and floor collision after edits', () => {
    const g = new Game('practice', 2),
      a = g.player,
      x = 0,
      z = 24,
      y = sampleGround(x, z),
      req = request({ gx: 0, gz: 6, gy: y / 4 }),
      p = newPiece(req, 9000, 0);
    p.handles = buildShapes(p).map((s) => g.physics.addShape(s, { kind: 'build', id: p.id }));
    g.builds.push(p);
    g.physics.step();
    let hit = g.physics.ray(v3(0, y + 0.8, z + 1), v3(0, 0, -1), 5, a.id, true);
    expect(hit?.owner?.kind).toBe('build');
    g.editing = p;
    g.editMask = 18;
    g.confirmEdit();
    g.physics.step();
    hit = g.physics.ray(v3(0, y + 0.8, z + 1), v3(0, 0, -1), 5, a.id, true);
    expect(hit?.owner?.kind).not.toBe('build');
    const floor = newPiece(request({ kind: 'floor', gx: 3, gz: 6, gy: (y + 6) / 4 }), 9001, 0);
    floor.handles = buildShapes(floor).map((s) =>
      g.physics.addShape(s, { kind: 'build', id: floor.id }),
    );
    g.builds.push(floor);
    g.physics.step();
    expect(g.physics.ray(v3(11, y + 10, 23), v3(0, -1, 0), 6, a.id, true)?.owner?.id).toBe(
      floor.id,
    );
    g.editing = floor;
    g.editMask = 1;
    g.confirmEdit();
    g.physics.step();
    expect(g.physics.ray(v3(11, y + 10, 23), v3(0, -1, 0), 6, a.id, true)?.owner?.id).not.toBe(
      floor.id,
    );
    g.dispose();
  });
  it('deducts materials, grows build health and removes unsupported upper structures on destruction', () => {
    const g = new Game('practice', 4),
      a = g.player,
      req = request({ gx: 0, gz: 5, gy: sampleGround(0, 20) / 4 }),
      before = a.materials.wood;
    const p = g.placeBuild(req);
    expect(p).not.toBeNull();
    expect(a.materials.wood).toBe(before - 10);
    for (let i = 0; i < 200; i++) g.tick(CONFIG.step, emptyInput());
    expect(p!.health).toBe(BUILD_HEALTH.wood);
    const upper = g.placeBuild({ ...req, kind: 'floor', gy: req.gy + 1 });
    expect(upper).not.toBeNull();
    g.damageStructure(p!.id, 999);
    expect(g.builds).toHaveLength(0);
    g.dispose();
  });
  it('blocks firing while reloading and switches weapons without phantom reloads', () => {
    const g = new Game('practice', 4),
      a = g.player,
      item = activeItem(a);
    item.ammo = 1;
    g.reload();
    const before = item.ammo;
    g.fire(a, v3(0, 30, 10), v3(0, 0, -1), true);
    expect(item.ammo).toBe(before);
    expect(g.events.filter((e) => e.type === 'shot')).toHaveLength(0);
    g.select(1);
    expect(a.reloading).toBe(0);
    g.dispose();
  });
  it('opens and closes door collision', () => {
    const g = new Game('practice', 4),
      door = g.objects.find((o) => o.kind === 'door')!;
    g.toggleDoor(door);
    expect(door.handles).toHaveLength(0);
    expect(door.opened).toBe(true);
    g.toggleDoor(door);
    expect(door.handles.length).toBeGreaterThan(0);
    g.dispose();
  });
  it('finishes elimination/victory and creates a clean new match', () => {
    const g = new Game('solo', 10);
    g.eliminate(g.player, g.actors[1], 'test');
    g.checkEnd();
    expect(g.phase).toBe('finished');
    expect(g.placement).toBe(17);
    g.dispose();
    const fresh = new Game('solo', 10);
    for (const bot of fresh.actors.filter((a) => a.bot))
      fresh.eliminate(bot, fresh.player, 'Ranger AR');
    fresh.checkEnd();
    expect(fresh.phase).toBe('finished');
    expect(fresh.placement).toBe(1);
    expect(fresh.player.kills).toBe(16);
    fresh.dispose();
  });
});

describe('camera and non-box collision', () => {
  it('edits a placed wall at the full shoulder-camera build distance', () => {
    const g = new Game('practice', 12),
      p = g.placeBuild(request({ gx: 0, gz: 2, gy: sampleGround(0, 8) / 4 }));
    expect(p).not.toBeNull();
    g.physics.step();
    const origin = v3(0.75, 21.85, 20),
      direction = v3(0, -0.05, -Math.sqrt(1 - 0.05 * 0.05));
    g.beginEdit(origin, direction);
    expect(g.editing?.id).toBe(p!.id);
    g.selectEditRegion(origin, direction);
    expect(g.editMask).not.toBe(0);
    g.dispose();
  });
  it('climbs a true ramp wedge and detects the pyramid surface of a cone', () => {
    const g = new Game('practice', 12),
      a = g.player;
    g.physics.addShape(
      { center: v3(20, 39.9, 16), half: v3(10, 0.1, 10) },
      { kind: 'object', id: 991 },
    );
    const ramp = request({ kind: 'ramp', gx: 5, gz: 3, gy: 10 });
    for (const s of buildShapes(ramp)) g.physics.addShape(s, { kind: 'build', id: 992 });
    g.physics.addShape(
      { center: v3(20, 43.9, 8), half: v3(2, 0.1, 2) },
      { kind: 'object', id: 993 },
    );
    a.pos = v3(20, 40.05, 16);
    a.velocity = v3();
    g.physics.teleport(a);
    g.physics.step();
    for (let i = 0; i < 90; i++) g.tick(CONFIG.step, { ...emptyInput(), moveZ: 1 });
    expect(a.pos.y).toBeGreaterThan(42.5);
    const cone = request({ kind: 'cone', gx: 10, gz: 10, gy: 10 });
    for (const s of buildShapes(cone)) g.physics.addShape(s, { kind: 'build', id: 994 });
    g.physics.step();
    const top = g.physics.ray(v3(40, 45, 40), v3(0, -1, 0), 8, a.id, true);
    expect(top?.owner?.id).toBe(994);
    expect(top?.point.y).toBeCloseTo(42, 1);
    g.dispose();
  });
  it('stops the shoulder camera at walls and refuses an edit that traps a player', () => {
    const g = new Game('practice', 12),
      a = g.player,
      base = sampleGround(0, 20),
      p = newPiece(request({ gx: 0, gz: 5, gy: base / 4 }), 9991, 0);
    p.handles = buildShapes(p).map((s) => g.physics.addShape(s, { kind: 'build', id: p.id }));
    g.builds.push(p);
    g.physics.step();
    const collision = g.physics.cameraDistance(v3(0, base + 1.5, 15), v3(0, base + 1.5, 22), a.id);
    expect(collision).toBeLessThan(3);
    g.editing = p;
    g.editMask = 18;
    g.confirmEdit();
    g.physics.step();
    a.pos = v3(0, base + 0.05, 18);
    g.physics.teleport(a);
    g.physics.step();
    g.editing = p;
    g.editMask = 0;
    g.confirmEdit();
    expect(p.edit).toBe(18);
    expect(g.editing).not.toBeNull();
    g.dispose();
  });
});

it('settles dropped inventory onto collision surfaces and harvests metal cover', () => {
  const g = new Game('practice', 12);
  g.player.pos.y += 10;
  g.player.selected = 0;
  g.dropItem();
  const dropped = g.loot[g.loot.length - 1];
  expect(dropped.settling).toBe(true);
  for (let i = 0; i < 180; i++) g.updateLoot(CONFIG.step);
  expect(dropped.settling).toBe(false);
  expect(dropped.pos.y).toBeCloseTo(sampleGround(dropped.pos.x, dropped.pos.z) + 0.2, 1);
  const metal = g.objects.find((o) => o.resource === 'metal');
  expect(metal).toBeDefined();
  g.player.materials.metal = 0;
  g.damageObject(metal!.id, 45, g.player, true);
  expect(g.player.materials.metal).toBe(18);
  g.dispose();
});

it('respawns a practice accident with the inventory and physics character intact', () => {
  const g = new Game('practice', 12);
  g.hurt(g.player, 500, null, 'a fall', true);
  expect(g.player.alive).toBe(true);
  expect(g.player.health).toBe(100);
  expect(g.player.inventory[0]?.kind).toBe('rifle');
  expect(g.physics.characters.size).toBe(1);
  expect(g.phase).toBe('playing');
  g.dispose();
});
