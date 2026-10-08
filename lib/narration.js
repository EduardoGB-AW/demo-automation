const fs = require('fs');
const path = require('path');
const { bin, run } = require('./tools');

function duration(file) {
  return parseFloat(run(bin.ffprobe(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
}

// Narration script: a JSON array of scenes, [{ "id": "01-intro", "text": "..." }, ...].
// Generates one mp3 per scene with edge-tts and measures it with ffprobe. Returns the
// manifest the recorder uses to time each scene.
function generate({ script, outDir, voice = 'en-US-AriaNeural' }) {
  fs.mkdirSync(outDir, { recursive: true });
  const scenes = JSON.parse(fs.readFileSync(script, 'utf8'));
  const manifest = scenes.map((scene) => {
    const file = path.join(outDir, `${scene.id}.mp3`);
    console.log(`  narration: ${scene.id}`);
    run(bin.edgeTts(), ['--voice', scene.voice || voice, '--text', scene.text, '--write-media', file]);
    return { ...scene, file, durationSeconds: duration(file) };
  });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { generate, duration };
