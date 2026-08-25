// v52.48.5.44.12 옵션관리 골구도 기본화면
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import BuildingGrid from '../BuildingGrid.jsx';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import { countUniqueUnits } from '../utils/buildingUnits.js';

const MODE_CONFIG = {
  insulation: {
    title: '옵션현황(단열)',
    help: '현장 골구도를 기준으로 세대별 단열 옵션 현황을 관리합니다.',
    category: '단열 옵션',
    accent: '#0284c7',
  },
  selection: {
    title: '옵션현황(선택)',
    help: '현장 골구도를 기준으로 세대별 선택 옵션 현황을 관리합니다.',
    category: '선택 옵션',
    accent: '#0f766e',
  },
  comparison: {
    title: '옵션별 비교',
    help: '같은 세대의 여러 옵션을 한 골구도에서 비교합니다.',
    category: '옵션 비교',
    accent: '#7c3aed',
  },
};

export default function OptionManagementOverview({
  projectName = '',
  buildingConfigs = {},
  mode = 'insulation',
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const pageConfig = MODE_CONFIG[mode] || MODE_CONFIG.insulation;
  const isComparison = mode === 'comparison';

  const buildingEntries = useMemo(
    () =>
      Object.entries(buildingConfigs || {}).sort(([first], [second]) =>
        first.localeCompare(second, 'ko', { numeric: true }),
      ),
    [buildingConfigs, refreshKey],
  );

  const totalUnits = useMemo(
    () =>
      buildingEntries.reduce(
        (total, [, config]) => total + countUniqueUnits(config),
        0,
      ),
    [buildingEntries],
  );

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
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box sx={{ minWidth: 245 }}>
          <SystemPageTitle
            title={pageConfig.title}
            help={pageConfig.help}
          />
          <Typography
            sx={{ mt: 0.15, color: '#64748b', fontSize: '0.67rem' }}
          >
            {projectName || '현장명 미등록'} · 현장관리 골구도 연동
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={0.7}
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          sx={{ flex: 1 }}
        >
          <Chip
            size="small"
            label="골구도 기준"
            sx={{
              bgcolor: `${pageConfig.accent}16`,
              border: `1px solid ${pageConfig.accent}66`,
              color: pageConfig.accent,
              fontWeight: 800,
            }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={pageConfig.category}
          />

          {isComparison ? (
            <>
              <TextField
                size="small"
                label="기준 옵션"
                value=""
                placeholder="비교 기준 옵션"
                disabled
                sx={{ minWidth: 170 }}
              />
              <TextField
                size="small"
                label="비교 옵션"
                value=""
                placeholder="비교할 옵션"
                disabled
                sx={{ minWidth: 170 }}
              />
            </>
          ) : (
            <TextField
              size="small"
              label="옵션 항목"
              value=""
              placeholder="옵션 항목 연결 예정"
              disabled
              sx={{ minWidth: 210 }}
            />
          )}
        </Stack>

        <SystemRefreshButton
          onClick={() => setRefreshKey((previous) => previous + 1)}
          label={`${pageConfig.title} 새로고침`}
        />
      </Paper>

      <Alert severity="info" sx={{ py: 0.35 }}>
        메뉴와 골구도 기본화면을 먼저 구성했습니다. 다음 단계에서 옵션
        항목, 세대별 선택값, 색상 및 저장 기능을 연결합니다.
      </Alert>

      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          variant="outlined"
          label={`등록 동 ${buildingEntries.length.toLocaleString()}개`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`전체 세대 ${totalUnits.toLocaleString()}개`}
        />
        {isComparison && (
          <Chip size="small" color="warning" label="비교 옵션 미선택" />
        )}
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          p: 0.75,
          borderColor: 'transparent',
          boxShadow: 'none',
          bgcolor: '#f1f5f9',
        }}
      >
        {buildingEntries.length === 0 ? (
          <Box
            sx={{
              minHeight: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography color="text.secondary">
              이 현장에 등록된 동 설정이 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              minWidth: 'max-content',
              minHeight: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 2.5,
              pb: 0.5,
            }}
          >
            {buildingEntries.map(([buildingName, config]) => (
              <BuildingGrid
                key={`${buildingName}-${refreshKey}`}
                buildingName={buildingName}
                config={config}
                readOnly
              />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
