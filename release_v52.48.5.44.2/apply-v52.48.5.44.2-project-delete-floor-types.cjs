const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.2';
const ROOT = process.cwd();
const PROJECT_FILE = path.resolve(ROOT, 'src/page/ProjectManagement.jsx');
const BUILDING_UNITS_FILE = path.resolve(ROOT, 'src/utils/buildingUnits.js');
const SQL_FILE = path.resolve(ROOT, 'supabase/v52.48.5.44.2_project_delete_floor_unit_types.sql');

const BASE_MARKER = '// v52.48.5.44.1 현장관리 동별 호별 타입';
const VERSION_MARKER = '// v52.48.5.44.2 현장삭제 비밀번호확인 + 층별 타입예외';

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

function backupFile(filePath, backupRoot) {
  if (!fs.existsSync(filePath)) return;
  const relative = path.relative(ROOT, filePath);
  const target = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

if (!fs.existsSync(PROJECT_FILE)) fail('src/page/ProjectManagement.jsx 파일을 찾을 수 없습니다.');
if (!fs.existsSync(BUILDING_UNITS_FILE)) fail('src/utils/buildingUnits.js 파일을 찾을 수 없습니다.');

let project = fs.readFileSync(PROJECT_FILE, 'utf8');
let buildingUnits = fs.readFileSync(BUILDING_UNITS_FILE, 'utf8');

if (project.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  if (!fs.existsSync(SQL_FILE)) {
    console.log(`[${VERSION}] SQL 파일이 없으므로 다시 생성합니다.`);
  } else {
    process.exit(0);
  }
}

if (!project.includes(BASE_MARKER)) {
  fail('ProjectManagement.jsx가 v52.48.5.44.1 기준과 다릅니다. 기존 변경을 보호하기 위해 중단합니다.');
}

const backupRoot = path.resolve(
  ROOT,
  `backup_v52.48.5.44.2_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
backupFile(PROJECT_FILE, backupRoot);
backupFile(BUILDING_UNITS_FILE, backupRoot);

if (!project.includes(VERSION_MARKER)) {
  project = replaceOnce(
    project,
    BASE_MARKER,
    `${VERSION_MARKER}\n${BASE_MARKER}`,
    '버전 마커',
  );

  project = replaceOnce(
    project,
`  CircularProgress,
  Divider,
  IconButton,`,
`  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,`,
    'Dialog import',
  );

  project = replaceOnce(
    project,
`const createEmptyBuilding = (index = 0) => ({`,
`const normalizeFloorUnitTypes = (value) => {
  const source = safeObject(value);
  const normalized = {};

  Object.entries(source).forEach(([floorKey, unitMap]) => {
    const floor = Number(floorKey);
    if (!Number.isInteger(floor) || floor <= 0) return;

    const units = normalizeUnitTypes(unitMap);
    if (Object.keys(units).length > 0) {
      normalized[String(floor)] = units;
    }
  });

  return normalized;
};

const floorUnitTypesToOverrides = (value) => {
  const source = normalizeFloorUnitTypes(value);
  const rows = [];

  Object.entries(source)
    .sort(([first], [second]) => Number(first) - Number(second))
    .forEach(([floor, unitMap]) => {
      Object.entries(unitMap)
        .sort(([first], [second]) => Number(first) - Number(second))
        .forEach(([unitNumber, typeName], index) => {
          rows.push({
            clientId: \`floor-type-\${floor}-\${unitNumber}-\${index}\`,
            floor: String(floor),
            unitNumber: String(unitNumber),
            typeName: String(typeName || ''),
          });
        });
    });

  return rows;
};

const createFloorTypeOverride = (building) => ({
  clientId: \`new-floor-type-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`,
  floor: String(
    Number.isInteger(Number(building?.floors)) && Number(building?.floors) > 0
      ? Number(building.floors)
      : '',
  ),
  unitNumber: '1',
  typeName: '',
});

const createEmptyBuilding = (index = 0) => ({`,
    '층별 타입 예외 helper',
  );

  project = replaceOnce(
    project,
`  exceptionsText: '',
  unitTypes: {},
  rawConfig: {},`,
`  exceptionsText: '',
  unitTypes: {},
  floorUnitTypeOverrides: [],
  rawConfig: {},`,
    '새 동 타입 예외 기본값',
  );

  project = replaceOnce(
    project,
`    exceptionsText: formatExceptions(rawConfig.exceptions),
    unitTypes: normalizeUnitTypes(rawConfig.unitTypes),
    rawConfig,`,
`    exceptionsText: formatExceptions(rawConfig.exceptions),
    unitTypes: normalizeUnitTypes(rawConfig.unitTypes),
    floorUnitTypeOverrides: floorUnitTypesToOverrides(rawConfig.floorUnitTypes),
    rawConfig,`,
    '저장 데이터 타입 예외 불러오기',
  );

  project = replaceOnce(
    project,
`  const invalidPilotiFloor = pilotiFloors.find((floor) => floor > floors);
  if (invalidPilotiFloor) {
    throw new Error(
      \`\${building.buildingName} 필로티층 \${invalidPilotiFloor}층이 최고층 \${floors}층보다 큽니다.\`,
    );
  }

  return {`,
`  const invalidPilotiFloor = pilotiFloors.find((floor) => floor > floors);
  if (invalidPilotiFloor) {
    throw new Error(
      \`\${building.buildingName} 필로티층 \${invalidPilotiFloor}층이 최고층 \${floors}층보다 큽니다.\`,
    );
  }

  const floorUnitTypes = {};
  const seenFloorUnitTypes = new Set();

  (Array.isArray(building.floorUnitTypeOverrides)
    ? building.floorUnitTypeOverrides
    : []
  ).forEach((item, index) => {
    const floor = Number(item?.floor);
    const unitNumber = Number(item?.unitNumber);
    const typeName = String(item?.typeName || '').trim();

    if (!Number.isInteger(floor) || floor <= 0 || floor > floors) {
      throw new Error(
        \`\${building.buildingName} 층별 타입 예외 \${index + 1}번의 층을 1~\${floors} 범위로 입력해주세요.\`,
      );
    }

    if (!Number.isInteger(unitNumber) || unitNumber <= 0 || unitNumber > unitsPerFloor) {
      throw new Error(
        \`\${building.buildingName} \${floor}층 타입 예외의 호수를 1~\${unitsPerFloor} 범위로 입력해주세요.\`,
      );
    }

    if (!typeName) {
      throw new Error(
        \`\${building.buildingName} \${floor}층 \${unitNumber}호의 변경 타입을 입력해주세요.\`,
      );
    }

    const floorException = exceptions[String(floor)] || exceptions[floor] || null;
    const activeUnits = Array.isArray(floorException?.units) ? floorException.units : [];
    if (floorException && !activeUnits.includes(unitNumber)) {
      throw new Error(
        \`\${building.buildingName} \${floor}층 \${unitNumber}호는 예외층 설정상 존재하지 않는 세대입니다.\`,
      );
    }

    const isPilotiFloor = pilotiFloors.includes(floor);
    if (isPilotiFloor && (!floorException || !activeUnits.includes(unitNumber))) {
      throw new Error(
        \`\${building.buildingName} \${floor}층 \${unitNumber}호는 필로티 설정상 존재하지 않는 세대입니다.\`,
      );
    }

    const duplicateKey = \`\${floor}:\${unitNumber}\`;
    if (seenFloorUnitTypes.has(duplicateKey)) {
      throw new Error(
        \`\${building.buildingName} \${floor}층 \${unitNumber}호의 타입 예외가 중복되어 있습니다.\`,
      );
    }
    seenFloorUnitTypes.add(duplicateKey);

    if (!floorUnitTypes[String(floor)]) {
      floorUnitTypes[String(floor)] = {};
    }
    floorUnitTypes[String(floor)][String(unitNumber)] = typeName;
  });

  return {`,
    '층별 타입 예외 검증',
  );

  project = replaceOnce(
    project,
`    exceptions,
    unitTypes,
  };`,
`    exceptions,
    unitTypes,
    floorUnitTypes,
  };`,
    '층별 타입 예외 config 저장',
  );

  project = replaceOnce(
    project,
`  const [saving, setSaving] = useState(false);
  const [editExisting, setEditExisting] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);`,
`  const [saving, setSaving] = useState(false);
  const [editExisting, setEditExisting] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);`,
    '삭제 상태',
  );

  project = replaceOnce(
    project,
`  const addBuilding = () => {`,
`  const addFloorUnitTypeOverride = (clientId) => {
    setDraft((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        buildings: previous.buildings.map((building) => (
          building.clientId === clientId
            ? {
                ...building,
                floorUnitTypeOverrides: [
                  ...(Array.isArray(building.floorUnitTypeOverrides)
                    ? building.floorUnitTypeOverrides
                    : []),
                  createFloorTypeOverride(building),
                ],
              }
            : building
        )),
      };
    });
  };

  const updateFloorUnitTypeOverride = (
    clientId,
    overrideId,
    field,
    value,
  ) => {
    setDraft((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        buildings: previous.buildings.map((building) => {
          if (building.clientId !== clientId) return building;

          return {
            ...building,
            floorUnitTypeOverrides: (
              Array.isArray(building.floorUnitTypeOverrides)
                ? building.floorUnitTypeOverrides
                : []
            ).map((item) => (
              item.clientId === overrideId
                ? { ...item, [field]: value }
                : item
            )),
          };
        }),
      };
    });
  };

  const removeFloorUnitTypeOverride = (clientId, overrideId) => {
    setDraft((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        buildings: previous.buildings.map((building) => (
          building.clientId === clientId
            ? {
                ...building,
                floorUnitTypeOverrides: (
                  Array.isArray(building.floorUnitTypeOverrides)
                    ? building.floorUnitTypeOverrides
                    : []
                ).filter((item) => item.clientId !== overrideId),
              }
            : building
        )),
      };
    });
  };

  const addBuilding = () => {`,
    '층별 타입 예외 편집 함수',
  );

  project = replaceOnce(
    project,
`  const saveProject = async () => {`,
`  const requestProjectDelete = () => {
    if (!draft?.originalProjectName) return;

    setDeleteRequest({
      projectName: draft.originalProjectName,
    });
    setDeletePassword('');
  };

  const closeProjectDelete = () => {
    if (deleting) return;
    setDeleteRequest(null);
    setDeletePassword('');
  };

  const deleteProject = async () => {
    if (!deleteRequest?.projectName || deleting) return;

    const password = String(deletePassword || '');
    if (!password) {
      setMessage({
        severity: 'warning',
        text: '현장 삭제를 위해 현재 로그인 계정의 비밀번호를 입력해주세요.',
      });
      return;
    }

    setDeleting(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const email = String(userData?.user?.email || '').trim();
      if (!email) {
        throw new Error('현재 로그인 계정 이메일을 확인하지 못했습니다.');
      }

      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (passwordError) {
        throw new Error('로그인 비밀번호가 올바르지 않습니다.');
      }

      const projectName = deleteRequest.projectName;
      const { error } = await supabase.rpc('admin_delete_project_v1', {
        p_project_name: projectName,
      });
      if (error) throw error;

      setDeleteRequest(null);
      setDeletePassword('');
      setSelectedProjectName('');
      setDraft(null);
      setEditExisting(false);

      window.dispatchEvent(new CustomEvent('project-registry-changed', {
        detail: {
          projectName,
          action: 'deleted',
        },
      }));

      await loadProjects('');
      setMessage({
        severity: 'success',
        text: \`\${projectName} 현장을 현장목록에서 삭제했습니다.\`,
      });
    } catch (error) {
      console.error('현장 삭제 오류:', error);
      setMessage({
        severity: 'error',
        text: error?.message || '현장을 삭제하지 못했습니다.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const saveProject = async () => {`,
    '현장 삭제 함수',
  );

  project = replaceOnce(
    project,
`          help="최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대·호별 타입 기본구조를 관리합니다. 현장명 변경과 기존 동 삭제는 과거 데이터 연결 보호를 위해 제한합니다."`,
`          help="최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대·호별 타입을 관리합니다. 펜트하우스처럼 특정 층의 타입만 달라지는 경우 층별 타입 예외를 사용할 수 있습니다. 현장 삭제는 최고관리자 본인의 로그인 비밀번호를 다시 확인한 뒤 실행됩니다."`,
    '현장관리 도움말',
  );

  project = replaceOnce(
    project,
`                {isExisting && !editExisting && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditRoundedIcon />}
                    onClick={() => setEditExisting(true)}
                  >
                    구조 수정
                  </Button>
                )}`,
`                {isExisting && !editExisting && (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineRoundedIcon />}
                      onClick={requestProjectDelete}
                    >
                      현장 삭제
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditRoundedIcon />}
                      onClick={() => setEditExisting(true)}
                    >
                      구조 수정
                    </Button>
                  </>
                )}`,
    '현장 삭제 버튼',
  );

  project = replaceOnce(
    project,
`                                  />
                                );
                              },
                            )}
                          </Box>
                        </Box>
                      </Paper>`,
`                                  />
                                );
                              },
                            )}
                          </Box>
                        </Box>

                        <Box
                          sx={{
                            mt: 0.9,
                            p: 1,
                            border: '1px solid #e2e8f0',
                            borderRadius: 1,
                            bgcolor: '#ffffff',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.8,
                              mb: 0.75,
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ color: '#0f172a', fontSize: '0.72rem', fontWeight: 900 }}>
                                층별 타입 예외
                              </Typography>
                              <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.62rem', lineHeight: 1.45 }}>
                                펜트하우스처럼 특정 층의 특정 호만 기본 타입과 달라지는 경우 사용합니다. 예: 최상층 2호·3호 → 120T.
                              </Typography>
                            </Box>
                            <Box sx={{ flex: 1 }} />
                            {rowEditable && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddRoundedIcon />}
                                onClick={() => addFloorUnitTypeOverride(building.clientId)}
                              >
                                타입 예외 추가
                              </Button>
                            )}
                          </Box>

                          {(building.floorUnitTypeOverrides || []).length === 0 ? (
                            <Typography
                              sx={{
                                py: 0.9,
                                textAlign: 'center',
                                color: '#94a3b8',
                                fontSize: '0.64rem',
                              }}
                            >
                              등록된 층별 타입 예외가 없습니다.
                            </Typography>
                          ) : (
                            <Stack spacing={0.65}>
                              {(building.floorUnitTypeOverrides || []).map((item) => (
                                <Box
                                  key={item.clientId}
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                      xs: '1fr 1fr',
                                      md: '105px 105px minmax(150px, 1fr) 34px',
                                    },
                                    gap: 0.65,
                                    alignItems: 'center',
                                  }}
                                >
                                  <TextField
                                    size="small"
                                    type="number"
                                    label="층"
                                    value={item.floor}
                                    disabled={!rowEditable}
                                    inputProps={{ min: 1, max: Math.max(1, Number(building.floors) || 1), step: 1 }}
                                    onChange={(event) => updateFloorUnitTypeOverride(
                                      building.clientId,
                                      item.clientId,
                                      'floor',
                                      event.target.value,
                                    )}
                                  />
                                  <TextField
                                    size="small"
                                    type="number"
                                    label="호"
                                    value={item.unitNumber}
                                    disabled={!rowEditable}
                                    inputProps={{ min: 1, max: Math.max(1, Number(building.unitsPerFloor) || 1), step: 1 }}
                                    onChange={(event) => updateFloorUnitTypeOverride(
                                      building.clientId,
                                      item.clientId,
                                      'unitNumber',
                                      event.target.value,
                                    )}
                                  />
                                  <TextField
                                    size="small"
                                    label="변경 타입"
                                    value={item.typeName}
                                    disabled={!rowEditable}
                                    placeholder="예: 120T"
                                    onChange={(event) => updateFloorUnitTypeOverride(
                                      building.clientId,
                                      item.clientId,
                                      'typeName',
                                      event.target.value,
                                    )}
                                  />
                                  {rowEditable ? (
                                    <Tooltip title="타입 예외 삭제" arrow>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => removeFloorUnitTypeOverride(
                                          building.clientId,
                                          item.clientId,
                                        )}
                                      >
                                        <DeleteOutlineRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : (
                                    <Box />
                                  )}
                                </Box>
                              ))}
                            </Stack>
                          )}
                        </Box>
                      </Paper>`,
    '층별 타입 예외 UI',
  );

  project = replaceOnce(
    project,
`                  현장 추가가 완료되면 최고관리자의 상단 현장목록에 즉시 반영됩니다. 일반 사용자에게는 회원관리에서 해당 현장을 배정하면 됩니다. 기존 현장 삭제·현장명 변경·저장된 동 삭제는 과거 데이터 보호를 위해 이번 버전에서 제공하지 않습니다.`,
`                  현장 추가가 완료되면 최고관리자의 상단 현장목록에 즉시 반영됩니다. 일반 사용자에게는 회원관리에서 해당 현장을 배정하면 됩니다. 현장 삭제는 최고관리자 본인의 로그인 비밀번호 재확인 후 가능하며, 과거 업무이력은 자동 삭제하지 않습니다. 현장명 변경·저장된 동 삭제는 데이터 연결 보호를 위해 제한합니다.`,
    '하단 현장관리 안내',
  );

  project = replaceOnce(
    project,
`        </Paper>
      </Box>
    </Box>
  );
}`,
`        </Paper>
      </Box>

      <Dialog
        open={Boolean(deleteRequest)}
        onClose={closeProjectDelete}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          현장 삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 1.4 }}>
            「{deleteRequest?.projectName || ''}」 현장을 시스템의 현장목록과 동·층 기본설정에서 삭제합니다.
            기존 출력일보·공정·노임 등 과거 업무데이터는 안전을 위해 자동 삭제하지 않습니다.
          </Alert>

          <Typography sx={{ mb: 1, color: '#475569', fontSize: '0.72rem', lineHeight: 1.55 }}>
            삭제를 실행하려면 현재 로그인한 최고관리자 계정의 비밀번호를 다시 입력해주세요.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            size="small"
            type="password"
            label="로그인 비밀번호"
            autoComplete="current-password"
            value={deletePassword}
            disabled={deleting}
            onChange={(event) => setDeletePassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && deletePassword && !deleting) {
                deleteProject();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeProjectDelete} disabled={deleting}>
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={deleteProject}
            disabled={!deletePassword || deleting}
            startIcon={deleting ? <CircularProgress size={15} color="inherit" /> : <DeleteOutlineRoundedIcon />}
            sx={{ boxShadow: 'none' }}
          >
            비밀번호 확인 후 삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}`,
    '현장 삭제 확인 Dialog',
  );

  fs.writeFileSync(PROJECT_FILE, project, 'utf8');
}

if (!buildingUnits.includes('export const getUnitType =')) {
  buildingUnits = replaceOnce(
    buildingUnits,
`export const getCanonicalUnitCode = (
  config,
  floor,
  visualUnitNumber,
) =>
  getUnitCode(
    floor,
    getCanonicalUnitNumber(config, floor, visualUnitNumber),
  );`,
`export const getCanonicalUnitCode = (
  config,
  floor,
  visualUnitNumber,
) =>
  getUnitCode(
    floor,
    getCanonicalUnitNumber(config, floor, visualUnitNumber),
  );

/*
  v52.48.5.44.2 세대 타입 판정
  - floorUnitTypes: 특정 층/호 타입 예외가 최우선
  - unitTypes: 동별 기본 호 타입
  - aliasUnits가 있으면 실제 세대번호(canonical)를 우선 사용
*/
export const getUnitType = (config, floor, visualUnitNumber) => {
  const canonicalUnitNumber = getCanonicalUnitNumber(
    config,
    floor,
    visualUnitNumber,
  );

  const floorTypes =
    config?.floorUnitTypes?.[floor] ||
    config?.floorUnitTypes?.[String(floor)] ||
    {};

  const overrideType =
    floorTypes?.[canonicalUnitNumber] ??
    floorTypes?.[String(canonicalUnitNumber)] ??
    floorTypes?.[visualUnitNumber] ??
    floorTypes?.[String(visualUnitNumber)];

  if (String(overrideType || '').trim()) {
    return String(overrideType).trim();
  }

  const baseTypes = config?.unitTypes || {};
  const baseType =
    baseTypes?.[canonicalUnitNumber] ??
    baseTypes?.[String(canonicalUnitNumber)] ??
    baseTypes?.[visualUnitNumber] ??
    baseTypes?.[String(visualUnitNumber)];

  return String(baseType || '').trim();
};`,
    'buildingUnits getUnitType',
  );

  fs.writeFileSync(BUILDING_UNITS_FILE, buildingUnits, 'utf8');
}

const sql = `-- v52.48.5.44.2 현장 삭제 RPC
-- 최고관리자 본인 비밀번호 확인은 클라이언트에서 Supabase Auth signInWithPassword로 먼저 검증합니다.
-- 이 RPC는 서버에서도 현재 사용자가 최고관리자인지 다시 확인합니다.
-- 안전을 위해 기존 업무이력 테이블은 자동 삭제하지 않고 building_settings의 현장등록만 제거합니다.

create or replace function public.admin_delete_project_v1(
  p_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project text := btrim(coalesce(p_project_name, ''));
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_super_admin_v1() then
    raise exception '최고관리자만 현장을 삭제할 수 있습니다.';
  end if;

  if v_project = '' then
    raise exception '삭제할 현장명이 없습니다.';
  end if;

  if v_project in ('본사', '전체현장') then
    raise exception '본사/전체현장은 삭제할 수 없습니다.';
  end if;

  if not exists (
    select 1
      from public.building_settings
     where btrim(project_name) = v_project
  ) then
    raise exception '이미 삭제되었거나 존재하지 않는 현장입니다.';
  end if;

  delete from public.building_settings
   where btrim(project_name) = v_project;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'project_name', v_project,
    'deleted_building_rows', v_deleted,
    'historical_data_preserved', true
  );
end;
$$;

revoke all on function public.admin_delete_project_v1(text) from public;
grant execute on function public.admin_delete_project_v1(text) to authenticated;
`;

fs.mkdirSync(path.dirname(SQL_FILE), { recursive: true });
fs.writeFileSync(SQL_FILE, sql, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProjectManagement.jsx');
console.log('- 수정: src/utils/buildingUnits.js');
console.log('- 생성: supabase/v52.48.5.44.2_project_delete_floor_unit_types.sql');
console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
console.log('- 기능: 최고관리자 비밀번호 재확인 후 현장등록 삭제');
console.log('- 기능: 층별/호별 타입 예외 (펜트하우스 등)');
