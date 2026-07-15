const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeNumberArray = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
    : [];

export const getFloorException = (config, floor) =>
  config?.exceptions?.[floor] ||
  config?.exceptions?.[String(floor)] ||
  null;

export const getAliasFloor = (config, floor) =>
  config?.aliasUnits?.[floor] ||
  config?.aliasUnits?.[String(floor)] ||
  null;

export const getCanonicalUnitNumber = (config, floor, visualUnitNumber) => {
  const aliasFloor = getAliasFloor(config, floor);
  const aliasValue =
    aliasFloor?.[visualUnitNumber] ??
    aliasFloor?.[String(visualUnitNumber)];

  const canonicalUnitNumber = toFiniteNumber(
    aliasValue,
    visualUnitNumber,
  );

  return canonicalUnitNumber > 0
    ? canonicalUnitNumber
    : Number(visualUnitNumber);
};

export const getUnitCode = (floor, unitNumber) =>
  `${Number(floor)}${String(Number(unitNumber)).padStart(2, '0')}`;

export const getCanonicalUnitCode = (
  config,
  floor,
  visualUnitNumber,
) =>
  getUnitCode(
    floor,
    getCanonicalUnitNumber(config, floor, visualUnitNumber),
  );

export const getCellKey = (buildingName, unitCode) =>
  `${String(buildingName)}-${String(unitCode)}`;

/*
  반환값
  - valid: 실제 세대
  - piloti: 대각선 표시
  - empty: 존재하지 않는 상층 세대(빈칸)

  1층 제외호는 현장 골구도 표기 기준에 따라 대각선으로 표시합니다.
*/
export const getVisualCellType = (config, floor, visualUnitNumber) => {
  const pilotiFloors = normalizeNumberArray(config?.pilotiFloors);
  const floorException = getFloorException(config, floor);
  const activeUnits = normalizeNumberArray(floorException?.units);
  const hasFloorException = Boolean(floorException);
  const isActiveUnit =
    hasFloorException && activeUnits.includes(Number(visualUnitNumber));
  const isPilotiFloor = pilotiFloors.includes(Number(floor));

  if (isPilotiFloor && (!hasFloorException || !isActiveUnit)) {
    return 'piloti';
  }

  if (hasFloorException && !isActiveUnit) {
    return Number(floor) === 1 ? 'piloti' : 'empty';
  }

  return 'valid';
};

export const isValidVisualUnit = (config, floor, visualUnitNumber) =>
  getVisualCellType(config, floor, visualUnitNumber) === 'valid';

export const getFloorCellKeys = (buildingName, config, floor) => {
  const unitsPerFloor = toFiniteNumber(config?.unitsPerFloor);
  const keys = new Set();

  for (
    let visualUnitNumber = 1;
    visualUnitNumber <= unitsPerFloor;
    visualUnitNumber += 1
  ) {
    if (!isValidVisualUnit(config, floor, visualUnitNumber)) continue;

    keys.add(
      getCellKey(
        buildingName,
        getCanonicalUnitCode(config, floor, visualUnitNumber),
      ),
    );
  }

  return Array.from(keys);
};

export const getBuildingCellKeys = (buildingName, config) => {
  const floors = toFiniteNumber(config?.floors);
  const keys = new Set();

  for (let floor = 1; floor <= floors; floor += 1) {
    getFloorCellKeys(buildingName, config, floor).forEach((key) => {
      keys.add(key);
    });
  }

  return keys;
};

export const getProjectCellKeys = (buildingConfigs = {}) => {
  const keys = new Set();

  Object.entries(buildingConfigs || {}).forEach(
    ([buildingName, config]) => {
      getBuildingCellKeys(buildingName, config).forEach((key) => {
        keys.add(key);
      });
    },
  );

  return keys;
};

export const countUniqueUnits = (config) =>
  getBuildingCellKeys('__building__', config).size;

/*
  같은 실제 세대로 연결된 연속 칸을 한 개의 넓은 칸으로 묶습니다.
  예: 21층 3·4호 칸이 모두 3호라면 span=2인 2103 세대 1칸으로 반환합니다.
*/
export const buildFloorVisualCells = (config, floor) => {
  const unitsPerFloor = toFiniteNumber(config?.unitsPerFloor);
  const cells = [];

  for (
    let visualUnitNumber = 1;
    visualUnitNumber <= unitsPerFloor;
    visualUnitNumber += 1
  ) {
    const type = getVisualCellType(config, floor, visualUnitNumber);

    if (type !== 'valid') {
      cells.push({
        type,
        visualStart: visualUnitNumber,
        visualEnd: visualUnitNumber,
        span: 1,
        unitCode: getUnitCode(floor, visualUnitNumber),
      });
      continue;
    }

    const canonicalUnitNumber = getCanonicalUnitNumber(
      config,
      floor,
      visualUnitNumber,
    );
    const unitCode = getUnitCode(floor, canonicalUnitNumber);
    const previous = cells[cells.length - 1];

    if (
      previous?.type === 'valid' &&
      previous.unitCode === unitCode &&
      previous.visualEnd === visualUnitNumber - 1
    ) {
      previous.visualEnd = visualUnitNumber;
      previous.span += 1;
      continue;
    }

    cells.push({
      type: 'valid',
      visualStart: visualUnitNumber,
      visualEnd: visualUnitNumber,
      span: 1,
      canonicalUnitNumber,
      unitCode,
    });
  }

  return cells;
};
