import { CONFIG, ITEM_NAMES, RARITIES, RARITY_COLORS } from '../config';
import { DEFAULT_BINDINGS, keyLabel, saveSettings, type Action, type Settings } from '../input';
import { activeItem, isWeapon } from '../sim/inventory';
import { LOCATIONS, terrainHeight, sampleGround } from '../sim/map';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import type { GameScene } from '../render/scene';
import { icon } from './icons';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
const esc = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
interface FloatingNumber {
  el: HTMLElement;
  pos: { x: number; y: number; z: number };
  age: number;
}
export class HUD {
  onStart: (mode: 'solo' | 'practice') => void = () => {};
  onResume: () => void = () => {};
  onMenu: () => void = () => {};
  onSettings: (s: Settings) => void = () => {};
  onRemap: (action: Action, done: (code: string) => void) => void = () => {};
  private mini: HTMLCanvasElement;
  private map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement;
  private floats: FloatingNumber[] = [];
  private toastUntil = 0;
  private hitUntil = 0;
  private killUntil = 0;
  private lastInventory = '';
  private lastFeed = '';
  private lastEdit = '';
  private lastFrame = 0;
  overlay: 'none' | 'pause' | 'settings' | 'help' | 'results' | 'map' = 'none';
  previous: 'menu' | 'pause' = 'menu';
  constructor(
    public root: HTMLElement,
    public settings: Settings,
  ) {
    root.innerHTML = `
      <div id="loading" class="loading"><div class="brand">${icon('bolt')} SKYFALL<span>ROYALE</span></div><div class="loading-line"></div><p>Preparing the island…</p></div>
      <main id="menu" class="menu hidden">
        <header class="menu-header"><a class="brand" href="#" aria-label="Skyfall Royale home">${icon('bolt')} SKYFALL<span>ROYALE</span></a><nav><span class="status-dot"></span><span>LOCAL PLAY</span><button id="help-button" class="text-button">HOW TO PLAY</button><button id="settings-button" class="icon-button" aria-label="Settings">${icon('gear')}</button></nav></header>
        <div class="menu-content"><div class="eyebrow"><span class="tiny-line"></span> YOUR ISLAND. YOUR HIGH GROUND.</div><h1>SKYFALL<br><span>ROYALE.</span></h1><p class="menu-description">Drop into a sun-soaked island. Gear up, build your way out, and outlast the storm.</p>
          <div class="match-label"><span class="status-dot"></span> SOLO <span class="label-divider">/</span> 16 LOCAL AI OPPONENTS</div>
          <button id="play-button" class="primary">DROP INTO SOLO ${icon('arrow')}</button><button id="practice-button" class="practice-button">${icon('ramp')} FREE BUILD <span>Explore. Practice. No storm.</span>${icon('arrow')}</button>
          <div class="menu-facts"><span>${icon('people')} 17 contestants</span><span>${icon('wall')} Build & edit</span><span>${icon('bolt')} One survivor</span></div>
        </div>
        <div class="island-note"><div class="note-coordinate">ISLAND GRID &nbsp; A–H <span>01 / THE ISLAND</span></div><h2>TAKE THE<br>HIGH GROUND.</h2><div class="note-line"></div><p>Four places to land.<br>A hundred ways to survive.</p></div>
        <footer class="menu-footer"><span><b>W A S D</b> MOVE <i></i><b>MOUSE</b> LOOK <i></i><b>Q</b> BUILD</span><span>ORIGINAL WORLD · ALL OPPONENTS ARE LOCAL BOTS <span class="version">v1.0</span></span></footer>
      </main>
      <section id="hud" class="hud hidden" aria-label="Game status">
        <div class="hud-brand">${icon('bolt')} SKYFALL <span>ROYALE</span><small id="mode-label">SOLO · LOCAL AI</small></div>
        <div id="compass" class="compass"></div>
        <aside class="top-right"><div class="minimap-wrap"><canvas id="minimap" width="220" height="220" aria-label="Minimap with player and storm circles"></canvas><span id="map-location">THE ISLAND</span><span class="map-key">M</span></div><div class="match-counts"><span>${icon('people')}<b id="alive">17</b></span><span>${icon('skull')}<b id="kills">0</b></span><span class="storm-clock">◷ <b id="storm-clock">0:48</b></span></div><div id="storm-status" class="storm-status">STORM FORMING</div></aside>
        <div id="feed" class="feed"></div><div id="phase-banner" class="phase-banner"></div>
        <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hit-marker" class="hit-marker">╳</div>
        <div id="storm-warning" class="storm-warning hidden">YOU’RE IN THE STORM <strong>Get to the safe zone</strong></div><div id="damage-vignette" class="damage-vignette"></div>
        <div id="pickup" class="pickup hidden"></div><div id="action-progress" class="action-progress hidden"></div>
        <div id="toast" class="toast"></div><div id="kill-banner" class="kill-banner"></div>
        <div class="bottom-left"><div class="player-label"><span class="player-avatar">${icon('bolt')}</span><b>SKY PILOT</b><span id="stance">READY</span></div><div class="meter shield-meter">${icon('shieldbar')}<div><i id="shield-bar"></i></div><b id="shield-value">0</b><small>100</small></div><div class="meter health-meter">${icon('heart')}<div><i id="health-bar"></i></div><b id="health-value">100</b><small>100</small></div><div class="movement-hints" id="movement-hints"></div></div>
        <div class="bottom-right"><div id="materials" class="materials"></div><div id="building-tools" class="building-tools"></div><div class="weapon-readout"><span id="weapon-name"></span><span id="ammo"></span></div><div id="inventory" class="inventory"></div><div id="inventory-hints" class="inventory-hints"></div></div>
        <div id="edit-panel" class="edit-panel hidden"></div><div id="build-label" class="build-label hidden"></div>
        <div class="hud-pause"><button id="pause-button" class="icon-button" aria-label="Pause and settings">${icon('gear')}</button><span>ESC</span></div>
      </section>
      <div id="modal" class="modal hidden"><div id="modal-content" class="modal-content"></div></div>
      <div id="floating-numbers" class="floating-numbers"></div>
    `;
    this.mini = $<HTMLCanvasElement>('#minimap');
    this.map = document.createElement('canvas');
    this.map.width = 720;
    this.map.height = 720;
    this.mapBase = this.createMapBase();
    $('#play-button').onclick = () => this.onStart('solo');
    $('#practice-button').onclick = () => this.onStart('practice');
    $('#settings-button').onclick = () => this.showSettings('menu');
    $('#help-button').onclick = () => this.showHelp('menu');
    $('#pause-button').onclick = () => this.showPause();
    $('.brand').onclick = (e) => e.preventDefault();
  }
  ready() {
    $('#loading').classList.add('hidden');
    this.showMenu();
  }
  showMenu() {
    this.overlay = 'none';
    $('#menu').classList.remove('hidden');
    $('#hud').classList.add('hidden');
    $('#modal').classList.add('hidden');
    this.root.classList.add('menu-active');
  }
  showGame(mode: string) {
    this.overlay = 'none';
    $('#menu').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    $('#modal').classList.add('hidden');
    this.root.classList.remove('menu-active');
    $('#mode-label').textContent =
      mode === 'practice' ? 'FREE BUILD · NO STORM' : 'SOLO · LOCAL AI';
    this.lastInventory = '';
    this.lastFeed = '';
    this.lastEdit = '';
  }
  modal(html: string, kind: HUD['overlay']) {
    this.overlay = kind;
    $('#modal-content').innerHTML = html;
    $('#modal').classList.remove('hidden');
    setTimeout(() => $('#modal-content').querySelector<HTMLButtonElement>('button')?.focus(), 0);
  }
  close() {
    this.overlay = 'none';
    $('#modal').classList.add('hidden');
  }
  showPause() {
    if (this.overlay === 'results') return;
    this.modal(
      `<div class="eyebrow">TAKE A BREATHER</div><h2>ON HOLD.</h2><p>The island can wait. Your match is paused.</p><button id="resume" class="primary">BACK TO THE ISLAND ${icon('arrow')}</button><div class="modal-buttons"><button id="pause-settings">${icon('gear')} Settings</button><button id="pause-help">Controls</button></div><button id="return-menu" class="text-button muted">RETURN TO MENU</button>`,
      'pause',
    );
    $('#resume').onclick = () => this.onResume();
    $('#pause-settings').onclick = () => this.showSettings('pause');
    $('#pause-help').onclick = () => this.showHelp('pause');
    $('#return-menu').onclick = () => this.onMenu();
  }
  showHelp(previous: 'menu' | 'pause') {
    this.previous = previous;
    const bindings = this.settings.bindings;
    const rows: [Action, string][] = [
      ['forward', 'Move · with A / S / D'],
      ['jump', 'Jump / jump from transport / glider'],
      ['sprint', 'Sprint'],
      ['crouch', 'Crouch · while sprinting to slide'],
      ['interact', 'Pick up / swap · open / close doors'],
      ['reload', 'Reload · reset in edit mode'],
      ['build', 'Toggle building'],
      ['wall', 'Wall'],
      ['floor', 'Floor'],
      ['ramp', 'Ramp'],
      ['cone', 'Roof / cone'],
      ['rotate', 'Rotate piece'],
      ['material', 'Switch wood / brick / metal'],
      ['edit', 'Edit own build / confirm'],
      ['drop', 'Drop selected item'],
      ['map', 'Open island map'],
      ['pickaxe', 'Equip pickaxe'],
    ];
    this.modal(
      `<div class="eyebrow">FIELD GUIDE</div><h2>MAKE YOUR MOVE.</h2><p>Aim with the right mouse button. Fire, harvest, or place with the left. Pick your landing, loot supplies, then follow the white circle.</p><div class="help-grid">${rows.map(([a, label]) => `<div><kbd>${keyLabel(bindings[a])}</kbd><span>${label}</span></div>`).join('')}<div><kbd>1–5</kbd><span>Inventory · select edit regions</span></div><div><kbd>ESC</kbd><span>Pause / cancel edit</span></div></div><p class="small-note">Builds cost 10 materials. Aim at a build and press ${keyLabel(bindings.edit)}; click regions to remove them, then confirm. Wall regions use 1–9 (bottom to top), floors 1–4. Ramps rotate. Harvest trees, rocks, and crates with the pickaxe. Space against a low ledge mantles it.</p><button id="help-back" class="primary">GOT IT ${icon('arrow')}</button>`,
      'help',
    );
    $('#help-back').onclick = () => (previous === 'pause' ? this.showPause() : this.close());
  }
  showSettings(previous: 'menu' | 'pause') {
    this.previous = previous;
    this.modal(
      `<div class="eyebrow">TUNE YOUR DROP</div><h2>SETTINGS.</h2><div class="setting-row"><label for="volume">Audio volume</label><input id="volume" type="range" min="0" max="1" step=".05" value="${this.settings.volume}"><output id="volume-out">${Math.round(this.settings.volume * 100)}%</output></div><div class="setting-row"><label for="sensitivity">Mouse sensitivity</label><input id="sensitivity" type="range" min=".2" max="3" step=".1" value="${this.settings.sensitivity}"><output id="sensitivity-out">${this.settings.sensitivity.toFixed(1)}</output></div><div class="setting-row"><label for="shadows">Soft shadows</label><select id="shadows"><option value="true" ${this.settings.shadows ? 'selected' : ''}>On</option><option value="false" ${!this.settings.shadows ? 'selected' : ''}>Off</option></select></div><div class="setting-row"><label for="render-scale">Render resolution</label><select id="render-scale">${[1, 0.8, 0.6].map((s) => `<option value="${s}" ${this.settings.renderScale === s ? 'selected' : ''}>${Math.round(s * 100)}%</option>`).join('')}</select></div><div class="setting-section">KEY BINDINGS <span>Click a key, then press a replacement</span></div><div class="binding-grid">${(Object.keys(DEFAULT_BINDINGS) as Action[]).map((a) => `<div><span>${a.replace(/^./, (s) => s.toUpperCase())}</span><button class="binding" data-action="${a}">${keyLabel(this.settings.bindings[a])}</button></div>`).join('')}</div><div class="modal-buttons"><button id="reset-settings">Reset bindings</button><button id="settings-back" class="primary">DONE ${icon('arrow')}</button></div>`,
      'settings',
    );
    const update = () => {
      saveSettings(this.settings);
      this.onSettings(this.settings);
    };
    $<HTMLInputElement>('#volume').oninput = (e) => {
      this.settings.volume = Number((e.target as HTMLInputElement).value);
      $('#volume-out').textContent = `${Math.round(this.settings.volume * 100)}%`;
      update();
    };
    $<HTMLInputElement>('#sensitivity').oninput = (e) => {
      this.settings.sensitivity = Number((e.target as HTMLInputElement).value);
      $('#sensitivity-out').textContent = this.settings.sensitivity.toFixed(1);
      update();
    };
    $<HTMLSelectElement>('#shadows').onchange = (e) => {
      this.settings.shadows = (e.target as HTMLSelectElement).value === 'true';
      update();
    };
    $<HTMLSelectElement>('#render-scale').onchange = (e) => {
      this.settings.renderScale = Number((e.target as HTMLSelectElement).value);
      update();
    };
    document.querySelectorAll<HTMLButtonElement>('.binding').forEach(
      (b) =>
        (b.onclick = () => {
          b.textContent = 'PRESS KEY';
          this.onRemap(b.dataset.action as Action, (code) => {
            if (code !== 'Escape' && !code.startsWith('Meta')) {
              const action = b.dataset.action as Action;
              const duplicate = (Object.keys(this.settings.bindings) as Action[]).find(
                (a) => a !== action && this.settings.bindings[a] === code,
              );
              if (duplicate) this.settings.bindings[duplicate] = this.settings.bindings[action];
              this.settings.bindings[action] = code;
              update();
            }
            this.showSettings(previous);
          });
        }),
    );
    $('#reset-settings').onclick = () => {
      this.settings.bindings = { ...DEFAULT_BINDINGS };
      update();
      this.showSettings(previous);
    };
    $('#settings-back').onclick = () => (previous === 'pause' ? this.showPause() : this.close());
  }
  showResults(game: Game) {
    const victory = game.player.alive;
    const p = game.player;
    this.modal(
      `<div class="result-rank ${victory ? 'win' : ''}">${victory ? '#1' : `#${game.placement}`}</div><div class="eyebrow">${victory ? 'THE HIGH GROUND IS YOURS' : 'ANOTHER DROP. ANOTHER CHANCE.'}</div><h2>${victory ? 'SKYFALL<br>CHAMPION.' : 'OUT OF<br>THE RUNNING.'}</h2><p>${victory ? 'Last pilot standing. You outlasted the island.' : 'The island has more stories to tell. Ready for yours?'}</p><div class="results-stats"><div><b>${p.kills}</b><span>ELIMINATIONS</span></div><div><b>${Math.round(p.damageDone)}</b><span>DAMAGE DEALT</span></div><div><b>${p.built}</b><span>BUILDS PLACED</span></div><div><b>${clock(game.time)}</b><span>SURVIVED</span></div></div><button id="again" class="primary">DROP AGAIN ${icon('arrow')}</button><button id="results-menu" class="text-button muted">BACK TO MENU</button>`,
      'results',
    );
    $('#again').onclick = () => this.onStart('solo');
    $('#results-menu').onclick = () => this.onMenu();
  }
  showMap(game: Game) {
    this.modal(
      `<div class="eyebrow">THE ISLAND</div><h2>PICK YOUR GROUND.</h2><div id="full-map" class="full-map"></div><p class="map-legend"><span class="legend blue"></span> Current storm <span class="legend white"></span> Next safe zone <span class="legend yellow"></span> You</p><button id="close-map" class="primary">BACK TO THE ISLAND ${icon('arrow')}</button>`,
      'map',
    );
    $('#full-map').append(this.map);
    this.drawMap(game, this.map, true);
    $('#close-map').onclick = () => this.onResume();
  }
  update(game: Game, scene: GameScene, dt: number, now: number) {
    for (const f of [...this.floats]) {
      f.age += dt;
      const p = scene.project({ ...f.pos, y: f.pos.y + f.age * 1.5 });
      f.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      f.el.style.opacity = p.visible ? String(Math.min(1, (1 - f.age) * 3)) : '0';
      if (f.age > 1) {
        f.el.remove();
        this.floats.splice(this.floats.indexOf(f), 1);
      }
    }
    if (game.phase === 'menu') return;
    $('#hit-marker').classList.toggle('active', now < this.hitUntil);
    $('#toast').classList.toggle('visible', now < this.toastUntil);
    $('#kill-banner').classList.toggle('visible', now < this.killUntil);
    const a = game.player;
    $('#damage-vignette').style.opacity = String(
      Math.max(0, 1 - (game.time - a.lastHurt) * 2) * 0.4,
    );
    if (now - this.lastFrame < 0.09) return;
    this.lastFrame = now;
    $('#alive').textContent = String(game.alive);
    $('#kills').textContent = String(a.kills);
    $('#health-value').textContent = String(Math.ceil(a.health));
    $('#shield-value').textContent = String(Math.ceil(a.shield));
    $('#health-bar').style.width = `${a.health}%`;
    $('#shield-bar').style.width = `${a.shield}%`;
    $('#stance').textContent = a.gliding
      ? 'GLIDING'
      : game.phase === 'drop'
        ? 'FREEFALL'
        : a.sliding > 0
          ? 'SLIDING'
          : a.mantle > 0
            ? 'MANTLING'
            : a.crouched
              ? 'CROUCHED'
              : a.sprinting
                ? 'SPRINTING'
                : 'READY';
    $('#storm-clock').textContent = game.mode === 'practice' ? '∞' : clock(game.storm.remaining);
    $('#storm-status').textContent =
      game.mode === 'practice'
        ? 'FREE BUILD · NO STORM'
        : game.storm.complete
          ? 'FINAL STORM'
          : `${game.storm.shrinking ? 'STORM SHRINKING' : 'NEXT CIRCLE'} · PHASE ${game.storm.stage + 1}`;
    $('#storm-warning').classList.toggle(
      'hidden',
      game.mode !== 'solo' || !game.storm.outside(a.pos),
    );
    const b = this.settings.bindings;
    $('#movement-hints').innerHTML =
      `<kbd>${keyLabel(b.sprint)}</kbd> SPRINT <kbd>${keyLabel(b.crouch)}</kbd> CROUCH <kbd>${keyLabel(b.jump)}</kbd> JUMP`;
    $('#inventory-hints').innerHTML =
      `<kbd>${keyLabel(b.pickaxe)}</kbd> ${icon('pickaxe')} PICKAXE <kbd>${keyLabel(b.reload)}</kbd> RELOAD <kbd>${keyLabel(b.drop)}</kbd> DROP`;
    const item = activeItem(a);
    $('#weapon-name').textContent = game.buildMode ? 'BLUEPRINT' : ITEM_NAMES[item.kind];
    $('#ammo').innerHTML =
      isWeapon(item) && item.kind !== 'pickaxe'
        ? `<strong>${item.ammo}</strong><span> / ${item.reserve}</span>`
        : !isWeapon(item)
          ? `<strong>${item.count}</strong>`
          : '';
    const inventoryKey = JSON.stringify(a.inventory) + a.selected + game.buildMode;
    if (inventoryKey !== this.lastInventory) {
      this.lastInventory = inventoryKey;
      $('#inventory').innerHTML = a.inventory
        .map(
          (i, index) =>
            `<div class="inventory-slot ${!game.buildMode && a.selected === index ? 'selected' : ''}" style="--rarity:${RARITY_COLORS[i?.rarity ?? 0]}" title="${i ? RARITIES[i.rarity] + ' ' + ITEM_NAMES[i.kind] : 'Empty slot'}"><kbd>${index + 1}</kbd>${i ? icon(i.kind) : '<span class="empty-slot">+</span>'}<small>${i ? (isWeapon(i) ? i.ammo : i.count) : ''}</small></div>`,
        )
        .join('');
    }
    $('#materials').innerHTML =
      (['wood', 'brick', 'metal'] as const)
        .map(
          (m) =>
            `<span class="${game.buildMode && m === game.material ? 'active' : ''}">${icon(m)}<b>${a.materials[m]}</b></span>`,
        )
        .join('') + `<kbd>${keyLabel(b.material)}</kbd>`;
    $('#building-tools').innerHTML =
      (['wall', 'floor', 'ramp', 'cone'] as const)
        .map(
          (kind) =>
            `<div class="${game.buildMode && game.buildKind === kind ? 'active' : ''}">${icon(kind)}<kbd>${keyLabel(b[kind])}</kbd></div>`,
        )
        .join('') + `<span><kbd>${keyLabel(b.build)}</kbd> BUILD</span>`;
    $('#build-label').classList.toggle('hidden', !game.buildMode || !!game.editing);
    $('#build-label').innerHTML =
      `${icon(game.buildKind)} <strong>${game.buildKind.toUpperCase()}</strong><span>10 ${game.material}</span><kbd>${keyLabel(b.rotate)}</kbd> ROTATE <kbd>${keyLabel(b.edit)}</kbd> EDIT ${game.buildError ? `<em>${esc(game.buildError)}</em>` : ''}`;
    const feedKey = JSON.stringify(game.feed);
    if (feedKey !== this.lastFeed) {
      this.lastFeed = feedKey;
      $('#feed').innerHTML = game.feed
        .slice(0, 4)
        .map((f) => `<div class="${f.player ? 'highlight' : ''}">${esc(f.text)}</div>`)
        .join('');
    }
    $('#crosshair').className =
      `crosshair ${game.buildMode ? 'build' : ''} ${item.kind === 'shotgun' ? 'wide' : ''} ${a.reloading > 0 || a.consuming > 0 ? 'busy' : ''}`;
    const progress = a.reloading > 0 ? a.reloading : a.consuming;
    $('#action-progress').classList.toggle('hidden', progress <= 0);
    $('#action-progress').innerHTML =
      `<span class="progress-spinner"></span>${a.reloading > 0 ? 'RELOADING' : item.kind === 'shield' ? 'DRINKING SHIELD' : 'APPLYING FIELD KIT'} <b>${progress.toFixed(1)}s</b>`;
    const nearby = game.nearby;
    $('#pickup').classList.toggle('hidden', !nearby || game.phase !== 'playing');
    if (nearby)
      $('#pickup').innerHTML =
        'item' in nearby
          ? `<kbd>${keyLabel(b.interact)}</kbd><div><strong style="color:${RARITY_COLORS[nearby.item.rarity]}">${ITEM_NAMES[nearby.item.kind]}</strong><small>${RARITIES[nearby.item.rarity]} · ${a.inventory.every(Boolean) ? 'SWAP' : 'PICK UP'}</small></div>${icon(nearby.item.kind)}`
          : `<kbd>${keyLabel(b.interact)}</kbd><strong>${nearby.opened ? 'CLOSE' : 'OPEN'} DOOR</strong>`;
    $('#phase-banner').innerHTML =
      game.phase === 'bus'
        ? `<small>THE ISLAND IS CALLING</small><strong>CHOOSE YOUR DROP</strong><span><kbd>${keyLabel(b.jump)}</kbd> JUMP · auto-drop in ${Math.ceil(14 - game.busTime)}s</span>`
        : game.phase === 'drop'
          ? `<small>${a.gliding ? 'GLIDER DEPLOYED' : 'FREEFALL'}</small><strong>${a.gliding ? 'FIND YOUR LANDING' : 'MAKE AN ENTRANCE'}</strong><span>${keyLabel(b.forward)} ${keyLabel(b.left)} ${keyLabel(b.back)} ${keyLabel(b.right)} STEER · ${a.gliding && a.pos.y - sampleGround(a.pos.x, a.pos.z) < CONFIG.gliderHeight + 3 ? 'AUTO GLIDER' : `<kbd>${keyLabel(b.jump)}</kbd> ${a.gliding ? 'CLOSE' : 'DEPLOY'} GLIDER`}</span>`
          : '';
    const yaw = ((((scene.yaw * 180) / Math.PI) % 360) + 360) % 360;
    $('#compass').innerHTML =
      [-2, -1, 0, 1, 2]
        .map((offset) => {
          const deg = (Math.round(yaw / 15) * 15 + offset * 30 + 360) % 360;
          const label: Record<number, string> = {
            0: 'N',
            45: 'NW',
            90: 'W',
            135: 'SW',
            180: 'S',
            225: 'SE',
            270: 'E',
            315: 'NE',
          };
          return `<span class="${offset === 0 ? 'center' : ''}">${label[deg] ?? deg}<i></i></span>`;
        })
        .join('') + `<b>▾</b>`;
    const location = LOCATIONS.find(
      (p) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < p.radius + 12,
    );
    $('#map-location').textContent = location?.short.toUpperCase() ?? 'THE ISLAND';
    $('#edit-panel').classList.toggle('hidden', !game.editing);
    if (game.editing) {
      const p = game.editing,
        key = `${p.id}-${game.editMask}`;
      if (key !== this.lastEdit) {
        this.lastEdit = key;
        const count = p.kind === 'wall' ? 9 : p.kind === 'floor' ? 4 : 0;
        $('#edit-panel').innerHTML = `<div class="eyebrow">EDIT ${p.kind.toUpperCase()}</div>${
          count
            ? `<div class="edit-grid ${count === 4 ? 'four' : ''}">${Array.from(
                { length: count },
                (_, i) => {
                  const n = count === 9 ? Math.floor((8 - i) / 3) * 3 + (i % 3) : i;
                  return `<span class="${game.editMask & (1 << n) ? 'removed' : ''}">${n + 1}</span>`;
                },
              ).join('')}</div>`
            : `<strong>ROTATION ${game.editMask * 90}°</strong><p>Click or ${keyLabel(b.rotate)} to rotate</p>`
        }<p>Click a region or press its number</p><div><kbd>${keyLabel(b.edit)}</kbd> CONFIRM <kbd>${keyLabel(b.reload)}</kbd> RESET <kbd>ESC</kbd> CANCEL</div>`;
      }
    }
    this.drawMap(game, this.mini, false);
    if (this.overlay === 'map') this.drawMap(game, this.map, true);
  }
  event(event: GameEvent, now: number) {
    if (event.type === 'toast') {
      this.toast(event.text, now);
    }
    if (event.type === 'hit' && event.attacker === 0) {
      const el = document.createElement('div');
      el.className = `damage-number ${event.shield ? 'shield' : ''} ${event.headshot ? 'headshot' : ''}`;
      el.textContent = String(Math.round(event.amount));
      $('#floating-numbers').append(el);
      this.floats.push({ el, pos: event.pos, age: 0 });
      this.hitUntil = now + 0.16;
      $('#hit-marker').classList.toggle('headshot', event.headshot);
    }
    if (event.type === 'elimination' && event.killer === 'You') {
      $('#kill-banner').innerHTML = `ELIMINATED <strong>${esc(event.victim)}</strong>`;
      this.killUntil = now + 3;
    }
  }
  toast(text: string, now: number) {
    $('#toast').textContent = text;
    this.toastUntil = now + 2;
  }
  createMapBase() {
    const c = document.createElement('canvas');
    c.width = 440;
    c.height = 440;
    const ctx = c.getContext('2d')!,
      image = ctx.createImageData(440, 440);
    for (let z = 0; z < 440; z++)
      for (let x = 0; x < 440; x++) {
        const y = terrainHeight(x - 220, z - 220),
          i = (z * 440 + x) * 4;
        const col =
          y < 0
            ? [64, 126, 151]
            : y < 4
              ? [205, 192, 133]
              : [83 + Math.round(y), 119 + Math.round(y * 0.8), 75 + Math.round(y * 0.4)];
        image.data.set([...col, 255], i);
      }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = '#c4b58d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(157, 174);
    ctx.quadraticCurveTo(210, 190, 245, 225);
    ctx.lineTo(285, 170);
    ctx.moveTo(247, 286);
    ctx.quadraticCurveTo(237, 215, 137, 276);
    ctx.stroke();
    for (const p of LOCATIONS) {
      ctx.fillStyle = '#ead4a6';
      ctx.fillRect(p.x + 220 - 14, p.z + 220 - 8, 8, 9);
      ctx.fillRect(p.x + 220 + 6, p.z + 220 + 2, 8, 8);
    }
    return c;
  }
  drawMap(game: Game, canvas: HTMLCanvasElement, full: boolean) {
    const ctx = canvas.getContext('2d')!,
      n = canvas.width,
      scale = n / 440,
      to = (x: number) => (x + 220) * scale;
    ctx.clearRect(0, 0, n, n);
    ctx.drawImage(this.mapBase, 0, 0, n, n);
    if (game.mode === 'solo') {
      const s = game.storm;
      ctx.fillStyle = '#6460b15c';
      ctx.beginPath();
      ctx.rect(0, 0, n, n);
      ctx.arc(to(s.center.x), to(s.center.z), s.radius * scale, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#b1a6fb';
      ctx.lineWidth = full ? 3 : 1.6;
      ctx.beginPath();
      ctx.arc(to(s.center.x), to(s.center.z), s.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#fbf6df';
      ctx.lineWidth = full ? 2 : 1;
      ctx.beginPath();
      ctx.arc(to(s.target.x), to(s.target.z), s.targetRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      if (game.storm.outside(game.player.pos)) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(to(game.player.pos.x), to(game.player.pos.z));
        ctx.lineTo(to(s.target.x), to(s.target.z));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (full) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px system-ui';
      ctx.lineWidth = 3;
      for (const p of LOCATIONS) {
        ctx.strokeStyle = '#193748';
        ctx.strokeText(p.name, to(p.x), to(p.z) - 18);
        ctx.fillStyle = '#fff4d4';
        ctx.fillText(p.name, to(p.x), to(p.z) - 18);
      }
    }
    ctx.save();
    ctx.translate(to(game.player.pos.x), to(game.player.pos.z));
    ctx.rotate(-game.player.yaw);
    ctx.fillStyle = '#ffde75';
    ctx.strokeStyle = '#234252';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (game.phase === 'bus') {
      ctx.strokeStyle = '#fff5ba';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(to(-145), to(-35));
      ctx.lineTo(to(145), to(-35));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#ffffff10';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * n) / 8, 0);
      ctx.lineTo((i * n) / 8, n);
      ctx.moveTo(0, (i * n) / 8);
      ctx.lineTo(n, (i * n) / 8);
      ctx.stroke();
    }
  }
  reset() {
    this.close();
    this.floats.forEach((f) => f.el.remove());
    this.floats = [];
    this.toastUntil = 0;
    this.killUntil = 0;
    this.hitUntil = 0;
    this.lastInventory = '';
    this.lastFeed = '';
    this.lastEdit = '';
  }
}
