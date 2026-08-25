// v52.48.5.44 최고관리자 현장관리
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import { countUniqueUnits } from '../utils/buildingUnits.js';

const EMPTY_MESSAGE = null;

const safeObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (_error) {
      return {};
    }
  }
  return {};
};

const parsePositiveInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label}은(는) 1 이상의 정수로 입력해주세요.`);
  }
  return number;
};

const parseNumberList = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return [];

  return [...new Set(
    normalized
      .split(/[\s,]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )].sort((first, second) => first - second);
};

const formatNumberList = (value) => (
  Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
        .sort((first, second) => first - second)
        .join(',')
    : ''
);

const parseExceptionsText = (value) => {
  const text = String(value || '').trim();
  if (!text) return {};

  const result = {};
  const segments = text
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  segments.forEach((segment) => {
    const matched = segment.match(/^(\d+)\s*(?:=|:)\s*(.+)$/);
    if (!matched) {
      throw new Error(
        `예외층 형식이 올바르지 않습니다: "${segment}" · 예: 21=1,2,3; 22=1,2,3`,
      );
    }

    const floor = Number(matched[1]);
    const units = parseNumberList(matched[2]);

    if (!Number.isInteger(floor) || floor <= 0 || units.length === 0) {
      throw new Error(
        `예외층 값이 올바르지 않습니다: "${segment}"`,
      );
    }

    result[floor] = { units };
  });

  return result;
};

const formatExceptions = (value) => {
  const source = safeObject(value);

  return Object.entries(source)
    .map(([floor, config]) => ({
      floor: Number(floor),
      units: Array.isArray(config?.units) ? config.units : [],
    }))
    .filter((item) => Number.isInteger(item.floor) && item.floor > 0)
    .sort((first, second) => first.floor - second.floor)
    .map((item) => `${item.floor}=${formatNumberList(item.units)}`)
    .join('; ');
};

const createEmptyBuilding = (index = 0) => ({
  clientId: `new-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
  persisted: false,
  buildingName: `${101 + index}동`,
  floors: '1',
  unitsPerFloor: '4',
  pilotiFloorsText: '1',
  exceptionsText: '',
  rawConfig: {},
});

const normalizeBuilding = (row, index) => {
  const rawConfig = safeObject(row?.config_json ?? row?.configJson);

  return {
    clientId: `saved-${String(row?.building_name || row?.buildingName || index)}`,
    persisted: true,
    buildingName: String(row?.building_name || row?.buildingName || '').trim(),
    floors: String(rawConfig.floors ?? ''),
    unitsPerFloor: String(rawConfig.unitsPerFloor ?? ''),
    pilotiFloorsText: formatNumberList(rawConfig.pilotiFloors),
    exceptionsText: formatExceptions(rawConfig.exceptions),
    rawConfig,
  };
};

const normalizeProjects = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      projectName: String(item?.project_name || item?.projectName || '').trim(),
      buildings: (Array.isArray(item?.buildings) ? item.buildings : [])
        .map(normalizeBuilding)
        .filter((building) => building.buildingName),
    }))
    .filter((item) => item.projectName)
    .sort((first, second) => first.projectName.localeCompare(second.projectName, 'ko', { numeric: true }))
);

const buildConfig = (building) => {
  const floors = parsePositiveInteger(building.floors, `${building.buildingName || '동'} 최고층`);
  const unitsPerFloor = parsePositiveInteger(
    building.unitsPerFloor,
    `${building.buildingName || '동'} 기준 호수/층`,
  );
  const pilotiFloors = parseNumberList(building.pilotiFloorsText);
  const exceptions = parseExceptionsText(building.exceptionsText);

  Object.keys(exceptions).forEach((floorKey) => {
    const floor = Number(floorKey);
    if (floor > floors) {
      throw new Error(`${building.buildingName} 예외층 ${floor}층이 최고층 ${floors}층보다 큽니다.`);
    }
    const invalidUnit = exceptions[floorKey].units.find((unit) => unit > unitsPerFloor);
    if (invalidUnit) {
      throw new Error(
        `${building.buildingName} ${floor}층의 ${invalidUnit}호가 기준 호수/층 ${unitsPerFloor}를 초과합니다.`,
      );
    }
  });

  const invalidPilotiFloor = pilotiFloors.find((floor) => floor > floors);
  if (invalidPilotiFloor) {
    throw new Error(
      `${building.buildingName} 필로티층 ${invalidPilotiFloor}층이 최고층 ${floors}층보다 큽니다.`,
    );
  }

  return {
    ...safeObject(building.rawConfig),
    floors,
    unitsPerFloor,
    pilotiFloors,
    exceptions,
  };
};

const getUnitCountSafe = (building) => {
  try {
    return countUniqueUnits(buildConfig(building));
  } catch (_error) {
    return null;
  }
};

export default function ProjectManagement() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editExisting, setEditExisting] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);

  const loadProjects = useCallback(async (preferredProjectName = '') => {
    setLoading(true);
    setMessage(EMPTY_MESSAGE);

    try {
      const { data, error } = await supabase.rpc('admin_list_projects_v1');
      if (error) throw error;

      const normalized = normalizeProjects(data);
      setProjects(normalized);

      const nextProjectName =
        String(preferredProjectName || selectedProjectName || '').trim();
      const selected = normalized.find((item) => item.projectName === nextProjectName)
        || normalized[0]
        || null;

      if (selected) {
        setSelectedProjectName(selected.projectName);
        setDraft({
          originalProjectName: selected.projectName,
          projectName: selected.projectName,
          buildings: selected.buildings,
        });
      } else {
        setSelectedProjectName('');
        setDraft(null);
      }
      setEditExisting(false);
    } catch (error) {
      console.error('현장관리 목록 조회 오류:', error);
      setProjects([]);
      setSelectedProjectName('');
      setDraft(null);
      setMessage({
        severity: 'error',
        text:
          error?.message ||
          '현장목록을 불러오지 못했습니다. v52.48.5.44 SQL 적용 여부를 확인해주세요.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProjectName]);

  useEffect(() => {
    loadProjects();
    // 최초 진입 시 한 번만 조회합니다. 이후에는 새로고침/저장 시 명시적으로 다시 읽습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProject = useMemo(
    () => projects.find((item) => item.projectName === selectedProjectName) || null,
    [projects, selectedProjectName],
  );

  const isExisting = Boolean(draft?.originalProjectName);
  const editable = Boolean(draft) && (!isExisting || editExisting);

  const totalUnits = useMemo(() => {
    if (!draft?.buildings?.length) return 0;
    return draft.buildings.reduce((sum, building) => {
      const count = getUnitCountSafe(building);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0);
  }, [draft]);

  const selectProject = (project) => {
    if (!project) return;
    setSelectedProjectName(project.projectName);
    setDraft({
      originalProjectName: project.projectName,
      projectName: project.projectName,
      buildings: project.buildings.map((item) => ({
        ...item,
        rawConfig: { ...safeObject(item.rawConfig) },
      })),
    });
    setEditExisting(false);
    setMessage(EMPTY_MESSAGE);
  };

  const startNewProject = () => {
    setSelectedProjectName('');
    setDraft({
      originalProjectName: '',
      projectName: '',
      buildings: [createEmptyBuilding(0)],
    });
    setEditExisting(false);
    setMessage({
      severity: 'info',
      text: '새 현장의 현장명과 동 구성을 입력한 뒤 저장해주세요.',
    });
  };

  const updateDraftProjectName = (value) => {
    setDraft((previous) => previous
      ? { ...previous, projectName: value }
      : previous);
  };

  const updateBuilding = (clientId, field, value) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        buildings: previous.buildings.map((building) => (
          building.clientId === clientId
            ? { ...building, [field]: value }
            : building
        )),
      };
    });
  };

  const addBuilding = () => {
    setDraft((previous) => {
      if (!previous) return previous;
      const usedNames = new Set(previous.buildings.map((item) => item.buildingName));
      let candidate = 101;
      while (usedNames.has(`${candidate}동`)) candidate += 1;
      return {
        ...previous,
        buildings: [
          ...previous.buildings,
          {
            ...createEmptyBuilding(previous.buildings.length),
            buildingName: `${candidate}동`,
          },
        ],
      };
    });
  };

  const removeNewBuilding = (clientId) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const target = previous.buildings.find((item) => item.clientId === clientId);
      if (!target || target.persisted) return previous;
      return {
        ...previous,
        buildings: previous.buildings.filter((item) => item.clientId !== clientId),
      };
    });
  };

  const cancelExistingEdit = () => {
    if (!selectedProject) return;
    selectProject(selectedProject);
  };

  const saveProject = async () => {
    if (!draft || saving) return;

    const projectName = String(draft.projectName || '').trim();
    if (!projectName) {
      setMessage({ severity: 'warning', text: '현장명을 입력해주세요.' });
      return;
    }
    if (projectName === '본사' || projectName === '전체현장') {
      setMessage({ severity: 'warning', text: '본사/전체현장은 현장명으로 사용할 수 없습니다.' });
      return;
    }
    if (!Array.isArray(draft.buildings) || draft.buildings.length === 0) {
      setMessage({ severity: 'warning', text: '최소 1개 동을 등록해주세요.' });
      return;
    }

    try {
      const preparedBuildings = draft.buildings.map((building) => {
        const buildingName = String(building.buildingName || '').trim();
        if (!buildingName) throw new Error('동명을 입력해주세요.');
        return {
          building_name: buildingName,
          config_json: buildConfig(building),
        };
      });

      const buildingNames = preparedBuildings.map((item) => item.building_name);
      if (new Set(buildingNames).size !== buildingNames.length) {
        throw new Error('같은 동명이 중복되어 있습니다. 동명을 확인해주세요.');
      }

      setSaving(true);
      setMessage(EMPTY_MESSAGE);

      const { error } = await supabase.rpc('admin_save_project_v1', {
        p_original_project_name: draft.originalProjectName || null,
        p_project_name: projectName,
        p_buildings: preparedBuildings,
      });
      if (error) throw error;

      window.dispatchEvent(new CustomEvent('project-registry-changed', {
        detail: { projectName },
      }));

      await loadProjects(projectName);
      setMessage({
        severity: 'success',
        text: draft.originalProjectName
          ? `${projectName} 현장구조를 저장했습니다.`
          : `${projectName} 현장을 추가했습니다. 상단 현장목록과 회원관리의 현장배정에서 사용할 수 있습니다.`,
      });
    } catch (error) {
      console.error('현장 저장 오류:', error);
      setMessage({
        severity: 'error',
        text: error?.message || '현장을 저장하지 못했습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.2 }}>
      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: 1.2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderColor: '#dbe3ec',
          boxShadow: 'none',
        }}
      >
        <SystemPageTitle
          title="현장관리"
          help="최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대 기본구조를 관리합니다. 현장명 변경과 기존 동 삭제는 과거 데이터 연결 보호를 위해 제한합니다."
        />
        <Chip size="small" variant="outlined" label={`등록현장 ${projects.length}`} />
        <Box sx={{ flex: 1 }} />
        <SystemRefreshButton onClick={() => loadProjects()} loading={loading} />
        <Button
          size="small"
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={startNewProject}
          sx={{ boxShadow: 'none' }}
        >
          새 현장 추가
        </Button>
      </Paper>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(EMPTY_MESSAGE)}>
          {message.text}
        </Alert>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '285px minmax(0,1fr)' },
          gap: 1.2,
        }}
      >
        <Paper
          variant="outlined"
          sx={{ minHeight: 0, overflow: 'hidden', borderColor: '#cbd5e1', boxShadow: 'none' }}
        >
          <Box sx={{ px: 1.4, py: 1.05, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#0f172a' }}>
              현장목록
            </Typography>
          </Box>

          <Box sx={{ maxHeight: '100%', overflowY: 'auto', p: 0.7 }}>
            {loading && projects.length === 0 ? (
              <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : projects.length === 0 ? (
              <Box sx={{ py: 5, px: 1.5, textAlign: 'center', color: '#94a3b8' }}>
                <ApartmentRoundedIcon sx={{ fontSize: 34, mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800 }}>
                  등록된 현장이 없습니다.
                </Typography>
              </Box>
            ) : (
              projects.map((project) => {
                const selected = selectedProjectName === project.projectName && isExisting;
                const projectUnitCount = project.buildings.reduce((sum, building) => {
                  const count = getUnitCountSafe(building);
                  return sum + (Number.isFinite(count) ? count : 0);
                }, 0);

                return (
                  <Button
                    key={project.projectName}
                    fullWidth
                    variant={selected ? 'contained' : 'text'}
                    onClick={() => selectProject(project)}
                    sx={{
                      minHeight: 48,
                      mb: 0.35,
                      px: 1,
                      py: 0.55,
                      display: 'flex',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      boxShadow: 'none',
                      color: selected ? '#fff' : '#334155',
                    }}
                  >
                    <Box sx={{ minWidth: 0, width: '100%' }}>
                      <Typography noWrap sx={{ fontSize: '0.74rem', fontWeight: 900 }}>
                        {project.projectName}
                      </Typography>
                      <Typography
                        noWrap
                        sx={{ mt: 0.1, fontSize: '0.62rem', color: selected ? 'rgba(255,255,255,.76)' : '#94a3b8' }}
                      >
                        {project.buildings.length}개 동 · {projectUnitCount.toLocaleString()}세대
                      </Typography>
                    </Box>
                  </Button>
                );
              })
            )}
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ minHeight: 0, overflow: 'hidden', borderColor: '#cbd5e1', boxShadow: 'none' }}
        >
          {!draft ? (
            <Box sx={{ height: '100%', minHeight: 320, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
              <Stack alignItems="center" spacing={0.6}>
                <ApartmentRoundedIcon sx={{ fontSize: 44 }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>
                  왼쪽 현장을 선택하거나 새 현장을 추가해주세요.
                </Typography>
              </Stack>
            </Box>
          ) : (
            <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  px: 1.5,
                  py: 1.1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                  borderBottom: '1px solid #e2e8f0',
                  bgcolor: '#f8fafc',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>
                    {isExisting ? draft.projectName : '새 현장 등록'}
                  </Typography>
                  <Typography sx={{ mt: 0.1, color: '#64748b', fontSize: '0.64rem' }}>
                    {draft.buildings.length}개 동 · 예상 {totalUnits.toLocaleString()}세대
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }} />
                {isExisting && !editExisting && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditRoundedIcon />}
                    onClick={() => setEditExisting(true)}
                  >
                    구조 수정
                  </Button>
                )}
                {isExisting && editExisting && (
                  <Button size="small" variant="outlined" onClick={cancelExistingEdit} disabled={saving}>
                    수정 취소
                  </Button>
                )}
                {editable && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <SaveRoundedIcon />}
                    onClick={saveProject}
                    disabled={saving}
                    sx={{ boxShadow: 'none' }}
                  >
                    {isExisting ? '변경 저장' : '현장 추가'}
                  </Button>
                )}
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
                {isExisting && !editExisting && (
                  <Alert severity="info" sx={{ mb: 1.2 }}>
                    기존 현장은 조회 상태입니다. 변경이 필요할 때만 우측 상단의 「구조 수정」을 눌러주세요.
                  </Alert>
                )}
                {isExisting && editExisting && (
                  <Alert severity="warning" sx={{ mb: 1.2 }}>
                    최고층·호수·예외층 변경은 공정진척의 세대 구조에 영향을 줍니다. 기존 현장명과 이미 저장된 동명은 데이터 연결 보호를 위해 변경할 수 없습니다.
                  </Alert>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 520px) 1fr' }, gap: 1.2, mb: 1.5 }}>
                  <TextField
                    label="현장명"
                    size="small"
                    value={draft.projectName}
                    onChange={(event) => updateDraftProjectName(event.target.value)}
                    disabled={isExisting || !editable}
                    placeholder="예: ○○건설 ○○현장"
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '0.68rem' }}>
                    현장명은 저장 후 과거자료 연결키로 사용되므로 변경하지 않습니다.
                  </Box>
                </Box>

                <Divider sx={{ mb: 1.3 }} />

                <Stack spacing={1.05}>
                  {draft.buildings.map((building, index) => {
                    const unitCount = getUnitCountSafe(building);
                    const rowEditable = editable;

                    return (
                      <Paper
                        key={building.clientId}
                        variant="outlined"
                        sx={{ p: 1.2, borderColor: '#dbe3ec', boxShadow: 'none' }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                          <Chip size="small" label={`${index + 1}`} />
                          <Typography sx={{ fontSize: '0.76rem', fontWeight: 900 }}>
                            {building.buildingName || `${index + 1}번째 동`}
                          </Typography>
                          {Number.isFinite(unitCount) && (
                            <Chip size="small" variant="outlined" label={`${unitCount.toLocaleString()}세대`} />
                          )}
                          <Box sx={{ flex: 1 }} />
                          {!building.persisted && rowEditable && draft.buildings.length > 1 && (
                            <Tooltip title="아직 저장하지 않은 동 삭제" arrow>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => removeNewBuilding(building.clientId)}
                              >
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>

                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                              xs: '1fr',
                              md: '160px 120px 140px minmax(180px, 1fr)',
                            },
                            gap: 0.8,
                          }}
                        >
                          <TextField
                            size="small"
                            label="동명"
                            value={building.buildingName}
                            disabled={!rowEditable || building.persisted}
                            onChange={(event) => updateBuilding(building.clientId, 'buildingName', event.target.value)}
                          />
                          <TextField
                            size="small"
                            label="최고층"
                            type="number"
                            value={building.floors}
                            disabled={!rowEditable}
                            inputProps={{ min: 1, step: 1 }}
                            onChange={(event) => updateBuilding(building.clientId, 'floors', event.target.value)}
                          />
                          <TextField
                            size="small"
                            label="기준 호수/층"
                            type="number"
                            value={building.unitsPerFloor}
                            disabled={!rowEditable}
                            inputProps={{ min: 1, step: 1 }}
                            onChange={(event) => updateBuilding(building.clientId, 'unitsPerFloor', event.target.value)}
                          />
                          <TextField
                            size="small"
                            label="필로티층"
                            value={building.pilotiFloorsText}
                            disabled={!rowEditable}
                            placeholder="예: 1 또는 1,2"
                            onChange={(event) => updateBuilding(building.clientId, 'pilotiFloorsText', event.target.value)}
                          />
                        </Box>

                        <TextField
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
                      </Paper>
                    );
                  })}
                </Stack>

                {editable && (
                  <Button
                    sx={{ mt: 1.1 }}
                    size="small"
                    variant="outlined"
                    startIcon={<AddRoundedIcon />}
                    onClick={addBuilding}
                  >
                    동 추가
                  </Button>
                )}

                <Alert severity="info" sx={{ mt: 1.5 }}>
                  현장 추가가 완료되면 최고관리자의 상단 현장목록에 즉시 반영됩니다. 일반 사용자에게는 회원관리에서 해당 현장을 배정하면 됩니다. 기존 현장 삭제·현장명 변경·저장된 동 삭제는 과거 데이터 보호를 위해 이번 버전에서 제공하지 않습니다.
                </Alert>
              </Box>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
