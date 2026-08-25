const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceManagement.jsx');
const EXPECTED = '38609f32c1a18316529ecc7a56be83870bb0145e';

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

function fail(message) {
  console.error('\n[v52.31 적용 중단]');
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (
  source.includes("const [auditFilter, setAuditFilter] = useState('전체');") &&
  source.includes('filteredAuditRows.map((row) =>') &&
  source.includes('변경이력 처리내용 필터')
) {
  console.log('[v52.31] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actual = blobSha(Buffer.from(source, 'utf8'));
if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/AttendanceManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 최신 main과 다른 상태입니다. git status를 확인해주세요.'
  );
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    fail(`${label} 적용 위치를 찾지 못했습니다.`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    fail(`${label} 적용 위치가 2개 이상이라 안전하게 중단했습니다.`);
  }
  source =
    source.slice(0, first) +
    after +
    source.slice(first + before.length);
}

replaceOnce(
`  const [dashboard, setDashboard] = useState({
    pending_workers: [],
    daily_records: [],
    device_requests: [],
    recent_audit: [],
  });
  const [loading, setLoading] = useState(true);`,
`  const [dashboard, setDashboard] = useState({
    pending_workers: [],
    daily_records: [],
    device_requests: [],
    recent_audit: [],
  });
  const [auditFilter, setAuditFilter] = useState('전체');
  const [loading, setLoading] = useState(true);`,
'변경이력 필터 상태'
);

replaceOnce(
`  useEffect(() => {
    setSelectedNoticeIds(new Set());
    setNoticeDeleteOpen(false);
  }, [projectName]);`,
`  useEffect(() => {
    setSelectedNoticeIds(new Set());
    setNoticeDeleteOpen(false);
    setAuditFilter('전체');
  }, [projectName]);`,
'현장 변경 시 필터 초기화'
);

replaceOnce(
`  const handleTabChange = (_event, value) => {
    setTab(value);
    if (value === 'qr' && canManage) void openDynamicQrWindow();
  };`,
`  const auditActionLabels = Array.from(
    new Set(
      dashboard.recent_audit
        .map((row) => String(row?.action_label || '').trim())
        .filter(Boolean),
    ),
  );

  const filteredAuditRows =
    auditFilter === '전체'
      ? dashboard.recent_audit
      : dashboard.recent_audit.filter(
          (row) =>
            String(row?.action_label || '').trim() ===
            auditFilter,
        );

  const handleTabChange = (_event, value) => {
    setTab(value);
    if (value === 'qr' && canManage) void openDynamicQrWindow();
  };`,
'변경이력 필터 목록/결과'
);

const auditBefore = `        {tab === 'audit' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 900 }}>최근 변경 이력</Typography><Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>승인·반려·기기변경·수동수정·가입내역 삭제 기록을 보존합니다.</Typography></Box><Divider />
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>일시</TableCell><TableCell>처리내용</TableCell><TableCell>대상</TableCell><TableCell>처리자</TableCell><TableCell>사유</TableCell></TableRow></TableHead><TableBody>
              {dashboard.recent_audit.map((row) => <TableRow key={row.id}><TableCell>{formatKoreaDateTime(row.created_at)}</TableCell><TableCell>{row.action_label}</TableCell><TableCell>{row.worker_name || '-'}</TableCell><TableCell>{row.actor_name || '-'}</TableCell><TableCell>{row.reason || '-'}</TableCell></TableRow>)}
              {dashboard.recent_audit.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: '#94a3b8' }}>변경 이력이 없습니다.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper>
        )}`;

const auditAfter = `        {tab === 'audit' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 900 }}>
                최근 변경 이력
              </Typography>
              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.72rem',
                }}
              >
                승인·반려·기기변경·수동수정·가입내역 삭제 기록을 보존합니다.
              </Typography>

              <Box
                aria-label="변경이력 처리내용 필터"
                sx={{
                  mt: 1.35,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.7,
                }}
              >
                {['전체', ...auditActionLabels].map(
                  (filterLabel) => {
                    const selected =
                      auditFilter === filterLabel;

                    return (
                      <Button
                        key={filterLabel}
                        type="button"
                        size="small"
                        variant={
                          selected
                            ? 'contained'
                            : 'outlined'
                        }
                        onClick={() =>
                          setAuditFilter(filterLabel)
                        }
                        sx={{
                          minWidth: 0,
                          px: 1.25,
                          py: 0.45,
                          borderRadius: 5,
                          fontSize: '0.72rem',
                          fontWeight: selected ? 900 : 700,
                          boxShadow: 'none',
                          textTransform: 'none',
                        }}
                      >
                        {filterLabel}
                      </Button>
                    );
                  },
                )}
              </Box>
            </Box>

            <Divider />

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>일시</TableCell>
                    <TableCell>처리내용</TableCell>
                    <TableCell>대상</TableCell>
                    <TableCell>처리자</TableCell>
                    <TableCell>사유</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAuditRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {formatKoreaDateTime(
                          row.created_at,
                        )}
                      </TableCell>
                      <TableCell>
                        {row.action_label}
                      </TableCell>
                      <TableCell>
                        {row.worker_name || '-'}
                      </TableCell>
                      <TableCell>
                        {row.actor_name || '-'}
                      </TableCell>
                      <TableCell>
                        {row.reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredAuditRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        align="center"
                        sx={{
                          py: 8,
                          color: '#94a3b8',
                        }}
                      >
                        {dashboard.recent_audit.length === 0
                          ? '변경 이력이 없습니다.'
                          : '선택한 처리내용의 변경 이력이 없습니다.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}`;

replaceOnce(
  auditBefore,
  auditAfter,
  '변경이력 버튼 필터 UI'
);

const required = [
  "const [auditFilter, setAuditFilter] = useState('전체');",
  'const auditActionLabels = Array.from(',
  'const filteredAuditRows =',
  'aria-label="변경이력 처리내용 필터"',
  "['전체', ...auditActionLabels].map(",
  'filteredAuditRows.map((row) =>',
  "setAuditFilter('전체');",
];

for (const marker of required) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.31_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceManagement.jsx'
);

fs.mkdirSync(path.dirname(backupTarget), {
  recursive: true,
});
fs.copyFileSync(TARGET, backupTarget);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.31 적용 완료]');
console.log('- 변경 이력 처리내용 버튼형 필터 추가');
console.log('- 전체 버튼 기본 선택');
console.log('- 실제 action_label 기준 필터 버튼 자동 생성');
console.log('- 단일 선택 방식');
console.log('- 현장 변경 시 전체 필터로 자동 초기화');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${backupDir}`);
console.log('');
console.log('다음 명령: npm run build');
