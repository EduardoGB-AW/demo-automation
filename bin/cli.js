#!/usr/bin/env node
const path = require('path');
const lib = require('../lib');

const HELP = `demo-automation <command> [options]

Commands (PROJECT = folder with demo.config.js, default ".")
  env  [PROJECT]                 Start the project's services and keep them running (Ctrl+C stops).
  test [PROJECT] [-- ARGS]       Start the services, run the Playwright Test suite, stop. ARGS go to playwright.
  demo [PROJECT] NAME            Record the narrated video demo NAME (see demos in the config).
  cdp  --profile DIR [--port N] [--copy-from DIR] [--map HOST=IP] [URL]
                                 Open a visible Chrome with remote debugging on a profile folder.

Options
  --mode NAME                    Apply a mode defined in the config (repeatable).
  --no-env                       test/demo against services that are already running.
`;

function parse(argv) {
  const opts = { modes: [], positional: [], passthrough: [], env: true, map: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { opts.passthrough = argv.slice(i + 1); break; }
    if (a === '--mode') opts.modes.push(argv[++i]);
    else if (a === '--no-env') opts.env = false;
    else if (a === '--profile') opts.profile = argv[++i];
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--copy-from') opts.copyFrom = argv[++i];
    else if (a === '--map') { const [h, ip] = argv[++i].split('='); opts.map[h] = ip; }
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.positional.push(a);
  }
  return opts;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = parse(rest);
  if (!command || opts.help || command === '-h' || command === '--help' || command === 'help') { console.log(HELP); return 0; }

  if (command === 'cdp') {
    if (!opts.profile) throw new Error('cdp needs --profile DIR.');
    const profile = path.resolve(opts.profile);
    if (opts.copyFrom) {
      console.log(`Copying ${opts.copyFrom} -> ${profile} (the copy is kept for reuse)...`);
      lib.browser.copyProfile(path.resolve(opts.copyFrom), profile);
    }
    const r = await lib.browser.openCdp({ profile, port: opts.port, hostRules: opts.map, url: opts.positional[0] });
    console.log(`Chrome open with remote debugging on port ${r.port}.`);
    return 0;
  }

  const project = opts.positional[0] && !(command === 'demo' && opts.positional.length === 1) ? opts.positional[0] : '.';
  const { config, ctx } = lib.loadProject(project, { modes: opts.modes });

  if (command === 'env') {
    const env = await lib.environment.start(config, ctx);
    console.log('Environment ready. Ctrl+C to stop.');
    const stop = async () => { await env.stop(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    await new Promise(() => {});
  }
  if (command === 'test') {
    if (!opts.env) return lib.runTests(config, ctx, opts.passthrough);
    return lib.withEnvironment(config, ctx, () => lib.runTests(config, ctx, opts.passthrough));
  }
  if (command === 'demo') {
    const name = opts.positional.length === 1 ? opts.positional[0] : opts.positional[1];
    if (!name) throw new Error('demo needs a NAME.');
    const out = await lib.makeDemo(config, ctx, name);
    console.log(`Done: ${out}`);
    return 0;
  }
  console.log(HELP);
  return 1;
}

main().then((code) => process.exit(code ?? 0)).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
