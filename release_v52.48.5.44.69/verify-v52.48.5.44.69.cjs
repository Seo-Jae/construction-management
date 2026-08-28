const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'Dashboard.jsx');
if (!fs.existsSync(file)) {
  console.error('[검증 실패] src/Dashboard.jsx가 없습니다.');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const checks = [
  ['버전 마커', text.includes('// v52.48.5.44.69 지출결의서 소속현장 기본 작성권한')],
  ['자기현장 판정', text.includes('normalizedExpenseProjectName === fallbackProjectName')],
  ['대상 화면 제한', text.includes("view === 'report-expense-resolution'")],
  ['담당자/관리자 역할 제한', text.includes("['담당자', '관리자'].includes(userRole)")],
  ['기존 권한키 유지', text.includes("'report-expense-resolution': 'report.expense.view'")],
  ['지출결의서 화면 연결 유지', text.includes('<ExpenseResolution userProfile={activeUserProfile} />')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? '[OK]' : '[FAIL]'} ${label}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log('\n[v52.48.5.44.69] 소스 검증 통과');
