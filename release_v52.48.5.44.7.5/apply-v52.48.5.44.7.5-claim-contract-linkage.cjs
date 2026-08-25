const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.5';
const CLAIM_TARGET = path.resolve(
  process.cwd(),
  'src/page/ProgressClaimManagement.jsx',
);
const MAPPING_TARGET = path.resolve(
  process.cwd(),
  'src/page/ContractItemProcessMapping.jsx',
);

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

function replaceAllExact(
  source,
  anchor,
  replacement,
  label,
) {
  const count =
    source.split(anchor).length - 1;

  if (count < 1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  return source.split(anchor).join(replacement);
}

if (!fs.existsSync(CLAIM_TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${CLAIM_TARGET}`);
}

if (!fs.existsSync(MAPPING_TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${MAPPING_TARGET}`);
}

let claimSource = fs.readFileSync(
  CLAIM_TARGET,
  'utf8',
);
let mappingSource = fs.readFileSync(
  MAPPING_TARGET,
  'utf8',
);

const CLAIM_BASE =
  '// v52.48.5.44.7.4 기성회차 삭제 시 표준계약 잔여데이터 정리';
const CLAIM_MARKER =
  '// v52.48.5.44.7.5 기성양식-계약품목 공정연결 즉시 동기화';
const MAPPING_MARKER =
  '// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동';

if (!claimSource.includes(CLAIM_MARKER)) {
  if (!claimSource.includes(CLAIM_BASE)) {
    fail(
      'ProgressClaimManagement.jsx가 v52.48.5.44.7.4 기준과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }
}

if (
  !mappingSource.includes(MAPPING_MARKER) &&
  !mappingSource.includes(
    'function ContractItemProcessMapping({',
  )
) {
  fail(
    'ContractItemProcessMapping.jsx 기준을 확인할 수 없습니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.7.5_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);

if (!claimSource.includes(CLAIM_MARKER)) {
  const claimBackup = path.join(
    backupDir,
    'src/page/ProgressClaimManagement.jsx',
  );
  fs.mkdirSync(path.dirname(claimBackup), {
    recursive: true,
  });
  fs.copyFileSync(
    CLAIM_TARGET,
    claimBackup,
  );

  claimSource = replaceOnce(
    claimSource,
    "// v52.48.5.44.7.4 기성회차 삭제 시 표준계약 잔여데이터 정리",
    "// v52.48.5.44.7.5 기성양식-계약품목 공정연결 즉시 동기화\n// v52.48.5.44.7.4 기성회차 삭제 시 표준계약 잔여데이터 정리",
    "ProgressClaim 버전 마커",
  );

  claimSource = replaceOnce(
    claimSource,
    "      let parsedItems;\n      let projectLabel;\n\n      if (standardTemplate) {",
    "      let parsedItems;\n      let projectLabel;\n      let standardContractSyncMessage = '';\n\n      if (standardTemplate) {",
    "표준양식 동기화 메시지 변수",
  );

  claimSource = replaceOnce(
    claimSource,
    "        parsedItems = standardTemplate.items;\n        projectLabel = templateProjectName;\n      } else {",
    "        parsedItems = standardTemplate.items;\n        projectLabel = templateProjectName;\n\n        const syncableContractItems = parsedItems.filter(\n          (item) =>\n            (item.validation_errors || []).length === 0,\n        );\n\n        if (\n          syncableContractItems.length === parsedItems.length &&\n          syncableContractItems.length > 0\n        ) {\n          const {\n            data: syncResult,\n            error: syncError,\n          } = await supabase.rpc(\n            'sync_progress_contract_master_v1',\n            {\n              p_project_name: projectName,\n              p_contract_version_label:\n                contractVersionLabel.trim(),\n              p_effective_date: `${baseMonth}-01`,\n              p_source_file_name: file.name,\n              p_items: syncableContractItems.map(\n                ({ validation_errors, ...item }) => ({\n                  ...item,\n                  process_type:\n                    encodeProcessTypes(\n                      decodeProcessTypes(\n                        item.process_type,\n                      ),\n                    ),\n                }),\n              ),\n            },\n          );\n\n          if (syncError) {\n            throw new Error(\n              `계약품목 공정연결 자동 동기화 실패: ${syncError.message}`,\n            );\n          }\n\n          standardContractSyncMessage =\n            ` 계약품목 공정연결에 ${Number(\n              syncResult?.item_count ||\n                syncableContractItems.length,\n            ).toLocaleString()}건을 즉시 반영했습니다.`;\n\n          if (\n            typeof window !== 'undefined'\n          ) {\n            window.dispatchEvent(\n              new CustomEvent(\n                'progress-contract-master-changed',\n                {\n                  detail: {\n                    projectName,\n                    versionLabel:\n                      contractVersionLabel.trim(),\n                    source:\n                      'progress-claim-upload',\n                  },\n                },\n              ),\n            );\n          }\n        } else {\n          standardContractSyncMessage =\n            ' 검산오류가 있어 계약품목 공정연결 자동반영은 보류했습니다.';\n        }\n      } else {",
    "표준양식 업로드 즉시 계약마스터 동기화",
  );

  claimSource = replaceOnce(
    claimSource,
    "          `${file.name}에서 직접비 ${nextItems.length.toLocaleString()}개 품목을 읽었습니다. 간접비는 제외했습니다.` +\n          inheritanceSummary +",
    "          `${file.name}에서 직접비 ${nextItems.length.toLocaleString()}개 품목을 읽었습니다. 간접비는 제외했습니다.` +\n          standardContractSyncMessage +\n          inheritanceSummary +",
    "업로드 완료 동기화 안내",
  );

  claimSource = replaceOnce(
    claimSource,
    "      setMessage({\n        severity: 'success',\n        text:\n          `${data?.claim_no || targetClaimNo}회차 등록 기성자료를 삭제했습니다.` +\n          (data?.contract_master_deleted\n            ? ` 이 회차가 사용하던 \"${data?.contract_version_label || contractVersionLabel}\" 표준 계약품목도 더 이상 사용되지 않아 함께 초기화했습니다. 다음 양식 다운로드는 빈 최초계약 양식으로 시작됩니다.`\n            : ' 다른 등록 회차가 사용하는 계약원본 또는 기존 외부 계약원본은 그대로 보존했습니다.'),\n      });",
    "      setMessage({\n        severity: 'success',\n        text:\n          `${data?.claim_no || targetClaimNo}회차 등록 기성자료를 삭제했습니다.` +\n          (data?.contract_master_deleted\n            ? ` 이 회차가 사용하던 \"${data?.contract_version_label || contractVersionLabel}\" 표준 계약품목도 더 이상 사용되지 않아 함께 초기화했습니다. 계약품목 공정연결에서도 동일하게 제거됩니다. 다음 양식 다운로드는 빈 최초계약 양식으로 시작됩니다.`\n            : ' 다른 등록 회차가 사용하는 계약원본 또는 기존 외부 계약원본은 그대로 보존했습니다.'),\n      });\n\n      if (\n        typeof window !== 'undefined'\n      ) {\n        window.dispatchEvent(\n          new CustomEvent(\n            'progress-contract-master-changed',\n            {\n              detail: {\n                projectName,\n                versionLabel:\n                  data?.contract_version_label ||\n                  contractVersionLabel,\n                source:\n                  'progress-claim-delete',\n              },\n            },\n          ),\n        );\n      }",
    "삭제 후 계약품목 공정연결 갱신 이벤트",
  );

  fs.writeFileSync(
    CLAIM_TARGET,
    claimSource,
    'utf8',
  );
}

if (!mappingSource.includes(MAPPING_MARKER)) {
  const mappingBackup = path.join(
    backupDir,
    'src/page/ContractItemProcessMapping.jsx',
  );
  fs.mkdirSync(path.dirname(mappingBackup), {
    recursive: true,
  });
  fs.copyFileSync(
    MAPPING_TARGET,
    mappingBackup,
  );

  mappingSource = replaceOnce(
    mappingSource,
    "import React, {",
    "// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동\nimport React, {",
    "ContractMapping 버전 마커",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "const getTypeLabel = (item) => {\n  const raw = String(item?.housing_type || item?.classification || '미분류').trim();\n  if (!raw) return '미분류';\n  return HOUSEHOLD_TYPE_PATTERN.test(raw) ? '세대' : raw;\n};",
    "const getTypeLabel = (item) => {\n  /*\n    표준 기성양식 B열은 이제 '구분'이며 classification이 원본값입니다.\n    과거에는 housing_type을 먼저 보면서 classification을 '세대/공용'으로\n    수정해도 계약품목 공정연결 화면에 이전값이 남을 수 있었습니다.\n  */\n  const classification = String(\n    item?.classification || '',\n  ).trim();\n\n  if (classification) {\n    return HOUSEHOLD_TYPE_PATTERN.test(\n      classification,\n    )\n      ? '세대'\n      : classification;\n  }\n\n  const housingType = String(\n    item?.housing_type || '',\n  ).trim();\n\n  if (!housingType) {\n    return '미분류';\n  }\n\n  return HOUSEHOLD_TYPE_PATTERN.test(\n    housingType,\n  )\n    ? '세대'\n    : housingType;\n};",
    "구분 classification 우선 표시",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "  const [saving, setSaving] = useState(false);\n  const [keyword, setKeyword] = useState('');",
    "  const [saving, setSaving] = useState(false);\n  const [\n    contractMasterRefreshTick,\n    setContractMasterRefreshTick,\n  ] = useState(0);\n  const [keyword, setKeyword] = useState('');",
    "외부 동기화 refresh tick",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "  useEffect(() => {\n    loadVersions();\n  }, [loadVersions]);\n\n  useEffect(() => {\n    loadItems();\n  }, [loadItems]);",
    "  useEffect(() => {\n    loadVersions();\n  }, [\n    loadVersions,\n    contractMasterRefreshTick,\n  ]);\n\n  useEffect(() => {\n    loadItems();\n  }, [\n    loadItems,\n    contractMasterRefreshTick,\n  ]);\n\n  useEffect(() => {\n    if (\n      typeof window === 'undefined'\n    ) {\n      return undefined;\n    }\n\n    const handleContractMasterChanged = (\n      event,\n    ) => {\n      const detail =\n        event?.detail || {};\n\n      if (\n        detail.source ===\n        'contract-item-process-mapping'\n      ) {\n        return;\n      }\n\n      if (\n        detail.projectName &&\n        detail.projectName !== projectName\n      ) {\n        return;\n      }\n\n      setContractMasterRefreshTick(\n        (previous) => previous + 1,\n      );\n    };\n\n    window.addEventListener(\n      'progress-contract-master-changed',\n      handleContractMasterChanged,\n    );\n\n    return () => {\n      window.removeEventListener(\n        'progress-contract-master-changed',\n        handleContractMasterChanged,\n      );\n    };\n  }, [projectName]);",
    "계약마스터 외부 변경 즉시 새로고침",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "            타입을 고르고 품명 또는 규격을 검색한 뒤, 필요한 계약 품목을\n            선택해 공정을 한 번에 연결합니다.",
    "            구분을 고르고 품명 또는 규격을 검색한 뒤, 필요한 계약 품목을\n            선택해 공정을 한 번에 연결합니다.",
    "공정연결 팝업 설명",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "              타입 구분",
    "              구분",
    "팝업 타입 구분->구분",
  );

  mappingSource = replaceOnce(
    mappingSource,
    "      setMessage({\n        severity: 'success',\n        text: `계약 품목 공정 연결 ${Number(data || changedItems.length).toLocaleString()}건을 저장했습니다.`,\n      });",
    "      setMessage({\n        severity: 'success',\n        text: `계약 품목 공정 연결 ${Number(data || changedItems.length).toLocaleString()}건을 저장했습니다.`,\n      });\n\n      if (\n        typeof window !== 'undefined'\n      ) {\n        window.dispatchEvent(\n          new CustomEvent(\n            'progress-contract-master-changed',\n            {\n              detail: {\n                projectName,\n                versionLabel:\n                  selectedVersion?.version_label ||\n                  '',\n                source:\n                  'contract-item-process-mapping',\n              },\n            },\n          ),\n        );\n      }",
    "공정연결 저장 변경 이벤트",
  );

  mappingSource = replaceAllExact(
    mappingSource,
    "label=\"타입\"",
    "label=\"구분\"",
    "타입 필터 전체",
  );

  mappingSource = replaceAllExact(
    mappingSource,
    "label=\"동일 타입·품명 묶기\"",
    "label=\"동일 구분·품명 묶기\"",
    "동일 타입 묶기 전체",
  );

  mappingSource = replaceAllExact(
    mappingSource,
    "['타입·공구', 110],",
    "['구분', 110],",
    "메인 타입공구 전체",
  );

  mappingSource = replaceAllExact(
    mappingSource,
    "['타입·공구', 125],",
    "['구분', 125],",
    "팝업 타입공구 전체",
  );

  fs.writeFileSync(
    MAPPING_TARGET,
    mappingSource,
    'utf8',
  );
}

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.7.5',
  'supabase',
  'v52.48.5.44.7.5_claim_contract_master_sync.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.7.5_claim_contract_master_sync.sql',
);

if (fs.existsSync(sqlSource)) {
  fs.mkdirSync(path.dirname(sqlTarget), {
    recursive: true,
  });
  fs.copyFileSync(
    sqlSource,
    sqlTarget,
  );
} else if (!fs.existsSync(sqlTarget)) {
  fail('Supabase SQL 원본 파일을 찾지 못했습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressClaimManagement.jsx');
console.log('- 수정: src/page/ContractItemProcessMapping.jsx');
console.log('- 추가: supabase/v52.48.5.44.7.5_claim_contract_master_sync.sql');
console.log('- 표준 기성양식 업로드 즉시 계약품목 공정연결 데이터 동기화');
console.log('- 재업로드는 계약품목을 교체 동기화하여 중복 누적 방지');
console.log('- 기존 공정연결값은 SYSTEM_ITEM_KEY(source_key) 기준 보존');
console.log('- 구분은 classification을 우선 표시하여 세대/공용 변경 즉시 반영');
console.log('- 기성 회차 삭제 후 계약품목 공정연결 화면도 즉시 새로고침');
console.log('- SQL 1회 실행 필요');
