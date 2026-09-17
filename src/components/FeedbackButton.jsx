import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import FeedbackSubmitDialog from './FeedbackSubmitDialog.jsx';

export default function FeedbackButton({
  userId = '',
  userProfile = {},
  currentView = '',
  currentViewLabel = '',
  dashboardScale = 1,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="현재 화면의 건의사항 또는 오류를 제보합니다." arrow>
        <IconButton aria-label="건의·오류 제보" onClick={() => setOpen(true)} sx={{ color: '#475569' }}>
          <ErrorOutlineIcon />
        </IconButton>
      </Tooltip>

      <FeedbackSubmitDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        userProfile={userProfile}
        sourceView={currentView}
        sourceLabel={currentViewLabel}
        dashboardScale={dashboardScale}
      />
    </>
  );
}
