const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const VERSION = 'v52.48.5.40';
const files = {
  theme: path.join(ROOT, 'src', 'theme.js'),
  dashboard: path.join(ROOT, 'src', 'Dashboard.jsx'),
  user: path.join(ROOT, 'src', 'page', 'UserManagement.jsx'),
  approval: path.join(ROOT, 'src', 'page', 'ApprovalInbox.jsx'),
  org: path.join(ROOT, 'src', 'page', 'OrganizationChart.jsx'),
  common: path.join(ROOT, 'src', 'components', 'SystemPageTitle.jsx'),
};

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

for (const [name, filePath] of Object.entries(files)) {
  if (name === 'common') continue;
  if (!fs.existsSync(filePath)) fail(`${path.relative(ROOT, filePath)} 파일을 찾을 수 없습니다.`);
}

const original = {
  theme: fs.readFileSync(files.theme, 'utf8'),
  dashboard: fs.readFileSync(files.dashboard, 'utf8'),
  user: fs.readFileSync(files.user, 'utf8'),
  approval: fs.readFileSync(files.approval, 'utf8'),
  org: fs.readFileSync(files.org, 'utf8'),
};

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    fail(`${label} 기준 문자열을 정확히 1개 찾지 못했습니다. 현재 변경을 보호하기 위해 자동 적용하지 않았습니다. (찾은 개수: ${count})`);
  }
  return source.replace(search, replacement);
}

// 현재 기준 버전 보호용 핵심 앵커 확인
if (!original.theme.includes('export const appTheme = createTheme')) {
  fail('src/theme.js가 예상 구조와 다릅니다.');
}
if (!original.dashboard.includes('component="main"')) {
  fail('src/Dashboard.jsx의 메인 업무영역 구조가 예상과 다릅니다.');
}
if (!original.user.includes('회원관리') || !original.user.includes('기존 계정 전체 사용중지')) {
  fail('src/page/UserManagement.jsx가 예상 기준과 다릅니다.');
}
if (!original.approval.includes('결재함') || !original.approval.includes('결재함 새로고침')) {
  fail('src/page/ApprovalInbox.jsx가 예상 기준과 다릅니다.');
}
if (!original.org.includes('욱림건설 조직도') || !original.org.includes('조직\n')) {
  fail('src/page/OrganizationChart.jsx가 예상 기준과 다릅니다.');
}

const newTheme = `import { createTheme } from '@mui/material/styles';

// v52.48.5.40 공통 UI v1
// 내부 업무화면(.wooklim-admin-ui)에만 적용하며 로그인/근로자 포털은 건드리지 않습니다.
export const UI_FONT_FAMILY =
  '"Roboto", "Helvetica", "Arial", sans-serif';

export const UI_TOKENS = Object.freeze({
  pageTitleSize: 18,
  pageTitleWeight: 700,
  sectionTitleSize: 13,
  bodySize: 12,
  captionSize: 11,
  controlHeight: 30,
  tabHeight: 32,
  cardRadius: 4,
  border: '#d8e0ea',
  borderStrong: '#cbd5e1',
  surface: '#ffffff',
  surfaceSubtle: '#f8fafc',
  pageBackground: '#f3f6fa',
  text: '#172033',
  textSecondary: '#667085',
  primary: '#2563eb',
});

export const appTheme = createTheme({
  shape: {
    borderRadius: UI_TOKENS.cardRadius,
  },
  palette: {
    primary: { main: UI_TOKENS.primary },
    background: {
      default: UI_TOKENS.pageBackground,
      paper: UI_TOKENS.surface,
    },
    divider: UI_TOKENS.border,
    text: {
      primary: UI_TOKENS.text,
      secondary: UI_TOKENS.textSecondary,
    },
  },
  typography: {
    fontFamily: UI_FONT_FAMILY,
    fontSize: UI_TOKENS.bodySize,
    button: {
      fontFamily: UI_FONT_FAMILY,
      fontWeight: 700,
      textTransform: 'none',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': {
          fontFamily: UI_FONT_FAMILY,
        },
        'button, input, textarea, select': {
          fontFamily: 'inherit',
        },
        '.wooklim-admin-ui': {
          fontFamily: UI_FONT_FAMILY,
          color: UI_TOKENS.text,
        },
        '.wooklim-admin-ui .MuiPaper-root': {
          borderRadius: '4px !important',
          backgroundImage: 'none !important',
        },
        '.wooklim-admin-ui .MuiPaper-outlined': {
          borderColor: UI_TOKENS.border + ' !important',
          boxShadow: 'none !important',
        },
        '.wooklim-admin-ui .MuiButton-root': {
          minHeight: '30px !important',
          borderRadius: '4px !important',
          paddingTop: '4px !important',
          paddingBottom: '4px !important',
          fontSize: '12px !important',
          lineHeight: '1.2 !important',
          fontWeight: '700 !important',
          textTransform: 'none !important',
          boxShadow: 'none !important',
        },
        '.wooklim-admin-ui .MuiButton-outlined': {
          borderColor: UI_TOKENS.borderStrong + ' !important',
        },
        '.wooklim-admin-ui .MuiIconButton-root:not(.wooklim-help-button)': {
          width: '30px !important',
          height: '30px !important',
          padding: '5px !important',
          borderRadius: '4px !important',
        },
        '.wooklim-admin-ui .MuiToggleButton-root': {
          minHeight: '30px !important',
          padding: '4px 10px !important',
          borderRadius: '4px !important',
          fontSize: '12px !important',
          lineHeight: '1.2 !important',
          fontWeight: '700 !important',
          textTransform: 'none !important',
        },
        '.wooklim-admin-ui .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': {
          minHeight: '30px !important',
          borderRadius: '4px !important',
        },
        '.wooklim-admin-ui .MuiOutlinedInput-input.MuiInputBase-inputSizeSmall': {
          paddingTop: '5px !important',
          paddingBottom: '5px !important',
          fontSize: '12px !important',
        },
        '.wooklim-admin-ui .MuiSelect-select': {
          minHeight: 'unset !important',
          fontSize: '12px !important',
        },
        '.wooklim-admin-ui .MuiInputLabel-root': {
          fontSize: '12px !important',
        },
        '.wooklim-admin-ui .MuiFormHelperText-root': {
          marginTop: '3px !important',
          fontSize: '10px !important',
          lineHeight: '1.25 !important',
        },
        '.wooklim-admin-ui .MuiTabs-root': {
          minHeight: '32px !important',
        },
        '.wooklim-admin-ui .MuiTab-root': {
          minHeight: '32px !important',
          height: '32px !important',
          minWidth: '72px !important',
          padding: '5px 12px !important',
          fontSize: '12px !important',
          fontWeight: '700 !important',
          textTransform: 'none !important',
        },
        '.wooklim-admin-ui .MuiChip-root': {
          minHeight: '22px !important',
          height: '22px !important',
          borderRadius: '4px !important',
          fontSize: '11px !important',
          fontWeight: '700 !important',
        },
        '.wooklim-admin-ui .MuiChip-label': {
          paddingLeft: '7px !important',
          paddingRight: '7px !important',
        },
        '.wooklim-admin-ui .MuiTableCell-root': {
          borderColor: '#e5eaf0 !important',
          fontSize: '12px',
        },
        '.wooklim-admin-ui .MuiTableCell-head': {
          backgroundColor: '#f8fafc',
          color: '#334155',
          fontWeight: '700',
        },
        '.wooklim-admin-ui .MuiAlert-root': {
          borderRadius: '4px !important',
          fontSize: '12px !important',
        },
        '.wooklim-admin-ui .MuiDivider-root': {
          borderColor: UI_TOKENS.border + ' !important',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          maxWidth: 340,
          padding: '7px 9px',
          borderRadius: 4,
          backgroundColor: '#1e293b',
          fontSize: 11,
          lineHeight: 1.5,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          border: '1px solid #d8e0ea',
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 6,
        },
      },
    },
  },
});
`;

const systemPageTitle = `import { useState } from 'react';
import {
  Box,
  IconButton,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { UI_TOKENS } from '../theme.js';

export default function SystemPageTitle({
  title,
  help = '',
  meta = '',
  titleComponent = 'h2',
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const hasHelp = Boolean(help);

  const closeHelp = () => setAnchorEl(null);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, minWidth: 0 }}>
        <Typography
          component={titleComponent}
          className="wooklim-system-page-title"
          sx={{
            m: 0,
            color: UI_TOKENS.text,
            fontSize: UI_TOKENS.pageTitleSize + 'px',
            lineHeight: 1.25,
            fontWeight: UI_TOKENS.pageTitleWeight,
            letterSpacing: '-0.015em',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>

        {hasHelp && (
          <>
            <Tooltip title={help} arrow enterDelay={350}>
              <IconButton
                size="small"
                className="wooklim-help-button"
                aria-label={title + ' 화면 안내'}
                onClick={(event) => setAnchorEl(event.currentTarget)}
                sx={{
                  width: '24px !important',
                  height: '24px !important',
                  minWidth: 24,
                  p: '3px !important',
                  color: '#64748b',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  '&:hover': {
                    color: '#2563eb',
                    borderColor: '#93c5fd',
                    bgcolor: '#eff6ff',
                  },
                }}
              >
                <ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            <Popover
              open={Boolean(anchorEl)}
              anchorEl={anchorEl}
              onClose={closeHelp}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <Box sx={{ width: 330, maxWidth: 'calc(100vw - 32px)', p: 1.25 }}>
                <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 800 }}>
                  화면 안내
                </Typography>
                <Typography sx={{ mt: 0.55, color: '#64748b', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {help}
                </Typography>
              </Box>
            </Popover>
          </>
        )}
      </Box>

      {meta ? (
        <Typography
          className="wooklim-system-page-meta"
          sx={{
            mt: 0.25,
            color: UI_TOKENS.textSecondary,
            fontSize: UI_TOKENS.captionSize + 'px',
            lineHeight: 1.35,
            whiteSpace: 'normal',
          }}
        >
          {meta}
        </Typography>
      ) : null}
    </Box>
  );
}
`;

let dashboard = original.dashboard;
dashboard = replaceOnce(
  dashboard,
  '<Box\n        component="main"\n        sx={{',
  '<Box\n        component="main"\n        className="wooklim-admin-ui"\n        sx={{',
  'Dashboard 공통 UI 범위',
);

let user = original.user;
user = replaceOnce(
  user,
  "import KoreanDatePicker from '../components/KoreanDatePicker.jsx';",
  "import KoreanDatePicker from '../components/KoreanDatePicker.jsx';\nimport SystemPageTitle from '../components/SystemPageTitle.jsx';",
  '회원관리 공통 제목 import',
);
const userOld = `        <Box>\n          <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>\n            회원관리\n          </Typography>\n          <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.68rem' }}>\n            왼쪽에서 회원을 선택한 뒤 오른쪽에서 기본정보와 접근현장을 설정합니다.\n          </Typography>\n        </Box>`;
const userNew = `        <SystemPageTitle\n          title="회원관리"\n          help={'왼쪽 회원목록에서 계정을 선택한 뒤 기본정보, 현장배정, 직급 및 메뉴별 조회·수정 권한을 설정합니다.'}\n        />`;
user = replaceOnce(user, userOld, userNew, '회원관리 상단 제목');
user = replaceOnce(
  user,
  "                      borderRadius: '10px',",
  "                      borderRadius: 1,",
  '회원목록 카드 모서리',
);

let approval = original.approval;
approval = replaceOnce(
  approval,
  "import ApprovalReportViewer, {\n  downloadApprovalReportExcel,\n} from './ApprovalReportViewer.jsx';",
  "import ApprovalReportViewer, {\n  downloadApprovalReportExcel,\n} from './ApprovalReportViewer.jsx';\nimport SystemPageTitle from '../components/SystemPageTitle.jsx';",
  '결재함 공통 제목 import',
);
const approvalOld = `          <Box>\n            <Typography\n              sx={{\n                color: '#1e293b',\n                fontSize: '0.98rem',\n                fontWeight: 900,\n              }}\n            >\n              결재함\n            </Typography>\n            <Typography\n              sx={{\n                mt: 0.2,\n                color: '#64748b',\n                fontSize: '0.7rem',\n              }}\n            >\n              {userLabel || '-'} · 지금 처리할 결재{' '}\n              {pendingCount.toLocaleString()}건 · 처리 결과{' '}\n              {requesterResultCount.toLocaleString()}건\n            </Typography>\n          </Box>`;
const approvalNew = `          <SystemPageTitle\n            title="결재함"\n            help={'내 결재 요청과 처리 결과를 상태별로 확인하고, 결재 문서를 미리보기·다운로드하거나 승인·반려 처리할 수 있습니다.'}\n            meta={\`${'${userLabel || \'-\'}'} · 지금 처리할 결재 ${'${pendingCount.toLocaleString()}'}건 · 처리 결과 ${'${requesterResultCount.toLocaleString()}'}건\`}\n          />`;
approval = replaceOnce(approval, approvalOld, approvalNew, '결재함 상단 제목');

let org = original.org;
org = replaceOnce(
  org,
  "import { UI_FONT_FAMILY } from '../theme.js';",
  "import { UI_FONT_FAMILY } from '../theme.js';\nimport SystemPageTitle from '../components/SystemPageTitle.jsx';",
  '조직도 공통 제목 import',
);
const orgOld = `        <Stack direction="row" spacing={1.2} alignItems="center">\n          <Box\n            sx={{\n              width: 28,\n              height: 28,\n              borderRadius: 1,\n              bgcolor: '#ccfbf1',\n              color: '#0f766e',\n              display: 'grid',\n              placeItems: 'center',\n              fontSize: '0.68rem',\n              fontWeight: 900,\n            }}\n          >\n            조직\n          </Box>\n          <Box>\n            <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>\n              욱림건설 조직도\n            </Typography>\n            <Typography sx={{ color: '#64748b', fontSize: '0.68rem' }}>\n              {layoutMode\n                ? '부서 제목을 끌면 하위 조직 전체가 함께 이동하고, 가로 분기선을 위·아래로 끌면 높이가 24px 격자에 맞춰 저장됩니다.'\n                : '빈 화면을 끌어 이동하고 마우스 위치에서 휠로 확대·축소할 수 있습니다.'}\n              {latestUpdatedAt\n                ? \` 최종 수정 ${'${formatDateTime(latestUpdatedAt)}'}\`\n                : ''}\n            </Typography>\n          </Box>\n        </Stack>`;
const orgNew = `        <SystemPageTitle\n          title="욱림건설 조직도"\n          help={\n            layoutMode\n              ? '배치 편집에서는 부서 제목을 끌면 하위 조직 전체가 함께 이동합니다. 가로 분기선은 위·아래로 이동할 수 있으며 24px 격자에 맞춰 저장됩니다.'\n              : '빈 화면을 마우스로 끌어 이동하고, 마우스 위치에서 휠로 확대·축소할 수 있습니다. 최고관리자는 배치 편집과 조직정보 수정 기능을 사용할 수 있습니다.'\n          }\n          meta={latestUpdatedAt ? '최종 수정 ' + formatDateTime(latestUpdatedAt) : ''}\n        />`;
org = replaceOnce(org, orgOld, orgNew, '조직도 상단 제목/조직 배지 제거');

// 모든 준비가 끝난 뒤에만 실제 파일을 변경합니다.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);
for (const [name, filePath] of Object.entries(files)) {
  if (name === 'common') continue;
  const relative = path.relative(ROOT, filePath);
  const backupPath = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
}
if (fs.existsSync(files.common)) {
  const relative = path.relative(ROOT, files.common);
  const backupPath = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(files.common, backupPath);
}

fs.mkdirSync(path.dirname(files.common), { recursive: true });
fs.writeFileSync(files.theme, newTheme, 'utf8');
fs.writeFileSync(files.dashboard, dashboard, 'utf8');
fs.writeFileSync(files.user, user, 'utf8');
fs.writeFileSync(files.approval, approval, 'utf8');
fs.writeFileSync(files.org, org, 'utf8');
fs.writeFileSync(files.common, systemPageTitle, 'utf8');

console.log('');
console.log(`=== ${VERSION} 공통 UI v1 적용 완료 ===`);
console.log(`백업: ${path.relative(ROOT, backupRoot)}`);
console.log('변경 파일:');
console.log(' - src/theme.js');
console.log(' - src/Dashboard.jsx');
console.log(' - src/components/SystemPageTitle.jsx');
console.log(' - src/page/UserManagement.jsx');
console.log(' - src/page/ApprovalInbox.jsx');
console.log(' - src/page/OrganizationChart.jsx');
console.log('');
console.log('공통 규격: 제목 18px/700, 버튼·입력 30px, 탭 32px, 카드 radius 4px, 공통 테두리/도움말 UI');
