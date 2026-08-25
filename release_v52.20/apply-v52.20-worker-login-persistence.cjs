const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');
const EXPECTED_GIT_BLOB_SHA = '9d545b2c1b0622d74296519b82eb5e5bc89eaf9a';

function fail(message) {
  console.error('\n[v52.20 적용 중단]');
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

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

const alreadyApplied =
  source.includes('isAttendanceSessionInvalidError') &&
  source.includes("window.addEventListener('online', refresh)") &&
  source.includes("if (!sessionToken) return undefined;");

if (alreadyApplied) {
  console.log('[v52.20] 이미 프로그램 파일이 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (actualSha !== EXPECTED_GIT_BLOB_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 확인한 최신 운영본과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_GIT_BLOB_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

source = replaceOnce(
  source,
`  const saveSession = useCallback((token) => {
    const normalized = String(token || '');
    setSessionToken(normalized);
    if (normalized) {
      window.localStorage.setItem(
        ATTENDANCE_SESSION_STORAGE_KEY,
        normalized,
      );
    } else {
      window.localStorage.removeItem(ATTENDANCE_SESSION_STORAGE_KEY);
    }
  }, []);

  const loadMe = useCallback(async (token = sessionToken, silent = false) => {`,
`  const saveSession = useCallback((token) => {
    const normalized = String(token || '');
    setSessionToken(normalized);
    if (normalized) {
      window.localStorage.setItem(
        ATTENDANCE_SESSION_STORAGE_KEY,
        normalized,
      );
    } else {
      window.localStorage.removeItem(ATTENDANCE_SESSION_STORAGE_KEY);
    }
  }, []);

  /*
    v52.20:
    작업자 앱의 로그인 토큰은 이미 localStorage에 저장됩니다.
    따라서 앱 종료/재실행 자체로는 로그아웃시키지 않습니다.

    세션을 실제로 버려야 하는 경우와 일시적인 통신 장애를 구분하여,
    네트워크/RPC 오류 한 번 때문에 작업자에게 다시 로그인을 요구하지 않습니다.
  */
  const isAttendanceSessionInvalidError = useCallback((error) => {
    const text = String(error?.message || '').trim();

    return [
      '로그인이 필요합니다.',
      '로그인 정보가 만료되었거나 등록된 휴대폰이 아닙니다.',
    ].some((messageText) => text.includes(messageText));
  }, []);

  const loadMe = useCallback(async (token = sessionToken, silent = false) => {`,
  '세션 오류 구분 함수 추가',
);

source = replaceOnce(
  source,
`    if (error) {
      console.warn('근로자 세션 확인 실패:', error);
      saveSession('');
      setWorker(null);
      setTodayEvents([]);
      setMonthEvents([]);
      setRiskBroadcasts([]);
      setAttendanceNotices([]);
      setMessage({ severity: 'warning', text: error.message || '다시 로그인해주세요.' });
      setLoading(false);
      return null;
    }`,
`    if (error) {
      console.warn('근로자 세션 확인 실패:', error);

      if (isAttendanceSessionInvalidError(error)) {
        /*
          명시적으로 세션 토큰/등록기기가 유효하지 않은 경우에만
          저장된 로그인 정보를 제거합니다.
        */
        saveSession('');
        setWorker(null);
        setTodayEvents([]);
        setMonthEvents([]);
        setRiskBroadcasts([]);
        setAttendanceNotices([]);
        setMessage({
          severity: 'warning',
          text: error.message || '로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.',
        });
      } else {
        /*
          인터넷 끊김, Supabase 일시 장애, 포커스 복귀 순간의 통신 실패 등은
          기존 로그인과 현재 화면을 그대로 유지합니다.
        */
        if (!silent) {
          setMessage({
            severity: 'warning',
            text: '서버 연결이 잠시 불안정합니다. 로그인 상태는 유지되며 자동으로 다시 연결합니다.',
          });
        }
      }

      setLoading(false);
      return worker;
    }`,
  '일시 오류 시 로그인 토큰 삭제 방지',
);

source = replaceOnce(
  source,
`  }, [deviceKey, saveSession, sessionToken]);`,
`  }, [
    deviceKey,
    isAttendanceSessionInvalidError,
    saveSession,
    sessionToken,
    worker,
  ]);`,
  'loadMe dependency 보완',
);

source = replaceOnce(
  source,
`  useEffect(() => {
    if (!sessionToken || !worker?.id) return undefined;

    const refresh = () => {
      void loadMe(sessionToken, true);
    };
    const timer = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loadMe, sessionToken, worker?.id]);`,
`  useEffect(() => {
    /*
      앱을 다시 열었을 때 첫 세션 확인이 일시적으로 실패해도
      localStorage의 토큰이 남아 있으면 계속 재연결을 시도합니다.
    */
    if (!sessionToken) return undefined;

    const refresh = () => {
      void loadMe(sessionToken, true);
    };

    const timer = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadMe, sessionToken]);`,
  '토큰 존재 시 자동 재연결 유지',
);

for (const marker of [
  'isAttendanceSessionInvalidError',
  "window.addEventListener('online', refresh)",
  '로그인 상태는 유지되며 자동으로 다시 연결합니다.',
  'if (!sessionToken) return undefined;',
]) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.20_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);

fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.20 적용 완료]');
console.log('- 작업자 앱 로그인 토큰 localStorage 유지');
console.log('- 일시적인 네트워크/RPC 오류로 자동 로그아웃하지 않음');
console.log('- 저장된 토큰이 있으면 앱 재실행/포커스/온라인 복귀 시 자동 재연결');
console.log('- 실제로 세션/등록기기가 무효한 경우에만 로그인 정보 삭제');
console.log(`- 백업: ${backupDir}`);
console.log('\n주의: Supabase SQL도 반드시 적용해야 서버 30일 만료가 제거됩니다.');
console.log('다음 명령: npm run build');
