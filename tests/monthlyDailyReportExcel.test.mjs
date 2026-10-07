import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { buildMonthlyDailyReport } from '../src/utils/monthlyDailyReportExcel.js';

const template = fs.readFileSync(new URL('../public/templates/daily-report-monthly.xlsm', import.meta.url));
const options = {
  projectName: '테스트 현장 & A', year: 2026, month: 9, lastDay: 30,
  reports: { '26.09.01': { workers: [{ name: '검증 근로자', job: '직영', workContent: 'A < B' }] } },
  normalizeJob: value => value || '',
  cumulativeCells: [{ job: '직영', labelCell: 'B10', todayCell: 'C10', previousCell: 'E10', totalCell: 'F10' }],
};

test('download restores original NO order across both blocks for previously interleaved uploads', async () => {
  const workers = Array.from({ length: 30 }, (_, index) => [index + 1, index + 31]).flat()
    .map(sequence => ({ sequence, name: `근로자${sequence}`, job: '직영', workContent: `작업${sequence}` }));
  const output = await buildMonthlyDailyReport(template, { ...options, lastDay: 1, reports: { '26.09.01': { workers } } });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(output);
  const sheet = book.worksheets[1];
  for (let index = 0; index < 30; index += 1) {
    assert.equal(sheet.getCell(`C${18 + index}`).value, `근로자${index + 1}`);
    assert.equal(sheet.getCell(`I${18 + index}`).value, `근로자${index + 31}`);
    assert.equal(sheet.getCell(`L${18 + index}`).value, `작업${index + 31}`);
  }
  assert.equal(sheet.getCell('N7').result, 60);
  assert.equal(workers[1].sequence, 31);
});

test('monthly macro workbook preserves controls and VBA, stamps site, dates, roster and summary', async () => {
  const output = await buildMonthlyDailyReport(template, options);
  const original = await JSZip.loadAsync(template);
  const zip = await JSZip.loadAsync(output);
  for (const path of Object.keys(original.files).filter(path => /vbaProject|ctrlProp|vmlDrawing/.test(path))) {
    assert.deepEqual(await zip.file(path).async('uint8array'), await original.file(path).async('uint8array'));
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(output);
  assert.equal(book.worksheets.length, 31);
  assert.equal(book.worksheets[0].name, '노임검토');
  assert.equal(book.worksheets[0].getCell('D2').value, options.projectName);
  for (const sheet of book.worksheets.slice(1)) assert.equal(sheet.getCell('C3').value, options.projectName);
  assert.equal(book.worksheets[1].name, '260901');
  assert.equal(book.worksheets[30].name, '260930');
  assert.equal(book.worksheets[1].getCell('C18').value, '검증 근로자');
  assert.equal(book.worksheets[1].getCell('F18').value, 'A < B');
  assert.equal(book.worksheets[0].getCell('C5').value, '검증 근로자');
  assert.match(book.worksheets[0].getCell('E5').formula, /'260901'/);
  assert.equal(book.worksheets[0].getCell('AI5').value, 0);
  assert.equal(book.worksheets[2].getCell('E10').formula, "'260901'!F10");
  for (const sheet of book.worksheets.slice(1)) {
    assert.equal(sheet.getCell('N7').formula, 'COUNTA(C18:C47,I18:I47)');
  }
  assert.equal(book.worksheets[1].getCell('N7').result, 1);
  assert.equal(book.worksheets[2].getCell('N7').result, 0);
  assert.equal(book.worksheets[1].getCell('B10').value, '직영');
  for (const sheet of book.worksheets.slice(2)) {
    for (const col of ['B', 'H']) for (let row = 8; row <= 14; row += 1) {
      const ref = `'260901'!${col}${row}`;
      assert.equal(sheet.getCell(`${col}${row}`).formula, `IF(${ref}="","",${ref})`);
    }
    assert.equal(sheet.getCell('B10').result, '직영');
  }
  assert.equal(zip.file('xl/calcChain.xml'), null);
  assert.equal(zip.file('xl/worksheets/sheet32.xml'), null);
});

test('February and current-month subsets have only valid date sheets; names are not silently truncated', async () => {
  for (const [year, month, lastDay] of [[2028, 2, 29], [2026, 2, 28], [2026, 9, 2]]) {
    const output = await buildMonthlyDailyReport(template, { ...options, year, month, lastDay, reports: {} });
    const book = new ExcelJS.Workbook(); await book.xlsx.load(output);
    assert.equal(book.worksheets.length, lastDay + 1);
    assert.equal(book.worksheets[1].getCell('C3').value, options.projectName);
    assert.equal(book.worksheets[1].getCell('C18').value, null);
    const firstName = book.worksheets[1].name;
    assert.equal(book.worksheets[2].getCell('B10').formula, `IF('${firstName}'!B10="","",'${firstName}'!B10)`);
  }
  await assert.rejects(buildMonthlyDailyReport(template, { ...options, reports: { '26.09.01': { workers: Array(61).fill({ name: 'worker' }) } } }), /60명/);
});

test('N7 counts workers across both roster blocks without a self-reference on the first day', async () => {
  const workers = Array.from({ length: 31 }, (_, index) => ({ name: `근로자${index + 1}`, job: '직영' }));
  const output = await buildMonthlyDailyReport(template, { ...options, lastDay: 1, reports: { '26.09.01': { workers } } });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(output);
  const sheet = book.worksheets[1];
  assert.equal(sheet.getCell('I18').value, '근로자31');
  assert.equal(sheet.getCell('N7').result, 31);
  assert.equal(sheet.getCell('B10').formula, undefined);
});
