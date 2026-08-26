// v52.48.5.44.16 타입·옵션 선택용 세대키 및 0세대 항목 제외
// v52.48.5.44.15 골구도 타입별 단열 옵션 세대수 집계
import {
  buildFloorVisualCells,
  getCellKey,
  getUnitType,
} from './buildingUnits.js';

const normalizeText = (value) => String(value ?? '').trim();

const compareNatural = (first, second) =>
  first.localeCompare(second, 'ko-KR', { numeric: true });

export const formatOptionProgressPercentage = (assigned, total) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (safeTotal === 0) return '0';
  const percentage = ((Math.max(0, Number(assigned) || 0) / safeTotal) * 100);
  return Number.isInteger(percentage)
    ? String(percentage)
    : percentage.toFixed(1);
};

export const createOptionTypeSummary = ({
  buildingConfigs = {},
  optionData = {},
} = {}) => {
  const unitsByType = new Map();
  const knownCellKeys = new Set();

  Object.entries(buildingConfigs || {})
    .sort(([first], [second]) => compareNatural(first, second))
    .forEach(([buildingName, config]) => {
      const floors = Math.max(0, Number(config?.floors) || 0);

      for (let floor = 1; floor <= floors; floor += 1) {
        buildFloorVisualCells(config, floor).forEach((cell) => {
          if (cell.type !== 'valid') return;

          const cellKey = getCellKey(buildingName, cell.unitCode);
          if (knownCellKeys.has(cellKey)) return;
          knownCellKeys.add(cellKey);

          const typeName =
            normalizeText(getUnitType(config, floor, cell.visualStart)) ||
            '미지정';
          const units = unitsByType.get(typeName) || [];
          units.push(cellKey);
          unitsByType.set(typeName, units);
        });
      }
    });

  const optionNameSet = new Set();
  knownCellKeys.forEach((cellKey) => {
    const optionName = normalizeText(optionData?.[cellKey]?.value);
    if (optionName) optionNameSet.add(optionName);
  });
  const optionNames = [...optionNameSet].sort(compareNatural);

  const rows = [...unitsByType.entries()]
    .sort(([first], [second]) => compareNatural(first, second))
    .map(([typeName, cellKeys]) => {
      const countByOptionName = new Map();
      const cellKeysByOptionName = new Map();
      let assignedCount = 0;

      cellKeys.forEach((cellKey) => {
        const optionName = normalizeText(optionData?.[cellKey]?.value);
        if (!optionName) return;
        assignedCount += 1;
        countByOptionName.set(
          optionName,
          (countByOptionName.get(optionName) || 0) + 1,
        );
        const optionCellKeys = cellKeysByOptionName.get(optionName) || [];
        optionCellKeys.push(cellKey);
        cellKeysByOptionName.set(optionName, optionCellKeys);
      });

      return {
        typeName,
        cellKeys,
        assignedCount,
        totalCount: cellKeys.length,
        percentage: formatOptionProgressPercentage(
          assignedCount,
          cellKeys.length,
        ),
        optionCounts: optionNames
          .map((optionName) => ({
            optionName,
            count: countByOptionName.get(optionName) || 0,
            cellKeys: cellKeysByOptionName.get(optionName) || [],
          }))
          .filter(({ count }) => count > 0),
      };
    });

  return {
    optionNames,
    rows,
  };
};
