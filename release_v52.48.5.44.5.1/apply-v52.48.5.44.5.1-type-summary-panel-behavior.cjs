const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.5.1';
const TARGET = path.resolve(process.cwd(), 'src/page/ProgressInput.jsx');
const BASE_MARKER = '// v52.48.5.44.5 공정별 현황 입력 타입별 세대현황 플로팅 패널';
const VERSION_MARKER = '// v52.48.5.44.5.1 타입현황 위치·최소화·닫기 동작 보정';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }

  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!source.includes(BASE_MARKER)) {
  fail('v52.48.5.44.5 기준 파일이 아닙니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.5.1_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/page/ProgressInput.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);

source = replaceOnce(
  source,
  "import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';\n",
  '',
  '닫힘 재열기 아이콘 import 제거',
);

source = replaceOnce(
  source,
`const TYPE_SUMMARY_PANEL_WIDTH = 328;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = 286;`,
`const TYPE_SUMMARY_PANEL_WIDTH = 328;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = TYPE_SUMMARY_PANEL_WIDTH;`,
  '최소화 폭 고정',
);

source = replaceOnce(
  source,
  '  )}:type-summary-panel`;',
  '  )}:type-summary-panel-v2`;',
  '타입현황 위치 저장키 초기화',
);

source = replaceOnce(
  source,
`    minimized: false,
    closed: false,
    x: Math.max(
      12,
      viewportWidth -
        TYPE_SUMMARY_PANEL_WIDTH -
        18,
    ),
    y: 128,`,
`    minimized: false,
    x: Math.max(
      12,
      viewportWidth -
        TYPE_SUMMARY_PANEL_WIDTH -
        18,
    ),
    // 상단 공정선택 + 방통설정 영역과 겹치지 않도록 기본 위치를 하단으로 내립니다.
    y: 164,`,
  '기본 위치 하단 이동',
);

source = replaceOnce(
  source,
`    return {
      minimized:
        parsed?.minimized === true,
      closed:
        parsed?.closed === true,
      x: Number.isFinite(Number(parsed?.x))
        ? Number(parsed.x)
        : fallback.x,`,
`    return {
      minimized:
        parsed?.minimized === true,
      x: Number.isFinite(Number(parsed?.x))
        ? Number(parsed.x)
        : fallback.x,`,
  '닫힘 상태 localStorage 조회 제거',
);

source = replaceOnce(
  source,
`      JSON.stringify({
        minimized:
          panelState?.minimized === true,
        closed:
          panelState?.closed === true,
        x: Number(panelState?.x) || 0,`,
`      JSON.stringify({
        minimized:
          panelState?.minimized === true,
        x: Number(panelState?.x) || 0,`,
  '닫힘 상태 localStorage 저장 제거',
);

source = replaceOnce(
  source,
`  const [
    typeSummaryPanelState,
    setTypeSummaryPanelState,
  ] = useState(() =>
    readStoredTypeSummaryPanelState(
      projectName,
    ),
  );

  const typeSummaryDragRef =`,
`  const [
    typeSummaryPanelState,
    setTypeSummaryPanelState,
  ] = useState(() =>
    readStoredTypeSummaryPanelState(
      projectName,
    ),
  );

  /*
    닫기(X)는 현재 공정별 현황 입력 화면을 떠날 때까지만 유지합니다.
    - 공정 변경: 다시 나타나지 않음
    - 다른 메뉴 이동 후 재진입: 다시 나타남
    - F5 새로고침: 다시 나타남
  */
  const [
    typeSummaryPanelClosed,
    setTypeSummaryPanelClosed,
  ] = useState(false);

  const typeSummaryDragRef =`,
  '세션성 닫힘 state 추가',
);

source = replaceOnce(
  source,
`  const closeTypeSummaryPanel =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          closed: true,
        }),
      );
    };

  const reopenTypeSummaryPanel =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          closed: false,
          minimized: false,
        }),
      );
    };`,
`  const closeTypeSummaryPanel =
    () => {
      setTypeSummaryPanelClosed(
        true,
      );
      typeSummaryDragRef.current =
        null;
    };`,
  '닫기 동작 세션 전용',
);

source = replaceOnce(
  source,
`      {!typeSummaryPanelState.closed ? (
        <Paper`,
`      {!typeSummaryPanelClosed && (
        <Paper`,
  '플로팅 패널 표시 조건',
);

source = replaceOnce(
  source,
`        </Paper>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <GridViewRoundedIcon
              sx={{
                fontSize:
                  '15px !important',
              }}
            />
          }
          onClick={
            reopenTypeSummaryPanel
          }
          sx={{
            position: 'fixed',
            right: 14,
            top: 128,
            zIndex: 1350,
            minWidth: 0,
            px: 0.9,
            py: 0.4,
            color: '#475569',
            borderColor:
              '#cbd5e1',
            bgcolor: '#ffffff',
            fontSize: '0.65rem',
            fontWeight: 800,
            boxShadow:
              '0 6px 16px rgba(15,23,42,0.12)',
            '&:hover': {
              bgcolor: '#f8fafc',
              borderColor:
                '#94a3b8',
            },
          }}
        >
          타입 현황
        </Button>
      )}`,
`        </Paper>
      )}`,
  '닫은 뒤 재열기 버튼 완전 제거',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressInput.jsx');
console.log('- 기본 위치: 상단 조작영역 아래(y=164)로 이동');
console.log('- 최소화: 펼친 상태와 동일한 328px 폭 유지');
console.log('- 닫기: 버튼까지 완전히 숨김');
console.log('- 닫은 뒤 공정 변경: 다시 나타나지 않음');
console.log('- F5 또는 다른 메뉴 이동 후 재진입: 다시 표시');
console.log('- 드래그 위치/최소화 상태는 현장별로 계속 기억');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
