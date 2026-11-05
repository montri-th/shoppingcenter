#!/usr/bin/env node
/**
 * Render SVG logo files to PNG on a transparent canvas (256 × 160, contain), as an <img> paints them, so the
 * backing under each logo is chosen from what it actually paints (scripts/collect-research-logos.py --svg-renders):
 * currentColor, CSS classes, clip paths and gradients are resolved by the browser, not guessed from the text.
 *
 *   node scripts/render-svg-logos.cjs <out dir> <svg file or folder or .zip> […]
 *
 * Output: <out dir>/<sha256 first 20>.png per SVG. Needs Playwright with Chromium (pre-installed in the build image).
 */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync} = require('child_process');

function svgFiles(inputs) {
  const out = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(input)) out.push(...svgFiles([path.join(input, name)]));
    } else if (input.toLowerCase().endsWith('.zip')) {
      const listing = execFileSync('python3', ['-I', '-c', 'import sys,zipfile,base64,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([base64.b64encode(z.read(i)).decode() for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith(".svg")]))', input], {maxBuffer: 1 << 28});
      for (const b64 of JSON.parse(listing)) out.push(Buffer.from(b64, 'base64'));
    } else if (input.toLowerCase().endsWith('.svg')) out.push(fs.readFileSync(input));
  }
  return out;
}

(async () => {
  const [outDir, ...inputs] = process.argv.slice(2);
  if (!outDir || !inputs.length) { console.error('usage: render-svg-logos.cjs <out dir> <svg|dir|zip> …'); process.exit(2); }
  fs.mkdirSync(outDir, {recursive: true});
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 400, height: 300}, deviceScaleFactor: 1});
  let n = 0;
  for (const bytes of svgFiles(inputs)) {
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const file = path.join(outDir, `${sha.slice(0, 20)}.png`);
    if (fs.existsSync(file)) continue;
    await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" style="width:256px;height:160px;object-fit:contain" src="data:image/svg+xml;base64,${bytes.toString('base64')}"></body></html>`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    await (await page.$('#i')).screenshot({path: file, omitBackground: true});
    n++;
  }
  await browser.close();
  console.log(JSON.stringify({rendered: n, outDir}));
})();
