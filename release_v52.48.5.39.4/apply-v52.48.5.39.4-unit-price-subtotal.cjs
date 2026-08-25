const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');

const fail = (message) => {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes('v52.48.5.39.4 합계행 소계 표시')) {
  console.log('[안내] v52.48.5.39.4가 이미 적용되어 있습니다.');
  process.exit(0);
}

if (!source.includes('v52.48.5.39.3 Excel 세부서식 + PDF 동일양식 출력')) {
  fail('현재 UnitPriceAnalysis.jsx가 v52.48.5.39.3 기준과 다릅니다. 기존 변경을 보호하기 위해 자동 적용하지 않았습니다.');
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.48.5.39.4_${timestamp}`);
const backupTarget = path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx');
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);

const versionNeedle = '  // v52.48.5.39.3 Excel 세부서식 + PDF 동일양식 출력\n';
const versionReplacement = versionNeedle + '  // v52.48.5.39.4 합계행 소계 표시\n';
if (!source.includes(versionNeedle)) {
  fail('버전 표시 위치를 찾지 못했습니다.');
}
source = source.replace(versionNeedle, versionReplacement);

const excelNeedle = `        // 합계행\n        sheet.getCell(\`G\${totalRow}\`).value = {`;
const excelReplacement = `        // 합계행\n        // 기본 20개 항목 기준 A26:B26이며, 항목이 늘어나면 합계행 위치에 맞춰 자동 이동합니다.\n        sheet.mergeCells(\`A\${totalRow}:B\${totalRow}\`);\n        sheet.getCell(\`A\${totalRow}\`).value = '소계';\n        sheet.getCell(\`A\${totalRow}\`).font = { ...baseFont, bold: true };\n        sheet.getCell(\`A\${totalRow}\`).alignment = {\n          vertical: 'middle',\n          horizontal: 'center',\n        };\n\n        sheet.getCell(\`G\${totalRow}\`).value = {`;
if (!source.includes(excelNeedle)) {
  fail('Excel 합계행 위치를 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}
source = source.replace(excelNeedle, excelReplacement);

const pdfNeedle = `        <tr class="total-row">\n          <td colspan="2"></td>\n          <td></td><td></td><td></td>`;
const pdfReplacement = `        <tr class="total-row">\n          <td colspan="2">소계</td>\n          <td></td><td></td><td></td>`;
if (!source.includes(pdfNeedle)) {
  fail('PDF 합계행 위치를 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}
source = source.replace(pdfNeedle, pdfReplacement);

fs.writeFileSync(TARGET, source, 'utf8');

console.log('');
console.log('=== v52.48.5.39.4 적용 완료 ===');
console.log('- Excel 합계행 A:B 병합');
console.log('- A:B 병합셀에 "소계" 굵게/가운데 정렬');
console.log('- 기본 20개 항목일 때 A26:B26');
console.log('- 항목이 20개 초과하면 실제 합계행 위치로 자동 이동');
console.log('- PDF 합계행에도 동일하게 "소계" 표시');
console.log(`- 백업: ${backupDir}`);
