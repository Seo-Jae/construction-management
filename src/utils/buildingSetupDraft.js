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
  return config;
}
