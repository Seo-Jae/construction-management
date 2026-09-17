// Match the notice dialog's heading and body typography within these dialogs only.
export const mainDialogTypography = {
  '& .MuiDialogTitle-root': {
    py: 1.5,
    color: '#0f172a',
    fontSize: '1.05rem',
    fontWeight: 900,
  },
  '& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiButton-root, & .MuiAlert-message': {
    fontSize: '0.88rem',
  },
  '& .MuiInputBase-root': { color: '#334155', lineHeight: 1.85 },
  '& .MuiInputLabel-root, & .MuiButton-root': { fontWeight: 700 },
  '& .MuiFormHelperText-root': { fontSize: '0.72rem' },
};
