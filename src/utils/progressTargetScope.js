import { getFloorCellKeys } from './buildingUnits.js';

// Target floors are cumulative. Each stage excludes all earlier stages.
export function buildProgressTargetScopes(targets, buildingConfigs) {
  const previousKeys = new Set();
  return [...targets].sort((a, b) => a.sequence - b.sequence).map(target => {
    const keys = new Set();
    Object.entries(target.building_floor_targets || {}).forEach(([building, targetFloor]) => {
      const config = buildingConfigs[building];
      if (!config) return;
      const maxFloor = Math.min(Number(config.floors) || 0, Number(targetFloor) || 0);
      for (let floor = 1; floor <= maxFloor; floor += 1) {
        getFloorCellKeys(building, config, floor).forEach(key => keys.add(key));
      }
    });
    const cellKeys = new Set([...keys].filter(key => !previousKeys.has(key)));
    keys.forEach(key => previousKeys.add(key));
    return { ...target, cellKeys };
  });
}
