import React, { useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Drawer,
  IconButton,
  InputBase,
  Modal,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import ExcelJS from 'exceljs';
import { supabase } from './supabaseClient';
import {
  getFloorCellKeys,
  getProjectCellKeys,
} from './utils/buildingUnits.js';
import Sidebar from './components/Sidebar.jsx';
import MainDashboard from './page/MainDashboard.jsx';
import DailyReport from './page/DailyReport.jsx';
import MonthlyWorkerStatus from './page/MonthlyWorkerStatus.jsx';
import CumulativeWorkerStatus from './page/CumulativeWorkerStatus.jsx';
import ProgressInput from './page/ProgressInput.jsx';
import MultiProcessProgress from './page/MultiProcessProgress.jsx';
import CompletionSummary from './page/CompletionSummary.jsx';
import DailyCompletionSummary from './page/DailyCompletionSummary.jsx';
import WeeklyReport from './page/WeeklyReport.jsx';
import ProposalReport from './page/ProposalReport.jsx';
import ApprovalInbox from './page/ApprovalInbox.jsx';
import WeeklyOverview from './page/WeeklyOverview.jsx';
import WeeklyOverviewArchive from './page/WeeklyOverviewArchive.jsx';
import MaterialOrderUpload from './page/MaterialOrderUpload.jsx';
import MaterialInputStatus from './page/MaterialInputStatus.jsx';
import AdminDashboard from './page/AdminDashboard.jsx';

const drawerWidth = 240;
const SUPABASE_PAGE_SIZE = 1000;
const PROGRESS_WRITE_CHUNK_SIZE = 500;
const ALL_PROJECTS_OPTION = '전체현장';

const PROJECT_DISPLAY_ORDER = [
  '한라건설 용인금어지구',
  '현대건설 용인마크밸리',
  '대우건설 용인현장',
];

const PROJECT_FREE_VIEWS = [
  'admin-dashboard',
  'approval-inbox',
  'weekly-overview',
  'weekly-overview-archive',
  'daily-cumulative-workers',
];

const MANAGEMENT_ONLY_VIEWS = [
  'admin-dashboard',
  'weekly-overview',
  'weekly-overview-archive',
];

const sortProjectNames = (projectNames) =>
  [...projectNames].sort((first, second) => {
    const firstIndex =
      PROJECT_DISPLAY_ORDER.indexOf(first);
    const secondIndex =
      PROJECT_DISPLAY_ORDER.indexOf(second);

    if (firstIndex !== -1 || secondIndex !== -1) {
      if (firstIndex === -1) return 1;
      if (secondIndex === -1) return -1;
      return firstIndex - secondIndex;
    }

    return String(first).localeCompare(
      String(second),
      'ko',
    );
  });

const splitIntoChunks = (items, chunkSize) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const fetchAllProgressRows = async ({
  projectName,
  processType,
}) => {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('unit_progress')
      .select('building, unit, status, completion_date')
      .eq('project_name', projectName)
      .eq('process_type', processType)
      .neq('status', '작업전')
      .order('building', { ascending: true })
      .order('unit', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return allRows;
};

const fetchAllDailyReportRows = async (projectName) => {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_name', projectName)
      .order('date', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return allRows;
};

const getKoreaDateTimeParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const values = {};

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  });

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const createKoreaCalendarDate = (date = new Date()) => {
  const parts = getKoreaDateTimeParts(date);

  /*
    Date 객체는 화면 달력 계산용으로만 사용합니다.
    연/월/일 값은 반드시 한국시간에서 추출합니다.
  */
  return new Date(parts.year, parts.month - 1, parts.day);
};

const formatYYMMDD = (date) => {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
};

const formatYYYYMMDD = (dateStr) => {
  if (!dateStr) return '';
  return `20${dateStr.replace(/\./g, '-')}`;
};

const jobOptions = ['소장', '관리자', '직영', '먹매김', '단열', '합지', '경량벽체', '세대천정', '공용홀천정', '몰딩', '걸레받이', '수장', '외주', '기타', '용역'];

const processOptions = ['바닥먹', '허리먹', '단열', '합지', '경량골조', '경량석고', '세대천정', '1차몰딩', '2차몰딩', '1차 걸레받이', '2차 걸레받이'];

const MARK_VALLEY_EXTRA_PROCESS = '조적단열';

const getProjectProcessOptions = (
  projectName,
) => {
  const normalizedProjectName =
    String(projectName || '')
      .replace(/\s+/g, '');

  const isMarkValley =
    normalizedProjectName.includes(
      '마크밸리',
    );

  if (!isMarkValley) {
    return processOptions;
  }

  const insulationIndex =
    processOptions.indexOf('단열');

  if (insulationIndex === -1) {
    return [
      ...processOptions,
      MARK_VALLEY_EXTRA_PROCESS,
    ];
  }

  return [
    ...processOptions.slice(
      0,
      insulationIndex + 1,
    ),
    MARK_VALLEY_EXTRA_PROCESS,
    ...processOptions.slice(
      insulationIndex + 1,
    ),
  ];
};

const modalStyle = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '95vw', maxWidth: '1600px', height: '82vh',
  bgcolor: 'background.paper', boxShadow: 24, borderRadius: '8px',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerCellStyle = { borderRight: '1px solid #cbd5e1', fontWeight: 'bold', color: '#334155', py: 1 };
const bodyCellStyle = { borderRight: '1px solid #cbd5e1', p: 0 }; 

const viewTitles = {
  main: 'Main',
  'admin-dashboard': '욱림건설 전체 현장 Dashboard',
  daily: '출력일보작성',
  'daily-monthly-workers': '금월 투입현황',
  'daily-cumulative-workers': '누계투입조회',
  'progress-input': '공종별 현황 입력',
  'progress-multi': '다중 공종 진척 현황',
  'progress-daily': '일별 완료 집계',
  'progress-weekly': '주별 완료 집계',
  'progress-monthly': '월별 완료 집계',
  'material-order': '자재발주작성',
  'material-input-status': '자재투입현황',
  'report-weekly': '주간 업무 보고',
  'report-approval': '품의 보고',
  'report-outsourcing-approval': '외주 품의 보고',
  'report-accident': '사고 경위 보고',
  'approval-inbox': '결재함',
  'weekly-overview': '주간업무작성',
  'weekly-overview-archive': '주간업무보관',
};

function ReportPlaceholder({ title }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: 'none',
      }}
    >
      <Typography variant="h6" fontWeight={800} color="#334155">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        메뉴 연결 완료 / 테스트 후 적용 예정
      </Typography>
    </Paper>
  );
}

const normalizeUserRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()[\]{}<>]/g, '');

  if (
    normalized.includes('최고관리자') ||
    normalized.includes('superadmin') ||
    normalized.includes('masteradmin')
  ) {
    return '최고관리자';
  }

  if (
    normalized === '관리자' ||
    normalized === 'admin' ||
    normalized.includes('administrator')
  ) {
    return '관리자';
  }

  return '담당자';
};

const resolveUserRole = (profile) => {
  if (
    profile?.is_super_admin === true ||
    profile?.isSuperAdmin === true
  ) {
    return '최고관리자';
  }

  const roleCandidates = [
    profile?.role,
    profile?.user_role,
    profile?.userRole,
    profile?.permission,
    profile?.authority,
    profile?.access_level,
  ];

  for (const candidate of roleCandidates) {
    const resolved = normalizeUserRole(candidate);
    if (resolved === '최고관리자') return resolved;
  }

  for (const candidate of roleCandidates) {
    const resolved = normalizeUserRole(candidate);
    if (resolved === '관리자') return resolved;
  }

  return '담당자';
};

export default function Dashboard({ user, userProfile, onLogout }) {
  const userRole = resolveUserRole(userProfile);
  const isSuperAdmin = userRole === '최고관리자';
  const isManagementRole = ['관리자', '최고관리자'].includes(userRole);

  const [selectedProjectName, setSelectedProjectName] =
    useState('');

  const [
    lastSelectedProjectName,
    setLastSelectedProjectName,
  ] = useState('');

  const [projectOptions, setProjectOptions] =
    useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] =
    useState(false);

  const activeProjectName = isManagementRole
    ? (
        selectedProjectName ===
        ALL_PROJECTS_OPTION
          ? ''
          : selectedProjectName
      )
    : userProfile?.project_name || '';

  const cumulativeProjectScope =
    isManagementRole
      ? (
          selectedProjectName ||
          ALL_PROJECTS_OPTION
        )
      : userProfile?.project_name || '';

  const activeProcessOptions =
    getProjectProcessOptions(
      activeProjectName,
    );

  const activeUserProfile = {
    ...(userProfile || {}),
    role: userRole,
    project_name: activeProjectName,
  };

  /*
    한국시간 기준 시계입니다.
    브라우저를 계속 열어둬도 자정과 23시 59분이 지나면
    오늘 표시와 자동 마감 상태가 1분 이내에 갱신됩니다.
  */
  const [koreaClock, setKoreaClock] = useState(() => new Date());
  const koreaNow = getKoreaDateTimeParts(koreaClock);
  const todayMidnight = new Date(
    koreaNow.year,
    koreaNow.month - 1,
    koreaNow.day,
  );

  const [open, setOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [buildingConfigs, setBuildingConfigs] = useState({});
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [selectedDateDisplay, setSelectedDateDisplay] = useState('');

  const [viewYear, setViewYear] = useState(
    () => getKoreaDateTimeParts().year,
  );
  const [viewMonth, setViewMonth] = useState(
    () => getKoreaDateTimeParts().month - 1,
  );
  const [selectedWeekDate, setSelectedWeekDate] = useState(
    () => createKoreaCalendarDate(),
  );

  const [currentView, setCurrentView] = useState(() => {
    const requestedView = new URLSearchParams(
      window.location.search,
    ).get('view');

    if (requestedView === 'approval-inbox') {
      return 'approval-inbox';
    }

    if (
      [
        'weekly-overview',
        'weekly-overview-archive',
      ].includes(
        requestedView,
      ) &&
      isManagementRole
    ) {
      return requestedView;
    }

    return isManagementRole
      ? 'admin-dashboard'
      : 'main';
  });

  const [savedData, setSavedData] = useState({});
  const [manualStatus, setManualStatus] = useState({});

  const [workerRows, setWorkerRows] = useState([]);
  const [taskRows, setTaskRows] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);

  const [workerFetchDate, setWorkerFetchDate] = useState('');
  const [taskFetchDate, setTaskFetchDate] = useState('');

  const [selectedProcess, setSelectedProcess] = useState(processOptions[0]);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [selectedStatusAction, setSelectedStatusAction] = useState('작업완료'); 
  const [progressDate, setProgressDate] = useState(() =>
    formatYYYYMMDD(formatYYMMDD(createKoreaCalendarDate())),
  );
  
  const [unitProgressData, setUnitProgressData] = useState({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setKoreaClock(new Date());
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isManagementRole) {
      setProjectOptions([]);
      return undefined;
    }

    let active = true;

    const loadProjectOptions = async () => {
      setProjectOptionsLoading(true);

      try {
        const allRows = [];
        let from = 0;

        while (true) {
          const { data, error } = await supabase
            .from('building_settings')
            .select('project_name')
            .not('project_name', 'is', null)
            .order('project_name', {
              ascending: true,
            })
            .range(
              from,
              from + SUPABASE_PAGE_SIZE - 1,
            );

          if (error) {
            throw error;
          }

          const rows = data || [];
          allRows.push(...rows);

          if (rows.length < SUPABASE_PAGE_SIZE) {
            break;
          }

          from += SUPABASE_PAGE_SIZE;
        }

        const names = sortProjectNames(
          Array.from(
            new Set(
              allRows
                .map((row) =>
                  String(
                    row?.project_name || '',
                  ).trim(),
                )
                .filter(Boolean),
            ),
          ),
        );

        if (active) {
          setProjectOptions(names);
        }
      } catch (error) {
        console.error(
          '관리자 현장목록 조회 오류:',
          error,
        );

        if (active) {
          setProjectOptions([]);
        }
      } finally {
        if (active) {
          setProjectOptionsLoading(false);
        }
      }
    };

    loadProjectOptions();

    const handleFocus = () => {
      loadProjectOptions();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.removeEventListener(
        'focus',
        handleFocus,
      );
    };
  }, [isManagementRole]);

  useEffect(() => {
    const requestedView = new URLSearchParams(
      window.location.search,
    ).get('view');

    if (requestedView === 'approval-inbox') {
      setCurrentView('approval-inbox');
      return;
    }

    if (
      [
        'weekly-overview',
        'weekly-overview-archive',
      ].includes(
        requestedView,
      ) &&
      isManagementRole
    ) {
      setCurrentView(
        requestedView,
      );
      return;
    }

    if (isManagementRole) {
      /*
        이미 관리 전용 전역 화면에 들어와 있다면
        프로필 갱신으로 Dashboard로 되돌리지 않습니다.
      */
      setCurrentView((previousView) =>
        MANAGEMENT_ONLY_VIEWS.includes(
          previousView,
        )
          ? previousView
          : 'admin-dashboard',
      );
      return;
    }

    setSelectedProjectName(
      userProfile?.project_name || '',
    );
    setCurrentView('main');
  }, [isManagementRole, userProfile?.project_name]);

  const handleOpenAdminProject = (projectName) => {
    setSelectedProjectName(projectName);
    setLastSelectedProjectName(projectName);
    setCurrentView('main');
  };

  const handleHistoricalUploadComplete = async (
    uploadedRows,
  ) => {
    if (
      !Array.isArray(uploadedRows) ||
      uploadedRows.length === 0
    ) {
      return;
    }

    setSavedData((previous) => {
      const next = {
        ...previous,
      };

      uploadedRows.forEach((row) => {
        next[row.date] = {
          workers:
            row.workers || [],
          tasks:
            row.tasks || [],
          todayTask:
            row.today_task || '',
          tomorrowTask:
            row.tomorrow_task || '',
        };
      });

      return next;
    });

    setManualStatus((previous) => {
      const next = {
        ...previous,
      };

      uploadedRows.forEach((row) => {
        next[row.date] =
          row.status || 'closed';
      });

      return next;
    });

    const firstDate =
      String(
        uploadedRows[0]?.date || '',
      ).split('.');

    if (
      firstDate.length === 3
    ) {
      const year =
        2000 +
        Number(firstDate[0]);
      const month =
        Number(firstDate[1]) - 1;

      if (
        Number.isInteger(year) &&
        Number.isInteger(month)
      ) {
        setViewYear(year);
        setViewMonth(month);
      }
    }
  };

  const handleSidebarViewChange = (nextView) => {
    if (
      [
        'weekly-overview',
        'weekly-overview-archive',
      ].includes(nextView)
    ) {
      if (!isManagementRole) {
        return;
      }

      /*
        주간업무총괄의 작성·보관 화면은
        현장 선택과 무관한 관리자 전역 화면입니다.
      */
      setCurrentView(nextView);
      return;
    }

    if (
      nextView === 'admin-dashboard' &&
      !isManagementRole
    ) {
      return;
    }

    if (
      nextView !==
        'daily-cumulative-workers' &&
      selectedProjectName ===
        ALL_PROJECTS_OPTION
    ) {
      setSelectedProjectName(
        lastSelectedProjectName || '',
      );
    }

    setCurrentView(nextView);
  };

  const handleSelectManagementProject = (
    event,
    projectName,
  ) => {
    const nextProjectName =
      projectName || '';

    setSelectedProjectName(
      nextProjectName,
    );

    if (
      nextProjectName &&
      nextProjectName !==
        ALL_PROJECTS_OPTION
    ) {
      setLastSelectedProjectName(
        nextProjectName,
      );
    }
  };

  // 💡 공정이 변경될 때마다 화면에 선택되어 있던 세대와 팝업창을 즉시 지워줍니다.
  useEffect(() => {
    setSelectedCells(new Set());
  }, [selectedProcess]);

  /*
    마크밸리에서 조적단열을 선택한 뒤 다른 현장으로 이동하면
    해당 현장에는 조적단열이 없으므로 첫 번째 공정으로 되돌립니다.
  */
  useEffect(() => {
    const nextProcessOptions =
      getProjectProcessOptions(
        activeProjectName,
      );

    if (
      !nextProcessOptions.includes(
        selectedProcess,
      )
    ) {
      setSelectedProcess(
        nextProcessOptions[0],
      );
    }
  }, [
    activeProjectName,
    selectedProcess,
  ]);

  useEffect(() => {
    if (!activeProjectName) {
      setBuildingConfigs({});
      setUnitProgressData({});
      setSavedData({});
      setManualStatus({});
      return;
    }

    const fetchBuildingConfigs = async () => {
        const { data, error } = await supabase.from("building_settings").select("*").eq("project_name", activeProjectName);
        if (error) return console.error(error);
        const configs = {};
        data.forEach(row => { configs[row.building_name] = row.config_json; });
        setBuildingConfigs(configs);
    };

    const fetchUnitProgress = async () => {
      // 공정이 바뀔 때 이전 공정 색상이 잠시 남지 않도록 먼저 비웁니다.
      setUnitProgressData({});

      try {
        /*
          Supabase REST 조회는 프로젝트 설정에 따라 한 번에
          최대 1,000행까지만 반환될 수 있습니다.

          1,275세대처럼 1,000건을 넘는 현장도 전부 표시되도록
          1,000건 단위로 마지막 페이지까지 반복 조회합니다.
        */
        const data = await fetchAllProgressRows({
          projectName: activeProjectName,
          processType: selectedProcess,
        });

        const mapped = {};

        data.forEach((row) => {
          mapped[`${row.building}-${row.unit}`] = {
            status: row.status,
            date: row.completion_date,
          };
        });

        setUnitProgressData(mapped);
      } catch (error) {
        console.error('공정 데이터 전체 조회 오류:', error);
      }
    };

    const fetchReports = async () => {
      try {
        const data = await fetchAllDailyReportRows(
          activeProjectName,
        );

        const newData = {};
        const newStatus = {};

        data.forEach((row) => {
          newData[row.date] = {
            workers: row.workers || [],
            tasks: row.tasks || [],
            todayTask: row.today_task || '',
            tomorrowTask: row.tomorrow_task || '',
          };

          if (row.status) {
            newStatus[row.date] = row.status;
          }
        });

        setSavedData(newData);
        setManualStatus(newStatus);
      } catch (error) {
        console.error('공사일보 전체 조회 오류:', error);
      }
    };

    fetchBuildingConfigs();
    fetchUnitProgress();
    fetchReports();

  }, [activeProjectName, selectedProcess]);

  const syncDataToDB = async (
    dateKey,
    dataOverrides = {},
    statusOverride = null,
  ) => {
    if (!activeProjectName || !user?.email) return false;

    const currentData = {
      ...(savedData[dateKey] || {}),
      ...dataOverrides,
    };
    const currentStatus =
      statusOverride !== null
        ? statusOverride
        : manualStatus[dateKey] || 'open';

    const { error } = await supabase
      .from('daily_reports')
      .upsert(
        {
          date: dateKey,
          project_name: activeProjectName,
          author_email: user.email,
          workers: currentData.workers || [],
          tasks: currentData.tasks || [],
          today_task: currentData.todayTask || '',
          tomorrow_task: currentData.tomorrowTask || '',
          status: currentStatus,
        },
        {
          onConflict: 'date, project_name',
        },
      );

    if (error) {
      throw error;
    }

    return true;
  };

  const updateDeadlineStatus = async (dateKey, newStatus) => {
    if (!activeProjectName) {
      throw new Error('선택된 현장이 없습니다.');
    }

    /*
      마감 상태는 관리자 화면의 로컬 상태에만 저장하면 안 됩니다.
      모든 사용자가 다시 로그인했을 때도 같은 상태를 읽을 수 있도록
      daily_reports에 open 또는 closed 상태가 반드시 존재해야 합니다.

      기존 일보 행:
      status만 수정하여 작성자와 기존 입력내용을 보존합니다.

      일보 행이 없는 날짜:
      빈 일보 행을 새로 생성하면서 status를 저장합니다.
      빈 행은 관리자 Dashboard에서 '일보 등록'으로 계산되지 않습니다.
    */
    const hasExistingReport =
      Object.prototype.hasOwnProperty.call(savedData, dateKey) ||
      Object.prototype.hasOwnProperty.call(manualStatus, dateKey);

    if (!hasExistingReport) {
      const inserted = await syncDataToDB(
        dateKey,
        {
          workers: [],
          tasks: [],
          todayTask: '',
          tomorrowTask: '',
        },
        newStatus,
      );

      if (!inserted) {
        throw new Error('마감 상태 행을 생성하지 못했습니다.');
      }

      return true;
    }

    const { data, error } = await supabase
      .from('daily_reports')
      .update({
        status: newStatus,
      })
      .eq('date', dateKey)
      .eq('project_name', activeProjectName)
      .select('date, status');

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(
        '마감 상태가 데이터베이스에 반영되지 않았습니다. Supabase UPDATE 권한을 확인해주세요.',
      );
    }

    return true;
  };

  const toggleDrawer = () => setOpen(!open);

  const buildWeekCards = (baseDate, db) => {
    const startOfWeek = new Date(baseDate);
    startOfWeek.setDate(baseDate.getDate() - baseDate.getDay()); 
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + idx);
      const dateStr = formatYYMMDD(d);
      const dbEntry = db[dateStr] || {};
      const workers = Array.isArray(dbEntry.workers)
        ? dbEntry.workers
        : [];

      const jobCounts = workers.reduce((counts, worker) => {
        const job = worker?.job;
        if (!job) return counts;

        counts[job] = (counts[job] || 0) + 1;
        return counts;
      }, {});

      return {
        date: dateStr,
        dayName: dayNames[idx],
        isToday: d.getTime() === todayMidnight.getTime(),
        workers: workers.length,
        jobCounts,
      };
    });
  };

  const weekDays = buildWeekCards(selectedWeekDate, savedData);

  const generateCalendarCells = (year, month) => {
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    const totalCells = Math.ceil(cells.length / 7) * 7;
    while (cells.length < totalCells) cells.push(null);
    return cells;
  };
  const calendarCells = generateCalendarCells(viewYear, viewMonth);

  const handlePrevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const handleNextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };
  const handleDayClick = (day) => { if (!day) return; setSelectedWeekDate(new Date(viewYear, viewMonth, day)); };
  const isClosed = (dateStr) => {
    if (!dateStr) return false;

    // 사용자가 취소한 open 상태를 자동 마감보다 우선합니다.
    if (manualStatus[dateStr] === 'open') return false;
    if (manualStatus[dateStr] === 'closed') return true;

    const parts = dateStr.split('.');
    const targetDate = new Date(
      2000 + parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );

    const targetTime = targetDate.getTime();
    const todayTime = todayMidnight.getTime();

    // 한국시간 기준 지난 날짜는 자동 마감입니다.
    if (targetTime < todayTime) return true;

    // 한국시간 기준 오늘은 23시 59분부터 자동 마감합니다.
    if (
      targetTime === todayTime &&
      koreaNow.hour === 23 &&
      koreaNow.minute >= 59
    ) {
      return true;
    }

    return false;
  };
  const handleToggleDeadline = async (dateStr) => {
    const currentlyClosed = isClosed(dateStr);

    const confirmed = window.confirm(
      currentlyClosed
        ? `[${dateStr}] 마감을 취소하시겠습니까?`
        : `[${dateStr}] 마감 처리하시겠습니까?`,
    );

    if (!confirmed) return;

    const newStatus = currentlyClosed ? 'open' : 'closed';

    try {
      await updateDeadlineStatus(dateStr, newStatus);

      setManualStatus((prev) => ({
        ...prev,
        [dateStr]: newStatus,
      }));

      alert(
        currentlyClosed
          ? '마감이 취소되었습니다. 근로자 추가/수정이 가능합니다.'
          : '마감 처리되었습니다.',
      );
    } catch (error) {
      console.error('마감 상태 변경 오류:', error);

      alert(
        `마감 상태를 변경하지 못했습니다.\n\n${
          error?.message || 'Supabase 권한 설정을 확인해주세요.'
        }`,
      );
    }
  };
  
  const parseReportDateKey = (key) => {
    if (!key || typeof key !== 'string') return null;

    const [yy, mm, dd] = key.split('.').map(Number);

    if (
      !Number.isFinite(yy) ||
      !Number.isFinite(mm) ||
      !Number.isFinite(dd)
    ) {
      return null;
    }

    return new Date(2000 + yy, mm - 1, dd).getTime();
  };

  const cumulativeCellMap = [
    {
      job: '소장',
      labelCell: 'B8',
      todayCell: 'C8',
      previousCell: 'E8',
      totalCell: 'F8',
    },
    {
      job: '관리자',
      labelCell: 'B9',
      todayCell: 'C9',
      previousCell: 'E9',
      totalCell: 'F9',
    },
    {
      job: '직영',
      labelCell: 'B10',
      todayCell: 'C10',
      previousCell: 'E10',
      totalCell: 'F10',
    },
    {
      job: '먹매김',
      labelCell: 'B11',
      todayCell: 'C11',
      previousCell: 'E11',
      totalCell: 'F11',
    },
    {
      job: '단열',
      labelCell: 'B12',
      todayCell: 'C12',
      previousCell: 'E12',
      totalCell: 'F12',
    },
    {
      job: '합지',
      labelCell: 'B13',
      todayCell: 'C13',
      previousCell: 'E13',
      totalCell: 'F13',
    },
    {
      job: '경량벽체',
      labelCell: 'B14',
      todayCell: 'C14',
      previousCell: 'E14',
      totalCell: 'F14',
    },
    {
      job: '세대천정',
      labelCell: 'H8',
      todayCell: 'I8',
      previousCell: 'K8',
      totalCell: 'L8',
    },
    {
      job: '공용홀천정',
      labelCell: 'H9',
      todayCell: 'I9',
      previousCell: 'K9',
      totalCell: 'L9',
    },
    {
      job: '몰딩',
      labelCell: 'H10',
      todayCell: 'I10',
      previousCell: 'K10',
      totalCell: 'L10',
    },
    {
      job: '걸레받이',
      labelCell: 'H11',
      todayCell: 'I11',
      previousCell: 'K11',
      totalCell: 'L11',
    },
    {
      job: '수장',
      labelCell: 'H12',
      todayCell: 'I12',
      previousCell: 'K12',
      totalCell: 'L12',
    },
    {
      job: '외주',
      labelCell: 'H13',
      todayCell: 'I13',
      previousCell: 'K13',
      totalCell: 'L13',
    },
    {
      job: '기타',
      labelCell: 'H14',
      todayCell: 'I14',
      previousCell: 'K14',
      totalCell: 'L14',
    },
  ];

  const cloneWorksheetData = (value) => {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  };

  const getWorksheetMergeRanges = (worksheet) => {
    const modelMerges = worksheet?.model?.merges;

    if (Array.isArray(modelMerges)) {
      return [...modelMerges];
    }

    /*
      ExcelJS 버전에 따라 model.merges 대신 내부 _merges에
      병합정보가 들어 있는 경우를 대비합니다.
    */
    if (worksheet?._merges) {
      return Object.values(worksheet._merges)
        .map((merge) => merge?.range)
        .filter(Boolean);
    }

    return [];
  };

  const createWorksheetFromTemplate = (
    workbook,
    templateWorksheet,
    sheetName,
  ) => {
    /*
      worksheet.model을 통째로 대입하면 두 번째 시트부터
      병합셀, 열 너비, 행 높이가 엑셀 저장 과정에서 깨질 수 있습니다.

      시트를 새로 만든 뒤 원본 양식의 각 구성요소를 명시적으로
      복사하여 모든 날짜 시트가 동일한 모양을 유지하도록 합니다.
    */
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.state = 'visible';
    worksheet.properties = cloneWorksheetData(
      templateWorksheet.properties,
    );
    worksheet.pageSetup = cloneWorksheetData(
      templateWorksheet.pageSetup,
    );
    worksheet.headerFooter = cloneWorksheetData(
      templateWorksheet.headerFooter,
    );
    worksheet.views = cloneWorksheetData(
      templateWorksheet.views || [],
    );

    if (templateWorksheet.autoFilter) {
      worksheet.autoFilter = cloneWorksheetData(
        templateWorksheet.autoFilter,
      );
    }

    for (
      let columnNumber = 1;
      columnNumber <= templateWorksheet.columnCount;
      columnNumber += 1
    ) {
      const sourceColumn =
        templateWorksheet.getColumn(columnNumber);
      const targetColumn = worksheet.getColumn(columnNumber);

      targetColumn.width = sourceColumn.width;
      targetColumn.hidden = sourceColumn.hidden;
      targetColumn.outlineLevel = sourceColumn.outlineLevel;
      targetColumn.style = cloneWorksheetData(
        sourceColumn.style || {},
      );
    }

    templateWorksheet.eachRow(
      { includeEmpty: true },
      (sourceRow, rowNumber) => {
        const targetRow = worksheet.getRow(rowNumber);

        targetRow.height = sourceRow.height;
        targetRow.hidden = sourceRow.hidden;
        targetRow.outlineLevel = sourceRow.outlineLevel;

        sourceRow.eachCell(
          { includeEmpty: true },
          (sourceCell, columnNumber) => {
            /*
              병합된 보조 셀은 나중에 mergeCells()로 다시 생성합니다.
              보조 셀의 값을 먼저 넣으면 병합 마스터 값이 덮어써질 수
              있으므로 제외합니다.
            */
            if (sourceCell.type === ExcelJS.ValueType.Merge) {
              return;
            }

            const targetCell =
              targetRow.getCell(columnNumber);

            targetCell.value = cloneWorksheetData(
              sourceCell.value,
            );
            targetCell.style = cloneWorksheetData(
              sourceCell.style || {},
            );

            if (sourceCell.dataValidation) {
              targetCell.dataValidation =
                cloneWorksheetData(
                  sourceCell.dataValidation,
                );
            }

            if (sourceCell.note) {
              targetCell.note = cloneWorksheetData(
                sourceCell.note,
              );
            }
          },
        );
      },
    );

    const mergeRanges =
      getWorksheetMergeRanges(templateWorksheet);

    mergeRanges.forEach((range) => {
      worksheet.mergeCells(range);
    });

    /*
      병합 후 마스터 셀의 스타일과 값을 한 번 더 적용합니다.
      mergeCells() 과정에서 병합셀 스타일이 재정리되는 ExcelJS
      동작 때문에 테두리나 정렬이 달라지는 것을 방지합니다.
    */
    mergeRanges.forEach((range) => {
      const startAddress = String(range).split(':')[0];
      const sourceCell =
        templateWorksheet.getCell(startAddress);
      const targetCell =
        worksheet.getCell(startAddress);

      targetCell.value = cloneWorksheetData(
        sourceCell.value,
      );
      targetCell.style = cloneWorksheetData(
        sourceCell.style || {},
      );
    });

    const sourceValidations =
      templateWorksheet?.dataValidations?.model;

    if (sourceValidations) {
      worksheet.dataValidations.model =
        cloneWorksheetData(sourceValidations);
    }

    return worksheet;
  };

  const clearDailyWorkerRows = (worksheet) => {
    for (let row = 18; row <= 57; row += 1) {
      ['B', 'C', 'D', 'E', 'F', 'H', 'I', 'J', 'K', 'L'].forEach(
        (column) => {
          worksheet.getCell(`${column}${row}`).value = null;
        },
      );
    }
  };

  const fillDailyReportWorksheet = ({
    worksheet,
    dateStr,
    dayName,
    workers = [],
  }) => {
    const parts = dateStr.split('.');
    const formattedDateForExcel = `20${parts[0]}년 ${parseInt(
      parts[1],
      10,
    )}월 ${parseInt(parts[2], 10)}일 ${dayName}요일`;

    worksheet.getCell('C3').value =
      activeProjectName || '현장명 미지정';
    worksheet.getCell('C4').value = '(주)욱림건설';
    worksheet.getCell('C5').value = formattedDateForExcel;

    clearDailyWorkerRows(worksheet);

    const selectedDateTime = parseReportDateKey(dateStr);
    const previousJobCounts = {};

    Object.entries(savedData).forEach(
      ([reportDateKey, reportData]) => {
        const reportDateTime = parseReportDateKey(reportDateKey);

        if (
          reportDateTime === null ||
          selectedDateTime === null ||
          reportDateTime >= selectedDateTime
        ) {
          return;
        }

        const previousWorkers = Array.isArray(reportData?.workers)
          ? reportData.workers
          : [];

        previousWorkers.forEach((worker) => {
          const job = worker?.job;
          const name = String(worker?.name || '').trim();

          if (!job || !name) return;

          previousJobCounts[job] =
            (previousJobCounts[job] || 0) + 1;
        });
      },
    );

    cumulativeCellMap.forEach(
      ({
        job,
        labelCell,
        todayCell,
        previousCell,
        totalCell,
      }) => {
        worksheet.getCell(labelCell).value = job;
        worksheet.getCell(previousCell).value =
          previousJobCounts[job] || 0;
        worksheet.getCell(totalCell).value = {
          formula: `${todayCell}+${previousCell}`,
        };
      },
    );

    workers.slice(0, 80).forEach((worker, index) => {
      if (index < 40) {
        const row = 18 + index;

        worksheet.getCell(`B${row}`).value = worker.job || '';
        worksheet.getCell(`C${row}`).value = worker.name || '';
        worksheet.getCell(`D${row}`).value =
          worker.process || worker.job || '';
        worksheet.getCell(`E${row}`).value = worker.location || '';
        worksheet.getCell(`F${row}`).value =
          worker.workContent || worker.work_content || '';
      } else {
        const row = 18 + (index - 40);

        worksheet.getCell(`H${row}`).value = worker.job || '';
        worksheet.getCell(`I${row}`).value = worker.name || '';
        worksheet.getCell(`J${row}`).value =
          worker.process || worker.job || '';
        worksheet.getCell(`K${row}`).value = worker.location || '';
        worksheet.getCell(`L${row}`).value =
          worker.workContent || worker.work_content || '';
      }
    });
  };

  const downloadExcelWorkbook = async (workbook, fileName) => {
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;
    workbook.calcProperties.calcMode = 'auto';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadDailyReportTemplate = async () => {
    const response = await fetch('/templates/출력일보.xlsx');

    if (!response.ok) {
      throw new Error('출력일보 양식 파일을 찾지 못했습니다.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    if (!workbook.worksheets[0]) {
      throw new Error('출력일보 양식에 시트가 없습니다.');
    }

    return workbook;
  };

  const handleDownloadExcel = async (dayObj) => {
    const dateStr = dayObj.date;
    const workers = savedData[dateStr]?.workers || [];

    if (workers.length === 0) {
      alert(`[${dateStr}] 일자에 등록된 인원이 없습니다.`);
      return;
    }

    try {
      const workbook = await loadDailyReportTemplate();
      const worksheet = workbook.worksheets[0];

      fillDailyReportWorksheet({
        worksheet,
        dateStr,
        dayName: dayObj.dayName,
        workers,
      });

      await downloadExcelWorkbook(
        workbook,
        `출력일보_${dateStr}.xlsx`,
      );
    } catch (error) {
      console.error(error);
      alert(
        '양식 파일을 불러오지 못했습니다. templates 폴더를 확인해주세요.',
      );
    }
  };

  const handleDownloadMonthlyExcel = async () => {
    try {
      const year = todayMidnight.getFullYear();
      const monthIndex = todayMidnight.getMonth();
      const month = monthIndex + 1;
      const lastDay = todayMidnight.getDate();
      const workbook = await loadDailyReportTemplate();
      const templateWorksheet = workbook.worksheets[0];
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const worksheets = [];

      /*
        원본 양식에 7월 1일 데이터를 입력하기 전에
        2일~오늘 시트를 먼저 모두 복제합니다.

        그렇지 않으면 2일 이후 시트가 이미 1일 데이터가 입력된
        시트를 복제하게 되므로 양식 원본 상태가 유지되지 않습니다.
      */
      templateWorksheet.name = `${month}.1`;
      worksheets.push(templateWorksheet);

      for (let day = 2; day <= lastDay; day += 1) {
        worksheets.push(
          createWorksheetFromTemplate(
            workbook,
            templateWorksheet,
            `${month}.${day}`,
          ),
        );
      }

      for (let day = 1; day <= lastDay; day += 1) {
        const targetDate = new Date(year, monthIndex, day);
        const dateStr = formatYYMMDD(targetDate);
        const workers = savedData[dateStr]?.workers || [];
        const worksheet = worksheets[day - 1];

        fillDailyReportWorksheet({
          worksheet,
          dateStr,
          dayName: dayNames[targetDate.getDay()],
          workers,
        });
      }

      await downloadExcelWorkbook(
        workbook,
        `출력일보_${year}년_${String(month).padStart(
          2,
          '0',
        )}월_1-${lastDay}일.xlsx`,
      );
    } catch (error) {
      console.error('금월 출력일보 생성 오류:', error);
      alert(
        '금월 출력일보를 만들지 못했습니다. 양식 파일과 데이터를 확인해주세요.',
      );
    }
  };

  const normalizeWorker = (worker, index = 0) => ({
    ...worker,
    id: worker?.id ?? `${Date.now()}-${index}-${Math.random()}`,
    job: worker?.job ?? null,
    name: worker?.name ?? '',
    process: worker?.process || worker?.job || null,
    location: worker?.location || '',
    workContent: worker?.workContent || worker?.work_content || '',
    day: worker?.day ?? 1,
    night: worker?.night ?? 0,
  });

  const handleOpenModal = (day) => {
    if (isClosed(day.date)) {
      alert('관리자에게 연락하여 주시기 바랍니다.');
      return;
    }

    setSelectedDateKey(day.date);
    setSelectedDateDisplay(`${day.date} (${day.dayName})`);

    const parts = day.date.split('.');
    const targetDate = new Date(
      2000 + parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );

    targetDate.setDate(targetDate.getDate() - 1);
    const prevDayStr = formatYYYYMMDD(formatYYMMDD(targetDate));

    setWorkerFetchDate(prevDayStr);
    setTaskFetchDate(prevDayStr);

    const currentData = savedData[day.date];
    setWorkerRows(
      (currentData?.workers || []).map((worker, index) =>
        normalizeWorker(worker, index),
      ),
    );
    setTaskRows(currentData?.tasks || []);
    setModalOpen(true);
  };
  const handleCloseModal = () => { setModalOpen(false); setSelectedWorkers([]); setSelectedTasks([]); };
  const handleCardTaskChange = (date, field, value) => { if (isClosed(date)) return; setSavedData(prev => ({ ...prev, [date]: { ...(prev[date] || { workers: [], tasks: [] }), [field]: value } })); };
  const handleTaskBlur = async (dateKey) => { await syncDataToDB(dateKey); };
  const handleSetNoTask = async (dateKey) => {
    if (isClosed(dateKey)) return;

    const confirmedNoTask = window.confirm(
      '"작업없음" 처리하시겠습니까?',
    );

    if (!confirmedNoTask) return;

    const confirmedClose = window.confirm(
      '마감처리 됩니다.\n\nY(확인) / N(취소)',
    );

    if (!confirmedClose) return;

    const overrides = {
      workers: [],
      tasks: [],
      todayTask: '작업없음',
      tomorrowTask: '작업없음',
    };

    setSavedData((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        ...overrides,
      },
    }));

    setManualStatus((prev) => ({
      ...prev,
      [dateKey]: 'closed',
    }));

    await syncDataToDB(dateKey, overrides, 'closed');
  };
  const handleFetchPreviousCardTasks = async (currentDateKey) => {
    if (isClosed(currentDateKey)) return;
    const parts = currentDateKey.split('.'); const curr = new Date(2000 + parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)); curr.setDate(curr.getDate() - 1);
    const prevDateKey = formatYYMMDD(curr); const prevData = savedData[prevDateKey];
    if (!prevData?.todayTask && !prevData?.tomorrowTask) return alert('가져올 내용이 없습니다.');
    const overrides = { ...(savedData[currentDateKey] || {}), todayTask: prevData.todayTask, tomorrowTask: prevData.tomorrowTask };
    setSavedData(prev => ({ ...prev, [currentDateKey]: overrides })); await syncDataToDB(currentDateKey, overrides);
  };
  const handleSaveModal = async () => {
    const isValid = workerRows.every(
      (row) =>
        row.job &&
        row.name &&
        row.name.trim() !== '' &&
        row.process &&
        row.day !== '' &&
        row.day !== null,
    );

    if (!isValid) {
      alert('구분, 성명, 공정, 주간 항목을 확인해주세요.');
      return;
    }

    const overrides = {
      workers: workerRows,
      tasks: taskRows,
    };

    setSavedData((prev) => ({
      ...prev,
      [selectedDateKey]: {
        ...(prev[selectedDateKey] || {}),
        ...overrides,
      },
    }));

    await syncDataToDB(selectedDateKey, overrides);
    alert('안전하게 저장되었습니다!');
    handleCloseModal();
  };
  const suppressedEnterCellRef =
    useRef('');

  const getWorkerCellKey = (
    rowIndex,
    columnIndex,
  ) =>
    `${rowIndex}:${columnIndex}`;

  const isEnterEvent = (
    event,
  ) =>
    event.key === 'Enter' ||
    event.code === 'NumpadEnter';

  const focusWorkerGridCell = (
    rowIndex,
    columnIndex,
  ) => {
    const target =
      document.querySelector(
        `[data-worker-grid-input="true"]` +
          `[data-worker-row="${rowIndex}"]` +
          `[data-worker-column="${columnIndex}"]`,
      );

    if (
      !target ||
      typeof target.focus !==
        'function'
    ) {
      return false;
    }

    /*
      MUI 입력창과 한글 조합이 완전히 정리된 뒤
      포커스를 옮기기 위해 두 단계로 지연합니다.
    */
    requestAnimationFrame(() => {
      setTimeout(() => {
        target.focus({
          preventScroll: true,
        });

        target.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
        });

        if (
          typeof target.select ===
          'function'
        ) {
          target.select();
        }
      }, 0);
    });

    return true;
  };

  const handleWorkerGridKeyDown = (
    event,
    rowIndex,
    columnIndex,
  ) => {
    /*
      자동완성 목록이 열린 상태의 Enter는
      MUI의 항목 선택에 먼저 사용합니다.
      이어지는 keyup에서는 아래 이동을 한 번 건너뜁니다.
    */
    if (isEnterEvent(event)) {
      const isAutocompleteOpen =
        event.currentTarget?.getAttribute(
          'aria-expanded',
        ) === 'true' ||
        event.target?.getAttribute(
          'aria-expanded',
        ) === 'true';

      if (
        isAutocompleteOpen ||
        event.defaultPrevented
      ) {
        suppressedEnterCellRef.current =
          getWorkerCellKey(
            rowIndex,
            columnIndex,
          );
      }

      return;
    }

    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      const isAutocompleteOpen =
        event.currentTarget?.getAttribute(
          'aria-expanded',
        ) === 'true' ||
        event.target?.getAttribute(
          'aria-expanded',
        ) === 'true';

      /*
        구분·공정 자동완성 목록이 열려 있으면
        방향키는 목록 항목 이동에 그대로 사용합니다.
      */
      if (isAutocompleteOpen) {
        return;
      }

      const nextRowIndex =
        event.key === 'ArrowUp'
          ? rowIndex - 1
          : rowIndex + 1;

      if (
        nextRowIndex < 0 ||
        nextRowIndex >=
          workerRows.length
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      focusWorkerGridCell(
        nextRowIndex,
        columnIndex,
      );

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const lastColumnIndex = 6;

    if (event.shiftKey) {
      if (columnIndex > 0) {
        focusWorkerGridCell(
          rowIndex,
          columnIndex - 1,
        );
        return;
      }

      if (rowIndex > 0) {
        focusWorkerGridCell(
          rowIndex - 1,
          lastColumnIndex,
        );
      }

      return;
    }

    if (
      columnIndex <
      lastColumnIndex
    ) {
      focusWorkerGridCell(
        rowIndex,
        columnIndex + 1,
      );
      return;
    }

    focusWorkerGridCell(
      rowIndex + 1,
      0,
    );
  };

  const handleWorkerAutocompleteKeyDown = (
    event,
    rowIndex,
    columnIndex,
    muiKeyDown,
  ) => {
    const popupWasOpen =
      event.currentTarget?.getAttribute(
        'aria-expanded',
      ) === 'true' ||
      event.target?.getAttribute(
        'aria-expanded',
      ) === 'true';

    const isVerticalArrow =
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown';

    /*
      Tab은 자동완성 내부 처리보다 먼저 가로 이동시킵니다.

      자동완성 목록이 닫힌 상태의 ↑↓도
      목록을 새로 열지 않고 같은 열의 위·아래 행으로 이동합니다.
    */
    if (
      event.key === 'Tab' ||
      (
        isVerticalArrow &&
        !popupWasOpen
      )
    ) {
      handleWorkerGridKeyDown(
        event,
        rowIndex,
        columnIndex,
      );

      if (event.defaultPrevented) {
        return;
      }
    }

    muiKeyDown?.(event);

    if (
      isEnterEvent(event) &&
      popupWasOpen
    ) {
      suppressedEnterCellRef.current =
        getWorkerCellKey(
          rowIndex,
          columnIndex,
        );
    }

    /*
      Enter와 일반 키는 기존 처리 유지.
      Tab 및 ↑↓는 위에서 이미 처리했거나
      열린 자동완성 목록이 처리했으므로 중복 호출하지 않습니다.
    */
    if (
      event.key !== 'Tab' &&
      !isVerticalArrow
    ) {
      handleWorkerGridKeyDown(
        event,
        rowIndex,
        columnIndex,
      );
    }
  };

  const handleWorkerGridKeyUp = (
    event,
    rowIndex,
    columnIndex,
  ) => {
    if (!isEnterEvent(event)) {
      return;
    }

    /*
      한글 IME 조합 중인 Enter는 글자 확정에 사용하고,
      조합이 끝난 keyup에서만 이동합니다.
    */
    if (
      event.nativeEvent?.isComposing ||
      event.isComposing
    ) {
      return;
    }

    const cellKey =
      getWorkerCellKey(
        rowIndex,
        columnIndex,
      );

    if (
      suppressedEnterCellRef.current ===
      cellKey
    ) {
      suppressedEnterCellRef.current =
        '';
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    focusWorkerGridCell(
      rowIndex + 1,
      columnIndex,
    );
  };

  const handleFetchWorkers = () => {
    const targetKey = formatYYMMDD(new Date(workerFetchDate));
    const previousWorkers = savedData[targetKey]?.workers || [];

    if (previousWorkers.length === 0) {
      alert('데이터가 없습니다.');
      return;
    }

    const normalizedWorkers = previousWorkers.map((worker, index) =>
      normalizeWorker(
        {
          ...worker,
          id: `${Date.now()}-${index}-${Math.random()}`,
        },
        index,
      ),
    );

    if (
      workerRows.length > 0 &&
      !window.confirm('기존 내용을 지우고 가져오시겠습니까?')
    ) {
      setWorkerRows((prev) => [...prev, ...normalizedWorkers]);
      return;
    }

    setWorkerRows(normalizedWorkers);
  };

  const handleAddWorker = () =>
    setWorkerRows((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        job: null,
        name: '',
        process: null,
        location: '',
        workContent: '',
        day: 1,
        night: 0,
      },
    ]);

  const handleDeleteWorkers = () => {
    setWorkerRows((prev) =>
      prev.filter((row) => !selectedWorkers.includes(row.id)),
    );
    setSelectedWorkers([]);
  };

  const handleSelectAllWorkers = (event) =>
    setSelectedWorkers(
      event.target.checked ? workerRows.map((row) => row.id) : [],
    );

  const handleSelectWorker = (id) =>
    setSelectedWorkers((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id],
    );

  const handleWorkerChange = (id, field, value) =>
    setWorkerRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        if (field === 'job') {
          const shouldFollowJob = !row.process || row.process === row.job;
          return {
            ...row,
            job: value,
            process: shouldFollowJob ? value : row.process,
          };
        }

        return {
          ...row,
          [field]: value,
        };
      }),
    );
  const handleFetchTasks = () => { const targetKey = formatYYMMDD(new Date(taskFetchDate)); if (savedData[targetKey]?.tasks?.length > 0) { if (taskRows.length > 0 && !window.confirm('추가하시겠습니까?')) { setTaskRows(savedData[targetKey].tasks.map(t => ({ ...t, id: Date.now() + Math.random() }))); return; } setTaskRows(prev => [...prev, ...savedData[targetKey].tasks.map(t => ({ ...t, id: Date.now() + Math.random() }))]); } else alert('데이터가 없습니다.'); };
  const handleAddTask = () => setTaskRows([...taskRows, { id: Date.now(), taskName: '', amount: '' }]);
  const handleDeleteTasks = () => { setTaskRows(taskRows.filter(row => !selectedTasks.includes(row.id))); setSelectedTasks([]); };
  const handleSelectAllTasks = (e) => setSelectedTasks(e.target.checked ? taskRows.map(row => row.id) : []);
  const handleSelectTask = (id) => setSelectedTasks(selectedTasks.includes(id) ? selectedTasks.filter(item => item !== id) : [...selectedTasks, id]);
  const handleTaskChange = (id, field, value) => setTaskRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));

  const isCompletedProgressCell = (
    cellKey,
  ) =>
    unitProgressData?.[
      cellKey
    ]?.status === '작업완료';

  /*
    기존 완료일 보호는 새로운 완료 처리에서만 적용합니다.

    완료:
    기존 완료 세대 선택·저장 제외

    작업전 / 작업중:
    완료 세대도 선택 가능
    잘못 처리한 완료 상태를 되돌리거나 변경할 수 있음
  */
  const shouldProtectCompletedProgress =
    selectedStatusAction ===
    '작업완료';

  // 공정 진척 관리: 현재 선택한 상태에 맞는 세대만 선택합니다.
  const handleFloorClick = (buildingName, floor) => {
    const config = buildingConfigs[buildingName];
    if (!config) return;

    const validCellKeys = getFloorCellKeys(
      buildingName,
      config,
      floor,
    );

    const editableCellKeys =
      shouldProtectCompletedProgress
        ? validCellKeys.filter(
            (cellKey) =>
              !isCompletedProgressCell(
                cellKey,
              ),
          )
        : validCellKeys;

    if (
      editableCellKeys.length ===
      0
    ) {
      return;
    }

    setSelectedCells((prev) => {
      const next = new Set(prev);
      const allSelected =
        editableCellKeys.length > 0 &&
        editableCellKeys.every(
          (key) =>
            next.has(key),
        );

      editableCellKeys.forEach((key) => {
        if (allSelected) next.delete(key);
        else next.add(key);
      });

      return next;
    });
  };

  const handleGridCellClick = (
    cellKey,
  ) => {
    if (
      shouldProtectCompletedProgress &&
      isCompletedProgressCell(
        cellKey,
      )
    ) {
      return;
    }

    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(cellKey)) next.delete(cellKey);
      else next.add(cellKey);
      return next;
    });
  };

  const splitProgressCellKey = (cellKey) => {
    const separatorIndex = cellKey.lastIndexOf('-');

    if (separatorIndex === -1) {
      return {
        building: '',
        unit: cellKey,
      };
    }

    return {
      building: cellKey.slice(0, separatorIndex),
      unit: cellKey.slice(separatorIndex + 1),
    };
  };

  const handleSaveProgress = async () => {
    if (!activeProjectName) {
      alert('선택된 현장이 없습니다.');
      return;
    }

    if (selectedCells.size === 0) {
      alert('변경할 세대를 선택해주세요.');
      return;
    }

    const allSelectedCellKeys =
      Array.from(
        selectedCells,
      );

    /*
      화면 선택 상태가 오래 남아 있거나
      다른 선택 기능을 통해 완료 세대가 포함되더라도,
      저장 직전에 다시 제외해 기존 완료일을 보호합니다.
    */
    const protectedCompletedCellKeys =
      shouldProtectCompletedProgress
        ? allSelectedCellKeys.filter(
            (cellKey) =>
              isCompletedProgressCell(
                cellKey,
              ),
          )
        : [];

    const selectedCellKeys =
      shouldProtectCompletedProgress
        ? allSelectedCellKeys.filter(
            (cellKey) =>
              !isCompletedProgressCell(
                cellKey,
              ),
          )
        : allSelectedCellKeys;

    if (
      selectedCellKeys.length ===
      0
    ) {
      setSelectedCells(
        new Set(),
      );

      alert(
        '선택한 세대는 모두 이미 작업완료 상태입니다.\n기존 완료일은 변경되지 않습니다.',
      );
      return;
    }

    try {
      /*
        작업전은 Supabase에 저장하지 않습니다.

        DB 행 없음 = 작업전
        작업중 = DB 저장
        작업완료 = DB 저장
      */
      if (selectedStatusAction === '작업전') {
        const unitsByBuilding = selectedCellKeys.reduce(
          (groups, cellKey) => {
            const { building, unit } = splitProgressCellKey(cellKey);

            if (!building || !unit) return groups;

            if (!groups[building]) {
              groups[building] = [];
            }

            groups[building].push(unit);
            return groups;
          },
          {},
        );

        const deleteResults = await Promise.all(
          Object.entries(unitsByBuilding).map(
            async ([building, units]) =>
              supabase
                .from('unit_progress')
                .delete()
                .eq('project_name', activeProjectName)
                .eq('process_type', selectedProcess)
                .eq('building', building)
                .in('unit', units),
          ),
        );

        const failedDelete = deleteResults.find(
          (result) => result.error,
        );

        if (failedDelete?.error) {
          throw failedDelete.error;
        }

        setUnitProgressData((prev) => {
          const next = {
            ...prev,
          };

          selectedCellKeys.forEach((cellKey) => {
            delete next[cellKey];
          });

          return next;
        });

        setSelectedCells(new Set());

        const protectedMessage =
          protectedCompletedCellKeys.length >
          0
            ? `\n이미 완료된 ${protectedCompletedCellKeys.length.toLocaleString()}세대는 변경하지 않았습니다.`
            : '';

        alert(
          `${selectedCellKeys.length.toLocaleString()}세대를 작업전으로 되돌렸습니다.${protectedMessage}`,
        );
        return;
      }

      const updates = selectedCellKeys.map((cellKey) => {
        const { building, unit } = splitProgressCellKey(cellKey);

        return {
          project_name: activeProjectName,
          building,
          unit,
          process_type: selectedProcess,
          status: selectedStatusAction,
          completion_date: progressDate,
        };
      });

      /*
        전체선택 시 1,000세대를 넘는 현장도 안정적으로 저장되도록
        한 번에 모두 보내지 않고 500건 단위로 나눠서 저장합니다.
      */
      const updateChunks = splitIntoChunks(
        updates,
        PROGRESS_WRITE_CHUNK_SIZE,
      );

      for (const updateChunk of updateChunks) {
        const { error } = await supabase
          .from('unit_progress')
          .upsert(updateChunk, {
            onConflict:
              'project_name, building, unit, process_type',
          });

        if (error) {
          throw error;
        }
      }

      setUnitProgressData((prev) => {
        const next = {
          ...prev,
        };

        selectedCellKeys.forEach((cellKey) => {
          next[cellKey] = {
            status: selectedStatusAction,
            date: progressDate,
          };
        });

        return next;
      });

      setSelectedCells(new Set());

      const protectedMessage =
        protectedCompletedCellKeys.length >
        0
          ? `\n이미 완료된 ${protectedCompletedCellKeys.length.toLocaleString()}세대는 기존 완료일을 유지했습니다.`
          : '';

      alert(
        `${selectedCellKeys.length.toLocaleString()}세대가 저장되었습니다.${protectedMessage}`,
      );
    } catch (error) {
      console.error('공정 상태 저장 오류:', error);
      alert(`저장 실패: ${error?.message || '알 수 없는 오류'}`);
    }
  };

  const validProjectCellKeys = getProjectCellKeys(buildingConfigs);
  const totalUnits = validProjectCellKeys.size;
  const completedUnits = Array.from(validProjectCellKeys).filter(
    (cellKey) => unitProgressData[cellKey]?.status === '작업완료',
  ).length;
  const progressPercentage =
    totalUnits === 0
      ? 0
      : ((completedUnits / totalUnits) * 100).toFixed(2);

  const actionName = selectedStatusAction === '작업완료' ? '완료' : selectedStatusAction;

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppBar
        position="absolute"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#1e293b' }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={toggleDrawer}
            sx={{ marginRight: '36px' }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            component="h1"
            variant="subtitle1"
            color="inherit"
            noWrap
            sx={{ flexGrow: 1, fontWeight: 'bold' }}
          >
            🏗️{' '}
            {currentView ===
            'daily-cumulative-workers'
              ? cumulativeProjectScope
              : [
                  'admin-dashboard',
                  'approval-inbox',
                  'weekly-overview',
                  'weekly-overview-archive',
                ].includes(currentView)
                ? '욱림건설'
                : activeProjectName ||
                  '현장을 선택해주세요'}{' '}
            - {viewTitles[currentView] || '현장 관리'}
          </Typography>

          {isManagementRole &&
            ![
              'weekly-overview',
              'weekly-overview-archive',
            ].includes(
              currentView,
            ) && (
            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: {
                  xs: 240,
                  md: 330,
                },
                maxWidth: '38vw',
                transform:
                  'translate(-50%, -50%)',
                zIndex: 2,
              }}
            >
              <Autocomplete
                size="small"
                options={
                  currentView ===
                  'daily-cumulative-workers'
                    ? [
                        ALL_PROJECTS_OPTION,
                        ...projectOptions,
                      ]
                    : projectOptions
                }
                value={
                  currentView ===
                  'daily-cumulative-workers'
                    ? cumulativeProjectScope
                    : activeProjectName ||
                      null
                }
                loading={projectOptionsLoading}
                disableClearable
                onChange={handleSelectManagementProject}
                noOptionsText="등록된 현장이 없습니다."
                loadingText="현장목록 불러오는 중..."
                isOptionEqualToValue={(
                  option,
                  value,
                ) => option === value}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="현장을 선택해주세요"
                    inputProps={{
                      ...params.inputProps,
                      readOnly: true,
                    }}
                  />
                )}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    minHeight: 36,
                    py: '0 !important',
                    pr: '34px !important',
                    color: '#ffffff',
                    bgcolor:
                      'rgba(255,255,255,0.13)',
                    borderRadius: 1.2,
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    '& fieldset': {
                      borderColor:
                        'rgba(255,255,255,0.38)',
                    },
                    '&:hover fieldset': {
                      borderColor:
                        'rgba(255,255,255,0.72)',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#7dd3fc',
                    },
                  },
                  '& .MuiInputBase-input': {
                    py: '7px !important',
                    textAlign: 'center',
                    color: '#ffffff',
                    cursor: 'pointer',
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: '#cbd5e1',
                    opacity: 1,
                  },
                  '& .MuiAutocomplete-popupIndicator': {
                    color: '#e2e8f0',
                  },
                  '& .MuiAutocomplete-clearIndicator': {
                    color: '#e2e8f0',
                  },
                }}
              />
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              접속자: {userProfile?.manager_name} ({userRole})
            </Typography>

            <Button
              color="inherit"
              onClick={onLogout}
              size="small"
              sx={{ border: '1px solid rgba(255,255,255,0.5)' }}
            >
              로그아웃
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: open ? drawerWidth : 72,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: open ? drawerWidth : 72,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 0.3s',
            bgcolor: '#0f172a',
            color: 'white',
          },
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Sidebar
          currentView={currentView}
          onViewChange={handleSidebarViewChange}
          drawerOpen={open}
          userRole={userRole}
        />
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#f1f5f9',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />

        <Box
          sx={{
            p: 2,
            flexGrow: 1,
            minHeight: 0,
            overflow:
              [
                'weekly-overview',
                'weekly-overview-archive',
              ].includes(
                currentView,
              )
                ? 'auto'
                : 'hidden',
          }}
        >
          {currentView === 'admin-dashboard' && isManagementRole && (
            <AdminDashboard
              processOptions={processOptions}
              onOpenProject={handleOpenAdminProject}
            />
          )}

          {currentView === 'approval-inbox' && (
            <ApprovalInbox />
          )}

          {isManagementRole &&
            currentView === 'weekly-overview' && (
              <WeeklyOverview
                userProfile={activeUserProfile}
              />
            )}

          {isManagementRole &&
            currentView ===
              'weekly-overview-archive' && (
              <WeeklyOverviewArchive
                userProfile={activeUserProfile}
              />
            )}

          {currentView === 'main' && activeProjectName && (
            <MainDashboard
              projectName={activeProjectName}
              buildingConfigs={buildingConfigs}
              processOptions={activeProcessOptions}
              savedData={savedData}
              viewYear={viewYear}
              viewMonth={viewMonth}
              handlePrevMonth={handlePrevMonth}
              handleNextMonth={handleNextMonth}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'daily' && activeProjectName && (
            <DailyReport
              weekDays={weekDays}
              calendarCells={calendarCells}
              viewYear={viewYear}
              viewMonth={viewMonth}
              selectedWeekDate={selectedWeekDate}
              savedData={savedData}
              isClosed={isClosed}
              handlePrevMonth={handlePrevMonth}
              handleNextMonth={handleNextMonth}
              handleDayClick={handleDayClick}
              handleOpenModal={handleOpenModal}
              handleDownloadExcel={handleDownloadExcel}
              handleDownloadMonthlyExcel={handleDownloadMonthlyExcel}
              handleToggleDeadline={handleToggleDeadline}
              handleSetNoTask={handleSetNoTask}
              todayMidnight={todayMidnight}
              formatYYMMDD={formatYYMMDD}
              userProfile={activeUserProfile}
              onHistoricalUploadComplete={
                handleHistoricalUploadComplete
              }
            />
          )}

          {currentView === 'daily-monthly-workers' &&
            activeProjectName && (
              <MonthlyWorkerStatus
                projectName={activeProjectName}
                savedData={savedData}
                viewYear={viewYear}
                viewMonth={viewMonth}
                handlePrevMonth={handlePrevMonth}
                handleNextMonth={handleNextMonth}
              />
            )}

          {currentView ===
            'daily-cumulative-workers' && (
              <CumulativeWorkerStatus
                projectScope={
                  cumulativeProjectScope
                }
                userRole={userRole}
              />
            )}

          {currentView === 'progress-input' && activeProjectName && (
            <ProgressInput
              projectName={activeProjectName || ''}
              selectedCells={selectedCells}
              actionName={actionName}
              progressDate={progressDate}
              setProgressDate={setProgressDate}
              handleSaveProgress={handleSaveProgress}
              setSelectedCells={setSelectedCells}
              selectedStatusAction={selectedStatusAction}
              setSelectedStatusAction={setSelectedStatusAction}
              protectCompleted={
                shouldProtectCompletedProgress
              }
              completedUnits={completedUnits}
              totalUnits={totalUnits}
              progressPercentage={progressPercentage}
              setSelectedProcess={setSelectedProcess}
              selectedProcess={selectedProcess}
              processOptions={activeProcessOptions}
              buildingConfigs={buildingConfigs}
              unitProgressData={unitProgressData}
              handleGridCellClick={handleGridCellClick}
              handleFloorClick={handleFloorClick}
            />
          )}

          {currentView === 'progress-multi' && activeProjectName && (
            <MultiProcessProgress
              projectName={activeProjectName || ''}
              processOptions={activeProcessOptions}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'progress-daily' && activeProjectName && (
            <DailyCompletionSummary
              projectName={activeProjectName || ''}
              processOptions={activeProcessOptions}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'progress-monthly' && activeProjectName && (
            <CompletionSummary
              mode="monthly"
              projectName={activeProjectName || ''}
              processOptions={activeProcessOptions}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'progress-weekly' && activeProjectName && (
            <CompletionSummary
              mode="weekly"
              projectName={activeProjectName || ''}
              processOptions={activeProcessOptions}
              buildingConfigs={buildingConfigs}
            />
          )}


          {currentView ===
            'material-order' &&
            activeProjectName && (
              <MaterialOrderUpload
                projectName={activeProjectName}
                userProfile={activeUserProfile}
              />
            )}

          {currentView ===
            'material-input-status' &&
            activeProjectName && (
              <MaterialInputStatus
                projectName={activeProjectName}
              />
            )}

          {currentView === 'report-weekly' && activeProjectName && (
            <WeeklyReport
              userProfile={activeUserProfile}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'report-approval' && activeProjectName && (
            <ProposalReport userProfile={activeUserProfile} />
          )}

          {currentView === 'report-outsourcing-approval' && activeProjectName && (
            <ReportPlaceholder title="외주 품의 보고" />
          )}

          {currentView === 'report-accident' && activeProjectName && (
            <ReportPlaceholder title="사고 경위 보고" />
          )}

          {isManagementRole &&
            !PROJECT_FREE_VIEWS.includes(
              currentView,
            ) &&
            !activeProjectName && (
              <Paper
                variant="outlined"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  borderColor: '#cbd5e1',
                  bgcolor: '#ffffff',
                }}
              >
                <Typography
                  fontWeight={900}
                  color="#334155"
                >
                  상단 현장목록에서 현장을 선택해주세요.
                </Typography>
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.76rem',
                  }}
                >
                  현장 선택 후 현재 메뉴가 바로 표시됩니다.
                </Typography>
              </Paper>
            )}
        </Box>
      </Box>

      <Modal open={modalOpen} onClose={handleCloseModal}>
        <Box sx={modalStyle}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle1" fontWeight="bold" color="#334155">내장공사 / [{selectedDateDisplay}]</Typography>
            <IconButton onClick={handleCloseModal} size="small"><CloseIcon /></IconButton>
          </Box>

          <Box
            sx={{
              flexGrow: 1,
              p: 2,
              overflow: 'hidden',
              bgcolor: '#f1f5f9',
            }}
          >
            <Paper
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                p: 1.5,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight="bold"
                  >
                    근로자
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.15,
                      color: '#64748b',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                    }}
                  >
                    TAB: 오른쪽 이동 · ENTER: 아래 이동 · 숫자키패드 Enter 지원
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    gap: 0.5,
                    alignItems: 'center',
                  }}
                >
                  <TextField
                    size="small"
                    type="date"
                    value={workerFetchDate}
                    onChange={(event) =>
                      setWorkerFetchDate(event.target.value)
                    }
                    sx={{
                      '& .MuiInputBase-root': {
                        fontSize: '0.75rem',
                        py: 0.2,
                      },
                    }}
                  />

                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleFetchWorkers}
                    sx={{
                      bgcolor: '#0284c7',
                      fontSize: '0.7rem',
                      boxShadow: 'none',
                    }}
                  >
                    가져오기
                  </Button>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddWorker}
                    sx={{
                      bgcolor: '#475569',
                      fontSize: '0.7rem',
                      boxShadow: 'none',
                    }}
                  >
                    추가
                  </Button>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleDeleteWorkers}
                    sx={{
                      bgcolor: '#ef4444',
                      fontSize: '0.7rem',
                      boxShadow: 'none',
                    }}
                  >
                    삭제
                  </Button>
                </Box>
              </Box>

              <TableContainer
                sx={{
                  flexGrow: 1,
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  bgcolor: 'white',
                }}
              >
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    minWidth: 1320,
                    tableLayout: 'fixed',
                  }}
                >
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell
                        padding="checkbox"
                        align="center"
                        sx={{
                          width: 54,
                          borderRight: '1px solid #cbd5e1',
                          fontWeight: 'bold',
                        }}
                      >
                        <Checkbox
                          size="small"
                          onChange={handleSelectAllWorkers}
                          checked={
                            workerRows.length > 0 &&
                            selectedWorkers.length === workerRows.length
                          }
                          indeterminate={
                            selectedWorkers.length > 0 &&
                            selectedWorkers.length < workerRows.length
                          }
                        />
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 52 }}
                      >
                        No.
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 125 }}
                      >
                        구분
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 120 }}
                      >
                        성명
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 125 }}
                      >
                        공정
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 150 }}
                      >
                        위치
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 420 }}
                      >
                        작업내용
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{ ...headerCellStyle, width: 74 }}
                      >
                        주간
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 74,
                          py: 1,
                          fontWeight: 'bold',
                          color: '#334155',
                        }}
                      >
                        야간
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {workerRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          align="center"
                          sx={{
                            py: 10,
                            color: 'text.secondary',
                            borderBottom: 'none',
                          }}
                        >
                          데이터가 존재하지 않습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      workerRows.map((row, index) => (
                        <TableRow hover key={row.id}>
                          <TableCell
                            padding="checkbox"
                            align="center"
                            sx={{
                              borderRight: '1px solid #cbd5e1',
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={selectedWorkers.includes(row.id)}
                              onChange={() => handleSelectWorker(row.id)}
                            />
                          </TableCell>

                          <TableCell
                            align="center"
                            sx={{
                              py: 0.5,
                              color: '#334155',
                              borderRight: '1px solid #cbd5e1',
                            }}
                          >
                            {index + 1}
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <Autocomplete
                              options={jobOptions}
                              value={row.job}
                              onChange={(_, newValue) =>
                                handleWorkerChange(row.id, 'job', newValue)
                              }
                              disableClearable
                              size="small"
                              autoHighlight
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  variant="standard"
                                  InputProps={{
                                    ...params.InputProps,
                                    disableUnderline: true,
                                  }}
                                  inputProps={{
                                    ...params.inputProps,
                                    className: `${
                                      params.inputProps?.className || ''
                                    } excel-input`,
                                    'data-worker-grid-input': 'true',
                                    'data-worker-row': index,
                                    'data-worker-column': 0,
                                  }}
                                  onKeyDown={(event) =>
                                    handleWorkerAutocompleteKeyDown(
                                      event,
                                      index,
                                      0,
                                      params.inputProps
                                        ?.onKeyDown,
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    handleWorkerGridKeyUp(
                                      event,
                                      index,
                                      0,
                                    )
                                  }
                                  sx={{
                                    '& input': {
                                      py: 1,
                                      textAlign: 'center',
                                      fontSize: '0.78rem',
                                    },
                                  }}
                                />
                              )}
                            />
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <InputBase
                              className="excel-input"
                              value={row.name}
                              inputProps={{
                                'data-worker-grid-input': 'true',
                                'data-worker-row': index,
                                'data-worker-column': 1,
                              }}
                              onKeyDown={(event) =>
                                handleWorkerGridKeyDown(
                                  event,
                                  index,
                                  1,
                                )
                              }
                              onKeyUp={(event) =>
                                handleWorkerGridKeyUp(
                                  event,
                                  index,
                                  1,
                                )
                              }
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'name',
                                  event.target.value,
                                )
                              }
                              sx={{
                                width: '100%',
                                px: 0.7,
                                input: {
                                  textAlign: 'center',
                                  fontSize: '0.78rem',
                                },
                              }}
                            />
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <Autocomplete
                              options={jobOptions}
                              value={row.process}
                              onChange={(_, newValue) =>
                                handleWorkerChange(
                                  row.id,
                                  'process',
                                  newValue,
                                )
                              }
                              disableClearable
                              size="small"
                              autoHighlight
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  variant="standard"
                                  InputProps={{
                                    ...params.InputProps,
                                    disableUnderline: true,
                                  }}
                                  inputProps={{
                                    ...params.inputProps,
                                    className: `${
                                      params.inputProps?.className || ''
                                    } excel-input`,
                                    'data-worker-grid-input': 'true',
                                    'data-worker-row': index,
                                    'data-worker-column': 2,
                                  }}
                                  onKeyDown={(event) =>
                                    handleWorkerAutocompleteKeyDown(
                                      event,
                                      index,
                                      2,
                                      params.inputProps
                                        ?.onKeyDown,
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    handleWorkerGridKeyUp(
                                      event,
                                      index,
                                      2,
                                    )
                                  }
                                  sx={{
                                    '& input': {
                                      py: 1,
                                      textAlign: 'center',
                                      fontSize: '0.78rem',
                                    },
                                  }}
                                />
                              )}
                            />
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <InputBase
                              className="excel-input"
                              value={row.location}
                              inputProps={{
                                'data-worker-grid-input': 'true',
                                'data-worker-row': index,
                                'data-worker-column': 3,
                              }}
                              onKeyDown={(event) =>
                                handleWorkerGridKeyDown(
                                  event,
                                  index,
                                  3,
                                )
                              }
                              onKeyUp={(event) =>
                                handleWorkerGridKeyUp(
                                  event,
                                  index,
                                  3,
                                )
                              }
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'location',
                                  event.target.value,
                                )
                              }
                              placeholder="예: 101동 3층"
                              sx={{
                                width: '100%',
                                px: 0.8,
                                input: {
                                  textAlign: 'center',
                                  fontSize: '0.78rem',
                                },
                              }}
                            />
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <InputBase
                              className="excel-input"
                              value={row.workContent}
                              inputProps={{
                                'data-worker-grid-input': 'true',
                                'data-worker-row': index,
                                'data-worker-column': 4,
                              }}
                              onKeyDown={(event) =>
                                handleWorkerGridKeyDown(
                                  event,
                                  index,
                                  4,
                                )
                              }
                              onKeyUp={(event) =>
                                handleWorkerGridKeyUp(
                                  event,
                                  index,
                                  4,
                                )
                              }
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'workContent',
                                  event.target.value,
                                )
                              }
                              placeholder="작업내용을 입력하세요"
                              sx={{
                                width: '100%',
                                px: 1,
                                input: {
                                  fontSize: '0.78rem',
                                },
                              }}
                            />
                          </TableCell>

                          <TableCell align="center" sx={bodyCellStyle}>
                            <InputBase
                              className="excel-input"
                              type="number"
                              value={row.day}
                              inputProps={{
                                min: 0,
                                step: 0.5,
                                'data-worker-grid-input': 'true',
                                'data-worker-row': index,
                                'data-worker-column': 5,
                              }}
                              onKeyDown={(event) =>
                                handleWorkerGridKeyDown(
                                  event,
                                  index,
                                  5,
                                )
                              }
                              onKeyUp={(event) =>
                                handleWorkerGridKeyUp(
                                  event,
                                  index,
                                  5,
                                )
                              }
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'day',
                                  Number(event.target.value),
                                )
                              }
                              sx={{
                                width: '100%',
                                input: {
                                  textAlign: 'center',
                                  fontSize: '0.78rem',
                                },
                              }}
                            />
                          </TableCell>

                          <TableCell align="center" sx={{ p: 0 }}>
                            <InputBase
                              className="excel-input"
                              type="number"
                              value={row.night}
                              inputProps={{
                                min: 0,
                                step: 0.5,
                                'data-worker-grid-input': 'true',
                                'data-worker-row': index,
                                'data-worker-column': 6,
                              }}
                              onKeyDown={(event) =>
                                handleWorkerGridKeyDown(
                                  event,
                                  index,
                                  6,
                                )
                              }
                              onKeyUp={(event) =>
                                handleWorkerGridKeyUp(
                                  event,
                                  index,
                                  6,
                                )
                              }
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'night',
                                  Number(event.target.value),
                                )
                              }
                              sx={{
                                width: '100%',
                                input: {
                                  textAlign: 'center',
                                  fontSize: '0.78rem',
                                },
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>

                  <TableFooter>
                    <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                      <TableCell
                        colSpan={7}
                        align="center"
                        sx={{
                          py: 1.5,
                          fontWeight: 'bold',
                          color: '#334155',
                          borderRight: '1px solid #cbd5e1',
                        }}
                      >
                        합 계
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 'bold',
                          color: '#0284c7',
                          fontSize: '0.9rem',
                          borderRight: '1px solid #cbd5e1',
                        }}
                      >
                        {workerRows.reduce(
                          (sum, row) => sum + (Number(row.day) || 0),
                          0,
                        )}
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 'bold',
                          color: '#0284c7',
                          fontSize: '0.9rem',
                        }}
                      >
                        {workerRows.reduce(
                          (sum, row) => sum + (Number(row.night) || 0),
                          0,
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>
            </Paper>
          </Box>

          <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'center', gap: 1, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
            <Button variant="contained" size="small" onClick={handleSaveModal} sx={{ bgcolor: '#0284c7', px: 3, boxShadow: 'none' }}>저장</Button>
            <Button variant="outlined" size="small" onClick={handleCloseModal} sx={{ color: '#64748b', borderColor: '#cbd5e1', px: 3 }}>닫기</Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}
