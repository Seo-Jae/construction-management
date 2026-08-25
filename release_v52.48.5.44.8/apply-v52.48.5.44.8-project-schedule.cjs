const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.8';
const TARGETS = {
  project: path.resolve(
    process.cwd(),
    'src/page/ProjectManagement.jsx',
  ),
  main: path.resolve(
    process.cwd(),
    'src/page/MainDashboard.jsx',
  ),
  admin: path.resolve(
    process.cwd(),
    'src/page/AdminDashboard.jsx',
  ),
};

const VERSION_MARKERS = {
  project:
    '// v52.48.5.44.8 현장 시작일·종료일 관리 + Dashboard/Main 연동',
  main:
    '// v52.48.5.44.8 현장관리 시작일·종료일 연동',
  admin:
    '// v52.48.5.44.8 현장관리 시작일·종료일 연동',
};

function fail(message) {
  console.error(
    `[${VERSION}] ${message}`,
  );
  process.exit(1);
}

function replaceOnce(
  source,
  anchor,
  replacement,
  label,
) {
  const first =
    source.indexOf(anchor);

  if (first === -1) {
    fail(
      `적용 기준을 찾지 못했습니다: ${label}`,
    );
  }

  const second =
    source.indexOf(
      anchor,
      first + anchor.length,
    );

  if (second !== -1) {
    fail(
      `적용 기준이 2개 이상 발견되었습니다: ${label}`,
    );
  }

  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + anchor.length)
  );
}

Object.values(TARGETS).forEach(
  (target) => {
    if (!fs.existsSync(target)) {
      fail(
        `파일을 찾을 수 없습니다: ${target}`,
      );
    }
  },
);

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.8_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);

function patchFile(
  key,
  replacements,
) {
  const target = TARGETS[key];
  let source =
    fs.readFileSync(
      target,
      'utf8',
    );

  if (
    source.includes(
      VERSION_MARKERS[key],
    )
  ) {
    console.log(
      `- ${path.relative(
        process.cwd(),
        target,
      )}: 이미 적용됨`,
    );
    return;
  }

  const backupPath =
    path.join(
      backupDir,
      path.relative(
        process.cwd(),
        target,
      ),
    );

  fs.mkdirSync(
    path.dirname(backupPath),
    { recursive: true },
  );
  fs.copyFileSync(
    target,
    backupPath,
  );

  replacements.forEach(
    (item) => {
      source = replaceOnce(
        source,
        item.anchor,
        item.replacement,
        item.label,
      );
    },
  );

  fs.writeFileSync(
    target,
    source,
    'utf8',
  );

  console.log(
    `- 수정: ${path.relative(
      process.cwd(),
      target,
    )}`,
  );
}


patchFile('project', [{anchor:"// v52.48.5.44.2 현장삭제 비밀번호확인 + 층별 타입예외\n// v52.48.5.44.1 현장관리 동별 호별 타입",replacement:"// v52.48.5.44.8 현장 시작일·종료일 관리 + Dashboard/Main 연동\n// v52.48.5.44.2 현장삭제 비밀번호확인 + 층별 타입예외\n// v52.48.5.44.1 현장관리 동별 호별 타입",label:"ProjectManagement 버전 마커"},{anchor:"const EMPTY_MESSAGE = null;",replacement:"const EMPTY_MESSAGE = null;\n\nconst LEGACY_PROJECT_SCHEDULES = {\n  '한라건설 용인금어지구': {\n    startDate: '2025-06-30',\n    endDate: '2026-12-31',\n  },\n  '현대건설 용인마크밸리': {\n    startDate: '2025-10-31',\n    endDate: '2027-12-07',\n  },\n  '대우건설 용인현장': {\n    startDate: '2026-04-15',\n    endDate: '2028-02-29',\n  },\n};\n\nconst normalizeProjectDate = (value) => {\n  const text = String(value || '').trim();\n\n  if (!text) return '';\n\n  const normalized = text.replace(/\\./g, '-');\n\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(normalized)\n    ? normalized\n    : '';\n};\n\nconst getProjectDatesFromBuildings = (\n  projectName,\n  buildings,\n) => {\n  const configs = (\n    Array.isArray(buildings) ? buildings : []\n  ).map((building) => (\n    building?.rawConfig &&\n    typeof building.rawConfig === 'object' &&\n    !Array.isArray(building.rawConfig)\n      ? building.rawConfig\n      : {}\n  ));\n\n  const configuredStartDate = configs\n    .map((config) =>\n      normalizeProjectDate(\n        config.projectStartDate ||\n          config.project_start_date ||\n          config.startDate ||\n          config.start_date,\n      ),\n    )\n    .find(Boolean);\n\n  const configuredEndDate = configs\n    .map((config) =>\n      normalizeProjectDate(\n        config.projectEndDate ||\n          config.project_end_date ||\n          config.endDate ||\n          config.end_date,\n      ),\n    )\n    .find(Boolean);\n\n  const legacy =\n    LEGACY_PROJECT_SCHEDULES[projectName] || {};\n\n  return {\n    startDate:\n      configuredStartDate ||\n      normalizeProjectDate(legacy.startDate),\n    endDate:\n      configuredEndDate ||\n      normalizeProjectDate(legacy.endDate),\n  };\n};",label:"현장 일정 helper"},{anchor:"const normalizeProjects = (value) => (\n  (Array.isArray(value) ? value : [])\n    .map((item) => ({\n      projectName: String(item?.project_name || item?.projectName || '').trim(),\n      buildings: (Array.isArray(item?.buildings) ? item.buildings : [])\n        .map(normalizeBuilding)\n        .filter((building) => building.buildingName),\n    }))\n    .filter((item) => item.projectName)\n    .sort((first, second) => first.projectName.localeCompare(second.projectName, 'ko', { numeric: true }))\n);",replacement:"const normalizeProjects = (value) => (\n  (Array.isArray(value) ? value : [])\n    .map((item) => {\n      const projectName = String(\n        item?.project_name ||\n          item?.projectName ||\n          '',\n      ).trim();\n\n      const buildings = (\n        Array.isArray(item?.buildings)\n          ? item.buildings\n          : []\n      )\n        .map(normalizeBuilding)\n        .filter(\n          (building) =>\n            building.buildingName,\n        );\n\n      const projectDates =\n        getProjectDatesFromBuildings(\n          projectName,\n          buildings,\n        );\n\n      return {\n        projectName,\n        startDate:\n          projectDates.startDate,\n        endDate:\n          projectDates.endDate,\n        buildings,\n      };\n    })\n    .filter((item) => item.projectName)\n    .sort((first, second) =>\n      first.projectName.localeCompare(\n        second.projectName,\n        'ko',\n        { numeric: true },\n      ),\n    )\n);",label:"현장목록 일정 normalize"},{anchor:"        setDraft({\n          originalProjectName: selected.projectName,\n          projectName: selected.projectName,\n          buildings: selected.buildings,\n        });",replacement:"        setDraft({\n          originalProjectName: selected.projectName,\n          projectName: selected.projectName,\n          startDate: selected.startDate || '',\n          endDate: selected.endDate || '',\n          buildings: selected.buildings,\n        });",label:"목록 조회 draft 일정"},{anchor:"    setDraft({\n      originalProjectName: project.projectName,\n      projectName: project.projectName,\n      buildings: project.buildings.map((item) => ({",replacement:"    setDraft({\n      originalProjectName: project.projectName,\n      projectName: project.projectName,\n      startDate: project.startDate || '',\n      endDate: project.endDate || '',\n      buildings: project.buildings.map((item) => ({",label:"현장 선택 draft 일정"},{anchor:"    setDraft({\n      originalProjectName: '',\n      projectName: '',\n      buildings: [createEmptyBuilding(0)],\n    });",replacement:"    setDraft({\n      originalProjectName: '',\n      projectName: '',\n      startDate: '',\n      endDate: '',\n      buildings: [createEmptyBuilding(0)],\n    });",label:"새 현장 일정 초기값"},{anchor:"  const updateDraftProjectName = (value) => {\n    setDraft((previous) => previous\n      ? { ...previous, projectName: value }\n      : previous);\n  };\n\n  const updateBuilding = (clientId, field, value) => {",replacement:"  const updateDraftProjectName = (value) => {\n    setDraft((previous) => previous\n      ? { ...previous, projectName: value }\n      : previous);\n  };\n\n  const updateDraftProjectDate = (\n    field,\n    value,\n  ) => {\n    setDraft((previous) => previous\n      ? { ...previous, [field]: value }\n      : previous);\n  };\n\n  const updateBuilding = (clientId, field, value) => {",label:"현장 일정 입력 handler"},{anchor:"    if (!Array.isArray(draft.buildings) || draft.buildings.length === 0) {\n      setMessage({ severity: 'warning', text: '최소 1개 동을 등록해주세요.' });\n      return;\n    }\n\n    try {\n      const preparedBuildings = draft.buildings.map((building) => {",replacement:"    const startDate =\n      normalizeProjectDate(\n        draft.startDate,\n      );\n    const endDate =\n      normalizeProjectDate(\n        draft.endDate,\n      );\n\n    if (!startDate || !endDate) {\n      setMessage({\n        severity: 'warning',\n        text:\n          '현장 시작일과 종료일을 모두 지정해주세요.',\n      });\n      return;\n    }\n\n    if (startDate > endDate) {\n      setMessage({\n        severity: 'warning',\n        text:\n          '종료일은 시작일보다 빠를 수 없습니다.',\n      });\n      return;\n    }\n\n    if (!Array.isArray(draft.buildings) || draft.buildings.length === 0) {\n      setMessage({ severity: 'warning', text: '최소 1개 동을 등록해주세요.' });\n      return;\n    }\n\n    try {\n      const preparedBuildings = draft.buildings.map((building) => {",label:"현장 일정 저장 validation"},{anchor:"        return {\n          building_name: buildingName,\n          config_json: buildConfig(building),\n        };",replacement:"        return {\n          building_name: buildingName,\n          config_json: {\n            ...buildConfig(building),\n            projectStartDate:\n              startDate,\n            projectEndDate:\n              endDate,\n          },\n        };",label:"동 config에 현장 일정 저장"},{anchor:"      window.dispatchEvent(new CustomEvent('project-registry-changed', {\n        detail: { projectName },\n      }));",replacement:"      window.dispatchEvent(new CustomEvent('project-registry-changed', {\n        detail: {\n          projectName,\n          startDate,\n          endDate,\n          action:\n            draft.originalProjectName\n              ? 'updated'\n              : 'created',\n        },\n      }));",label:"현장 일정 변경 이벤트"},{anchor:"          help=\"최고관리자가 시스템 안에서 새 현장을 등록하고 동·층·세대·호별 타입을 관리합니다. 펜트하우스처럼 특정 층의 타입만 달라지는 경우 층별 타입 예외를 사용할 수 있습니다. 현장 삭제는 최고관리자 본인의 로그인 비밀번호를 다시 확인한 뒤 실행됩니다.\"",replacement:"          help=\"최고관리자가 시스템 안에서 현장명·시작일·종료일과 동·층·세대·호별 타입을 관리합니다. 시작일·종료일은 Main 및 전체 현장 Dashboard의 공사기간과 D-Day에 공통 적용됩니다. 펜트하우스처럼 특정 층의 타입만 달라지는 경우 층별 타입 예외를 사용할 수 있습니다. 현장 삭제는 최고관리자 본인의 로그인 비밀번호를 다시 확인한 뒤 실행됩니다.\"",label:"현장관리 도움말"},{anchor:"                      구조 수정\n                    </Button>",replacement:"                      현장정보·구조 수정\n                    </Button>",label:"현장 수정 버튼 명칭"},{anchor:"                    기존 현장은 조회 상태입니다. 변경이 필요할 때만 우측 상단의 「구조 수정」을 눌러주세요.",replacement:"                    기존 현장은 조회 상태입니다. 시작일·종료일 또는 동 구성을 변경할 때 우측 상단의 「현장정보·구조 수정」을 눌러주세요.",label:"조회 상태 안내"},{anchor:"                    최고층·호수·예외층 변경은 공정진척의 세대 구조에 영향을 줍니다. 기존 현장명과 이미 저장된 동명은 데이터 연결 보호를 위해 변경할 수 없습니다.",replacement:"                    시작일·종료일은 Dashboard와 Main에 즉시 연동됩니다. 최고층·호수·예외층 변경은 공정진척의 세대 구조에 영향을 줍니다. 기존 현장명과 이미 저장된 동명은 데이터 연결 보호를 위해 변경할 수 없습니다.",label:"수정 경고 안내"},{anchor:"                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 520px) 1fr' }, gap: 1.2, mb: 1.5 }}>\n                  <TextField\n                    label=\"현장명\"\n                    size=\"small\"\n                    value={draft.projectName}\n                    onChange={(event) => updateDraftProjectName(event.target.value)}\n                    disabled={isExisting || !editable}\n                    placeholder=\"예: ○○건설 ○○현장\"\n                  />\n                  <Box sx={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '0.68rem' }}>\n                    현장명은 저장 후 과거자료 연결키로 사용되므로 변경하지 않습니다.\n                  </Box>\n                </Box>",replacement:"                <Box\n                  sx={{\n                    display: 'grid',\n                    gridTemplateColumns: {\n                      xs: '1fr',\n                      md:\n                        'minmax(280px, 1.4fr) minmax(160px, .7fr) minmax(160px, .7fr)',\n                    },\n                    gap: 1.2,\n                    mb: 1.5,\n                  }}\n                >\n                  <TextField\n                    label=\"현장명\"\n                    size=\"small\"\n                    value={draft.projectName}\n                    onChange={(event) => updateDraftProjectName(event.target.value)}\n                    disabled={isExisting || !editable}\n                    placeholder=\"예: ○○건설 ○○현장\"\n                  />\n\n                  <TextField\n                    label=\"시작일\"\n                    type=\"date\"\n                    size=\"small\"\n                    value={draft.startDate || ''}\n                    onChange={(event) =>\n                      updateDraftProjectDate(\n                        'startDate',\n                        event.target.value,\n                      )\n                    }\n                    disabled={!editable}\n                    InputLabelProps={{\n                      shrink: true,\n                    }}\n                  />\n\n                  <TextField\n                    label=\"종료일\"\n                    type=\"date\"\n                    size=\"small\"\n                    value={draft.endDate || ''}\n                    onChange={(event) =>\n                      updateDraftProjectDate(\n                        'endDate',\n                        event.target.value,\n                      )\n                    }\n                    disabled={!editable}\n                    InputLabelProps={{\n                      shrink: true,\n                    }}\n                    inputProps={{\n                      min:\n                        draft.startDate ||\n                        undefined,\n                    }}\n                  />\n\n                  <Box\n                    sx={{\n                      gridColumn: {\n                        xs: '1',\n                        md: '1 / -1',\n                      },\n                      color: '#64748b',\n                      fontSize: '0.68rem',\n                    }}\n                  >\n                    현장명은 저장 후 과거자료 연결키로 사용되므로 변경하지 않습니다. 시작일·종료일은 Dashboard와 Main의 공사기간 표시에 사용됩니다.\n                  </Box>\n                </Box>",label:"현장명/시작일/종료일 입력 UI"}]);

patchFile('main', [{anchor:"import React, {\n  useCallback,",replacement:"// v52.48.5.44.8 현장관리 시작일·종료일 연동\nimport React, {\n  useCallback,",label:"MainDashboard 버전 마커"},{anchor:"const PROJECT_SCHEDULES = {\n  '한라건설 용인금어지구': {\n    startDate: '2025.06.30',\n    endDate: '2026.12.31',\n  },\n  '현대건설 용인마크밸리': {\n    startDate: '2025.10.31',\n    endDate: '2027.12.07',\n  },\n  '대우건설 용인현장': {\n    startDate: '2026.04.15',\n    endDate: '2028.02.29',\n  },\n};",replacement:"const LEGACY_PROJECT_SCHEDULES = {\n  '한라건설 용인금어지구': {\n    startDate: '2025-06-30',\n    endDate: '2026-12-31',\n  },\n  '현대건설 용인마크밸리': {\n    startDate: '2025-10-31',\n    endDate: '2027-12-07',\n  },\n  '대우건설 용인현장': {\n    startDate: '2026-04-15',\n    endDate: '2028-02-29',\n  },\n};\n\nconst formatProjectScheduleDate = (\n  value,\n) => {\n  const text = String(value || '').trim();\n\n  if (!text) return '';\n\n  const normalized =\n    text.replace(/\\./g, '-');\n  const matched =\n    normalized.match(\n      /^(\\d{4})-(\\d{2})-(\\d{2})$/,\n    );\n\n  if (!matched) return '';\n\n  return [\n    matched[1],\n    matched[2],\n    matched[3],\n  ].join('.');\n};\n\nconst getLegacyProjectSchedule = (\n  projectName,\n) => {\n  const schedule =\n    LEGACY_PROJECT_SCHEDULES[\n      projectName\n    ] || {};\n\n  return {\n    startDate:\n      formatProjectScheduleDate(\n        schedule.startDate,\n      ) || '일정 미등록',\n    endDate:\n      formatProjectScheduleDate(\n        schedule.endDate,\n      ) || '일정 미등록',\n  };\n};",label:"Main 일정 helper"},{anchor:"  const [progressSummaryRows, setProgressSummaryRows] =\n    useState([]);\n  const [laborSummary, setLaborSummary] = useState(",replacement:"  const [progressSummaryRows, setProgressSummaryRows] =\n    useState([]);\n  const [\n    projectSchedule,\n    setProjectSchedule,\n  ] = useState(() =>\n    getLegacyProjectSchedule(\n      projectName,\n    ),\n  );\n  const [laborSummary, setLaborSummary] = useState(",label:"Main 일정 state"},{anchor:"  const isSuperAdmin = userRole === '최고관리자';\n  const calendarMonthBounds = useMemo(",replacement:"  const isSuperAdmin = userRole === '최고관리자';\n\n  const loadProjectSchedule =\n    useCallback(async () => {\n      if (!projectName) {\n        setProjectSchedule({\n          startDate: '일정 미등록',\n          endDate: '일정 미등록',\n        });\n        return;\n      }\n\n      const fallback =\n        getLegacyProjectSchedule(\n          projectName,\n        );\n\n      try {\n        const { data, error } =\n          await supabase\n            .from('building_settings')\n            .select(\n              'building_name, config_json',\n            )\n            .eq(\n              'project_name',\n              projectName,\n            )\n            .order(\n              'building_name',\n              { ascending: true },\n            )\n            .limit(50);\n\n        if (error) throw error;\n\n        const configs = (\n          Array.isArray(data)\n            ? data\n            : []\n        )\n          .map(\n            (row) =>\n              row?.config_json || {},\n          )\n          .filter(Boolean);\n\n        const configuredStartDate =\n          configs\n            .map((config) =>\n              formatProjectScheduleDate(\n                config.projectStartDate ||\n                  config.project_start_date ||\n                  config.startDate ||\n                  config.start_date,\n              ),\n            )\n            .find(Boolean);\n\n        const configuredEndDate =\n          configs\n            .map((config) =>\n              formatProjectScheduleDate(\n                config.projectEndDate ||\n                  config.project_end_date ||\n                  config.endDate ||\n                  config.end_date,\n              ),\n            )\n            .find(Boolean);\n\n        setProjectSchedule({\n          startDate:\n            configuredStartDate ||\n            fallback.startDate,\n          endDate:\n            configuredEndDate ||\n            fallback.endDate,\n        });\n      } catch (error) {\n        console.error(\n          'Main 현장 공사기간 조회 오류:',\n          error,\n        );\n        setProjectSchedule(\n          fallback,\n        );\n      }\n    }, [projectName]);\n\n  useEffect(() => {\n    loadProjectSchedule();\n\n    const handleProjectRegistryChanged = (\n      event,\n    ) => {\n      const changedProjectName =\n        String(\n          event?.detail\n            ?.projectName || '',\n        ).trim();\n\n      if (\n        changedProjectName &&\n        changedProjectName !==\n          projectName\n      ) {\n        return;\n      }\n\n      loadProjectSchedule();\n    };\n\n    window.addEventListener(\n      'project-registry-changed',\n      handleProjectRegistryChanged,\n    );\n\n    return () => {\n      window.removeEventListener(\n        'project-registry-changed',\n        handleProjectRegistryChanged,\n      );\n    };\n  }, [\n    loadProjectSchedule,\n    projectName,\n  ]);\n\n  const calendarMonthBounds = useMemo(",label:"Main 일정 조회/변경 이벤트"},{anchor:"  const schedule =\n    PROJECT_SCHEDULES[projectName] || {\n      startDate: '일정 미등록',\n      endDate: '일정 미등록',\n    };",replacement:"  const schedule =\n    projectSchedule;",label:"Main 하드코딩 일정 제거"}]);

patchFile('admin', [{anchor:"import React, { useCallback, useEffect, useMemo, useState } from 'react';",replacement:"// v52.48.5.44.8 현장관리 시작일·종료일 연동\nimport React, { useCallback, useEffect, useMemo, useState } from 'react';",label:"AdminDashboard 버전 마커"},{anchor:"const PROJECT_SCHEDULES = {\n  '한라건설 용인금어지구': {\n    startDate: '25.06.30',\n    endDate: '26.12.31',\n  },\n  '현대건설 용인마크밸리': {\n    startDate: '25.10.31',\n    endDate: '27.12.07',\n  },\n  '대우건설 용인현장': {\n    startDate: '26.04.15',\n    endDate: '28.02.29',\n  },\n};",replacement:"const LEGACY_PROJECT_SCHEDULES = {\n  '한라건설 용인금어지구': {\n    startDate: '25.06.30',\n    endDate: '26.12.31',\n  },\n  '현대건설 용인마크밸리': {\n    startDate: '25.10.31',\n    endDate: '27.12.07',\n  },\n  '대우건설 용인현장': {\n    startDate: '26.04.15',\n    endDate: '28.02.29',\n  },\n};\n\nconst formatAdminScheduleDate = (\n  value,\n) => {\n  const text =\n    String(value || '').trim();\n\n  if (!text) return '';\n\n  const normalized =\n    text.replace(/-/g, '.');\n  const parts =\n    normalized.split('.');\n\n  if (parts.length !== 3) {\n    return '';\n  }\n\n  const [\n    year,\n    month,\n    day,\n  ] = parts;\n  const yy =\n    year.length === 4\n      ? year.slice(2)\n      : year;\n\n  if (\n    !/^\\d{2}$/.test(yy) ||\n    !/^\\d{2}$/.test(month) ||\n    !/^\\d{2}$/.test(day)\n  ) {\n    return '';\n  }\n\n  return `${yy}.${month}.${day}`;\n};",label:"Admin 일정 helper"},{anchor:"  const parts = String(dateKey || '')\n    .split('.')\n    .map(Number);",replacement:"  const parts = String(dateKey || '')\n    .replace(/-/g, '.')\n    .split('.')\n    .map(Number);",label:"Admin 날짜 parser 하이픈 지원"},{anchor:"const getProjectSchedule = (projectName, todayKey) => {\n  const schedule = PROJECT_SCHEDULES[projectName];\n\n  if (!schedule) {\n    return {\n      startDate: '-',\n      endDate: '-',\n      startSort: Number.MAX_SAFE_INTEGER,\n      dDayLabel: '일정 미등록',\n      dDayState: 'unknown',\n    };\n  }\n\n  const todayUtc = parseDateKeyToUtc(todayKey);\n  const startUtc = parseDateKeyToUtc(schedule.startDate);\n  const endUtc = parseDateKeyToUtc(schedule.endDate);",replacement:"const getProjectSchedule = (\n  projectName,\n  todayKey,\n  projectBuildings = [],\n) => {\n  const configs = (\n    Array.isArray(\n      projectBuildings,\n    )\n      ? projectBuildings\n      : []\n  )\n    .map(\n      (row) =>\n        row?.config_json || {},\n    )\n    .filter(Boolean);\n\n  const configuredStartDate =\n    configs\n      .map((config) =>\n        formatAdminScheduleDate(\n          config.projectStartDate ||\n            config.project_start_date ||\n            config.startDate ||\n            config.start_date,\n        ),\n      )\n      .find(Boolean);\n\n  const configuredEndDate =\n    configs\n      .map((config) =>\n        formatAdminScheduleDate(\n          config.projectEndDate ||\n            config.project_end_date ||\n            config.endDate ||\n            config.end_date,\n        ),\n      )\n      .find(Boolean);\n\n  const legacy =\n    LEGACY_PROJECT_SCHEDULES[\n      projectName\n    ] || {};\n\n  const schedule = {\n    startDate:\n      configuredStartDate ||\n      formatAdminScheduleDate(\n        legacy.startDate,\n      ),\n    endDate:\n      configuredEndDate ||\n      formatAdminScheduleDate(\n        legacy.endDate,\n      ),\n  };\n\n  if (\n    !schedule.startDate ||\n    !schedule.endDate\n  ) {\n    return {\n      startDate: '-',\n      endDate: '-',\n      startSort:\n        Number.MAX_SAFE_INTEGER,\n      dDayLabel: '일정 미등록',\n      dDayState: 'unknown',\n    };\n  }\n\n  const todayUtc = parseDateKeyToUtc(todayKey);\n  const startUtc = parseDateKeyToUtc(schedule.startDate);\n  const endUtc = parseDateKeyToUtc(schedule.endDate);",label:"Admin 현장 config 일정 우선"},{anchor:"        .map((projectName) => {\n          const projectSchedule = getProjectSchedule(\n            projectName,\n            todayKey,\n          );\n\n          const projectBuildings = buildingRows.filter(\n            (row) => row.project_name === projectName,\n          );",replacement:"        .map((projectName) => {\n          const projectBuildings = buildingRows.filter(\n            (row) => row.project_name === projectName,\n          );\n\n          const projectSchedule = getProjectSchedule(\n            projectName,\n            todayKey,\n            projectBuildings,\n          );",label:"Admin 프로젝트별 일정 계산 순서"}]);

console.log(
  `[${VERSION}] 적용 완료`,
);
console.log(
  '- 현장관리에서 시작일/종료일 입력 및 저장',
);
console.log(
  '- 날짜는 building_settings.config_json의 projectStartDate/projectEndDate에 저장',
);
console.log(
  '- Main은 현장 설정에서 공사기간을 직접 조회',
);
console.log(
  '- 전체 현장 Dashboard는 저장된 공사기간으로 시작일/종료일/D-Day 계산',
);
console.log(
  '- 기존 3개 현장은 저장 전까지 기존 일정값 fallback 유지',
);
console.log(
  '- 새 현장은 시작일/종료일 필수',
);
console.log(
  '- SQL 변경 없음',
);
console.log(
  `- 백업: ${path.relative(
    process.cwd(),
    backupDir,
  )}`,
);
