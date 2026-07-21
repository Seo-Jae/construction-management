import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AssignmentLateRoundedIcon from '@mui/icons-material/AssignmentLateRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;

const STATUS_META = {
  required: {
    label: '미작성',
    color: 'error',
    screenGroup: 'missing',
  },
  pdf_generated: {
    label: 'PDF 생성',
    color: 'primary',
    screenGroup: 'progress',
  },
  scan_verified: {
    label: '서명본 확인',
    color: 'secondary',
    screenGroup: 'progress',
  },
  manager_confirmed: {
    label: '작성완료',
    color: 'success',
    screenGroup: 'complete',
  },
  rejected: {
    label: '반려',
    color: 'error',
    screenGroup: 'missing',
  },
  excluded: {
    label: '제외',
    color: 'default',
    screenGroup: 'excluded',
  },
};

const ACCESS_ROLE_LABELS = {
  site_manager: '현장 담당자',
  labor_manager: '노임 관리자',
  admin: '최고관리자',
};

const getKoreaMonthKey = () => {
  const now = new Date(
    new Date().toLocaleString(
      'en-US',
      {
        timeZone: 'Asia/Seoul',
      },
    ),
  );

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1,
    ).padStart(2, '0'),
  ].join('-');
};

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const parseReportDate = (value) => {
  const text =
    String(value || '').trim();

  let matched =
    text.match(
      /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/,
    );

  if (matched) {
    const year =
      2000 +
      Number(matched[1]);

    const month =
      Number(matched[2]);

    const day =
      Number(matched[3]);

    const date =
      new Date(
        year,
        month - 1,
        day,
      );

    if (
      date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day
    ) {
      return [
        String(year),
        String(month).padStart(
          2,
          '0',
        ),
        String(day).padStart(
          2,
          '0',
        ),
      ].join('-');
    }
  }

  matched =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
    );

  if (matched) {
    return [
      matched[1],
      String(
        Number(matched[2]),
      ).padStart(2, '0'),
      String(
        Number(matched[3]),
      ).padStart(2, '0'),
    ].join('-');
  }

  return '';
};

const formatShortDate = (value) => {
  if (!value) {
    return '-';
  }

  const matched =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})/,
    );

  if (!matched) {
    return String(value);
  }

  return [
    matched[1].slice(-2),
    matched[2],
    matched[3],
  ].join('.');
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    'ko-KR',
    {
      timeZone: 'Asia/Seoul',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  );
};

const formatMonthLabel = (
  monthKey,
) => {
  const [
    year,
    month,
  ] = String(monthKey || '')
    .split('-');

  if (!year || !month) {
    return '-';
  }

  return `${year}년 ${Number(month)}월`;
};

const maskPhone = (value) => {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  if (digits.length < 8) {
    return value || '미등록';
  }

  return [
    digits.slice(0, 3),
    '****',
    digits.slice(-4),
  ].join('-');
};

const getWorkerWorkAmount = (
  worker,
) => {
  const day =
    Number(worker?.day || 0);

  const night =
    Number(worker?.night || 0);

  return day + night;
};

const getLatestWorkerInfo = (
  current,
  worker,
  workDate,
) => {
  if (
    !current.latestWorkDate ||
    workDate >=
      current.latestWorkDate
  ) {
    current.latestWorkDate =
      workDate;

    current.job =
      String(
        worker?.job || '',
      ).trim();

    current.process =
      String(
        worker?.process ||
          worker?.job ||
          '',
      ).trim();
  }
};

const getStatusMeta = (
  status,
) =>
  STATUS_META[status] ||
  STATUS_META.required;

export default function LaborContractManagement({
  projectName = '',
  userProfile = null,
}) {
  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    loadingReports,
    setLoadingReports,
  ] = useState(false);

  const [
    loadingStoredRows,
    setLoadingStoredRows,
  ] = useState(false);

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    reports,
    setReports,
  ] = useState([]);

  const [
    storedRows,
    setStoredRows,
  ] = useState([]);

  const [
    accessInfo,
    setAccessInfo,
  ] = useState(null);

  const [
    accessChecked,
    setAccessChecked,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    workerTypeFilter,
    setWorkerTypeFilter,
  ] = useState('all');

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('all');

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    workerEditOpen,
    setWorkerEditOpen,
  ] = useState(false);

  const [
    workerEditForm,
    setWorkerEditForm,
  ] = useState(null);

  const [
    actionDialog,
    setActionDialog,
  ] = useState(null);

  const [
    actionReason,
    setActionReason,
  ] = useState('');

  const [
    actionFileName,
    setActionFileName,
  ] = useState('');

  const [
    actionSaving,
    setActionSaving,
  ] = useState(false);

  const [
    eventDialogOpen,
    setEventDialogOpen,
  ] = useState(false);

  const [
    eventTarget,
    setEventTarget,
  ] = useState(null);

  const [
    eventRows,
    setEventRows,
  ] = useState([]);

  const [
    eventLoading,
    setEventLoading,
  ] = useState(false);

  const canManage =
    Boolean(
      accessInfo?.can_manage,
    );

  const loadAccess =
    useCallback(
      async () => {
        setAccessChecked(false);

        if (!projectName) {
          setAccessInfo(null);
          setAccessChecked(true);
          return;
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          'labor_get_my_access',
          {
            p_project_name:
              projectName,
          },
        );

        if (error) {
          console.error(
            '노임관리 접근권한 조회 오류:',
            error,
          );

          setAccessInfo(null);
          setErrorMessage(
            error.message ||
              '노임관리 접근권한을 확인하지 못했습니다.',
          );
        } else {
          setAccessInfo(
            data?.[0] || null,
          );
        }

        setAccessChecked(true);
      },
      [projectName],
    );

  const loadStoredRows =
    useCallback(
      async () => {
        if (
          !projectName ||
          !accessInfo
        ) {
          setStoredRows([]);
          return;
        }

        setLoadingStoredRows(true);

        const {
          data,
          error,
        } = await supabase.rpc(
          'labor_get_contract_month',
          {
            p_project_name:
              projectName,
            p_contract_month:
              selectedMonth,
          },
        );

        if (error) {
          console.error(
            '근로계약 월별 상태 조회 오류:',
            error,
          );

          setStoredRows([]);
          setErrorMessage(
            error.message ||
              '저장된 근로계약 상태를 불러오지 못했습니다.',
          );
        } else {
          setStoredRows(
            data || [],
          );
        }

        setLoadingStoredRows(false);
      },
      [
        accessInfo,
        projectName,
        selectedMonth,
      ],
    );

  useEffect(() => {
    loadAccess();
  }, [
    loadAccess,
    refreshKey,
  ]);

  useEffect(() => {
    let active = true;

    const fetchReports =
      async () => {
        if (!projectName) {
          if (active) {
            setReports([]);
          }

          return;
        }

        setLoadingReports(true);
        setErrorMessage('');

        try {
          const allRows = [];
          let from = 0;

          while (true) {
            const to =
              from +
              PAGE_SIZE -
              1;

            const {
              data,
              error,
            } = await supabase
              .from('daily_reports')
              .select(
                'date, workers, project_name',
              )
              .eq(
                'project_name',
                projectName,
              )
              .order(
                'date',
                {
                  ascending: true,
                },
              )
              .range(
                from,
                to,
              );

            if (error) {
              throw error;
            }

            const pageRows =
              data || [];

            allRows.push(
              ...pageRows,
            );

            if (
              pageRows.length <
              PAGE_SIZE
            ) {
              break;
            }

            from += PAGE_SIZE;
          }

          if (active) {
            setReports(
              allRows,
            );
          }
        } catch (error) {
          console.error(
            '근로계약 대상자 조회 오류:',
            error,
          );

          if (active) {
            setReports([]);

            setErrorMessage(
              error?.message ||
                '출력일보 근로자 정보를 불러오지 못했습니다.',
            );
          }
        } finally {
          if (active) {
            setLoadingReports(false);
          }
        }
      };

    fetchReports();

    return () => {
      active = false;
    };
  }, [
    projectName,
    refreshKey,
  ]);

  useEffect(() => {
    loadStoredRows();
  }, [
    loadStoredRows,
    refreshKey,
  ]);

  const analyzedWorkers =
    useMemo(() => {
      const workerMap =
        new Map();

      const monthStart =
        `${selectedMonth}-01`;

      const nextMonthDate =
        new Date(
          Number(
            selectedMonth.slice(
              0,
              4,
            ),
          ),
          Number(
            selectedMonth.slice(
              5,
              7,
            ),
          ),
          1,
        );

      const nextMonth =
        [
          nextMonthDate.getFullYear(),
          String(
            nextMonthDate.getMonth() +
              1,
          ).padStart(2, '0'),
        ].join('-');

      const monthEndExclusive =
        `${nextMonth}-01`;

      reports.forEach(
        (report) => {
          const workDate =
            parseReportDate(
              report.date,
            );

          if (!workDate) {
            return;
          }

          const workers =
            Array.isArray(
              report.workers,
            )
              ? report.workers
              : [];

          workers.forEach(
            (worker) => {
              const displayName =
                String(
                  worker?.name || '',
                ).trim();

              const normalizedName =
                normalizeName(
                  displayName,
                );

              if (
                !displayName ||
                !normalizedName
              ) {
                return;
              }

              if (
                !workerMap.has(
                  normalizedName,
                )
              ) {
                workerMap.set(
                  normalizedName,
                  {
                    key:
                      normalizedName,
                    displayName,
                    normalizedName,
                    job: '',
                    process: '',
                    firstWorkDate:
                      workDate,
                    latestWorkDate:
                      workDate,
                    hasWorkBeforeMonth:
                      false,
                    currentMonthDates:
                      [],
                    currentMonthAmount:
                      0,
                  },
                );
              }

              const target =
                workerMap.get(
                  normalizedName,
                );

              if (
                workDate <
                target.firstWorkDate
              ) {
                target.firstWorkDate =
                  workDate;
              }

              getLatestWorkerInfo(
                target,
                worker,
                workDate,
              );

              if (
                workDate <
                monthStart
              ) {
                target.hasWorkBeforeMonth =
                  true;
              }

              if (
                workDate >=
                  monthStart &&
                workDate <
                  monthEndExclusive
              ) {
                target.currentMonthDates.push(
                  workDate,
                );

                target.currentMonthAmount +=
                  getWorkerWorkAmount(
                    worker,
                  );
              }
            },
          );
        },
      );

      return Array.from(
        workerMap.values(),
      )
        .filter(
          (worker) =>
            worker.currentMonthDates
              .length > 0,
        )
        .map(
          (worker) => {
            const requirementType =
              worker.hasWorkBeforeMonth
                ? 'continuous'
                : 'new';

            return {
              ...worker,
              requirementType,
              requirementLabel:
                requirementType ===
                'continuous'
                  ? '연속근무자'
                  : '신규근로자',
              contractMonth:
                selectedMonth,
              currentMonthFirstDate:
                worker.currentMonthDates
                  .slice()
                  .sort()[0],
            };
          },
        )
        .sort(
          (first, second) =>
            first.requirementType.localeCompare(
              second.requirementType,
            ) ||
            first.currentMonthFirstDate.localeCompare(
              second.currentMonthFirstDate,
            ) ||
            first.displayName.localeCompare(
              second.displayName,
              'ko',
              {
                numeric: true,
              },
            ),
        );
    }, [
      reports,
      selectedMonth,
    ]);

  const handleSync =
    async () => {
      if (!accessInfo) {
        setErrorMessage(
          '노임관리 접근권한을 먼저 등록해주세요.',
        );
        return;
      }

      if (
        analyzedWorkers.length ===
        0
      ) {
        setErrorMessage(
          '선택한 월에 반영할 출력일보 근로자가 없습니다.',
        );
        return;
      }

      setSyncing(true);
      setErrorMessage('');
      setSuccessMessage('');

      const payload =
        analyzedWorkers.map(
          (worker) => ({
            name:
              worker.displayName,
            normalized_name:
              worker.normalizedName,
            job:
              worker.job || '',
            process:
              worker.process || '',
            first_work_date:
              worker.firstWorkDate,
            latest_work_date:
              worker.latestWorkDate,
            current_month_first_work_date:
              worker.currentMonthFirstDate,
            requirement_type:
              worker.requirementType,
          }),
        );

      const {
        data,
        error,
      } = await supabase.rpc(
        'labor_sync_contract_month',
        {
          p_project_name:
            projectName,
          p_contract_month:
            selectedMonth,
          p_workers: payload,
        },
      );

      if (error) {
        console.error(
          '근로계약 작성대상 반영 오류:',
          error,
        );

        setErrorMessage(
          error.message ||
            '작성 대상자를 반영하지 못했습니다.',
        );
      } else {
        const result =
          data || {};

        setSuccessMessage(
          [
            `${formatMonthLabel(
              selectedMonth,
            )} 작성대상 반영 완료`,
            `신규 근로자 ${
              result.inserted_workers ||
              0
            }명`,
            `신규 월별대상 ${
              result.inserted_requirements ||
              0
            }명`,
            `기존 대상 ${
              result.existing_requirements ||
              0
            }명`,
          ].join(' · '),
        );

        await loadStoredRows();
      }

      setSyncing(false);
    };

  const handleSaveWorker =
    async () => {
      if (!workerEditForm) {
        return;
      }

      setActionSaving(true);
      setErrorMessage('');

      const {
        error,
      } = await supabase.rpc(
        'labor_update_worker_profile',
        {
          p_project_name:
            projectName,
          p_worker_id:
            workerEditForm.worker_id,
          p_phone:
            workerEditForm.phone,
          p_job:
            workerEditForm.job,
          p_process:
            workerEditForm.process,
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '근로자 정보를 수정하지 못했습니다.',
        );
      } else {
        setSuccessMessage(
          `${workerEditForm.name} 근로자 정보를 수정했습니다.`,
        );

        setWorkerEditOpen(false);
        setWorkerEditForm(null);

        await loadStoredRows();
      }

      setActionSaving(false);
    };

  const openStatusAction = (
    row,
    nextStatus,
    title,
  ) => {
    setActionDialog({
      row,
      nextStatus,
      title,
    });

    setActionReason('');
    setActionFileName('');
  };

  const handleStatusAction =
    async () => {
      if (!actionDialog) {
        return;
      }

      setActionSaving(true);
      setErrorMessage('');

      const {
        error,
      } = await supabase.rpc(
        'labor_update_contract_status',
        {
          p_project_name:
            projectName,
          p_requirement_id:
            actionDialog.row
              .requirement_id,
          p_next_status:
            actionDialog.nextStatus,
          p_reason:
            actionReason,
          p_scan_file_name:
            actionFileName,
          p_scan_file_hash: '',
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '계약서 상태를 변경하지 못했습니다.',
        );
      } else {
        setSuccessMessage(
          `${actionDialog.row.name} · ${
            getStatusMeta(
              actionDialog.nextStatus,
            ).label
          } 처리했습니다.`,
        );

        setActionDialog(null);
        setActionReason('');
        setActionFileName('');

        await loadStoredRows();
      }

      setActionSaving(false);
    };

  const handleOpenEvents =
    async (row) => {
      setEventTarget(row);
      setEventRows([]);
      setEventDialogOpen(true);
      setEventLoading(true);

      const {
        data,
        error,
      } = await supabase.rpc(
        'labor_get_contract_events',
        {
          p_project_name:
            projectName,
          p_requirement_id:
            row.requirement_id,
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '처리 이력을 불러오지 못했습니다.',
        );
      } else {
        setEventRows(
          data || [],
        );
      }

      setEventLoading(false);
    };

  const filteredRows =
    useMemo(() => {
      const keyword =
        String(
          searchText || '',
        )
          .trim()
          .toLowerCase();

      return storedRows.filter(
        (row) => {
          if (
            workerTypeFilter !==
              'all' &&
            row.requirement_type !==
              workerTypeFilter
          ) {
            return false;
          }

          if (
            statusFilter !==
              'all' &&
            row.status !==
              statusFilter
          ) {
            return false;
          }

          if (!keyword) {
            return true;
          }

          return [
            row.worker_code,
            row.name,
            row.phone,
            row.job,
            row.process,
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword);
        },
      );
    }, [
      searchText,
      statusFilter,
      storedRows,
      workerTypeFilter,
    ]);

  const summary =
    useMemo(
      () =>
        storedRows.reduce(
          (
            result,
            row,
          ) => {
            result.total += 1;

            if (
              row.requirement_type ===
              'new'
            ) {
              result.newCount += 1;
            } else {
              result.continuous += 1;
            }

            if (
              row.status ===
                'required' ||
              row.status ===
                'rejected'
            ) {
              result.warning += 1;
            }

            if (
              row.status ===
              'manager_confirmed'
            ) {
              result.completed += 1;
            }

            return result;
          },
          {
            total: 0,
            newCount: 0,
            continuous: 0,
            warning: 0,
            completed: 0,
          },
        ),
      [storedRows],
    );

  const summaryCards = [
    {
      title: '저장된 작성 대상',
      value:
        `${summary.total.toLocaleString()}명`,
      icon:
        <GroupsRoundedIcon />,
      color: '#1d4ed8',
      background: '#eff6ff',
    },
    {
      title: '신규 근로자',
      value:
        `${summary.newCount.toLocaleString()}명`,
      icon:
        <PersonAddAlt1RoundedIcon />,
      color: '#047857',
      background: '#ecfdf5',
    },
    {
      title: '연속 근무자',
      value:
        `${summary.continuous.toLocaleString()}명`,
      icon:
        <AssignmentLateRoundedIcon />,
      color: '#7c3aed',
      background: '#f5f3ff',
    },
    {
      title: '미작성·반려 경고',
      value:
        `${summary.warning.toLocaleString()}명`,
      icon:
        <WarningAmberRoundedIcon />,
      color: '#dc2626',
      background: '#fef2f2',
    },
  ];

  const loading =
    loadingReports ||
    loadingStoredRows;

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.4,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          justifyContent="space-between"
          alignItems={{
            xs: 'stretch',
            md: 'center',
          }}
          spacing={1}
        >
          <Box>
            <Stack
              direction="row"
              spacing={0.7}
              alignItems="center"
              flexWrap="wrap"
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 900,
                  color: '#0f172a',
                }}
              >
                근로계약서작성
              </Typography>

              {accessInfo && (
                <Chip
                  size="small"
                  color={
                    canManage
                      ? 'secondary'
                      : 'default'
                  }
                  label={
                    ACCESS_ROLE_LABELS[
                      accessInfo
                        .access_role
                    ] ||
                    accessInfo
                      .access_role
                  }
                />
              )}
            </Stack>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.78rem',
              }}
            >
              출력일보 분석 결과를 근로자 고유번호와 월별 계약상태로 저장합니다.
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={0.7}
            alignItems="center"
            flexWrap="wrap"
          >
            <TextField
              type="month"
              size="small"
              label="계약 대상 월"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(
                  event.target.value,
                )
              }
              InputLabelProps={{
                shrink: true,
              }}
              sx={{
                width: 155,
              }}
            />

            <Button
              variant="contained"
              startIcon={
                syncing
                  ? (
                    <CircularProgress
                      size={16}
                      color="inherit"
                    />
                  )
                  : (
                    <SyncRoundedIcon />
                  )
              }
              onClick={
                handleSync
              }
              disabled={
                syncing ||
                !accessInfo ||
                analyzedWorkers.length ===
                  0
              }
            >
              작성 대상 반영
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <RefreshIcon />
              }
              onClick={() =>
                setRefreshKey(
                  (previous) =>
                    previous + 1,
                )
              }
              disabled={loading}
            >
              새로고침
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {!accessChecked && (
        <Alert
          severity="info"
          icon={
            <CircularProgress
              size={18}
            />
          }
        >
          노임관리 현장 접근권한을 확인하고 있습니다.
        </Alert>
      )}

      {accessChecked &&
        !accessInfo && (
        <Alert severity="error">
          <Typography
            sx={{
              fontWeight: 900,
            }}
          >
            현재 계정에는 이 현장의 노임관리 접근권한이 없습니다.
          </Typography>

          <Typography
            sx={{
              mt: 0.4,
              fontSize: '0.76rem',
            }}
          >
            SQL 적용 후 labor_project_access에 현재 로그인 이메일과 현장명을 등록해야 합니다. 권한은 현장 담당자(site_manager), 노임 관리자(labor_manager), 최고관리자(admin)로 구분됩니다.
          </Typography>
        </Alert>
      )}

      {successMessage && (
        <Alert
          severity="success"
          onClose={() =>
            setSuccessMessage('')
          }
        >
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert
          severity="error"
          onClose={() =>
            setErrorMessage('')
          }
        >
          {errorMessage}
        </Alert>
      )}

      {accessInfo &&
        analyzedWorkers.length >
          storedRows.length && (
          <Alert
            severity="warning"
            icon={
              <WarningAmberRoundedIcon />
            }
          >
            출력일보 분석 인원은 {analyzedWorkers.length.toLocaleString()}명이고, DB에 저장된 작성 대상은 {storedRows.length.toLocaleString()}명입니다. 상단의 ‘작성 대상 반영’을 눌러 신규 인원을 저장해주세요.
          </Alert>
        )}

      {accessInfo &&
        summary.warning > 0 && (
          <Alert
            severity="warning"
            sx={{
              py: 0.35,
              fontWeight: 800,
            }}
          >
            {formatMonthLabel(
              selectedMonth,
            )} 미작성 또는 반려 대상자가 {summary.warning.toLocaleString()}명 있습니다.
          </Alert>
        )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs:
              'repeat(2, minmax(0, 1fr))',
            lg:
              'repeat(4, minmax(0, 1fr))',
          },
          gap: 0.8,
        }}
      >
        {summaryCards.map(
          (card) => (
            <Paper
              key={card.title}
              variant="outlined"
              sx={{
                p: 1.1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.9,
                borderColor: '#dbe4ee',
                bgcolor: card.background,
              }}
            >
              <Box
                sx={{
                  width: 35,
                  height: 35,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: card.color,
                  bgcolor: '#ffffff',
                  '& svg': {
                    fontSize: 21,
                  },
                }}
              >
                {card.icon}
              </Box>

              <Box>
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                  }}
                >
                  {card.title}
                </Typography>

                <Typography
                  sx={{
                    color: card.color,
                    fontSize: '1rem',
                    lineHeight: 1.2,
                    fontWeight: 900,
                  }}
                >
                  {card.value}
                </Typography>
              </Box>
            </Paper>
          ),
        )}
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 0.9,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            lg: 'row',
          }}
          spacing={0.8}
          alignItems={{
            xs: 'stretch',
            lg: 'center',
          }}
        >
          <TextField
            size="small"
            label="성명·연락처·직종·공정 검색"
            value={searchText}
            onChange={(event) =>
              setSearchText(
                event.target.value,
              )
            }
            sx={{
              width: {
                xs: '100%',
                lg: 280,
              },
            }}
          />

          <FormControl
            size="small"
            sx={{
              minWidth: 155,
            }}
          >
            <InputLabel>
              작성 대상 구분
            </InputLabel>

            <Select
              label="작성 대상 구분"
              value={workerTypeFilter}
              onChange={(event) =>
                setWorkerTypeFilter(
                  event.target.value,
                )
              }
            >
              <MenuItem value="all">
                전체
              </MenuItem>

              <MenuItem value="new">
                신규 근로자
              </MenuItem>

              <MenuItem value="continuous">
                연속 근무자
              </MenuItem>
            </Select>
          </FormControl>

          <FormControl
            size="small"
            sx={{
              minWidth: 145,
            }}
          >
            <InputLabel>
              작성 상태
            </InputLabel>

            <Select
              label="작성 상태"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value,
                )
              }
            >
              <MenuItem value="all">
                전체
              </MenuItem>

              {Object.entries(
                STATUS_META,
              ).map(
                ([
                  value,
                  meta,
                ]) => (
                  <MenuItem
                    key={value}
                    value={value}
                  >
                    {meta.label}
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>

          <Typography
            sx={{
              ml: {
                lg: 'auto',
              },
              color: '#64748b',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            출력일보 분석 {analyzedWorkers.length.toLocaleString()}명 · 저장된 대상 {storedRows.length.toLocaleString()}명 · 조회 결과 {filteredRows.length.toLocaleString()}명
          </Typography>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          borderColor: '#cbd5e1',
        }}
      >
        {loading ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={22} />

            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.8rem',
              }}
            >
              출력일보와 저장된 계약상태를 불러오고 있습니다.
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              height: '100%',
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                '& th, & td': {
                  borderRight:
                    '1px solid #e2e8f0',
                  fontSize: '0.68rem',
                  whiteSpace: 'nowrap',
                },
                '& th': {
                  bgcolor: '#f8fafc',
                  fontWeight: 900,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  {[
                    '작성여부',
                    '근로자번호',
                    '성명',
                    '연락처',
                    '직종',
                    '공정',
                    '최초근무일',
                    '계약대상월',
                    '작성사유',
                    'PDF 생성일',
                    '서명본 확인일',
                    '관리자 확인일',
                    '처리',
                  ].map(
                    (header) => (
                      <TableCell
                        key={header}
                      >
                        {header}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredRows.map(
                  (row) => {
                    const statusMeta =
                      getStatusMeta(
                        row.status,
                      );

                    return (
                      <TableRow
                        key={
                          row.requirement_id
                        }
                        hover
                        sx={{
                          bgcolor:
                            row.status ===
                            'rejected'
                              ? '#fff1f2'
                              : row.status ===
                                'required'
                                ? '#fff7ed'
                                : row.status ===
                                  'manager_confirmed'
                                  ? '#f0fdf4'
                                  : 'inherit',
                        }}
                      >
                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              statusMeta.color
                            }
                            variant={
                              row.status ===
                              'required'
                                ? 'outlined'
                                : 'filled'
                            }
                            label={
                              statusMeta.label
                            }
                            sx={{
                              fontWeight: 900,
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            fontFamily:
                              'monospace',
                            fontWeight: 800,
                          }}
                        >
                          {row.worker_code}
                        </TableCell>

                        <TableCell
                          sx={{
                            fontWeight: 900,
                          }}
                        >
                          {row.name}
                        </TableCell>

                        <TableCell>
                          {maskPhone(
                            row.phone,
                          )}
                        </TableCell>

                        <TableCell>
                          {row.job || '-'}
                        </TableCell>

                        <TableCell>
                          {row.process ||
                            '-'}
                        </TableCell>

                        <TableCell>
                          {formatShortDate(
                            row.first_work_date,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatMonthLabel(
                            String(
                              row.contract_month,
                            ).slice(0, 7),
                          )}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              row.requirement_type ===
                              'continuous'
                                ? 'secondary'
                                : 'warning'
                            }
                            label={
                              row.requirement_type ===
                              'continuous'
                                ? '연속근무자'
                                : '신규근로자'
                            }
                          />
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.pdf_generated_at,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.scan_verified_at,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.manager_confirmed_at,
                          )}
                        </TableCell>

                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={0.25}
                            alignItems="center"
                          >
                            <Tooltip title="근로자 정보 수정">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setWorkerEditForm({
                                    ...row,
                                  });

                                  setWorkerEditOpen(
                                    true,
                                  );
                                }}
                              >
                                <EditOutlinedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>

                            {(row.status ===
                              'required' ||
                              row.status ===
                                'rejected' ||
                              row.status ===
                                'pdf_generated') && (
                              <Tooltip title="PDF 생성 기록">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() =>
                                    openStatusAction(
                                      row,
                                      'pdf_generated',
                                      'PDF 생성 기록',
                                    )
                                  }
                                >
                                  <PictureAsPdfOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {(row.status ===
                              'pdf_generated' ||
                              row.status ===
                                'rejected' ||
                              row.status ===
                                'scan_verified') && (
                              <Tooltip title="서명본 업로드 확인">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() =>
                                    openStatusAction(
                                      row,
                                      'scan_verified',
                                      '서명본 업로드 확인',
                                    )
                                  }
                                >
                                  <UploadFileOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {canManage &&
                              row.status ===
                                'scan_verified' && (
                                <>
                                  <Tooltip title="관리자 확인">
                                    <IconButton
                                      size="small"
                                      color="success"
                                      onClick={() =>
                                        openStatusAction(
                                          row,
                                          'manager_confirmed',
                                          '관리자 확인',
                                        )
                                      }
                                    >
                                      <TaskAltRoundedIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>

                                  <Tooltip title="반려">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() =>
                                        openStatusAction(
                                          row,
                                          'rejected',
                                          '계약서 반려',
                                        )
                                      }
                                    >
                                      <ReplayRoundedIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}

                            {![
                              'manager_confirmed',
                              'excluded',
                            ].includes(
                              row.status,
                            ) && (
                              <Tooltip title="이번 달 대상 제외">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    openStatusAction(
                                      row,
                                      'excluded',
                                      '작성 대상 제외',
                                    )
                                  }
                                >
                                  <BlockOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title="처리 이력">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  handleOpenEvents(
                                    row,
                                  )
                                }
                              >
                                <HistoryRoundedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  },
                )}

                {filteredRows.length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      align="center"
                      sx={{
                        py: 6,
                        color: '#94a3b8',
                      }}
                    >
                      {accessInfo
                        ? '저장된 작성 대상이 없습니다. 출력일보 분석 후 ‘작성 대상 반영’을 눌러주세요.'
                        : '노임관리 접근권한을 등록해주세요.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Typography
        sx={{
          color: '#94a3b8',
          fontSize: '0.62rem',
          textAlign: 'right',
        }}
      >
        접속자: {userProfile?.manager_name || '-'} · 현장: {projectName || '-'}
      </Typography>

      <Dialog
        open={workerEditOpen}
        onClose={() => {
          if (!actionSaving) {
            setWorkerEditOpen(false);
            setWorkerEditForm(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          근로자 기본정보 수정
        </DialogTitle>

        <DialogContent dividers>
          {workerEditForm && (
            <Stack spacing={1.2}>
              <Alert severity="info">
                주민등록번호·상세주소·계약서 원문은 이 화면에 저장하지 않습니다.
              </Alert>

              <TextField
                label="근로자번호"
                value={
                  workerEditForm.worker_code ||
                  ''
                }
                disabled
              />

              <TextField
                label="성명"
                value={
                  workerEditForm.name ||
                  ''
                }
                disabled
              />

              <TextField
                label="연락처"
                value={
                  workerEditForm.phone ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      phone:
                        event.target.value,
                    }),
                  )
                }
                placeholder="010-0000-0000"
              />

              <TextField
                label="직종"
                value={
                  workerEditForm.job ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      job:
                        event.target.value,
                    }),
                  )
                }
              />

              <TextField
                label="공정"
                value={
                  workerEditForm.process ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      process:
                        event.target.value,
                    }),
                  )
                }
              />
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setWorkerEditOpen(false);
              setWorkerEditForm(null);
            }}
            disabled={actionSaving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={handleSaveWorker}
            disabled={actionSaving}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(actionDialog)}
        onClose={() => {
          if (!actionSaving) {
            setActionDialog(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          {actionDialog?.title ||
            '상태 변경'}
        </DialogTitle>

        <DialogContent dividers>
          {actionDialog && (
            <Stack spacing={1.2}>
              <Alert severity="info">
                {actionDialog.row.name} · {formatMonthLabel(selectedMonth)}
              </Alert>

              {actionDialog.nextStatus ===
                'pdf_generated' && (
                <Typography>
                  실제 PDF를 출력한 후 이 기록을 남겨주세요. PDF 파일 자체는 서버에 저장하지 않습니다.
                </Typography>
              )}

              {actionDialog.nextStatus ===
                'scan_verified' && (
                <>
                  <Typography>
                    서명받은 스캔 사본을 노임관리자에게 전달하고, 업로드 파일명만 기록합니다. 파일 원본은 현재 단계에서 서버에 저장하지 않습니다.
                  </Typography>

                  <TextField
                    label="스캔 파일명"
                    value={actionFileName}
                    onChange={(event) =>
                      setActionFileName(
                        event.target.value,
                      )
                    }
                    placeholder="예: 홍길동_2026-07_근로계약서.pdf"
                  />
                </>
              )}

              {[
                'rejected',
                'excluded',
              ].includes(
                actionDialog.nextStatus,
              ) && (
                <TextField
                  label={
                    actionDialog.nextStatus ===
                    'rejected'
                      ? '반려 사유'
                      : '제외 사유'
                  }
                  value={actionReason}
                  onChange={(event) =>
                    setActionReason(
                      event.target.value,
                    )
                  }
                  multiline
                  minRows={3}
                  required
                />
              )}

              {actionDialog.nextStatus ===
                'manager_confirmed' && (
                <Alert severity="warning">
                  관리자 확인을 완료하면 작성완료로 표시되고 기본 미작성 경고에서 제외됩니다.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setActionDialog(null)
            }
            disabled={actionSaving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            color={
              actionDialog?.nextStatus ===
                'rejected'
                ? 'error'
                : 'primary'
            }
            onClick={
              handleStatusAction
            }
            disabled={
              actionSaving ||
              (
                [
                  'rejected',
                  'excluded',
                ].includes(
                  actionDialog?.nextStatus,
                ) &&
                !actionReason.trim()
              )
            }
          >
            확인
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={eventDialogOpen}
        onClose={() =>
          setEventDialogOpen(false)
        }
        fullWidth
        maxWidth="md"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          {eventTarget
            ? `${eventTarget.name} 처리 이력`
            : '처리 이력'}
        </DialogTitle>

        <DialogContent dividers>
          {eventLoading ? (
            <Box
              sx={{
                py: 5,
                textAlign: 'center',
              }}
            >
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table
              size="small"
              sx={{
                '& th': {
                  fontWeight: 900,
                  bgcolor: '#f8fafc',
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    처리일시
                  </TableCell>

                  <TableCell>
                    이전상태
                  </TableCell>

                  <TableCell>
                    변경상태
                  </TableCell>

                  <TableCell>
                    사유
                  </TableCell>

                  <TableCell>
                    처리자
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {eventRows.map(
                  (event) => (
                    <TableRow
                      key={event.id}
                    >
                      <TableCell>
                        {formatDateTime(
                          event.performed_at,
                        )}
                      </TableCell>

                      <TableCell>
                        {event.previous_status
                          ? getStatusMeta(
                              event.previous_status,
                            ).label
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {event.next_status
                          ? getStatusMeta(
                              event.next_status,
                            ).label
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {event.reason ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        {event.performed_by_email ||
                          '-'}
                      </TableCell>
                    </TableRow>
                  ),
                )}

                {eventRows.length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{
                        py: 4,
                        color: '#94a3b8',
                      }}
                    >
                      처리 이력이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setEventDialogOpen(false)
            }
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
