import { buildSetupConfig, newBuildingSetupDraft } from './buildingSetupDraft.js';
import { buildFloorVisualCells, getUnitType, getVisualCellType } from './buildingUnits.js';

const sortedJson = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export const sameSetupDraft = (first, second) => sortedJson({ name: first.name, lines: first.lines }) === sortedJson({ name: second.name, lines: second.lines });

// Compare geometry, not incidental JSON formatting or legacy config properties.
function sameGeometry(first, second) {
  if (Number(first.floors) !== Number(second.floors) || Number(first.unitsPerFloor) !== Number(second.unitsPerFloor)) return false;
  for (let floor = 1; floor <= Number(first.floors); floor += 1) {
    const cells = config => buildFloorVisualCells(config, floor).map(cell => ({ ...cell, unitType: getUnitType(config, floor, cell.visualStart) }));
    if (sortedJson(cells(first)) !== sortedJson(cells(second))) return false;
  }
  return true;
}

export function restoreSetupBuilding(row) {
  const config = row.config_json;
  const name = row.building_name;
  const base = { id: name, name, config, originalConfig: structuredClone(config) };
  const savedLines = config.initialSetupDraft?.lines;
  if (Array.isArray(savedLines)) {
    try {
      if (sameGeometry(config, buildSetupConfig({ lines: savedLines }))) return { ...base, lines: structuredClone(savedLines) };
    } catch { /* A legacy editor may have changed the geometry since the draft was saved. */ }
  }
  const lines = Array.from({ length: Number(config.unitsPerFloor) }, (_, index) => {
    const line = index + 1;
    let floors = Number(config.floors);
    while (floors > 1 && getVisualCellType(config, floors, line) === 'empty') floors -= 1;
    const piloti = [];
    const specialFloors = [];
    for (let floor = 1; floor <= floors; floor += 1) {
      const kind = getVisualCellType(config, floor, line);
      if (kind === 'piloti') piloti.push(floor);
      else if (kind === 'empty') specialFloors.push({ floor: String(floor), type: '', excluded: true });
      else {
        const cell = buildFloorVisualCells(config, floor).find(item => item.visualStart === line);
        const type = getUnitType(config, floor, line);
        if (type !== String(config.unitTypes?.[line] || '') || cell?.span > 1) {
          specialFloors.push({ floor: String(floor), type, excluded: false,
            mergeLines: cell?.span > 1 ? Array.from({ length: cell.span - 1 }, (_, i) => line + i + 1).join(',') : '' });
        }
      }
    }
    return { floors: String(floors), piloti: piloti.join(','), type: String(config.unitTypes?.[line] || ''), specialFloors };
  });
  try {
    if (!sameGeometry(config, buildSetupConfig({ lines }))) throw new Error();
  } catch {
    return { ...base, lines, unsupported: true };
  }
  return { ...base, lines };
}

export function stageSetupBuilding(buildings, draft, selectedId) {
  const selected = buildings.find(building => building.id === selectedId);
  if (sameSetupDraft(draft, selected || newBuildingSetupDraft())) return buildings;
  if (selected?.unsupported) throw new Error('이 동은 별도 골구도 형식입니다. 기존 현장관리에서 수정해주세요.');
  const name = draft.name.trim();
  if (!name) throw new Error('동명을 입력해주세요.');
  if (selected?.originalConfig && name !== selected.name) throw new Error('기존 자료 연결을 위해 저장된 동명은 변경할 수 없습니다.');
  if (buildings.some(building => building.id !== selectedId && building.name.replace(/동$/, '') === name.replace(/동$/, ''))) throw new Error('같은 동명이 이미 목록에 있습니다.');
  const next = { ...structuredClone(draft), name, id: selectedId || crypto.randomUUID(), config: buildSetupConfig(draft) };
  return selected ? buildings.map(building => building.id === selectedId ? next : building) : [...buildings, next];
}

export function createSetupSaveChanges(buildings) {
  return buildings.flatMap(building => {
    if (building.unsupported) return [];
    const geometry = buildSetupConfig(building);
    // A no-op must not rewrite legacy configs or metadata.
    if (building.originalConfig && sameGeometry(geometry, building.originalConfig)) return [];
    const config = { ...building.originalConfig, ...geometry, aliasUnits: geometry.aliasUnits || {},
      initialSetupDraft: { version: 1, lines: structuredClone(building.lines) } };
    delete config.pilotiFloors;
    return [{ building_name: building.name, config_json: config, expected_config: building.originalConfig || null }];
  });
}
