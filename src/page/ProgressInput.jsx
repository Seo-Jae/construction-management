import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Fade,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import BuildingGrid from '../BuildingGrid';
import { getProjectCellKeys } from '../utils/buildingUnits.js';

const STATUS_OPTIONS = ['작업전', '작업중', '작업완료'];

const getStatusButtonStyle = (status, selectedStatusAction) => {
  const selected = selectedStatusAction === status;

  if (status === '작업중') {
    return {
      color: selected ? '#ffffff' : '#10b981',
      borderColor: '#6ee7b7',
      bgcolor: selected ? '#10b981' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#059669' : '#ecfdf5',
        borderColor: '#10b981',
      },
    };
  }

  if (status === '작업완료') {
    return {
      color: selected ? '#ffffff' : '#0ea5e9',
      borderColor: '#7dd3fc',
      bgcolor: selected ? '#0ea5e9' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#0284c7' : '#f0f9ff',
        borderColor: '#0ea5e9',
      },
    };
  }

  return {
    color: selected ? '#ffffff' : '#64748b',
    borderColor: '#cbd5e1',
    bgcolor: selected ? '#94a3b8' : '#ffffff',
    '&:hover': {
      bgcolor: selected ? '#64748b' : '#f8fafc',
      borderColor: '#94a3b8',
    },
  };
};

export default function ProgressInput({
  selectedCells = new Set(),
  actionName = '',
  progressDate = '',
  setProgressDate,
  handleSaveProgress,
  setSelectedCells,
  selectedStatusAction = '작업완료',
  setSelectedStatusAction,
  completedUnits = 0,
  totalUnits = 0,
  progressPercentage = 0,
  setSelectedProcess,
  selectedProcess = '',
  processOptions = [],
  buildingConfigs = {},
  unitProgressData = {},
  handleGridCellClick,
  handleFloorClick,
}) {
  const selectionCount =
    selectedCells?.size ?? 0;

  const protectedCompletedCount =
    Object.values(
      unitProgressData || {},
    ).filter(
      (progressItem) =>
        progressItem?.status ===
        '작업완료',
    ).length;

  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(
    ([keyA], [keyB]) =>
      keyA.localeCompare(keyB, 'ko', {
        numeric: true,
      }),
  );

  const selectAllCells = () => {
    const allCellKeys =
      getProjectCellKeys(
        buildingConfigs,
      );

    const editableCellKeys =
      Array.from(
        allCellKeys,
      ).filter(
        (cellKey) =>
          unitProgressData?.[
            cellKey
          ]?.status !==
          '작업완료',
      );

    setSelectedCells?.(
      new Set(
        editableCellKeys,
      ),
    );
  };

  const clearSelectedCells = () => {
    setSelectedCells?.(new Set());
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* 진도율과 공정 선택을 항상 화면 최상단에 고정합니다. */}
      <Paper
        elevation={1}
        sx={{
          minHeight: 42,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          columnGap: 1.5,
          px: 1.25,
          py: 0.35,
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 0.5,
            minWidth: 0,
          }}
        >
          {STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              size="small"
              variant={
                selectedStatusAction === status ? 'contained' : 'outlined'
              }
              onClick={() => setSelectedStatusAction?.(status)}
              sx={{
                minWidth: 68,
                py: 0.25,
                px: 1.1,
                fontSize: '0.75rem',
                boxShadow: 'none',
                ...getStatusButtonStyle(status, selectedStatusAction),
              }}
            >
              {status === '작업완료' ? '완료' : status}
            </Button>
          ))}

          <Box
            sx={{
              width: '1px',
              height: 22,
              mx: 0.25,
              bgcolor: '#cbd5e1',
              flexShrink: 0,
            }}
          />

          <Button
            size="small"
            variant="outlined"
            onClick={selectAllCells}
            disabled={sortedBuildings.length === 0}
            sx={{
              minWidth: 74,
              py: 0.25,
              px: 1,
              color: '#7c3aed',
              borderColor: '#c4b5fd',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#8b5cf6',
                bgcolor: '#f5f3ff',
              },
            }}
          >
            전체선택
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={clearSelectedCells}
            disabled={selectionCount === 0}
            sx={{
              minWidth: 88,
              py: 0.25,
              px: 1,
              color: '#64748b',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#94a3b8',
                bgcolor: '#f8fafc',
              },
            }}
          >
            전체선택해제
          </Button>
        </Box>

        <Typography
          component="div"
          fontWeight={800}
          sx={{
            color: '#334155',
            fontSize: '0.9rem',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          진도율 : {completedUnits}/{totalUnits}{' '}
          <Box component="span" sx={{ color: '#ef4444' }}>
            {progressPercentage}%
          </Box>
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            minWidth: 0,
          }}
        >
          <Autocomplete
            options={processOptions}
            value={selectedProcess || null}
            onChange={(_, value) => {
              if (value) setSelectedProcess?.(value);
            }}
            disableClearable
            size="small"
            sx={{ width: 180 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="공정 선택"
                sx={{
                  '& .MuiInputBase-root': {
                    minHeight: 34,
                    py: 0,
                    fontSize: '0.8rem',
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: '0.75rem',
                  },
                }}
              />
            )}
          />
        </Box>
      </Paper>

      {/*
        날짜 선택창 전용 공간입니다.
        선택 전에도 같은 높이를 유지하므로 건물들이 아래로 움직이지 않습니다.
      */}
      <Box
        sx={{
          position: 'relative',
          height: 43,
          minHeight: 43,
          flexShrink: 0,
          mt: 0.5,
          mb: 0.5,
        }}
      >
        <Fade in={selectionCount > 0} timeout={180}>
          <Paper
            elevation={1}
            sx={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'fit-content',
              maxWidth: 'calc(100% - 16px)',
              minHeight: 38,
              px: 1.75,
              py: 0.4,
              bgcolor: '#e0f2fe',
              border: '1px solid #7dd3fc',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            <Typography
              fontWeight={800}
              sx={{ color: '#0369a1', fontSize: '0.8rem' }}
            >
              {actionName} {selectionCount}개 선택
            </Typography>

            <TextField
              type="date"
              size="small"
              value={progressDate}
              onChange={(event) => setProgressDate?.(event.target.value)}
              sx={{
                width: 145,
                bgcolor: '#ffffff',
                '& .MuiInputBase-input': {
                  py: 0.5,
                  px: 1,
                  fontSize: '0.78rem',
                },
              }}
            />

            <Button
              variant="contained"
              size="small"
              disabled={selectionCount === 0 || !progressDate}
              onClick={handleSaveProgress}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                bgcolor: '#0284c7',
                fontSize: '0.75rem',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#0369a1',
                  boxShadow: 'none',
                },
              }}
            >
              저장
            </Button>

            <Button
              variant="outlined"
              size="small"
              onClick={clearSelectedCells}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                color: '#0369a1',
                borderColor: '#7dd3fc',
                bgcolor: '#ffffff',
                fontSize: '0.75rem',
              }}
            >
              취소
            </Button>
          </Paper>
        </Fade>
      </Box>

      {/* 동은 줄바꿈하지 않고 다중 공종 화면처럼 가로로 이어집니다. */}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#f1f5f9',
          borderRadius: 1,
          scrollbarGutter: 'stable both-edges',
        }}
      >
        {sortedBuildings.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              등록된 동 정보가 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              alignItems: 'flex-end',
              gap: 4,
              width: 'max-content',
              minWidth: '100%',
              minHeight: '100%',
              height: 'max-content',
              px: 1.5,
              pt: 0.5,
              pb: 1,
            }}
          >
            {sortedBuildings.map(([name, config]) => (
              <Box
                key={name}
                sx={{
                  flex: '0 0 auto',
                }}
              >
                <BuildingGrid
                  buildingName={name}
                  config={config}
                  selectedCells={selectedCells}
                  onCellClick={handleGridCellClick}
                  unitData={unitProgressData}
                  onFloorClick={handleFloorClick}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
