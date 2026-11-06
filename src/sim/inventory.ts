import { WEAPONS, type ItemId, type Rarity, type WeaponId } from '../config';
import type { Actor, Item } from './types';
export function makeItem(kind: ItemId, rarity: Rarity = 0, count = 1): Item {
  const weapon = kind in WEAPONS ? WEAPONS[kind as WeaponId] : null;
  return {
    kind,
    rarity,
    ammo: weapon?.magazine ?? 0,
    reserve: weapon ? weapon.magazine * 3 : 0,
    count,
  };
}
export function activeItem(actor: Actor): Item {
  return actor.inventory[actor.selected] ?? makeItem('pickaxe');
}
export function isWeapon(item: Item): item is Item & { kind: WeaponId } {
  return item.kind in WEAPONS;
}
/** Transfer owns its inputs: callers can safely retain dropped-item snapshots. */
export function transferItem(
  inventory: (Item | null)[],
  incoming: Item,
  selected: number,
): { slots: (Item | null)[]; dropped: Item | null; slot: number } {
  const slots = inventory.map((i) => (i ? { ...i } : null));
  const stack = slots.findIndex(
    (i) =>
      i?.kind === incoming.kind &&
      (i.kind === 'shield' || i.kind === 'medkit') &&
      i.count + incoming.count <= (i.kind === 'shield' ? 6 : 3),
  );
  if (stack >= 0) {
    slots[stack]!.count += incoming.count;
    return { slots, dropped: null, slot: stack };
  }
  let slot = slots.findIndex((i) => i === null);
  if (slot < 0) slot = Math.max(0, Math.min(4, selected));
  const dropped = slots[slot];
  slots[slot] = { ...incoming };
  return { slots, dropped, slot };
}
export function applyDamage(
  actor: Pick<Actor, 'health' | 'shield'>,
  amount: number,
  bypassShield = false,
) {
  const shield = bypassShield ? 0 : Math.min(actor.shield, amount);
  actor.shield -= shield;
  const health = Math.min(actor.health, Math.max(0, amount - shield));
  actor.health -= health;
  return { shield, health };
}
