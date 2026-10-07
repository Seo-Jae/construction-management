import JSZip from 'jszip';

const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const column = number => number > 26 ? String.fromCharCode(64 + Math.floor((number - 1) / 26)) + String.fromCharCode(65 + (number - 1) % 26) : String.fromCharCode(64 + number);
const excelDate = (year, month, day) => (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;

function updateCells(xml, values) {
  const pending = new Set(Object.keys(values));
  const result = xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (whole, attributes) => {
    const address = attributes.match(/\br="([^"]+)"/)?.[1];
    if (!pending.has(address)) return whole;
    pending.delete(address);
    const attrs = attributes.replace(/\s+t="[^"]*"/g, '');
    const value = values[address];
    if (value === null || value === '') return `<c${attrs}/>`;
    if (typeof value === 'number') return `<c${attrs}><v>${value}</v></c>`;
    if (typeof value === 'object') return `<c${attrs}${typeof value.result === 'string' ? ' t="str"' : ''}><f>${escapeXml(value.formula)}</f><v>${escapeXml(value.result ?? 0)}</v></c>`;
    return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  });
  if (pending.size) throw new Error(`출력일보 양식의 셀을 확인해주세요: ${[...pending].join(', ')}`);
  return result;
}

// Patch the original OOXML package instead of reserializing through ExcelJS:
// VBA, form controls, drawings, print styles and sheet code names remain intact.
export async function buildMonthlyDailyReport(template, { projectName, year, month, lastDay, reports, normalizeJob, cumulativeCells }) {
  if (!projectName || lastDay < 1 || lastDay > new Date(year, month, 0).getDate()) throw new Error('현장과 출력 기간을 확인해주세요.');
  const zip = await JSZip.loadAsync(template);
  let workbook = await zip.file('xl/workbook.xml').async('string');
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)];
  if (sheets.length !== 32 || sheets[0][1] !== '노임검토' || !zip.file('xl/vbaProject.bin')) throw new Error('노임검토 매크로 양식을 확인해주세요.');
  const sheetNames = new Map(sheets.slice(1).map((sheet, index) => [sheet[1], `${String(year).slice(-2)}${String(month).padStart(2, '0')}${String(index + 1).padStart(2, '0')}`]));
  const renameReferences = xml => xml.replace(/'([0-9]{6})'!/g, (ref, name) => sheetNames.has(name) ? `'${sheetNames.get(name)}'!` : ref);
  const people = new Map();
  const totals = {};
  for (let day = 1; day <= lastDay; day += 1) {
    const key = `${String(year).slice(-2)}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
    const workers = reports[key]?.workers || [];
    if (workers.length > 60) throw new Error(`${day}일은 ${workers.length}명입니다. 첨부 양식은 하루 60명까지 지원하므로 명단을 잘라서 다운로드하지 않습니다.`);
    const values = { C3: projectName, C4: '(주)욱림건설', C5: excelDate(year, month, day) };
    values.N7 = { formula: 'COUNTA(C18:C47,I18:I47)', result: workers.filter(worker => worker.name).length };
    for (let index = 0; index < 60; index += 1) {
      const worker = workers[index];
      const row = 18 + index % 30;
      const cols = index < 30 ? ['B','C','D','E','F'] : ['H','I','J','K','L'];
      const fields = worker ? [normalizeJob(worker.job), worker.name || '', worker.process || worker.job || '', worker.location || '', worker.workContent || worker.work_content || ''] : ['', '', '', '', ''];
      cols.forEach((col, i) => { values[`${col}${row}`] = fields[i]; });
      if (worker?.name && !people.has(worker.name)) people.set(worker.name, normalizeJob(worker.job));
    }
    for (const { job, labelCell, todayCell, previousCell, totalCell } of cumulativeCells) {
      const count = workers.filter(worker => worker.name && normalizeJob(worker.job) === job).length;
      values[labelCell] = job;
      values[todayCell] = { formula: `COUNTIF($B$18:$B$47,${labelCell})+COUNTIF($H$18:$H$47,${labelCell})`, result: count };
      values[previousCell] = day === 1 ? 0 : { formula: `'${[...sheetNames.values()][day - 2]}'!${totalCell}`, result: totals[job] || 0 };
      totals[job] = (totals[job] || 0) + count;
      values[totalCell] = { formula: `${todayCell}+${previousCell}`, result: totals[job] };
    }
    if (day > 1) {
      const firstSheetName = [...sheetNames.values()][0];
      for (const col of ['B', 'H']) {
        for (let row = 8; row <= 14; row += 1) {
          const address = `${col}${row}`;
          const reference = `'${firstSheetName}'!${address}`;
          values[address] = { formula: `IF(${reference}="","",${reference})`, result: values[address] ?? '' };
        }
      }
    }
    const path = `xl/worksheets/sheet${day + 1}.xml`;
    let xml = updateCells(renameReferences(await zip.file(path).async('string')), values);
    xml = xml.replace(/<tabColor\b[^>]*\/>/g, '');
    if (new Date(year, month - 1, day).getDay() === 0) xml = xml.replace(/(<sheetPr\b[^>]*>)/, '$1<tabColor rgb="FFFF0000"/>');
    zip.file(path, xml);
  }
  if (people.size > 200) throw new Error('노임검토 양식의 월간 명단은 200명까지 지원합니다.');
  const summaryValues = { D2: projectName, V2: excelDate(year, month, 1) };
  const roster = [...people];
  for (let day = 1; day <= 31; day += 1) {
    const col = column(day + 4);
    summaryValues[`${col}4`] = day <= lastDay ? excelDate(year, month, day) : '';
    for (let row = 5; row <= 204; row += 1) {
      summaryValues[`${col}${row}`] = day <= lastDay ? {
        formula: `IF($C${row}="",0,COUNTIF('${[...sheetNames.values()][day - 1]}'!$C$18:$C$47,$C${row})+COUNTIF('${[...sheetNames.values()][day - 1]}'!$I$18:$I$47,$C${row}))`,
      } : 0;
    }
  }
  for (let row = 5; row <= 204; row += 1) {
    summaryValues[`C${row}`] = roster[row - 5]?.[0] || '';
    summaryValues[`D${row}`] = roster[row - 5]?.[1] || '';
  }
  zip.file('xl/worksheets/sheet1.xml', updateCells(await zip.file('xl/worksheets/sheet1.xml').async('string'), summaryValues));
  sheets.slice(1).forEach((sheet, index) => {
    workbook = workbook.replace(sheet[0], index < lastDay ? sheet[0].replace(`name="${sheet[1]}"`, `name="${sheetNames.get(sheet[1])}"`) : '');
  });
  workbook = renameReferences(workbook).replace(/<definedName\b[^>]*localSheetId="(\d+)"[^>]*>[\s\S]*?<\/definedName>/g, (whole, index) => Number(index) > lastDay ? '' : whole)
    .replace(/<calcPr\b[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);
  // Removed dates must not leave stale calculation-chain references.
  zip.remove('xl/calcChain.xml');
  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  rels = rels.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, '');
  let types = await zip.file('[Content_Types].xml').async('string');
  types = types.replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g, '');
  for (let day = lastDay + 1; day <= 31; day += 1) {
    const path = `xl/worksheets/sheet${day + 1}.xml`;
    zip.remove(path);
    rels = rels.replace(new RegExp(`<Relationship\\b[^>]*Id="${sheets[day][2]}"[^>]*/>`, 'g'), '');
    types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/${path.replaceAll('.', '\\.')}"[^>]*/>`, 'g'), '');
  }
  zip.file('xl/_rels/workbook.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
