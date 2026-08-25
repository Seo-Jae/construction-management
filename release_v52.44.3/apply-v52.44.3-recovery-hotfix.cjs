const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const RELEASE = __dirname;

function fail(message) {
  console.error('\n[v52.44.3 적용 중단]');
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------
// 1) v52.44 근로자 조회 기능 복구/적용
// ---------------------------------------------------------
const v5244Script = path.join(
  RELEASE,
  'apply-v52.44-worker-browse-filter-fixed-v3.cjs',
);

if (!fs.existsSync(v5244Script)) {
  fail(
    `v52.44 적용스크립트를 찾을 수 없습니다: ${v5244Script}`,
  );
}

const v5244Result = spawnSync(
  process.execPath,
  [v5244Script],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
);

if (v5244Result.stdout) {
  process.stdout.write(
    v5244Result.stdout,
  );
}

if (
  v5244Result.status !== 0
) {
  if (v5244Result.stderr) {
    process.stderr.write(
      v5244Result.stderr,
    );
  }

  fail(
    'v52.44 근로자 조회 기능 적용/복구에 실패했습니다.',
  );
}

// ---------------------------------------------------------
// 2) 근로자 정보관리 국적: 한국 입력 → 대한민국 표시 → Tab 확정
// ---------------------------------------------------------
const workerTarget = path.join(
  ROOT,
  'src',
  'page',
  'WorkerMasterManagement.jsx',
);

if (!fs.existsSync(workerTarget)) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${workerTarget}`,
  );
}

let workerText =
  fs.readFileSync(
    workerTarget,
    'utf8',
  );

const alreadyPatched =
  workerText.includes(
    '<Autocomplete\n                autoHighlight\n                autoSelect\n                size="small"\n                options={NATIONALITY_OPTIONS}',
  );

if (!alreadyPatched) {
  const oldBlock =
`              <Autocomplete
                size="small"
                options={NATIONALITY_OPTIONS}
                filterOptions={filterNationalityOptions}`;

  const newBlock =
`              <Autocomplete
                autoHighlight
                autoSelect
                size="small"
                options={NATIONALITY_OPTIONS}
                filterOptions={filterNationalityOptions}`;

  const first =
    workerText.indexOf(
      oldBlock,
    );

  if (first < 0) {
    fail(
      '국적 Autocomplete 기준 블록을 찾지 못했습니다.',
    );
  }

  if (
    workerText.indexOf(
      oldBlock,
      first + oldBlock.length,
    ) >= 0
  ) {
    fail(
      '국적 Autocomplete 기준 블록이 2개 이상 발견되어 중단했습니다.',
    );
  }

  if (
    !workerText.includes(
      'labor_worker_master_secure_upsert_v52_41',
    ) ||
    !workerText.includes(
      'filterNationalityOptions',
    )
  ) {
    fail(
      '현재 WorkerMasterManagement.jsx가 v52.41 이후 구조가 아닙니다.',
    );
  }

  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

  const backupPath =
    path.join(
      ROOT,
      `backup_v52.44.3_${stamp}`,
      'src',
      'page',
      'WorkerMasterManagement.jsx',
    );

  fs.mkdirSync(
    path.dirname(backupPath),
    { recursive: true },
  );

  fs.copyFileSync(
    workerTarget,
    backupPath,
  );

  workerText =
    workerText.replace(
      oldBlock,
      newBlock,
    );

  fs.writeFileSync(
    workerTarget,
    workerText,
    'utf8',
  );

  console.log(
    '- 근로자 정보관리 국적 Tab 확정 적용',
  );
  console.log(
    `- WorkerMaster 백업: ${backupPath}`,
  );
} else {
  console.log(
    '- 근로자 정보관리 국적 Tab 확정: 이미 적용됨',
  );
}

console.log('\n[v52.44.3 적용 완료]');
console.log('- v52.44 근로자 조회 전체목록/성명·공종 필터 적용 상태 확인');
console.log('- 국적 검색 첫 결과 자동 하이라이트');
console.log('- 한국 입력 후 Tab → 대한민국으로 자동 확정');
console.log('- China 입력 후 Tab → 중국으로 자동 확정');
console.log('');
console.log('Supabase 00/01 SQL을 이미 성공 실행했다면 다시 실행할 필요 없습니다.');
console.log('다음 명령: npm run build');
