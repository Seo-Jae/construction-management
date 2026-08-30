const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.73';
const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'page', 'ProposalReportEditor.jsx');

if (!fs.existsSync(targetPath)) {
  console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

const oldText = `      for (let index = 0; index < MAX_REPORT_LINES; index += 1) {
        const cell = worksheet.getCell(\`A\${16 + index}\`);
        cell.value = reportLines[index] || '';
        cell.alignment = {
          ...(cell.alignment || {}),
          vertical: 'middle',
          wrapText: true,
        };
      }`;

const newText = `      // 보고내용은 각 행을 A:G까지 병합하여 한 줄 영역으로 사용합니다.
      // A16:G16, A17:G17 ... A31:G31
      // 긴 문장은 병합된 전체 폭을 기준으로 줄바꿈되고 항상 왼쪽 정렬됩니다.
      for (let index = 0; index < MAX_REPORT_LINES; index += 1) {
        const rowNumber = 16 + index;
        const mergeRange = \`A\${rowNumber}:G\${rowNumber}\`;

        worksheet.mergeCells(mergeRange);

        const cell = worksheet.getCell(\`A\${rowNumber}\`);
        cell.value = reportLines[index] || '';
        cell.alignment = {
          ...(cell.alignment || {}),
          horizontal: 'left',
          vertical: 'middle',
          wrapText: true,
        };
      }`;

let source = fs.readFileSync(targetPath, 'utf8');

if (source.includes(newText)) {
  console.log(`[이미 적용됨] ${path.relative(projectRoot, targetPath)}`);
  process.exit(0);
}

if (!source.includes(oldText)) {
  console.error('[적용 중단] 품의보고 Excel 보고내용 출력 코드가 예상 기준과 다릅니다.');
  console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;
fs.copyFileSync(targetPath, backupPath);

source = source.replace(oldText, newText);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('변경: 품의보고 Excel 보고내용 A16:G31 행별 병합 + 왼쪽 정렬');
