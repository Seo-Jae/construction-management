const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.5';
const TARGET = path.resolve(process.cwd(), 'src/page/ProgressInput.jsx');
const VERSION_MARKER = '// v52.48.5.44.5 공정별 현황 입력 타입별 세대현황 플로팅 패널';

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

const requiredAnchors = [
  "  useMemo,\n  useState,",
  "  Fade,\n  LinearProgress,",
  "import BuildingGrid from '../BuildingGrid';",
  "  getFloorCellKeys,\n  getProjectCellKeys,",
  "const normalizeUnitTypeBuildingName = (value) => {",
  "  const [\n    unitTypeError,\n    setUnitTypeError,\n  ] = useState('');",
  "  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(",
  "  useEffect(() => {\n    loadProjectUnitTypes();\n  }, [loadProjectUnitTypes]);",
  "  const toggleTargetPanelMinimized =\n    () => {",
  "      </Paper>\n\n      <Paper\n        elevation={1}\n        sx={{\n          mt: 0.5,",
];

requiredAnchors.forEach((anchor) => {
  if (!source.includes(anchor)) {
    fail(`현재 ProgressInput.jsx가 예상 기준과 다릅니다: ${anchor.slice(0, 80)}`);
  }
});

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.5_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/page/ProgressInput.jsx');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = `${VERSION_MARKER}\n${source}`;

source = replaceOnce(
  source,
`  useMemo,
  useState,`,
`  useMemo,
  useRef,
  useState,`,
  'React useRef import',
);

source = replaceOnce(
  source,
`  Fade,
  LinearProgress,`,
`  Fade,
  IconButton,
  LinearProgress,`,
  'MUI IconButton import',
);

source = replaceOnce(
  source,
`import BuildingGrid from '../BuildingGrid';`,
`import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import BuildingGrid from '../BuildingGrid';`,
  '타입 현황 패널 아이콘 import',
);

source = replaceOnce(
  source,
`  getFloorCellKeys,
  getProjectCellKeys,`,
`  buildFloorVisualCells,
  getCellKey,
  getFloorCellKeys,
  getProjectCellKeys,
  getUnitType,`,
  'buildingUnits 타입 판정 import',
);

source = replaceOnce(
  source,
`const normalizeUnitTypeBuildingName = (value) => {`,
`const TYPE_SUMMARY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#0f766e',
  '#ca8a04',
  '#be123c',
  '#0284c7',
  '#65a30d',
];

const TYPE_SUMMARY_PANEL_WIDTH = 328;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = 286;

const getTypeSummaryPreferenceStorageKey = (projectName) =>
  \`progress-input:\${encodeURIComponent(
    String(projectName || 'default'),
  )}:type-summary-panel\`;

const getDefaultTypeSummaryPanelState = () => {
  const viewportWidth =
    typeof window !== 'undefined'
      ? window.innerWidth
      : 1440;

  return {
    minimized: false,
    closed: false,
    x: Math.max(
      12,
      viewportWidth -
        TYPE_SUMMARY_PANEL_WIDTH -
        18,
    ),
    y: 128,
  };
};

const readStoredTypeSummaryPanelState = (projectName) => {
  const fallback = getDefaultTypeSummaryPanelState();

  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(
      getTypeSummaryPreferenceStorageKey(
        projectName,
      ),
    );

    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    return {
      minimized:
        parsed?.minimized === true,
      closed:
        parsed?.closed === true,
      x: Number.isFinite(Number(parsed?.x))
        ? Number(parsed.x)
        : fallback.x,
      y: Number.isFinite(Number(parsed?.y))
        ? Number(parsed.y)
        : fallback.y,
    };
  } catch (error) {
    console.warn(
      '타입별 세대현황 창 상태 조회 실패:',
      error,
    );
    return fallback;
  }
};

const storeTypeSummaryPanelState = (
  projectName,
  panelState,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      getTypeSummaryPreferenceStorageKey(
        projectName,
      ),
      JSON.stringify({
        minimized:
          panelState?.minimized === true,
        closed:
          panelState?.closed === true,
        x: Number(panelState?.x) || 0,
        y: Number(panelState?.y) || 0,
      }),
    );
  } catch (error) {
    console.warn(
      '타입별 세대현황 창 상태 저장 실패:',
      error,
    );
  }
};

const formatTypeSummaryPercentage = (
  completedCount,
  totalCount,
) => {
  if (!totalCount) return '0%';

  const percentage =
    (Number(completedCount || 0) /
      Number(totalCount)) *
    100;

  if (
    Math.abs(
      percentage -
        Math.round(percentage),
    ) < 0.05
  ) {
    return \`\${Math.round(
      percentage,
    )}%\`;
  }

  return \`\${percentage.toFixed(1)}%\`;
};

const normalizeUnitTypeBuildingName = (value) => {`,
  '타입 현황 공통 helper',
);

source = replaceOnce(
  source,
`  const [
    unitTypeError,
    setUnitTypeError,
  ] = useState('');

  const selectionCount =`,
`  const [
    unitTypeError,
    setUnitTypeError,
  ] = useState('');

  const [
    typeSummaryPanelState,
    setTypeSummaryPanelState,
  ] = useState(() =>
    readStoredTypeSummaryPanelState(
      projectName,
    ),
  );

  const typeSummaryDragRef =
    useRef(null);

  const selectionCount =`,
  '타입 현황 패널 state',
);

source = replaceOnce(
  source,
`  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(
    ([keyA], [keyB]) =>
      keyA.localeCompare(keyB, 'ko', {
        numeric: true,
      }),
  );

  const loadProjectUnitTypes =`,
`  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(
    ([keyA], [keyB]) =>
      keyA.localeCompare(keyB, 'ko', {
        numeric: true,
      }),
  );

  const typeHouseholdSummary =
    useMemo(() => {
      const groupedByType =
        new Map();
      const allCellKeys =
        getProjectCellKeys(
          buildingConfigs,
        );

      Object.entries(
        buildingConfigs || {},
      ).forEach(
        ([
          buildingName,
          config,
        ]) => {
          const floors =
            Number(
              config?.floors,
            ) || 0;

          for (
            let floor = 1;
            floor <= floors;
            floor += 1
          ) {
            buildFloorVisualCells(
              config,
              floor,
            ).forEach(
              (cell) => {
                if (
                  cell?.type !==
                    'valid' ||
                  !cell?.unitCode
                ) {
                  return;
                }

                const cellKey =
                  getCellKey(
                    buildingName,
                    cell.unitCode,
                  );

                const configType =
                  getUnitType(
                    config,
                    floor,
                    cell.visualStart,
                  );

                const legacyType =
                  String(
                    unitTypeData?.[
                      cellKey
                    ] || '',
                  ).trim();

                const unitType =
                  String(
                    configType ||
                      legacyType ||
                      '미지정',
                  ).trim();

                if (
                  !groupedByType.has(
                    unitType,
                  )
                ) {
                  groupedByType.set(
                    unitType,
                    {
                      typeName:
                        unitType,
                      totalCount: 0,
                      completedCount:
                        0,
                    },
                  );
                }

                const summary =
                  groupedByType.get(
                    unitType,
                  );

                summary.totalCount +=
                  1;

                if (
                  unitProgressData?.[
                    cellKey
                  ]?.status ===
                  '작업완료'
                ) {
                  summary.completedCount +=
                    1;
                }
              },
            );
          }
        },
      );

      const rows = Array.from(
        groupedByType.values(),
      )
        .sort(
          (first, second) => {
            if (
              first.typeName ===
              '미지정'
            ) {
              return 1;
            }

            if (
              second.typeName ===
              '미지정'
            ) {
              return -1;
            }

            return first.typeName.localeCompare(
              second.typeName,
              'ko',
              {
                numeric: true,
                sensitivity:
                  'base',
              },
            );
          },
        )
        .map(
          (row, index) => ({
            ...row,
            color:
              TYPE_SUMMARY_COLORS[
                index %
                  TYPE_SUMMARY_COLORS.length
              ],
            percentageLabel:
              formatTypeSummaryPercentage(
                row.completedCount,
                row.totalCount,
              ),
          }),
        );

      let aggregateCompletedCount =
        0;

      allCellKeys.forEach(
        (cellKey) => {
          if (
            unitProgressData?.[
              cellKey
            ]?.status ===
            '작업완료'
          ) {
            aggregateCompletedCount +=
              1;
          }
        },
      );

      return {
        rows,
        totalCount:
          allCellKeys.size,
        completedCount:
          aggregateCompletedCount,
        percentageLabel:
          formatTypeSummaryPercentage(
            aggregateCompletedCount,
            allCellKeys.size,
          ),
      };
    }, [
      buildingConfigs,
      unitProgressData,
      unitTypeData,
    ]);

  const loadProjectUnitTypes =`,
  '타입별 세대수/완료수 집계',
);

source = replaceOnce(
  source,
`  useEffect(() => {
    loadProjectUnitTypes();
  }, [loadProjectUnitTypes]);

  const loadProgressTargets =`,
`  useEffect(() => {
    loadProjectUnitTypes();
  }, [loadProjectUnitTypes]);

  useEffect(() => {
    setTypeSummaryPanelState(
      readStoredTypeSummaryPanelState(
        projectName,
      ),
    );
    typeSummaryDragRef.current =
      null;
  }, [projectName]);

  useEffect(() => {
    const handleResize = () => {
      setTypeSummaryPanelState(
        (previous) => {
          const width =
            previous.minimized
              ? TYPE_SUMMARY_PANEL_MIN_WIDTH
              : TYPE_SUMMARY_PANEL_WIDTH;
          const next = {
            ...previous,
            x: Math.min(
              Math.max(
                8,
                Number(
                  previous.x,
                ) || 8,
              ),
              Math.max(
                8,
                window.innerWidth -
                  width -
                  8,
              ),
            ),
            y: Math.min(
              Math.max(
                8,
                Number(
                  previous.y,
                ) || 8,
              ),
              Math.max(
                8,
                window.innerHeight -
                  48,
              ),
            ),
          };

          storeTypeSummaryPanelState(
            projectName,
            next,
          );

          return next;
        },
      );
    };

    window.addEventListener(
      'resize',
      handleResize,
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize,
      );
    };
  }, [projectName]);

  const loadProgressTargets =`,
  '타입 현황 패널 프로젝트/리사이즈 상태',
);

source = replaceOnce(
  source,
`  const toggleTargetPanelMinimized =
    () => {`,
`  const updateTypeSummaryPanelState =
    (updater) => {
      setTypeSummaryPanelState(
        (previous) => {
          const next =
            typeof updater ===
            'function'
              ? updater(previous)
              : updater;

          storeTypeSummaryPanelState(
            projectName,
            next,
          );

          return next;
        },
      );
    };

  const handleTypeSummaryPointerDown =
    (event) => {
      if (
        event.button !== 0 ||
        event.target.closest(
          'button',
        )
      ) {
        return;
      }

      const panel =
        event.currentTarget.closest(
          '[data-type-summary-panel="true"]',
        );

      if (!panel) return;

      const rect =
        panel.getBoundingClientRect();

      typeSummaryDragRef.current = {
        pointerId:
          event.pointerId,
        offsetX:
          event.clientX -
          rect.left,
        offsetY:
          event.clientY -
          rect.top,
        width:
          rect.width,
      };

      event.currentTarget
        .setPointerCapture?.(
          event.pointerId,
        );

      event.preventDefault();
    };

  const handleTypeSummaryPointerMove =
    (event) => {
      const drag =
        typeSummaryDragRef.current;

      if (
        !drag ||
        drag.pointerId !==
          event.pointerId
      ) {
        return;
      }

      const maxX =
        Math.max(
          8,
          window.innerWidth -
            drag.width -
            8,
        );
      const maxY =
        Math.max(
          8,
          window.innerHeight -
            48,
        );

      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          x: Math.min(
            Math.max(
              8,
              event.clientX -
                drag.offsetX,
            ),
            maxX,
          ),
          y: Math.min(
            Math.max(
              8,
              event.clientY -
                drag.offsetY,
            ),
            maxY,
          ),
        }),
      );
    };

  const handleTypeSummaryPointerUp =
    (event) => {
      const drag =
        typeSummaryDragRef.current;

      if (
        !drag ||
        drag.pointerId !==
          event.pointerId
      ) {
        return;
      }

      typeSummaryDragRef.current =
        null;

      event.currentTarget
        .releasePointerCapture?.(
          event.pointerId,
        );
    };

  const toggleTypeSummaryMinimized =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          minimized:
            !previous.minimized,
        }),
      );
    };

  const closeTypeSummaryPanel =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          closed: true,
        }),
      );
    };

  const reopenTypeSummaryPanel =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          closed: false,
          minimized: false,
        }),
      );
    };

  const toggleTargetPanelMinimized =
    () => {`,
  '타입 현황 이동/최소화/닫기 함수',
);

source = replaceOnce(
  source,
`      </Paper>

      <Paper
        elevation={1}
        sx={{
          mt: 0.5,`,
`      </Paper>

      {!typeSummaryPanelState.closed ? (
        <Paper
          data-type-summary-panel="true"
          elevation={8}
          sx={{
            position: 'fixed',
            left:
              typeSummaryPanelState.x,
            top:
              typeSummaryPanelState.y,
            width:
              typeSummaryPanelState.minimized
                ? TYPE_SUMMARY_PANEL_MIN_WIDTH
                : TYPE_SUMMARY_PANEL_WIDTH,
            maxWidth:
              'calc(100vw - 16px)',
            zIndex: 1350,
            overflow: 'hidden',
            bgcolor: '#ffffff',
            border:
              '1px solid #cbd5e1',
            borderRadius: 1.5,
            boxShadow:
              '0 12px 30px rgba(15, 23, 42, 0.18)',
            userSelect: 'none',
          }}
        >
          <Box
            onPointerDown={
              handleTypeSummaryPointerDown
            }
            onPointerMove={
              handleTypeSummaryPointerMove
            }
            onPointerUp={
              handleTypeSummaryPointerUp
            }
            onPointerCancel={
              handleTypeSummaryPointerUp
            }
            sx={{
              minHeight: 36,
              px: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 0.45,
              bgcolor: '#f8fafc',
              borderBottom:
                typeSummaryPanelState.minimized
                  ? 'none'
                  : '1px solid #e2e8f0',
              cursor: 'move',
              touchAction: 'none',
            }}
          >
            <DragIndicatorRoundedIcon
              sx={{
                color: '#94a3b8',
                fontSize: 18,
                flexShrink: 0,
              }}
            />

            <Box
              sx={{
                minWidth: 0,
                flex: 1,
              }}
            >
              <Typography
                noWrap
                sx={{
                  color: '#0f172a',
                  fontSize: '0.72rem',
                  lineHeight: 1.2,
                  fontWeight: 900,
                }}
              >
                타입별 세대 현황
              </Typography>
              <Typography
                noWrap
                sx={{
                  mt: 0.1,
                  color: '#64748b',
                  fontSize: '0.58rem',
                  lineHeight: 1.1,
                }}
              >
                {selectedProcess ||
                  '공정 미선택'}
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label={
                typeSummaryPanelState.minimized
                  ? '타입별 세대 현황 펼치기'
                  : '타입별 세대 현황 최소화'
              }
              onClick={
                toggleTypeSummaryMinimized
              }
              sx={{
                width: 25,
                height: 25,
                color: '#475569',
              }}
            >
              <RemoveRoundedIcon
                sx={{
                  fontSize: 17,
                }}
              />
            </IconButton>

            <IconButton
              size="small"
              aria-label="타입별 세대 현황 닫기"
              onClick={
                closeTypeSummaryPanel
              }
              sx={{
                width: 25,
                height: 25,
                color: '#64748b',
                '&:hover': {
                  color: '#dc2626',
                  bgcolor: '#fef2f2',
                },
              }}
            >
              <CloseRoundedIcon
                sx={{
                  fontSize: 17,
                }}
              />
            </IconButton>
          </Box>

          {!typeSummaryPanelState.minimized && (
            <Box
              sx={{
                px: 1,
                py: 0.8,
                maxHeight:
                  'min(390px, calc(100vh - 190px))',
                overflowY: 'auto',
              }}
            >
              {typeHouseholdSummary.rows
                .length === 0 ? (
                <Typography
                  sx={{
                    py: 1.1,
                    textAlign:
                      'center',
                    color:
                      '#94a3b8',
                    fontSize:
                      '0.66rem',
                  }}
                >
                  등록된 세대 타입이
                  없습니다.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 0.35,
                  }}
                >
                  {typeHouseholdSummary.rows.map(
                    (row) => (
                      <Box
                        key={
                          row.typeName
                        }
                        sx={{
                          minHeight: 23,
                          display:
                            'grid',
                          gridTemplateColumns:
                            '12px minmax(58px, 0.8fr) minmax(118px, 1.4fr)',
                          alignItems:
                            'center',
                          columnGap:
                            0.55,
                        }}
                      >
                        <Box
                          sx={{
                            width: 9,
                            height: 9,
                            borderRadius:
                              '2px',
                            bgcolor:
                              row.color,
                            border:
                              '1px solid rgba(15,23,42,0.14)',
                          }}
                        />

                        <Typography
                          noWrap
                          sx={{
                            color:
                              '#334155',
                            fontSize:
                              '0.68rem',
                            fontWeight:
                              800,
                          }}
                        >
                          {
                            row.typeName
                          }
                        </Typography>

                        <Typography
                          noWrap
                          sx={{
                            color:
                              '#475569',
                            fontSize:
                              '0.66rem',
                            fontWeight:
                              700,
                            textAlign:
                              'right',
                            fontVariantNumeric:
                              'tabular-nums',
                          }}
                        >
                          {
                            row.completedCount
                          }
                          /
                          {
                            row.totalCount
                          }
                          세대 (
                          {
                            row.percentageLabel
                          }
                          )
                        </Typography>
                      </Box>
                    ),
                  )}
                </Box>
              )}

              <Box
                sx={{
                  mt: 0.7,
                  pt: 0.7,
                  borderTop:
                    '1px solid #cbd5e1',
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    color: '#0f172a',
                    fontSize:
                      '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  합계
                </Typography>

                <Typography
                  noWrap
                  sx={{
                    color: '#0f172a',
                    fontSize:
                      '0.7rem',
                    fontWeight: 900,
                    fontVariantNumeric:
                      'tabular-nums',
                  }}
                >
                  {
                    typeHouseholdSummary.completedCount
                  }
                  /
                  {
                    typeHouseholdSummary.totalCount
                  }
                  세대 (
                  {
                    typeHouseholdSummary.percentageLabel
                  }
                  )
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <GridViewRoundedIcon
              sx={{
                fontSize:
                  '15px !important',
              }}
            />
          }
          onClick={
            reopenTypeSummaryPanel
          }
          sx={{
            position: 'fixed',
            right: 14,
            top: 128,
            zIndex: 1350,
            minWidth: 0,
            px: 0.9,
            py: 0.4,
            color: '#475569',
            borderColor:
              '#cbd5e1',
            bgcolor: '#ffffff',
            fontSize: '0.65rem',
            fontWeight: 800,
            boxShadow:
              '0 6px 16px rgba(15,23,42,0.12)',
            '&:hover': {
              bgcolor: '#f8fafc',
              borderColor:
                '#94a3b8',
            },
          }}
        >
          타입 현황
        </Button>
      )}

      <Paper
        elevation={1}
        sx={{
          mt: 0.5,`,
  '상단 우측 타입별 세대현황 플로팅 패널',
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressInput.jsx');
console.log('- 기능: 선택 공정 기준 타입별 완료/전체 세대수 및 진행률');
console.log('- 기능: 타입별 색상 사각표시는 플로팅 패널 내부에서만 사용');
console.log('- 기능: 상단 우측 기본 위치 / 드래그 이동 / 최소화 / 닫기 / 다시열기');
console.log('- 기능: 현장관리 unitTypes + floorUnitTypes 및 기존 project_unit_types 모두 호환');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
