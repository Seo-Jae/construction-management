import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; 
import { Box, Drawer, AppBar, Toolbar, List, Typography, Paper, ListItemButton, ListItemIcon, ListItemText, IconButton, Button, TextField, Divider, Modal, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableFooter, Checkbox, Autocomplete, InputBase } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import EngineeringIcon from '@mui/icons-material/Engineering';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExcelJS from 'exceljs';

// 새로 만든 파일 임포트
import { BUILDING_CONFIGS } from './config'; 
import BuildingGrid from './BuildingGrid';

const drawerWidth = 240;
const todayObj = new Date();
const currentYear = todayObj.getFullYear();
const currentMonth = todayObj.getMonth();
const currentDate = todayObj.getDate();
const todayMidnight = new Date(currentYear, currentMonth, currentDate);

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

const modalStyle = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '85vw', maxWidth: '1200px', height: '80vh',
  bgcolor: 'background.paper', boxShadow: 24, borderRadius: '8px',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerCellStyle = { borderRight: '1px solid #cbd5e1', fontWeight: 'bold', color: '#334155', py: 1 };
const bodyCellStyle = { borderRight: '1px solid #cbd5e1', p: 0 }; 

export default function Dashboard({ user, userProfile, onLogout }) {
  const [open, setOpen] = useState(true);
  const [currentView, setCurrentView] = useState('daily'); // 💡 화면 전환 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(''); 
  const [selectedDateDisplay, setSelectedDateDisplay] = useState(''); 

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayMidnight);

  const [savedData, setSavedData] = useState({});
  const [manualStatus, setManualStatus] = useState({});

  const [workerRows, setWorkerRows] = useState([]);
  const [taskRows, setTaskRows] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);

  const [workerFetchDate, setWorkerFetchDate] = useState('');
  const [taskFetchDate, setTaskFetchDate] = useState('');

  useEffect(() => {
    if (!userProfile?.project_name) return;
    const fetchReports = async () => {
      const { data, error } = await supabase.from('daily_reports').select('*').eq('project_name', userProfile.project_name);
      if (error) { console.error('데이터 불러오기 실패:', error); return; }
      const newData = {};
      const newStatus = {};
      data.forEach(row => {
        newData[row.date] = { workers: row.workers || [], tasks: row.tasks || [], todayTask: row.today_task || '', tomorrowTask: row.tomorrow_task || '' };
        if (row.status) newStatus[row.date] = row.status;
      });
      setSavedData(newData);
      setManualStatus(newStatus);
    };
    fetchReports();
  }, [userProfile]);

  const syncDataToDB = async (dateKey, dataOverrides = {}, statusOverride = null) => {
    if (!userProfile?.project_name || !user?.email) return;
    const currentData = { ...(savedData[dateKey] || {}), ...dataOverrides };
    const currentStatus = statusOverride !== null ? statusOverride : (manualStatus[dateKey] || 'open');
    await supabase.from('daily_reports').upsert({
      date: dateKey, project_name: userProfile.project_name, author_email: user.email,
      workers: currentData.workers || [], tasks: currentData.tasks || [],
      today_task: currentData.todayTask || '', tomorrow_task: currentData.tomorrowTask || '', status: currentStatus
    }, { onConflict: 'date, project_name' });
  };

  const toggleDrawer = () => setOpen(!open);
  const buildWeekCards = (baseDate, db) => {
    const startOfWeek = new Date(baseDate);
    startOfWeek.setDate(baseDate.getDate() - baseDate.getDay()); 
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + idx);
      const dateStr = formatYYMMDD(d);
      const dbEntry = db[dateStr] || {};
      const workersCount = dbEntry.workers ? dbEntry.workers.length : 0;
      return { date: dateStr, dayName: dayNames[idx], isToday: d.getTime() === todayMidnight.getTime(), workers: workersCount, todayTask: dbEntry.todayTask || '', tomorrowTask: dbEntry.tomorrowTask || '' };
    });
  };
  const weekDays = buildWeekCards(selectedWeekDate, savedData);
  const generateCalendarCells = (year, month) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    const totalCells = Math.ceil(cells.length / 7) * 7;
    while (cells.length < totalCells) cells.push(null);
    return cells;
  };
  const calendarCells = generateCalendarCells(viewYear, viewMonth);
  const isClosed = (dateStr) => {
    if (!dateStr) return false;
    if (manualStatus[dateStr] === 'open') return false;
    if (manualStatus[dateStr] === 'closed') return true;
    const parts = dateStr.split('.');
    const targetDate = new Date(2000 + parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return targetDate < todayMidnight;
  };

  const handleToggleDeadline = async (dateStr) => {
    const currentlyClosed = isClosed(dateStr);
    if (currentlyClosed && userProfile?.role !== '관리자') { alert('마감 반려는 최고 관리자만 가능합니다.'); return; }
    if (!currentlyClosed && !window.confirm(`[${dateStr}] 일보를 마감 처리하시겠습니까?`)) return;
    const newStatus = currentlyClosed ? 'open' : 'closed';
    setManualStatus(prev => ({ ...prev, [dateStr]: newStatus }));
    await syncDataToDB(dateStr, {}, newStatus);
  };

  const handleOpenModal = (day) => {
    setSelectedDateKey(day.date);
    setSelectedDateDisplay(day.date);
    setWorkerRows(savedData[day.date]?.workers || []);
    setTaskRows(savedData[day.date]?.tasks || []);
    setModalOpen(true);
  };
  const handleCloseModal = () => setModalOpen(false);
  const handleSaveModal = async () => {
    const overrides = { workers: workerRows, tasks: taskRows };
    setSavedData(prev => ({ ...prev, [selectedDateKey]: { ...(prev[selectedDateKey] || {}), ...overrides } }));
    await syncDataToDB(selectedDateKey, overrides);
    alert('안전하게 저장되었습니다!');
    handleCloseModal();
  };

  const handleAddWorker = () => setWorkerRows([...workerRows, { id: Date.now(), job: null, name: '', day: 1, night: 0 }]);
  const handleDeleteWorkers = () => { setWorkerRows(workerRows.filter(row => !selectedWorkers.includes(row.id))); setSelectedWorkers([]); };
  const handleWorkerChange = (id, field, value) => setWorkerRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  const handleAddTask = () => setTaskRows([...taskRows, { id: Date.now(), taskName: '', amount: '' }]);
  const handleDeleteTasks = () => { setTaskRows(taskRows.filter(row => !selectedTasks.includes(row.id))); setSelectedTasks([]); };
  const handleTaskChange = (id, field, value) => setTaskRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const inputs = Array.from(document.querySelectorAll('.excel-input')); const index = inputs.indexOf(e.target); setTimeout(() => { if (index > -1 && index < inputs.length - 1) inputs[index + 1].focus(); }, 50); } };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppBar position="absolute" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#1e293b' }}>
        <Toolbar sx={{ minHeight: '56px !important' }}>
          <IconButton edge="start" color="inherit" onClick={toggleDrawer} sx={{ marginRight: '36px' }}><MenuIcon /></IconButton>
          <Typography component="h1" variant="subtitle1" color="inherit" noWrap sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            🏗️ {userProfile?.project_name || '현장명 로딩중...'} - {currentView === 'daily' ? '공사일보 관리' : '공정 진척 관리'}
          </Typography>
          <Button color="inherit" onClick={onLogout} size="small">로그아웃</Button>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" open={open} sx={{ width: open ? drawerWidth : 72, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: open ? drawerWidth : 72, bgcolor: '#0f172a', color: 'white' } }}>
        <Toolbar />
        <List>
          <ListItemButton selected={currentView === 'daily'} onClick={() => setCurrentView('daily')}><ListItemIcon><EngineeringIcon sx={{color: 'white'}} /></ListItemIcon><ListItemText primary="공사일보 관리" /></ListItemButton>
          <ListItemButton selected={currentView === 'progress'} onClick={() => setCurrentView('progress')}><ListItemIcon><AssignmentIcon sx={{color: 'white'}} /></ListItemIcon><ListItemText primary="공정 진척 관리" /></ListItemButton>
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f1f5f9' }}>
        <Toolbar />
        <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
          {currentView === 'daily' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
              {/* 기존 일보 관리 화면 */}
              {weekDays.map((day) => (
                <Paper key={day.date} sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight="bold">{day.date} ({day.dayName})</Typography>
                  <Button onClick={() => handleOpenModal(day)} size="small">근로자 추가/수정</Button>
                  <Button onClick={() => handleToggleDeadline(day.date)} size="small">마감/취소</Button>
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, p: 2 }}>
              {/* 골구도 화면 */}
              {Object.entries(BUILDING_CONFIGS).map(([name, config]) => (
                <BuildingGrid key={name} buildingName={name} config={config} onCellClick={(b, f, u) => alert(`${b} ${f}층 ${u}호 클릭됨!`)} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      
      {/* 모달 */}
      <Modal open={modalOpen} onClose={handleCloseModal}>
        <Box sx={modalStyle}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2 }}>
            <Typography variant="h6">[{selectedDateDisplay}] 근로자 관리</Typography>
            <IconButton onClick={handleCloseModal}><CloseIcon /></IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableBody>
                        {workerRows.map((row, idx) => (
                            <TableRow key={row.id}>
                                <TableCell>{idx + 1}</TableCell>
                                <TableCell><InputBase value={row.name} onChange={(e) => handleWorkerChange(row.id, 'name', e.target.value)} /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
          </Box>
          <Box sx={{ p: 2 }}>
            <Button onClick={handleSaveModal} variant="contained">저장</Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}