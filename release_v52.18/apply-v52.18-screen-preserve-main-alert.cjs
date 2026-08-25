const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const DASHBOARD = path.join(ROOT, 'src', 'Dashboard.jsx');
const ALERT_DIALOG = path.join(ROOT, 'src', 'page', 'MainWorkAlertDialog.jsx');

const EXPECTED = {
  [DASHBOARD]: 'cbcceb716830f76acc7a940e4dde55e94ca48052',
  [ALERT_DIALOG]: 'f43d8c1985cdeda5bf8dfa7c4df01ce6a3cedb83',
};

function fail(message) {
  console.error('\n[v52.18 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`${label}: 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
  return source.replace(before, after);
}

for (const file of [DASHBOARD, ALERT_DIALOG]) {
  if (!fs.existsSync(file)) {
    fail(`대상 파일을 찾을 수 없습니다: ${file}`);
  }
}

let dashboard = fs.readFileSync(DASHBOARD, 'utf8');
let dialog = fs.readFileSync(ALERT_DIALOG, 'utf8');

const alreadyApplied =
  dashboard.includes('navigationAccessInitializedRef') &&
  dashboard.includes('constructionManagementMainWorkAlertHidden:') &&
  dialog.includes('오늘 하루 보지 않기') &&
  dialog.includes('hideToday');

if (alreadyApplied) {
  console.log('[v52.18] 이미 적용된 상태입니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

// 현재 GitHub main(v52.17.3) 기준 파일인지 확인합니다.
// 다른 개발 변경이 섞여 있으면 자동 덮어쓰지 않습니다.
for (const [file, expectedSha] of Object.entries(EXPECTED)) {
  const source = file === DASHBOARD ? dashboard : dialog;
  const actualSha = gitBlobSha(source);
  if (actualSha !== expectedSha) {
    fail(
      `기존 기능 보호를 위해 적용하지 않았습니다.\n` +
      `${path.relative(ROOT, file)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n` +
      `최신 파일 상태를 다시 확인한 뒤 적용해야 합니다.`
    );
  }
}

// ---------------------------------------------------------
// 1) Dashboard: 포커스/권한 재조회 시 현재 화면을 Main으로 바꾸지 않음
// ---------------------------------------------------------

dashboard = replaceOnce(
  dashboard,
`  const messengerWindowRef = useRef(null);

  const [managementArea, setManagementArea] = useState(() => {`,
`  const messengerWindowRef = useRef(null);

  // v52.18:
  // 권한 정보는 포커스 복귀/주기 갱신 때 계속 새로 읽되,
  // 현재 업무 화면 자동 보정은 로그인 후 최초 1회만 수행합니다.
  // 다른 프로그램/브라우저 탭을 사용했다가 돌아와도
  // 작성 중인 화면이 Main으로 변경되지 않도록 보호합니다.
  const navigationAccessInitializedRef = useRef(false);

  useEffect(() => {
    navigationAccessInitializedRef.current = false;
  }, [user?.id]);

  const [managementArea, setManagementArea] = useState(() => {`,
  '화면 자동이동 방지 ref 추가',
);

dashboard = replaceOnce(
  dashboard,
`  const [workAlertOpen, setWorkAlertOpen] = useState(true);`,
`  const [workAlertOpen, setWorkAlertOpen] = useState(false);`,
  'Main 업무알림 초기상태 변경',
);

dashboard = replaceOnce(
  dashboard,
`    if (
      requestedView &&
      Object.prototype.hasOwnProperty.call(viewTitles, requestedView) &&
      requestedView !== 'messenger' &&
      canAccessView(requestedView, activeProjectName)
    ) {
      setCurrentView(requestedView);
      return;
    }

    setCurrentView((previousView) => {
      const storedView = readDashboardSessionValue('currentView');
      const candidates = [
        previousView,
        storedView,
        'main',
        'admin-dashboard',
        'approval-inbox',
        'weekly-overview',
        'weekly-overview-archive',
        'organization-chart',
        'daily',
        'progress-input',
      ];

      const allowedView = candidates.find(
        (view) =>
          view &&
          view !== 'messenger' &&
          Object.prototype.hasOwnProperty.call(viewTitles, view) &&
          canAccessView(view, activeProjectName),
      );

      return allowedView || 'main';
    });`,
`    /*
      v52.18:
      runtimeAccess는 창 focus 및 60초 주기로 갱신됩니다.
      기존에는 갱신할 때마다 아래 화면 보정 로직까지 다시 실행되어
      일반 담당자의 현장별 권한 판정 순간에 현재 화면이 Main으로
      변경될 수 있었습니다.

      화면 보정은 권한정보가 준비된 뒤 최초 1회만 수행하고,
      이후 focus/visibility/주기 갱신은 현재 currentView를 건드리지 않습니다.
    */
    if (
      !runtimeAccessReady ||
      navigationAccessInitializedRef.current
    ) {
      return;
    }

    if (
      requestedView &&
      Object.prototype.hasOwnProperty.call(viewTitles, requestedView) &&
      requestedView !== 'messenger' &&
      canAccessView(requestedView, activeProjectName)
    ) {
      setCurrentView(requestedView);
      navigationAccessInitializedRef.current = true;
      return;
    }

    setCurrentView((previousView) => {
      const storedView = readDashboardSessionValue('currentView');
      const candidates = [
        previousView,
        storedView,
        'main',
        'admin-dashboard',
        'approval-inbox',
        'weekly-overview',
        'weekly-overview-archive',
        'organization-chart',
        'daily',
        'progress-input',
      ];

      const allowedView = candidates.find(
        (view) =>
          view &&
          view !== 'messenger' &&
          Object.prototype.hasOwnProperty.call(viewTitles, view) &&
          canAccessView(view, activeProjectName),
      );

      return allowedView || 'main';
    });

    navigationAccessInitializedRef.current = true;`,
  '권한 갱신 시 화면 재지정 방지',
);

// Main 업무알림 당일 숨김 로직은 currentView 선언 이후에 삽입합니다.
dashboard = replaceOnce(
  dashboard,
`  const [savedData, setSavedData] = useState({});`,
`  const workAlertTodayKey = [
    koreaNow.year,
    String(koreaNow.month).padStart(2, '0'),
    String(koreaNow.day).padStart(2, '0'),
  ].join('-');

  const workAlertHiddenStorageKey =
    \`constructionManagementMainWorkAlertHidden:\${user?.id || user?.email || 'anonymous'}:\${workAlertTodayKey}\`;

  /*
    담당자가 Main 화면에 들어올 때마다 확인합니다.
    - 오늘 하루 보지 않기 미선택: Main을 다시 열면 알림이 다시 표시됩니다.
    - 오늘 하루 보지 않기 선택: 한국시간 기준 해당 날짜 동안 표시하지 않습니다.
    - 자정이 지나면 storage key가 달라져 다음 날 다시 표시됩니다.
  */
  useEffect(() => {
    if (userRole !== '담당자' || currentView !== 'main') {
      setWorkAlertOpen(false);
      return;
    }

    try {
      const hiddenToday =
        window.localStorage.getItem(workAlertHiddenStorageKey) === '1';
      setWorkAlertOpen(!hiddenToday);
    } catch (error) {
      console.warn('Main 업무알림 숨김 상태 확인 실패:', error);
      setWorkAlertOpen(true);
    }
  }, [
    currentView,
    userRole,
    workAlertHiddenStorageKey,
  ]);

  const handleCloseWorkAlert = (hideToday = false) => {
    if (hideToday) {
      try {
        window.localStorage.setItem(
          workAlertHiddenStorageKey,
          '1',
        );
      } catch (error) {
        console.warn('Main 업무알림 오늘 숨김 저장 실패:', error);
      }
    }

    setWorkAlertOpen(false);
  };

  const [savedData, setSavedData] = useState({});`,
  '오늘 하루 보지 않기 저장 로직 추가',
);

dashboard = replaceOnce(
  dashboard,
`              onCloseWorkAlert={() =>
                setWorkAlertOpen(false)
              }`,
`              onCloseWorkAlert={handleCloseWorkAlert}`,
  'Main 업무알림 닫기 핸들러 연결',
);

// ---------------------------------------------------------
// 2) MainWorkAlertDialog: 오늘 하루 보지 않기 체크박스
// ---------------------------------------------------------

dialog = replaceOnce(
  dialog,
`  Button,
  Chip,`,
`  Button,
  Checkbox,
  Chip,`,
  'Checkbox import 추가',
);

dialog = replaceOnce(
  dialog,
`  DialogTitle,
  Divider,
  IconButton,`,
`  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,`,
  'FormControlLabel import 추가',
);

dialog = replaceOnce(
  dialog,
`  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');`,
`  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hideToday, setHideToday] = useState(false);`,
  '오늘 하루 보지 않기 state 추가',
);

dialog = replaceOnce(
  dialog,
`  useEffect(() => {
    if (open) {
      loadSummary();
    }
  }, [loadSummary, open]);

  const handleMove = (view) => {
    if (typeof onClose === 'function') {
      onClose();
    }

    if (typeof onNavigate === 'function') {
      onNavigate(view);
    }
  };`,
`  useEffect(() => {
    if (open) {
      setHideToday(false);
      loadSummary();
    }
  }, [loadSummary, open]);

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose(hideToday);
    }
  };

  const handleMove = (view) => {
    if (typeof onClose === 'function') {
      onClose(hideToday);
    }

    if (typeof onNavigate === 'function') {
      onNavigate(view);
    }
  };`,
  '팝업 닫기/이동 시 오늘 숨김 전달',
);

dialog = replaceOnce(
  dialog,
`      open={Boolean(open)}
      onClose={onClose}`,
`      open={Boolean(open)}
      onClose={handleClose}`,
  'Dialog onClose 변경',
);

dialog = replaceOnce(
  dialog,
`              onClick={onClose}
              sx={{ color: '#ffffff' }}`,
`              onClick={handleClose}
              sx={{ color: '#ffffff' }}`,
  '상단 X 닫기 변경',
);

dialog = replaceOnce(
  dialog,
`      <DialogActions
        sx={{
          px: { xs: 1.6, sm: 2.5 },
          py: 1.4,
          justifyContent: 'space-between',
        }}
      >
        <Button
          size="small"
          startIcon={
            loading ? (
              <CircularProgress size={14} />
            ) : (
              <RefreshRoundedIcon />
            )
          }
          onClick={loadSummary}
          disabled={loading}
          sx={{ fontWeight: 800 }}
        >
          새로고침
        </Button>

        <Button
          variant="contained"
          onClick={onClose}
          sx={{ minWidth: 94, fontWeight: 900, boxShadow: 'none' }}
        >
          확인
        </Button>
      </DialogActions>`,
`      <DialogActions
        sx={{
          px: { xs: 1.6, sm: 2.5 },
          py: 1.25,
          gap: 1,
          justifyContent: 'space-between',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexWrap: 'wrap',
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={hideToday}
                onChange={(event) =>
                  setHideToday(event.target.checked)
                }
              />
            }
            label="오늘 하루 보지 않기"
            sx={{
              mr: 0.5,
              '& .MuiFormControlLabel-label': {
                color: '#475569',
                fontSize: '0.78rem',
                fontWeight: 800,
              },
            }}
          />

          <Button
            size="small"
            startIcon={
              loading ? (
                <CircularProgress size={14} />
              ) : (
                <RefreshRoundedIcon />
              )
            }
            onClick={loadSummary}
            disabled={loading}
            sx={{ fontWeight: 800 }}
          >
            새로고침
          </Button>
        </Box>

        <Button
          variant="contained"
          onClick={handleClose}
          sx={{ minWidth: 94, fontWeight: 900, boxShadow: 'none' }}
        >
          확인
        </Button>
      </DialogActions>`,
  '오늘 하루 보지 않기 체크박스 UI 추가',
);

// 최종 마커 검증
const dashboardMarkers = [
  'navigationAccessInitializedRef',
  'constructionManagementMainWorkAlertHidden:',
  'onCloseWorkAlert={handleCloseWorkAlert}',
  '이후 focus/visibility/주기 갱신은 현재 currentView를 건드리지 않습니다.',
];
const dialogMarkers = [
  '오늘 하루 보지 않기',
  'const [hideToday, setHideToday] = useState(false);',
  'onClose={handleClose}',
  'onClose(hideToday);',
];

for (const marker of dashboardMarkers) {
  if (!dashboard.includes(marker)) fail(`Dashboard 적용 후 검증 실패: ${marker}`);
}
for (const marker of dialogMarkers) {
  if (!dialog.includes(marker)) fail(`MainWorkAlertDialog 적용 후 검증 실패: ${marker}`);
}

// 백업
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.18_${stamp}`);
for (const [target, content] of [
  [DASHBOARD, fs.readFileSync(DASHBOARD, 'utf8')],
  [ALERT_DIALOG, fs.readFileSync(ALERT_DIALOG, 'utf8')],
]) {
  const relative = path.relative(ROOT, target);
  const backupTarget = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.writeFileSync(backupTarget, content, 'utf8');
}

fs.writeFileSync(DASHBOARD, dashboard, 'utf8');
fs.writeFileSync(ALERT_DIALOG, dialog, 'utf8');

console.log('\n[v52.18 적용 완료]');
console.log('- 다른 프로그램/브라우저 탭 복귀 시 현재 업무화면 유지');
console.log('- 권한/현장정보의 focus 및 60초 갱신은 계속 유지');
console.log('- 자동 currentView 보정은 로그인 후 최초 1회만 수행');
console.log('- Main 미작성 업무 알림에 "오늘 하루 보지 않기" 추가');
console.log('- 체크 후 X/확인/이동 시 한국시간 해당 날짜 동안 숨김');
console.log('- 다음 날에는 자동으로 다시 표시');
console.log(`- 백업: ${backupDir}`);
console.log('\n다음 명령: npm run build');
