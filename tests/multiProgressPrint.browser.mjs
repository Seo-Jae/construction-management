// Run with: node tests/multiProgressPrint.browser.mjs <Chromium/Edge executable>
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.argv[2];
assert.ok(browser, 'Provide a Chromium or Edge executable path');
const source = await readFile(new URL('../src/utils/multiProgressPrint.js', import.meta.url), 'utf8');
const results = new Map();
const cases = [
  { buildings: 7, floors: 28, zoom: 0.8, processes: 2 },
  { buildings: 14, floors: 60, zoom: 1.25, processes: 12 },
  { buildings: 2, floors: 100, zoom: 1, processes: 4 },
];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/module.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(source); return;
  }
  if (url.pathname === '/result') {
    results.set(url.searchParams.get('case'), JSON.parse(url.searchParams.get('data')));
    res.end('ok'); return;
  }
  const index = Number(url.searchParams.get('case') || 0);
  const item = cases[index];
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html style="zoom:${item.zoom}"><head><style>
    body { margin:0; font:14px Arial } #root { height:2600px; overflow:hidden }
    .multi-progress-print-only {display:none}
    .multi-progress-stats {display:grid;gap:8px}
    .multi-progress-scroll {height:600px;overflow:auto}
    .multi-progress-buildings {display:flex;min-width:max-content;gap:20px}
    .multi-progress-building {flex:none;width:190px}
  </style></head><body><div id="root"><aside style="height:200px">Sidebar</aside>
    <div id="multi-progress-print-area" style="height:800px">
      <div class="multi-progress-print-only" style="height:65px">Project / process progress</div>
      <div class="multi-progress-no-print" style="height:80px">Toolbar</div>
      <div class="multi-progress-stats">${Array.from({length:item.processes}, (_, i) => `<div style="height:45px">Process ${i + 1}</div>`).join('')}</div>
      <div class="multi-progress-scroll"><div class="multi-progress-buildings">
      ${Array.from({length:item.buildings}, (_, b) => `<div class="multi-progress-building">${Array.from({length:item.floors},(_, f) => `<div style="height:22px;border:1px solid #abc">Building ${b + 1} / floor ${item.floors - f}</div>`).join('')}<div>Type / total units</div></div>`).join('')}
      </div></div>
    </div></div><script type="module">
      import {MULTI_PROGRESS_PRINT_CSS,prepareMultiProgressPrint,clearMultiProgressPrint} from '/module.js';
      const style=document.createElement('style'); style.textContent=MULTI_PROGRESS_PRINT_CSS; document.head.append(style);
      window.addEventListener('beforeprint',()=>{
        prepareMultiProgressPrint(document.getElementById('multi-progress-print-area'));
        const sheet=document.getElementById('multi-progress-print-sheet');
        const content=sheet.firstElementChild;
        const scale=Number(content.style.transform.match(/scale\\((.+)\\)/)[1]);
        const data={width:content.scrollWidth*scale,height:content.scrollHeight*scale,
          sheetWidth:sheet.clientWidth,sheetHeight:sheet.clientHeight,
          buildings:sheet.querySelectorAll('.multi-progress-building').length,
          toolbar:!!sheet.querySelector('.multi-progress-no-print')};
        fetch('/result?case=${index}&data='+encodeURIComponent(JSON.stringify(data)));
      });
      window.addEventListener('afterprint',clearMultiProgressPrint);
    </script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const folder = await mkdtemp(join(tmpdir(), 'multi-progress-print-'));
try {
  for (const [index, item] of cases.entries()) {
    const pdf = join(folder, `case-${index}.pdf`);
    await new Promise((resolve, reject) => {
      const child = spawn(browser, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
        `--user-data-dir=${join(folder, `profile-${index}`)}`, `--print-to-pdf=${pdf}`,
        `http://127.0.0.1:${server.address().port}/?case=${index}`], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Browser print timed out')); }, 45000);
      child.on('error', reject);
      child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Browser exited ${code}`)); });
    });
    const buffer = await readFile(pdf);
    assert.equal((buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'PDF must contain exactly one page');
    const measured = results.get(String(index));
    assert.ok(measured, 'beforeprint measured the complete content');
    assert.equal(measured.buildings, item.buildings);
    assert.equal(measured.toolbar, false);
    assert.ok(measured.width <= measured.sheetWidth && measured.height <= measured.sheetHeight, 'No diagram content may be clipped');
    console.log(`PASS: ${item.buildings} buildings, ${item.floors} floors, ${item.processes} processes, zoom ${item.zoom}: one page, no clipping`);
  }
} finally {
  server.close();
  // This is a fresh temporary directory created above, never a workspace path.
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
