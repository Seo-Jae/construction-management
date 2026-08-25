const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');
const EXPECTED_GIT_BLOB_SHA = '301eb1bada1ec7c1b2d66e354be48552432087ca';

function fail(message) {
  console.error('\n[v52.26 적용 중단]');
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
  source.includes('cameraPermissionOpen') &&
  source.includes('queryCameraPermissionState') &&
  source.includes('카메라 사용 허용') &&
  source.includes('Chrome 설정 → 사이트 설정 → 카메라');

if (alreadyApplied) {
  console.log('[v52.26] 이미 카메라 권한 안내가 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (actualSha !== EXPECTED_GIT_BLOB_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 확인한 최신 GitHub main과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_GIT_BLOB_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

/* =========================================================
   1. Camera permission 상태 helper
   ========================================================= */

source = replaceOnce(
  source,
`const getCameraErrorMessage = (error) => {
  const errorName = String(error?.name || '');
  const errorMessage = String(error?.message || '');`,
`const queryCameraPermissionState = async () => {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const permission = await navigator.permissions.query({
      name: 'camera',
    });
    return String(permission?.state || 'unknown');
  } catch {
    // iOS Safari 등 camera Permissions API를 지원하지 않는 브라우저
    return 'unknown';
  }
};

const getCameraErrorMessage = (error) => {
  const errorName = String(error?.name || '');
  const errorMessage = String(error?.message || '');`,
  '카메라 권한 상태 helper 추가',
);

/* =========================================================
   2. Permission Dialog state
   ========================================================= */

source = replaceOnce(
  source,
`  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);`,
`  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPermissionOpen, setCameraPermissionOpen] = useState(false);
  const [cameraPermissionState, setCameraPermissionState] = useState('unknown');`,
  '카메라 권한 Dialog state 추가',
);

/* =========================================================
   3. 기존 handleOpenScanner를 실제 요청 함수 + 사전 안내로 분리
   ========================================================= */

const oldScanner = `  const handleOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({ severity: 'error', text: getCameraErrorMessage(new Error('MediaDevicesUnavailable')) });
      return;
    }

    stopScanner();
    setMessage(null);
    setCameraReady(false);
    setScannerStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('CameraNotFound', 'NotFoundError');
      }

      cameraStreamRef.current = stream;
      setScannerOpen(true);
    } catch (error) {
      console.error('카메라 권한 요청 오류:', error);
      stopScanner();
      setScannerStarting(false);
      setMessage({ severity: 'error', text: getCameraErrorMessage(error) });
    }
  };`;

const newScanner = `  const requestCameraAndOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(
          new Error('MediaDevicesUnavailable'),
        ),
      });
      return;
    }

    stopScanner();
    setMessage(null);
    setCameraReady(false);
    setScannerStarting(true);
    setCameraPermissionOpen(false);

    try {
      /*
        getUserMedia()를 반드시 사용자 버튼 클릭 흐름에서 호출합니다.
        권한이 아직 결정되지 않았다면 이 시점에 Chrome/Safari의
        카메라 허용/차단 시스템 팝업이 표시됩니다.
      */
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException(
          'CameraNotFound',
          'NotFoundError',
        );
      }

      cameraStreamRef.current = stream;
      setCameraPermissionState('granted');
      setScannerOpen(true);
    } catch (error) {
      console.error('카메라 권한 요청 오류:', error);
      stopScanner();
      setScannerStarting(false);

      const nextPermissionState =
        await queryCameraPermissionState();

      if (
        String(error?.name || '') === 'NotAllowedError' ||
        String(error?.name || '') === 'SecurityError' ||
        nextPermissionState === 'denied'
      ) {
        /*
          이미 차단된 권한은 웹페이지가 브라우저 시스템 팝업을
          강제로 다시 띄울 수 없습니다.
          검은 카메라 화면 대신 복구 방법을 즉시 표시합니다.
        */
        setCameraPermissionState('denied');
        setCameraPermissionOpen(true);
        return;
      }

      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(error),
      });
    }
  };

  const handleOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(
          new Error('MediaDevicesUnavailable'),
        ),
      });
      return;
    }

    const permissionState =
      await queryCameraPermissionState();

    setCameraPermissionState(permissionState);

    if (permissionState === 'granted') {
      await requestCameraAndOpenScanner();
      return;
    }

    /*
      prompt / denied / unknown:
      검은 카메라 화면부터 열지 않고 먼저 권한 안내창을 표시합니다.
      사용자가 "카메라 사용 허용"을 누른 다음 getUserMedia()를 호출합니다.
    */
    setCameraPermissionOpen(true);
  };`;

source = replaceOnce(
  source,
  oldScanner,
  newScanner,
  '카메라 권한 요청 흐름 개선',
);

/* =========================================================
   4. QR 버튼 아래 Permission Dialog 추가
   ========================================================= */

source = replaceOnce(
  source,
`        <Dialog open={scannerOpen} onClose={closeScanner} fullWidth maxWidth="xs">`,
`        <Dialog
          open={cameraPermissionOpen}
          onClose={() => {
            if (!scannerStarting) {
              setCameraPermissionOpen(false);
            }
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle sx={{ fontWeight: 900 }}>
            카메라 권한 필요
          </DialogTitle>
          <DialogContent dividers>
            {cameraPermissionState === 'denied' ? (
              <Stack spacing={1.25}>
                <Alert severity="warning">
                  카메라 권한이 현재 차단되어 있습니다.
                  차단된 권한은 앱에서 시스템 허용창을 강제로
                  다시 띄울 수 없습니다.
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  Android Chrome에서는
                  <b> Chrome 설정 → 사이트 설정 → 카메라</b>에서
                  현재 욱림건설 근태시스템 사이트를 찾아
                  <b> 허용</b>으로 변경해주세요.
                </Typography>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.88rem' : '0.74rem',
                    color: '#64748b',
                    lineHeight: 1.7,
                  }}
                >
                  Android 자체에서 Chrome의 카메라 권한이 꺼져
                  있다면 휴대폰 설정 → 앱 → Chrome → 권한 →
                  카메라도 허용해야 합니다.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.25}>
                <Alert severity="info">
                  출·퇴근 QR 촬영을 위해 후면 카메라 권한이
                  필요합니다.
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  아래 <b>카메라 사용 허용</b>을 누르면
                  Chrome/Safari의 카메라 권한창이 표시됩니다.
                  권한창에서 <b>허용</b>을 선택해주세요.
                </Typography>
              </Stack>
            )}
          </DialogContent>
          <Box
            sx={{
              px: 3,
              py: 2,
              display: 'flex',
              gap: 1,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              color="inherit"
              disabled={scannerStarting}
              onClick={() => setCameraPermissionOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="contained"
              startIcon={
                scannerStarting
                  ? <CircularProgress size={18} color="inherit" />
                  : <CameraAltRoundedIcon />
              }
              disabled={scannerStarting}
              onClick={requestCameraAndOpenScanner}
              sx={{
                bgcolor: primaryActionColor,
                fontWeight: 900,
                '&:hover': {
                  bgcolor: primaryActionColor,
                },
              }}
            >
              {scannerStarting
                ? '권한 확인 중'
                : cameraPermissionState === 'denied'
                  ? '카메라 권한 다시 확인'
                  : '카메라 사용 허용'}
            </Button>
          </Box>
        </Dialog>

        <Dialog open={scannerOpen} onClose={closeScanner} fullWidth maxWidth="xs">`,
  '카메라 권한 안내 Dialog 추가',
);

/* =========================================================
   5. 기존 오류 메시지 Android 안내도 보강
   ========================================================= */

source = replaceOnce(
  source,
`  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return '카메라 권한이 차단되어 있습니다. 아이폰은 Safari 주소창의 가가(AA) → 웹사이트 설정 → 카메라 → 허용으로 바꾼 뒤 다시 눌러주세요.';
  }`,
`  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return '카메라 권한이 차단되어 있습니다. Android는 Chrome 설정 → 사이트 설정 → 카메라에서 허용하고, 아이폰은 Safari 웹사이트 설정 → 카메라 → 허용으로 바꾼 뒤 다시 눌러주세요.';
  }`,
  '카메라 차단 오류 안내 보강',
);

/* =========================================================
   사후 검증
   ========================================================= */

const requiredMarkers = [
  'queryCameraPermissionState',
  'cameraPermissionOpen',
  'cameraPermissionState',
  'requestCameraAndOpenScanner',
  '카메라 권한 필요',
  '카메라 사용 허용',
  'Chrome 설정 → 사이트 설정 → 카메라',
  'setScannerOpen(true)',
  'getUserMedia({',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

// scanner dialog은 카메라 stream 획득 후에만 열린다는 기존 안전조건 유지
const getUserMediaIndex = source.indexOf(
  'const stream = await navigator.mediaDevices.getUserMedia'
);
const scannerOpenIndex = source.indexOf(
  'setScannerOpen(true);',
  getUserMediaIndex
);
if (
  getUserMediaIndex < 0 ||
  scannerOpenIndex < 0 ||
  scannerOpenIndex <= getUserMediaIndex
) {
  fail('카메라 stream 성공 전에 scanner Dialog가 열릴 가능성이 있습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.26_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.26 적용 완료]');
console.log('- QR 촬영 전 카메라 권한 상태 확인');
console.log('- 미허용 상태면 "카메라 권한 필요" 안내창 표시');
console.log('- "카메라 사용 허용" 클릭 후 브라우저 시스템 권한 요청');
console.log('- 이미 차단된 경우 검은 화면 대신 권한 복구 방법 표시');
console.log('- 카메라 stream 획득 성공 후에만 QR 촬영화면 표시');
console.log('- 기존 로그인 유지/공지/QR 처리 기능 변경 없음');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
