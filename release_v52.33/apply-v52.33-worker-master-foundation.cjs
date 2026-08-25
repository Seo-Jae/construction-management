const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const DASHBOARD = path.join(ROOT, 'src', 'Dashboard.jsx');
const SIDEBAR = path.join(ROOT, 'src', 'components', 'Sidebar.jsx');
const MONTHLY = path.join(ROOT, 'src', 'page', 'MonthlyLaborManagement.jsx');

const MONTHLY_SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);
const MASTER_SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'WorkerMasterManagement.jsx'
);
const MASTER_TARGET = path.join(
  ROOT,
  'src',
  'page',
  'WorkerMasterManagement.jsx'
);

const EXPECTED = {
  [DASHBOARD]: '85ce65ca092ba9e41ca52a45b563f9c578c56b6e',
  [SIDEBAR]: '5610484cdc4ed3834bb7a385a59e60ba9f52c42a',
  [MONTHLY]: '4ad0936ab31effb12acfabaab1520b26550f3663',
};

function fail(message) {
  console.error('\n[v52.33 적용 중단]');
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

  if (
    source.indexOf(
      before,
      first + before.length,
    ) >= 0
  ) {
    fail(
      `${label} 적용 위치가 2개 이상이라 안전하게 중단했습니다.`,
    );
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
    "import WorkerMasterManagement from './page/WorkerMasterManagement.jsx';",
  ) &&
  dashboard.includes(
    "'labor-worker-master': '근로자 정보관리'",
  ) &&
  sidebar.includes(
    "value: 'labor-worker-master'",
  ) &&
  fs.existsSync(MASTER_TARGET) &&
  read(MONTHLY).includes(
    'labor_worker_master_search_v52_33',
  );

if (alreadyApplied) {
  console.log('[v52.33] 이미 적용된 상태입니다.');
  process.exit(0);
}

for (
  const [filePath, expectedSha]
  of Object.entries(EXPECTED)
) {
  if (!fs.existsSync(filePath)) {
    fail(
      `대상 파일을 찾을 수 없습니다: ${filePath}`,
    );
  }

  const actualSha = blobSha(
    fs.readFileSync(filePath),
  );

  if (actualSha !== expectedSha) {
    fail(
      '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
      `${path.relative(ROOT, filePath)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n\n` +
      '현재 파일이 v52.32 최신 main 기준과 다릅니다. git status를 확인해주세요.',
    );
  }
}

if (!fs.existsSync(MONTHLY_SOURCE)) {
  fail('릴리즈 MonthlyLaborManagement.jsx가 없습니다.');
}

if (!fs.existsSync(MASTER_SOURCE)) {
  fail('릴리즈 WorkerMasterManagement.jsx가 없습니다.');
}

dashboard = replaceOnce(
  dashboard,
  "import MonthlyLaborManagement from './page/MonthlyLaborManagement.jsx';\nimport LaborCostManagement from './page/LaborCostManagement.jsx';",
  "import MonthlyLaborManagement from './page/MonthlyLaborManagement.jsx';\nimport WorkerMasterManagement from './page/WorkerMasterManagement.jsx';\nimport LaborCostManagement from './page/LaborCostManagement.jsx';",
  'Dashboard 근로자 마스터 import',
);

dashboard = replaceOnce(
  dashboard,
  "  'labor-monthly': '월별 노임작성',\n  'labor-contract': '근로계약서작성',",
  "  'labor-monthly': '월별 노임작성',\n  'labor-worker-master': '근로자 정보관리',\n  'labor-contract': '근로계약서작성',",
  'Dashboard 화면 제목',
);

dashboard = replaceOnce(
  dashboard,
  "  'labor-monthly': 'labor.cost.view',\n  'labor-contract': 'labor.contract.view',",
  "  'labor-monthly': 'labor.cost.view',\n  'labor-worker-master': 'labor.worker_master.manage',\n  'labor-contract': 'labor.contract.view',",
  'Dashboard 권한키',
);

dashboard = replaceOnce(
  dashboard,
  "  'daily-cumulative-workers',\n];",
  "  'daily-cumulative-workers',\n  'labor-worker-master',\n];",
  'Dashboard PROJECT_FREE_VIEWS',
);

dashboard = replaceOnce(
  dashboard,
  "  'weekly-overview-archive',\n  'organization-chart',\n]);",
  "  'weekly-overview-archive',\n  'organization-chart',\n  'labor-worker-master',\n]);",
  'Dashboard GLOBAL_PERMISSION_VIEWS',
);

dashboard = replaceOnce(
  dashboard,
  "    'weekly-overview',\n    'weekly-overview-archive',\n  ];\n  const constructionLocationTitle =",
  "    'weekly-overview',\n    'weekly-overview-archive',\n    'labor-worker-master',\n  ];\n  const constructionLocationTitle =",
  'Dashboard 글로벌 헤더 화면',
);

dashboard = replaceOnce(
  dashboard,
  "              'organization-chart',\n              'messenger',\n            ].includes(",
  "              'organization-chart',\n              'messenger',\n              'labor-worker-master',\n            ].includes(",
  'Dashboard 현장선택 숨김',
);

dashboard = replaceOnce(
  dashboard,
  "          {currentView ===\n            'labor-monthly' &&\n            activeProjectName && (\n              <MonthlyLaborManagement\n                projectName={activeProjectName}\n              />\n            )}",
  "          {currentView ===\n            'labor-monthly' &&\n            activeProjectName && (\n              <MonthlyLaborManagement\n                projectName={activeProjectName}\n              />\n            )}\n\n          {currentView ===\n            'labor-worker-master' && (\n              <WorkerMasterManagement\n                canManage={Boolean(\n                  isSuperAdmin ||\n                    hasPermission(\n                      'labor.worker_master.manage',\n                      '',\n                    ) === true\n                )}\n              />\n            )}",
  'Dashboard 근로자 마스터 렌더',
);

sidebar = replaceOnce(
  sidebar,
  "  {\n    value: 'labor-monthly',\n    label: '월별 노임작성',\n  },\n  {\n    value: 'labor-contract',",
  "  {\n    value: 'labor-monthly',\n    label: '월별 노임작성',\n  },\n  {\n    value: 'labor-worker-master',\n    label: '근로자 정보관리',\n  },\n  {\n    value: 'labor-contract',",
  'Sidebar 근로자 정보관리 메뉴',
);

const requiredDashboard = [
  "import WorkerMasterManagement from './page/WorkerMasterManagement.jsx';",
  "'labor-worker-master': '근로자 정보관리'",
  "'labor-worker-master': 'labor.worker_master.manage'",
  "<WorkerMasterManagement",
];

for (const marker of requiredDashboard) {
  if (!dashboard.includes(marker)) {
    fail(`Dashboard 적용 검증 실패: ${marker}`);
  }
}

if (
  !sidebar.includes(
    "value: 'labor-worker-master'",
  )
) {
  fail('Sidebar 적용 검증 실패');
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backupRoot = path.join(
  ROOT,
  `backup_v52.33_${stamp}`,
);

for (const filePath of [
  DASHBOARD,
  SIDEBAR,
  MONTHLY,
]) {
  const relative = path.relative(
    ROOT,
    filePath,
  );
  const backupTarget = path.join(
    backupRoot,
    relative,
  );

  fs.mkdirSync(
    path.dirname(backupTarget),
    { recursive: true },
  );

  fs.copyFileSync(
    filePath,
    backupTarget,
  );
}

if (fs.existsSync(MASTER_TARGET)) {
  const backupTarget = path.join(
    backupRoot,
    'src',
    'page',
    'WorkerMasterManagement.jsx',
  );

  fs.mkdirSync(
    path.dirname(backupTarget),
    { recursive: true },
  );

  fs.copyFileSync(
    MASTER_TARGET,
    backupTarget,
  );
}

fs.writeFileSync(
  DASHBOARD,
  dashboard,
  'utf8',
);
fs.writeFileSync(
  SIDEBAR,
  sidebar,
  'utf8',
);
fs.copyFileSync(
  MONTHLY_SOURCE,
  MONTHLY,
);

fs.mkdirSync(
  path.dirname(MASTER_TARGET),
  { recursive: true },
);

fs.copyFileSync(
  MASTER_SOURCE,
  MASTER_TARGET,
);

console.log('\n[v52.33 적용 완료]');
console.log('- 근로자 정보관리 메뉴 추가');
console.log('- 특수권한 labor.worker_master.manage 연결');
console.log('- 월별 노임작성 근로자 마스터 RPC 검색 연결');
console.log('- 검색결과: 성명/생년월일/휴대폰 뒤4자리/최근공종만');
console.log('- 근로자 마스터 등록/수정 화면 추가');
console.log('- 기존 공정별 노임작성/근로계약서 기능 유지');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('중요: Supabase v52.33 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
