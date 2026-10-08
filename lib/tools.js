const { spawnSync } = require('child_process');

// External binaries come from PATH by default; an environment variable overrides each one
// (useful when PATH was not refreshed in the current session, or several versions exist).
const bin = {
  edgeTts: () => process.env.EDGE_TTS_BIN || 'edge-tts',
  ffmpeg: () => process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobe: () => process.env.FFPROBE_BIN || 'ffprobe',
};

function run(command, args, options = {}) {
  const res = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (res.error) throw new Error(`${command} could not start: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${command} failed (${res.status}): ${res.stderr || res.stdout}`);
  return res.stdout;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { bin, run, sleep };
