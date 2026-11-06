import {
  CONFIG,
  WEAPONS,
  MATERIALS,
  type BuildKind,
  type Material,
  type Rarity,
  type WeaponId,
} from '../config';
import { activeItem, applyDamage, isWeapon, makeItem, transferItem } from './inventory';
import {
  buildShapes,
  rotateLocal,
  newPiece,
  supportedIds,
  validEdit,
  validatePlacement,
} from './building';
import { createMap, LOCATIONS, sampleGround } from './map';
import {
  add,
  angleLerp,
  clamp,
  dist,
  flatDist,
  forward,
  len,
  mul,
  norm,
  random,
  sub,
  v3,
  type Vec3,
} from './math';
import { Physics } from './physics';
import { Storm } from './storm';
import {
  emptyInput,
  type Actor,
  type BuildPiece,
  type BuildRequest,
  type GameEvent,
  type Item,
  type Loot,
  type MapObject,
  type PlayerInput,
  type Projectile,
} from './types';
export type Phase = 'menu' | 'bus' | 'drop' | 'playing' | 'finished';
export type Mode = 'solo' | 'practice' | 'menu';
const S = CONFIG.buildSize;
const BOT_NAMES = [
  'Cinder',
  'Juniper',
  'Mako',
  'Copper',
  'Echo',
  'Rook',
  'Comet',
  'Pebble',
  'Atlas',
  'Clover',
  'Tango',
  'Saffron',
  'Orbit',
  'Kestrel',
  'Basil',
  'Piper',
];
export class Game {
  physics: Physics;
  objects: MapObject[];
  actors: Actor[] = [];
  builds: BuildPiece[] = [];
  loot: Loot[] = [];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  player: Actor;
  storm: Storm;
  rng: () => number;
  phase: Phase;
  time = 0;
  busTime = 0;
  busPosition = v3(-145, CONFIG.dropHeight, -35);
  nextId = 5000;
  paused = false;
  winner: Actor | null = null;
  placement = 0;
  buildMode = false;
  buildKind: BuildKind = 'wall';
  material: Material = 'wood';
  buildRotation = 0;
  buildPreview: BuildRequest | null = null;
  buildError: string | null = null;
  buildCooldown = 0;
  editing: BuildPiece | null = null;
  editMask = 0;
  nearby: Loot | MapObject | null = null;
  feed: { text: string; time: number; player: boolean }[] = [];
  revision = 0;
  lastStormStage = 0;
  constructor(
    public mode: Mode = 'solo',
    seed = Date.now() % 1000000,
  ) {
    this.rng = random(seed);
    this.storm = new Storm(this.rng);
    this.physics = new Physics();
    this.objects = createMap();
    for (const o of this.objects) this.physics.addObject(o);
    this.phase = mode === 'menu' ? 'menu' : mode === 'practice' ? 'playing' : 'bus';
    const spawn = mode === 'solo' ? { ...this.busPosition } : v3(0, sampleGround(0, 15) + 0.1, 15);
    this.player = this.makeActor(0, 'You', spawn, false);
    this.actors.push(this.player);
    if (mode === 'practice') {
      this.player.inventory = [
        makeItem('rifle', 2),
        makeItem('shotgun', 1),
        makeItem('sniper', 3),
        makeItem('shield', 2, 3),
        makeItem('medkit', 1, 2),
      ];
      this.player.selected = 0;
      this.player.materials = { wood: 999, brick: 999, metal: 999 };
      this.player.dropped = true;
    }
    if (mode === 'solo')
      for (let i = 0; i < CONFIG.bots; i++)
        this.actors.push(this.makeActor(i + 1, BOT_NAMES[i], { ...this.busPosition }, true));
    this.spawnLoot();
    this.physics.step();
  }
  makeActor(id: number, name: string, pos: Vec3, bot: boolean): Actor {
    const location = LOCATIONS[id % LOCATIONS.length];
    const a: Actor = {
      id,
      name,
      bot,
      pos,
      velocity: v3(),
      yaw: 0,
      health: 100,
      shield: 0,
      alive: true,
      grounded: false,
      crouched: false,
      sprinting: false,
      sliding: 0,
      mantle: 0,
      gliding: false,
      dropped: false,
      inventory: Array(5).fill(null),
      selected: 5,
      materials: { wood: 100, brick: 60, metal: 30 },
      reloading: 0,
      consuming: 0,
      cooldown: 0,
      switchTimer: 0,
      kills: 0,
      damageDone: 0,
      damageTaken: 0,
      harvested: 0,
      built: 0,
      lastHurt: -100,
      lastShot: -100,
      animation: 0,
      bodyHandle: 0,
      ai: {
        state: 'drop',
        target: null,
        goal: v3(
          location.x + (this.rng() - 0.5) * 28,
          location.y,
          location.z + (this.rng() - 0.5) * 24,
        ),
        timer: 0,
        reaction: 0.6 + this.rng() * 0.6,
        strafe: this.rng() > 0.5 ? 1 : -1,
        stuck: 0,
        lastPos: { ...pos },
        seen: v3(),
        lastSeen: -100,
      },
    };
    this.physics.addActor(a);
    return a;
  }
  spawnLoot() {
    const kinds = ['rifle', 'shotgun', 'smg', 'shield', 'sniper', 'medkit'] as const;
    for (const [pi, p] of LOCATIONS.entries()) {
      const points = [
        v3(p.x - 10, p.y + 0.35, p.z - 3),
        v3(p.x - 8, p.y + 3.85, p.z - 6),
        v3(p.x + 11, p.y + 0.35, p.z + 7),
        v3(p.x + 13, p.y + 3.85, p.z + 5),
        v3(p.x, p.y + 0.2, p.z + 9),
        v3(p.x + 3, p.y + 0.2, p.z - 13),
        v3(p.x - 14, p.y + 7.4, p.z - 2),
        v3(p.x + 9, p.y + 0.2, p.z + 16),
      ];
      points.forEach((pos, i) => {
        if (i === 3 && pi !== 2) pos.y = p.y + 0.35;
        if (i === 6) {
          pos.x = p.x - 10;
          pos.z = p.z - 4;
          pos.y = p.y + (pi === 3 ? 3.5 : 7) + 3.8;
        }
        this.loot.push({
          id: this.nextId++,
          pos,
          item: makeItem(
            kinds[(i + pi) % kinds.length],
            (i === 6 ? 3 + Math.floor(this.rng() * 2) : Math.floor(this.rng() * 3)) as Rarity,
            kinds[(i + pi) % kinds.length] === 'shield' ? 2 : 1,
          ),
          chest: i === 6,
        });
      });
    }
    for (let i = 0; i < 70; i++) {
      const x = (this.rng() - 0.5) * 270,
        z = (this.rng() - 0.5) * 270,
        y = sampleGround(x, z);
      if (y > 2 && !LOCATIONS.some((p) => Math.hypot(x - p.x, z - p.z) < 22))
        this.loot.push({
          id: this.nextId++,
          pos: v3(x, y + 0.3, z),
          item: makeItem(kinds[i % kinds.length], Math.floor(this.rng() * 4) as Rarity),
        });
    }
    // Clearly visible starter drops near the central landing and practice targets.
    for (let i = 0; i < 3; i++)
      this.loot.push({
        id: this.nextId++,
        pos: v3(-5 + i * 4, sampleGround(-5 + i * 4, 17) + 0.3, 17),
        item: makeItem(['rifle', 'shotgun', 'shield'][i] as Item['kind'], 1, i === 2 ? 2 : 1),
      });
  }
  get alive() {
    return this.actors.filter((a) => a.alive).length;
  }
  get weapon() {
    return activeItem(this.player);
  }
  emit(event: GameEvent) {
    this.events.push(event);
  }
  toast(text: string) {
    this.emit({ type: 'toast', text });
  }
  jumpFromBus(a = this.player) {
    if (a.dropped) return;
    a.dropped = true;
    a.pos = { ...this.busPosition };
    a.velocity = v3(0, -4, 0);
    this.physics.teleport(a);
    if (!a.bot) this.phase = 'drop';
  }
  toggleGlider() {
    const a = this.player;
    if (this.phase === 'bus') {
      this.jumpFromBus();
      return;
    }
    if (this.phase === 'drop' && a.pos.y - sampleGround(a.pos.x, a.pos.z) > CONFIG.gliderHeight + 3)
      a.gliding = !a.gliding;
  }
  select(slot: number) {
    const a = this.player;
    if (a.selected === slot) return;
    a.selected = slot;
    a.reloading = 0;
    a.consuming = 0;
    a.switchTimer = isWeapon(activeItem(a))
      ? WEAPONS[activeItem(a).kind as WeaponId].switchTime
      : 0.25;
    this.buildMode = false;
    this.cancelEdit();
  }
  toggleBuild() {
    this.cancelEdit();
    this.buildMode = !this.buildMode;
    this.player.reloading = 0;
    this.player.consuming = 0;
  }
  chooseBuild(kind: BuildKind) {
    this.buildMode = true;
    this.buildKind = kind;
    this.cancelEdit();
  }
  cycleMaterial() {
    this.material = MATERIALS[(MATERIALS.indexOf(this.material) + 1) % 3];
  }
  reload(a = this.player) {
    const item = activeItem(a);
    if (!isWeapon(item) || item.kind === 'pickaxe' || a.reloading || a.consuming) return;
    if (item.ammo >= WEAPONS[item.kind].magazine || item.reserve <= 0) return;
    a.reloading = WEAPONS[item.kind].reload;
    this.emit({ type: 'sound', name: 'reload', pos: { ...a.pos } });
  }
  useConsumable(a = this.player) {
    const item = activeItem(a);
    if (isWeapon(item) || a.consuming || a.reloading) return;
    if (
      (item.kind === 'shield' && a.shield >= 100) ||
      (item.kind === 'medkit' && a.health >= 100)
    ) {
      if (!a.bot) this.toast('Already full');
      return;
    }
    a.consuming = item.kind === 'shield' ? 2.2 : 3.8;
    this.emit({ type: 'sound', name: 'drink', pos: { ...a.pos } });
  }
  dropItem(a = this.player) {
    if (a.selected > 4 || !a.inventory[a.selected]) return;
    const f = forward(a.yaw);
    this.loot.push({
      id: this.nextId++,
      pos: add(add(a.pos, mul(f, 1.3)), v3(0, 0.3, 0)),
      item: { ...a.inventory[a.selected]! },
      settling: true,
      velocity: 0,
    });
    a.inventory[a.selected] = null;
    a.reloading = 0;
    a.consuming = 0;
    this.revision++;
  }
  pickup(a: Actor, loot: Loot) {
    if (flatDist(a.pos, loot.pos) > CONFIG.interactDistance || Math.abs(a.pos.y - loot.pos.y) > 2.4)
      return false;
    if (!this.physics.clearLine(add(a.pos, v3(0, 1, 0)), loot.pos, a.id)) return false;
    const result = transferItem(a.inventory, loot.item, a.selected);
    this.loot = this.loot.filter((l) => l.id !== loot.id);
    a.inventory = result.slots;
    a.selected = result.slot;
    a.switchTimer = 0.25;
    a.reloading = 0;
    a.consuming = 0;
    if (result.dropped)
      this.loot.push({
        id: this.nextId++,
        pos: add(a.pos, v3(0.7, 0.3, 0.7)),
        item: result.dropped,
        settling: true,
        velocity: 0,
      });
    this.emit({ type: 'sound', name: loot.chest ? 'chest' : 'pickup', pos: { ...a.pos } });
    this.revision++;
    return true;
  }
  interact() {
    if (this.nearby && 'item' in this.nearby) this.pickup(this.player, this.nearby);
    else if (this.nearby?.kind === 'door') this.toggleDoor(this.nearby);
  }
  toggleDoor(door: MapObject) {
    door.opened = !door.opened;
    this.physics.remove(door.handles);
    door.handles = [];
    if (!door.opened) this.physics.addObject(door);
    this.revision++;
    this.emit({ type: 'sound', name: 'edit', pos: { ...door.pos } });
  }
  tick(dt: number, input: PlayerInput = emptyInput()) {
    if (this.paused || this.phase === 'menu' || this.phase === 'finished') return;
    this.time += dt;
    this.buildCooldown = Math.max(0, this.buildCooldown - dt);
    this.busTime += dt;
    this.busPosition.x = -145 + this.busTime * 17;
    if (this.mode === 'solo') {
      this.storm.update(dt);
      if (this.storm.stage !== this.lastStormStage) {
        this.lastStormStage = this.storm.stage;
        this.emit({ type: 'sound', name: 'storm', pos: { ...this.player.pos } });
      }
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      this.timers(a, dt);
      if (!a.dropped && this.mode === 'solo') {
        a.pos = { ...this.busPosition };
        this.physics.teleport(a);
        if ((a.bot && this.busTime > 1 + a.id * 0.65) || (!a.bot && this.busTime > 14))
          this.jumpFromBus(a);
        else continue;
      }
      if (!a.dropped && this.mode !== 'solo') a.dropped = true;
      if (a.bot) this.updateBot(a, dt);
      else this.updatePlayer(input, dt);
      if (this.mode === 'solo' && this.storm.outside(a.pos))
        this.hurt(a, this.storm.damage * dt, null, 'storm', true);
      if (a.pos.y < -1.2) this.hurt(a, 25 * dt, null, 'deep water', true);
    }
    for (const b of this.builds)
      if (b.age < CONFIG.constructionTime) {
        b.age += dt;
        b.health = Math.min(
          b.maxHealth,
          b.health + ((b.maxHealth - 35) * dt) / CONFIG.constructionTime,
        );
      }
    this.updateLoot(dt);
    this.updateProjectiles(dt);
    this.physics.step();
    this.updateNearby();
    this.feed = this.feed.filter((e) => this.time - e.time < 8);
    if (this.mode === 'solo') this.checkEnd();
  }
  timers(a: Actor, dt: number) {
    a.cooldown = Math.max(0, a.cooldown - dt);
    a.switchTimer = Math.max(0, a.switchTimer - dt);
    if (a.reloading > 0) {
      a.reloading -= dt;
      if (a.reloading <= 0) {
        const item = activeItem(a);
        if (isWeapon(item)) {
          const count = Math.min(WEAPONS[item.kind].magazine - item.ammo, item.reserve);
          item.ammo += count;
          item.reserve -= count;
        }
      }
    }
    if (a.consuming > 0) {
      a.consuming -= dt;
      if (a.consuming <= 0) {
        const item = activeItem(a);
        if (item.kind === 'shield') a.shield = Math.min(100, a.shield + 50);
        if (item.kind === 'medkit') a.health = 100;
        if (!isWeapon(item)) {
          item.count--;
          if (item.count <= 0) a.inventory[a.selected] = null;
        }
        this.revision++;
      }
    }
  }
  descent(a: Actor, dir: Vec3, dt: number) {
    const altitude = a.pos.y - sampleGround(a.pos.x, a.pos.z);
    if (altitude < CONFIG.gliderHeight) a.gliding = true;
    const speed = a.gliding ? 10 : 12,
      targetY = a.gliding ? -6.5 : -23;
    a.velocity.x += (dir.x * speed - a.velocity.x) * Math.min(1, dt * 4);
    a.velocity.z += (dir.z * speed - a.velocity.z) * Math.min(1, dt * 4);
    a.velocity.y += (targetY - a.velocity.y) * Math.min(1, dt * 3);
    this.physics.move(a, mul(a.velocity, dt));
    if (a.grounded || a.pos.y < sampleGround(a.pos.x, a.pos.z) + 0.15) {
      a.gliding = false;
      a.grounded = true;
      a.ai.state = 'loot';
      a.velocity.y = 0;
      if (!a.bot) {
        this.phase = 'playing';
        this.toast('You’re down. Gear up. Get to the circle.');
        this.emit({ type: 'sound', name: 'land', pos: { ...a.pos } });
      }
    }
  }
  updatePlayer(input: PlayerInput, dt: number) {
    const a = this.player;
    a.yaw = angleLerp(a.yaw, input.yaw, Math.min(1, dt * 18));
    const f = forward(input.yaw),
      right = v3(Math.cos(input.yaw), 0, -Math.sin(input.yaw));
    const movement = norm(add(mul(f, input.moveZ), mul(right, input.moveX)));
    if (this.phase === 'drop') {
      this.descent(a, movement, dt);
      return;
    }
    if (this.phase === 'bus') return;
    this.moveActor(
      a,
      movement,
      input.sprint && !input.aim,
      input.crouch,
      input.jump,
      dt,
      input.jumpHeld,
    );
    if (this.buildMode && !this.editing) {
      this.updateBuildPreview(input.aimOrigin, input.aimDirection);
      if (input.fire && this.buildCooldown <= 0 && this.buildPreview) {
        if (!this.buildError) this.placeBuild(this.buildPreview, a);
        else if (input.firePressed) this.toast(this.buildError);
        this.buildCooldown = 0.13;
      }
    } else if (!this.editing && input.fire) {
      if (!isWeapon(activeItem(a))) {
        if (input.firePressed) this.useConsumable();
      } else this.fire(a, input.aimOrigin, input.aimDirection, input.firePressed, input.aim);
    }
  }
  moveActor(
    a: Actor,
    dir: Vec3,
    sprint: boolean,
    crouch: boolean,
    jump: boolean,
    dt: number,
    mantleHeld = jump,
  ) {
    const wasGrounded = a.grounded,
      wasCrouched = a.crouched;
    a.crouched = crouch || (wasCrouched && !this.physics.canStand(a));
    a.sprinting = sprint && len(dir) > 0.1 && !crouch;
    if (crouch && !wasCrouched && wasGrounded && Math.hypot(a.velocity.x, a.velocity.z) > 8)
      a.sliding = 0.75;
    let speed: number = a.crouched
      ? CONFIG.crouchSpeed
      : a.sprinting
        ? CONFIG.sprintSpeed
        : CONFIG.moveSpeed;
    if (a.consuming > 0) speed *= 0.45;
    if (a.sliding > 0) {
      a.sliding -= dt;
      speed = 11.8;
    }
    const acceleration = wasGrounded ? CONFIG.acceleration : CONFIG.airAcceleration;
    const approach = (value: number, target: number) =>
      value + clamp(target - value, -acceleration * dt, acceleration * dt);
    if (a.sliding <= 0) {
      a.velocity.x = approach(a.velocity.x, dir.x * speed);
      a.velocity.z = approach(a.velocity.z, dir.z * speed);
    }
    if (jump && wasGrounded) {
      a.velocity.y = CONFIG.jumpSpeed;
      a.grounded = false;
      a.sliding = 0;
      this.emit({ type: 'sound', name: 'jump', pos: { ...a.pos } });
    }
    a.velocity.y = Math.max(-40, a.velocity.y - CONFIG.gravity * dt);
    // A short forward wall plus clear head space makes a predictable low mantle.
    if (mantleHeld && !wasGrounded && len(dir) > 0.1) {
      const low = this.physics.ray(add(a.pos, v3(0, 0.75, 0)), dir, 0.85, a.id, true);
      const high = this.physics.ray(add(a.pos, v3(0, 2, 0)), dir, 1, a.id, true);
      if (low && !high && a.mantle <= 0) {
        a.velocity.y = 7;
        a.mantle = 0.5;
      }
    }
    a.mantle = Math.max(0, a.mantle - dt);
    const old = { ...a.pos },
      fallSpeed = a.velocity.y;
    this.physics.move(a, mul(a.velocity, dt));
    if (!wasGrounded && a.grounded) {
      if (fallSpeed < -16) this.hurt(a, Math.max(0, (-fallSpeed - 15) * 4), null, 'a fall', true);
      this.emit({ type: 'sound', name: 'land', pos: { ...a.pos } });
    }
    const oldStep = Math.floor((a.animation * 2.5) / Math.PI);
    a.animation += flatDist(old, a.pos) * (a.crouched ? 1.8 : 1.3);
    if (
      a.grounded &&
      !a.crouched &&
      a.sliding <= 0 &&
      Math.floor((a.animation * 2.5) / Math.PI) !== oldStep
    )
      this.emit({ type: 'sound', name: 'step', pos: { ...a.pos } });
  }
  updateBuildPreview(origin: Vec3, direction: Vec3) {
    const hit = this.physics.ray(
      origin,
      direction,
      CONFIG.maxBuildDistance + 3,
      this.player.id,
      true,
    );
    const aimed =
      hit?.point ?? add(this.player.pos, mul(norm(v3(direction.x, 0, direction.z)), 5.5));
    const gx = Math.round(aimed.x / S),
      gz = Math.round(aimed.z / S);
    const ground = sampleGround(gx * S, gz * S);
    // Horizontal cells stay on a global 4 m grid. The first foundation establishes
    // a terrain-height origin; connected pieces retain that exact vertical grid.
    const anchor =
      this.builds.find((b) => hit?.owner?.kind === 'build' && b.id === hit.owner.id) ??
      this.builds.find(
        (b) => Math.abs(b.gx - gx) + Math.abs(b.gz - gz) <= 1 && Math.abs(b.gy * S - ground) < S,
      );
    let gy = ground / S;
    if (anchor) {
      gy = anchor.gy + Math.round(((hit?.point.y ?? ground) - anchor.gy * S) / S);
    }
    if (
      this.buildKind === 'floor' &&
      anchor &&
      hit?.point.y &&
      (anchor.kind === 'wall' || anchor.kind === 'ramp') &&
      hit.point.y > anchor.gy * S + 2
    )
      gy = anchor.gy + 1;
    this.buildPreview = {
      kind: this.buildKind,
      material: this.material,
      gx,
      gy,
      gz,
      rotation: this.buildRotation,
    };
    this.buildError = this.placementError(this.buildPreview, this.player);
  }
  placementError(request: BuildRequest, a: Actor) {
    const error = validatePlacement(request, this.builds, this.actors, a.materials, a.pos);
    if (error) return error;
    if (this.physics.overlapsStatic(buildShapes(request))) return 'Blocked by scenery';
    return null;
  }
  placeBuild(request: BuildRequest, a = this.player) {
    if (this.placementError(request, a)) return null;
    const piece = newPiece(request, this.nextId++, a.id);
    piece.handles = buildShapes(piece).map((s) =>
      this.physics.addShape(s, { kind: 'build', id: piece.id }),
    );
    this.builds.push(piece);
    a.materials[request.material] -= CONFIG.buildCost;
    a.built++;
    this.revision++;
    this.emit({
      type: 'sound',
      name: 'build',
      pos: v3(request.gx * S, request.gy * S, request.gz * S),
    });
    return piece;
  }
  beginEdit(origin: Vec3, dir: Vec3) {
    if (this.editing) {
      this.confirmEdit();
      return;
    }
    const hit = this.physics.ray(
        origin,
        dir,
        CONFIG.maxBuildDistance + CONFIG.cameraDistance + 1,
        this.player.id,
        true,
      ),
      piece = this.builds.find((b) => hit?.owner?.kind === 'build' && b.id === hit.owner.id);
    if (!piece || piece.owner !== this.player.id) {
      this.toast('Aim at one of your builds to edit');
      return;
    }
    this.editing = piece;
    this.editMask = piece.kind === 'ramp' || piece.kind === 'cone' ? piece.rotation : piece.edit;
    this.buildMode = true;
  }
  selectEditRegion(origin: Vec3, direction: Vec3) {
    const p = this.editing;
    if (!p) return;
    if (p.kind === 'ramp' || p.kind === 'cone') {
      this.editMask = (this.editMask + 1) % 4;
      return;
    }
    const o = rotateLocal(sub(origin, v3(p.gx * S, p.gy * S, p.gz * S)), -p.rotation),
      d = rotateLocal(direction, -p.rotation);
    const t = p.kind === 'wall' ? (-2 - o.z) / d.z : (0.14 - o.y) / d.y;
    if (!Number.isFinite(t) || t < 0 || t > CONFIG.maxBuildDistance + CONFIG.cameraDistance + 1)
      return;
    const hit = add(o, mul(d, t));
    let cell = -1;
    if (p.kind === 'wall' && Math.abs(hit.x) < 2 && hit.y >= 0 && hit.y < 4)
      cell = Math.floor(hit.y / (4 / 3)) * 3 + Math.floor((hit.x + 2) / (4 / 3));
    if (p.kind === 'floor' && Math.abs(hit.x) < 2 && Math.abs(hit.z) < 2)
      cell = (hit.z >= 0 ? 2 : 0) + (hit.x >= 0 ? 1 : 0);
    if (cell >= 0) this.editMask ^= 1 << cell;
  }
  confirmEdit() {
    const p = this.editing;
    if (!p) return;
    if (!validEdit(p.kind, this.editMask)) {
      this.toast('Keep at least one region');
      return;
    }
    const edited = {
      ...p,
      rotation: p.kind === 'ramp' || p.kind === 'cone' ? this.editMask % 4 : p.rotation,
      edit: p.kind === 'wall' || p.kind === 'floor' ? this.editMask : p.edit,
    };
    if (this.physics.overlapsActors(buildShapes(edited))) {
      this.toast('Move clear before confirming the edit');
      return;
    }
    p.rotation = edited.rotation;
    p.edit = edited.edit;
    this.physics.remove(p.handles);
    p.handles = buildShapes(p).map((s) => this.physics.addShape(s, { kind: 'build', id: p.id }));
    const supported = supportedIds(this.builds);
    for (const b of [...this.builds]) if (!supported.has(b.id)) this.removeBuild(b);
    this.emit({ type: 'sound', name: 'edit', pos: v3(p.gx * S, p.gy * S, p.gz * S) });
    this.cancelEdit();
    this.revision++;
  }
  cancelEdit() {
    this.editing = null;
    this.editMask = 0;
  }
  resetEdit() {
    if (this.editing) {
      this.editMask = 0;
      this.confirmEdit();
    }
  }
  damageStructure(id: number, amount: number) {
    const p = this.builds.find((b) => b.id === id);
    if (!p) return;
    p.health -= amount;
    if (p.health <= 0) {
      this.removeBuild(p);
      const supported = supportedIds(this.builds);
      for (const b of [...this.builds]) if (!supported.has(b.id)) this.removeBuild(b);
    }
  }
  removeBuild(p: BuildPiece) {
    this.physics.remove(p.handles);
    this.builds = this.builds.filter((b) => b.id !== p.id);
    if (this.editing?.id === p.id) this.cancelEdit();
    this.revision++;
    this.emit({ type: 'sound', name: 'break', pos: v3(p.gx * S, p.gy * S, p.gz * S) });
  }
  damageObject(id: number, amount: number, a: Actor, pickaxe: boolean) {
    const o = this.objects.find((o) => o.id === id);
    if (!o) return;
    if (o.kind === 'target' && this.mode === 'practice') {
      o.health = 200;
      this.emit({
        type: 'hit',
        pos: add(o.pos, v3(0, 0.6, 0)),
        amount,
        shield: false,
        headshot: false,
        attacker: a.id,
        victim: -1,
      });
      return;
    }
    o.health -= amount;
    if (pickaxe && o.resource) {
      const gain = Math.min(18, Math.ceil(amount * 0.45));
      a.materials[o.resource] = Math.min(999, a.materials[o.resource] + gain);
      a.harvested += gain;
      if (!a.bot) this.toast(`+${gain} ${o.resource}`);
    }
    if (o.health <= 0) {
      this.physics.remove(o.handles);
      this.objects = this.objects.filter((q) => q.id !== o.id);
      this.revision++;
      this.emit({ type: 'sound', name: 'break', pos: { ...o.pos } });
    }
  }
  fire(a: Actor, origin: Vec3, direction: Vec3, pressed: boolean, aim = false) {
    const item = activeItem(a);
    if (
      !isWeapon(item) ||
      a.cooldown > 0 ||
      a.switchTimer > 0 ||
      a.reloading > 0 ||
      a.consuming > 0
    )
      return;
    const def = WEAPONS[item.kind];
    if (!def.automatic && !pressed) return;
    if (item.kind !== 'pickaxe' && item.ammo <= 0) {
      this.reload(a);
      return;
    }
    a.cooldown = 1 / def.rate;
    a.lastShot = this.time;
    if (item.kind !== 'pickaxe') item.ammo--;
    const muzzle = add(
      a.pos,
      v3(-Math.sin(a.yaw) * 0.7, a.crouched ? 1 : 1.4, -Math.cos(a.yaw) * 0.7),
    );
    const cameraHit = this.physics.ray(origin, direction, def.range, a.id);
    const aimPoint = cameraHit?.point ?? add(origin, mul(direction, def.range));
    // Resolve from the weapon muzzle: shoulder camera cannot fire around cover.
    const base = norm(sub(aimPoint, muzzle)),
      spread = def.spread * (aim ? 0.48 : 1) * (a.grounded ? 1 : 1.7) * (a.sprinting ? 1.8 : 1);
    const damage = def.damage * (1 + item.rarity * 0.08);
    if (item.kind === 'sniper') {
      this.projectiles.push({
        id: this.nextId++,
        owner: a.id,
        pos: muzzle,
        velocity: mul(base, CONFIG.sniperSpeed),
        damage,
        headshot: def.headshot,
        life: def.range / CONFIG.sniperSpeed,
      });
      this.emit({
        type: 'shot',
        actor: a.id,
        weapon: item.kind,
        from: muzzle,
        to: add(muzzle, mul(base, 80)),
      });
      return;
    }
    const damageByActor = new Map<number, { amount: number; headshot: boolean; pos: Vec3 }>();
    for (let i = 0; i < def.pellets; i++) {
      const dir = norm(
        add(
          base,
          v3(
            (this.rng() - 0.5) * spread * 2,
            (this.rng() - 0.5) * spread * 2,
            (this.rng() - 0.5) * spread * 2,
          ),
        ),
      );
      const hit = this.physics.ray(muzzle, dir, def.range, a.id),
        end = hit?.point ?? add(muzzle, mul(dir, def.range));
      if (i === 0)
        this.emit({ type: 'shot', actor: a.id, weapon: item.kind, from: muzzle, to: end });
      if (!hit) continue;
      const owner = hit.owner;
      if (owner?.kind === 'actor') {
        const target = this.actors.find((q) => q.id === owner.id);
        if (!target?.alive) continue;
        const headshot = hit.point.y - target.pos.y > (target.crouched ? 0.92 : 1.42);
        const falloff =
          1 - (1 - def.falloff) * clamp((hit.distance - def.range * 0.2) / (def.range * 0.8), 0, 1);
        const total = damage * falloff * (headshot ? def.headshot : 1),
          prev = damageByActor.get(target.id);
        damageByActor.set(target.id, {
          amount: (prev?.amount ?? 0) + total,
          headshot: headshot || !!prev?.headshot,
          pos: hit.point,
        });
      } else if (owner?.kind === 'build')
        this.damageStructure(owner.id, item.kind === 'pickaxe' ? 65 : damage);
      else if (owner?.kind === 'object')
        this.damageObject(
          owner.id,
          item.kind === 'pickaxe' ? 45 : damage,
          a,
          item.kind === 'pickaxe',
        );
      this.emit({ type: 'impact', pos: hit.point });
    }
    for (const [id, h] of damageByActor) {
      const target = this.actors.find((q) => q.id === id)!;
      this.emit({
        type: 'hit',
        pos: h.pos,
        amount: h.amount,
        shield: target.shield > 0,
        headshot: h.headshot,
        attacker: a.id,
        victim: id,
      });
      this.hurt(target, h.amount, a, def.name);
    }
  }
  updateLoot(dt: number) {
    for (const l of this.loot)
      if (l.settling) {
        l.velocity = (l.velocity ?? 0) + CONFIG.gravity * dt;
        const fall = l.velocity * dt;
        const hit = this.physics.ray(
          add(l.pos, v3(0, 0.12, 0)),
          v3(0, -1, 0),
          fall + 0.32,
          -1,
          true,
        );
        if (hit) {
          l.pos.y = hit.point.y + 0.2;
          l.settling = false;
          l.velocity = 0;
        } else l.pos.y -= fall;
        if (l.pos.y < -9) l.settling = false;
      }
  }
  updateProjectiles(dt: number) {
    for (const p of [...this.projectiles]) {
      const step = mul(p.velocity, dt),
        hit = this.physics.ray(p.pos, norm(step), len(step), p.owner);
      p.life -= dt;
      if (hit) {
        const a = this.actors.find((a) => a.id === p.owner),
          owner = hit.owner;
        if (owner?.kind === 'actor') {
          const target = this.actors.find((a) => a.id === owner.id);
          if (target?.alive) {
            const headshot = hit.point.y - target.pos.y > 1.4,
              damage = p.damage * (headshot ? p.headshot : 1);
            this.emit({
              type: 'hit',
              pos: hit.point,
              amount: damage,
              shield: target.shield > 0,
              headshot,
              attacker: p.owner,
              victim: target.id,
            });
            this.hurt(target, damage, a ?? null, 'Longshot');
          }
        } else if (owner?.kind === 'build') this.damageStructure(owner.id, p.damage);
        else if (owner?.kind === 'object' && a) this.damageObject(owner.id, p.damage, a, false);
        this.emit({ type: 'impact', pos: hit.point });
        p.life = 0;
      } else {
        p.pos = add(p.pos, step);
        p.velocity.y -= CONFIG.sniperGravity * dt;
      }
      if (p.life <= 0) this.projectiles = this.projectiles.filter((q) => q.id !== p.id);
    }
  }
  hurt(target: Actor, amount: number, attacker: Actor | null, weapon: string, bypass = false) {
    if (!target.alive) return;
    const result = applyDamage(target, amount, bypass);
    target.damageTaken += result.health + result.shield;
    if (attacker) attacker.damageDone += result.health + result.shield;
    target.lastHurt = this.time;
    if (target.consuming > 0) target.consuming = 0;
    if (target.health <= 0 && this.mode === 'practice' && !target.bot) {
      target.health = 100;
      target.shield = 0;
      target.pos = v3(0, sampleGround(0, 15) + 0.1, 15);
      target.velocity = v3();
      target.crouched = false;
      target.sliding = 0;
      this.physics.teleport(target);
      this.toast('Back on solid ground. Your practice loadout is safe.');
    } else if (target.health <= 0) this.eliminate(target, attacker, weapon);
  }
  eliminate(a: Actor, killer: Actor | null, weapon: string) {
    if (!a.alive) return;
    a.alive = false;
    if (!a.bot) this.placement = this.alive + 1;
    this.physics.removeActor(a);
    if (killer) killer.kills++;
    for (const item of a.inventory)
      if (item)
        this.loot.push({
          id: this.nextId++,
          pos: add(a.pos, v3((this.rng() - 0.5) * 2, 0.3, (this.rng() - 0.5) * 2)),
          item: { ...item },
          settling: true,
          velocity: 0,
        });
    const text = `${killer?.name ?? 'The island'} eliminated ${a.name} · ${weapon}`;
    this.feed.unshift({ text, time: this.time, player: !a.bot || killer?.id === 0 });
    this.emit({
      type: 'elimination',
      killer: killer?.name ?? 'The island',
      victim: a.name,
      weapon,
      player: !a.bot || killer?.id === 0,
    });
    this.revision++;
  }
  checkEnd() {
    if (this.phase === 'finished') return;
    if (!this.player.alive || this.alive <= 1) {
      this.phase = 'finished';
      this.placement = this.player.alive ? 1 : this.placement || this.alive + 1;
      this.winner = this.alive === 1 ? (this.actors.find((a) => a.alive) ?? null) : null;
      if (this.player.alive)
        this.emit({ type: 'sound', name: 'victory', pos: { ...this.player.pos } });
    }
  }
  updateNearby() {
    const a = this.player;
    let nearest: Loot | MapObject | null = null,
      best: number = CONFIG.interactDistance;
    for (const l of this.loot) {
      const d = dist(add(a.pos, v3(0, 0.5, 0)), l.pos);
      if (d < best && this.physics.clearLine(add(a.pos, v3(0, 1, 0)), l.pos, a.id)) {
        best = d;
        nearest = l;
      }
    }
    for (const o of this.objects)
      if (o.kind === 'door') {
        const d = dist(add(a.pos, v3(0, 1, 0)), o.pos);
        if (d < best) {
          nearest = o;
          best = d;
        }
      }
    this.nearby = nearest;
  }
  updateBot(a: Actor, dt: number) {
    const ai = a.ai;
    if (ai.state === 'drop') {
      const d = norm(sub(ai.goal, a.pos));
      this.descent(a, v3(d.x, 0, d.z), dt);
      return;
    }
    ai.timer -= dt;
    ai.reaction = Math.max(0, ai.reaction - dt);
    if (ai.timer <= 0) {
      this.thinkBot(a);
      ai.timer = 0.22 + this.rng() * 0.14;
    }
    let dir = norm(v3(ai.goal.x - a.pos.x, 0, ai.goal.z - a.pos.z)),
      jump = false;
    const target = this.actors.find((q) => q.id === ai.target && q.alive);
    if (ai.state === 'engage' && target) {
      const d = flatDist(a.pos, target.pos),
        toTarget = norm(sub(target.pos, a.pos));
      a.yaw = angleLerp(a.yaw, Math.atan2(-toTarget.x, -toTarget.z), Math.min(1, dt * 6));
      dir = add(
        mul(v3(-toTarget.z, 0, toTarget.x), ai.strafe * 0.7),
        mul(v3(toTarget.x, 0, toTarget.z), d < 12 ? -0.7 : d > 30 ? 0.8 : 0),
      );
      dir = norm(dir);
      if (
        ai.reaction <= 0 &&
        this.physics.clearLine(add(a.pos, v3(0, 1.45, 0)), add(target.pos, v3(0, 1.1, 0)), a.id)
      ) {
        const aim = norm(
          sub(
            add(
              target.pos,
              v3(
                (this.rng() - 0.5) * 1.3,
                1.1 + (this.rng() - 0.5) * 0.65,
                (this.rng() - 0.5) * 1.3,
              ),
            ),
            add(a.pos, v3(0, 1.45, 0)),
          ),
        );
        this.fire(a, add(a.pos, v3(0, 1.45, 0)), aim, true, false);
      }
    } else if (len(dir) > 0.05)
      a.yaw = angleLerp(a.yaw, Math.atan2(-dir.x, -dir.z), Math.min(1, dt * 6));
    const obstacle = this.physics.ray(add(a.pos, v3(0, 0.9, 0)), dir, 1.7, a.id, true);
    if (obstacle) {
      const door =
        obstacle.owner?.kind === 'object'
          ? this.objects.find((o) => o.id === obstacle.owner!.id && o.kind === 'door')
          : null;
      if (door && !door.opened) this.toggleDoor(door);
      else if (ai.stuck > 0.65) {
        jump = true;
        dir = norm(add(dir, v3(-dir.z * ai.strafe * 0.8, 0, dir.x * ai.strafe * 0.8)));
      }
    }
    if (flatDist(a.pos, ai.lastPos) < 0.035 && len(dir) > 0.1) ai.stuck += dt;
    else ai.stuck = Math.max(0, ai.stuck - dt * 2);
    if (ai.stuck > 2) {
      ai.strafe *= -1;
      ai.goal = add(a.pos, v3((this.rng() - 0.5) * 20, 0, (this.rng() - 0.5) * 20));
      ai.stuck = 0;
    }
    ai.lastPos = { ...a.pos };
    this.moveActor(
      a,
      ai.state === 'heal' ? v3() : dir,
      ai.state === 'zone' || ai.state === 'loot',
      false,
      jump,
      dt,
    );
  }
  thinkBot(a: Actor) {
    const ai = a.ai;
    const outside =
      this.storm.outside(a.pos) ||
      flatDist(a.pos, this.storm.target) > this.storm.targetRadius * 0.88;
    if (outside) {
      ai.state = 'zone';
      ai.goal = { ...this.storm.target };
      ai.target = null;
    }
    const weaponSlots = a.inventory
      .map((item, i) => (item && isWeapon(item) && item.ammo + item.reserve > 0 ? i : -1))
      .filter((i) => i >= 0);
    const visible = this.actors
      .filter(
        (q) =>
          q.alive &&
          q.id !== a.id &&
          q.dropped &&
          q.ai.state !== 'drop' &&
          flatDist(a.pos, q.pos) < 100 &&
          Math.abs(q.pos.y - a.pos.y) < 22,
      )
      .sort((x, y) => flatDist(a.pos, x.pos) - flatDist(a.pos, y.pos))
      .find((q) =>
        this.physics.clearLine(add(a.pos, v3(0, 1.45, 0)), add(q.pos, v3(0, 1.2, 0)), a.id),
      );
    if (visible && weaponSlots.length && (!outside || flatDist(a.pos, visible.pos) < 25)) {
      if (ai.target !== visible.id) ai.reaction = 0.45 + this.rng() * 0.7;
      ai.state = 'engage';
      ai.target = visible.id;
      ai.seen = { ...visible.pos };
      ai.lastSeen = this.time;
      const d = flatDist(a.pos, visible.pos);
      let selected =
        weaponSlots.find(
          (i) => a.inventory[i]!.kind === (d < 18 ? 'shotgun' : d > 55 ? 'sniper' : 'rifle'),
        ) ?? weaponSlots[0];
      if (a.selected !== selected) {
        a.selected = selected;
        a.reloading = 0;
        a.consuming = 0;
        a.switchTimer = 0.3;
      }
      if (activeItem(a).ammo <= 0) this.reload(a);
      if (a.health < 60 && a.materials.wood >= 10 && this.rng() < 0.13) {
        const toward = norm(sub(visible.pos, a.pos)),
          pos = add(a.pos, mul(toward, 3));
        const rotation = (Math.round(Math.atan2(toward.x, toward.z) / (Math.PI / 2)) + 2 + 4) % 4;
        this.placeBuild(
          {
            kind: 'wall',
            material: 'wood',
            gx: Math.round(pos.x / S),
            gz: Math.round(pos.z / S),
            gy: sampleGround(Math.round(pos.x / S) * S, Math.round(pos.z / S) * S) / S,
            rotation,
          },
          a,
        );
      }
      if (this.rng() < 0.06) ai.strafe *= -1;
      return;
    }
    ai.target = null;
    // Heal only after a quiet interval, using the same item channel as the player.
    if (this.time - a.lastHurt > 6 && !outside) {
      const heal = a.inventory.findIndex(
        (i) =>
          i && ((i.kind === 'medkit' && a.health < 70) || (i.kind === 'shield' && a.shield < 75)),
      );
      if (heal >= 0) {
        ai.state = 'heal';
        if (a.selected !== heal) {
          a.selected = heal;
          a.reloading = 0;
        }
        this.useConsumable(a);
        return;
      }
    }
    if (ai.state === 'engage') {
      ai.state = 'roam';
      ai.goal = { ...ai.seen };
    }
    if (outside) return;
    const loot = this.loot
      .filter(
        (l) =>
          Math.abs(l.pos.y - a.pos.y) < 2.8 &&
          (weaponSlots.length > 0 || isWeapon(l.item)) &&
          (!weaponSlots.length ||
            a.inventory.filter(Boolean).length < 5 ||
            (l.item.kind === 'shield' && a.shield < 100)),
      )
      .sort((x, y) => flatDist(a.pos, x.pos) - flatDist(a.pos, y.pos))[0];
    if (loot && flatDist(a.pos, loot.pos) < 75) {
      ai.state = 'loot';
      ai.goal = { ...loot.pos };
      if (flatDist(a.pos, loot.pos) < 2.3) this.pickup(a, loot);
      return;
    }
    if (a.materials.wood < 30) {
      const tree = this.objects.find((o) => o.resource === 'wood' && flatDist(o.pos, a.pos) < 9);
      if (tree) {
        ai.goal = { ...tree.pos };
        a.selected = 5;
        if (flatDist(a.pos, tree.pos) < 3)
          this.fire(
            a,
            add(a.pos, v3(0, 1.3, 0)),
            norm(sub(add(tree.pos, v3(0, 1.5, 0)), add(a.pos, v3(0, 1.3, 0)))),
            true,
          );
        return;
      }
    }
    ai.state = 'roam';
    if (flatDist(a.pos, ai.goal) < 4 || this.rng() < 0.02) {
      const r = Math.max(2, this.storm.radius * 0.55),
        angle = this.rng() * Math.PI * 2;
      ai.goal = v3(
        this.storm.center.x + Math.cos(angle) * r * this.rng(),
        0,
        this.storm.center.z + Math.sin(angle) * r * this.rng(),
      );
    }
  }
  dispose() {
    this.events = [];
    this.physics.dispose();
  }
}
