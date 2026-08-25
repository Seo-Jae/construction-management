const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.3';
const TARGET = path.resolve(
  process.cwd(),
  'src/page/ProgressClaimManagement.jsx',
);
const BASE_MARKER =
  '// v52.48.5.44.7.2 최초계약 양식 구분 안내';
const VERSION_MARKER =
  '// v52.48.5.44.7.3 기성회차 삭제 + 구분 누락 진단';

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

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(
  TARGET,
  'utf8',
);

if (source.includes(VERSION_MARKER)) {
  console.log(
    `[${VERSION}] 이미 적용되어 있습니다.`,
  );
  process.exit(0);
}

if (!source.includes(BASE_MARKER)) {
  fail(
    'ProgressClaimManagement.jsx가 v52.48.5.44.7.2 기준과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.7.3_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(
  backupDir,
  'src/page/ProgressClaimManagement.jsx',
);

fs.mkdirSync(
  path.dirname(backupPath),
  { recursive: true },
);
fs.copyFileSync(
  TARGET,
  backupPath,
);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);


source = replaceOnce(
  source,
  "import AddRoundedIcon from '@mui/icons-material/AddRounded';",
  "import AddRoundedIcon from '@mui/icons-material/AddRounded';\nimport DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';",
  "삭제 아이콘 import",
);

source = replaceOnce(
  source,
  "{ key: 'classification', label: '타입·공구', width: 88, min: 72, max: 180, align: 'left' },",
  "{ key: 'classification', label: '구분', width: 88, min: 72, max: 180, align: 'left' },",
  "메인 표 구분 헤더",
);

source = replaceOnce(
  source,
  "    const rawClassification =\n      readText(row, 2) || '미분류';",
  "    const classificationInput =\n      readText(row, 2);\n    const rawClassification =\n      classificationInput || '미분류';",
  "표준양식 구분 원문 보존",
);

source = replaceOnce(
  source,
  "    const validationErrors = [];\n\n    if (currentQuantity < 0) {",
  "    const validationErrors = [];\n\n    /*\n      B열(구분)을 비워둔 채 품명만 입력하면 이전에는 조용히 '미분류'로\n      저장되어 원인을 찾기 어려웠습니다.\n      실제 미분류 품목은 B열에 '미분류'라고 직접 입력하면 정상 저장됩니다.\n    */\n    if (!classificationInput) {\n      validationErrors.push('구분 미입력');\n    }\n\n    if (currentQuantity < 0) {",
  "구분 미입력 검산",
);

source = replaceOnce(
  source,
  "  const [statusChanging, setStatusChanging] = useState(false);\n  const [message, setMessage] = useState(null);",
  "  const [statusChanging, setStatusChanging] = useState(false);\n  const [deletingClaimId, setDeletingClaimId] = useState(null);\n  const [message, setMessage] = useState(null);",
  "삭제 진행 state",
);

source = replaceOnce(
  source,
  "  const isClaimLocked = activeClaimStatus === 'completed';\n\n  const loadClaimList = useCallback(async () => {",
  "  const isClaimLocked = activeClaimStatus === 'completed';\n  const latestRegisteredClaimNo = useMemo(\n    () =>\n      claims.reduce(\n        (latest, claim) =>\n          Math.max(\n            latest,\n            Number(claim?.claim_no || 0),\n          ),\n        0,\n      ),\n    [claims],\n  );\n\n  const loadClaimList = useCallback(async () => {",
  "최근 회차 계산",
);

source = replaceOnce(
  source,
  "      const parsedErrorCount = nextItems.filter(\n        (item) => item.validation_errors.length > 0,\n      ).length;\n      setMessage({\n        severity: parsedErrorCount > 0 || Boolean(inheritanceWarning) ? 'warning' : 'success',\n        text:\n          `${file.name}에서 직접비 ${nextItems.length.toLocaleString()}개 품목을 읽었습니다. 간접비는 제외했습니다.` +\n          inheritanceSummary +\n          inheritanceWarning +\n          (parsedErrorCount > 0\n            ? ` 검산 오류 ${parsedErrorCount.toLocaleString()}개 행은 저장에서 제외됩니다.`\n            : ''),\n      });",
  "      const parsedErrorCount = nextItems.filter(\n        (item) => item.validation_errors.length > 0,\n      ).length;\n      const missingClassificationCount = nextItems.filter(\n        (item) =>\n          (item.validation_errors || []).includes(\n            '구분 미입력',\n          ),\n      ).length;\n      setMessage({\n        severity: parsedErrorCount > 0 || Boolean(inheritanceWarning) ? 'warning' : 'success',\n        text:\n          `${file.name}에서 직접비 ${nextItems.length.toLocaleString()}개 품목을 읽었습니다. 간접비는 제외했습니다.` +\n          inheritanceSummary +\n          inheritanceWarning +\n          (missingClassificationCount > 0\n            ? ` 구분(B열) 미입력 ${missingClassificationCount.toLocaleString()}건은 화면에 미분류로 표시되지만 저장에서 제외됩니다. 실제 미분류 품목은 B열에 \"미분류\"라고 직접 입력해주세요.`\n            : '') +\n          (parsedErrorCount > 0\n            ? ` 검산 오류 ${parsedErrorCount.toLocaleString()}개 행은 저장에서 제외됩니다.`\n            : ''),\n      });",
  "구분 미입력 업로드 안내",
);

source = replaceOnce(
  source,
  "  const handleLoadClaim = async (claimId) => {",
  "  const handleDeleteClaim = async (event, claim) => {\n    event?.stopPropagation?.();\n\n    if (!claim?.id) return;\n\n    const targetClaimNo = Number(\n      claim.claim_no || 0,\n    );\n\n    if (\n      targetClaimNo !==\n      latestRegisteredClaimNo\n    ) {\n      setErrorMessage(\n        `누계 연결 보호를 위해 가장 최근 회차부터 삭제해야 합니다. 현재 최근 회차는 ${latestRegisteredClaimNo}회차입니다.`,\n      );\n      return;\n    }\n\n    if (\n      !window.confirm(\n        `${projectName} ${targetClaimNo}회차 등록자료를 삭제하시겠습니까?\\n\\n- 해당 회차의 기성 품목/연결자료가 삭제됩니다.\\n- 계약버전과 계약품목 원본은 보존됩니다.\\n- 삭제 후에는 되돌릴 수 없습니다.`,\n      )\n    ) {\n      return;\n    }\n\n    setDeletingClaimId(claim.id);\n    setMessage(null);\n    setErrorMessage('');\n\n    try {\n      const { data, error } =\n        await supabase.rpc(\n          'admin_delete_progress_claim_v1',\n          {\n            p_claim_id: String(\n              claim.id,\n            ),\n          },\n        );\n\n      if (error) throw error;\n\n      /*\n        일부 과거 DB에서는 임시저장 테이블명이 다를 수 있으므로\n        기존 RPC도 한 번 더 호출해 잔여 draft를 안전하게 정리합니다.\n      */\n      try {\n        const {\n          error: draftDeleteError,\n        } = await supabase.rpc(\n          'delete_progress_claim_work_draft',\n          {\n            p_project_name:\n              projectName,\n            p_claim_no:\n              targetClaimNo,\n          },\n        );\n\n        if (\n          draftDeleteError &&\n          !String(\n            draftDeleteError.message ||\n              '',\n          ).includes(\n            'delete_progress_claim_work_draft',\n          )\n        ) {\n          console.warn(\n            '기성 회차 삭제 후 임시저장 정리 오류:',\n            draftDeleteError,\n          );\n        }\n      } catch (draftDeleteError) {\n        console.warn(\n          '기성 회차 삭제 후 임시저장 정리 예외:',\n          draftDeleteError,\n        );\n      }\n\n      const refreshedClaims =\n        await loadClaimList();\n\n      if (\n        activeClaimId === claim.id\n      ) {\n        const nextDefaults =\n          getNextClaimDefaults(\n            refreshedClaims,\n          );\n\n        setActiveClaimId(null);\n        setActiveClaimStatus(\n          'draft',\n        );\n        setHasUnsavedChanges(\n          false,\n        );\n        setClaimNo(\n          nextDefaults.claimNo,\n        );\n        setBaseMonth(\n          nextDefaults.baseMonth,\n        );\n        setContractVersionLabel(\n          nextDefaults.contractVersionLabel,\n        );\n        setSourceFileName('');\n        setSourceProjectLabel('');\n        setItems([]);\n        setSelectedKeys(new Set());\n        setUnmappedSelectedKeys(\n          new Set(),\n        );\n        setKeyword('');\n        setMainTypeFilter('전체');\n        setOptionFilter('전체');\n        setSummaryView('contract');\n        setApplySameItem(false);\n        setOnlyUnmapped(false);\n      }\n\n      setMessage({\n        severity: 'success',\n        text:\n          `${data?.claim_no || targetClaimNo}회차 등록 기성자료를 삭제했습니다. 계약버전/계약품목 원본은 그대로 보존됩니다.`,\n      });\n    } catch (error) {\n      console.error(\n        '등록 기성 회차 삭제 오류:',\n        error,\n      );\n\n      const rawMessage =\n        String(\n          error?.message || '',\n        );\n\n      setErrorMessage(\n        rawMessage.includes(\n          'admin_delete_progress_claim_v1',\n        )\n          ? '기성 회차 삭제용 Supabase SQL이 아직 적용되지 않았습니다. v52.48.5.44.7.3 SQL을 먼저 실행해주세요.'\n          : `기성 회차를 삭제하지 못했습니다: ${rawMessage || '알 수 없는 오류'}`,\n      );\n    } finally {\n      setDeletingClaimId(null);\n    }\n  };\n\n  const handleLoadClaim = async (claimId) => {",
  "등록 회차 삭제 handler",
);

source = replaceOnce(
  source,
  "            <Table stickyHeader size=\"small\" sx={{ minWidth: 1240 }}>",
  "            <Table stickyHeader size=\"small\" sx={{ minWidth: 1320 }}>",
  "등록 회차 표 폭",
);

source = replaceOnce(
  source,
  "                    '최종 수정일',\n                    '상태',\n                  ].map((label) => (",
  "                    '최종 수정일',\n                    '상태',\n                    '관리',\n                  ].map((label) => (",
  "등록 회차 관리 열 헤더",
);

source = replaceOnce(
  source,
  "                      colSpan={12}",
  "                      colSpan={13}",
  "빈 목록 colspan",
);

source = replaceOnce(
  source,
  "                        <TableCell sx={bodyCellSx}>\n                          <Chip\n                            size=\"small\"\n                            label={\n                              claim.status === 'completed' ? '작성완료' : '작성중'\n                            }\n                            color={\n                              claim.status === 'completed' ? 'success' : 'warning'\n                            }\n                            variant=\"outlined\"\n                            sx={{ height: 21, fontSize: '0.59rem' }}\n                          />\n                        </TableCell>\n                      </TableRow>",
  "                        <TableCell sx={bodyCellSx}>\n                          <Chip\n                            size=\"small\"\n                            label={\n                              claim.status === 'completed' ? '작성완료' : '작성중'\n                            }\n                            color={\n                              claim.status === 'completed' ? 'success' : 'warning'\n                            }\n                            variant=\"outlined\"\n                            sx={{ height: 21, fontSize: '0.59rem' }}\n                          />\n                        </TableCell>\n                        <TableCell\n                          align=\"center\"\n                          sx={{\n                            ...bodyCellSx,\n                            px: 0.45,\n                            minWidth: 78,\n                          }}\n                        >\n                          <Button\n                            size=\"small\"\n                            color=\"error\"\n                            variant=\"outlined\"\n                            startIcon={\n                              deletingClaimId === claim.id ? (\n                                <CircularProgress\n                                  size={12}\n                                  color=\"inherit\"\n                                />\n                              ) : (\n                                <DeleteOutlineRoundedIcon\n                                  sx={{\n                                    fontSize:\n                                      '15px !important',\n                                  }}\n                                />\n                              )\n                            }\n                            disabled={\n                              Boolean(\n                                deletingClaimId,\n                              ) ||\n                              Number(\n                                claim.claim_no ||\n                                  0,\n                              ) !==\n                                latestRegisteredClaimNo\n                            }\n                            onClick={(event) =>\n                              handleDeleteClaim(\n                                event,\n                                claim,\n                              )\n                            }\n                            title={\n                              Number(\n                                claim.claim_no ||\n                                  0,\n                              ) ===\n                              latestRegisteredClaimNo\n                                ? `${claim.claim_no}회차 삭제`\n                                : '누계 보호를 위해 최근 회차부터 삭제할 수 있습니다.'\n                            }\n                            sx={{\n                              minWidth: 62,\n                              height: 25,\n                              px: 0.7,\n                              fontSize:\n                                '0.61rem',\n                              whiteSpace:\n                                'nowrap',\n                            }}\n                          >\n                            삭제\n                          </Button>\n                        </TableCell>\n                      </TableRow>",
  "등록 회차 삭제 버튼",
);

source = replaceOnce(
  source,
  "                    타입·공구\n                  </TableCell>",
  "                    구분\n                  </TableCell>",
  "미연결 팝업 구분 헤더",
);

source = replaceOnce(
  source,
  "              타입 구분\n            </Typography>",
  "              구분\n            </Typography>",
  "미연결 필터 구분 제목",
);

fs.writeFileSync(
  TARGET,
  source,
  'utf8',
);

const sqlSource = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.7.3',
  'supabase',
  'v52.48.5.44.7.3_progress_claim_delete.sql',
);
const sqlTarget = path.resolve(
  process.cwd(),
  'supabase',
  'v52.48.5.44.7.3_progress_claim_delete.sql',
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
console.log('- 추가: supabase/v52.48.5.44.7.3_progress_claim_delete.sql');
console.log('- 등록된 기성 회차 목록에 삭제 버튼 추가');
console.log('- 최고관리자 + 가장 최근 회차부터 삭제');
console.log('- 계약버전/계약품목 원본은 삭제하지 않음');
console.log('- Excel B열 구분 미입력은 조용히 저장하지 않고 "구분 미입력" 검산오류 표시');
console.log('- 실제 미분류는 B열에 "미분류"라고 입력하면 정상 처리');
console.log('- 화면/미연결 팝업의 타입·공구 명칭을 구분으로 통일');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
