const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const MANAGEMENT = path.join(ROOT, 'src', 'page', 'AttendanceManagement.jsx');
const WORKER = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

const EXPECTED = {
  [MANAGEMENT]: '4923c708a080433df9b8ba5d0d1e123ff3e66d2d',
  [WORKER]: '4b379f286b3efb100c13b610e5b0671f13706641',
};

function fail(message) {
  console.error('\n[v52.21 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, body]))
    .digest('hex');
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`${label}: 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
  return source.replace(before, after);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    fail(`${label}: 교체 구간을 찾지 못했습니다.`);
  }
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    fail(`${label}: 시작 기준 문자열이 중복되었습니다.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

for (const file of [MANAGEMENT, WORKER]) {
  if (!fs.existsSync(file)) {
    fail(`대상 파일을 찾을 수 없습니다: ${file}`);
  }
}

let management = fs.readFileSync(MANAGEMENT, 'utf8');
let worker = fs.readFileSync(WORKER, 'utf8');

const alreadyApplied =
  management.includes('attendance_manager_list_notices_v52_21') &&
  management.includes('p_sort_order: sortOrder') &&
  management.includes('label="표시 순번"') &&
  worker.includes('attendance_worker_me_v52_21') &&
  worker.includes('공지 간격') &&
  !worker.includes("join('　◆　')");

if (alreadyApplied) {
  console.log('[v52.21] 이미 프로그램 파일이 적용된 상태입니다.');
  process.exit(0);
}

for (const [file, expectedSha] of Object.entries(EXPECTED)) {
  const source = file === MANAGEMENT ? management : worker;
  const actualSha = gitBlobSha(source);
  if (actualSha !== expectedSha) {
    fail(
      `현재 파일이 확인한 최신 운영본과 다릅니다.\n` +
      `${path.relative(ROOT, file)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n` +
      '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
    );
  }
}

/* =========================================================
   AttendanceManagement.jsx
   ========================================================= */

management = replaceOnce(
  management,
`    id: '',
    content: '',
    startsOn,`,
`    id: '',
    content: '',
    sortOrder: 1,
    startsOn,`,
  '공지 draft 순번 기본값',
);

management = replaceOnce(
  management,
`supabase.rpc('attendance_manager_list_notices_v52_17', {`,
`supabase.rpc('attendance_manager_list_notices_v52_21', {`,
  '공지 목록 RPC v52.21 전환',
);

management = replaceOnce(
  management,
`  const openNewNotice = () => {
    setNoticeDraft(emptyNoticeDraft());
    setNoticeEditorOpen(true);
  };`,
`  const openNewNotice = () => {
    setNoticeDraft({
      ...emptyNoticeDraft(),
      sortOrder: notices.length + 1,
    });
    setNoticeEditorOpen(true);
  };`,
  '신규 공지 기본 순번',
);

management = replaceOnce(
  management,
`      id: notice?.id || '',
      content: notice?.content || '',
      startsOn: notice?.starts_on || getKoreaDateValue(),`,
`      id: notice?.id || '',
      content: notice?.content || '',
      sortOrder: Number(notice?.sort_order) || 1,
      startsOn: notice?.starts_on || getKoreaDateValue(),`,
  '공지 수정 순번 복원',
);

management = replaceOnce(
  management,
`    if (content.length < 2) {
      setMessage({ severity: 'warning', text: '공지내용을 2자 이상 입력해주세요.' });
      return;
    }
    if (!noticeDraft.startsOn || !noticeDraft.endsOn) {`,
`    if (content.length < 2) {
      setMessage({ severity: 'warning', text: '공지내용을 2자 이상 입력해주세요.' });
      return;
    }

    const sortOrder = Math.trunc(Number(noticeDraft.sortOrder));
    if (!Number.isFinite(sortOrder) || sortOrder < 1) {
      setMessage({ severity: 'warning', text: '표시 순번은 1 이상의 숫자로 입력해주세요.' });
      return;
    }

    if (!noticeDraft.startsOn || !noticeDraft.endsOn) {`,
  '공지 순번 유효성 검사',
);

management = replaceOnce(
  management,
`supabase.rpc('attendance_manager_save_notice_v52_17', {`,
`supabase.rpc('attendance_manager_save_notice_v52_21', {`,
  '공지 저장 RPC v52.21 전환',
);

management = replaceOnce(
  management,
`      p_content: content,
      p_starts_on: noticeDraft.startsOn,`,
`      p_content: content,
      p_sort_order: sortOrder,
      p_starts_on: noticeDraft.startsOn,`,
  '공지 저장 순번 전달',
);

management = replaceOnce(
  management,
`                  게시기간 동안 로그인한 근로자 앱 상단에 공지가 오른쪽에서 왼쪽으로 계속 표시됩니다. 근로자는 공지를 끌 수 없습니다.`,
`                  표시 순번을 지정할 수 있으며 게시기간 동안 로그인한 근로자 앱 상단에 순번대로 계속 표시됩니다. 근로자는 공지를 끌 수 없습니다.`,
  '공지 관리 안내문',
);

management = replaceOnce(
  management,
`                    <TableRow>
                      <TableCell>공지내용</TableCell>`,
`                    <TableRow>
                      <TableCell align="center" sx={{ width: 72 }}>순번</TableCell>
                      <TableCell>공지내용</TableCell>`,
  '공지 목록 순번 헤더',
);

management = replaceOnce(
  management,
`                    {notices.map((row) => (`,
`                    {notices.map((row, index) => (`,
  '공지 목록 index 추가',
);

management = replaceOnce(
  management,
`                      <TableRow key={row.id} hover>
                        <TableCell sx={{ minWidth: 280, maxWidth: 520 }}>`,
`                      <TableRow key={row.id} hover>
                        <TableCell align="center" sx={{ fontWeight: 900 }}>
                          {Number(row.sort_order) || index + 1}
                        </TableCell>
                        <TableCell sx={{ minWidth: 280, maxWidth: 520 }}>`,
  '공지 목록 순번 셀',
);

management = replaceOnce(
  management,
`<TableRow><TableCell colSpan={7} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 공지사항이 없습니다.</TableCell></TableRow>`,
`<TableRow><TableCell colSpan={8} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 공지사항이 없습니다.</TableCell></TableRow>`,
  '공지 목록 colSpan',
);

management = replaceOnce(
  management,
`          <Stack spacing={1.5}>
            <TextField
              fullWidth
              multiline`,
`          <Stack spacing={1.5}>
            <TextField
              fullWidth
              type="number"
              label="표시 순번"
              value={noticeDraft.sortOrder}
              disabled={noticeSaving}
              inputProps={{ min: 1, step: 1 }}
              onChange={(event) =>
                setNoticeDraft((previous) => ({
                  ...previous,
                  sortOrder: event.target.value,
                }))
              }
              helperText="1번이 가장 먼저 표시됩니다. 저장하면 같은 현장의 공지 순서를 1, 2, 3…으로 자동 정리합니다."
            />
            <TextField
              fullWidth
              multiline`,
  '공지 편집 순번 입력란',
);

/* =========================================================
   AttendanceWorkerPortal.jsx
   ========================================================= */

worker = replaceOnce(
  worker,
`supabase.rpc('attendance_worker_me_v52_14', {`,
`supabase.rpc('attendance_worker_me_v52_21', {`,
  '작업자 공지 순번 RPC v52.21 전환',
);

const tickerReplacement = `function AttendanceNoticeTicker({ notices, appMode = false }) {
  const visibleNotices = Array.isArray(notices)
    ? notices
        .map((item, originalIndex) => ({
          key: String(item?.id || \`notice-\${originalIndex}\`),
          content: String(item?.content || '').trim(),
          sortOrder: Number(item?.sort_order) || originalIndex + 1,
        }))
        .filter((item) => Boolean(item.content))
        .sort((first, second) =>
          first.sortOrder === second.sortOrder
            ? first.key.localeCompare(second.key)
            : first.sortOrder - second.sortOrder,
        )
    : [];

  if (visibleNotices.length === 0) return null;

  const ariaText = visibleNotices
    .map((notice, index) => \`\${index + 1}. \${notice.content}\`)
    .join(' / ');
  const contentLength = visibleNotices.reduce(
    (total, notice) => total + notice.content.length,
    0,
  );
  const spacingWeight = Math.max(0, visibleNotices.length - 1) * 12;
  const durationSeconds = Math.max(
    20,
    Math.min(70, Math.round((contentLength + spacingWeight) * 0.42)),
  );

  return (
    <Box
      role="status"
      aria-label={\`공지사항 \${ariaText}\`}
      sx={{
        width: '100%',
        minHeight: appMode ? 56 : 42,
        display: 'flex',
        alignItems: 'stretch',
        bgcolor: '#ffeb3b',
        borderBottom: '1px solid #eab308',
        color: '#713f12',
        overflow: 'hidden',
        boxShadow: '0 3px 10px rgba(15,23,42,0.08)',
      }}
    >
      <Box
        sx={{
          flex: '0 0 auto',
          px: appMode ? 2 : 1.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#facc15',
          color: '#713f12',
          fontSize: appMode ? '1rem' : '0.78rem',
          fontWeight: 1000,
          letterSpacing: '0.04em',
          zIndex: 1,
        }}
      >
        공지
      </Box>

      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Box
          component="div"
          sx={{
            width: 'max-content',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            // 공지 간격: 앱에서는 약 64px, 일반 브라우저에서는 약 48px
            gap: appMode ? 8 : 6,
            whiteSpace: 'nowrap',
            pl: 1.5,
            fontSize: appMode ? '1.08rem' : '0.84rem',
            fontWeight: 900,
            lineHeight: 1,
            willChange: 'transform',
            animation: \`attendanceNoticeTicker \${durationSeconds}s linear infinite\`,
            '@keyframes attendanceNoticeTicker': {
              '0%': { transform: 'translateX(100vw)' },
              '100%': { transform: 'translateX(-100%)' },
            },
          }}
        >
          {visibleNotices.map((notice, index) => (
            <Box
              component="span"
              key={notice.key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Box
                component="span"
                sx={{
                  mr: 0.7,
                  fontWeight: 1000,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {index + 1}.
              </Box>
              <Box component="span">{notice.content}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

`;

worker = replaceSection(
  worker,
  'function AttendanceNoticeTicker({ notices, appMode = false }) {',
  'function MobileShell({ children, appMode = false, topBanner = null }) {',
  tickerReplacement,
  '작업자 공지 티커 교체',
);

/* =========================================================
   사후 검증
   ========================================================= */

const managementMarkers = [
  "attendance_manager_list_notices_v52_21",
  "attendance_manager_save_notice_v52_21",
  "p_sort_order: sortOrder",
  'label="표시 순번"',
  'sortOrder: Number(notice?.sort_order) || 1',
  '<TableCell align="center" sx={{ width: 72 }}>순번</TableCell>',
];

const workerMarkers = [
  "attendance_worker_me_v52_21",
  '공지 간격: 앱에서는 약 64px',
  '{index + 1}.',
  'gap: appMode ? 8 : 6',
  '.sort((first, second) =>',
];

for (const marker of managementMarkers) {
  if (!management.includes(marker)) {
    fail(`AttendanceManagement 적용 후 검증 실패: ${marker}`);
  }
}
for (const marker of workerMarkers) {
  if (!worker.includes(marker)) {
    fail(`AttendanceWorkerPortal 적용 후 검증 실패: ${marker}`);
  }
}
if (worker.includes("join('　◆　')")) {
  fail('AttendanceWorkerPortal 적용 후에도 기존 ◆ 구분자가 남아 있습니다.');
}

// 모든 검증이 끝난 뒤에만 실제 파일을 변경합니다.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.21_${stamp}`);

for (const [target, original] of [
  [MANAGEMENT, fs.readFileSync(MANAGEMENT, 'utf8')],
  [WORKER, fs.readFileSync(WORKER, 'utf8')],
]) {
  const backupTarget = path.join(
    backupDir,
    path.relative(ROOT, target),
  );
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.writeFileSync(backupTarget, original, 'utf8');
}

fs.writeFileSync(MANAGEMENT, management, 'utf8');
fs.writeFileSync(WORKER, worker, 'utf8');

console.log('\n[v52.21 적용 완료]');
console.log('- 공지사항 관리에 표시 순번 입력 추가');
console.log('- 공지 목록 맨 앞에 순번 표시');
console.log('- 작업자 앱 공지를 DB 순번 기준으로 정렬');
console.log('- 작업자 앱 표시번호는 현재 보이는 공지 기준 1, 2, 3…');
console.log('- 기존 ◆ 구분자 제거');
console.log('- 공지와 공지 사이 간격 확대');
console.log(`- 백업: ${backupDir}`);
console.log('\n주의: Supabase v52.21 SQL도 반드시 실행해야 합니다.');
console.log('다음 명령: npm run build');
