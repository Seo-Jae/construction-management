const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
const EXPECTED_SHA = '0f2eb7821a5f7a40f27b2793b46f768562c128a0';

function fail(message) {
  console.error('\n[v52.48.5.3 적용 중단]');
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
    fail(`${label}: 기준 코드를 찾지 못했습니다.`);
  }

  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    fail(`${label}: 기준 코드가 2개 이상 발견되었습니다.`);
  }

  return source.replace(oldText, newText);
}

function replaceAfterAnchor(source, anchor, oldText, newText, label) {
  const anchorIndex = source.indexOf(anchor);

  if (anchorIndex < 0) {
    fail(`${label}: 기준 입력칸을 찾지 못했습니다.`);
  }

  const targetIndex = source.indexOf(oldText, anchorIndex);

  if (targetIndex < 0) {
    fail(`${label}: 입력칸 내부 스타일을 찾지 못했습니다.`);
  }

  return (
    source.slice(0, targetIndex) +
    newText +
    source.slice(targetIndex + oldText.length)
  );
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

const currentBuffer = fs.readFileSync(TARGET);
let source = currentBuffer.toString('utf8');

if (source.includes("'v52.48.5.3'")) {
  console.log('[v52.48.5.3] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = blobSha(currentBuffer);

if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 v52.48.5.2 기준 main과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.',
  );
}

if (!source.includes("'v52.48.5.2'")) {
  fail('v52.48.5.2 로그인 화면이 먼저 반영되어 있어야 합니다.');
}

source = replaceUnique(
  source,
`        data-attendance-login-reference-layout={
          mode === 'login' && appMode
            ? 'v52.48.5.2'
            : undefined
        }`,
`        data-attendance-login-reference-layout={
          mode === 'login' && appMode
            ? 'v52.48.5.3'
            : undefined
        }`,
  '버전 마커',
);

source = replaceUnique(
  source,
`          width:
            mode === 'login' && appMode
              ? 'calc(100% - 32px)'
              : '100%',
          maxWidth:
            mode === 'login' && appMode
              ? 520
              : 'none',`,
`          width:
            mode === 'login' && appMode
              ? '90%'
              : '100%',
          maxWidth:
            mode === 'login' && appMode
              ? 'none'
              : 'none',`,
  '로그인 폭 90퍼센트와 최대폭 제한 제거',
);

source = replaceUnique(
  source,
`          mx: 'auto',
          position: 'relative',`,
`          mx: 'auto',
          boxSizing: 'border-box',
          position: 'relative',`,
  '로그인 폭 계산 안정화',
);

source = replaceUnique(
  source,
`            {appMode ? (
              <IconButton
                aria-label="뒤로가기"
                onClick={() => window.history.back()}
                sx={{
                  mt: 1.25,
                  ml: -0.75,
                  width: 46,
                  height: 46,
                  color: '#111827',
                }}
              >
                <ArrowBackRoundedIcon
                  sx={{ fontSize: 34 }}
                />
              </IconButton>
            ) : null}

`,
``,
  '로그인 상단 뒤로가기 삭제',
);

source = replaceUnique(
  source,
`              spacing={1.1}
              sx={{
                mt: appMode ? 4.4 : 3,
                mb: appMode ? 7.2 : 4.2,
                pl: appMode ? 0.5 : 0,
              }}`,
`              spacing={1.35}
              sx={{
                mt: appMode ? 25 : 3,
                mb: appMode ? 15.5 : 4.2,
              }}`,
  '로그인 헤더 위치와 간격',
);

source = replaceUnique(
  source,
`                  fontSize: appMode
                    ? '3.2rem'
                    : '3rem',`,
`                  fontSize: appMode
                    ? '4.5rem'
                    : '3rem',`,
  'W 로고 크기',
);

source = replaceUnique(
  source,
`                  fontSize: appMode
                    ? '2.45rem'
                    : '2.2rem',`,
`                  fontSize: appMode
                    ? '3.35rem'
                    : '2.2rem',`,
  '로그인 제목 크기',
);

source = replaceAfterAnchor(
  source,
  'placeholder="휴대폰번호"',
`                  minHeight: appMode
                    ? 72
                    : 74,
                  px: 0.5,
                  fontSize: appMode
                    ? '1.28rem'
                    : '1.2rem',`,
`                  minHeight: appMode
                    ? 92
                    : 74,
                  px: appMode ? 1 : 0.5,
                  fontSize: appMode
                    ? '2rem'
                    : '1.2rem',`,
  '휴대폰 입력 크기',
);

source = replaceAfterAnchor(
  source,
  'placeholder="비밀번호"',
`                mt: appMode ? 2.6 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 72
                    : 74,
                  px: 0.5,
                  fontSize: appMode
                    ? '1.28rem'
                    : '1.2rem',`,
`                mt: appMode ? 10 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 92
                    : 74,
                  px: appMode ? 1 : 0.5,
                  fontSize: appMode
                    ? '2rem'
                    : '1.2rem',`,
  '비밀번호 입력 크기와 간격',
);

source = replaceUnique(
  source,
`                mt: appMode ? 6.4 : 4,
                minHeight: appMode
                  ? 58
                  : 68,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '1.18rem'
                  : '1.16rem',`,
`                mt: appMode ? 14 : 4,
                minHeight: appMode
                  ? 110
                  : 68,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '2rem'
                  : '1.16rem',`,
  '로그인 버튼 크기와 위치',
);

source = replaceUnique(
  source,
`                mt: appMode ? 1.4 : 1.35,
                minHeight: appMode
                  ? 58
                  : 62,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                borderColor: '#eeeeee',
                bgcolor: '#f7f7f7',
                color: '#1f2937',
                fontSize: appMode
                  ? '1.08rem'
                  : '1rem',`,
`                mt: appMode ? 2.5 : 1.35,
                minHeight: appMode
                  ? 110
                  : 62,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                borderColor: '#eeeeee',
                bgcolor: '#f7f7f7',
                color: '#1f2937',
                fontSize: appMode
                  ? '1.72rem'
                  : '1rem',`,
  '가입 신청 버튼 크기',
);

source = replaceUnique(
  source,
`                mt: appMode ? 3.6 : 1,
                minHeight: appMode
                  ? 44
                  : 56,
                color: '#334155',
                fontSize: appMode
                  ? '1.02rem'
                  : '0.98rem',`,
`                mt: appMode ? 8.5 : 1,
                minHeight: appMode
                  ? 56
                  : 56,
                color: '#334155',
                fontSize: appMode
                  ? '1.65rem'
                  : '0.98rem',`,
  '관리자 모드 위치와 크기',
);

for (const marker of [
  "'v52.48.5.3'",
  "? '90%'",
  "? '4.5rem'",
  "? '3.35rem'",
  'mt: appMode ? 25 : 3',
  'mb: appMode ? 15.5 : 4.2',
  'mt: appMode ? 14 : 4',
  '? 110',
]) {
  if (!source.includes(marker)) {
    fail(`적용 후 필수 마커 누락: ${marker}`);
  }
}

if (
  source.includes('aria-label="뒤로가기"') ||
  source.includes('window.history.back()')
) {
  fail('로그인 상단 뒤로가기 코드가 남아 있습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(
  ROOT,
  `backup_v52.48.5.3_${stamp}`,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.48.5.3 적용 완료]');
console.log('- 로그인 상단 뒤로가기 완전 삭제');
console.log('- 520px 최대폭 제한 제거');
console.log('- 모바일 로그인 본문 폭을 화면의 90%로 확대');
console.log('- 네이버 참고 화면 비율에 맞춘 로고와 제목 확대');
console.log('- 입력란 간격과 글자 크기 확대');
console.log('- 로그인/가입 버튼 높이를 110px로 확대');
console.log('- 관리자 모드 위치와 크기 확대');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
