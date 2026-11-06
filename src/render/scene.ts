import * as THREE from 'three';
import { CONFIG, RARITY_COLORS } from '../config';
import { buildShapes } from '../sim/building';
import { activeItem } from '../sim/inventory';
import { LOCATIONS, sampleGround, terrainMesh } from '../sim/map';
import { random, v3 } from '../sim/math';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import {
  box,
  busModel,
  characterModel,
  hullGeometry,
  mapObjectModel,
  mat,
  roadGeometry,
  terrainColor,
  updateCharacter,
  weaponModel,
  type CharacterModel,
} from './models';
interface TimedEffect {
  mesh: THREE.Object3D;
  life: number;
  max: number;
  velocity?: THREE.Vector3;
}
export interface RenderSettings {
  shadows: boolean;
  renderScale: number;
}
export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.12, 1000);
  sun: THREE.DirectionalLight;
  objects = new THREE.Group();
  dynamic = new THREE.Group();
  buildGroup = new THREE.Group();
  lootGroup = new THREE.Group();
  effectsGroup = new THREE.Group();
  preview = new THREE.Group();
  editOverlay = new THREE.Group();
  characters = new Map<number, CharacterModel>();
  buildModels = new Map<number, THREE.Group>();
  lootModels = new Map<number, THREE.Group>();
  objectEntries = new Map<
    number,
    { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }[]
  >();
  objectOpen = new Map<number, boolean>();
  doors = new Map<number, THREE.Group>();
  bus = busModel();
  stormWall: THREE.Mesh;
  stormRing: THREE.Mesh;
  nextRing: THREE.Mesh;
  effects: TimedEffect[] = [];
  yaw = 0.1;
  pitch = -0.12;
  kick = 0;
  trauma = 0;
  aiming = false;
  smoothedYaw = 0;
  smoothedPitch = -0.12;
  lastTime = 0;
  private shadowFocus = new THREE.Vector3();
  private previewKey = '';
  private ownedGeometries = new Set<THREE.BufferGeometry>();
  constructor(
    public canvas: HTMLCanvasElement,
    settings: RenderSettings,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75) * settings.renderScale);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x9bd7e9);
    this.scene.fog = new THREE.FogExp2(0xb1dce5, 0.0023);
    this.scene.add(new THREE.HemisphereLight(0xc9efff, 0x72814a, 1.6));
    this.sun = new THREE.DirectionalLight(0xffe4ad, 2.5);
    this.sun.position.set(-65, 110, 55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 230;
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.createEnvironment();
    this.scene.add(
      this.objects,
      this.dynamic,
      this.buildGroup,
      this.lootGroup,
      this.effectsGroup,
      this.preview,
      this.editOverlay,
      this.bus,
    );
    const stormMat = new THREE.MeshBasicMaterial({
      color: 0x7c6df2,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 160, 160, 1, true), stormMat);
    this.stormWall.position.y = 60;
    this.scene.add(this.stormWall);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b95ff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stormRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.005, 3, 128), ringMaterial);
    this.stormRing.rotation.x = Math.PI / 2;
    this.scene.add(this.stormRing);
    this.nextRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.004, 3, 128),
      new THREE.MeshBasicMaterial({
        color: 0xf6f6d1,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    this.nextRing.rotation.x = Math.PI / 2;
    this.scene.add(this.nextRing);
    this.camera.position.set(-24, 32, 70);
    this.camera.lookAt(-45, 14, -40);
    this.resize();
  }
  ownGeometry(g: THREE.BufferGeometry) {
    this.ownedGeometries.add(g);
    return g;
  }
  createEnvironment() {
    const { positions, indices } = terrainMesh(),
      geometry = this.ownGeometry(new THREE.BufferGeometry()),
      colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const c = terrainColor(positions[i], positions[i + 1], positions[i + 2]);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    const water = new THREE.Mesh(
      this.ownGeometry(new THREE.PlaneGeometry(1800, 1800)),
      new THREE.MeshStandardMaterial({ color: 0x51a9b9, metalness: 0.2, roughness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    this.scene.add(water);
    const roads = [
      [
        [-63, -46],
        [-15, -27],
        [25, 5],
        [65, -50],
      ],
      [
        [27, 66],
        [17, 28],
        [-15, -3],
        [-83, 56],
      ],
    ];
    roads.forEach((points) => {
      const geo = this.ownGeometry(
          roadGeometry(
            points.map(([x, z]) => new THREE.Vector2(x, z)),
            5.5,
          ),
        ),
        road = new THREE.Mesh(geo, mat(0xb4aa84));
      road.receiveShadow = true;
      this.scene.add(road);
    });
    // Low cost meadow accents and cloud banks use shared instanced geometry.
    const rnd = random(801),
      grassGeo = this.ownGeometry(new THREE.ConeGeometry(0.22, 0.7, 3)),
      grass = new THREE.InstancedMesh(grassGeo, mat(0x87ab59), 650),
      dummy = new THREE.Object3D();
    let count = 0;
    for (let i = 0; i < 1000 && count < 650; i++) {
      const x = (rnd() - 0.5) * 310,
        z = (rnd() - 0.5) * 310,
        y = sampleGround(x, z);
      if (y < 5 || LOCATIONS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 2)) continue;
      dummy.position.set(x, y + 0.2, z);
      dummy.rotation.set(0, rnd() * 6.28, 0.1);
      dummy.scale.setScalar(0.5 + rnd());
      dummy.updateMatrix();
      grass.setMatrixAt(count++, dummy.matrix);
    }
    grass.count = count;
    this.scene.add(grass);
    const cloud = new THREE.InstancedMesh(
      this.ownGeometry(new THREE.IcosahedronGeometry(1, 1)),
      new THREE.MeshBasicMaterial({ color: 0xf6f5dd, transparent: true, opacity: 0.85 }),
      65,
    );
    for (let i = 0; i < 65; i++) {
      const angle = rnd() * Math.PI * 2,
        r = 210 + rnd() * 250;
      dummy.position.set(Math.cos(angle) * r, 85 + rnd() * 40, Math.sin(angle) * r);
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.scale.set(10 + rnd() * 14, 3 + rnd() * 5, 7 + rnd() * 12);
      dummy.updateMatrix();
      cloud.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(cloud);
    // A few rocks out at sea frame the island horizon.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rock = new THREE.Mesh(
        this.ownGeometry(new THREE.ConeGeometry(30 + (i % 3) * 8, 40 + (i % 2) * 16, 5)),
        mat(0x7babae),
      );
      rock.position.set(Math.cos(a) * 450, 2, Math.sin(a) * 450);
      this.scene.add(rock);
    }
  }
  setGame(game: Game) {
    this.clearGame();
    const batches = new Map<
      string,
      {
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
        entries: { id: number; matrix: THREE.Matrix4 }[];
      }
    >();
    for (const o of game.objects) {
      const model = mapObjectModel(o);
      model.updateMatrixWorld(true);
      if (o.kind === 'door') {
        this.doors.set(o.id, model);
        this.objectOpen.set(o.id, !!o.opened);
        this.objects.add(model);
        continue;
      }
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const key = child.geometry.uuid + '-' + (child.material as THREE.Material).uuid;
        let batch = batches.get(key);
        if (!batch) {
          batch = {
            geometry: child.geometry,
            material: child.material as THREE.Material,
            entries: [],
          };
          batches.set(key, batch);
        }
        batch.entries.push({ id: o.id, matrix: child.matrixWorld.clone() });
      });
    }
    for (const b of batches.values()) {
      const mesh = new THREE.InstancedMesh(b.geometry, b.material, b.entries.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      b.entries.forEach((entry, index) => {
        mesh.setMatrixAt(index, entry.matrix);
        const list = this.objectEntries.get(entry.id) ?? [];
        list.push({ mesh, index, matrix: entry.matrix });
        this.objectEntries.set(entry.id, list);
      });
      mesh.computeBoundingSphere();
      this.objects.add(mesh);
    }
    for (const a of game.actors) {
      const c = characterModel(a.id);
      this.characters.set(a.id, c);
      this.dynamic.add(c.group);
    }
    this.yaw = game.mode === 'menu' ? 0 : 0.1;
    this.pitch = -0.12;
    this.smoothedYaw = this.yaw;
    this.smoothedPitch = this.pitch;
    this.syncGame(game);
  }
  clearGame() {
    for (const group of [
      this.objects,
      this.dynamic,
      this.buildGroup,
      this.lootGroup,
      this.preview,
      this.editOverlay,
      this.effectsGroup,
    ]) {
      this.disposeBuild(group);
      group.clear();
    }
    this.effects = [];
    this.characters.clear();
    this.buildModels.clear();
    this.lootModels.clear();
    this.objectEntries.clear();
    this.doors.clear();
    this.objectOpen.clear();
    this.previewKey = '';
  }
  syncGame(game: Game) {
    const ids = new Set(game.objects.map((o) => o.id));
    for (const [id, entries] of this.objectEntries)
      if (!ids.has(id)) {
        for (const e of entries) {
          const zero = new THREE.Matrix4().makeScale(0, 0, 0);
          e.mesh.setMatrixAt(e.index, zero);
          e.mesh.instanceMatrix.needsUpdate = true;
        }
        this.objectEntries.delete(id);
      }
    for (const [id, door] of this.doors) {
      const o = game.objects.find((o) => o.id === id);
      if (!o) {
        this.objects.remove(door);
        this.doors.delete(id);
      } else if (this.objectOpen.get(id) !== !!o.opened) {
        door.position.set(o.pos.x + (o.opened ? 0.7 : 0), o.pos.y, o.pos.z - (o.opened ? 0.7 : 0));
        door.rotation.y = o.yaw + (o.opened ? Math.PI / 2 : 0);
        this.objectOpen.set(id, !!o.opened);
      }
    }
    const buildIds = new Set(game.builds.map((b) => b.id));
    for (const [id, model] of this.buildModels)
      if (!buildIds.has(id)) {
        this.buildGroup.remove(model);
        this.disposeBuild(model);
        this.buildModels.delete(id);
      }
    for (const b of game.builds) {
      const key = `${b.edit}-${b.rotation}`;
      let model = this.buildModels.get(b.id);
      if (model && model.userData.key !== key) {
        this.buildGroup.remove(model);
        this.disposeBuild(model);
        this.buildModels.delete(b.id);
        model = undefined;
      }
      if (!model) {
        model = this.buildVisual(b, false);
        model.userData.key = key;
        this.buildModels.set(b.id, model);
        this.buildGroup.add(model);
      }
    }
    const lootIds = new Set(game.loot.map((l) => l.id));
    for (const [id, g] of this.lootModels)
      if (!lootIds.has(id)) {
        this.lootGroup.remove(g);
        this.disposeBuild(g);
        this.lootModels.delete(id);
      }
    for (const l of game.loot)
      if (!this.lootModels.has(l.id)) {
        const group = new THREE.Group(),
          item = weaponModel(l.item.kind, l.item.rarity);
        item.scale.setScalar(1.25);
        item.rotation.z = l.item.kind === 'shield' || l.item.kind === 'medkit' ? 0 : Math.PI / 2;
        group.add(item);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.45, 0.65, 24),
          new THREE.MeshBasicMaterial({
            color: RARITY_COLORS[l.item.rarity],
            transparent: true,
            opacity: 0.52,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.1;
        group.add(ring);
        if (l.chest) {
          box(group, 0xe8b957, 0, 0.15, 0, 1.15, 0.6, 0.65);
          box(group, 0x735a38, 0, 0.15, 0, 0.2, 0.65, 0.68);
        }
        group.position.set(l.pos.x, l.pos.y + 0.25, l.pos.z);
        group.userData.y = l.pos.y + 0.25;
        this.lootModels.set(l.id, group);
        this.lootGroup.add(group);
      }
  }
  buildVisual(
    request: Parameters<typeof buildShapes>[0] & { material?: string },
    preview: boolean,
    valid = true,
  ) {
    const group = new THREE.Group(),
      color = preview
        ? valid
          ? 0x64e8e9
          : 0xff6d6d
        : request.material === 'wood'
          ? 0xc89d63
          : request.material === 'brick'
            ? 0xb77865
            : 0x8ea5ac;
    for (const s of buildShapes(request)) {
      const geo = s.vertices
        ? hullGeometry(s.vertices)
        : new THREE.BoxGeometry(s.half.x * 2, s.half.y * 2, s.half.z * 2);
      const m = new THREE.MeshStandardMaterial({
        color,
        transparent: preview,
        opacity: preview ? 0.32 : 1,
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide,
        depthWrite: !preview,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(s.center.x, s.center.y, s.center.z);
      mesh.rotation.y = s.yaw ?? 0;
      mesh.castShadow = !preview;
      mesh.receiveShadow = true;
      group.add(mesh);
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: preview ? (valid ? 0xafffff : 0xffb1a0) : 0x6f6c57,
          transparent: true,
          opacity: preview ? 0.8 : 0.24,
        }),
      );
      lines.position.copy(mesh.position);
      lines.rotation.copy(mesh.rotation);
      group.add(lines);
      if (!preview && request.kind === 'wall' && !request.edit) {
        // Original wood framing reads clearly even at a distance.
        const studs = new THREE.Group();
        studs.position.copy(mesh.position);
        studs.rotation.y = mesh.rotation.y;
        for (const x of [-1.8, -0.65, 0.65, 1.8]) box(studs, color, x, 0, -0.15, 0.1, 3.9, 0.1);
        for (const y of [-1.85, 1.85]) box(studs, color, 0, y, -0.15, 4, 0.15, 0.1);
        group.add(studs);
      }
    }
    return group;
  }
  disposeBuild(group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        if (!o.geometry.userData.shared) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (!m.userData.shared) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
  setLook(dx: number, dy: number, sensitivity: number) {
    const factor = 0.002 * sensitivity * (this.aiming ? 0.52 : 1);
    this.yaw -= dx * factor;
    this.pitch = Math.max(-1.28, Math.min(1.18, this.pitch - dy * factor));
  }
  aimRay() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return {
      origin: v3(this.camera.position.x, this.camera.position.y, this.camera.position.z),
      direction: v3(dir.x, dir.y, dir.z),
    };
  }
  update(game: Game, dt: number, aiming: boolean, realTime: number) {
    this.aiming = aiming;
    this.kick *= Math.exp(-dt * 13);
    this.trauma *= Math.exp(-dt * 6);
    this.smoothedYaw +=
      Math.atan2(Math.sin(this.yaw - this.smoothedYaw), Math.cos(this.yaw - this.smoothedYaw)) *
      (1 - Math.exp(-dt * 38));
    this.smoothedPitch += (this.pitch + this.kick - this.smoothedPitch) * (1 - Math.exp(-dt * 38));
    for (const a of game.actors) {
      const model = this.characters.get(a.id);
      if (model) {
        updateCharacter(model, a, activeItem(a).kind, game.time);
        model.group.visible = a.alive && (a.dropped || game.mode === 'practice');
      }
    }
    this.bus.visible = game.mode === 'solo' && game.busTime < 22;
    this.bus.position.set(game.busPosition.x, game.busPosition.y, game.busPosition.z);
    this.bus.rotation.y = -Math.PI / 2;
    for (const l of game.loot) {
      const g = this.lootModels.get(l.id);
      if (g) {
        g.rotation.y = realTime * 0.5 + l.id;
        g.position.set(l.pos.x, l.pos.y + 0.25 + Math.sin(realTime * 2 + l.id) * 0.1, l.pos.z);
      }
    }
    for (const b of game.builds) {
      const model = this.buildModels.get(b.id);
      if (model)
        for (const child of model.children)
          if (child instanceof THREE.Mesh) {
            const m = child.material as THREE.MeshStandardMaterial;
            m.transparent = b.age < CONFIG.constructionTime;
            m.opacity = Math.min(1, 0.55 + (b.age / CONFIG.constructionTime) * 0.45);
          }
    }
    const showStorm = game.mode === 'solo' && game.phase !== 'menu';
    this.stormWall.visible = showStorm;
    this.stormRing.visible = showStorm;
    this.nextRing.visible = showStorm;
    if (showStorm) {
      const s = game.storm;
      this.stormWall.position.x = s.center.x;
      this.stormWall.position.z = s.center.z;
      this.stormWall.scale.set(s.radius, 1, s.radius);
      (this.stormWall.material as THREE.MeshBasicMaterial).opacity =
        0.22 + Math.sin(realTime * 2) * 0.025;
      this.stormRing.position.set(s.center.x, 15, s.center.z);
      this.stormRing.scale.setScalar(s.radius);
      this.nextRing.position.set(s.target.x, 15.2, s.target.z);
      this.nextRing.scale.setScalar(Math.max(0.1, s.targetRadius));
    }
    this.updatePreview(game);
    this.updateCamera(game, dt, realTime);
    for (const e of [...this.effects]) {
      e.life -= dt;
      if (e.velocity) e.mesh.position.addScaledVector(e.velocity, dt);
      if (e.mesh instanceof THREE.Mesh && e.mesh.material instanceof THREE.MeshBasicMaterial)
        e.mesh.material.opacity = Math.max(0, e.life / e.max);
      if (e.life <= 0) {
        this.effectsGroup.remove(e.mesh);
        if (e.mesh instanceof THREE.Mesh || e.mesh instanceof THREE.Line) {
          e.mesh.geometry.dispose();
          const m = Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material];
          m.forEach((x) => x.dispose());
        }
        this.effects.splice(this.effects.indexOf(e), 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  updateCamera(game: Game, dt: number, t: number) {
    const a = game.player;
    if (game.phase === 'menu') {
      const angle = 0.2 + Math.sin(t * 0.035) * 0.16;
      this.camera.position.set(-21 + Math.sin(angle) * 30, 37, -2 + Math.cos(angle) * 38);
      this.camera.lookAt(-52, 14, -42);
      this.camera.fov = 65;
    } else if (game.phase === 'bus') {
      this.camera.position.set(
        game.busPosition.x - 19,
        game.busPosition.y + 9,
        game.busPosition.z + 22,
      );
      this.camera.lookAt(game.busPosition.x + 5, game.busPosition.y - 8, game.busPosition.z - 6);
      this.camera.fov = 80;
    } else {
      const drop = game.phase === 'drop',
        yaw = this.smoothedYaw,
        pitch = this.smoothedPitch;
      const target = new THREE.Vector3(a.pos.x, a.pos.y + (a.crouched ? 1.05 : 1.55), a.pos.z);
      const desiredDistance = drop ? 8 : aimingDistance(this.aiming),
        shoulder = drop ? 0.5 : this.aiming ? 0.7 : CONFIG.cameraShoulder;
      const back = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        -Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      );
      const shoulderVec = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(
        shoulder,
      );
      const desired = target.clone().addScaledVector(back, desiredDistance).add(shoulderVec);
      const actual = game.physics.cameraDistance(
        v3(target.x, target.y, target.z),
        v3(desired.x, desired.y, desired.z),
        a.id,
      );
      const position = target
        .clone()
        .add(desired.clone().sub(target).normalize().multiplyScalar(actual));
      position.y = Math.max(position.y, sampleGround(position.x, position.z) + 0.3);
      this.camera.position.copy(position);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(pitch, yaw, Math.sin(t * 80) * this.trauma * 0.02, 'YXZ');
      const fov = drop ? 87 : this.aiming ? CONFIG.aimFov : CONFIG.fov;
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 13));
    }
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.shadowFocus.set(a.pos.x, a.pos.y, a.pos.z);
    if (game.phase === 'menu') this.shadowFocus.set(-40, 14, -30);
    this.sun.position.copy(this.shadowFocus).add(new THREE.Vector3(-65, 110, 55));
    this.sun.target.position.copy(this.shadowFocus);
    this.sun.target.updateMatrixWorld();
  }
  updatePreview(game: Game) {
    const p = game.buildPreview,
      editing = game.editing;
    const key =
      game.buildMode && p && !editing
        ? JSON.stringify(p) + !!game.buildError
        : editing
          ? `edit-${editing.id}-${game.editMask}`
          : '';
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.disposeBuild(this.preview);
    this.preview.clear();
    this.disposeBuild(this.editOverlay);
    this.editOverlay.clear();
    if (game.buildMode && p && !editing)
      this.preview.add(this.buildVisual(p, true, !game.buildError));
    if (editing) {
      const model = this.buildVisual({ ...editing, edit: game.editMask }, true, true);
      this.editOverlay.add(model);
      if (editing.kind === 'wall')
        for (let row = 0; row < 3; row++)
          for (let col = 0; col < 3; col++) {
            const cell = new THREE.Mesh(
              new THREE.PlaneGeometry(1.22, 1.22),
              new THREE.MeshBasicMaterial({
                color: game.editMask & (1 << (row * 3 + col)) ? 0xfb865e : 0x76d9ef,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                depthTest: false,
              }),
            );
            const local = new THREE.Vector3(
              ((col - 1) * 4) / 3,
              ((row + 0.5) * 4) / 3,
              -2.17,
            ).applyAxisAngle(new THREE.Vector3(0, 1, 0), (editing.rotation * Math.PI) / 2);
            cell.position.set(
              editing.gx * 4 + local.x,
              editing.gy * 4 + local.y,
              editing.gz * 4 + local.z,
            );
            cell.rotation.y = (editing.rotation * Math.PI) / 2;
            this.editOverlay.add(cell);
          }
    }
  }
  effect(event: GameEvent) {
    if (event.type === 'shot') {
      const from = new THREE.Vector3(event.from.x, event.from.y, event.from.z),
        to = new THREE.Vector3(event.to.x, event.to.y, event.to.z);
      if (event.weapon !== 'pickaxe') {
        const delta = to.clone().sub(from),
          length = Math.min(delta.length(), 80),
          geometry = new THREE.CylinderGeometry(0.014, 0.027, length, 4),
          m = new THREE.MeshBasicMaterial({
            color: 0xffd178,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
          }),
          tracer = new THREE.Mesh(geometry, m);
        tracer.position.copy(from).addScaledVector(delta.normalize(), length / 2);
        tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta);
        this.effectsGroup.add(tracer);
        this.effects.push({ mesh: tracer, life: 0.055, max: 0.055 });
        const flash = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16),
          new THREE.MeshBasicMaterial({ color: 0xffefb5, transparent: true, depthWrite: false }),
        );
        flash.position.copy(from);
        this.effectsGroup.add(flash);
        this.effects.push({ mesh: flash, life: 0.045, max: 0.045 });
      }
    } else if (event.type === 'impact') {
      if (this.effects.length > 90) return;
      for (let i = 0; i < 3; i++) {
        const particle = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 0.045),
          new THREE.MeshBasicMaterial({ color: 0xeed6a6, transparent: true, depthWrite: false }),
        );
        particle.position.set(event.pos.x, event.pos.y, event.pos.z);
        this.effectsGroup.add(particle);
        this.effects.push({
          mesh: particle,
          life: 0.22,
          max: 0.22,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3,
          ),
        });
      }
    } else if (event.type === 'hit' && event.victim === 0) this.trauma = 0.9;
  }
  project(pos: { x: number; y: number; z: number }) {
    const p = new THREE.Vector3(pos.x, pos.y, pos.z).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * innerWidth,
      y: (-0.5 * p.y + 0.5) * innerHeight,
      visible: p.z < 1,
    };
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  settings(settings: RenderSettings) {
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75) * settings.renderScale);
    this.resize();
  }
}
function aimingDistance(aim: boolean) {
  return aim ? 2.65 : CONFIG.cameraDistance;
}
