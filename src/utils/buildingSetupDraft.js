export const newSetupLine = () => ({ floors: '', piloti: '', type: '', specialFloors: [] });
export const newBuildingSetupDraft = () => ({ name: '', lines: [newSetupLine()] });

export function buildSetupConfig(draft) {
  const lines = draft.lines || [];
  if (!lines.length || lines.length > 30) throw new Error('라인은 1~30개로 설정해주세요.');
  const parsed = lines.map((line, index) => {
    const floors = Number(line.floors);
    if (!Number.isInteger(floors) || floors < 1 || floors > 100) throw new Error(`${index + 1}라인 최고층을 1~100으로 입력해주세요.`);
    const piloti = String(line.piloti).trim() ? String(line.piloti).split(',').map((value) => Number(value.trim())) : [];
    if (piloti.some((floor) => !Number.isInteger(floor) || floor < 1 || floor > floors)) throw new Error(`${index + 1}라인 필로티 층을 확인해주세요. 여러 층은 쉼표로 구분합니다.`);
    const seen = new Set();
    for (const special of line.specialFloors) {
      const floor = Number(special.floor);
      if (!Number.isInteger(floor) || floor < 1 || floor > floors || seen.has(floor) || piloti.includes(floor)) throw new Error(`${index + 1}라인 특수층의 층수·중복·필로티 여부를 확인해주세요.`);
      if (!special.excluded && !special.type.trim()) throw new Error(`${index + 1}라인 특수층 타입을 입력해주세요.`);
      seen.add(floor);
    }
    return { ...line, floors, piloti };
  });
  const config = { floors: Math.max(...parsed.map((line) => line.floors)), unitsPerFloor: lines.length, unitTypes: {}, floorUnitTypes: {}, exceptions: {}, linePilotiFloors: {} };
  parsed.forEach((line, index) => {
    config.unitTypes[index + 1] = line.type.trim();
    config.linePilotiFloors[index + 1] = line.piloti;
    line.specialFloors.forEach((special) => {
      if (!special.excluded) {
        config.floorUnitTypes[special.floor] ||= {};
        config.floorUnitTypes[special.floor][index + 1] = special.type.trim();
      }
    });
  });
  for (let floor = 1; floor <= config.floors; floor += 1) {
    const units = parsed.flatMap((line, index) => floor <= line.floors && !line.piloti.includes(floor) && !line.specialFloors.some((special) => Number(special.floor) === floor && special.excluded) ? [index + 1] : []);
    if (units.length !== lines.length) config.exceptions[floor] = { units };
  }
  // Keep visual line positions, but map merged positions to one real household.
  // Existing progress grids and unit counts already understand aliasUnits.
  const mergedGroups = new Map();
  parsed.forEach((line, index) => line.specialFloors.forEach(special => {
    const mergeText = String(special.mergeLines || '').trim();
    if (!mergeText) return;
    const floor = Number(special.floor);
    const members = [...new Set([index + 1, ...mergeText.split(',').map(value => Number(value.trim()))])].sort((a, b) => a - b);
    if (special.excluded || members.length < 2 || members.some((member, i) =>
      !Number.isInteger(member) || member < 1 || member > parsed.length || (i > 0 && member !== members[i - 1] + 1))) {
      throw new Error(`${floor}층 병합 라인은 서로 이웃한 라인을 쉼표로 입력해주세요. 세대 제외와 병합은 함께 설정할 수 없습니다.`);
    }
    for (const member of members) {
      const target = parsed[member - 1];
      const override = target.specialFloors.find(item => Number(item.floor) === floor);
      if (floor > target.floors || target.piloti.includes(floor) || override?.excluded) {
        throw new Error(`${floor}층 ${member}라인은 세대가 없어 합칠 수 없습니다.`);
      }
      if (override && override.type.trim() !== special.type.trim()) {
        throw new Error(`${floor}층 병합할 라인의 특수층 타입을 동일하게 설정해주세요.`);
      }
    }
    const groups = mergedGroups.get(floor) || [];
    if (groups.some(group => group.some(member => members.includes(member)) && group.join(',') !== members.join(','))) {
      throw new Error(`${floor}층 병합 범위가 겹칩니다. 합칠 라인을 하나의 범위로 설정해주세요.`);
    }
    if (!groups.some(group => group.join(',') === members.join(','))) groups.push(members);
    mergedGroups.set(floor, groups);
    config.aliasUnits ||= {};
    config.aliasUnits[floor] ||= {};
    config.floorUnitTypes[floor] ||= {};
    for (const member of members) {
      config.aliasUnits[floor][member] = members[0];
      config.floorUnitTypes[floor][member] = special.type.trim();
    }
  }));
  return config;
}
