const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.42';
const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);
const changedFiles = [];

function abs(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  const target = abs(rel);
  if (!fs.existsSync(target)) {
    throw new Error(`[적용 중단] 파일을 찾을 수 없습니다: ${rel}`);
  }
  return fs.readFileSync(target, 'utf8');
}

function backup(rel) {
  const src = abs(rel);
  const dst = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function write(rel, next) {
  const prev = read(rel);
  if (prev === next) {
    console.log(`[유지] ${rel}`);
    return false;
  }
  backup(rel);
  fs.writeFileSync(abs(rel), next, 'utf8');
  changedFiles.push(rel);
  console.log(`[변경] ${rel}`);
  return true;
}

function ensureImport(source, importLine) {
  if (source.includes(importLine)) return source;
  const firstConst = source.search(/\nconst\s/);
  const firstFunction = source.search(/\nfunction\s/);
  let index = -1;
  if (firstConst >= 0 && firstFunction >= 0) index = Math.min(firstConst, firstFunction);
  else index = Math.max(firstConst, firstFunction);
  if (index < 0) {
    throw new Error(`[적용 중단] import 삽입 위치를 찾지 못했습니다: ${importLine}`);
  }
  return `${source.slice(0, index + 1)}${importLine}\n${source.slice(index + 1)}`;
}

function replaceTagBlock(source, tag, needles, replacement, label) {
  const regex = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'g');
  let match;
  while ((match = regex.exec(source)) !== null) {
    const block = match[0];
    if (needles.every((needle) => block.includes(needle))) {
      return source.slice(0, match.index) + replacement + source.slice(match.index + block.length);
    }
  }
  throw new Error(`[적용 중단] ${label} 위치를 찾지 못했습니다.`);
}

function removeTagBlock(source, tag, needles, label) {
  return replaceTagBlock(source, tag, needles, '', label);
}

function replaceExact(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    if (source.includes(newText)) return source;
    throw new Error(`[적용 중단] ${label} 기준 코드를 찾지 못했습니다.`);
  }
  return source.replace(oldText, newText);
}

function addStateAfterMessage(source) {
  if (source.includes('const [guideOpen, setGuideOpen]')) return source;
  const regex = /const\s*\[\s*message\s*,\s*setMessage\s*\]\s*=\s*useState\(null\);/;
  const match = source.match(regex);
  if (!match) {
    throw new Error('[적용 중단] 안내 토스트 상태 삽입 위치를 찾지 못했습니다.');
  }
  return source.replace(
    regex,
    `${match[0]}\n  const [guideOpen, setGuideOpen] = useState(true);`,
  );
}

function createOrReplaceFile(rel, content) {
  const target = abs(rel);
  if (fs.existsSync(target)) {
    const prev = fs.readFileSync(target, 'utf8');
    if (prev === content) {
      console.log(`[유지] ${rel}`);
      return;
    }
    backup(rel);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }
  fs.writeFileSync(target, content, 'utf8');
  changedFiles.push(rel);
  console.log(`[변경] ${rel}`);
}

console.log(`\n=== ${VERSION} 적용 시작 ===`);
console.log('기준: v52.48.5.41 상태를 유지하면서 UI 누락 보정 + 안내 토스트 + 출력일보 미래월 빈양식 + 새로고침 통일');

// -----------------------------------------------------------------------------
// 0) 공통 새로고침 버튼: 근태관리의 RefreshRounded 형태를 전 메뉴에서 동일 사용
// -----------------------------------------------------------------------------
createOrReplaceFile(
  'src/components/SystemRefreshButton.jsx',
`import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

export default function SystemRefreshButton({
  onClick,
  loading = false,
  disabled = false,
  label = '새로고침',
  sx = {},
}) {
  return (
    <Tooltip title={label} arrow>
      <span>
        <IconButton
          type="button"
          size="small"
          aria-label={label}
          onClick={onClick}
          disabled={Boolean(disabled || loading)}
          className="wooklim-system-refresh-button"
          sx={{
            width: '30px !important',
            height: '30px !important',
            minWidth: 30,
            p: '5px !important',
            color: '#475569',
            bgcolor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px !important',
            '&:hover': {
              color: '#2563eb',
              borderColor: '#93c5fd',
              bgcolor: '#eff6ff',
            },
            ...sx,
          }}
        >
          {loading
            ? <CircularProgress size={17} color="inherit" />
            : <RefreshRoundedIcon fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
`,
);

// -----------------------------------------------------------------------------
// 1) 누락된 8개 화면의 대표 제목/도움말을 공통 UI 기준으로 직접 보정
// -----------------------------------------------------------------------------
{
  const rel = 'src/page/AdminDashboard.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  if (!s.includes('help="전체 현장의 금일 출력')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['전체현장 Dashboard'],
      `<SystemPageTitle\n                title="전체현장 Dashboard"\n                help="전체 현장의 금일 출력·일보 등록·공정률·주요일정을 한 화면에서 확인합니다."\n              />`,
      '전체현장 Dashboard 제목',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/AttendanceManagement.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  s = ensureImport(s, "import SystemRefreshButton from '../components/SystemRefreshButton.jsx';");

  // 근태관리 자체도 공통 새로고침 버튼을 사용하게 하여 타 메뉴와 100% 동일하게 맞춥니다.
  if (!s.includes('return <SystemRefreshButton onClick={onClick}')) {
    const start = s.indexOf('function RefreshIconButton(');
    const end = s.indexOf('const emptyNoticeDraft', start);
    if (start < 0 || end < 0) {
      throw new Error('[적용 중단] 근태관리 새로고침 컴포넌트 위치를 찾지 못했습니다.');
    }
    s = s.slice(0, start) +
`function RefreshIconButton({ onClick, loading = false, label = '새로고침' }) {
  return <SystemRefreshButton onClick={onClick} loading={loading} label={label} />;
}

` + s.slice(end);
  }

  if (!s.includes('help="현장에서 본인과 휴대폰을 확인한 뒤 승인하고')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['가입 승인 대기'],
      `<SystemPageTitle\n                  title="가입 승인 대기"\n                  help="현장에서 본인과 휴대폰을 확인한 뒤 승인하고, 승인 대기 중인 근로자 계정을 관리합니다."\n                />`,
      '근태관리 가입 승인 대기 제목',
    );
    s = removeTagBlock(
      s,
      'Typography',
      ['현장에서 본인과 휴대폰을 확인한 뒤 승인하세요.'],
      '근태관리 가입 승인 설명',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/WeeklyOverview.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  s = ensureImport(s, "import SystemRefreshButton from '../components/SystemRefreshButton.jsx';");
  if (!s.includes('help="각 현장의 주간업무를 총괄')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['주간업무총괄 작성'],
      `<SystemPageTitle\n              title="주간업무총괄 작성"\n              help="각 현장의 주간업무를 총괄 양식으로 작성·저장하고 미리보기와 Excel 파일에 반영합니다. 행 추가 내용은 줄 단위로 반영됩니다."\n            />`,
      '주간업무총괄 작성 제목',
    );
    s = removeTagBlock(
      s,
      'Typography',
      ['행 추가 내용은 미리보기와 XLS에'],
      '주간업무총괄 상시 설명',
    );
  }
  if (!s.includes('label="주간업무총괄 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['handleManualReload', '새로고침'],
      `<SystemRefreshButton\n              onClick={handleManualReload}\n              disabled={saving}\n              label="주간업무총괄 새로고침"\n            />`,
      '주간업무총괄 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/DrawingQuantityAnalysis.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  if (!s.includes('help="타입별 DXF 원본과 분석결과를 현장에 저장하고')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['타입별 도면분석'],
      `<SystemPageTitle\n          title="타입별 도면분석"\n          help="타입별 DXF 원본과 분석결과를 현장에 저장하고 WL- 레이어를 기준으로 길이·면적·수량을 분석합니다. 노임·자재 연결 전 도면 물량 확인에 사용합니다."\n        />`,
      '타입별 도면분석 제목',
    );
    s = removeTagBlock(
      s,
      'Typography',
      ['타입별 DXF 원본과 분석결과를 현장에 저장합니다.'],
      '타입별 도면분석 상시 설명',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/UnitPriceAnalysis.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  if (!s.includes('help="1㎡ 기준 재료비·노무비·경비를 산정하고 저장·공유·출력하며 기술자료를 함께 관리합니다."') || s.includes("fontSize: '1.22rem'")) {
    // DB 준비 오류 화면은 이미 SystemPageTitle이므로 정상 화면의 기존 Typography만 교체합니다.
    if (s.includes("<Typography sx={{ fontSize: '1.22rem', fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap' }}>일위대가작성</Typography>")) {
      s = s.replace(
        "<Typography sx={{ fontSize: '1.22rem', fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap' }}>일위대가작성</Typography>",
        `<SystemPageTitle\n              title="일위대가작성"\n              help="1㎡ 기준 재료비·노무비·경비를 산정하고 저장·공유·출력하며 기술자료를 함께 관리합니다."\n            />`,
      );
    } else if (!s.includes('<SystemPageTitle\n              title="일위대가작성"')) {
      throw new Error('[적용 중단] 일위대가작성 정상 화면 제목을 찾지 못했습니다.');
    }
  }
  write(rel, s);
}

{
  const rel = 'src/page/ProgressClaimManagement.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  if (!s.includes('help="계약 기성내역을 불러와 직접공사비 기준')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['기성내역서 작성 · 직접비'],
      `<SystemPageTitle\n                  title="기성내역서 작성 · 직접비"\n                  help="계약 기성내역을 불러와 직접공사비 기준으로 금월·누계 기성을 작성하고 공정 연결값과 수량을 검토합니다."\n                />`,
      '기성내역서 작성 제목',
    );
    s = removeTagBlock(
      s,
      'Typography',
      ['엑셀 최종값만 읽으며 직접비만 반영합니다.'],
      '기성내역서 상시 설명',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/ReportDocumentList.jsx';
  let s = read(rel);
  s = ensureImport(s, "import SystemPageTitle from '../components/SystemPageTitle.jsx';");
  if (!s.includes('주간 업무 보고 문서를 작성·저장하고 결재 진행상태')) {
    s = replaceTagBlock(
      s,
      'Typography',
      ['{reportName}'],
      `<SystemPageTitle\n              title={reportName}\n              help={\n                reportType === 'weekly'\n                  ? '주간 업무 보고 문서를 작성·저장하고 결재 진행상태와 작성 문서를 관리합니다.'\n                  : '품의 보고 문서를 작성·저장하고 결재 요청·진행상태와 작성 문서를 관리합니다.'\n              }\n            />`,
      '업무보고 공통 제목',
    );
  }
  write(rel, s);
}

// -----------------------------------------------------------------------------
// 2) 월별 노임작성 / 근로자 정보관리의 상시 안내를 진입 시 5.2초 토스트로 변경
// -----------------------------------------------------------------------------
{
  const rel = 'src/page/MonthlyLaborManagement.jsx';
  let s = read(rel);
  s = addStateAfterMessage(s);
  if (!s.includes('autoHideDuration={5200}')) {
    s = replaceTagBlock(
      s,
      'Alert',
      ['현장과 작성월별로 필요한 근로자를 조회·선별하고'],
      `<Snackbar\n        open={guideOpen}\n        autoHideDuration={5200}\n        onClose={(_event, reason) => {\n          if (reason !== 'clickaway') setGuideOpen(false);\n        }}\n        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}\n        sx={{ top: '72px !important' }}\n      >\n        <Alert\n          severity="info"\n          variant="filled"\n          onClose={() => setGuideOpen(false)}\n          sx={{ maxWidth: 760, fontSize: '0.72rem', lineHeight: 1.55 }}\n        >\n          현장과 작성월별로 필요한 근로자를 조회·선별하고 개인정보를 모아 Excel 다운로드 준비를 합니다. 실제 출역일자·일급·노임금액 입력과 노임 계산은 다운로드한 Excel에서 진행합니다.\n        </Alert>\n      </Snackbar>`,
      '월별 노임작성 상시 안내',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/WorkerMasterManagement.jsx';
  let s = read(rel);
  s = addStateAfterMessage(s);
  if (!s.includes('보호정보로 암호화 저장합니다. 목록과 수정화면에는 기존 원문을 다시 표시하지 않습니다.</Alert>')) {
    s = replaceTagBlock(
      s,
      'Alert',
      ['주민등록번호·전체 연락처·주소·국적·은행·'],
      `<Snackbar\n        open={guideOpen}\n        autoHideDuration={5200}\n        onClose={(_event, reason) => {\n          if (reason !== 'clickaway') setGuideOpen(false);\n        }}\n        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}\n        sx={{ top: '72px !important' }}\n      >\n        <Alert\n          severity="info"\n          variant="filled"\n          onClose={() => setGuideOpen(false)}\n          sx={{ maxWidth: 760, fontSize: '0.72rem', lineHeight: 1.55 }}\n        >\n          주민등록번호·전체 연락처·주소·국적·은행·계좌번호·예금주는 보호정보로 암호화 저장합니다. 목록과 수정화면에는 기존 원문을 다시 표시하지 않습니다.\n        </Alert>\n      </Snackbar>`,
      '근로자 정보관리 상시 안내',
    );
  }
  write(rel, s);
}

// -----------------------------------------------------------------------------
// 3) 출력일보 금월 다운로드: 현재월=1일~오늘 / 과거월=1일~말일 / 미래월=빈양식 1일~말일
// -----------------------------------------------------------------------------
{
  const rel = 'src/Dashboard.jsx';
  let s = read(rel);
  const oldText = `      const year = todayMidnight.getFullYear();\n      const monthIndex = todayMidnight.getMonth();\n      const month = monthIndex + 1;\n      const lastDay = todayMidnight.getDate();`;
  const newText = `      // v52.48.5.42: 화면에서 선택한 월을 기준으로 월간 출력일보를 생성합니다.\n      // 현재월은 오늘까지, 과거/미래월은 해당 월 말일까지 생성합니다.\n      // 미래월은 savedData가 없으므로 자연스럽게 빈 출력일보 양식으로 생성됩니다.\n      const year = viewYear;\n      const monthIndex = viewMonth;\n      const month = monthIndex + 1;\n      const currentYear = todayMidnight.getFullYear();\n      const currentMonthIndex = todayMidnight.getMonth();\n      const currentMonthValue = currentYear * 12 + currentMonthIndex;\n      const selectedMonthValue = year * 12 + monthIndex;\n      const isCurrentMonth = selectedMonthValue === currentMonthValue;\n      const isFutureMonth = selectedMonthValue > currentMonthValue;\n      const lastDay = isCurrentMonth\n        ? todayMidnight.getDate()\n        : new Date(year, monthIndex + 1, 0).getDate();`;
  s = replaceExact(s, oldText, newText, '출력일보 월간 다운로드 기준월');

  const monthlyWorkerOld = `      for (let day = 1; day <= lastDay; day += 1) {\n        const targetDate = new Date(year, monthIndex, day);\n        const dateStr = formatYYMMDD(targetDate);\n        const workers = savedData[dateStr]?.workers || [];`;
  const monthlyWorkerNew = `      for (let day = 1; day <= lastDay; day += 1) {\n        const targetDate = new Date(year, monthIndex, day);\n        const dateStr = formatYYMMDD(targetDate);\n        const workers = isFutureMonth\n          ? []\n          : (savedData[dateStr]?.workers || []);`;
  s = replaceExact(s, monthlyWorkerOld, monthlyWorkerNew, '출력일보 미래월 빈양식');
  write(rel, s);
}

// -----------------------------------------------------------------------------
// 4) 새로고침 버튼을 근태관리와 같은 공통 아이콘 버튼으로 통일
// -----------------------------------------------------------------------------
const refreshImport = "import SystemRefreshButton from '../components/SystemRefreshButton.jsx';";

{
  const rel = 'src/page/UserManagement.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="회원관리 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['onClick={loadAccounts}', '새로고침'],
      `<SystemRefreshButton\n            onClick={loadAccounts}\n            loading={loading}\n            disabled={bulkProcessing}\n            label="회원관리 새로고침"\n          />`,
      '회원관리 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/WeeklyOverviewArchive.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="주간업무보관 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['loadItems', '새로고침'],
      `<SystemRefreshButton\n            onClick={loadItems}\n            loading={loading}\n            label="주간업무보관 새로고침"\n          />`,
      '주간업무보관 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/CumulativeWorkerStatus.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="누계투입조회 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['loadData', '새로고침'],
      `<SystemRefreshButton\n              onClick={loadData}\n              loading={loading}\n              label="누계투입조회 새로고침"\n            />`,
      '누계투입조회 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/MultiProcessProgress.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="다중 공종 진척 현황 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['setRefreshKey', 'RefreshIcon'],
      `<SystemRefreshButton\n          onClick={() => setRefreshKey((previous) => previous + 1)}\n          loading={loading || targetLoading}\n          disabled={selectedProcesses.length === 0}\n          label="다중 공종 진척 현황 새로고침"\n        />`,
      '다중 공종 진척 현황 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/DailyCompletionSummary.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="일별 완료 집계 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['setRefreshKey', 'RefreshIcon'],
      `<SystemRefreshButton\n            onClick={() => setRefreshKey((previous) => previous + 1)}\n            loading={loading}\n            label="일별 완료 집계 새로고침"\n          />`,
      '일별 완료 집계 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/CompletionSummary.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes("label={`${isMonthly ? '월별' : '주별'} 완료 집계 새로고침`}")) {
    s = replaceTagBlock(
      s,
      'Button',
      ['setRefreshKey', 'RefreshIcon'],
      `<SystemRefreshButton\n            onClick={() => setRefreshKey((previous) => previous + 1)}\n            loading={loading}\n            label={\`${'${'}isMonthly ? '월별' : '주별'${'}'} 완료 집계 새로고침\`}\n          />`,
      '주별/월별 완료 집계 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/MaterialInputStatus.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="자재투입현황 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['loadActiveSnapshot', 'RefreshIcon'],
      `<SystemRefreshButton\n            onClick={loadActiveSnapshot}\n            loading={loading}\n            label="자재투입현황 새로고침"\n          />`,
      '자재투입현황 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/ContractItemProcessMapping.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="계약품목 공정연결 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['handleReload', '새로고침'],
      `<SystemRefreshButton\n            onClick={handleReload}\n            loading={loading}\n            label="계약품목 공정연결 새로고침"\n          />`,
      '계약품목 공정연결 새로고침',
    );
  }
  write(rel, s);
}

{
  const rel = 'src/page/LaborCostManagement.jsx';
  let s = read(rel);
  s = ensureImport(s, refreshImport);
  if (!s.includes('label="공정별 노임작성 새로고침"')) {
    s = replaceTagBlock(
      s,
      'Button',
      ['loadOverview', 'loadUnitTypes', '새로고침'],
      `<SystemRefreshButton\n              onClick={() => {\n                loadOverview();\n                loadUnitTypes();\n                loadQuantities();\n                loadMonthly();\n              }}\n              loading={overviewLoading || quantityLoading || monthlyLoading}\n              label="공정별 노임작성 새로고침"\n            />`,
      '공정별 노임작성 새로고침',
    );
  }
  write(rel, s);
}

// -----------------------------------------------------------------------------
// 적용 결과
// -----------------------------------------------------------------------------
const report = {
  version: VERSION,
  appliedAt: new Date().toISOString(),
  backupRoot: path.relative(ROOT, backupRoot),
  changedFiles,
};
const releaseFolder = `release_${VERSION}`;
fs.mkdirSync(path.join(ROOT, releaseFolder), { recursive: true });
const reportPath = path.join(ROOT, releaseFolder, 'apply-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`\n=== ${VERSION} 적용 완료 ===`);
console.log(`변경 파일: ${changedFiles.length}개`);
changedFiles.forEach((file) => console.log(` - ${file}`));
console.log(`백업: ${path.relative(ROOT, backupRoot)}`);
console.log('SQL 변경 없음');
