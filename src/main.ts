import './style.css';
import { CONFIG, WEAPONS, type WeaponId } from './config';
import { Input, readSettings } from './input';
import { AudioEngine } from './render/audio';
import { GameScene } from './render/scene';
import { Game, type Mode } from './sim/game';
import { activeItem, isWeapon } from './sim/inventory';
import { initPhysics } from './sim/physics';
import { emptyInput } from './sim/types';
import { HUD } from './ui/hud';
async function boot() {
  const root = document.getElementById('app')!,
    canvas = document.getElementById('world') as HTMLCanvasElement,
    settings = readSettings(),
    hud = new HUD(root, settings),
    audio = new AudioEngine();
  await initPhysics();
  const scene = new GameScene(canvas, settings),
    input = new Input(canvas, settings);
  let game = new Game('menu'),
    accumulator = 0,
    last = performance.now(),
    synced = -1,
    starting = false,
    previousPhase: Game['phase'] = 'menu';
  scene.setGame(game);
  hud.ready();
  audio.setVolume(settings.volume);
  async function resume() {
    if (game.phase === 'menu' || game.phase === 'finished') return;
    try {
      await input.lock();
      await audio.resume();
      game.paused = false;
      hud.close();
      accumulator = 0;
      last = performance.now();
    } catch {
      game.paused = true;
      hud.showPause();
      hud.toast('Click “Back to the island” to enable mouse look', performance.now() / 1000);
    }
  }
  async function start(mode: Mode) {
    if (starting) return;
    starting = true;
    // Request lock in the click gesture, before doing match setup.
    const lockPromise = input.lock().catch(() => {});
    void audio.resume();
    try {
      const previous = game;
      game = new Game(mode);
      scene.setGame(game);
      previous.dispose();
      input.clear();
      hud.reset();
      hud.showGame(mode);
      synced = game.revision;
      accumulator = 0;
      last = performance.now();
      await lockPromise;
      if (!input.locked) {
        game.paused = true;
        hud.showPause();
      } else game.paused = false;
    } finally {
      starting = false;
    }
  }
  function menu() {
    game.paused = true;
    hud.close();
    if (input.locked) document.exitPointerLock();
    const old = game;
    game = new Game('menu');
    scene.setGame(game);
    old.dispose();
    hud.reset();
    hud.showMenu();
    audio.suspend();
    input.clear();
    synced = -1;
    accumulator = 0;
  }
  hud.onStart = (mode) => void start(mode);
  hud.onResume = () => void resume();
  hud.onMenu = menu;
  hud.onSettings = (s) => {
    input.settings = s;
    scene.settings(s);
    audio.setVolume(s.volume);
  };
  hud.onRemap = (_action, done) => {
    input.remap = done;
  };
  input.onLook = (x, y) => scene.setLook(x, y, input.settings.sensitivity);
  input.onUnlock = () => {
    if (starting || game.phase === 'menu' || game.phase === 'finished') return;
    game.paused = true;
    audio.suspend();
    if (hud.overlay === 'none') hud.showPause();
  };
  input.onAction = (action) => {
    if (!input.locked || game.paused || game.phase === 'finished') return;
    if (action === 'jump' && (game.phase === 'bus' || game.phase === 'drop')) {
      game.toggleGlider();
      return;
    }
    if (game.phase !== 'playing') return;
    switch (action) {
      case 'build':
        game.toggleBuild();
        break;
      case 'wall':
      case 'floor':
      case 'ramp':
      case 'cone':
        game.chooseBuild(action);
        break;
      case 'reload':
        game.editing ? game.resetEdit() : game.reload();
        break;
      case 'interact':
        game.interact();
        break;
      case 'material':
        game.cycleMaterial();
        break;
      case 'rotate':
        if (game.editing && (game.editing.kind === 'ramp' || game.editing.kind === 'cone'))
          game.editMask = (game.editMask + 1) % 4;
        else game.buildRotation = (game.buildRotation + 1) % 4;
        break;
      case 'edit': {
        const ray = scene.aimRay();
        game.beginEdit(ray.origin, ray.direction);
        break;
      }
      case 'drop':
        game.dropItem();
        break;
      case 'pickaxe':
        game.select(5);
        break;
      case 'map':
        game.paused = true;
        hud.showMap(game);
        document.exitPointerLock();
        break;
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.editing) {
      game.cancelEdit();
      return;
    }
    if (e.code === 'Escape' && input.locked) {
      game.paused = true;
      document.exitPointerLock();
      return;
    }
    if (!input.locked || game.paused || e.repeat) return;
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]) - 1;
      if (game.editing) {
        if ((game.editing.kind === 'wall' && n < 9) || (game.editing.kind === 'floor' && n < 4))
          game.editMask ^= 1 << n;
      } else if (n < 5) game.select(n);
    }
  });
  canvas.addEventListener('click', () => {
    if (
      !input.locked &&
      game.phase !== 'menu' &&
      game.phase !== 'finished' &&
      hud.overlay === 'none'
    )
      void resume();
  });
  window.addEventListener('resize', () => scene.resize());
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    game.paused = true;
    if (input.locked) document.exitPointerLock();
    hud.toast(
      'Graphics context lost. Reload the page to restore the island.',
      performance.now() / 1000,
    );
  });
  function frame(time: number) {
    requestAnimationFrame(frame);
    const now = time / 1000,
      dt = Math.min(0.1, Math.max(0, (time - last) / 1000));
    last = time;
    if (game.phase !== 'menu' && game.phase !== 'finished' && !input.locked) game.paused = true;
    if (game.phase === 'drop' && previousPhase === 'bus') {
      scene.yaw = Math.atan2(game.player.pos.x, game.player.pos.z);
      scene.pitch = -0.55;
    }
    previousPhase = game.phase;
    const ray = scene.aimRay();
    if (game.editing && input.mousePressed.has(0) && !game.paused) {
      game.selectEditRegion(ray.origin, ray.direction);
      input.mousePressed.delete(0);
    }
    let steps = 0;
    if (!game.paused) {
      accumulator += dt;
      let first = true;
      while (accumulator >= CONFIG.step) {
        const state = {
          ...emptyInput(),
          moveX: Number(input.held('right')) - Number(input.held('left')),
          moveZ: Number(input.held('forward')) - Number(input.held('back')),
          yaw: scene.yaw,
          pitch: scene.pitch,
          jump: first && input.tap('jump'),
          jumpHeld: input.held('jump'),
          sprint: input.held('sprint'),
          crouch: input.held('crouch'),
          fire: input.mouse.has(0) || (first && input.mousePressed.has(0)),
          firePressed: first && input.mousePressed.has(0),
          aim: input.mouse.has(2),
          aimOrigin: ray.origin,
          aimDirection: ray.direction,
        };
        game.tick(CONFIG.step, state);
        accumulator -= CONFIG.step;
        first = false;
        steps++;
        if (game.phase === 'finished' && hud.overlay !== 'results') {
          if (input.locked) document.exitPointerLock();
          hud.showResults(game);
          accumulator = 0;
          break;
        }
      }
    } else accumulator = 0;
    if (game.phase === 'finished' && hud.overlay !== 'results') {
      if (input.locked) document.exitPointerLock();
      hud.showResults(game);
    }
    const events = game.events.splice(0);
    for (const e of events) {
      scene.effect(e);
      audio.event(e, game.player.pos, scene.yaw);
      hud.event(e, now);
      if (e.type === 'shot' && e.actor === 0) {
        const item = activeItem(game.player);
        if (isWeapon(item)) {
          scene.kick += WEAPONS[item.kind as WeaponId].recoil;
          scene.pitch = Math.min(1.18, scene.pitch + WEAPONS[item.kind as WeaponId].recoil * 0.18);
        }
      }
    }
    if (game.revision !== synced) {
      scene.syncGame(game);
      synced = game.revision;
    }
    scene.update(game, dt, input.mouse.has(2) && !game.buildMode, now);
    hud.update(game, scene, dt, now);
    if (steps > 0 || game.paused || game.phase === 'menu' || game.phase === 'finished')
      input.endFrame();
  }
  // Development-only diagnostics for reproducible browser QA. Vite removes this
  // branch from production; it never enables a network or multiplayer API.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
    Object.assign(window, {
      skyfallQA: {
        snapshot: () => ({
          phase: game.phase,
          mode: game.mode,
          time: game.time,
          paused: game.paused,
          alive: game.alive,
          placement: game.placement,
          player: {
            pos: { ...game.player.pos },
            health: game.player.health,
            shield: game.player.shield,
            grounded: game.player.grounded,
            inventory: game.player.inventory.map((i) => (i ? { ...i } : null)),
            selected: game.player.selected,
            materials: { ...game.player.materials },
            reloading: game.player.reloading,
          },
          buildMode: game.buildMode,
          preview: game.buildPreview ? { ...game.buildPreview } : null,
          buildError: game.buildError,
          builds: game.builds.map((b) => ({
            id: b.id,
            kind: b.kind,
            edit: b.edit,
            health: b.health,
            rotation: b.rotation,
          })),
          editing: game.editing?.id,
          nearby: game.nearby && 'item' in game.nearby ? game.nearby.item.kind : game.nearby?.kind,
          renderer: {
            calls: scene.renderer.info.render.calls,
            triangles: scene.renderer.info.render.triangles,
            geometries: scene.renderer.info.memory.geometries,
          },
          characters: game.physics.characters.size,
        }),
        advance: (seconds: number) => {
          const paused = game.paused;
          game.paused = false;
          for (
            let i = 0;
            i < Math.min(400, seconds) / CONFIG.step && game.phase !== 'finished';
            i++
          )
            game.tick(CONFIG.step, { ...emptyInput(), yaw: scene.yaw });
          game.paused = paused;
        },
        look: (yaw: number, pitch: number) => {
          scene.yaw = yaw;
          scene.pitch = pitch;
        },
      },
    });
  }
  requestAnimationFrame(frame);
}
void boot().catch((error) => {
  console.error(error);
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'fatal';
  const title = document.createElement('h2');
  title.textContent = 'THE ISLAND COULDN’T LOAD.';
  const text = document.createElement('p');
  text.textContent =
    'Skyfall Royale needs WebGL 2 and a desktop browser with mouse and keyboard. Enable hardware acceleration, then reload this page. If you are running locally, use npm run dev rather than opening index.html directly.';
  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : String(error);
  panel.append(title, text, detail);
  root.append(panel);
});
