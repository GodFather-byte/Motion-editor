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
        server.stdout.on('data', data => { const port = String(data).match(/port (\d+)/); if (port) resolve(`http://localhost:${port[1]}`); });
    });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});

after(async () => { await browser?.close(); server?.kill(); });

test('segmentPersonMediaPipe should throw an error when no masks are generated', async () => {
    const page = await browser.newPage();

    // We rewrite app.js to use window.__motion.getMediaPipeSegmenter if available,
    // so we can mock it from the page evaluate without modifying app.js permanently
    await page.route('**/app.js', async route => {
        const response = await route.fetch();
        let body = await response.text();

        body = body.replace(
            'const segmenter = await getMediaPipeSegmenter();',
            'const segmenter = await (window.__motion?.getMediaPipeSegmenter ? window.__motion.getMediaPipeSegmenter() : getMediaPipeSegmenter());'
        );

        await route.fulfill({
            response,
            body,
            headers: { ...response.headers(), 'content-type': 'application/javascript' }
        });
    });

    await page.goto(origin);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.__motion);

    // Evaluate in page context
    const errorMessage = await page.evaluate(async () => {
        let errorMsg = '';
        try {
            // override the method in window.__motion
            window.__motion.getMediaPipeSegmenter = async () => ({
                segment: () => ({ confidenceMasks: [] })
            });

            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;

            await window.__motion.segmentPersonMediaPipe(canvas);
        } catch (e) {
            errorMsg = e.message;
        }
        return errorMsg;
    });

    assert.equal(errorMessage, 'Nenhuma máscara gerada pelo MediaPipe.');
});
