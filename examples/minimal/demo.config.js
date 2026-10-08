// A project with no services of its own: it narrates a public page.
//   npx demo-automation demo examples/minimal tour
module.exports = {
  name: 'minimal',
  output: './output',
  services: [],
  demos: {
    tour: { script: './tour.js', narration: './tour.json', voice: 'en-US-AriaNeural', viewport: { width: 1280, height: 720 } },
  },
};
