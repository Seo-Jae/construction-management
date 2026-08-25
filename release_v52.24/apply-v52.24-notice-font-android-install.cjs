const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const MANAGEMENT = path.join(ROOT, 'src', 'page', 'AttendanceManagement.jsx');
const WORKER = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

const EXPECTED_MANAGEMENT_SHA = '8710bdfa8fd821b09e32d44014b2a82424e79aea';
const ACCEPTED_WORKER_SHAS = new Set([
  // v52.22 / v52.21 worker 기준
  '9d8d5b700cb26c16069903fdf89259b3ae9bcdfa',
  // v52.23 티커 1.4배 속도 적용 후 기준
  'f78bc584bfe64f98591310a22b32f7fb1efde43a',
]);

function fail(message) {
  console.error('\n[v52.24 적용 중단]');
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

for (const file of [MANAGEMENT, WORKER]) {
  if (!fs.existsSync(file)) {
    fail(`대상 파일을 찾을 수 없습니다: ${file}`);
  }
}

let management = fs.readFileSync(MANAGEMENT, 'utf8');
let worker = fs.readFileSync(WORKER, 'utf8');

const alreadyApplied =
  management.includes('체크박스로 공지를 선택한 뒤 위·아래 버튼으로 표시 순서를 변경할 수 있습니다.') &&
  management.includes("fontSize: 'inherit'") &&
  management.includes("fontFamily: 'inherit'") &&
  !management.includes('fontWeight: 900 }}>\n                          {Number(row.sort_order)') &&
  !management.includes("fontSize: '0.76rem', fontWeight: 700") &&
  worker.includes('안드로이드는 Chrome 메뉴의 <b>앱 설치</b>를 선택하세요.') &&
  worker.includes('>근태앱 설치</Button>') &&
  worker.includes('Math.min(50, Math.round((contentLength + spacingWeight) * 0.30))');

if (alreadyApplied) {
  console.log('[v52.24] 이미 적용된 상태입니다.');
  process.exit(0);
}

const managementSha = gitBlobSha(management);
if (managementSha !== EXPECTED_MANAGEMENT_SHA) {
  fail(
    '현재 AttendanceManagement.jsx가 확인한 v52.22 운영본과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_MANAGEMENT_SHA}\n` +
    `현재 Git blob SHA: ${managementSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

const workerSha = gitBlobSha(worker);
if (!ACCEPTED_WORKER_SHAS.has(workerSha)) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 확인한 기준과 다릅니다.\n' +
    '허용 기준: v52.22 또는 v52.23\n' +
    `현재 Git blob SHA: ${workerSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

/* =========================================================
   1. 공지사항 관리 - 순번/공지내용 일반 글씨
   ========================================================= */

management = replaceOnce(
  management,
`                        <TableCell align="center" sx={{ fontWeight: 900 }}>
                          {Number(row.sort_order) || index + 1}
                        </TableCell>`,
`                        <TableCell
                          align="center"
                          sx={{
                            fontWeight: 400,
                            fontFamily: 'inherit',
                          }}
                        >
                          {Number(row.sort_order) || index + 1}
                        </TableCell>`,
  '공지 순번 일반 글씨',
);

management = replaceOnce(
  management,
`                          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.76rem', fontWeight: 700 }}>
                            {row.content}
                          </Typography>`,
`                          <Typography
                            sx={{
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                              fontSize: 'inherit',
                              fontWeight: 400,
                              fontFamily: 'inherit',
                            }}
                          >
                            {row.content}
                          </Typography>`,
  '공지내용 일반 글씨',
);

management = replaceOnce(
  management,
`                  표시 순번을 지정할 수 있으며 게시기간 동안 로그인한 근로자 앱 상단에 순번대로 계속 표시됩니다. 근로자는 공지를 끌 수 없습니다.`,
`                  체크박스로 공지를 선택한 뒤 위·아래 버튼으로 표시 순서를 변경할 수 있습니다. 게시기간 동안 로그인한 근로자 앱 상단에 순번대로 계속 표시되며 근로자는 공지를 끌 수 없습니다.`,
  '공지사항 관리 안내문 최신화',
);

/* =========================================================
   2. 작업자 앱 - v52.23 티커 1.4배 속도 누적 보장
   ========================================================= */

const oldTicker = `  const durationSeconds = Math.max(
    20,
    Math.min(70, Math.round((contentLength + spacingWeight) * 0.42)),
  );`;

const newTicker = `  const durationSeconds = Math.max(
    14.3,
    Math.min(50, Math.round((contentLength + spacingWeight) * 0.30)),
  );`;

if (worker.includes(oldTicker)) {
  worker = replaceOnce(
    worker,
    oldTicker,
    newTicker,
    'v52.23 티커 1.4배 속도 누적 적용',
  );
} else if (!worker.includes(newTicker)) {
  fail('공지 티커 속도 계산식이 예상 기준과 다릅니다.');
}

/* =========================================================
   3. 작업자 앱 - Android 설치 안내 개선
   ========================================================= */

worker = replaceOnce(
  worker,
`        <Dialog open={!appMode && installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>휴대폰에 앱 추가</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
              아이폰은 Safari 하단의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 선택하세요. 안드로이드는 브라우저 메뉴의 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택하면 됩니다.
            </Typography>
          </DialogContent>
        </Dialog>`,
`        <Dialog open={!appMode && installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>근태앱 설치</DialogTitle>
          <DialogContent>
            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                아이폰은 Safari 하단의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 선택하세요.
              </Typography>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                안드로이드는 Chrome 메뉴의 <b>앱 설치</b>를 선택하세요. <b>홈 화면에 추가</b> 방식은 사용하지 않는 것을 권장합니다.
              </Typography>
              <Alert severity="info" sx={{ fontSize: '0.74rem' }}>
                기존에 홈 화면 바로가기 방식으로 설치한 경우 Chrome이 “이 앱의 URL 복사하기” 시스템 알림을 표시할 수 있습니다. 기존 아이콘을 제거한 뒤 Chrome의 “앱 설치” 방식으로 다시 설치해주세요.
              </Alert>
            </Stack>
          </DialogContent>
        </Dialog>`,
  'Android 앱 설치 안내 개선',
);

worker = replaceOnce(
  worker,
`      {!appMode && <Button fullWidth variant="text" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall} sx={{ mt: 1.5 }}>휴대폰 홈 화면에 앱 추가</Button>}`,
`      {!appMode && <Button fullWidth variant="text" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall} sx={{ mt: 1.5 }}>근태앱 설치</Button>}`,
  '작업자 앱 설치 버튼 문구 개선',
);

/* =========================================================
   사후 검증
   ========================================================= */

const managementMarkers = [
  "fontWeight: 400,\n                            fontFamily: 'inherit',",
  "fontSize: 'inherit',\n                              fontWeight: 400,\n                              fontFamily: 'inherit',",
  '체크박스로 공지를 선택한 뒤 위·아래 버튼으로 표시 순서를 변경할 수 있습니다.',
];

const workerMarkers = [
  '안드로이드는 Chrome 메뉴의 <b>앱 설치</b>를 선택하세요.',
  '홈 화면에 추가</b> 방식은 사용하지 않는 것을 권장합니다.',
  '“이 앱의 URL 복사하기” 시스템 알림',
  '>근태앱 설치</Button>',
  'Math.min(50, Math.round((contentLength + spacingWeight) * 0.30))',
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

if (management.includes('fontWeight: 900 }}>\n                          {Number(row.sort_order)')) {
  fail('공지 순번 굵은 글씨가 남아 있습니다.');
}
if (management.includes("fontSize: '0.76rem', fontWeight: 700")) {
  fail('공지내용 굵은 글씨가 남아 있습니다.');
}

// 백업
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.24_${stamp}`);

for (const target of [MANAGEMENT, WORKER]) {
  const backupTarget = path.join(
    backupDir,
    path.relative(ROOT, target),
  );
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.copyFileSync(target, backupTarget);
}

fs.writeFileSync(MANAGEMENT, management, 'utf8');
fs.writeFileSync(WORKER, worker, 'utf8');

console.log('\n[v52.24 적용 완료]');
console.log('- 공지 목록 순번 글씨: 굵게 -> 일반');
console.log('- 공지내용 글씨: 굵게 -> 일반');
console.log('- 공지 행 글꼴/크기를 공통 UI 글꼴과 표 셀 기준으로 상속');
console.log('- 공지사항 관리 안내문을 체크/위아래 이동 방식으로 수정');
console.log('- v52.23 공지 티커 1.4배 속도 누적 보장');
console.log('- Android 설치 안내에서 "홈 화면에 추가" 방식 제외');
console.log('- Android는 Chrome "앱 설치" 방식으로 안내');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
