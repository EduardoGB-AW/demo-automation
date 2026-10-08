const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { sleep } = require('./tools');

// Real Chrome (channel "chrome"), headless by default. hostRules maps hostnames to IPs
// without touching the system hosts file, e.g. { 'app.example.com': '10.0.0.5' }.
function launch({ headless = true, hostRules, args = [], ...rest } = {}) {
  const extra = [...args];
  if (hostRules && Object.keys(hostRules).length) {
    extra.push(`--host-resolver-rules=${Object.entries(hostRules).map(([h, ip]) => `MAP ${h} ${ip}`).join(', ')}`);
  }
  return chromium.launch({ channel: 'chrome', headless, args: extra, ...rest });
}

// Connects to a Chrome already running with --remote-debugging-port (see openCdp).
function connectCdp(port = 9222) {
  return chromium.connectOverCDP(`http://127.0.0.1:${port}`);
}

// Copies a Chrome user-data folder so automation can use it while the original stays in
// use (Chrome 136+ refuses remote debugging on the default profile). Skips caches and lock
// files. The copy is never deleted by this tool: it is meant to be reused.
function copyProfile(source, target) {
  const skip = new Set(['Cache', 'Code Cache', 'GPUCache', 'Service Worker', 'Crashpad', 'ShaderCache',
    'GrShaderCache', 'DawnCache', 'component_crx_cache', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']);
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    filter: (src) => !skip.has(path.basename(src)),
  });
  return target;
}

// Chrome shows "Restore pages? Chrome didn't shut down correctly" when the profile was not
// flagged as closed cleanly (automation often exits abruptly). This forces the flag.
function markProfileExitedCleanly(userDataDir) {
  const patch = (file, mutate) => {
    if (!fs.existsSync(file)) return;
    try {
      const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
      mutate(obj);
      fs.writeFileSync(file, JSON.stringify(obj));
    } catch { /* best effort */ }
  };
  patch(path.join(userDataDir, 'Default', 'Preferences'), (o) => {
    o.profile = { ...o.profile, exit_type: 'Normal', exited_cleanly: true };
  });
  patch(path.join(userDataDir, 'Local State'), (o) => {
    o.user_experience_metrics = o.user_experience_metrics || {};
    o.user_experience_metrics.stability = { ...o.user_experience_metrics.stability, exited_cleanly: true };
  });
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? [`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  const found = candidates.find((c) => c && fs.existsSync(c));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH.');
  return found;
}

// Opens a visible Chrome with remote debugging on a given profile folder, detached, so a
// person can use it and automation can attach (connectCdp) at the same time.
async function openCdp({ profile, port = 9222, hostRules, url = 'about:blank' } = {}) {
  if (!profile) throw new Error('openCdp needs a profile folder.');
  fs.mkdirSync(profile, { recursive: true });
  markProfileExitedCleanly(profile);
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run'];
  if (hostRules && Object.keys(hostRules).length) {
    args.push(`--host-resolver-rules=${Object.entries(hostRules).map(([h, ip]) => `MAP ${h} ${ip}`).join(', ')}`);
  }
  args.push(url);
  const child = spawn(chromePath(), args, { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { port, pid: child.pid };
    } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error(`Chrome did not open remote debugging on port ${port}.`);
}

module.exports = { launch, connectCdp, copyProfile, markProfileExitedCleanly, openCdp };
