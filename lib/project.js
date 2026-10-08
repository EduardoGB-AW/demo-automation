const fs = require('fs');
const path = require('path');

// A project plugs in with a `demo.config.js` (CommonJS) in any folder of its own repo, e.g.
// `e2e/demo.config.js`. Everything project-specific lives there; this tool only reads it.
//
// module.exports = {
//   name: 'my-app',
//   output: './output',                    // relative to the config file
//   services: [{ name, cwd, command, args, env, readyUrl, shell, readyTimeoutMs }],
//   hooks: { beforeStart(ctx), afterStop(ctx) },   // e.g. create / drop test databases
//   modes: { fast: (config, ctx) => { ...mutate config / ctx.env... } },
//   tests: { config: './playwright.config.js', env: { BASE_URL: 'http://localhost:3000' } },
//   demos: { tour: { script: './demo/tour.js', narration: './demo/tour.json', voice, viewport } },
// };
//
// Paths in the config are relative to the config file's folder.
function loadProject(dirOrFile, { modes = [] } = {}) {
  const file = path.resolve(dirOrFile.endsWith('.js') ? dirOrFile : path.join(dirOrFile, 'demo.config.js'));
  if (!fs.existsSync(file)) throw new Error(`No demo.config.js found at ${file}`);
  const raw = require(file);
  const root = path.dirname(file);
  const resolve = (p) => (p ? path.resolve(root, p) : p);

  const config = {
    ...raw,
    file,
    root,
    output: resolve(raw.output || './output'),
    services: (raw.services || []).map((s) => ({ ...s, cwd: resolve(s.cwd || '.'), env: { ...(s.env || {}) } })),
    hooks: raw.hooks || {},
    tests: raw.tests ? { ...raw.tests, config: resolve(raw.tests.config), env: { ...(raw.tests.env || {}) } } : null,
    demos: Object.fromEntries(Object.entries(raw.demos || {}).map(([name, d]) => [name, {
      ...d, script: resolve(d.script), narration: resolve(d.narration),
    }])),
    resolve,
  };

  // Context shared with hooks, modes, tests and demos (env goes to the test process).
  const ctx = { config, modes, env: { ...config.tests?.env }, testArgs: [] };
  for (const mode of modes) {
    const apply = raw.modes?.[mode];
    if (!apply) throw new Error(`Unknown mode "${mode}". Available: ${Object.keys(raw.modes || {}).join(', ') || '(none)'}`);
    apply(config, ctx);
  }
  return { config, ctx };
}

module.exports = { loadProject };
