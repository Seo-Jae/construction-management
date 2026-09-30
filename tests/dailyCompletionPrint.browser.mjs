import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.argv[2];
assert.ok(browser, 'Provide an Edge or Chromium executable');
const source = await readFile(new URL('../src/utils/dailyCompletionPrint.js', import.meta.url), 'utf8');
const results = new Map();
const cases = [{ days: 14, rows: 3, zoom: 0.8 }, { days: 30, rows: 14, zoom: 1 }, { days: 90, rows: 40, zoom: 1.25 }];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/module.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(source); return;
  }
  if (url.pathname === '/result') {
    results.set(url.searchParams.get('case'), JSON.parse(url.searchParams.get('data'))); res.end('ok'); return;
  }
  const index = Number(url.searchParams.get('case') || 0), item = cases[index];
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html style="zoom:${item.zoom}"><head><style>
    #root{height:2000px} .viewport{width:600px;height:300px;overflow:auto}
    table{table-layout:fixed;border-collapse:collapse;min-width:${650 + item.days * 56}px}
    th,td{border:1px solid #abc;padding:8px;font:12px Arial;position:sticky;left:0}
  </style></head><body><div id="root"><aside>Excluded navigation</aside><div class="viewport">
    <table id="table"><thead><tr>${Array.from({length:item.days + 9}, (_, i) => `<th>Column ${i}</th>`).join('')}</tr></thead>
    <tbody>${Array.from({length:item.rows}, (_, r) => `<tr>${Array.from({length:item.days + 9}, (_, c) => `<td>${r}-${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </div></div><script type="module">
    import {DAILY_COMPLETION_PRINT_CSS,prepareDailyCompletionPrint,clearDailyCompletionPrint} from '/module.js';
    const style=document.createElement('style');style.textContent=DAILY_COMPLETION_PRINT_CSS;document.head.append(style);
    window.addEventListener('beforeprint',()=>{
      prepareDailyCompletionPrint(document.getElementById('table'),'Project / selected stage / selected processes');
      const sheet=document.getElementById('daily-completion-print-sheet'),content=sheet.firstElementChild;
      const scale=Number(content.style.transform.match(/scale\\((.+)\\)/)[1]);
      fetch('/result?case=${index}&data='+encodeURIComponent(JSON.stringify({
        width:content.scrollWidth*scale,height:content.scrollHeight*scale,
        sheetWidth:sheet.clientWidth,sheetHeight:sheet.clientHeight,
        rows:sheet.querySelectorAll('tbody tr').length,columns:sheet.querySelectorAll('thead th').length,
        sticky:getComputedStyle(sheet.querySelector('td')).position,nav:!!sheet.querySelector('aside')
      })));
    });
    window.addEventListener('afterprint',clearDailyCompletionPrint);
  </script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const folder = await mkdtemp(join(tmpdir(), 'daily-completion-print-'));
try {
  for (const [index, item] of cases.entries()) {
    const pdf = join(folder, `case-${index}.pdf`);
    await new Promise((resolve, reject) => {
      const child = spawn(browser, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
        `--user-data-dir=${join(folder, `profile-${index}`)}`, `--print-to-pdf=${pdf}`,
        `http://127.0.0.1:${server.address().port}/?case=${index}`], {windowsHide:true, stdio:'ignore'});
      const timer = setTimeout(() => {child.kill(); reject(new Error('Print timeout'));}, 45000);
      child.on('error', reject);
      child.on('exit', code => {clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Exit ${code}`));});
    });
    const pdfData = await readFile(pdf);
    assert.equal((pdfData.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
    const data = results.get(String(index));
    assert.ok(data);
    assert.equal(data.rows, item.rows);
    assert.equal(data.columns, item.days + 9);
    assert.equal(data.sticky, 'static');
    assert.equal(data.nav, false);
    assert.ok(data.width <= data.sheetWidth && data.height <= data.sheetHeight, 'No clipped cells');
    console.log(`PASS ${item.days} days, ${item.rows} selected rows, zoom ${item.zoom}: one page, no clipping`);
  }
  console.log(`PDF artifacts: ${folder}`);
} finally {
  server.close();
}
