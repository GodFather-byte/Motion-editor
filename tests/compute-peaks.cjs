'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin;
before(async () => {
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', data => {
      const port = String(data).match(/port (\d+)/);
      if (port) resolve(`http://localhost:${port[1]}`);
    });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close(); server?.kill();
});

test('computePeaks correctly calculates amplitude peaks for an AudioBuffer', async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);

  const result = await page.evaluate(() => {
    // Create a mock AudioBuffer-like object
    const duration = 2; // 2 seconds
    const sampleRate = 44100;
    const length = duration * sampleRate;
    const data = new Float32Array(length);

    // Add some signals
    // High peak at 0.5s (index 22050)
    // To ensure the step logic catches the peak, fill a region larger than the step size (step is around 17 for this length/duration)
    for(let i=22000; i<22100; i++) data[i] = -0.9;

    // Lower peak at 1.5s (index 66150)
    for(let i=66100; i<66200; i++) data[i] = 0.4;

    const mockBuffer = {
      duration: duration,
      getChannelData: (channel) => {
        if (channel === 0) return data;
        throw new Error('Invalid channel');
      }
    };

    const peaks = window.__motion.computePeaks(mockBuffer);
    return Array.from(peaks);
  });

  // duration * 40 PEAKS_PER_SEC = 80 peaks
  assert.equal(result.length, 80, 'should generate correct number of peaks');

  // 0.5s is peak index 20 (0.5 * 40)
  assert.ok(result[19] > 0 || result[20] > 0 || result[21] > 0, 'should find peak around 0.5s');

  // Using Math.fround since the test runs on the Float32Array where 0.9 becomes 0.8999999761581421
  assert.ok(Math.max(...result) > 0.89 && Math.max(...result) < 0.91, 'maximum peak should be ~0.9');
});

test('computePeaks handles short duration edge cases', async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);

  const result = await page.evaluate(() => {
    // Very short duration
    const duration = 0.01;
    const length = 441;
    const data = new Float32Array(length);
    data[0] = 0.5;

    const mockBuffer = {
      duration: duration,
      getChannelData: (channel) => {
        if (channel === 0) return data;
        throw new Error('Invalid channel');
      }
    };

    const peaks = window.__motion.computePeaks(mockBuffer);
    return Array.from(peaks);
  });

  // Math.max(1, Math.ceil(0.01 * 40)) = 1 peak
  assert.equal(result.length, 1, 'should generate at least 1 peak even for very short duration');
  assert.ok(result[0] > 0.49 && result[0] < 0.51, 'should find the single peak');
});
