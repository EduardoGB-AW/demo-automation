const { bin, run } = require('./tools');

// Mixes each narration clip into the recorded video at the instant its scene started
// (adelay per clip, then amix), instead of concatenating clips: scenes run real actions of
// variable length, and concatenation would drift audio from video.
function assemble({ video, timeline, output }) {
  if (!timeline.length) throw new Error('Empty timeline: nothing to narrate.');
  const args = ['-y', '-i', video];
  for (const scene of timeline) args.push('-i', scene.file);
  const filters = timeline.map((s, i) => `[${i + 1}:a]adelay=${s.startMs}|${s.startMs}[a${i}]`);
  filters.push(`${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0:duration=longest[narration]`);
  args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[narration]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', output);
  run(bin.ffmpeg(), args);
  return output;
}

module.exports = { assemble };
