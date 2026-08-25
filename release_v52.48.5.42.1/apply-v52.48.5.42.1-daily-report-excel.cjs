const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.42.1';
const targetPath = path.resolve(process.cwd(), 'src/Dashboard.jsx');

function fail(message) {
  console.error(`\n[${VERSION}] 적용 중단`);
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  fail(`대상 파일을 찾지 못했습니다: ${targetPath}`);
}

const original = fs.readFileSync(targetPath, 'utf8');

if (original.includes('v52.48.5.42.1: 전일누계는 월 경계')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!original.includes('v52.48.5.42: 화면에서 선택한 월을 기준으로 월간 출력일보를 생성합니다.')) {
  fail('현재 src/Dashboard.jsx가 예상 기준(v52.48.5.42)과 다릅니다. 기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
}

let next = original;

const oldPrefixBlock = `    const selectedDateTime = parseReportDateKey(dateStr);\n    const selectedMonthPrefix = String(dateStr || '').slice(0, 6);\n    const previousJobCounts = {};`;
const newPrefixBlock = `    const selectedDateTime = parseReportDateKey(dateStr);\n    // v52.48.5.42.1: 전일누계는 월 경계에서 초기화하지 않고,\n    // 선택일 이전에 저장된 전체 출력일보 데이터를 분석해 누적합니다.\n    const previousJobCounts = {};`;

if (!next.includes(oldPrefixBlock)) {
  fail('전일누계 계산 시작부를 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}
next = next.replace(oldPrefixBlock, newPrefixBlock);

const oldCondition = `          reportDateTime === null ||\n          selectedDateTime === null ||\n          !String(reportDateKey).startsWith(selectedMonthPrefix) ||\n          reportDateTime >= selectedDateTime`;
const newCondition = `          reportDateTime === null ||\n          selectedDateTime === null ||\n          reportDateTime >= selectedDateTime`;

if (!next.includes(oldCondition)) {
  fail('전일누계 월 제한 조건을 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}
next = next.replace(oldCondition, newCondition);

const oldSundayTarget = `        const worksheet = worksheets[day - 1];\n\n        fillDailyReportWorksheet({`;
const newSundayTarget = `        const worksheet = worksheets[day - 1];\n\n        // v52.48.5.42.1: Excel 하단의 날짜별 시트 탭에서 일요일은 빨간색으로 표시합니다.\n        if (targetDate.getDay() === 0) {\n          worksheet.properties.tabColor = { argb: 'FFFF0000' };\n        } else if (worksheet.properties?.tabColor) {\n          delete worksheet.properties.tabColor;\n        }\n\n        fillDailyReportWorksheet({`;

if (!next.includes(oldSundayTarget)) {
  fail('월간 출력일보 날짜 시트 작성부를 찾지 못했습니다. 기존 변경을 보호하기 위해 중단합니다.');
}
next = next.replace(oldSundayTarget, newSundayTarget);

if (next === original) {
  fail('변경된 내용이 없습니다.');
}

const backupPath = `${targetPath}.bak-${VERSION}-${Date.now()}`;
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, next, 'utf8');

console.log(`\n[${VERSION}] 적용 완료`);
console.log(`- 수정: src/Dashboard.jsx`);
console.log(`- 일요일 날짜 시트 탭: 빨간색`);
console.log(`- 전일누계: 같은 달만이 아닌 선택일 이전 전체 출력일보 기준 누적`);
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
console.log('- SQL 변경 없음');
