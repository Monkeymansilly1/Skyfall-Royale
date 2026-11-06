import { clamp, dist, type Vec3 } from '../sim/math';
import type { GameEvent } from '../sim/types';
/** Original synthesized effects: no audio downloads, music, or third-party samples. */
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 0.65;
  noise: AudioBuffer | null = null;
  async resume() {
    if (!this.context) {
      const ctx = new AudioContext();
      this.context = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  suspend() {
    if (this.context?.state === 'running') void this.context.suspend();
  }
  tone(
    frequency: number,
    duration: number,
    gain: number,
    pos: Vec3,
    listener: Vec3,
    yaw: number,
    type: OscillatorType = 'sine',
    end = frequency,
    delay = 0,
  ) {
    const ctx = this.context;
    if (!ctx || !this.master || this.volume === 0) return;
    const distance = dist(pos, listener);
    if (distance > 130) return;
    const osc = ctx.createOscillator(),
      env = ctx.createGain(),
      pan = ctx.createStereoPanner(),
      start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(15, end), start + duration);
    env.gain.setValueAtTime(gain / (1 + distance * 0.07), start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const right = (pos.x - listener.x) * Math.cos(yaw) - (pos.z - listener.z) * Math.sin(yaw);
    pan.pan.value = clamp(right / Math.max(4, distance), -1, 1);
    osc.connect(env);
    env.connect(pan);
    pan.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      pan.disconnect();
    };
  }
  burst(duration: number, gain: number, pos: Vec3, listener: Vec3, yaw: number, cutoff = 1600) {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noise) return;
    const distance = dist(pos, listener);
    if (distance > 130) return;
    const source = ctx.createBufferSource(),
      env = ctx.createGain(),
      filter = ctx.createBiquadFilter(),
      pan = ctx.createStereoPanner();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    env.gain.setValueAtTime(gain / (1 + distance * 0.07), ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    pan.pan.value = clamp(
      ((pos.x - listener.x) * Math.cos(yaw) - (pos.z - listener.z) * Math.sin(yaw)) /
        Math.max(4, distance),
      -1,
      1,
    );
    source.connect(filter);
    filter.connect(env);
    env.connect(pan);
    pan.connect(this.master);
    source.start();
    source.stop(ctx.currentTime + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
      pan.disconnect();
    };
  }
  event(event: GameEvent, listener: Vec3, yaw: number) {
    if (event.type === 'shot') {
      const bass =
        event.weapon === 'shotgun'
          ? 70
          : event.weapon === 'sniper'
            ? 52
            : event.weapon === 'pickaxe'
              ? 180
              : 125;
      this.tone(
        bass,
        0.12,
        event.weapon === 'pickaxe' ? 0.09 : 0.2,
        event.from,
        listener,
        yaw,
        'triangle',
        30,
      );
      this.burst(
        event.weapon === 'shotgun' ? 0.16 : 0.075,
        event.weapon === 'pickaxe' ? 0.05 : 0.12,
        event.from,
        listener,
        yaw,
        event.weapon === 'sniper' ? 1200 : 2400,
      );
    } else if (event.type === 'hit' && event.attacker === 0) {
      this.tone(
        event.shield ? 790 : 550,
        0.075,
        0.11,
        listener,
        listener,
        yaw,
        'triangle',
        event.shield ? 1200 : 320,
      );
    } else if (event.type === 'sound') {
      const p = event.pos;
      switch (event.name) {
        case 'pickup':
        case 'chest':
          this.tone(560, 0.11, 0.14, p, listener, yaw, 'sine', 840);
          this.tone(1120, 0.15, 0.1, p, listener, yaw, 'sine', 1120, 0.09);
          break;
        case 'build':
          this.burst(0.14, 0.12, p, listener, yaw, 650);
          this.tone(120, 0.14, 0.08, p, listener, yaw, 'triangle', 70);
          break;
        case 'edit':
          this.tone(440, 0.12, 0.1, p, listener, yaw, 'sine', 660);
          break;
        case 'reload':
          this.burst(0.07, 0.08, p, listener, yaw, 2000);
          this.tone(250, 0.08, 0.04, p, listener, yaw, 'square', 400, 0.15);
          break;
        case 'drink':
          this.tone(330, 0.35, 0.06, p, listener, yaw, 'sine', 700);
          break;
        case 'step':
          this.burst(0.055, 0.018, p, listener, yaw, 800);
          break;
        case 'land':
          this.burst(0.12, 0.08, p, listener, yaw, 350);
          break;
        case 'jump':
          this.burst(0.055, 0.03, p, listener, yaw, 1000);
          break;
        case 'break':
          this.burst(0.23, 0.12, p, listener, yaw, 1100);
          break;
        case 'storm':
          for (let i = 0; i < 3; i++)
            this.tone(
              310 + i * 80,
              0.4,
              0.09,
              listener,
              listener,
              yaw,
              'sine',
              310 + i * 80,
              i * 0.18,
            );
          break;
        case 'victory':
          for (const [i, f] of [392, 494, 587, 784].entries())
            this.tone(f, 0.6, 0.13, listener, listener, yaw, 'triangle', f, i * 0.14);
          break;
      }
    }
  }
}
