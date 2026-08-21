import { CircularProgress, IconButton, Tooltip } from '@mui/material';
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
