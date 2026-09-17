import { Box, Paper, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';

export default function DashboardOverviewPlaceholder({ type }) {
  const workforce = type === 'workforce';
  const Icon = workforce ? GroupsOutlinedIcon : TrendingUpOutlinedIcon;
  return (
    <Paper variant="outlined" className={`main-overview-placeholder main-overview-${type}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pb: 1.2, borderBottom: '1px solid #e2e8f0' }}>
        <Icon sx={{ fontSize: 20, color: workforce ? '#00a5b5' : '#0284c7' }} />
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, color: '#172033' }}>
          {workforce ? '인력 현황' : '매출 현황'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, py: 2 }}>
        <Icon sx={{ fontSize: 32, color: '#cbd5e1' }} />
        <Typography sx={{ fontSize: 12, color: '#64748b' }}>데이터 연결 예정</Typography>
      </Box>
    </Paper>
  );
}
