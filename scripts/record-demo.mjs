// Records the README demo: the RealWorld map forms, the pointer clicks
// UserService, its dependants light up, then the full impact spreads in waves.
//
// Run it on a machine with a real GPU, against a running app:
//   npm start                      (in another terminal)
//   npm run demo:record            (or: node scripts/record-demo.mjs http://localhost:4200/)
//
// It drives a visible browser (Edge by default; DEMO_CHANNEL=chrome, or
// DEMO_BROWSER=<path to a Chromium>), captures every frame the compositor
// produces through the DevTools screencast, and writes the frames with their
// timings to demo-capture/. With ffmpeg on the PATH it also writes
// demo-capture/demo.gif; otherwise it prints the command to run.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4200/';
const out = join(import.meta.dirname, '..', 'demo-capture');
const viewport = { width: 1280, height: 720 };
const target = 'src/app/core/auth/services/user.service.ts';
const url = new URL('realworld', base).href;

const browser = await chromium.launch({
  headless: false,
  ...(process.env.DEMO_BROWSER
    ? { executablePath: process.env.DEMO_BROWSER }
    : { channel: process.env.DEMO_CHANNEL ?? 'msedge' }),
  args: [`--window-size=${viewport.width + 40},${viewport.height + 160}`],
});

async function openMap() {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  // Full quality, so the capture never steps down to lite while it records.
  await context.addInitScript(() => localStorage.setItem('orrery.graphics', 'full'));
  return { context, page: await context.newPage() };
}

/**
 * Finds where UserService's planet sits on screen once the map has formed.
 * The layout and the opening camera are deterministic, so a point found in a
 * first, unrecorded visit holds for the recorded one. At the overview the
 * planets are too small for labels, so this sweeps the pointer over the ring
 * above the "core" label: over a planet the pointer turns into a hand, and the
 * hovered planet shows its label.
 */
async function findPlanet() {
  const { context, page } = await openMap();
  await page.goto(url);
  const core = page.locator('[data-region]', { hasText: /^core$/ });
  await core.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(3500);
  const box = await core.boundingBox();
  const canvas = page.locator('canvas').first();
  const label = page.locator(`[data-node="${target}"]`);
  const cx = box.x + box.width / 2;
  for (let y = box.y - 4; y > box.y - 90; y -= 3) {
    for (let x = cx - 70; x < cx + 70; x += 3) {
      await page.mouse.move(x, y);
      if ((await canvas.evaluate((el) => el.style.cursor)) !== 'pointer') continue;
      await page.waitForTimeout(60);
      if (await label.isVisible()) {
        await context.close();
        return { x, y };
      }
    }
  }
  await context.close();
  throw new Error('Could not find the UserService planet in the core ring.');
}

/** Moves the real pointer along an eased path, so the drawn cursor glides. */
async function glide(page, from, to, ms) {
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(16);
  }
  return to;
}

const planet = await findPlanet();
console.log(`UserService is at ${Math.round(planet.x)}, ${Math.round(planet.y)}.`);

const { context, page } = await openMap();
// A screencast has no mouse pointer, so the page draws one.
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="white" stroke="black" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'translate(1100px, 640px)',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))',
    });
    document.body.append(cursor);
    addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
    });
  });
});

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'frames'), { recursive: true });
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const name = `${String(frames.length).padStart(5, '0')}.jpg`;
  writeFileSync(join(out, 'frames', name), Buffer.from(data, 'base64'));
  frames.push({ name, time: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

await page.mouse.move(1100, 640);
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 92,
  maxWidth: viewport.width,
  maxHeight: viewport.height,
});
const started = Date.now();
await page.goto(url);
await page
  .locator('[data-region]', { hasText: /^core$/ })
  .waitFor({ state: 'visible', timeout: 30_000 });
await page.waitForTimeout(Math.max(0, 3200 - (Date.now() - started)));

// Wander past a neighbour, settle on UserService, click.
let at = { x: 1100, y: 640 };
at = await glide(page, at, { x: planet.x + 140, y: planet.y + 90 }, 700);
at = await glide(page, at, planet, 650);
await page.waitForTimeout(350);
await page.mouse.down();
await page.waitForTimeout(90);
await page.mouse.up();
await page.waitForTimeout(2600);

// Then the full impact.
const impact = page.getByRole('button', { name: 'Show full impact' });
const ib = await impact.boundingBox();
at = await glide(page, at, { x: ib.x + ib.width / 2, y: ib.y + ib.height / 2 }, 800);
await page.waitForTimeout(250);
await impact.click();
await page.waitForTimeout(3400);

await cdp.send('Page.stopScreencast');
await browser.close();

// ffconcat with each frame's own duration keeps the real timing.
const lines = ['ffconcat version 1.0'];
frames.forEach((frame, i) => {
  const next = frames[i + 1]?.time ?? frame.time + 0.5;
  lines.push(`file frames/${frame.name}`, `duration ${(next - frame.time).toFixed(4)}`);
});
lines.push(`file frames/${frames.at(-1).name}`);
writeFileSync(join(out, 'frames.txt'), lines.join('\n') + '\n');
const seconds = frames.at(-1).time - frames[0].time;
console.log(
  `${frames.length} frames over ${seconds.toFixed(1)} s (${(frames.length / seconds).toFixed(0)} fps).`,
);

const gif = [
  '-y',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  join(out, 'frames.txt'),
  '-vf',
  'fps=25,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
  '-loop',
  '0',
  join(out, 'demo.gif'),
];
const ffmpeg = spawnSync('ffmpeg', gif, { stdio: 'inherit' });
if (ffmpeg.error)
  console.log(
    `ffmpeg not found. To make the GIF: ffmpeg ${gif.map((a) => (/[\s;[\]]/.test(a) ? `"${a}"` : a)).join(' ')}`,
  );
else console.log(`Wrote ${join(out, 'demo.gif')}.`);
