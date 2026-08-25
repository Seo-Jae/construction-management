const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);

const EXPECTED = '48135f94b3401f4c0cb8f3ca614322b7f60f3c50';
const EXPORT_DIALOG = "\n      <Dialog\n        open={exportCheckOpen}\n        onClose={() => {\n          if (!exportCheckLoading) {\n            setExportCheckOpen(false);\n          }\n        }}\n        fullWidth\n        maxWidth=\"md\"\n      >\n        <DialogTitle sx={{ fontWeight: 900 }}>\n          노임 Excel 생성 준비\n        </DialogTitle>\n\n        <DialogContent dividers>\n          {exportCheckLoading ? (\n            <Box\n              sx={{\n                py: 8,\n                display: 'flex',\n                alignItems: 'center',\n                justifyContent: 'center',\n              }}\n            >\n              <CircularProgress size={28} />\n            </Box>\n          ) : exportCheck ? (\n            <Stack spacing={1.2}>\n              <Alert\n                severity={\n                  exportCheck.ready\n                    ? 'success'\n                    : 'warning'\n                }\n              >\n                {exportCheck.message ||\n                  (exportCheck.ready\n                    ? '기본 Excel 생성 데이터가 준비되었습니다.'\n                    : '보완이 필요한 항목이 있습니다.')}\n              </Alert>\n\n              <Box\n                sx={{\n                  display: 'grid',\n                  gridTemplateColumns: {\n                    xs: '1fr 1fr',\n                    md: 'repeat(4, minmax(0, 1fr))',\n                  },\n                  gap: 0.8,\n                }}\n              >\n                {[\n                  ['전체 근로자', exportCheck.worker_count || 0],\n                  ['준비 완료', exportCheck.ready_worker_count || 0],\n                  ['보완 필요', exportCheck.issue_worker_count || 0],\n                  ['누락 항목', exportCheck.issue_count || 0],\n                ].map(([label, value]) => (\n                  <Paper\n                    key={label}\n                    variant=\"outlined\"\n                    sx={{\n                      p: 1,\n                      textAlign: 'center',\n                      borderColor: '#cbd5e1',\n                    }}\n                  >\n                    <Typography\n                      sx={{\n                        color: '#64748b',\n                        fontSize: '0.66rem',\n                        fontWeight: 800,\n                      }}\n                    >\n                      {label}\n                    </Typography>\n                    <Typography\n                      sx={{\n                        mt: 0.25,\n                        color: '#0f172a',\n                        fontSize: '1rem',\n                        fontWeight: 900,\n                      }}\n                    >\n                      {Number(value).toLocaleString('ko-KR')}\n                    </Typography>\n                  </Paper>\n                ))}\n              </Box>\n\n              {Array.isArray(exportCheck.workers) &&\n              exportCheck.workers.length > 0 ? (\n                <TableContainer\n                  sx={{\n                    maxHeight: 360,\n                    border: '1px solid #e2e8f0',\n                    borderRadius: 1,\n                  }}\n                >\n                  <Table size=\"small\" stickyHeader>\n                    <TableHead>\n                      <TableRow>\n                        <TableCell\n                          align=\"center\"\n                          sx={{ width: 60, fontWeight: 900 }}\n                        >\n                          순번\n                        </TableCell>\n                        <TableCell sx={{ width: 120, fontWeight: 900 }}>\n                          성명\n                        </TableCell>\n                        <TableCell\n                          align=\"center\"\n                          sx={{ width: 120, fontWeight: 900 }}\n                        >\n                          생년월일\n                        </TableCell>\n                        <TableCell\n                          align=\"center\"\n                          sx={{ width: 120, fontWeight: 900 }}\n                        >\n                          휴대폰\n                        </TableCell>\n                        <TableCell sx={{ fontWeight: 900 }}>\n                          보완 필요\n                        </TableCell>\n                      </TableRow>\n                    </TableHead>\n                    <TableBody>\n                      {exportCheck.workers.map((worker) => (\n                        <TableRow\n                          key={\n                            worker.worker_master_id ||\n                            `${worker.sort_order}-${worker.name_ko}`\n                          }\n                          hover\n                        >\n                          <TableCell align=\"center\">\n                            {worker.sort_order || '-'}\n                          </TableCell>\n                          <TableCell>\n                            {worker.name_ko || '-'}\n                          </TableCell>\n                          <TableCell align=\"center\">\n                            {worker.birth_date || '-'}\n                          </TableCell>\n                          <TableCell align=\"center\">\n                            {worker.phone_masked || '-'}\n                          </TableCell>\n                          <TableCell>\n                            <Typography\n                              sx={{\n                                color: '#b45309',\n                                fontSize: '0.7rem',\n                                fontWeight: 800,\n                              }}\n                            >\n                              {formatExportMissingFields(\n                                worker.missing_fields,\n                              )}\n                            </Typography>\n                          </TableCell>\n                        </TableRow>\n                      ))}\n                    </TableBody>\n                  </Table>\n                </TableContainer>\n              ) : null}\n\n              {exportCheck.ready ? (\n                <Alert severity=\"info\">\n                  기본 데이터 준비는 완료되었습니다. 실제 회사 노임 Excel\n                  원본을 연결하면 다음 단계에서 시트·셀·수식 매핑과\n                  SMS 인증 다운로드를 붙일 수 있습니다.\n                </Alert>\n              ) : (\n                <Typography\n                  sx={{\n                    color: '#64748b',\n                    fontSize: '0.68rem',\n                    lineHeight: 1.55,\n                  }}\n                >\n                  주민번호·계좌번호 같은 원문은 이 검사에서 복호화하거나\n                  화면으로 전송하지 않습니다. 등록 여부와 노임 입력\n                  상태만 검사합니다.\n                </Typography>\n              )}\n            </Stack>\n          ) : (\n            <Typography\n              sx={{\n                py: 4,\n                textAlign: 'center',\n                color: '#94a3b8',\n                fontSize: '0.75rem',\n              }}\n            >\n              확인 결과가 없습니다.\n            </Typography>\n          )}\n        </DialogContent>\n\n        <DialogActions>\n          <Button\n            onClick={() => setExportCheckOpen(false)}\n            disabled={exportCheckLoading}\n          >\n            닫기\n          </Button>\n        </DialogActions>\n      </Dialog>\n\n";

function fail(message) {
  console.error('\n[v52.37 적용 중단]');
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

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

const currentBuffer = fs.readFileSync(TARGET);
let source = currentBuffer.toString('utf8');

if (
  source.includes('labor_monthly_export_readiness_v52_37') &&
  source.includes('노임 Excel 생성 준비')
) {
  console.log('[v52.37] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actual = blobSha(currentBuffer);

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.36 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

source = replaceOnce(
  source,
  "  '용역',\n];\n\nconst getKoreaYearMonth = () => {",
  `  '용역',
];

const EXPORT_FIELD_LABELS = Object.freeze({
  identity: '주민/외국인번호',
  phone: '전체 연락처',
  address: '주소',
  account: '계좌번호',
  bank: '은행',
  trade: '공종',
  daily_wage: '일급',
  work_entries: '출역',
});

const formatExportMissingFields = (fields) => {
  const items = Array.isArray(fields) ? fields : [];

  if (items.length === 0) {
    return '-';
  }

  return items
    .map((field) => EXPORT_FIELD_LABELS[field] || field)
    .join(' · ');
};

const getKoreaYearMonth = () => {`,
  'Excel 사전검증 라벨 함수',
);

source = replaceOnce(
  source,
  `  const [
    payrollEditor,
    setPayrollEditor,
  ] = useState(null);

  const selectedSet = useMemo(`,
  `  const [
    payrollEditor,
    setPayrollEditor,
  ] = useState(null);

  const [
    exportCheckOpen,
    setExportCheckOpen,
  ] = useState(false);
  const [
    exportCheckLoading,
    setExportCheckLoading,
  ] = useState(false);
  const [
    exportCheck,
    setExportCheck,
  ] = useState(null);

  const selectedSet = useMemo(`,
  'Excel 사전검증 상태',
);

source = replaceOnce(
  source,
  "\n  return (\n    <Box",
  `
  const runExportReadiness = async () => {
    if (!projectName || !yearMonth) {
      setMessage({
        severity: 'warning',
        text: '현장과 작성월을 확인해주세요.',
      });
      return;
    }

    if (dirty) {
      setMessage({
        severity: 'warning',
        text: 'Excel 생성 준비 확인 전에 현재 변경사항을 먼저 저장해주세요.',
      });
      return;
    }

    if (rows.length === 0) {
      setMessage({
        severity: 'warning',
        text: 'Excel 생성 준비를 확인할 근로자 명단이 없습니다.',
      });
      return;
    }

    setExportCheckOpen(true);
    setExportCheckLoading(true);
    setExportCheck(null);

    const { data, error } = await supabase.rpc(
      'labor_monthly_export_readiness_v52_37',
      {
        p_project_name: projectName,
        p_month_key: yearMonth,
      },
    );

    setExportCheckLoading(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '노임 Excel 생성 준비상태를 확인하지 못했습니다.',
      });
      setExportCheckOpen(false);
      return;
    }

    setExportCheck(data || null);
  };

  return (
    <Box`,
  'Excel 사전검증 실행 함수',
);

source = replaceOnce(
  source,
  `            저장
          </Button>
        </Stack>`,
  `            저장
          </Button>

          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              void runExportReadiness()
            }
            disabled={
              rosterSaving ||
              rosterLoading ||
              exportCheckLoading ||
              !projectName ||
              rows.length === 0
            }
            sx={{
              minWidth: 126,
              fontWeight: 900,
            }}
          >
            Excel 생성 준비
          </Button>
        </Stack>`,
  'Excel 생성 준비 버튼',
);

source = replaceOnce(
  source,
  "      <Snackbar\n        open={Boolean(message)}",
  EXPORT_DIALOG + "      <Snackbar\n        open={Boolean(message)}",
  'Excel 사전검증 결과 Dialog',
);

const requiredMarkers = [
  'labor_monthly_export_readiness_v52_37',
  '노임 Excel 생성 준비',
  'formatExportMissingFields',
  'Excel 생성 준비 확인 전에 현재 변경사항을 먼저 저장해주세요.',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backupTarget = path.join(
  ROOT,
  `backup_v52.37_${stamp}`,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

fs.mkdirSync(
  path.dirname(backupTarget),
  { recursive: true },
);

fs.copyFileSync(TARGET, backupTarget);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.37 적용 완료]');
console.log('- Excel 생성 준비 버튼 추가');
console.log('- 개인정보 등록여부/출역/일급 사전검증');
console.log('- 민감 개인정보 원문 미복호화/미표시');
console.log('- 근로자별 보완 필요 항목 표시');
console.log('- 실제 Excel 생성/다운로드는 아직 미적용');
console.log(`- 백업: ${backupTarget}`);
console.log('');
console.log('중요: Supabase v52.37 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
