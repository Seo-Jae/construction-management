import React, { useState } from 'react';
import { Button, Tooltip } from '@mui/material';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
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
        <Button
          size="small"
          onClick={() => setOpen(true)}
          startIcon={<FeedbackOutlinedIcon sx={{ fontSize: '0.95rem !important' }} />}
          sx={{
            minWidth: 0,
            height: 32,
            px: 0.95,
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,.34)',
            borderRadius: 1,
            fontSize: '.7rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            '& .MuiButton-startIcon': { mr: 0.45 },
            '&:hover': {
              borderColor: 'rgba(255,255,255,.66)',
              bgcolor: 'rgba(255,255,255,.08)',
            },
          }}
        >
          건의·오류
        </Button>
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
