const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.1';
const TARGET = path.resolve(process.cwd(), 'src/page/ProjectManagement.jsx');
const VERSION_MARKER = '// v52.48.5.44.1 현장관리 동별 호별 타입';
const BASE_MARKER = '// v52.48.5.44 최고관리자 현장관리';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }
  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }
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

if (!source.includes(BASE_MARKER)) {
  fail('v52.48.5.44 기준 파일이 아닙니다. 기존 변경을 보호하기 위해 자동 적용을 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.1_${new Date().toISOString().replace(/[:.]/g, '-')}`
);
const backupPath = path.join(backupDir, 'src/page/ProjectManagement.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커'
);

source = replaceOnce(
  source,
`const createEmptyBuilding = (index = 0) => ({`,
`const normalizeUnitTypes = (value) => {
  const source = safeObject(value);

  return Object.fromEntries(
    Object.entries(source)
      .map(([unitNumber, typeName]) => [
        String(Number(unitNumber)),
        String(typeName ?? '').trim(),
      ])
      .filter(([unitNumber, typeName]) => (
        Number.isInteger(Number(unitNumber))
        && Number(unitNumber) > 0
        && Boolean(typeName)
      )),
  );
};

const createEmptyBuilding = (index = 0) => ({`,
  '호별 타입 정규화 함수'
);

source = replaceOnce(
  source,
`  exceptionsText: '',
  rawConfig: {},`,
`  exceptionsText: '',
  unitTypes: {},
  rawConfig: {},`,
  '새 동 기본값'
);

source = replaceOnce(
  source,
`    exceptionsText: formatExceptions(rawConfig.exceptions),
    rawConfig,`,
`    exceptionsText: formatExceptions(rawConfig.exceptions),
    unitTypes: normalizeUnitTypes(rawConfig.unitTypes),
    rawConfig,`,
  '저장 동 호별 타입 불러오기'
);

source = replaceOnce(
  source,
`  const exceptions = parseExceptionsText(building.exceptionsText);

  Object.keys(exceptions).forEach((floorKey) => {`,
`  const exceptions = parseExceptionsText(building.exceptionsText);
  const unitTypes = Object.fromEntries(
    Object.entries(normalizeUnitTypes(building.unitTypes))
      .filter(([unitNumber]) => Number(unitNumber) <= unitsPerFloor),
  );

  Object.keys(exceptions).forEach((floorKey) => {`,
  '호별 타입 저장 준비'
);

source = replaceOnce(
  source,
`    pilotiFloors,
    exceptions,
  };`,
`    pilotiFloors,
    exceptions,
    unitTypes,
  };`,
  'config_json 호별 타입 저장'
);

source = replaceOnce(
  source,
`  const addBuilding = () => {`,
`  const updateUnitType = (clientId, unitNumber, value) => {
    const unitKey = String(unitNumber);

    setDraft((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        buildings: previous.buildings.map((building) => {
          if (building.clientId !== clientId) return building;

          const nextUnitTypes = {
            ...normalizeUnitTypes(building.unitTypes),
          };
          const preparedValue = String(value ?? '').trimStart();

          if (preparedValue) {
            nextUnitTypes[unitKey] = preparedValue;
          } else {
            delete nextUnitTypes[unitKey];
          }

          return {
            ...building,
            unitTypes: nextUnitTypes,
          };
        }),
      };
    });
  };

  const addBuilding = () => {`,
  '호별 타입 수정 함수'
);

source = replaceOnce(
  source,
`          help="최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대 기본구조를 관리합니다. 현장명 변경과 기존 동 삭제는 과거 데이터 연결 보호를 위해 제한합니다."`,
`          help="최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대·호별 타입 기본구조를 관리합니다. 현장명 변경과 기존 동 삭제는 과거 데이터 연결 보호를 위해 제한합니다."`,
  '현장관리 도움말'
);

source = replaceOnce(
  source,
`                        <TextField
                          sx={{ mt: 0.8 }}
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          label="예외층 · 해당 층에 실제 존재하는 호수만 입력"
                          value={building.exceptionsText}
                          disabled={!rowEditable}
                          placeholder="예: 21=1,2,3; 22=1,2,3  /  입력하지 않으면 모든 층이 기준 호수/층과 동일"
                          helperText="상층부 세대 감소 또는 1층 일부 세대만 존재하는 경우 사용합니다. 기존 aliasUnits 등 고급설정 값은 수정 저장해도 보존됩니다."
                          onChange={(event) => updateBuilding(building.clientId, 'exceptionsText', event.target.value)}
                        />
                      </Paper>`,
`                        <TextField
                          sx={{ mt: 0.8 }}
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          label="예외층 · 해당 층에 실제 존재하는 호수만 입력"
                          value={building.exceptionsText}
                          disabled={!rowEditable}
                          placeholder="예: 21=1,2,3; 22=1,2,3  /  입력하지 않으면 모든 층이 기준 호수/층과 동일"
                          helperText="상층부 세대 감소 또는 1층 일부 세대만 존재하는 경우 사용합니다. 기존 aliasUnits 등 고급설정 값은 수정 저장해도 보존됩니다."
                          onChange={(event) => updateBuilding(building.clientId, 'exceptionsText', event.target.value)}
                        />

                        <Box
                          sx={{
                            mt: 0.9,
                            p: 1,
                            border: '1px solid #e2e8f0',
                            borderRadius: 1,
                            bgcolor: '#f8fafc',
                          }}
                        >
                          <Box sx={{ mb: 0.75 }}>
                            <Typography sx={{ color: '#0f172a', fontSize: '0.72rem', fontWeight: 900 }}>
                              호별 타입
                            </Typography>
                            <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.62rem', lineHeight: 1.45 }}>
                              이 동의 기준 호수 라인별 타입을 입력합니다. 예: 1호 84A · 2호 84B · 3호 59A. 예외층에서도 존재하는 동일 호수는 이 타입을 사용합니다.
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: {
                                xs: 'repeat(2, minmax(0,1fr))',
                                sm: 'repeat(3, minmax(0,1fr))',
                                md: 'repeat(auto-fit, minmax(120px, 1fr))',
                              },
                              gap: 0.7,
                            }}
                          >
                            {Array.from(
                              {
                                length: Math.max(
                                  0,
                                  Number.isInteger(Number(building.unitsPerFloor))
                                    ? Number(building.unitsPerFloor)
                                    : 0,
                                ),
                              },
                              (_unused, unitIndex) => {
                                const unitNumber = unitIndex + 1;
                                return (
                                  <TextField
                                    key={unitNumber}
                                    size="small"
                                    label={\`${'${unitNumber}'}호 타입\`}
                                    value={building.unitTypes?.[String(unitNumber)] || ''}
                                    disabled={!rowEditable}
                                    placeholder="예: 84A"
                                    onChange={(event) => updateUnitType(
                                      building.clientId,
                                      unitNumber,
                                      event.target.value,
                                    )}
                                  />
                                );
                              },
                            )}
                          </Box>
                        </Box>
                      </Paper>`,
  '동별 호별 타입 입력 UI'
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log(`- 수정: src/page/ProjectManagement.jsx`);
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
console.log('- SQL 변경 없음');
console.log('- 각 동의 기준 호수/층 수에 맞춰 1호~N호 타입 입력칸이 자동 생성됩니다.');
