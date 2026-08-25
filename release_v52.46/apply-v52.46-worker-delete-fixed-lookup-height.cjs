const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

const WORKER_TARGET = path.join(
  ROOT,
  'src',
  'page',
  'WorkerMasterManagement.jsx',
);

const MONTHLY_TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

const WORKER_EXPECTED = 'f02f4aa030f0f168154ae1ec1197179f3363c5ed';
const MONTHLY_EXPECTED = '6b966c14af5f73faba0aa4cee0a3dd3a43a9fcf6';

function fail(message) {
  console.error('\n[v52.46 적용 중단]');
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

function replaceUnique(source, oldText, newText, label) {
  const first = source.indexOf(oldText);

  if (first < 0) {
    fail(`${label}: 기준 문자열을 찾지 못했습니다.`);
  }

  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    fail(`${label}: 기준 문자열이 2개 이상 발견되었습니다.`);
  }

  return source.replace(oldText, newText);
}

for (const [target, expected, label] of [
  [WORKER_TARGET, WORKER_EXPECTED, 'WorkerMasterManagement.jsx'],
  [MONTHLY_TARGET, MONTHLY_EXPECTED, 'MonthlyLaborManagement.jsx'],
]) {
  if (!fs.existsSync(target)) {
    fail(`대상 파일을 찾을 수 없습니다: ${target}`);
  }

  const buffer = fs.readFileSync(target);
  const text = buffer.toString('utf8');

  if (
    label === 'WorkerMasterManagement.jsx' &&
    text.includes('labor_worker_master_delete_v52_46') &&
    text.includes('DeleteOutlineRoundedIcon')
  ) {
    continue;
  }

  if (
    label === 'MonthlyLaborManagement.jsx' &&
    text.includes('LOOKUP_VISIBLE_ROW_COUNT') &&
    text.includes('LOOKUP_LIST_HEIGHT')
  ) {
    continue;
  }

  const actual = blobSha(buffer);
  if (actual !== expected) {
    fail(
      `${label}이 최신 main 기준과 다릅니다.\n` +
      `예상 Git blob SHA: ${expected}\n` +
      `현재 Git blob SHA: ${actual}\n\n` +
      'git status를 확인한 뒤 다시 시도해주세요.',
    );
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_v52.46_${stamp}`);

// =========================================================
// 1) 근로자 정보관리: 수정 옆 삭제 아이콘 + 2차 확인 + 서버 삭제
// =========================================================
let workerText = fs.readFileSync(WORKER_TARGET, 'utf8');

if (!workerText.includes('labor_worker_master_delete_v52_46')) {
  workerText = replaceUnique(
    workerText,
    `import EditRoundedIcon from '@mui/icons-material/EditRounded';\nimport RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';`,
    `import EditRoundedIcon from '@mui/icons-material/EditRounded';\nimport DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';\nimport RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';`,
    '삭제 아이콘 import',
  );

  workerText = replaceUnique(
    workerText,
    `  const [saving, setSaving] =\n    useState(false);\n  const [message, setMessage] =\n    useState(null);`,
    `  const [saving, setSaving] =\n    useState(false);\n  const [deleteTarget, setDeleteTarget] =\n    useState(null);\n  const [deleting, setDeleting] =\n    useState(false);\n  const [message, setMessage] =\n    useState(null);`,
    '삭제 상태 추가',
  );

  const saveEnd = `    await loadWorkers({\n      silent: true,\n      searchQuery: query,\n    });\n  };\n\n  return (`;

  const deleteFunction = `    await loadWorkers({\n      silent: true,\n      searchQuery: query,\n    });\n  };\n\n  const deleteWorker = async () => {\n    if (\n      !canManage ||\n      deleting ||\n      !deleteTarget?.id\n    ) {\n      return;\n    }\n\n    setDeleting(true);\n\n    const { data, error } =\n      await supabase.rpc(\n        'labor_worker_master_delete_v52_46',\n        {\n          p_worker_id:\n            deleteTarget.id,\n        },\n      );\n\n    setDeleting(false);\n\n    if (error) {\n      setMessage({\n        severity: 'error',\n        text:\n          error.message ||\n          '근로자 삭제에 실패했습니다.',\n      });\n      return;\n    }\n\n    const deletedName =\n      data?.worker_name ||\n      deleteTarget.nameKo ||\n      '근로자';\n\n    setDeleteTarget(null);\n    setMessage({\n      severity: 'success',\n      text: deletedName + ' 근로자를 삭제했습니다.',\n    });\n\n    await loadWorkers({\n      silent: true,\n      searchQuery: query,\n    });\n  };\n\n  return (`;

  workerText = replaceUnique(
    workerText,
    saveEnd,
    deleteFunction,
    '삭제 RPC 함수 추가',
  );

  workerText = replaceUnique(
    workerText,
    `                <TableCell
                  align="center"
                  sx={{
                    width: 74,
                    fontWeight: 900,
                  }}
                >
                  관리
                </TableCell>`,
    `                <TableCell
                  align="center"
                  sx={{
                    width: 90,
                    minWidth: 90,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  관리
                </TableCell>`,
    '관리열 헤더 폭 조정',
  );

  const manageOld = `                      <TableCell\n                        align=\"center\"\n                        sx={{ width: 54, minWidth: 54, whiteSpace: 'nowrap' }}\n                      >\n                        <Tooltip title=\"수정\" arrow>\n                          <span>\n                            <IconButton\n                              size=\"small\"\n                              aria-label=\"근로자 정보 수정\"\n                              onClick={() => openEdit(worker)}\n                              disabled={!canManage}\n                              color=\"primary\"\n                            >\n                              <EditRoundedIcon fontSize=\"small\" />\n                            </IconButton>\n                          </span>\n                        </Tooltip>\n                      </TableCell>`;

  const manageNew = `                      <TableCell\n                        align=\"center\"\n                        sx={{\n                          width: 86,\n                          minWidth: 86,\n                          whiteSpace: 'nowrap',\n                          px: 0.5,\n                        }}\n                      >\n                        <Tooltip title=\"수정\" arrow>\n                          <span>\n                            <IconButton\n                              size=\"small\"\n                              aria-label=\"근로자 정보 수정\"\n                              onClick={() => openEdit(worker)}\n                              disabled={!canManage}\n                              color=\"primary\"\n                            >\n                              <EditRoundedIcon fontSize=\"small\" />\n                            </IconButton>\n                          </span>\n                        </Tooltip>\n\n                        <Tooltip title=\"삭제\" arrow>\n                          <span>\n                            <IconButton\n                              size=\"small\"\n                              aria-label=\"근로자 삭제\"\n                              onClick={() => setDeleteTarget(worker)}\n                              disabled={!canManage}\n                              color=\"error\"\n                            >\n                              <DeleteOutlineRoundedIcon fontSize=\"small\" />\n                            </IconButton>\n                          </span>\n                        </Tooltip>\n                      </TableCell>`;

  workerText = replaceUnique(
    workerText,
    manageOld,
    manageNew,
    '관리열 삭제아이콘 추가',
  );

  const snackbarMarker = `      <Snackbar\n        open={Boolean(message)}`;

  const deleteDialog = `      <Dialog\n        open={Boolean(deleteTarget)}\n        onClose={() => {\n          if (!deleting) {\n            setDeleteTarget(null);\n          }\n        }}\n        fullWidth\n        maxWidth=\"xs\"\n      >\n        <DialogTitle sx={{ fontWeight: 900 }}>\n          근로자 삭제\n        </DialogTitle>\n\n        <DialogContent dividers>\n          <Alert severity=\"warning\" sx={{ mb: 1.2 }}>\n            삭제된 근로자 정보는 복구할 수 없습니다.\n          </Alert>\n\n          <Typography\n            sx={{\n              color: '#0f172a',\n              fontSize: '0.86rem',\n              fontWeight: 900,\n            }}\n          >\n            {deleteTarget?.nameKo || '선택한 근로자'}를 정말로 삭제하시겠습니까?\n          </Typography>\n\n          <Typography\n            sx={{\n              mt: 0.75,\n              color: '#64748b',\n              fontSize: '0.7rem',\n              lineHeight: 1.55,\n            }}\n          >\n            월별 노임 명단에 사용된 이력이 있는 근로자는 이력 보호를 위해 삭제가 차단됩니다.\n          </Typography>\n        </DialogContent>\n\n        <DialogActions>\n          <Button\n            onClick={() => setDeleteTarget(null)}\n            disabled={deleting}\n          >\n            아니오\n          </Button>\n\n          <Button\n            variant=\"contained\"\n            color=\"error\"\n            onClick={() => void deleteWorker()}\n            disabled={deleting}\n            sx={{ boxShadow: 'none' }}\n          >\n            {deleting ? '삭제 중...' : '예, 삭제'}\n          </Button>\n        </DialogActions>\n      </Dialog>\n\n${snackbarMarker}`;

  workerText = replaceUnique(
    workerText,
    snackbarMarker,
    deleteDialog,
    '삭제 확인 Dialog 추가',
  );

  const backupPath = path.join(
    backupRoot,
    'src',
    'page',
    'WorkerMasterManagement.jsx',
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(WORKER_TARGET, backupPath);
  fs.writeFileSync(WORKER_TARGET, workerText, 'utf8');
  console.log('- 근로자 정보관리: 수정 옆 삭제 아이콘 + 확인창 적용');
} else {
  console.log('- 근로자 정보관리 삭제 기능: 이미 적용됨');
}

// =========================================================
// 2) 근로자 조회: 항상 10명 높이, 11명부터 내부스크롤
// =========================================================
let monthlyText = fs.readFileSync(MONTHLY_TARGET, 'utf8');

if (!monthlyText.includes('LOOKUP_VISIBLE_ROW_COUNT')) {
  monthlyText = replaceUnique(
    monthlyText,
    `const BIRTH_MONTH_OPTIONS =\n  Array.from(\n    { length: 12 },\n    (_unused, index) =>\n      String(index + 1).padStart(\n        2,\n        '0',\n      ),\n  );`,
    `const BIRTH_MONTH_OPTIONS =\n  Array.from(\n    { length: 12 },\n    (_unused, index) =>\n      String(index + 1).padStart(\n        2,\n        '0',\n      ),\n  );\n\nconst LOOKUP_VISIBLE_ROW_COUNT = 10;\nconst LOOKUP_HEADER_HEIGHT = 38;\nconst LOOKUP_ROW_HEIGHT = 40;\nconst LOOKUP_LIST_HEIGHT =\n  LOOKUP_HEADER_HEIGHT +\n  LOOKUP_VISIBLE_ROW_COUNT *\n    LOOKUP_ROW_HEIGHT;`,
    '조회목록 고정높이 상수 추가',
  );

  monthlyText = replaceUnique(
    monthlyText,
    `          <Paper\n            variant=\"outlined\"\n            sx={{\n              mt: 0.6,\n              maxHeight: 410,\n              overflow: 'auto',\n              borderColor:\n                '#cbd5e1',\n              boxShadow: 'none',\n            }}\n          >`,
    `          <Paper\n            variant=\"outlined\"\n            sx={{\n              mt: 0.6,\n              height: LOOKUP_LIST_HEIGHT,\n              minHeight: LOOKUP_LIST_HEIGHT,\n              maxHeight: LOOKUP_LIST_HEIGHT,\n              overflowY: 'auto',\n              overflowX: 'auto',\n              borderColor:\n                '#cbd5e1',\n              boxShadow: 'none',\n            }}\n          >`,
    '조회목록 10명 고정높이 적용',
  );

  monthlyText = replaceUnique(
    monthlyText,
    `                  <TableRow>\n                    <TableCell\n                      sx={{\n                        width: 150,\n                        fontWeight: 900,\n                      }}\n                    >\n                      성명`,
    `                  <TableRow\n                    sx={{\n                      height: LOOKUP_HEADER_HEIGHT,\n                    }}\n                  >\n                    <TableCell\n                      sx={{\n                        width: 150,\n                        fontWeight: 900,\n                      }}\n                    >\n                      성명`,
    '조회목록 헤더 높이 고정',
  );

  monthlyText = replaceUnique(
    monthlyText,
    `                          sx={{\n                            cursor:\n                              alreadyAdded\n                                ? 'default'\n                                : 'pointer',\n                            opacity:\n                              alreadyAdded\n                                ? 0.62\n                                : 1,\n                          }}\n                        >`,
    `                          sx={{\n                            height: LOOKUP_ROW_HEIGHT,\n                            cursor:\n                              alreadyAdded\n                                ? 'default'\n                                : 'pointer',\n                            opacity:\n                              alreadyAdded\n                                ? 0.62\n                                : 1,\n                            '& > td': {\n                              py: 0.45,\n                            },\n                          }}\n                        >`,
    '조회목록 행 높이 고정',
  );

  const backupPath = path.join(
    backupRoot,
    'src',
    'page',
    'MonthlyLaborManagement.jsx',
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(MONTHLY_TARGET, backupPath);
  fs.writeFileSync(MONTHLY_TARGET, monthlyText, 'utf8');
  console.log('- 근로자 조회: 10명 높이 고정 + 11명부터 내부 스크롤 적용');
} else {
  console.log('- 근로자 조회 고정높이: 이미 적용됨');
}

console.log('\n[v52.46 적용 완료]');
console.log('- 근로자 정보관리 연필 옆 빨간 삭제 쓰레기통');
console.log('- 삭제 전 정말로 삭제하시겠습니까? 2차 확인');
console.log('- 월별 명단 사용이력 근로자 서버 삭제 차단');
console.log('- 근로자 조회 목록 항상 10명 높이로 고정');
console.log('- 11명부터 목록 내부 스크롤');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('중요: Supabase v52.46 SQL을 먼저 실행해주세요.');
console.log('다음 명령: npm run build');
