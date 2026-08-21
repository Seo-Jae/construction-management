import { createTheme } from '@mui/material/styles';

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
