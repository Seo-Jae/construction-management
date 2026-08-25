import { useState } from 'react';
import {
  Box,
  IconButton,
  Popover,
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
            
              <IconButton
                size="small"
                className="wooklim-help-button"
                aria-label={title + ' 화면 안내'}
                aria-haspopup="dialog"
                aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
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
