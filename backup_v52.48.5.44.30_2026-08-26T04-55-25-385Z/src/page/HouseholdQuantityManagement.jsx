// v52.48.5.44.29 옵션관리 세대물량관리 좌·우 2분할 기본화면
import React from 'react';
import {
  Box,
  Divider,
  Paper,
  Typography,
} from '@mui/material';
import SystemPageTitle from '../components/SystemPageTitle.jsx';

const WORKSPACE_CONFIGS = [
  {
    key: 'left',
    title: '좌측 작업영역',
  },
  {
    key: 'right',
    title: '우측 작업영역',
  },
];

function QuantityWorkspace({ title }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderColor: '#cbd5e1',
        borderRadius: 1,
        boxShadow: 'none',
        bgcolor: '#ffffff',
      }}
    >
      <Box
        sx={{
          minHeight: 38,
          px: 1.25,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography
          sx={{
            color: '#334155',
            fontSize: '0.76rem',
            fontWeight: 850,
          }}
        >
          {title}
        </Typography>
      </Box>

      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#ffffff',
        }}
      />
    </Paper>
  );
}

export default function HouseholdQuantityManagement({
  projectName = '',
}) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          display: 'flex',
          alignItems: 'center',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <SystemPageTitle
            title="세대물량관리"
            help="세대별 물량을 좌측과 우측 작업영역으로 나누어 관리합니다."
          />
          <Typography
            sx={{
              mt: 0.15,
              color: '#64748b',
              fontSize: '0.67rem',
            }}
          >
            {projectName || '현장명 미등록'} · 세대물량 작업화면
          </Typography>
        </Box>
      </Paper>

      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
          columnGap: 1,
          overflow: 'hidden',
        }}
      >
        <QuantityWorkspace title={WORKSPACE_CONFIGS[0].title} />

        <Divider
          orientation="vertical"
          flexItem
          sx={{
            height: '100%',
            borderColor: '#94a3b8',
          }}
        />

        <QuantityWorkspace title={WORKSPACE_CONFIGS[1].title} />
      </Box>
    </Box>
  );
}
