/**
 * Graphics quality. `full` is glow (bloom) at up to 2× pixel ratio; `lite`
 * renders straight to the screen at 1× with no glow, which roughly halves the
 * fill cost on a weak GPU. Everything that carries meaning (planets, edges,
 * labels) looks the same in both.
 */
export type GraphicsQuality = 'full' | 'lite';

/** What the visitor picked; `auto` lets the renderer step down by itself. */
export type GraphicsSetting = GraphicsQuality | 'auto';

/** Below this, sustained, the renderer switches itself to lite. */
export const STEP_DOWN_FPS = 45;
/** Frames before this are ignored: the sky bake and shader compiles make them slow. */
const WARM_UP_MS = 1500;
/** How long the frame rate is averaged over before deciding. */
const WINDOW_MS = 3000;

/**
 * True for software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render
 * Driver): those are slow enough to start in lite straight away.
 */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const name = gpuName(gl).toLowerCase();
  return ['swiftshader', 'llvmpipe', 'softpipe', 'software', 'basic render'].some((word) =>
    name.includes(word),
  );
}

/** The GPU's name as the browser reports it, for the frame-rate readout. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return typeof name === 'string' ? name : 'unknown GPU';
}

/**
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x000028A0) Direct3D11
 * vs_5_0 ps_5_0, D3D11)" becomes "NVIDIA GeForce RTX 4070 Laptop GPU".
 */
export function shortGpuName(name: string): string {
  const angle = /^ANGLE \((.*)\)$/.exec(name);
  const device = angle ? (angle[1]!.split(', ')[1] ?? angle[1]!) : name;
  return device.replace(/\s*\(0x[0-9a-f]+\).*$/i, '').trim() || name;
}

/**
 * Watches the frame rate once, after a warm-up, and says whether it stayed
 * below {@link STEP_DOWN_FPS}. Time spent in a hidden tab does not count:
 * browsers throttle those, which would look like a slow GPU.
 */
export class StepDownMonitor {
  private start = -1;
  private frames = 0;
  private done = false;

  /** Call once per frame. Returns true the one time a step-down is due. */
  frame(time: number, visible: boolean): boolean {
    if (this.done) return false;
    if (!visible) {
      this.reset();
      return false;
    }
    if (this.start < 0) this.start = time + WARM_UP_MS;
    if (time < this.start) return false;
    this.frames++;
    const elapsed = time - this.start;
    if (elapsed < WINDOW_MS) return false;
    this.done = true;
    return (this.frames * 1000) / elapsed < STEP_DOWN_FPS;
  }

  /** Starts over, e.g. after a new graph or when the tab comes back. */
  reset(): void {
    this.start = -1;
    this.frames = 0;
  }

  stop(): void {
    this.done = true;
  }
}

/** Frames per second and average frame time, updated twice a second. */
export class FrameCounter {
  fps = 0;
  frameMs = 0;
  private windowStart = -1;
  private frames = 0;

  /** Returns true when the numbers were updated. */
  frame(time: number): boolean {
    if (this.windowStart < 0) this.windowStart = time;
    this.frames++;
    const elapsed = time - this.windowStart;
    if (elapsed < 500) return false;
    this.fps = (this.frames * 1000) / elapsed;
    this.frameMs = elapsed / this.frames;
    this.windowStart = time;
    this.frames = 0;
    return true;
  }
}
