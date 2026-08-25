const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.4';
const TARGET = path.resolve(
  process.cwd(),
  'src/page/ProgressClaimManagement.jsx',
);
const BASE_MARKER =
  '// v52.48.5.44.7.3 기성회차 삭제 + 구분 누락 진단';
const VERSION_MARKER =
  '// v52.48.5.44.7.4 기성회차 삭제 시 표준계약 잔여데이터 정리';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }
  const second = source.indexOf(
    anchor,
    first + anchor.length,
  );
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }
  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + anchor.length)
  );
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (!source.includes(VERSION_MARKER)) {
  if (!source.includes(BASE_MARKER)) {
    fail(
      'ProgressClaimManagement.jsx가 v52.48.5.44.7.3 기준과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }

  const backupDir = path.resolve(
    process.cwd(),
    `backup_v52.48.5.44.7.4_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}`,
  );
  const backupPath = path.join(
    backupDir,
    'src/page/ProgressClaimManagement.jsx',
  );

  fs.mkdirSync(path.dirname(backupPath), {
    recursive: true,
  });
  fs.copyFileSync(TARGET, backupPath);

  source = replaceOnce(
    source,
    "// v52.48.5.44.7.3 기성회차 삭제 + 구분 누락 진단",
    "// v52.48.5.44.7.4 기성회차 삭제 시 표준계약 잔여데이터 정리\n// v52.48.5.44.7.3 기성회차 삭제 + 구분 누락 진단",
    "버전 마커",
  );

  source = replaceOnce(
    source,
    "- 해당 회차의 기성 품목/연결자료가 삭제됩니다.\\n- 계약버전과 계약품목 원본은 보존됩니다.\\n- 삭제 후에는 되돌릴 수 없습니다.",
    "- 해당 회차의 기성 품목/연결자료가 삭제됩니다.\\n- 이 계약버전을 사용하는 등록 회차가 더 없으면, 표준양식에서 생성된 계약품목 원본도 함께 초기화됩니다.\\n- 기존 외부 계약원본은 자동 삭제하지 않습니다.\\n- 삭제 후에는 되돌릴 수 없습니다.",
    "삭제 확인 안내",
  );

  source = replaceOnce(
    source,
    "      setMessage({\n        severity: 'success',\n        text:\n          `${data?.claim_no || targetClaimNo}회차 등록 기성자료를 삭제했습니다. 계약버전/계약품목 원본은 그대로 보존됩니다.`,\n      });",
    "      setMessage({\n        severity: 'success',\n        text:\n          `${data?.claim_no || targetClaimNo}회차 등록 기성자료를 삭제했습니다.` +\n          (data?.contract_master_deleted\n            ? ` 이 회차가 사용하던 \"${data?.contract_version_label || contractVersionLabel}\" 표준 계약품목도 더 이상 사용되지 않아 함께 초기화했습니다. 다음 양식 다운로드는 빈 최초계약 양식으로 시작됩니다.`\n            : ' 다른 등록 회차가 사용하는 계약원본 또는 기존 외부 계약원본은 그대로 보존했습니다.'),\n      });",
    "삭제 완료 안내",
  );

  fs.writeFileSync(TARGET, source, 'utf8');
  console.log(`- JSX 백업: ${path.relative(process.cwd(), backupPath)}`);
} else {
  console.log('- JSX는 이미 v52.48.5.44.7.4가 적용되어 있습니다.');
}

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.7.4',
  'supabase',
  'v52.48.5.44.7.4_progress_claim_delete_cleanup.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.7.4_progress_claim_delete_cleanup.sql',
);

if (fs.existsSync(sqlSource)) {
  fs.mkdirSync(path.dirname(sqlTarget), {
    recursive: true,
  });
  fs.copyFileSync(sqlSource, sqlTarget);
} else if (!fs.existsSync(sqlTarget)) {
  fail('Supabase SQL 원본 파일을 찾지 못했습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 삭제한 회차가 마지막 사용 회차이면 표준 최초계약 원본도 함께 정리');
console.log('- 이미 v7.3으로 회차만 삭제해 남은 orphan 표준계약 데이터는 SQL 실행 시 1회 자동 정리');
console.log('- 기존 외부 계약원본/다른 회차가 사용하는 계약원본은 보존');
console.log('- SQL 실행 필요: supabase/v52.48.5.44.7.4_progress_claim_delete_cleanup.sql');
