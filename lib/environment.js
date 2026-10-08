const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');
const { sleep } = require('./tools');

// Any HTTP answer (even 404 or 401) means the service is up.
function responds(url) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: 3000, rejectUnauthorized: false }, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitFor(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await responds(url)) return true;
    await sleep(2000);
  }
  return false;
}

function stopProcess(child) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}

// Starts the project's services in order, each one waiting until its readyUrl answers.
// Refuses to start if one is already running: it would point at other data and the run
// would not be reproducible. Returns a handle to stop them (and run the afterStop hook).
async function start(config, ctx) {
  for (const s of config.services) {
    if (s.readyUrl && await responds(s.readyUrl)) {
      throw new Error(`${s.name} is already running (${s.readyUrl}). Stop it first.`);
    }
  }
  if (config.hooks.beforeStart) await config.hooks.beforeStart(ctx);

  const logs = path.join(config.output, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const started = [];
  const handle = {
    started,
    async stop() {
      for (const { service, child } of [...started].reverse()) {
        try {
          stopProcess(child);
          console.log(`  ${service.name} stopped.`);
        } catch {
          console.log(`  Could not stop ${service.name} (pid ${child.pid}).`);
        }
      }
      started.length = 0;
      if (config.hooks.afterStop) await config.hooks.afterStop(ctx);
    },
  };

  try {
    for (const s of config.services) {
      const logFile = path.join(logs, `${s.name}.log`);
      const out = fs.openSync(logFile, 'w');
      const options = {
        cwd: s.cwd,
        env: { ...process.env, ...s.env },
        stdio: ['ignore', out, out],
        windowsHide: true,
        detached: process.platform !== 'win32',
      };
      // Commands like npx are .cmd files on Windows and need a shell; with a shell the
      // command goes as one line (passing separate args with shell:true is deprecated).
      const useShell = s.shell ?? (process.platform === 'win32' && ['npx', 'npm'].includes(s.command));
      const child = useShell
        ? spawn([s.command, ...(s.args || [])].join(' '), { ...options, shell: true })
        : spawn(s.command, s.args || [], options);
      started.push({ service: s, child });
      console.log(`  ${s.name} (pid ${child.pid}), log: ${logFile}`);
      if (s.readyUrl && !(await waitFor(s.readyUrl, s.readyTimeoutMs ?? 180000))) {
        throw new Error(`${s.name} did not answer at ${s.readyUrl}. See ${logFile}`);
      }
    }
  } catch (err) {
    await handle.stop();
    throw err;
  }
  return handle;
}

module.exports = { start, responds, waitFor };
