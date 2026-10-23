import { describe, expect, it } from 'vitest';
import { FrameCounter, shortGpuName, StepDownMonitor } from './quality';

/** Feeds frames at a steady rate and returns true if a step-down was asked for. */
function run(monitor: StepDownMonitor, fps: number, seconds: number, visible = true): boolean {
  let due = false;
  for (let time = 0; time <= seconds * 1000; time += 1000 / fps) {
    due = monitor.frame(time, visible) || due;
  }
  return due;
}

describe('StepDownMonitor', () => {
  it('asks to step down once when the frame rate stays low', () => {
    const monitor = new StepDownMonitor();
    expect(run(monitor, 30, 6)).toBe(true);
    expect(run(monitor, 30, 6)).toBe(false);
  });

  it('leaves a fast GPU alone, even on a 60 Hz screen', () => {
    expect(run(new StepDownMonitor(), 60, 6)).toBe(false);
    expect(run(new StepDownMonitor(), 120, 6)).toBe(false);
  });

  it('ignores time in a hidden tab, which browsers throttle', () => {
    expect(run(new StepDownMonitor(), 1, 10, false)).toBe(false);
  });

  it('decides nothing before the warm-up and the window have passed', () => {
    expect(run(new StepDownMonitor(), 20, 4)).toBe(false);
  });
});

describe('FrameCounter', () => {
  it('reports frames per second and frame time', () => {
    const counter = new FrameCounter();
    for (let time = 0; time <= 1000; time += 10) counter.frame(time);
    expect(counter.fps).toBeCloseTo(100, 0);
    expect(counter.frameMs).toBeCloseTo(10, 0);
  });
});

describe('shortGpuName', () => {
  it('keeps the device name from an ANGLE string', () => {
    expect(
      shortGpuName(
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x000028A0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('NVIDIA GeForce RTX 4070 Laptop GPU');
    expect(shortGpuName('Apple M2')).toBe('Apple M2');
  });
});
