const path = require('path');
const { spawn } = require('child_process');
const { loadProject } = require('./project');
const environment = require('./environment');
const browser = require('./browser');
const narration = require('./narration');
const { record } = require('./recorder');
const { assemble } = require('./assemble');

// Starts the project's services, runs fn, and always stops them (and runs afterStop).
async function withEnvironment(config, ctx, fn) {
  console.log(`Starting ${config.services.length} service(s) for ${config.name || config.root}...`);
  const env = await environment.start(config, ctx);
  try {
    return await fn(env);
  } finally {
    await env.stop();
  }
}

// Runs the project's Playwright Test suite (tests.config) with ctx.env and ctx.testArgs
// added by modes, plus any extra CLI args. Returns the exit code.
function runTests(config, ctx, extraArgs = []) {
  if (!config.tests?.config) throw new Error('The project has no tests.config (Playwright config).');
  const args = ['playwright', 'test', '-c', config.tests.config, ...ctx.testArgs, ...extraArgs];
  // npx is a .cmd on Windows and needs a shell; with a shell the command goes as one quoted
  // line (separate args with shell:true are deprecated and not escaped).
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const options = { cwd: config.root, env: { ...process.env, ...ctx.env }, stdio: 'inherit' };
  return new Promise((resolve) => {
    const child = process.platform === 'win32'
      ? spawn(['npx', ...args].map(quote).join(' '), { ...options, shell: true })
      : spawn('npx', args, options);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

// Narrated video: narration (edge-tts) -> environment -> recording -> assembly (ffmpeg).
async function makeDemo(config, ctx, demoName) {
  const demo = config.demos[demoName];
  if (!demo) throw new Error(`Unknown demo "${demoName}". Available: ${Object.keys(config.demos).join(', ') || '(none)'}`);
  const outDir = path.join(config.output, demoName);
  console.log('1/4 Narration (edge-tts)...');
  const manifest = narration.generate({ script: demo.narration, outDir: path.join(outDir, 'narration'), voice: demo.voice });
  const script = require(demo.script);
  let recorded;
  await withEnvironment(config, ctx, async () => {
    console.log('2/4 Environment ready. 3/4 Recording...');
    recorded = await record({
      manifest, outDir, name: demoName, viewport: demo.viewport, browser: demo.browser, extra: { ctx },
    }, script);
  });
  console.log('4/4 Assembling (ffmpeg)...');
  const output = path.join(outDir, `${demoName}.mp4`);
  assemble({ video: recorded.video, timeline: recorded.timeline, output });
  return output;
}

module.exports = {
  loadProject, withEnvironment, runTests, makeDemo,
  environment, browser, narration, record, assemble,
};
