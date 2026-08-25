const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const DASHBOARD = path.join(ROOT, 'src', 'Dashboard.jsx');
const SIDEBAR = path.join(ROOT, 'src', 'components', 'Sidebar.jsx');
const COMPONENT_SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);
const COMPONENT_TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);

const EXPECTED = {
  [DASHBOARD]: 'dc7f8379796d7f70b68ff6c20450c28c3d7108d4',
  [SIDEBAR]: '95c64e5a5624b7322f81ca8eca584450bb0280b3',
};

function fail(message) {
  console.error('\n[v52.32 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`파일을 찾을 수 없습니다: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    fail(`${label} 적용 위치를 찾지 못했습니다.`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    fail(`${label} 적용 위치가 2개 이상이라 중단했습니다.`);
  }
  return (
    source.slice(0, first) +
    after +
    source.slice(first + before.length)
  );
}

let dashboard = read(DASHBOARD);
let sidebar = read(SIDEBAR);

const alreadyApplied =
  dashboard.includes(
    "import MonthlyLaborManagement from './page/MonthlyLaborManagement.jsx';"
  ) &&
  dashboard.includes(
    "'labor-monthly': '월별 노임작성'"
  ) &&
  sidebar.includes(
    "value: 'labor-monthly'"
  ) &&
  fs.existsSync(COMPONENT_TARGET);

if (alreadyApplied) {
  console.log('[v52.32] 이미 적용된 상태입니다.');
  process.exit(0);
}

for (const [filePath, expectedSha] of Object.entries(EXPECTED)) {
  const buffer = fs.readFileSync(filePath);
  const actualSha = blobSha(buffer);
  if (actualSha !== expectedSha) {
    fail(
      '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
      `${path.relative(ROOT, filePath)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n\n` +
      '현재 파일이 최신 main 기준과 다릅니다. git status를 확인해주세요.'
    );
  }
}

if (!fs.existsSync(COMPONENT_SOURCE)) {
  fail(
    '릴리즈 패키지의 MonthlyLaborManagement.jsx를 찾을 수 없습니다.'
  );
}

dashboard = replaceOnce(
  dashboard,
  "import LaborContractManagement from './page/LaborContractManagement.jsx';\nimport LaborCostManagement from './page/LaborCostManagement.jsx';",
  "import LaborContractManagement from './page/LaborContractManagement.jsx';\nimport MonthlyLaborManagement from './page/MonthlyLaborManagement.jsx';\nimport LaborCostManagement from './page/LaborCostManagement.jsx';",
  'Dashboard import'
);

dashboard = replaceOnce(
  dashboard,
  "  'labor-contract': '근로계약서작성',\n  'labor-cost': '공정별 노임작성',",
  "  'labor-monthly': '월별 노임작성',\n  'labor-contract': '근로계약서작성',\n  'labor-cost': '공정별 노임작성',",
  'Dashboard 화면 제목'
);

dashboard = replaceOnce(
  dashboard,
  "  'labor-contract': 'labor.contract.view',\n  'labor-cost': 'labor.cost.view',",
  "  'labor-monthly': 'labor.cost.view',\n  'labor-contract': 'labor.contract.view',\n  'labor-cost': 'labor.cost.view',",
  'Dashboard 권한 연결'
);

dashboard = replaceOnce(
  dashboard,
  "          {currentView ===\n            'labor-contract' &&",
  "          {currentView ===\n            'labor-monthly' &&\n            activeProjectName && (\n              <MonthlyLaborManagement\n                projectName={activeProjectName}\n              />\n            )}\n\n          {currentView ===\n            'labor-contract' &&",
  'Dashboard 월별 노임작성 화면'
);

sidebar = replaceOnce(
  sidebar,
  "const laborMenus = [\n  {\n    value: 'labor-contract',",
  "const laborMenus = [\n  {\n    value: 'labor-monthly',\n    label: '월별 노임작성',\n  },\n  {\n    value: 'labor-contract',",
  'Sidebar 월별 노임작성 메뉴'
);

const dashboardRequired = [
  "import MonthlyLaborManagement from './page/MonthlyLaborManagement.jsx';",
  "'labor-monthly': '월별 노임작성'",
  "'labor-monthly': 'labor.cost.view'",
  "<MonthlyLaborManagement",
];

for (const marker of dashboardRequired) {
  if (!dashboard.includes(marker)) {
    fail(`Dashboard 적용 검증 실패: ${marker}`);
  }
}

if (
  !sidebar.includes("value: 'labor-monthly'") ||
  !sidebar.includes("label: '월별 노임작성'")
) {
  fail('Sidebar 적용 검증 실패');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(
  ROOT,
  `backup_v52.32_${stamp}`
);

for (const filePath of [DASHBOARD, SIDEBAR]) {
  const relative = path.relative(ROOT, filePath);
  const target = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

if (fs.existsSync(COMPONENT_TARGET)) {
  const target = path.join(
    backupRoot,
    'src',
    'page',
    'MonthlyLaborManagement.jsx'
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(COMPONENT_TARGET, target);
}

fs.writeFileSync(DASHBOARD, dashboard, 'utf8');
fs.writeFileSync(SIDEBAR, sidebar, 'utf8');
fs.mkdirSync(path.dirname(COMPONENT_TARGET), { recursive: true });
fs.copyFileSync(COMPONENT_SOURCE, COMPONENT_TARGET);

console.log('\n[v52.32 적용 완료]');
console.log('- 노임관리 > 월별 노임작성 메뉴 추가');
console.log('- 월별 노임작성 기본 화면 추가');
console.log('- 근로자 조회 반복 검색/추가 구조 준비');
console.log('- 신규 근로자 행 추가');
console.log('- 선택 삭제 / ↑ / ↓ 순서 변경');
console.log('- 공종 개별 입력 및 선택 인원 일괄변경');
console.log('- 기존 근로계약서/공정별 노임작성 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('다음 명령: npm run build');
