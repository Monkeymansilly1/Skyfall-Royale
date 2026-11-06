import { CONFIG } from '../config';
import { clamp, lerp, v3, type Vec3 } from './math';
import { sampleGround } from './map';
export class Storm {
  stage = 0;
  shrinking = false;
  elapsed = 0;
  center = v3(0, 0, 0);
  radius: number = 190;
  from = v3();
  fromRadius = 190;
  target = v3();
  targetRadius: number = CONFIG.stormRadius[0];
  complete = false;
  constructor(private readonly rng: () => number) {
    this.chooseTarget();
  }
  get duration(): number {
    return this.shrinking ? CONFIG.stormShrink[this.stage] : CONFIG.stormWait[this.stage];
  }
  get remaining() {
    return Math.max(0, this.duration - this.elapsed);
  }
  get damage(): number {
    return CONFIG.stormDamage[this.stage];
  }
  chooseTarget() {
    const next = CONFIG.stormRadius[this.stage];
    const available = Math.max(0, this.radius - next) * 0.68;
    for (let i = 0; i < 20; i++) {
      const a = this.rng() * Math.PI * 2,
        d = this.rng() * available;
      const p = v3(this.center.x + Math.cos(a) * d, 0, this.center.z + Math.sin(a) * d);
      if (sampleGround(p.x, p.z) > 4 && Math.hypot(p.x, p.z) + next < 183) {
        this.target = p;
        break;
      }
    }
    this.targetRadius = next;
  }
  update(dt: number) {
    if (this.complete) return;
    this.elapsed += dt;
    if (this.shrinking) {
      const t = clamp(this.elapsed / this.duration, 0, 1);
      this.radius = lerp(this.fromRadius, this.targetRadius, t);
      this.center.x = lerp(this.from.x, this.target.x, t);
      this.center.z = lerp(this.from.z, this.target.z, t);
    }
    if (this.elapsed >= this.duration) {
      this.elapsed = 0;
      if (!this.shrinking) {
        this.shrinking = true;
        this.from = { ...this.center };
        this.fromRadius = this.radius;
      } else if (this.stage < CONFIG.stormRadius.length - 1) {
        this.stage++;
        this.shrinking = false;
        this.chooseTarget();
      } else {
        this.radius = 0;
        this.complete = true;
      }
    }
  }
  outside(pos: Vec3) {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.z) > this.radius;
  }
}
