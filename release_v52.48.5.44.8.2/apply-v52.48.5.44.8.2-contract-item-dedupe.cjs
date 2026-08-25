const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.8.2';
const TARGET = path.resolve(
  process.cwd(),
  'src/page/ContractItemProcessMapping.jsx',
);
const BASE_MARKER = "// v52.48.5.44.7.6 계약버전 중복표시 제거 + 삭제동기화";
const VERSION_MARKER = "// v52.48.5.44.8.2 계약품목 중복방지·표시정리";

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
    fail('ContractItemProcessMapping.jsx 기준 버전을 확인할 수 없습니다.');
  }

  const backupDir = path.resolve(
    process.cwd(),
    `backup_v52.48.5.44.8.2_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  const backupPath = path.join(
    backupDir,
    'src/page/ContractItemProcessMapping.jsx',
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(TARGET, backupPath);

  source = replaceOnce(
    source,
    BASE_MARKER,
    `${VERSION_MARKER}\n${BASE_MARKER}`,
    '버전 마커',
  );

  source = replaceOnce(
    source,
    "const fetchAllContractItems = async ({ projectName, contractVersionId }) => {",
    "const dedupeContractItemsBySourceKey = (\n  sourceItems,\n) => {\n  const itemMap = new Map();\n  const noSourceKeyRows = [];\n\n  (Array.isArray(sourceItems)\n    ? sourceItems\n    : []\n  ).forEach((item) => {\n    const sourceKey = String(\n      item?.source_key || '',\n    ).trim();\n\n    if (!sourceKey) {\n      noSourceKeyRows.push(item);\n      return;\n    }\n\n    const key =\n      `${item?.contract_version_id || ''}::${sourceKey}`;\n    const existing =\n      itemMap.get(key);\n\n    if (!existing) {\n      itemMap.set(key, {\n        ...item,\n        source_key: sourceKey,\n      });\n      return;\n    }\n\n    const mergedProcess =\n      encodeProcessTypes([\n        ...decodeProcessTypes(\n          existing.process_type,\n        ),\n        ...decodeProcessTypes(\n          item.process_type,\n        ),\n      ]);\n\n    const existingMappedAt =\n      existing.mapped_at\n        ? new Date(\n            existing.mapped_at,\n          ).getTime()\n        : 0;\n    const itemMappedAt =\n      item.mapped_at\n        ? new Date(\n            item.mapped_at,\n          ).getTime()\n        : 0;\n\n    itemMap.set(key, {\n      ...existing,\n      process_type:\n        mergedProcess,\n      mapped_by_name:\n        itemMappedAt >\n        existingMappedAt\n          ? item.mapped_by_name\n          : existing.mapped_by_name,\n      mapped_at:\n        itemMappedAt >\n        existingMappedAt\n          ? item.mapped_at\n          : existing.mapped_at,\n    });\n  });\n\n  const deduped = [\n    ...itemMap.values(),\n    ...noSourceKeyRows,\n  ];\n\n  deduped.sort(\n    (left, right) =>\n      Number(left?.sort_order || 0) -\n        Number(right?.sort_order || 0) ||\n      Number(left?.source_row_no || 0) -\n        Number(right?.source_row_no || 0),\n  );\n\n  if (\n    deduped.length <\n    sourceItems.length\n  ) {\n    console.warn(\n      `계약품목 중복 ${\n        sourceItems.length -\n        deduped.length\n      }건을 화면에서 제외했습니다. DB 중복정리 SQL을 실행해주세요.`,\n    );\n  }\n\n  return deduped;\n};\n\nconst fetchAllContractItems = async ({ projectName, contractVersionId }) => {",
    '중복정리 helper',
  );

  source = replaceOnce(
    source,
    "  return rows.map((item) => ({\n    ...item,\n    process_type: encodeProcessTypes(decodeProcessTypes(item.process_type)),\n  }));",
    "  return dedupeContractItemsBySourceKey(\n    rows.map((item) => ({\n      ...item,\n      process_type:\n        encodeProcessTypes(\n          decodeProcessTypes(\n            item.process_type,\n          ),\n        ),\n    })),\n  );",
    '계약품목 조회 중복제거',
  );

  fs.writeFileSync(TARGET, source, 'utf8');
}

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.8.2',
  'supabase',
  'v52.48.5.44.8.2_contract_item_dedupe.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.8.2_contract_item_dedupe.sql',
);

if (fs.existsSync(sqlSource)) {
  fs.mkdirSync(path.dirname(sqlTarget), { recursive: true });
  fs.copyFileSync(sqlSource, sqlTarget);
} else if (!fs.existsSync(sqlTarget)) {
  fail('Supabase SQL 원본을 찾지 못했습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 계약품목 공정연결 화면에서 동일 source_key 중복을 즉시 제외');
console.log('- SQL 실행 시 DB의 실제 중복행 삭제');
console.log('- 삭제 전 progress_contract_items_dedupe_backup에 JSON 백업');
console.log('- 중복 공정연결값은 합쳐서 보존');
console.log('- UNIQUE INDEX로 같은 계약버전/source_key 재중복 차단');
console.log('- SQL 실행 필요');
