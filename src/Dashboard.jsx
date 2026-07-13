import React, { useState, useEffect } from 'react';
import { Box, Drawer, AppBar, Toolbar, List, Typography, Paper, ListItemButton, ListItemIcon, ListItemText, IconButton, Button, Link, TextField, Divider, Modal, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableFooter, Checkbox, Autocomplete, InputBase, Select, MenuItem } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import EngineeringIcon from '@mui/icons-material/Engineering';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExcelJS from 'exceljs'; // 💡 엑셀 조작 라이브러리 (필수!)

const drawerWidth = 240;

// =========================================================
// 날짜 관련 유틸리티
// =========================================================
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
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(''); 
  const [selectedDateDisplay, setSelectedDateDisplay] = useState(''); 

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayMidnight);

  

  const [savedData, setSavedData] = useState(() => {
    const localData = localStorage.getItem('smart_builder_data');
    return localData ? JSON.parse(localData) : {};
  });
  
  const [manualStatus, setManualStatus] = useState(() => {
    const localStatus = localStorage.getItem('smart_builder_manual_status');
    return localStatus ? JSON.parse(localStatus) : {};
  });

  

  const [workerRows, setWorkerRows] = useState([]);
  const [taskRows, setTaskRows] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);

  const [workerFetchDate, setWorkerFetchDate] = useState('');
  const [taskFetchDate, setTaskFetchDate] = useState('');

  useEffect(() => {
    localStorage.setItem('smart_builder_data', JSON.stringify(savedData));
  }, [savedData]);

  useEffect(() => {
    localStorage.setItem('smart_builder_manual_status', JSON.stringify(manualStatus));
  }, [manualStatus]);

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
      
      let jobSummary = '';
      if (dbEntry.workers) {
        const jobCounts = {};
        dbEntry.workers.forEach(w => { if(w.job) jobCounts[w.job] = (jobCounts[w.job] || 0) + 1; });
        jobSummary = Object.entries(jobCounts).map(([j, c]) => `${j} ${c}명`).join(', ');
      }

      return {
        date: dateStr,
        dayName: dayNames[idx],
        isToday: d.getTime() === todayMidnight.getTime(),
        workers: workersCount,
        jobSummary: jobSummary,
        todayTask: dbEntry.todayTask || '',
        tomorrowTask: dbEntry.tomorrowTask || ''
      };
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

  const handlePrevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDayClick = (day) => {
    if (!day) return;
    const clickedDate = new Date(viewYear, viewMonth, day);
    setSelectedWeekDate(clickedDate);
  };

  const isClosed = (dateStr) => {
    if (!dateStr) return false;
    if (manualStatus[dateStr] === 'open') return false;
    if (manualStatus[dateStr] === 'closed') return true;

    const parts = dateStr.split('.');
    const targetDate = new Date(2000 + parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const now = new Date();
    
    if (targetDate < todayMidnight) return true;
    if (targetDate.getTime() === todayMidnight.getTime() && now.getHours() >= 10) return true;

    return false;
  };

  const handleToggleDeadline = (dateStr) => {
    const currentlyClosed = isClosed(dateStr);
    if (currentlyClosed && userProfile?.role !== '관리자') {
      alert('이미 마감된 일지입니다.\n마감 반려(취소)는 최고 관리자만 가능합니다.');
      return;
    }
    if (!currentlyClosed && !window.confirm(`[${dateStr}] 일보를 마감 처리하시겠습니까?`)) return;
    setManualStatus(prev => ({ ...prev, [dateStr]: currentlyClosed ? 'open' : 'closed' }));
  };

  // =========================================================
  // 💡 [핵심] 실제 엑셀 템플릿(양식) 다운로드 로직
  // =========================================================
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

      // 1. 기본 정보 채우기
      const parts = dateStr.split('.');
      const formattedDateForExcel = `20${parts[0]}년 ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일 ${dayObj.dayName}요일`;

      worksheet.getCell('C3').value = userProfile?.project_name || '현장명 미지정';
      worksheet.getCell('C4').value = userProfile?.company || '업체명 미지정';
      worksheet.getCell('C5').value = formattedDateForExcel;

      // 2. 근로자 데이터 기입 (40개 단위로 확장)
      workers.forEach((worker, index) => {
        if (index < 40) { // 1열: 40명 수용 (18~57행)
          const row = 18 + index; 
          worksheet.getCell(`B${row}`).value = worker.job || '';
          worksheet.getCell(`C${row}`).value = worker.name || '';
          worksheet.getCell(`D${row}`).value = worker.job || '';
        } else if (index < 80) { // 2열: 다음 40명 수용
          const row = 18 + (index - 40);
          worksheet.getCell(`H${row}`).value = worker.job || '';
          worksheet.getCell(`I${row}`).value = worker.name || '';
          worksheet.getCell(`J${row}`).value = worker.job || '';
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

  const handleOpenModal = (day) => {
    setSelectedDateKey(day.date);
    const statusText = isClosed(day.date) ? " (마감됨)" : "";
    setSelectedDateDisplay(`${day.date} (${day.dayName})${statusText}`);
    
    const parts = day.date.split('.');
    const targetDate = new Date(2000 + parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    targetDate.setDate(targetDate.getDate() - 1);
    const prevDayStr = formatYYYYMMDD(formatYYMMDD(targetDate));
    
    setWorkerFetchDate(prevDayStr);
    setTaskFetchDate(prevDayStr);

    if (savedData[day.date]) {
      setWorkerRows(savedData[day.date].workers || []);
      setTaskRows(savedData[day.date].tasks || []);
    } else {
      setWorkerRows([]);
      setTaskRows([]);
    }
    setModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedWorkers([]); setSelectedTasks([]);
  };

  const handleCardTaskChange = (date, field, value) => {
    if (isClosed(date)) return;
    setSavedData(prev => ({
      ...prev,
      [date]: { ...(prev[date] || { workers: [], tasks: [] }), [field]: value }
    }));
  };

  const handleSetNoTask = (dateKey) => {
    if (isClosed(dateKey)) return;
    if (!window.confirm(`[${dateKey}] 일자를 "작업없음" 처리하시겠습니까?`)) return;
    setSavedData(prev => ({
      ...prev,
      [dateKey]: { workers: [], tasks: [], todayTask: '작업없음', tomorrowTask: '작업없음' }
    }));
  };

  const handleFetchPreviousCardTasks = (currentDateKey) => {
    if (isClosed(currentDateKey)) return;
    const parts = currentDateKey.split('.');
    const curr = new Date(2000 + parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    curr.setDate(curr.getDate() - 1);
    const prevDateKey = formatYYMMDD(curr);

    const prevData = savedData[prevDateKey];
    const prevTodayTask = prevData?.todayTask || '';
    const prevTomorrowTask = prevData?.tomorrowTask || '';

    if (!prevTodayTask && !prevTomorrowTask) {
      alert(`${prevDateKey} 일자에 작성된 작업 텍스트가 없습니다.`);
      return;
    }
    
    setSavedData(prev => ({
      ...prev,
      [currentDateKey]: { ...(prev[currentDateKey] || { workers: [], tasks: [] }), todayTask: prevTodayTask, tomorrowTask: prevTomorrowTask }
    }));
  };

  const handleSaveModal = () => {
    const isWorkerValid = workerRows.every(row => row.job && row.name && row.name.trim() !== '' && row.day !== '' && row.day !== null);
    if (!isWorkerValid) {
      alert('근로자 목록의 [직종], [성명], [주간공수]는 필수 입력 항목입니다.');
      return;
    }

    setSavedData(prev => ({
      ...prev,
      [selectedDateKey]: { ...(prev[selectedDateKey] || {}), workers: workerRows, tasks: taskRows }
    }));

    alert('저장되었습니다!');
    handleCloseModal();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.defaultPrevented) return; 
      e.preventDefault(); 
      const inputs = Array.from(document.querySelectorAll('.excel-input'));
      const index = inputs.indexOf(e.target);
      setTimeout(() => { if (index > -1 && index < inputs.length - 1) inputs[index + 1].focus(); }, 50);
    }
  };

  const handleFetchWorkers = () => {
    const targetKey = formatYYMMDD(new Date(workerFetchDate));
    if (savedData[targetKey] && savedData[targetKey].workers && savedData[targetKey].workers.length > 0) {
      if (workerRows.length > 0 && !window.confirm('기존 목록에 추가하시겠습니까?\n(취소를 누르면 덮어씁니다.)')) {
        setWorkerRows(savedData[targetKey].workers.map(w => ({ ...w, id: Date.now() + Math.random() })));
        return;
      }
      setWorkerRows(prev => [...prev, ...savedData[targetKey].workers.map(w => ({ ...w, id: Date.now() + Math.random() }))]);
    } else alert(`${targetKey} 일자에 저장된 데이터가 없습니다.`);
  };
  const handleAddWorker = () => setWorkerRows([...workerRows, { id: Date.now(), job: null, name: '', day: 1, night: 0 }]); 
  const handleDeleteWorkers = () => { setWorkerRows(workerRows.filter(row => !selectedWorkers.includes(row.id))); setSelectedWorkers([]); };
  const handleSelectAllWorkers = (e) => e.target.checked ? setSelectedWorkers(workerRows.map(row => row.id)) : setSelectedWorkers([]);
  const handleSelectWorker = (id) => selectedWorkers.includes(id) ? setSelectedWorkers(selectedWorkers.filter(item => item !== id)) : setSelectedWorkers([...selectedWorkers, id]);
  const handleWorkerChange = (id, field, value) => setWorkerRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));

  const handleFetchTasks = () => {
    const targetKey = formatYYMMDD(new Date(taskFetchDate));
    if (savedData[targetKey] && savedData[targetKey].tasks && savedData[targetKey].tasks.length > 0) {
      if (taskRows.length > 0 && !window.confirm('기존 목록에 추가하시겠습니까?\n(취소를 누르면 덮어씁니다.)')) {
        setTaskRows(savedData[targetKey].tasks.map(t => ({ ...t, id: Date.now() + Math.random() })));
        return;
      }
      setTaskRows(prev => [...prev, ...savedData[targetKey].tasks.map(t => ({ ...t, id: Date.now() + Math.random() }))]);
    } else alert(`${targetKey} 일자에 저장된 데이터가 없습니다.`);
  };
  const handleAddTask = () => setTaskRows([...taskRows, { id: Date.now(), taskName: '', amount: '' }]);
  const handleDeleteTasks = () => { setTaskRows(taskRows.filter(row => !selectedTasks.includes(row.id))); setSelectedTasks([]); };
  const handleSelectAllTasks = (e) => e.target.checked ? setSelectedTasks(taskRows.map(row => row.id)) : setSelectedTasks([]);
  const handleSelectTask = (id) => selectedTasks.includes(id) ? setSelectedTasks(selectedTasks.filter(item => item !== id)) : setSelectedTasks([...selectedTasks, id]);
  const handleTaskChange = (id, field, value) => setTaskRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));

  const totalDayShift = workerRows.reduce((sum, row) => sum + (Number(row.day) || 0), 0);
  const totalNightShift = workerRows.reduce((sum, row) => sum + (Number(row.night) || 0), 0);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppBar position="absolute" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#1e293b' }}>
        <Toolbar sx={{ minHeight: '56px !important' }}>
          <IconButton edge="start" color="inherit" onClick={toggleDrawer} sx={{ marginRight: '36px' }}><MenuIcon /></IconButton>
          <Typography component="h1" variant="subtitle1" color="inherit" noWrap sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            🏗️ {userProfile?.project_name || '현장명 로딩중...'} - 작업일보 작성
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              접속자: {userProfile?.manager_name} ({userProfile?.role})
            </Typography>
            <Button color="inherit" onClick={onLogout} size="small" sx={{ border: '1px solid rgba(255,255,255,0.5)' }}>
              로그아웃
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer variant="permanent" open={open} sx={{
        width: open ? drawerWidth : 72, flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: open ? drawerWidth : 72, boxSizing: 'border-box', overflowX: 'hidden', transition: 'width 0.3s', bgcolor: '#0f172a', color: 'white' },
      }}>
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Box sx={{ overflow: 'auto' }}>
          <List component="nav">
            <ListItemButton selected sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}><ListItemIcon><EngineeringIcon sx={{ color: 'white' }} /></ListItemIcon><ListItemText primary="공사일보 관리" /></ListItemButton>
            <ListItemButton><ListItemIcon><InventoryIcon sx={{ color: '#94a3b8' }} /></ListItemIcon><ListItemText primary="자재 반입 현황" sx={{ color: '#94a3b8' }} /></ListItemButton>
            <ListItemButton><ListItemIcon><AssignmentIcon sx={{ color: '#94a3b8' }} /></ListItemIcon><ListItemText primary="공정표 및 결재" sx={{ color: '#94a3b8' }} /></ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f1f5f9' }}>
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Box sx={{ p: 2, flexGrow: 1, overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 2, height: '100%' }}>
            
            <Paper sx={{ p: 1.5, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
                <Typography variant="subtitle2" fontWeight="bold">기간 선택</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton size="small" onClick={handlePrevMonth} sx={{ p: 0 }}><ChevronLeftIcon fontSize="small" /></IconButton>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>{`${viewYear}.${String(viewMonth + 1).padStart(2, '0')}`}</Typography>
                  <IconButton size="small" onClick={handleNextMonth} sx={{ p: 0 }}><ChevronRightIcon fontSize="small" /></IconButton>
                </Box>
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', mb: 0.5 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                  <Typography key={day} variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: idx === 0 ? '#ef4444' : idx === 6 ? '#3b82f6' : '#64748b' }}>{day}</Typography>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
                {calendarCells.map((day, index) => {
                  const dayIdx = index % 7;
                  let isSelectedWeek = false;
                  let isTodayHighlight = false;
                  let dailyWorkers = 0;
                  
                  if (day) {
                    const cellDate = new Date(viewYear, viewMonth, day);
                    isTodayHighlight = cellDate.getTime() === todayMidnight.getTime();
                    
                    const startOfSel = new Date(selectedWeekDate);
                    startOfSel.setDate(selectedWeekDate.getDate() - selectedWeekDate.getDay());
                    const endOfSel = new Date(startOfSel);
                    endOfSel.setDate(startOfSel.getDate() + 6);
                    isSelectedWeek = cellDate >= startOfSel && cellDate <= endOfSel;

                    const dStr = formatYYMMDD(cellDate);
                    if (savedData[dStr] && savedData[dStr].workers) {
                      dailyWorkers = savedData[dStr].workers.length;
                    }
                  }

                  return (
                    <Box key={index} onClick={() => handleDayClick(day)} sx={{ 
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                      bgcolor: isSelectedWeek ? '#e0f2fe' : 'transparent', py: 0.5,
                      cursor: day ? 'pointer' : 'default',
                      '&:hover': { bgcolor: day && !isSelectedWeek ? '#f1f5f9' : (isSelectedWeek ? '#bae6fd' : 'transparent') },
                      borderTopLeftRadius: dayIdx === 0 ? '6px' : '0', borderBottomLeftRadius: dayIdx === 0 ? '6px' : '0',
                      borderTopRightRadius: dayIdx === 6 ? '6px' : '0', borderBottomRightRadius: dayIdx === 6 ? '6px' : '0',
                    }}>
                      {day && (
                        <>
                          <Box sx={{ 
                            width: 20, height: 20, borderRadius: '50%', 
                            bgcolor: isTodayHighlight ? '#ef4444' : 'transparent', color: isTodayHighlight ? 'white' : (dayIdx === 0 ? '#ef4444' : dayIdx === 6 ? '#3b82f6' : '#334155'),
                            lineHeight: '20px', fontSize: '0.7rem', fontWeight: isTodayHighlight ? 'bold' : 'normal'
                          }}>{day}</Box>
                          <Typography variant="caption" sx={{ color: dailyWorkers > 0 ? '#0ea5e9' : '#94a3b8', fontSize: '0.6rem', fontWeight: 'bold', mt: 0.2 }}>
                            {dailyWorkers > 0 ? `${dailyWorkers}명` : ''}
                          </Typography>
                        </>
                      )}
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ mt: 'auto', textAlign: 'center' }}><Button variant="contained" color="success" size="small" fullWidth sx={{ py: 0.8, fontSize: '0.8rem', fontWeight: 'bold' }}>출력일보 주별 다운로드</Button></Box>
            </Paper>

            {weekDays.map((day) => {
              const closedStatus = isClosed(day.date); 

              return (
                <Paper key={day.date} sx={{ p: 1.5, display: 'flex', flexDirection: 'column', borderTop: day.isToday ? '4px solid #ef4444' : '4px solid transparent', bgcolor: closedStatus ? '#f8fafc' : 'white', overflowY: 'auto' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ color: closedStatus ? '#64748b' : 'inherit' }}>{day.date} ({day.dayName}) </Typography>
                      {closedStatus && <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', bgcolor: '#fee2e2', px: 0.5, py: 0.1, borderRadius: 1 }}>마감됨</Typography>}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Button onClick={() => handleOpenModal(day)} variant="outlined" size="small" sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.65rem', color: '#0ea5e9', borderColor: '#0ea5e9', fontWeight: 'bold' }}>
                        근로자 추가/수정
                      </Button>
                      <Button onClick={() => handleDownloadExcel(day)} variant="contained" color="success" size="small" sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}>XLS</Button>
                      
                      <Button 
                        onClick={() => handleToggleDeadline(day.date)} 
                        disabled={closedStatus && userProfile?.role !== '관리자'}
                        variant="outlined" 
                        size="small" 
                        sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.65rem', fontWeight: 'bold', 
                              color: closedStatus ? '#ef4444' : '#64748b', borderColor: closedStatus ? '#fca5a5' : '#cbd5e1',
                              '&:disabled': { bgcolor: '#f1f5f9', color: '#94a3b8' } 
                        }}>
                        {closedStatus ? '마감 취소' : '마감 처리'}
                      </Button>
                    </Box>
                  </Box>
                  <Divider sx={{ mb: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption" fontWeight="bold" sx={{ color: 'white', bgcolor: closedStatus ? '#94a3b8' : '#0f766e', px: 0.5, py: 0.2, borderRadius: 1 }}>건축</Typography>
                      <Typography variant="caption" fontWeight="bold" sx={{ color: closedStatus ? '#64748b' : 'inherit' }}>내장공사</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                        {userProfile?.company || '소속없음'} · {userProfile?.manager_name || '담당자없음'}
                        </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ bgcolor: closedStatus ? '#94a3b8' : '#334155', color: 'white', px: 0.5, py: 0.2, borderRadius: 1, fontSize: '0.65rem' }}>출역일보</Typography>
                  </Box>
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption" fontWeight="bold" sx={{ color: closedStatus ? '#64748b' : '#0f766e' }}>
                        투입 인원 (총원 {day.workers}명{day.jobSummary ? ` - ${day.jobSummary}` : ''})
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem', color: closedStatus ? '#94a3b8' : 'inherit' }}>금일 작업</Typography>
                  <TextField disabled={closedStatus} multiline rows={2} fullWidth size="small" value={day.todayTask} onChange={(e) => handleCardTaskChange(day.date, 'todayTask', e.target.value)} sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.75rem', p: 0.8, bgcolor: closedStatus ? '#f1f5f9' : 'white' } }} />
                  
                  <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem', color: closedStatus ? '#94a3b8' : 'inherit' }}>명일 작업</Typography>
                  <TextField disabled={closedStatus} multiline rows={1} fullWidth size="small" value={day.tomorrowTask} onChange={(e) => handleCardTaskChange(day.date, 'tomorrowTask', e.target.value)} sx={{ mb: 1.5, '& .MuiInputBase-root': { fontSize: '0.75rem', p: 0.8, bgcolor: closedStatus ? '#f1f5f9' : 'white' } }} />
                  
                  <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'center', gap: 1, pt: 1 }}>
                    {!closedStatus && (
                      <>
                        <Button onClick={() => handleSetNoTask(day.date)} variant="contained" color="error" size="small" sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>작업없음</Button>
                        <Button onClick={() => handleFetchPreviousCardTasks(day.date)} variant="contained" sx={{ bgcolor: '#475569', '&:hover': { bgcolor: '#334155' }, fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }} size="small">이전_작업_가져오기</Button>
                      </>
                    )}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Box>

        <Modal open={modalOpen} onClose={handleCloseModal}>
          <Box sx={modalStyle}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="subtitle1" fontWeight="bold" color="#334155">내장공사 / [{selectedDateDisplay}]</Typography>
              <IconButton onClick={handleCloseModal} size="small"><CloseIcon /></IconButton>
            </Box>

            <Box sx={{ flexGrow: 1, display: 'flex', p: 2, gap: 2, overflow: 'hidden', bgcolor: '#f1f5f9' }}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold">근로자</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <TextField size="small" type="date" value={workerFetchDate} onChange={(e) => setWorkerFetchDate(e.target.value)} sx={{ '& .MuiInputBase-root': { fontSize: '0.75rem', py: 0.2 } }} />
                    <Button variant="contained" size="small" onClick={handleFetchWorkers} sx={{ bgcolor: '#0284c7', fontSize: '0.7rem', boxShadow: 'none' }}>가져오기</Button>
                    <Button variant="contained" size="small" onClick={handleAddWorker} sx={{ bgcolor: '#475569', fontSize: '0.7rem', boxShadow: 'none' }}>추가</Button>
                    <Button variant="contained" size="small" onClick={handleDeleteWorkers} sx={{ bgcolor: '#ef4444', fontSize: '0.7rem', boxShadow: 'none' }}>삭제</Button>
                  </Box>
                </Box>
                
                <TableContainer sx={{ flexGrow: 1, border: '1px solid #cbd5e1', borderRadius: '4px', bgcolor: 'white' }}>
                  <Table stickyHeader size="small" sx={{ minWidth: 400 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell padding="checkbox" sx={{ borderRight: '1px solid #cbd5e1' }}><Checkbox size="small" onChange={handleSelectAllWorkers} checked={workerRows.length > 0 && selectedWorkers.length === workerRows.length} indeterminate={selectedWorkers.length > 0 && selectedWorkers.length < workerRows.length} /></TableCell>
                        <TableCell align="center" sx={{ ...headerCellStyle, width: '40px' }}>No.</TableCell>
                        <TableCell align="center" sx={{ ...headerCellStyle, width: '120px' }}>직종</TableCell>
                        <TableCell align="center" sx={headerCellStyle}>성명</TableCell>
                        <TableCell align="center" sx={{ ...headerCellStyle, width: '60px' }}>주간</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: '#334155', py: 1, width: '60px' }}>야간</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {workerRows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center" sx={{ py: 10, color: 'text.secondary', borderBottom: 'none' }}>데이터가 존재하지 않습니다.</TableCell></TableRow>
                      ) : (
                        workerRows.map((row, idx) => (
                          <TableRow hover key={row.id}>
                            <TableCell padding="checkbox" sx={{ borderRight: '1px solid #cbd5e1' }}><Checkbox size="small" checked={selectedWorkers.includes(row.id)} onChange={() => handleSelectWorker(row.id)} /></TableCell>
                            <TableCell align="center" sx={{ borderRight: '1px solid #cbd5e1', py: 0.5, color: '#334155' }}>{idx + 1}</TableCell>
                            <TableCell align="center" sx={bodyCellStyle}>
                              <Autocomplete options={jobOptions} value={row.job} onChange={(e, newValue) => handleWorkerChange(row.id, 'job', newValue)} disableClearable size="small" autoHighlight renderInput={(params) => (<TextField {...params} variant="standard" InputProps={{ ...params.InputProps, disableUnderline: true }} inputProps={{ ...params.inputProps, className: `${params.inputProps?.className || ''} excel-input` }} onKeyDown={(e) => { if (params.inputProps?.onKeyDown) params.inputProps.onKeyDown(e); handleKeyDown(e); }} sx={{ '& input': { textAlign: 'center', fontSize: '0.8rem', py: 1 } }} />)} />
                            </TableCell>
                            <TableCell align="center" sx={bodyCellStyle}><InputBase className="excel-input" value={row.name} onKeyDown={handleKeyDown} onChange={(e) => handleWorkerChange(row.id, 'name', e.target.value)} sx={{ width: '100%', input: { textAlign: 'center', fontSize: '0.8rem' } }} /></TableCell>
                            <TableCell align="center" sx={bodyCellStyle}><InputBase className="excel-input" type="number" value={row.day} onKeyDown={handleKeyDown} onChange={(e) => handleWorkerChange(row.id, 'day', Number(e.target.value))} sx={{ width: '100%', input: { textAlign: 'center', fontSize: '0.8rem' } }} /></TableCell>
                            <TableCell align="center" sx={{ p: 0 }}><InputBase className="excel-input" type="number" value={row.night} onKeyDown={handleKeyDown} onChange={(e) => handleWorkerChange(row.id, 'night', Number(e.target.value))} sx={{ width: '100%', input: { textAlign: 'center', fontSize: '0.8rem' } }} /></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                        <TableCell colSpan={4} align="center" sx={{ borderRight: '1px solid #cbd5e1', fontWeight: 'bold', py: 1.5, color: '#334155' }}>합 계</TableCell>
                        <TableCell align="center" sx={{ borderRight: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0284c7', fontSize: '0.9rem' }}>{workerRows.reduce((sum, row) => sum + (Number(row.day) || 0), 0)}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: '#0284c7', fontSize: '0.9rem' }}>{workerRows.reduce((sum, row) => sum + (Number(row.night) || 0), 0)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold">주요 작업</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <TextField size="small" type="date" value={taskFetchDate} onChange={(e) => setTaskFetchDate(e.target.value)} sx={{ '& .MuiInputBase-root': { fontSize: '0.75rem', py: 0.2 } }} />
                    <Button variant="contained" size="small" onClick={handleFetchTasks} sx={{ bgcolor: '#0284c7', fontSize: '0.7rem', boxShadow: 'none' }}>가져오기</Button>
                    <Button variant="contained" size="small" onClick={handleAddTask} sx={{ bgcolor: '#475569', fontSize: '0.7rem', boxShadow: 'none' }}>추가</Button>
                    <Button variant="contained" size="small" onClick={handleDeleteTasks} sx={{ bgcolor: '#ef4444', fontSize: '0.7rem', boxShadow: 'none' }}>삭제</Button>
                  </Box>
                </Box>
                <TableContainer sx={{ flexGrow: 1, border: '1px solid #cbd5e1', borderRadius: '4px', bgcolor: 'white' }}>
                  <Table stickyHeader size="small" sx={{ minWidth: 400 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell padding="checkbox" sx={{ borderRight: '1px solid #cbd5e1' }}><Checkbox size="small" onChange={handleSelectAllTasks} checked={taskRows.length > 0 && selectedTasks.length === taskRows.length} indeterminate={selectedTasks.length > 0 && selectedTasks.length < taskRows.length} /></TableCell>
                        <TableCell align="center" sx={{ ...headerCellStyle, width: '40px' }}>No.</TableCell>
                        <TableCell align="center" sx={headerCellStyle}>주요 작업명</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: '#334155', py: 1, width: '80px' }}>수량</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {taskRows.length === 0 ? (
                        <TableRow><TableCell colSpan={4} align="center" sx={{ py: 10, color: 'text.secondary', borderBottom: 'none' }}>데이터가 존재하지 않습니다.</TableCell></TableRow>
                      ) : (
                        taskRows.map((row, idx) => (
                          <TableRow hover key={row.id}>
                            <TableCell padding="checkbox" sx={{ borderRight: '1px solid #cbd5e1' }}><Checkbox size="small" checked={selectedTasks.includes(row.id)} onChange={() => handleSelectTask(row.id)} /></TableCell>
                            <TableCell align="center" sx={{ borderRight: '1px solid #cbd5e1', py: 0.5, color: '#334155' }}>{idx + 1}</TableCell>
                            <TableCell align="center" sx={bodyCellStyle}><InputBase className="excel-input" value={row.taskName} onKeyDown={handleKeyDown} onChange={(e) => handleTaskChange(row.id, 'taskName', e.target.value)} sx={{ width: '100%', px: 1, input: { fontSize: '0.8rem' } }} /></TableCell>
                            <TableCell align="center" sx={{ p: 0 }}><InputBase className="excel-input" value={row.amount} onKeyDown={handleKeyDown} onChange={(e) => handleTaskChange(row.id, 'amount', e.target.value)} sx={{ width: '100%', input: { textAlign: 'center', fontSize: '0.8rem' } }} /></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
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
    </Box>
  );
}