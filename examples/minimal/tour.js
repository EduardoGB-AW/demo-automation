const path = require('path');
const { pathToFileURL } = require('url');

// A local page, so the example works offline and needs no services.
module.exports = async function tour({ page, scene, highlight, type, click }) {
  await page.goto(pathToFileURL(path.join(__dirname, 'page.html')).href, { waitUntil: 'load' });
  await scene('01-page', () => highlight(page.locator('.card'), 1500));
  await scene('02-heading', async () => {
    await highlight(page.locator('h1'), 1000);
    await type(page.getByLabel('Search'), 'narrated demos');
  });
  await scene('03-link', () => click(page.getByRole('button', { name: 'Continue' })));
};
