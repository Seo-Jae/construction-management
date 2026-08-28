const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.69';
const projectRoot = process.cwd();
const dashboardPath = path.join(projectRoot, 'src', 'Dashboard.jsx');
const EXPECTED_GIT_BLOB_SHA1 = 'ccaf590d73f9405385885929c31e241a454da15b';
const VERSION_MARKER = '// v52.48.5.44.69 지출결의서 소속현장 기본 작성권한';

function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function abort(message) {
  console.error(`\n[적용 중단] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(dashboardPath)) {
  abort('src/Dashboard.jsx 파일을 찾을 수 없습니다. 프로젝트 최상위 폴더에서 실행해주세요.');
}

let dashboard = fs.readFileSync(dashboardPath, 'utf8');

if (dashboard.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  console.log('다음 명령: npm run build');
  process.exit(0);
}

const currentBlobSha1 = gitBlobSha1(Buffer.from(dashboard, 'utf8'));
if (currentBlobSha1 !== EXPECTED_GIT_BLOB_SHA1) {
  abort(
    'src/Dashboard.jsx 내용이 예상 기준 버전(v52.48.5.44.68 이후 main)과 다릅니다.\n' +
    '기존 변경을 보호하기 위해 자동 수정하지 않았습니다.\n' +
    `현재 Git blob SHA1: ${currentBlobSha1}\n` +
    `예상 Git blob SHA1: ${EXPECTED_GIT_BLOB_SHA1}`,
  );
}

const oldBlock = `  const canAccessView = (\n    view,\n    projectName = '',\n  ) => {\n    if (view === 'messenger') return true;\n    if (['user-management', 'project-management', 'guide'].includes(view)) return isSuperAdmin;\n`;

const newBlock = `  const canAccessView = (\n    view,\n    projectName = '',\n  ) => {\n    if (view === 'messenger') return true;\n    if (['user-management', 'project-management', 'guide'].includes(view)) return isSuperAdmin;\n\n    // v52.48.5.44.69\n    // 지출결의서는 현장 담당자/현장 관리자가 자기 소속현장에서는\n    // 별도 ACL 설정이 없어도 기본적으로 조회·작성·수정·삭제 화면에 접근할 수 있습니다.\n    // 다른 현장은 기존 report.expense.view 권한 판정을 그대로 사용합니다.\n    const normalizedExpenseProjectName = String(\n      projectName || '',\n    ).trim();\n    const hasOwnExpenseProjectAccess =\n      view === 'report-expense-resolution' &&\n      ['담당자', '관리자'].includes(userRole) &&\n      normalizedExpenseProjectName &&\n      fallbackProjectName &&\n      normalizedExpenseProjectName === fallbackProjectName;\n\n    if (hasOwnExpenseProjectAccess) return true;\n`;

const occurrenceCount = dashboard.split(oldBlock).length - 1;
if (occurrenceCount !== 1) {
  abort(`권한 판정 위치가 예상과 다릅니다. 대상 블록 발견 횟수: ${occurrenceCount}`);
}

// 기존 상세 권한 체계와 타 현장 판정은 그대로 두고, 지출결의서 자기 소속현장만 예외를 추가합니다.
dashboard = dashboard.replace(oldBlock, newBlock);

if (!dashboard.includes("'report-expense-resolution': 'report.expense.view'")) {
  abort('기존 지출결의서 권한키(report.expense.view)를 찾지 못했습니다. 파일을 수정하지 않았습니다.');
}

if (!dashboard.includes("<ExpenseResolution userProfile={activeUserProfile} />")) {
  abort('지출결의서 화면 연결을 찾지 못했습니다. 파일을 수정하지 않았습니다.');
}

if (!dashboard.includes("normalizedExpenseProjectName === fallbackProjectName")) {
  abort('자기 소속현장 판정 코드 생성에 실패했습니다. 파일을 수정하지 않았습니다.');
}

const backupRoot = path.join(projectRoot, `backup_${VERSION}_${stamp()}`);
const backupPath = path.join(backupRoot, 'src', 'Dashboard.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(dashboardPath, backupPath);

// 버전 추적용 주석을 파일 최상단에 추가합니다.
dashboard = `${VERSION_MARKER}\n${dashboard}`;
fs.writeFileSync(dashboardPath, dashboard, 'utf8');

const applied = fs.readFileSync(dashboardPath, 'utf8');
if (
  !applied.includes(VERSION_MARKER) ||
  !applied.includes('hasOwnExpenseProjectAccess') ||
  !applied.includes("view === 'report-expense-resolution'") ||
  !applied.includes("normalizedExpenseProjectName === fallbackProjectName")
) {
  fs.copyFileSync(backupPath, dashboardPath);
  abort('적용 후 자체검증에 실패하여 Dashboard.jsx를 자동 복구했습니다.');
}

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log('- 지출결의서: 담당자/관리자의 자기 소속현장 기본 접근 허용');
console.log('- 타 현장: 기존 report.expense.view ACL 판정 유지');
console.log(`- 백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('');
console.log('다음 명령: npm run build');
