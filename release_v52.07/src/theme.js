import { createTheme } from '@mui/material/styles';

// 왼쪽 메뉴에서 사용하는 MUI 기본 글꼴 계열을 일반 화면의 공통 글꼴로 사용한다.
// 출력 양식과 담당자 서명란은 각 화면에 명시된 전용 글꼴을 그대로 유지한다.
export const UI_FONT_FAMILY =
  '"Roboto", "Helvetica", "Arial", sans-serif';

export const appTheme = createTheme({
  typography: {
    fontFamily: UI_FONT_FAMILY,
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
      },
    },
  },
});
