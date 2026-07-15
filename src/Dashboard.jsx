import React, { useEffect, useState } from 'react';
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
import DailyReport from './page/DailyReport.jsx';
import ProgressInput from './page/ProgressInput.jsx';
import MultiProcessProgress from './page/MultiProcessProgress.jsx';
import CompletionSummary from './page/CompletionSummary.jsx';
import WeeklyReport from './page/WeeklyReport.jsx';
import ProposalReport from './page/ProposalReport.jsx';
import AdminDashboard from './page/AdminDashboard.jsx';

const drawerWidth = 240;
const SUPABASE_PAGE_SIZE = 1000;
const PROGRESS_WRITE_CHUNK_SIZE = 500;

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

const processOptions = ['바닥먹', '허리먹', '단열', '합지', '경량골조', '경량석고', '합지석고', '세대천정', '1차몰딩', '2차몰딩', '1차 걸레받이', '2차 걸레받이'];

const modalStyle = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '95vw', maxWidth: '1600px', height: '82vh',
  bgcolor: 'background.paper', boxShadow: 24, borderRadius: '8px',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerCellStyle = { borderRight: '1px solid #cbd5e1', fontWeight: 'bold', color: '#334155', py: 1 };
const bodyCellStyle = { borderRight: '1px solid #cbd5e1', p: 0 }; 

const viewTitles = {
  'admin-dashboard': '욱림건설 전체 현장 Dashboard',
  daily: '공사일보관리',
  'progress-input': '공종별 현황 입력',
  'progress-multi': '다중 공종 진척 현황',
  'progress-weekly': '주별 완료 집계',
  'progress-monthly': '월별 완료 집계',
  'report-weekly': '주간 업무 보고',
  'report-approval': '품의 보고',
  'report-outsourcing-approval': '외주 품의 보고',
  'report-accident': '사고 경위 보고',
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

  const [selectedProjectName, setSelectedProjectName] = useState('');
  const activeProjectName = isManagementRole
    ? selectedProjectName
    : userProfile?.project_name || '';

  const activeUserProfile = {
    ...(userProfile || {}),
    role: userRole,
    project_name: activeProjectName,
  };

  /*
    한국시간 기준 시계입니다.
    브라우저를 계속 열어둬도 자정과 오전 10시가 지나면
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

  const [currentView, setCurrentView] = useState(() =>
    isManagementRole ? 'admin-dashboard' : 'daily',
  );

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
    if (isManagementRole) {
      setCurrentView('admin-dashboard');
      setSelectedProjectName('');
      return;
    }

    setSelectedProjectName(userProfile?.project_name || '');
    setCurrentView('daily');
  }, [isManagementRole, userProfile?.project_name]);

  const handleOpenAdminProject = (projectName) => {
    setSelectedProjectName(projectName);
    setCurrentView('daily');
  };

  // 💡 공정이 변경될 때마다 화면에 선택되어 있던 세대와 팝업창을 즉시 지워줍니다.
  useEffect(() => {
    setSelectedCells(new Set());
  }, [selectedProcess]);

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
      마감 취소 처리 원칙

      1. 기존 daily_reports 행이 있으면 status만 변경합니다.
      2. 빈 상태에서 실수로 마감한 날짜처럼 수정할 행이 없어도
         open 상태로 간주하고 화면에서 마감 취소가 가능하도록 처리합니다.
      3. 마감 처리(closed)는 행이 없으면 기존처럼 빈 일보 행을 생성합니다.
      4. select() 결과 개수로 성공/실패를 판단하지 않습니다.
         Supabase RLS 정책에 따라 update는 성공했지만 반환 행이 비어 있을 수 있습니다.
    */
    const { error } = await supabase
      .from('daily_reports')
      .update({
        status: newStatus,
      })
      .eq('date', dateKey)
      .eq('project_name', activeProjectName);

    if (error) {
      throw error;
    }

    if (newStatus === 'closed') {
      return syncDataToDB(dateKey, {}, newStatus);
    }

    /*
      newStatus === 'open'
      수정할 행이 없었던 경우에도 오류가 아닙니다.
      행이 없으면 다음 조회 때 기본값이 open으로 처리되기 때문입니다.
    */
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

    // 최고관리자가 취소한 open 상태를 자동 마감보다 우선합니다.
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

    // 한국시간 기준 오늘은 오전 10시부터 자동 마감입니다.
    if (targetTime === todayTime && koreaNow.hour >= 10) {
      return true;
    }

    return false;
  };
  const handleToggleDeadline = async (dateStr) => {
    const currentlyClosed = isClosed(dateStr);

    if (currentlyClosed && !isSuperAdmin) {
      alert(
        `마감 취소는 최고관리자만 가능합니다.\n\n현재 인식된 권한: ${userRole}`,
      );
      return;
    }

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
  
  const handleDownloadExcel = async (dayObj) => {
    const dateStr = dayObj.date;
    const workers = savedData[dateStr]?.workers || [];

    if (workers.length === 0) {
      alert(`[${dateStr}] 일자에 등록된 인원이 없습니다.`);
      return;
    }

    try {
      const response = await fetch('/templates/출력일보.xlsx');
      const arrayBuffer = await response.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0]; 

      const parts = dateStr.split('.');
      const formattedDateForExcel = `20${parts[0]}년 ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일 ${dayObj.dayName}요일`;

      worksheet.getCell('C3').value =
        activeProjectName || '현장명 미지정';
      worksheet.getCell('C4').value = '(주)욱림건설';
      worksheet.getCell('C5').value = formattedDateForExcel;

      /*
        전일누계 계산
        - 선택한 출력일보다 이전 날짜에 저장된 모든 공사일보를 합산합니다.
        - 현재 일자의 금일출력(C/I열)은 기존 엑셀 양식의 수식을 그대로 사용합니다.
        - 총누계(F/L열)는 금일출력 + 전일누계 수식으로 설정합니다.
      */
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

      const selectedDateTime = parseReportDateKey(dateStr);
      const previousJobCounts = {};

      Object.entries(savedData).forEach(([reportDateKey, reportData]) => {
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
      });

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

      workbook.calcProperties.fullCalcOnLoad = true;
      workbook.calcProperties.forceFullCalc = true;
      workbook.calcProperties.calcMode = 'auto';

      workers.forEach((worker, index) => {
        if (index < 40) {
          const row = 18 + index;

          worksheet.getCell(`B${row}`).value = worker.job || '';
          worksheet.getCell(`C${row}`).value = worker.name || '';
          worksheet.getCell(`D${row}`).value =
            worker.process || worker.job || '';
          worksheet.getCell(`E${row}`).value = worker.location || '';
          worksheet.getCell(`F${row}`).value =
            worker.workContent || worker.work_content || '';
        } else if (index < 80) {
          const row = 18 + (index - 40);

          worksheet.getCell(`H${row}`).value = worker.job || '';
          worksheet.getCell(`I${row}`).value = worker.name || '';
          worksheet.getCell(`J${row}`).value =
            worker.process || worker.job || '';

          /*
            오른쪽 표는 H=구분, I=성명, J=공정이므로
            위치는 K열, 작업내용은 L열에 입력합니다.
          */
          worksheet.getCell(`K${row}`).value = worker.location || '';
          worksheet.getCell(`L${row}`).value =
            worker.workContent || worker.work_content || '';
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `출력일보_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error(error);
      alert('양식 파일을 불러오지 못했습니다. templates 폴더를 확인해주세요.');
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
  const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const inputs = Array.from(document.querySelectorAll('.excel-input')); const index = inputs.indexOf(e.target); setTimeout(() => { if (index > -1 && index < inputs.length - 1) inputs[index + 1].focus(); }, 50); } };
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

  // 공정 진척 관리: 층수 클릭 시 같은 실제 세대를 중복 없이 선택합니다.
  const handleFloorClick = (buildingName, floor) => {
    const config = buildingConfigs[buildingName];
    if (!config) return;

    const validCellKeys = getFloorCellKeys(
      buildingName,
      config,
      floor,
    );

    setSelectedCells((prev) => {
      const next = new Set(prev);
      const allSelected =
        validCellKeys.length > 0 &&
        validCellKeys.every((key) => next.has(key));

      validCellKeys.forEach((key) => {
        if (allSelected) next.delete(key);
        else next.add(key);
      });

      return next;
    });
  };

  const handleGridCellClick = (cellKey) => {
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

    const selectedCellKeys = Array.from(selectedCells);

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
        alert('작업전으로 되돌렸습니다.');
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
      alert(
        `${selectedCellKeys.length.toLocaleString()}세대가 저장되었습니다.`,
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
            {currentView === 'admin-dashboard'
              ? '욱림건설'
              : activeProjectName || '현장을 선택해주세요'}{' '}
            - {viewTitles[currentView] || '현장 관리'}
          </Typography>

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
          onViewChange={setCurrentView}
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

        <Box sx={{ p: 2, flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
          {currentView === 'admin-dashboard' && isManagementRole && (
            <AdminDashboard
              processOptions={processOptions}
              onOpenProject={handleOpenAdminProject}
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
              handleToggleDeadline={handleToggleDeadline}
              handleSetNoTask={handleSetNoTask}
              todayMidnight={todayMidnight}
              formatYYMMDD={formatYYMMDD}
              userProfile={activeUserProfile}
              canCancelDeadline={isSuperAdmin}
            />
          )}

          {currentView === 'progress-input' && activeProjectName && (
            <ProgressInput
              selectedCells={selectedCells}
              actionName={actionName}
              progressDate={progressDate}
              setProgressDate={setProgressDate}
              handleSaveProgress={handleSaveProgress}
              setSelectedCells={setSelectedCells}
              selectedStatusAction={selectedStatusAction}
              setSelectedStatusAction={setSelectedStatusAction}
              completedUnits={completedUnits}
              totalUnits={totalUnits}
              progressPercentage={progressPercentage}
              setSelectedProcess={setSelectedProcess}
              selectedProcess={selectedProcess}
              processOptions={processOptions}
              buildingConfigs={buildingConfigs}
              unitProgressData={unitProgressData}
              handleGridCellClick={handleGridCellClick}
              handleFloorClick={handleFloorClick}
            />
          )}

          {currentView === 'progress-multi' && activeProjectName && (
            <MultiProcessProgress
              projectName={activeProjectName || ''}
              processOptions={processOptions}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'progress-monthly' && activeProjectName && (
            <CompletionSummary
              mode="monthly"
              projectName={activeProjectName || ''}
              processOptions={processOptions}
              buildingConfigs={buildingConfigs}
            />
          )}

          {currentView === 'progress-weekly' && activeProjectName && (
            <CompletionSummary
              mode="weekly"
              projectName={activeProjectName || ''}
              processOptions={processOptions}
              buildingConfigs={buildingConfigs}
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
            currentView !== 'admin-dashboard' &&
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
                <Typography fontWeight={900} color="#334155">
                  현장을 먼저 선택해주세요.
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCurrentView('admin-dashboard')}
                >
                  Dashboard로 이동
                </Button>
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
                <Typography variant="subtitle2" fontWeight="bold">
                  근로자
                </Typography>

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
                                  }}
                                  onKeyDown={(event) => {
                                    params.inputProps?.onKeyDown?.(event);
                                    handleKeyDown(event);
                                  }}
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
                              onKeyDown={handleKeyDown}
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
                                  }}
                                  onKeyDown={(event) => {
                                    params.inputProps?.onKeyDown?.(event);
                                    handleKeyDown(event);
                                  }}
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
                              onKeyDown={handleKeyDown}
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
                              onKeyDown={handleKeyDown}
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
                              onKeyDown={handleKeyDown}
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'day',
                                  Number(event.target.value),
                                )
                              }
                              inputProps={{ min: 0, step: 0.5 }}
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
                              onKeyDown={handleKeyDown}
                              onChange={(event) =>
                                handleWorkerChange(
                                  row.id,
                                  'night',
                                  Number(event.target.value),
                                )
                              }
                              inputProps={{ min: 0, step: 0.5 }}
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
