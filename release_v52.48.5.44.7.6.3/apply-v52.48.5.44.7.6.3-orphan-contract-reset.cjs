const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.6.3';
const TARGET = path.resolve(
  process.cwd(),
  'src/page/ProgressClaimManagement.jsx',
);
const BASE_MARKER = "// v52.48.5.44.7.6 기성삭제-계약품목 공정연결 완전초기화";
const VERSION_MARKER = "// v52.48.5.44.7.6.3 기성삭제 후 계약마스터 강제동기화 보완";

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) fail(`적용 기준을 찾지 못했습니다: ${label}`);
  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) fail(`파일을 찾을 수 없습니다: ${TARGET}`);

let source = fs.readFileSync(TARGET, 'utf8');

if (!source.includes(VERSION_MARKER)) {
  if (!source.includes(BASE_MARKER)) {
    fail('ProgressClaimManagement.jsx가 v52.48.5.44.7.6 기준과 다릅니다.');
  }

  const backupDir = path.resolve(
    process.cwd(),
    `backup_v52.48.5.44.7.6.3_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  const backupPath = path.join(
    backupDir,
    'src/page/ProgressClaimManagement.jsx',
  );

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(TARGET, backupPath);

  source = replaceOnce(
    source,
    BASE_MARKER,
    "// v52.48.5.44.7.6.3 기성삭제 후 계약마스터 강제동기화 보완\n// v52.48.5.44.7.6 기성삭제-계약품목 공정연결 완전초기화",
    '버전 마커',
  );

  source = replaceOnce(
    source,
    "      const refreshedClaims =\n        await loadClaimList();\n\n      if (\n        activeClaimId === claim.id\n      ) {",
    "      /*\n        메인 삭제 RPC 이후 한 번 더 계약마스터 초기화 RPC를 호출합니다.\n        이미 정상 삭제된 경우에는 already_clean으로 끝나고,\n        과거 source_key 형식/중복 계약버전 때문에 잔여자료가 생겨도\n        같은 현장+계약버전명의 등록 회차가 0건이면 확실히 정리합니다.\n      */\n      let contractResetResult = null;\n\n      try {\n        const {\n          data: resetData,\n          error: resetError,\n        } = await supabase.rpc(\n          'admin_reset_progress_contract_master_v2',\n          {\n            p_project_name:\n              projectName,\n            p_version_label:\n              data?.contract_version_label ||\n              getClaimVersionLabel(\n                claim,\n              ) ||\n              contractVersionLabel,\n          },\n        );\n\n        if (resetError) {\n          console.warn(\n            '기성 삭제 후 계약마스터 보완 초기화 오류:',\n            resetError,\n          );\n        } else {\n          contractResetResult =\n            resetData;\n        }\n      } catch (resetException) {\n        console.warn(\n          '기성 삭제 후 계약마스터 보완 초기화 예외:',\n          resetException,\n        );\n      }\n\n      const refreshedClaims =\n        await loadClaimList();\n\n      if (\n        activeClaimId === claim.id\n      ) {",
    '삭제 후 계약마스터 보완 초기화',
  );

  source = replaceOnce(
    source,
    "          (data?.contract_master_deleted\n            ? ` 이 회차가 사용하던 \"${data?.contract_version_label || contractVersionLabel}\" 표준 계약품목도 더 이상 사용되지 않아 함께 초기화했습니다. 계약품목 공정연결에서도 동일하게 제거됩니다. 다음 양식 다운로드는 빈 최초계약 양식으로 시작됩니다.`\n            : ' 다른 등록 회차가 사용하는 계약원본 또는 기존 외부 계약원본은 그대로 보존했습니다.'),",
    "          (\n            data?.contract_master_deleted ||\n            Number(\n              contractResetResult?.deleted_contract_item_rows ||\n                0,\n            ) > 0 ||\n            Number(\n              contractResetResult?.deleted_contract_version_rows ||\n                0,\n            ) > 0 ||\n            contractResetResult?.already_clean\n              ? ` 이 회차가 사용하던 \"${data?.contract_version_label || getClaimVersionLabel(claim) || contractVersionLabel}\" 계약품목과 공정연결도 함께 초기화했습니다. 다음 양식 다운로드는 빈 최초계약 양식으로 시작됩니다.`\n              : ' 다른 등록 회차가 같은 계약버전을 사용하고 있어 계약품목/공정연결 원본은 유지했습니다.'\n          ),",
    '삭제 완료 안내',
  );

  fs.writeFileSync(TARGET, source, 'utf8');
}

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.7.6.3',
  'supabase',
  'v52.48.5.44.7.6.3_orphan_contract_master_reset.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.7.6.3_orphan_contract_master_reset.sql',
);

if (fs.existsSync(sqlSource)) {
  fs.mkdirSync(path.dirname(sqlTarget), { recursive: true });
  fs.copyFileSync(sqlSource, sqlTarget);
} else if (!fs.existsSync(sqlTarget)) {
  fail('Supabase SQL 원본 파일을 찾지 못했습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- ProgressClaimManagement 삭제 후 계약마스터 보완 초기화 RPC 추가');
console.log('- source_key 형식과 무관하게 현장+계약버전명 기준 정리');
console.log('- 등록 기성 회차가 남아있으면 reset RPC는 자동 skip');
console.log('- SQL 실행 시 현재 orphan 후보가 정확히 1개면 1회 자동복구');
console.log('- SQL 실행 후 잔여 orphan 요약 결과 제공');
