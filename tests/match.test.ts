import { beforeAll, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Game } from '../src/sim/game';
import { makeItem } from '../src/sim/inventory';
import { norm, sub, v3 } from '../src/sim/math';
import { initPhysics } from '../src/sim/physics';
import { emptyInput } from '../src/sim/types';
beforeAll(async () => {
  await initPhysics();
});
it('bots land, acquire real loot and fight through a full deterministic match', () => {
  const g = new Game('solo', 741),
    stats = { shots: 0, hits: 0, eliminations: 0, landed: 0, equipped: 0, frames: 0 };
  // A stationary player is a valid complete elimination route. Keep observing
  // after their result screen solely to validate that every AI can finish.
  for (let i = 0; i < 60 * 390; i++) {
    if (g.phase === 'finished' && g.alive > 1) g.phase = 'playing';
    g.tick(CONFIG.step, emptyInput());
    stats.frames++;
    for (const e of g.events) {
      if (e.type === 'shot') stats.shots++;
      if (e.type === 'hit') stats.hits++;
      if (e.type === 'elimination') stats.eliminations++;
    }
    g.events.length = 0;
    stats.landed = Math.max(
      stats.landed,
      g.actors.filter((a) => a.bot && a.dropped && a.ai.state !== 'drop').length,
    );
    stats.equipped = Math.max(
      stats.equipped,
      g.actors.filter(
        (a) => a.bot && a.inventory.some((i) => i && i.kind !== 'shield' && i.kind !== 'medkit'),
      ).length,
    );
    if (g.alive <= 1) break;
  }
  console.info(
    'Match evidence',
    JSON.stringify({
      ...stats,
      alive: g.alive,
      time: g.time,
      health: g.player.health,
      states: g.actors.filter((a) => a.alive).map((a) => a.ai.state),
    }),
  );
  expect(stats.landed).toBe(CONFIG.bots);
  expect(stats.equipped).toBeGreaterThan(8);
  expect(stats.shots).toBeGreaterThan(20);
  expect(stats.hits).toBeGreaterThan(5);
  expect(g.alive).toBeLessThanOrEqual(1);
  expect(g.time).toBeLessThan(390);
  g.dispose();
}, 60000);
it('hitscan headshots, muzzle cover and sniper projectiles obey actual Rapier collision', () => {
  const g = new Game('solo', 25),
    a = g.player,
    target = g.actors[1];
  // Move this combat fixture away from island props and remove unrelated actors.
  for (const bot of g.actors.slice(2)) g.eliminate(bot, null, 'fixture');
  a.pos = v3(0, 50, 0);
  a.yaw = 0;
  a.dropped = true;
  target.pos = v3(0, 50, -12);
  target.dropped = true;
  target.shield = 100;
  target.health = 100;
  g.physics.teleport(a);
  g.physics.teleport(target);
  g.physics.step();
  a.inventory = [makeItem('rifle'), makeItem('sniper'), null, null, null];
  a.selected = 0;
  const origin = v3(0, 51.45, 0),
    dir = norm(sub(v3(0, 51.62, -12), origin));
  g.fire(a, origin, dir, true, true);
  expect(target.shield).toBeLessThan(100);
  expect(target.health).toBe(100);
  expect(a.inventory[0]!.ammo).toBe(29);
  a.cooldown = 0;
  g.physics.addShape(
    { center: v3(0, 51.4, -0.85), half: v3(1, 1, 0.1) },
    { kind: 'object', id: 99999 },
  );
  g.physics.step();
  const before = target.shield;
  g.fire(a, v3(1.5, 51.45, 0), norm(sub(v3(0, 51.5, -12), v3(1.5, 51.45, 0))), true, true);
  expect(target.shield).toBe(before);
  g.dispose();
  const s = new Game('solo', 25),
    pilot = s.player,
    victim = s.actors[1];
  pilot.pos = v3(0, 60, 0);
  pilot.yaw = 0;
  victim.pos = v3(0, 60, -20);
  s.physics.teleport(pilot);
  s.physics.teleport(victim);
  s.physics.step();
  pilot.inventory[0] = makeItem('sniper');
  pilot.selected = 0;
  s.fire(pilot, v3(0, 61.4, 0), v3(0, 0, -1), true, true);
  expect(s.projectiles).toHaveLength(1);
  expect(victim.health).toBe(100);
  for (let i = 0; i < 12; i++) s.updateProjectiles(CONFIG.step);
  expect(victim.health).toBeLessThan(100);
  expect(s.projectiles).toHaveLength(0);
  s.dispose();
});
