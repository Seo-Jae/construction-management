const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

const ACCEPTED_GIT_BLOB_SHAS = new Set([
  // GitHub main에서 확인한 v52.26 계열
  '301eb1bada1ec7c1b2d66e354be48552432087ca',
  // v52.26 적용 테스트 산출 기준
  '3a87e91aabae2b506925dbe8b2a08f4a3c401f05',
]);

function fail(message) {
  console.error('\n[v52.27 적용 중단]');
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
  source.includes('const workerRef = useRef(null);') &&
  source.includes('return workerRef.current;') &&
  source.includes('workerRef.current = nextWorker;') &&
  !source.includes('    worker,\n  ]);');

if (alreadyApplied) {
  console.log('[v52.27] 이미 카메라/세션 무한루프 안정화가 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (!ACCEPTED_GIT_BLOB_SHAS.has(actualSha)) {
  // SHA가 다르더라도 v52.26 필수 마커가 정확히 있으면 문자열 기반 보호 검사를 계속합니다.
  const requiredBaseMarkers = [
    'queryCameraPermissionState',
    'cameraPermissionOpen',
    'requestCameraAndOpenScanner',
    'const loadMe = useCallback',
    'setWorker(nextWorker);',
    'return worker;',
    '    worker,\n  ]);',
    'aria-label="로그아웃"',
  ];

  const missing = requiredBaseMarkers.filter((marker) => !source.includes(marker));
  if (missing.length > 0) {
    fail(
      '현재 AttendanceWorkerPortal.jsx가 확인한 v52.26 기준과 다릅니다.\n' +
      `현재 Git blob SHA: ${actualSha}\n` +
      `누락 기준: ${missing.join(', ')}\n` +
      '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
    );
  }
}

/* =========================================================
   1. worker 최신값 ref 추가
   loadMe가 worker state 자체를 dependency로 가지지 않게 합니다.
   ========================================================= */

source = replaceOnce(
  source,
`  const cameraStreamRef = useRef(null);
  const handledDeepLinkRef = useRef('');`,
`  const cameraStreamRef = useRef(null);
  /*
    v52.27:
    worker state를 loadMe의 dependency로 사용하면
    loadMe -> setWorker -> loadMe 재생성 -> effect 재실행 루프가 생길 수 있습니다.
    최신 worker 값이 필요할 때는 ref를 사용해 함수 identity를 안정적으로 유지합니다.
  */
  const workerRef = useRef(null);
  const handledDeepLinkRef = useRef('');`,
  'workerRef 추가',
);

/* =========================================================
   2. token 없음 / invalid session 시 ref도 정리
   ========================================================= */

source = replaceOnce(
  source,
`    if (!token) {
      setWorker(null);
      setTodayEvents([]);`,
`    if (!token) {
      workerRef.current = null;
      setWorker(null);
      setTodayEvents([]);`,
  '토큰 없음 workerRef 초기화',
);

source = replaceOnce(
  source,
`        saveSession('');
        setWorker(null);
        setTodayEvents([]);`,
`        saveSession('');
        workerRef.current = null;
        setWorker(null);
        setTodayEvents([]);`,
  '세션 무효 workerRef 초기화',
);

/* =========================================================
   3. 일시 오류 시 worker state dependency 대신 ref 사용
   ========================================================= */

source = replaceOnce(
  source,
`      setLoading(false);
      return worker;
    }

    const nextWorker = data?.worker || null;
    setWorker(nextWorker);`,
`      setLoading(false);
      return workerRef.current;
    }

    const nextWorker = data?.worker || null;
    workerRef.current = nextWorker;
    setWorker(nextWorker);`,
  'loadMe workerRef 사용',
);

/* =========================================================
   4. loadMe dependency에서 worker 제거
   이것이 핵심 무한루프 차단입니다.
   ========================================================= */

source = replaceOnce(
  source,
`  }, [
    deviceKey,
    isAttendanceSessionInvalidError,
    saveSession,
    sessionToken,
    worker,
  ]);`,
`  }, [
    deviceKey,
    isAttendanceSessionInvalidError,
    saveSession,
    sessionToken,
  ]);`,
  'loadMe worker dependency 제거',
);

/* =========================================================
   5. 로그아웃 시 ref 정리
   ========================================================= */

source = replaceOnce(
  source,
`    saveSession('');
    setWorker(null);
    setTodayEvents([]);`,
`    saveSession('');
    workerRef.current = null;
    setWorker(null);
    setTodayEvents([]);`,
  '로그아웃 workerRef 초기화',
);

/* =========================================================
   6. scanner effect 설명/안전성 마커 추가
   ========================================================= */

source = replaceOnce(
  source,
`  useEffect(() => {
    if (!scannerOpen || !scannerVideoElement || !cameraStreamRef.current) return undefined;
    let cancelled = false;`,
`  useEffect(() => {
    if (!scannerOpen || !scannerVideoElement || !cameraStreamRef.current) return undefined;

    /*
      v52.27:
      이 effect cleanup은 실제 scanner dependency가 바뀔 때만 실행되어야 합니다.
      loadMe의 worker dependency를 제거했기 때문에
      60초 세션 갱신이나 setWorker 자체가 카메라 stream을 끊지 않습니다.
    */
    let cancelled = false;`,
  'scanner 안정화 설명 추가',
);

/* =========================================================
   사후 검증
   ========================================================= */

const requiredMarkers = [
  'const workerRef = useRef(null);',
  'return workerRef.current;',
  'workerRef.current = nextWorker;',
  'workerRef.current = null;',
  '60초 세션 갱신이나 setWorker 자체가 카메라 stream을 끊지 않습니다.',
  'queryCameraPermissionState',
  'requestCameraAndOpenScanner',
  'aria-label="로그아웃"',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

if (source.includes('    worker,\n  ]);')) {
  fail('loadMe dependency에 worker가 아직 남아 있습니다.');
}

const loadMeStart = source.indexOf('const loadMe = useCallback');
const loadMeEnd = source.indexOf('  useEffect(() => {', loadMeStart);
if (loadMeStart < 0 || loadMeEnd < 0) {
  fail('loadMe 구간 검증에 실패했습니다.');
}

const loadMeSection = source.slice(loadMeStart, loadMeEnd);
if (loadMeSection.includes('return worker;')) {
  fail('loadMe 내부에 stale worker 반환이 남아 있습니다.');
}

// 기존 카메라/공지/로그아웃 기능 보존
for (const marker of [
  'Math.min(50, Math.round((contentLength + spacingWeight) * 0.30))',
  '카메라 권한 필요',
  '카메라 사용 허용',
  'setScannerOpen(true);',
  'processQrToken(result.getText())',
  'headerAction={',
]) {
  if (!source.includes(marker)) {
    fail(`기존 기능 보존 검증 실패: ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.27_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);

fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.27 적용 완료]');
console.log('- loadMe -> setWorker -> loadMe 재생성 무한루프 차단');
console.log('- worker 최신값은 workerRef로 유지');
console.log('- 60초 세션 갱신/포커스 복귀가 scanner effect를 재시작하지 않도록 안정화');
console.log('- 카메라 stream이 열리자마자 stopScanner로 끊기는 가능성 제거');
console.log('- 기존 카메라 권한 안내, 로그인 유지, 공지 티커, 상단 로그아웃 유지');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
