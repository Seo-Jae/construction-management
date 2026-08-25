const fs = require('fs');
const path = require('path');

const target = path.resolve(process.cwd(), 'src/Dashboard.jsx');
if (!fs.existsSync(target)) {
  console.error('[적용 중단] src/Dashboard.jsx 파일을 찾지 못했습니다.');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('// v52.48.5.42.2: 월간 출력일보 전일누계는 월내 시트 수식으로 연결합니다.')) {
  console.log('[안내] v52.48.5.42.2가 이미 적용되어 있습니다.');
  process.exit(0);
}

const oldCumulative = `    const selectedDateTime = parseReportDateKey(dateStr);\n    // v52.48.5.42.1: 전일누계는 월 경계에서 초기화하지 않고,\n    // 선택일 이전에 저장된 전체 출력일보 데이터를 분석해 누적합니다.\n    const previousJobCounts = {};\n\n    Object.entries(savedData).forEach(\n      ([reportDateKey, reportData]) => {\n        const reportDateTime = parseReportDateKey(reportDateKey);\n\n        if (\n          reportDateTime === null ||\n          selectedDateTime === null ||\n          reportDateTime >= selectedDateTime\n        ) {\n          return;\n        }`;

const newCumulative = `    const selectedDateTime = parseReportDateKey(dateStr);\n    // v52.48.5.42.2: 단일 일자 출력 시 전일누계는 해당 월 안에서만 계산합니다.\n    // 월간 배포용 파일은 아래 월간 다운로드 로직에서 전일 시트 누계 수식으로 다시 연결합니다.\n    const selectedMonthPrefix = String(dateStr || '').slice(0, 6);\n    const previousJobCounts = {};\n\n    Object.entries(savedData).forEach(\n      ([reportDateKey, reportData]) => {\n        const reportDateTime = parseReportDateKey(reportDateKey);\n\n        if (\n          reportDateTime === null ||\n          selectedDateTime === null ||\n          !String(reportDateKey).startsWith(selectedMonthPrefix) ||\n          reportDateTime >= selectedDateTime\n        ) {\n          return;\n        }`;

if (!source.includes(oldCumulative)) {
  console.error('[적용 중단] v52.48.5.42.1 전일누계 계산 구간을 찾지 못했습니다. 기존 변경을 보호하기 위해 수정하지 않았습니다.');
  process.exit(1);
}
source = source.replace(oldCumulative, newCumulative);

const oldMonthlyFill = `        fillDailyReportWorksheet({\n          worksheet,\n          dateStr,\n          dayName: dayNames[targetDate.getDay()],\n          workers,\n        });\n      }`;

const newMonthlyFill = `        fillDailyReportWorksheet({\n          worksheet,\n          dateStr,\n          dayName: dayNames[targetDate.getDay()],\n          workers,\n        });\n\n        // v52.48.5.42.2: 월간 출력일보 전일누계는 월내 시트 수식으로 연결합니다.\n        // 1일은 0으로 시작하고, 2일부터는 바로 전날 시트의 누계 셀을 참조합니다.\n        cumulativeCellMap.forEach(({ previousCell, totalCell }) => {\n          if (day === 1) {\n            worksheet.getCell(previousCell).value = 0;\n            return;\n          }\n\n          const previousWorksheet = worksheets[day - 2];\n          const previousSheetName = String(\n            previousWorksheet?.name || \`${'${month}.${day - 1}'}\`,\n          ).replace(/'/g, \"''\");\n\n          worksheet.getCell(previousCell).value = {\n            formula: \`'${'${previousSheetName}'}'!${'${totalCell}'}\`,\n          };\n        });\n      }`;

if (!source.includes(oldMonthlyFill)) {
  console.error('[적용 중단] 월간 출력일보 시트 작성 구간을 찾지 못했습니다. 기존 변경을 보호하기 위해 수정하지 않았습니다.');
  process.exit(1);
}
source = source.replace(oldMonthlyFill, newMonthlyFill);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(process.cwd(), `backup_v52.48.5.42.2_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(target, path.join(backupDir, 'Dashboard.jsx'));

fs.writeFileSync(target, source, 'utf8');

const verify = fs.readFileSync(target, 'utf8');
const required = [
  '// v52.48.5.42.2: 월간 출력일보 전일누계는 월내 시트 수식으로 연결합니다.',
  'worksheet.getCell(previousCell).value = 0;',
  "formula: `'${previousSheetName}'!${totalCell}`",
  '!String(reportDateKey).startsWith(selectedMonthPrefix)',
];
for (const marker of required) {
  if (!verify.includes(marker)) {
    console.error(`[적용 중단] 적용 검증 실패: ${marker}`);
    fs.copyFileSync(path.join(backupDir, 'Dashboard.jsx'), target);
    process.exit(1);
  }
}

console.log('[완료] v52.48.5.42.2 적용 완료');
console.log(' - 월간 파일 1일 전일누계 = 0');
console.log(' - 2일 이후 전일누계 = 바로 전날 시트 누계 셀 수식 참조');
console.log(' - 월이 바뀌면 누계는 다시 0부터 시작');
console.log(' - v52.48.5.42.1 일요일 빨간 시트 탭 유지');
console.log(` - 백업: ${backupDir}`);
