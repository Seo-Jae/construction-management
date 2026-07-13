import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';

const BuildingGrid = ({ buildingName, config, onCellClick }) => {
  const { floors, unitsPerFloor, pilotiFloors = [], exceptions = {} } = config;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', mb: 4 }}>
      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>{buildingName}</Typography>
      
      {/* 층별 렌더링 (꼭대기층부터 1층까지 역순) */}
      {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => (
        <Box key={floor} sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          {/* 층수 표시 */}
          <Typography variant="caption" sx={{ width: '25px', fontSize: '0.65rem', color: '#64748b' }}>
            {floor}F
          </Typography>
          
          {/* 호수 렌더링 */}
          {Array.from({ length: unitsPerFloor }, (_, i) => i + 1).map((unit) => {
            // 1. 제외 세대 처리 (exceptions에 있는 호수만 표시)
            const isException = exceptions[floor] && !exceptions[floor].units.includes(unit);
            if (isException) return <Box key={unit} sx={{ width: '25px', height: '18px' }} />;

            // 2. 필로티 처리
            const isPiloti = pilotiFloors.includes(floor);
            
            return (
              <Tooltip key={unit} title={`${floor}층 ${unit}호`}>
                <Box
                  onClick={() => !isPiloti && onCellClick(buildingName, floor, unit)}
                  sx={{
                    width: '25px',
                    height: '18px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '2px',
                    cursor: isPiloti ? 'default' : 'pointer',
                    bgcolor: isPiloti ? '#f1f5f9' : 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': { bgcolor: isPiloti ? '#f1f5f9' : '#e0f2fe' }
                  }}
                >
                  <Typography sx={{ fontSize: '0.5rem', color: '#475569' }}>{unit}</Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

// 💡 여기가 제일 중요합니다! 파일 맨 아래에 꼭 있어야 합니다.
export default BuildingGrid;