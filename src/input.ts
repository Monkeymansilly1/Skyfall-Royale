export const DEFAULT_BINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  reload: 'KeyR',
  interact: 'KeyE',
  build: 'KeyQ',
  wall: 'KeyZ',
  floor: 'KeyX',
  ramp: 'KeyC',
  cone: 'KeyV',
  edit: 'KeyG',
  rotate: 'KeyT',
  material: 'KeyB',
  drop: 'KeyH',
  map: 'KeyM',
  pickaxe: 'Digit6',
};
export type Action = keyof typeof DEFAULT_BINDINGS;
export interface Settings {
  volume: number;
  sensitivity: number;
  shadows: boolean;
  renderScale: number;
  bindings: Record<Action, string>;
}
export const DEFAULT_SETTINGS: Settings = {
  volume: 0.65,
  sensitivity: 1,
  shadows: true,
  renderScale: 1,
  bindings: { ...DEFAULT_BINDINGS },
};
export function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('skyfall.settings.v1') ?? '{}');
    return {
      volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.65,
      sensitivity:
        typeof saved.sensitivity === 'number' ? Math.max(0.2, Math.min(3, saved.sensitivity)) : 1,
      shadows: saved.shadows !== false,
      renderScale: [0.6, 0.8, 1].includes(saved.renderScale) ? saved.renderScale : 1,
      bindings: { ...DEFAULT_BINDINGS, ...saved.bindings },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } };
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem('skyfall.settings.v1', JSON.stringify(s));
  } catch {
    /* Storage can be disabled in private browsing. */
  }
}
export function keyLabel(code: string) {
  return (
    (
      {
        Space: 'SPACE',
        ShiftLeft: 'SHIFT',
        ShiftRight: 'SHIFT',
        ControlLeft: 'CTRL',
        ControlRight: 'CTRL',
        AltLeft: 'ALT',
      } as Record<string, string>
    )[code] ?? code.replace('Key', '').replace('Digit', '').toUpperCase()
  );
}
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = new Set<number>();
  mousePressed = new Set<number>();
  onAction: (action: Action, code: string) => void = () => {};
  onLook: (dx: number, dy: number) => void = () => {};
  onUnlock: () => void = () => {};
  remap: ((code: string) => void) | null = null;
  private abort = new AbortController();
  constructor(
    public canvas: HTMLCanvasElement,
    public settings: Settings,
  ) {
    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.remap) {
          e.preventDefault();
          const done = this.remap;
          this.remap = null;
          done(e.code);
          return;
        }
        if ((e.target as HTMLElement).matches('input,select,button') && !this.locked) return;
        if (this.locked && ['Space', 'Tab', 'ControlLeft', 'ShiftLeft'].includes(e.code))
          e.preventDefault();
        if (e.repeat) return;
        this.keys.add(e.code);
        this.pressed.add(e.code);
        const action = (Object.keys(this.settings.bindings) as Action[]).find(
          (a) => this.settings.bindings[a] === e.code,
        );
        if (action) this.onAction(action, e.code);
      },
      opts,
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), opts);
    window.addEventListener(
      'mousemove',
      (e) => {
        if (this.locked) this.onLook(e.movementX, e.movementY);
      },
      opts,
    );
    window.addEventListener(
      'mousedown',
      (e) => {
        if (this.locked) {
          this.mouse.add(e.button);
          this.mousePressed.add(e.button);
        }
      },
      opts,
    );
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button), opts);
    window.addEventListener(
      'contextmenu',
      (e) => {
        if (this.locked) e.preventDefault();
      },
      opts,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (!this.locked) {
          this.clear();
          this.onUnlock();
        }
      },
      opts,
    );
    window.addEventListener(
      'blur',
      () => {
        this.clear();
        if (this.locked) document.exitPointerLock();
        this.onUnlock();
      },
      opts,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.clear();
          if (this.locked) document.exitPointerLock();
          this.onUnlock();
        }
      },
      opts,
    );
  }
  get locked() {
    return document.pointerLockElement === this.canvas;
  }
  held(action: Action) {
    return this.keys.has(this.settings.bindings[action]);
  }
  tap(action: Action) {
    return this.pressed.has(this.settings.bindings[action]);
  }
  async lock() {
    await this.canvas.requestPointerLock();
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.clear();
    this.mousePressed.clear();
  }
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }
  dispose() {
    this.abort.abort();
    this.clear();
  }
}
