import type { BuildKind, ItemId, Material, Rarity, WeaponId } from '../config';
import type { Vec3 } from './math';
export interface Item {
  kind: ItemId;
  rarity: Rarity;
  ammo: number;
  reserve: number;
  count: number;
}
export type BotState = 'drop' | 'loot' | 'roam' | 'zone' | 'engage' | 'heal';
export interface Actor {
  id: number;
  name: string;
  bot: boolean;
  pos: Vec3;
  velocity: Vec3;
  yaw: number;
  health: number;
  shield: number;
  alive: boolean;
  grounded: boolean;
  crouched: boolean;
  sprinting: boolean;
  sliding: number;
  mantle: number;
  gliding: boolean;
  dropped: boolean;
  inventory: (Item | null)[];
  selected: number;
  materials: Record<Material, number>;
  reloading: number;
  consuming: number;
  cooldown: number;
  switchTimer: number;
  kills: number;
  damageDone: number;
  damageTaken: number;
  harvested: number;
  built: number;
  lastHurt: number;
  lastShot: number;
  animation: number;
  bodyHandle: number;
  ai: {
    state: BotState;
    target: number | null;
    goal: Vec3;
    timer: number;
    reaction: number;
    strafe: number;
    stuck: number;
    lastPos: Vec3;
    seen: Vec3;
    lastSeen: number;
  };
}
export interface BuildPiece {
  id: number;
  owner: number;
  kind: BuildKind;
  material: Material;
  gx: number;
  gy: number;
  gz: number;
  rotation: number;
  edit: number;
  health: number;
  age: number;
  maxHealth: number;
  handles: number[];
}
export interface BuildRequest {
  kind: BuildKind;
  material: Material;
  gx: number;
  gy: number;
  gz: number;
  rotation: number;
}
export interface Loot {
  id: number;
  pos: Vec3;
  item: Item;
  chest?: boolean;
  settling?: boolean;
  velocity?: number;
}
export interface Projectile {
  id: number;
  owner: number;
  pos: Vec3;
  velocity: Vec3;
  damage: number;
  headshot: number;
  life: number;
}
export interface BoxShape {
  center: Vec3;
  half: Vec3;
  yaw?: number;
  vertices?: number[];
}
export interface MapObject {
  id: number;
  kind: 'tree' | 'rock' | 'wall' | 'floor' | 'roof' | 'stairs' | 'crate' | 'door' | 'target';
  pos: Vec3;
  size: Vec3;
  yaw: number;
  color: number;
  health: number;
  resource?: Material;
  shapes: BoxShape[];
  handles: number[];
  opened?: boolean;
  location?: string;
}
export type GameEvent =
  | { type: 'shot'; actor: number; weapon: WeaponId; from: Vec3; to: Vec3 }
  | {
      type: 'hit';
      pos: Vec3;
      amount: number;
      shield: boolean;
      headshot: boolean;
      attacker: number;
      victim: number;
    }
  | { type: 'impact'; pos: Vec3; material?: Material }
  | { type: 'elimination'; killer: string; victim: string; weapon: string; player: boolean }
  | {
      type: 'sound';
      name:
        | 'pickup'
        | 'build'
        | 'edit'
        | 'reload'
        | 'drink'
        | 'jump'
        | 'step'
        | 'land'
        | 'break'
        | 'storm'
        | 'victory'
        | 'chest';
      pos: Vec3;
    }
  | { type: 'toast'; text: string };
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  jumpHeld: boolean;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  firePressed: boolean;
  aim: boolean;
  aimOrigin: Vec3;
  aimDirection: Vec3;
}
export const emptyInput = (): PlayerInput => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  jumpHeld: false,
  sprint: false,
  crouch: false,
  fire: false,
  firePressed: false,
  aim: false,
  aimOrigin: { x: 0, y: 0, z: 0 },
  aimDirection: { x: 0, y: 0, z: -1 },
});
