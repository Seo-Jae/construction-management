import React from 'react';
import { Box, Typography } from '@mui/material';

const BuildingGrid = ({ buildingName, config, selectedCells, onCellClick, unitData, onFloorClick }) => {
  const {
  floors,
  unitsPerFloor,
  pilotiFloors = [],
  exceptions = {},
  diagonalUnits = {}
} = config;

  // 해당 동의 '전체 유효 세대수' 계산
  let bTotal = 0;
  for (let f = 1; f <= floors; f++) {
    for (let u = 1; u <= unitsPerFloor; u++) {
      const isActiveOnPiloti = exceptions[f] && exceptions[f].units.includes(u);
      const isException = exceptions[f] && !exceptions[f].units.includes(u);
      const isPiloti = pilotiFloors.includes(f) && !isActiveOnPiloti;
      const isNonExistent = isException && (!pilotiFloors.includes(f));
      if (!isNonExistent && !isPiloti) bTotal++;
    }
  }

  // 해당 동의 '작업완료 세대수' 계산
  let bCompleted = 0;
  Object.keys(unitData).forEach(key => {
    if (key.startsWith(buildingName + '-') && unitData[key].status === '작업완료') {
      bCompleted++;
    }
  });

  const bPercentage = bTotal === 0 ? 0 : ((bCompleted / bTotal) * 100).toFixed(2);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', mb: 2, alignSelf: 'flex-end' }}>
      
      {/* 층별 렌더링 (역순) */}
      {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => (
        <Box key={floor} sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          {/* 층수 표시 (클릭 시 해당 층 전체 선택) */}
          <Typography 
            variant="caption" 
            onClick={() => onFloorClick(buildingName, floor)}
            sx={{ 
              width: '25px', fontSize: '0.65rem', color: '#64748b', textAlign: 'right', pr: 0.5,
              cursor: 'pointer', '&:hover': { color: '#0ea5e9', fontWeight: 'bold' } 
            }}
          >
            {floor}F
          </Typography>
          
          {/* 호수 렌더링 */}
          {Array.from({ length: unitsPerFloor }, (_, i) => i + 1).map((unit) => {
            const unitDisplay = `${floor}${String(unit).padStart(2, '0')}`;
            const cellKey = `${buildingName}-${unitDisplay}`;

            const isActiveOnPiloti = exceptions[floor] && exceptions[floor].units.includes(unit);
            const isNonExistent = exceptions[floor] && !exceptions[floor].units.includes(unit) && !pilotiFloors.includes(floor);

            // 허공 (건물 없는 곳)
            if (isNonExistent) return <Box key={unit} sx={{ width: '32px', height: '18px' }} />;

            const isPiloti = pilotiFloors.includes(floor) && !isActiveOnPiloti;
            
            // config_json의 diagonalUnits 읽기
            const isDiagonal =
              diagonalUnits[floor] &&
              diagonalUnits[floor].includes(unit);

            const isSelected = selectedCells.has(cellKey);
            
            const cellStatus = unitData[cellKey]?.status || '작업전';
            const cellDate = unitData[cellKey]?.date || '';

            // 상태에 따른 배경색 및 글자색 설정
            let bgColor = 'white';
            let textColor = '#475569';
            if (cellStatus === '작업완료') { bgColor = '#38bdf8'; textColor = 'white'; } 
            else if (cellStatus === '작업중') { bgColor = '#6ee7b7'; textColor = 'white'; } 

            // 작업완료인 경우 호수 대신 날짜(MM.DD) 출력
            const displayText = (cellStatus === '작업완료' && cellDate) 
              ? cellDate.substring(5).replace('-', '.') 
              : unitDisplay;

            return (
              <Box
                key={unit}
                onClick={() => !(isPiloti || isDiagonal) && onCellClick(cellKey)}
                sx={{
                  width: '32px',
                  height: '18px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '2px',
                  cursor: (isPiloti || isDiagonal) ? 'default' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  
                  bgcolor: (isPiloti || isDiagonal) ? '#f1f5f9' : bgColor,
                  // 선택된 셀은 뚜렷한 파란색 테두리와 그림자로 강조
                  boxShadow: isSelected ? '0 0 0 2px #2563eb inset' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s',
                  '&:hover': {
                    filter: (isPiloti || isDiagonal)
                      ? 'none'
                      : 'brightness(0.9)'
                  }
                }}
              >
                {(isPiloti || isDiagonal) ? (
                  <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <line x1="0" y1="0" x2="100%" y2="100%" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="100%" y1="0" x2="0" y2="100%" stroke="#cbd5e1" strokeWidth="1" />
                  </svg>
                ) : (
                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 'bold', color: textColor, zIndex: 1 }}>
                    {displayText}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
      
      {/* 💡 하단 텍스트 레이아웃 수정 (좌측: 동 이름 / 우측: 진도율) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', mt: 1, pl: '27px', pr: 0.5 }}>
        <Typography variant="subtitle1" fontWeight="900" sx={{ color: '#334155' }}>
          {buildingName}
        </Typography>
        <Typography fontWeight="900" sx={{ color: '#ef4444', fontSize: '0.75rem' }}>
          {bCompleted}/{bTotal} <span style={{ fontSize: '0.65rem' }}>({bPercentage}%)</span>
        </Typography>
      </Box>

    </Box>
  );
};

export default BuildingGrid;