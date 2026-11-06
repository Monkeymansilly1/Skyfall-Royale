export const CONFIG = {
  step: 1 / 60,
  islandRadius: 172,
  terrainSize: 440,
  terrainSegments: 110,
  bots: 16,
  gravity: 24,
  sniperSpeed: 145,
  sniperGravity: 7,
  moveSpeed: 6.6,
  sprintSpeed: 10.4,
  crouchSpeed: 3.5,
  acceleration: 38,
  airAcceleration: 12,
  jumpSpeed: 8.8,
  playerRadius: 0.34,
  playerHeight: 1.8,
  cameraDistance: 5.1,
  cameraShoulder: 0.75,
  aimFov: 47,
  fov: 76,
  buildSize: 4,
  buildCost: 10,
  maxBuildDistance: 9,
  constructionTime: 3,
  interactDistance: 3,
  dropHeight: 94,
  gliderHeight: 23,
  shieldMax: 100,
  healthMax: 100,
  stormWait: [48, 25, 20, 15, 8],
  stormShrink: [40, 34, 28, 24, 22],
  stormRadius: [123, 83, 48, 22, 0],
  stormDamage: [1, 2, 4, 7, 12],
} as const;
export type WeaponId = 'pickaxe' | 'rifle' | 'shotgun' | 'smg' | 'sniper';
export type ItemId = WeaponId | 'shield' | 'medkit';
export type Rarity = 0 | 1 | 2 | 3 | 4;
export interface WeaponDef {
  name: string;
  damage: number;
  rate: number;
  magazine: number;
  reload: number;
  range: number;
  pellets: number;
  spread: number;
  recoil: number;
  automatic: boolean;
  headshot: number;
  falloff: number;
  switchTime: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    name: 'Skyhook',
    damage: 30,
    rate: 1.7,
    magazine: 0,
    reload: 0,
    range: 3.4,
    pellets: 1,
    spread: 0,
    recoil: 0,
    automatic: true,
    headshot: 1,
    falloff: 1,
    switchTime: 0.15,
  },
  rifle: {
    name: 'Ranger AR',
    damage: 27,
    rate: 6.2,
    magazine: 30,
    reload: 2.2,
    range: 150,
    pellets: 1,
    spread: 0.017,
    recoil: 0.014,
    automatic: true,
    headshot: 1.8,
    falloff: 0.5,
    switchTime: 0.24,
  },
  shotgun: {
    name: 'Thunder Pump',
    damage: 10,
    rate: 0.9,
    magazine: 5,
    reload: 3.1,
    range: 45,
    pellets: 10,
    spread: 0.064,
    recoil: 0.055,
    automatic: false,
    headshot: 1.65,
    falloff: 0.1,
    switchTime: 0.4,
  },
  smg: {
    name: 'Wasp SMG',
    damage: 16,
    rate: 11,
    magazine: 32,
    reload: 1.7,
    range: 90,
    pellets: 1,
    spread: 0.029,
    recoil: 0.01,
    automatic: true,
    headshot: 1.5,
    falloff: 0.25,
    switchTime: 0.22,
  },
  sniper: {
    name: 'Longshot',
    damage: 93,
    rate: 0.7,
    magazine: 1,
    reload: 2.7,
    range: 300,
    pellets: 1,
    spread: 0.0015,
    recoil: 0.08,
    automatic: false,
    headshot: 2.2,
    falloff: 1,
    switchTime: 0.5,
  },
};
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export const RARITY_COLORS = ['#a0afba', '#68c579', '#4db9f3', '#be7afa', '#f8c653'];
export const ITEM_NAMES: Record<ItemId, string> = {
  pickaxe: 'Skyhook',
  rifle: 'Ranger AR',
  shotgun: 'Thunder Pump',
  smg: 'Wasp SMG',
  sniper: 'Longshot',
  shield: 'Shield flask',
  medkit: 'Field kit',
};
export type BuildKind = 'wall' | 'floor' | 'ramp' | 'cone';
export type Material = 'wood' | 'brick' | 'metal';
export const MATERIALS: Material[] = ['wood', 'brick', 'metal'];
export const BUILD_HEALTH: Record<Material, number> = { wood: 150, brick: 240, metal: 360 };
