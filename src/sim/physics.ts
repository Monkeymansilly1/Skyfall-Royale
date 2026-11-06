import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import { add, mul, norm, sub, v3, type Vec3 } from './math';
import { terrainMesh } from './map';
import type { Actor, BoxShape, MapObject } from './types';
export type ColliderOwner = { kind: 'terrain' | 'actor' | 'object' | 'build'; id: number };
let initialized: Promise<void> | null = null;
export async function initPhysics() {
  initialized ??= RAPIER.init();
  await initialized;
}
export class Physics {
  world: RAPIER.World;
  owners = new Map<number, ColliderOwner>();
  characters = new Map<
    number,
    {
      body: RAPIER.RigidBody;
      collider: RAPIER.Collider;
      controller: RAPIER.KinematicCharacterController;
      crouched: boolean;
    }
  >();
  constructor() {
    this.world = new RAPIER.World(v3(0, -CONFIG.gravity, 0));
    this.world.timestep = CONFIG.step;
    const { positions, indices } = terrainMesh();
    const c = this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices));
    this.owners.set(c.handle, { kind: 'terrain', id: 0 });
  }
  addShape(shape: BoxShape, owner: ColliderOwner): number {
    const desc = shape.vertices
      ? RAPIER.ColliderDesc.convexHull(new Float32Array(shape.vertices))!
      : RAPIER.ColliderDesc.cuboid(shape.half.x, shape.half.y, shape.half.z);
    const a = shape.yaw ?? 0;
    desc
      .setTranslation(shape.center.x, shape.center.y, shape.center.z)
      .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) })
      .setFriction(0.75);
    const c = this.world.createCollider(desc);
    this.owners.set(c.handle, owner);
    return c.handle;
  }
  addObject(obj: MapObject) {
    obj.handles = obj.shapes.map((s) => this.addShape(s, { kind: 'object', id: obj.id }));
  }
  remove(handles: number[]) {
    for (const h of handles) {
      const c = this.world.getCollider(h);
      if (c) this.world.removeCollider(c, true);
      this.owners.delete(h);
    }
  }
  addActor(a: Actor) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        a.pos.x,
        a.pos.y + CONFIG.playerHeight / 2,
        a.pos.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        CONFIG.playerHeight / 2 - CONFIG.playerRadius,
        CONFIG.playerRadius,
      ),
      body,
    );
    const controller = this.world.createCharacterController(0.015);
    controller.enableAutostep(0.48, 0.18, true);
    controller.enableSnapToGround(0.27);
    controller.setMaxSlopeClimbAngle(Math.PI * 0.29);
    controller.setMinSlopeSlideAngle(Math.PI * 0.32);
    controller.setSlideEnabled(true);
    this.characters.set(a.id, { body, collider, controller, crouched: false });
    this.owners.set(collider.handle, { kind: 'actor', id: a.id });
    a.bodyHandle = body.handle;
  }
  removeActor(a: Actor) {
    const c = this.characters.get(a.id);
    if (!c) return;
    this.owners.delete(c.collider.handle);
    this.world.removeCharacterController(c.controller);
    this.world.removeRigidBody(c.body);
    this.characters.delete(a.id);
  }
  teleport(a: Actor) {
    const c = this.characters.get(a.id);
    if (!c) return;
    c.body.setTranslation(v3(a.pos.x, a.pos.y + (a.crouched ? 0.6 : 0.9), a.pos.z), true);
    c.body.setNextKinematicTranslation(c.body.translation());
  }
  move(a: Actor, delta: Vec3) {
    const c = this.characters.get(a.id);
    if (!c) return;
    const height = a.crouched ? 1.2 : CONFIG.playerHeight;
    if (c.crouched !== a.crouched) {
      c.collider.setShape(
        new RAPIER.Capsule(height / 2 - CONFIG.playerRadius, CONFIG.playerRadius),
      );
      c.crouched = a.crouched;
      c.body.setTranslation(v3(a.pos.x, a.pos.y + height / 2, a.pos.z), true);
    }
    c.controller.computeColliderMovement(c.collider, delta);
    const movement = c.controller.computedMovement();
    a.grounded = c.controller.computedGrounded();
    if (a.grounded && a.velocity.y < 0) a.velocity.y = 0;
    if (delta.y > 0 && movement.y < delta.y * 0.3) a.velocity.y = Math.min(0, a.velocity.y);
    const next = add(c.body.translation(), movement);
    c.body.setNextKinematicTranslation(next);
    a.pos = v3(next.x, next.y - height / 2, next.z);
  }
  ray(origin: Vec3, dir: Vec3, distance: number, excludeActor = -1, ignoreActors = false) {
    const body = this.characters.get(excludeActor)?.body;
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(origin, dir),
      distance,
      true,
      undefined,
      undefined,
      undefined,
      body,
      ignoreActors ? (c) => this.owners.get(c.handle)?.kind !== 'actor' : undefined,
    );
    if (!hit) return null;
    return {
      distance: hit.timeOfImpact,
      point: add(origin, mul(dir, hit.timeOfImpact)),
      normal: hit.normal,
      owner: this.owners.get(hit.collider.handle),
    };
  }
  clearLine(a: Vec3, b: Vec3, excludeActor = -1) {
    const d = sub(b, a),
      distance = Math.hypot(d.x, d.y, d.z);
    const hit = this.ray(a, norm(d), Math.max(0, distance - 0.4), excludeActor, true);
    return !hit;
  }
  cameraDistance(origin: Vec3, desired: Vec3, exclude: number) {
    const delta = sub(desired, origin),
      distance = Math.hypot(delta.x, delta.y, delta.z),
      dir = norm(delta);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      new RAPIER.Ball(0.2),
      0.03,
      distance,
      false,
      undefined,
      undefined,
      undefined,
      this.characters.get(exclude)?.body,
      (c) => this.owners.get(c.handle)?.kind !== 'actor',
    );
    return hit ? Math.max(0.35, hit.time_of_impact - 0.12) : distance;
  }
  canStand(a: Actor) {
    const character = this.characters.get(a.id);
    if (!character) return true;
    let blocked = false;
    this.world.intersectionsWithShape(
      v3(a.pos.x, a.pos.y + 0.91, a.pos.z),
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Capsule(0.54, 0.33),
      () => {
        blocked = true;
        return false;
      },
      undefined,
      undefined,
      character.collider,
      character.body,
    );
    return !blocked;
  }
  overlapsActors(shapes: BoxShape[]) {
    let blocked = false;
    for (const s of shapes) {
      const a = s.yaw ?? 0,
        shape = s.vertices
          ? new RAPIER.ConvexPolyhedron(new Float32Array(s.vertices))
          : new RAPIER.Cuboid(s.half.x * 0.97, s.half.y * 0.97, s.half.z * 0.97);
      this.world.intersectionsWithShape(
        s.center,
        { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) },
        shape,
        (c) => {
          if (this.owners.get(c.handle)?.kind === 'actor') blocked = true;
          return !blocked;
        },
      );
      if (blocked) break;
    }
    return blocked;
  }
  overlapsStatic(shapes: BoxShape[]) {
    let blocked = false;
    for (const s of shapes) {
      const a = s.yaw ?? 0;
      const queryShape = s.vertices
        ? new RAPIER.ConvexPolyhedron(new Float32Array(s.vertices))
        : new RAPIER.Cuboid(s.half.x * 0.94, s.half.y * 0.94, s.half.z * 0.94);
      this.world.intersectionsWithShape(
        s.center,
        { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) },
        queryShape,
        (c) => {
          const kind = this.owners.get(c.handle)?.kind;
          if (kind === 'object') blocked = true;
          return !blocked;
        },
      );
      if (blocked) break;
    }
    return blocked;
  }
  step() {
    this.world.step();
  }
  dispose() {
    this.characters.clear();
    this.owners.clear();
    this.world.free();
  }
}
