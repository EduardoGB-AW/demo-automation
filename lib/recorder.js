const fs = require('fs');
const path = require('path');
const { launch } = require('./browser');

// Records a scripted walk through an app as video, timed to the narration.
//
// Scenes do real actions whose duration is unknown up front, so the recorder logs when each
// scene starts (timeline) and the assembler places each audio clip at that instant. If the
// actions finish before the narration, the scene waits for the rest; if they take longer,
// the next scene simply starts later -- audio never drifts from video.
//
// The script receives a "studio": { page, context, scene, highlight, click, type, select,
// pause } plus whatever the project passes in `extra`.
async function record({ manifest, outDir, name = 'demo', viewport = { width: 1600, height: 900 }, browser: browserOptions = {}, extra = {} }, script) {
  const recordings = path.join(outDir, 'recordings');
  const screenshots = path.join(outDir, 'screenshots');
  fs.mkdirSync(recordings, { recursive: true });
  fs.mkdirSync(screenshots, { recursive: true });

  const browser = await launch({ chromiumSandbox: true, ...browserOptions });
  const context = await browser.newContext({ viewport, recordVideo: { dir: recordings, size: viewport } });
  const page = await context.newPage();
  const t0 = Date.now();
  const timeline = [];
  let video = null;

  const pause = (ms) => page.waitForTimeout(ms);

  // No cursor in a headless video: outline what is about to be used so viewers see it.
  async function highlight(locator, ms = 600) {
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate((el, dur) => {
      const prev = [el.style.outline, el.style.outlineOffset];
      el.style.outline = '3px solid #f59e0b';
      el.style.outlineOffset = '2px';
      setTimeout(() => { [el.style.outline, el.style.outlineOffset] = prev; }, dur);
    }, ms);
    await pause(ms);
  }
  async function click(locator) {
    await highlight(locator, 450);
    await locator.click();
    await pause(500);
  }
  async function type(locator, text) {
    await highlight(locator, 300);
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(text, { delay: 45 });
  }
  async function select(locator, label) {
    await highlight(locator, 300);
    await locator.selectOption({ label });
    await pause(400);
  }
  async function scene(id, actions) {
    const narrated = manifest.find((s) => s.id === id);
    if (!narrated) throw new Error(`Scene without narration: ${id}`);
    const start = Date.now();
    timeline.push({ id, startMs: start - t0, file: narrated.file });
    console.log(`  scene ${id}`);
    await actions();
    const left = narrated.durationSeconds * 1000 - (Date.now() - start);
    if (left > 0) await pause(left);
    await page.screenshot({ path: path.join(screenshots, `${id}.png`) });
    await pause(500);
  }

  try {
    await script({ page, context, scene, highlight, click, type, select, pause, ...extra });
    await pause(1500);
  } catch (err) {
    // Without this the error was lost and the run "succeeded" with a cut video.
    await page.screenshot({ path: path.join(screenshots, 'ERROR.png') }).catch(() => {});
    throw new Error(`Scene ${timeline.at(-1)?.id ?? '(before the first scene)'} failed: ${err.message}`);
  } finally {
    const v = page.video();
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
    if (v) {
      video = path.join(recordings, `${name}.webm`);
      fs.renameSync(await v.path(), video);
    }
  }
  return { video, timeline };
}

module.exports = { record };
