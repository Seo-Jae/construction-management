const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.3';
const TARGET = path.resolve(process.cwd(), 'src/BuildingGrid.jsx');
const VERSION_MARKER = '// v52.48.5.44.3 현장관리 호별타입 공정진척 연동';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) fail(`적용 기준을 찾지 못했습니다: ${label}`);
  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.3_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/BuildingGrid.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = `${VERSION_MARKER}\n${source}`;

source = replaceOnce(
  source,
`  countUniqueUnits,
  getCellKey,
} from './utils/buildingUnits.js';`,
`  countUniqueUnits,
  getCellKey,
  getUnitType,
} from './utils/buildingUnits.js';`,
  'getUnitType import',
);

const oldSummary = `  const unitTypeSummary = useMemo(() => {
    const buildingPrefix = \`\${String(buildingName || '').trim()}-\`;
    const configuredColumnCount = Math.max(
      0,
      Number(config?.unitsPerFloor) || 0,
    );
    const typeCountsByLine = new Map();
    let detectedMaxLine = 0;

    Object.entries(unitTypeData || {}).forEach(
      ([cellKey, rawUnitType]) => {
        const normalizedCellKey = String(cellKey || '').trim();

        if (
          !buildingPrefix ||
          !normalizedCellKey.startsWith(buildingPrefix)
        ) {
          return;
        }

        const unitCode = normalizedCellKey
          .slice(buildingPrefix.length)
          .trim();
        const lineMatched = unitCode.match(/(\\d{1,2})$/);
        const lineNumber = Number(lineMatched?.[1] || 0);
        const unitType = String(rawUnitType || '').trim();

        if (!lineNumber || !unitType) {
          return;
        }

        detectedMaxLine = Math.max(detectedMaxLine, lineNumber);

        if (!typeCountsByLine.has(lineNumber)) {
          typeCountsByLine.set(lineNumber, new Map());
        }

        const typeCounts = typeCountsByLine.get(lineNumber);
        typeCounts.set(
          unitType,
          (typeCounts.get(unitType) || 0) + 1,
        );
      },
    );

    const columnCount =
      configuredColumnCount || detectedMaxLine;
    const labels = Array.from(
      { length: columnCount },
      (_, index) => {
        const lineNumber = index + 1;
        const typeCounts = typeCountsByLine.get(lineNumber);

        if (!typeCounts || typeCounts.size === 0) {
          return '';
        }

        return [...typeCounts.entries()].sort(
          (left, right) =>
            right[1] - left[1] ||
            left[0].localeCompare(right[0], 'ko'),
        )[0][0];
      },
    );

    return {
      labels,
      hasLabels: labels.some(Boolean),
    };
  }, [buildingName, config?.unitsPerFloor, unitTypeData]);`;

const newSummary = `  const unitTypeSummary = useMemo(() => {
    const buildingPrefix = \`\${String(buildingName || '').trim()}-\`;
    const configuredColumnCount = Math.max(
      0,
      Number(config?.unitsPerFloor) || 0,
    );
    const typeCountsByLine = new Map();
    let detectedMaxLine = 0;

    const addTypeCount = (lineNumber, rawUnitType) => {
      const normalizedLineNumber = Number(lineNumber);
      const unitType = String(rawUnitType || '').trim();

      if (!normalizedLineNumber || !unitType) {
        return;
      }

      detectedMaxLine = Math.max(
        detectedMaxLine,
        normalizedLineNumber,
      );

      if (!typeCountsByLine.has(normalizedLineNumber)) {
        typeCountsByLine.set(normalizedLineNumber, new Map());
      }

      const typeCounts = typeCountsByLine.get(normalizedLineNumber);
      typeCounts.set(
        unitType,
        (typeCounts.get(unitType) || 0) + 1,
      );
    };

    /*
      v52.48.5.44.3
      새 현장관리에서 입력한 타입은 building_settings.config_json의
      unitTypes / floorUnitTypes에 저장됩니다.

      기존 현장은 project_unit_types 테이블을 사용해왔으므로,
      1) config_json에 새 타입정보가 있으면 그것을 우선 사용
      2) 없으면 기존 project_unit_types 데이터를 그대로 사용
      하여 기존 현장과 신규 현장을 동시에 지원합니다.
    */
    const hasConfigUnitTypes =
      Object.values(config?.unitTypes || {}).some(
        (value) => Boolean(String(value || '').trim()),
      ) ||
      Object.values(config?.floorUnitTypes || {}).some(
        (floorMap) =>
          floorMap &&
          typeof floorMap === 'object' &&
          Object.values(floorMap).some(
            (value) => Boolean(String(value || '').trim()),
          ),
      );

    if (hasConfigUnitTypes) {
      for (let floor = 1; floor <= floors; floor += 1) {
        buildFloorVisualCells(config, floor).forEach((cell) => {
          if (cell.type !== 'valid') {
            return;
          }

          const unitType = getUnitType(
            config,
            floor,
            cell.visualStart,
          );

          if (!unitType) {
            return;
          }

          /*
            aliasUnits로 하나의 실제 세대가 여러 시각 칸을 차지하는 경우
            하단 타입도 모든 표시 칸에 동일하게 맞춥니다.
          */
          for (
            let lineNumber = cell.visualStart;
            lineNumber <= cell.visualEnd;
            lineNumber += 1
          ) {
            addTypeCount(lineNumber, unitType);
          }
        });
      }
    } else {
      Object.entries(unitTypeData || {}).forEach(
        ([cellKey, rawUnitType]) => {
          const normalizedCellKey = String(cellKey || '').trim();

          if (
            !buildingPrefix ||
            !normalizedCellKey.startsWith(buildingPrefix)
          ) {
            return;
          }

          const unitCode = normalizedCellKey
            .slice(buildingPrefix.length)
            .trim();
          const lineMatched = unitCode.match(/(\\d{1,2})$/);
          const lineNumber = Number(lineMatched?.[1] || 0);

          addTypeCount(lineNumber, rawUnitType);
        },
      );
    }

    const columnCount =
      configuredColumnCount || detectedMaxLine;
    const labels = Array.from(
      { length: columnCount },
      (_, index) => {
        const lineNumber = index + 1;
        const typeCounts = typeCountsByLine.get(lineNumber);

        if (!typeCounts || typeCounts.size === 0) {
          return '';
        }

        return [...typeCounts.entries()].sort(
          (left, right) =>
            right[1] - left[1] ||
            left[0].localeCompare(right[0], 'ko'),
        )[0][0];
      },
    );

    return {
      labels,
      hasLabels: labels.some(Boolean),
    };
  }, [
    buildingName,
    config,
    floors,
    unitTypeData,
  ]);`;

source = replaceOnce(
  source,
  oldSummary,
  newSummary,
  '호별 타입 요약 계산',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/BuildingGrid.jsx');
console.log('- 신규 현장: building_settings.config_json.unitTypes/floorUnitTypes 사용');
console.log('- 기존 현장: project_unit_types 기존 방식 유지');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
