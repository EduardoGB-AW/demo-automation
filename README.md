# demo-automation

Start a project's services, drive its apps in a real Chrome, run its end-to-end tests, and
record narrated video demos — from one command. The tool knows nothing about your apps:
each project plugs in with a `demo.config.js` that lives in the project's own repo, next to
its Playwright tests and demo scripts.

- **Environment:** starts the services a project needs (any command: `dotnet run`,
  `npm run dev`, `docker compose up`…), waits until each answers, stops them all afterwards.
  Hooks prepare and clean data (e.g. create and drop test databases).
- **Tests:** runs the project's standard [Playwright Test](https://playwright.dev) suite
  against that environment. The tests are plain `*.spec.js` files, so any CI or tool that
  runs Playwright can run them too.
- **Narrated demos:** turns a script of scenes into a video. Each scene's narration is
  generated with [edge-tts](https://github.com/rany2/edge-tts), the scene's real actions are
  recorded with Playwright, and ffmpeg places each audio clip exactly where its scene
  started, so audio never drifts even when actions take longer than planned.
- **Chrome for humans and bots at once:** opens a visible Chrome with remote debugging on a
  reusable copy of a profile, so you can click around while automation attaches over CDP.

## Requirements

- Node.js 20+ and Google Chrome.
- For demos: `edge-tts` (`pip install edge-tts`) and `ffmpeg`/`ffprobe` on PATH (or
  `EDGE_TTS_BIN`, `FFMPEG_BIN`, `FFPROBE_BIN`), plus Playwright's video encoder once:
  `npx playwright install ffmpeg`.

## Install in a project

```
cd my-app/e2e
npm install --save-dev @playwright/test github:EduardoGB-AW/demo-automation
```

## Commands

```
npx demo-automation env  [PROJECT]              start the services and keep them running (Ctrl+C stops)
npx demo-automation test [PROJECT] [-- ARGS]    start, run the Playwright suite, stop (ARGS go to playwright)
npx demo-automation demo [PROJECT] NAME         record the narrated demo NAME
npx demo-automation cdp --profile DIR [--port 9222] [--copy-from DIR] [--map host=ip] [URL]

  --mode NAME    apply a mode from the config (repeatable)
  --no-env       test/demo against services that are already running
```

`PROJECT` is the folder with `demo.config.js` (default: current folder).

## demo.config.js

```js
module.exports = {
  name: 'my-app',
  output: './output',                          // logs, test report, demo videos
  services: [
    { name: 'api', cwd: '../api', command: 'dotnet', args: ['run'], readyUrl: 'http://localhost:5000/health',
      env: { ASPNETCORE_ENVIRONMENT: 'Development' } },
    { name: 'web', cwd: '..', command: 'npx', args: ['vite', '--port', '5173'], readyUrl: 'http://localhost:5173/' },
  ],
  hooks: {
    beforeStart(ctx) { /* reset test data */ },
    afterStop(ctx) { /* clean up */ },
  },
  modes: {
    // e.g. `--mode slow-network`: change service env, test env (ctx.env) or playwright args (ctx.testArgs)
    'slow-network': (config, ctx) => { ctx.env.SLOW = '1'; },
  },
  tests: { config: './playwright.config.js', env: { BASE_URL: 'http://localhost:5173' } },
  demos: {
    tour: { script: './demo/tour.js', narration: './demo/tour.json', voice: 'en-US-AriaNeural' },
  },
};
```

Paths are relative to the config file. A config can `require` another project's config and
spread it, e.g. an app that is always tested inside a host portal reuses the portal's
services and adds its own tests and demos.

## Demo scripts

The narration is a JSON array of scenes:

```json
[
  { "id": "01-home", "text": "This is the home page." },
  { "id": "02-search", "text": "Searching filters the list as you type." }
]
```

The script gets a studio with the page and helpers that make actions visible in a headless
recording (the element is outlined before it is used):

```js
module.exports = async function tour({ page, scene, click, type, select, highlight, pause }) {
  await page.goto('http://localhost:5173/');
  await scene('01-home', () => highlight(page.locator('h1'), 1500));
  await scene('02-search', async () => {
    await type(page.getByLabel('Search'), 'invoices');
    await highlight(page.locator('table'), 1200);
  });
};
```

Each `scene(id, actions)` waits at least as long as its narration. The result is
`output/<demo>/<demo>.mp4`, plus one screenshot per scene and `ERROR.png` if a scene fails.

See `examples/minimal` for a complete project that needs no services.

## Library

Everything the CLI does is available from `require('demo-automation')`: `loadProject`,
`withEnvironment`, `runTests`, `makeDemo`, and the building blocks `environment`,
`browser` (`launch`, `connectCdp`, `openCdp`, `copyProfile`), `narration`, `record`,
`assemble`.

## License

MIT
