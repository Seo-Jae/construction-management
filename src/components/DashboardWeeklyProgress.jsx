import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, IconButton, Paper, Typography } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MainProcessSettingsDialog from './MainProcessSettingsDialog.jsx';
import { getDashboardReportPeriod } from '../utils/dashboardReportTasks.js';
import { normalizeWorkforceDate } from '../utils/workforceSummary.js';
import { supabase } from '../supabaseClient';

const colors = ['#14b8a6', '#4388ff', '#f59e0b', '#a855f7', '#ef4444', '#64748b', '#84cc16', '#ec4899', '#06b6d4', '#92400e', '#6366f1'];
export default function DashboardWeeklyProgress({ projectName, userId, names, canView }) {
  const preferenceKey = `main-weekly-processes:${userId}:${projectName}`;
  const [selected, setSelected] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(preferenceKey)); return Array.isArray(saved) ? saved : Array.isArray(saved?.selected) ? saved.selected : null; } catch { return null; }
  });
  const [axisStep, setAxisStep] = useState(() => {
    try { const step = JSON.parse(localStorage.getItem(preferenceKey))?.axisStep; return Number.isSafeInteger(step) && step > 0 && Number.isSafeInteger(step * 5) ? step : 10; } catch { return 10; }
  });
  const [settings, setSettings] = useState(false);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [activeDay, setActiveDay] = useState(null);
  const today = getDashboardReportPeriod().today;
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7 + offset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * 86400000).toISOString().slice(0, 10));
  useEffect(() => { setActiveDay(null); }, [projectName, offset, today, selected, axisStep, refresh]);
  useEffect(() => {
    if (!canView || !projectName) return;
    let active = true;
    const load = async () => {
      try {
        const result = [];
        for (let start = 0; ; start += 500) {
          const { data, error: queryError } = await supabase.from('unit_progress').select('building,unit,process_type,completion_date')
            .eq('project_name', projectName).eq('status', '작업완료').order('building').order('unit').order('process_type').range(start, start + 499);
          if (!active) return;
          if (queryError) throw queryError;
          result.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        setRows(result); setError(false);
      } catch { if (active) setError(true); }
    };
    load();
    return () => { active = false; };
  }, [projectName, canView, refresh]);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, []);
  const effectiveSelected = selected ?? names.slice(0, 6);
  const visible = names.filter((name) => effectiveSelected.includes(name));
  const axisMaximum = axisStep * 5;
  const series = visible.map((name) => ({ name, color: colors[names.indexOf(name) % colors.length], values: dates.map((date) => new Set((rows || []).filter((row) => row.process_type === name && normalizeWorkforceDate(row.completion_date) === date && date <= today).map((row) => `${row.building}::${row.unit}`)).size) }));
  const x = (index) => 35 + index * 37;
  const y = (value) => 180 - Math.min(axisMaximum, value) / axisMaximum * 150;
  return <Paper variant="outlined" className="main-weekly-progress">
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
      <TrendingUpOutlinedIcon sx={{ fontSize: 20, color: '#00897b' }} />
      <Typography component="h2" sx={{ flex: 1, fontSize: 15, fontWeight: 700 }}>주요공정 현황</Typography>
      <IconButton size="small" aria-label="주요공정 현황 범례 설정" disabled={!canView} onClick={() => setSettings(true)}><SettingsOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
    </Box>
    {!canView ? <Typography sx={{ py: 2, fontSize: 12 }}>공정 현황 조회 권한이 없습니다.</Typography> : error ? <Alert severity="error">공정 현황을 불러오지 못했습니다.</Alert> : !rows ? <CircularProgress size={24} sx={{ m: 2 }} /> : <>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', maxHeight: 60, overflowY: 'auto', mt: 1 }}>{series.map((item) => <Typography key={item.name} sx={{ fontSize: 11 }}><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: item.color, mr: 0.5 }} />{item.name}</Typography>)}</Box>
      {!visible.length && <Typography sx={{ fontSize: 12, mt: 1 }}>톱니바퀴에서 표시할 공정을 선택하세요.</Typography>}
      <Box onPointerLeave={() => setActiveDay(null)} sx={{ position: 'relative', flex: 1, minHeight: 120, display: 'flex', alignItems: 'center' }}>
        <svg viewBox="0 0 282 210" width="100%" style={{ maxHeight: 220 }} role="group" aria-label={`월요일부터 일요일까지 공정별 완료 세대 수, 세로축 0부터 ${axisMaximum}세대. 마우스 또는 탭 키로 날짜별 수량을 확인하세요.`}>
          {activeDay !== null && <rect x={x(activeDay) - 17} y="22" width="34" height="164" rx="5" fill="#eff6ff" pointerEvents="none" />}
          {Array.from({ length: 6 }, (_, index) => index * axisStep).map((value) => <g key={value}><line x1="28" x2="270" y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x="23" y={y(value) + 3} textAnchor="end" fontSize="10" fill="#64748b">{value}</text></g>)}
          {['월', '화', '수', '목', '금', '토', '일'].map((day, index) => <text key={day} x={x(index)} y="200" textAnchor="middle" fontSize="11" fontWeight={activeDay === index ? 700 : 400} fill={activeDay === index ? '#1d4ed8' : '#64748b'}>{day}</text>)}
          {series.map((item) => <g key={item.name}><polyline points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2" />{item.values.map((value, index) => <g key={index}>
            {activeDay === index && <circle cx={x(index)} cy={y(value)} r="10" fill={item.color} opacity="0.2" />}
            <circle cx={x(index)} cy={y(value)} r={activeDay === index ? 5 : 3} fill={item.color} stroke={activeDay === index ? '#fff' : 'none'} strokeWidth="1.5" />
          </g>)}</g>)}
          {visible.length > 0 && dates.map((date, index) => <rect key={date} x={x(index) - 18} y="18" width="37" height="188" fill="transparent"
            tabIndex={0} role="button" style={{ cursor: 'pointer' }}
            aria-label={`${date}: ${date > today ? '집계 전' : series.map(item => `${item.name} ${item.values[index]}세대`).join(', ')}`}
            onPointerEnter={() => setActiveDay(index)} onPointerMove={() => setActiveDay(index)} onClick={() => setActiveDay(index)}
            onFocus={() => setActiveDay(index)} onBlur={() => setActiveDay(null)}
            onKeyDown={event => { if (event.key === 'Escape') setActiveDay(null); }} />)}
        </svg>
        {activeDay !== null && visible.length > 0 && <Box role="tooltip" sx={{ position: 'absolute', top: 0,
          ...(activeDay < 3 ? { right: 0 } : { left: 0 }), zIndex: 2, width: 220, maxWidth: '90%',
          maxHeight: '75%', overflowY: 'auto', bgcolor: '#0f172a', color: '#fff', borderRadius: 1, p: 1.25,
          boxShadow: 3 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.75 }}>{dates[activeDay]} ({['월', '화', '수', '목', '금', '토', '일'][activeDay]})</Typography>
          {series.map(item => <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
            <Box sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', bgcolor: item.color }} />
            <Typography sx={{ fontSize: 12, flex: 1, overflowWrap: 'anywhere' }}>{item.name}</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{dates[activeDay] > today ? '집계 전' : `${item.values[activeDay]}세대`}</Typography>
          </Box>)}
        </Box>}
      </Box>
      {series.some((item) => item.values.some((value) => value > axisMaximum)) && <Typography sx={{ fontSize: 11, color: '#b45309' }}>{axisMaximum}세대 초과 값은 상단에 표시됩니다.</Typography>}
    </>}
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconButton aria-label="이전 주" onClick={() => setOffset(offset - 1)}><ChevronLeftIcon /></IconButton><Typography sx={{ fontSize: 11 }}>{dates[0].slice(5)} ~ {dates[6].slice(5)}</Typography><IconButton aria-label="다음 주" disabled={offset === 0} onClick={() => setOffset(offset + 1)}><ChevronRightIcon /></IconButton></Box>
    {settings && <MainProcessSettingsDialog names={names} selected={effectiveSelected} axisStep={axisStep} onClose={() => setSettings(false)} onSave={(next, step) => { localStorage.setItem(preferenceKey, JSON.stringify({ selected: next, axisStep: step })); setSelected(next); setAxisStep(step); setSettings(false); }} />}
  </Paper>;
}
