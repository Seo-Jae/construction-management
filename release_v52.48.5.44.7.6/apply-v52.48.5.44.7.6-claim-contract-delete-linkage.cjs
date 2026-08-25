const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.6';
const CLAIM_TARGET = path.resolve(
  process.cwd(),
  'src/page/ProgressClaimManagement.jsx',
);
const MAPPING_TARGET = path.resolve(
  process.cwd(),
  'src/page/ContractItemProcessMapping.jsx',
);
const CLAIM_BASE =
  '// v52.48.5.44.7.5 기성양식-계약품목 공정연결 즉시 동기화';
const CLAIM_MARKER =
  '// v52.48.5.44.7.6 기성삭제-계약품목 공정연결 완전초기화';
const MAPPING_BASE =
  '// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동';
const MAPPING_MARKER =
  '// v52.48.5.44.7.6 계약버전 중복표시 제거 + 삭제동기화';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(
  source,
  anchor,
  replacement,
  label,
) {
  const first = source.indexOf(anchor);

  if (first === -1) {
    fail(
      `적용 기준을 찾지 못했습니다: ${label}`,
    );
  }

  const second = source.indexOf(
    anchor,
    first + anchor.length,
  );

  if (second !== -1) {
    fail(
      `적용 기준이 2개 이상 발견되었습니다: ${label}`,
    );
  }

  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + anchor.length)
  );
}

function replaceExactCount(
  source,
  anchor,
  replacement,
  expectedCount,
  label,
) {
  const count =
    source.split(anchor).length - 1;

  if (count !== expectedCount) {
    fail(
      `${label} 적용 기준 개수가 예상과 다릅니다. 예상 ${expectedCount}개 / 실제 ${count}개`,
    );
  }

  return source.split(anchor).join(replacement);
}

if (!fs.existsSync(CLAIM_TARGET)) {
  fail(
    `파일을 찾을 수 없습니다: ${CLAIM_TARGET}`,
  );
}

if (!fs.existsSync(MAPPING_TARGET)) {
  fail(
    `파일을 찾을 수 없습니다: ${MAPPING_TARGET}`,
  );
}

let claimSource = fs.readFileSync(
  CLAIM_TARGET,
  'utf8',
);
let mappingSource = fs.readFileSync(
  MAPPING_TARGET,
  'utf8',
);

if (
  !claimSource.includes(CLAIM_MARKER) &&
  !claimSource.includes(CLAIM_BASE)
) {
  fail(
    'ProgressClaimManagement.jsx가 v52.48.5.44.7.5 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.',
  );
}

if (
  !mappingSource.includes(MAPPING_MARKER) &&
  !mappingSource.includes(MAPPING_BASE)
) {
  fail(
    'ContractItemProcessMapping.jsx가 v52.48.5.44.7.5 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.7.6_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);

if (!claimSource.includes(CLAIM_MARKER)) {
  const backupPath = path.join(
    backupDir,
    'src/page/ProgressClaimManagement.jsx',
  );

  fs.mkdirSync(
    path.dirname(backupPath),
    { recursive: true },
  );

  fs.copyFileSync(
    CLAIM_TARGET,
    backupPath,
  );

  claimSource = replaceOnce(
    claimSource,
    "// v52.48.5.44.7.5 기성양식-계약품목 공정연결 즉시 동기화",
    "// v52.48.5.44.7.6 기성삭제-계약품목 공정연결 완전초기화\n// v52.48.5.44.7.5 기성양식-계약품목 공정연결 즉시 동기화",
    "ProgressClaim 버전 마커",
  );

  claimSource = replaceOnce(
    claimSource,
    "contract_version:progress_contract_versions(version_label)",
    "contract_version:progress_contract_versions(id, version_label)",
    "회차 목록 contract version id 포함",
  );

  claimSource = replaceOnce(
    claimSource,
    "const getClaimVersionLabel = (claim) => {\n  const relation = claim?.contract_version;\n\n  if (Array.isArray(relation)) {\n    return relation[0]?.version_label || DEFAULT_CONTRACT_VERSION;\n  }\n\n  return relation?.version_label || DEFAULT_CONTRACT_VERSION;\n};",
    "const getClaimVersionLabel = (claim) => {\n  const relation = claim?.contract_version;\n\n  if (Array.isArray(relation)) {\n    return relation[0]?.version_label || DEFAULT_CONTRACT_VERSION;\n  }\n\n  return relation?.version_label || DEFAULT_CONTRACT_VERSION;\n};\n\nconst getClaimContractVersionId = (claim) => {\n  const relation = claim?.contract_version;\n\n  if (Array.isArray(relation)) {\n    return relation[0]?.id || '';\n  }\n\n  return relation?.id || '';\n};",
    "회차 contract version id helper",
  );

  claimSource = replaceOnce(
    claimSource,
    "    try {\n      const contractRows = await fetchContractTemplateItems({\n        projectName,\n        versionLabel: contractVersionLabel,\n      });\n\n      const isNewContractTemplate =",
    "    try {\n      /*\n        동일한 version_label의 과거 중복버전이 있더라도\n        전회차가 실제 사용한 contract_version_id를 우선 사용합니다.\n      */\n      const preferredContractClaim = [...claims]\n        .filter(\n          (claim) =>\n            Number(claim.claim_no || 0) < Number(claimNo || 1) &&\n            getClaimVersionLabel(claim) ===\n              contractVersionLabel.trim(),\n        )\n        .sort(\n          (left, right) =>\n            Number(right.claim_no || 0) -\n            Number(left.claim_no || 0),\n        )[0];\n\n      const contractRows = await fetchContractTemplateItems({\n        projectName,\n        versionLabel: contractVersionLabel,\n        contractVersionId:\n          getClaimContractVersionId(\n            preferredContractClaim,\n          ),\n      });\n\n      const isNewContractTemplate =",
    "양식 다운로드 실제 사용 버전 우선",
  );

  claimSource = replaceExactCount(
    claimSource,
    "  const { data: versionRows, error: versionError } = await supabase\n    .from('progress_contract_versions')\n    .select('id')\n    .eq('project_name', normalizedProjectName)\n    .eq('version_label', normalizedVersionLabel)\n    .limit(1);\n\n  if (versionError) throw versionError;\n\n  const versionRow = versionRows?.[0];\n  if (!versionRow?.id) return [];",
    "  const { data: versionRows, error: versionError } = await supabase\n    .from('progress_contract_versions')\n    .select('id, created_at')\n    .eq('project_name', normalizedProjectName)\n    .eq('version_label', normalizedVersionLabel)\n    .order('created_at', { ascending: false })\n    .limit(1);\n\n  if (versionError) throw versionError;\n\n  const versionRow = versionRows?.[0];\n  if (!versionRow?.id) return [];",
    2,
    '계약버전 최신행 조회',
  );

  fs.writeFileSync(
    CLAIM_TARGET,
    claimSource,
    'utf8',
  );
}

if (!mappingSource.includes(MAPPING_MARKER)) {
  const backupPath = path.join(
    backupDir,
    'src/page/ContractItemProcessMapping.jsx',
  );

  fs.mkdirSync(
    path.dirname(backupPath),
    { recursive: true },
  );

  fs.copyFileSync(
    MAPPING_TARGET,
    backupPath,
  );

  mappingSource = replaceOnce(
    mappingSource,
    "// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동",
    "// v52.48.5.44.7.6 계약버전 중복표시 제거 + 삭제동기화\n// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동",
    "ContractMapping 버전 마커",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "      const nextVersions = data || [];\n      setVersions(nextVersions);\n      setSelectedVersionId((previous) => {\n        if (previous && nextVersions.some((version) => version.id === previous)) {\n          return previous;\n        }\n        return nextVersions[nextVersions.length - 1]?.id || '';\n      });",
    "      /*\n        과거 저장과정에서 동일한 version_label이 중복 생성된 적이 있어\n        공정연결 화면에 같은 계약버전이 여러 개 보일 수 있었습니다.\n        같은 이름은 가장 최근 created_at 1개만 화면에 사용합니다.\n      */\n      const versionByLabel = new Map();\n\n      (data || []).forEach((version) => {\n        const label = String(\n          version?.version_label || '',\n        ).trim();\n\n        if (!label) return;\n\n        const existing =\n          versionByLabel.get(label);\n\n        if (\n          !existing ||\n          new Date(\n            version?.created_at || 0,\n          ).getTime() >=\n            new Date(\n              existing?.created_at || 0,\n            ).getTime()\n        ) {\n          versionByLabel.set(\n            label,\n            version,\n          );\n        }\n      });\n\n      const nextVersions = Array.from(\n        versionByLabel.values(),\n      ).sort(\n        (left, right) =>\n          new Date(\n            left?.created_at || 0,\n          ).getTime() -\n          new Date(\n            right?.created_at || 0,\n          ).getTime(),\n      );\n\n      setVersions(nextVersions);\n      setSelectedVersionId((previous) => {\n        if (\n          previous &&\n          nextVersions.some(\n            (version) =>\n              version.id === previous,\n          )\n        ) {\n          return previous;\n        }\n\n        return (\n          nextVersions[\n            nextVersions.length - 1\n          ]?.id || ''\n        );\n      });",
    "계약버전 label 중복 제거",
  );

  fs.writeFileSync(
    MAPPING_TARGET,
    mappingSource,
    'utf8',
  );
}

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.7.6',
  'supabase',
  'v52.48.5.44.7.6_claim_contract_delete_linkage.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.7.6_claim_contract_delete_linkage.sql',
);

if (fs.existsSync(sqlSource)) {
  fs.mkdirSync(
    path.dirname(sqlTarget),
    { recursive: true },
  );
  fs.copyFileSync(
    sqlSource,
    sqlTarget,
  );
} else if (!fs.existsSync(sqlTarget)) {
  fail(
    'Supabase SQL 원본 파일을 찾지 못했습니다.',
  );
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressClaimManagement.jsx');
console.log('- 수정: src/page/ContractItemProcessMapping.jsx');
console.log('- 추가: supabase/v52.48.5.44.7.6_claim_contract_delete_linkage.sql');
console.log('- 마지막 기성 회차 삭제 시 같은 현장/계약버전명의 계약품목 전체 초기화');
console.log('- 계약품목 process_type(공정연결)도 같이 삭제');
console.log('- 동일 계약버전명 중복행은 가장 최근 버전 1개만 화면에 표시');
console.log('- 양식 다운로드는 임의 버전이 아니라 최신/실사용 버전을 우선');
console.log('- SQL 실행 시 과거 삭제버그로 남은 orphan 계약자료도 1회 정리');
console.log('- SQL 1회 실행 필요');
