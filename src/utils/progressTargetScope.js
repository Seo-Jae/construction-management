import { getTargetCellKeys } from './buildingUnits.js';

// Target floors are cumulative. Each stage excludes all earlier stages.
export function buildProgressTargetScopes(targets, buildingConfigs) {
  const previousKeys = new Set();
  return [...targets].sort((a, b) => a.sequence - b.sequence).map(target => {
    const keys = getTargetCellKeys(buildingConfigs, target.building_floor_targets);
    const cellKeys = new Set([...keys].filter(key => !previousKeys.has(key)));
    keys.forEach(key => previousKeys.add(key));
    return { ...target, cellKeys };
  });
}
