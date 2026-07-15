import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';

const REPORT_PROCESSES = [
  { label: '바닥먹매김', processType: '바닥먹' },
  { label: '단열', processType: '단열' },
  { label: '경량골조', processType: '경량골조' },
  { label: '경량석고', processType: '경량석고' },
  { label: '합지석고', processType: '합지석고' },
  { label: '세대천정', processType: '세대천정' },
  { label: '1차몰딩', processType: '1차몰딩' },
  { label: '2차몰딩', processType: '2차몰딩' },
  { label: '1차 걸레받이', processType: '1차 걸레받이' },
  { label: '2차 걸레받이', processType: '2차 걸레받이' },
];

const createLines = (count) => Array.from({ length: count }, () => '');

const INITIAL_FORM = {
  publicCurrent: createLines(3),
  publicNext: createLines(3),
  progressCurrent: createLines(3),
  progressNext: createLines(3),
  meetingCurrent: createLines(3),
  meetingNext: createLines(3),
  directiveCurrent: createLines(3),
  directiveNext: createLines(3),
  materialCurrent: createLines(3),
  materialNext: createLines(3),
  specialCurrent: createLines(5),
  specialNext: createLines(5),
};

const EXCEL_INPUT_MAP = {
  publicCurrent: ['B19', 'B20', 'B21'],
  publicNext: ['E19', 'E20', 'E21'],
  progressCurrent: ['B23', 'B24', 'B25'],
  progressNext: ['E23', 'E24', 'E25'],
  meetingCurrent: ['B27', 'B28', 'B29'],
  meetingNext: ['E27', 'E28', 'E29'],
  directiveCurrent: ['B31', 'B32', 'B33'],
  directiveNext: ['E31', 'E32', 'E33'],
  materialCurrent: ['B35', 'B36', 'B37'],
  materialNext: ['E35', 'E36', 'E37'],
  specialCurrent: ['B39', 'B40', 'B41', 'B42', 'B43'],
  specialNext: ['E39', 'E40', 'E41', 'E42', 'E43'],
};

const pad2 = (value) => String(value).padStart(2, '0');

const toDateKey = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

const formatShortDate = (date) => {
  const year = String(date.getFullYear()).slice(2);
  return `${year}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
};

const getReportPeriod = (baseDate = new Date()) => {
  const currentWeekStart = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
  );
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

  const nextWeekEnd = new Date(currentWeekStart);
  nextWeekEnd.setDate(currentWeekStart.getDate() + 13);

  const previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1);

  return {
    currentWeekStart,
    currentWeekEnd,
    nextWeekEnd,
    previousWeekEnd,
    display: `${formatShortDate(currentWeekStart)}~${formatShortDate(nextWeekEnd)}`,
  };
};

const calculateTotalUnits = (buildingConfigs) =>
  getProjectCellKeys(buildingConfigs || {}).size;

const parseCompletionDate = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildProcessStats = (rows, totalUnits, period) => {
  const uniqueRows = new Map();

  rows.forEach((row) => {
    const key = `${row.process_type}|${row.building}|${row.unit}`;
    uniqueRows.set(key, row);
  });

  return REPORT_PROCESSES.map((process) => {
    let completed = 0;
    let weeklyAmount = 0;

    uniqueRows.forEach((row) => {
      if (row.process_type !== process.processType || row.status !== '작업완료') {
        return;
      }

      const completionDate = parseCompletionDate(row.completion_date);

      if (!completionDate || completionDate <= period.currentWeekEnd) {
        completed += 1;
      }

      if (
        completionDate &&
        completionDate >= period.currentWeekStart &&
        completionDate <= period.currentWeekEnd
      ) {
        weeklyAmount += 1;
      }
    });

    const percentage = totalUnits > 0 ? Math.round((completed / totalUnits) * 100) : 0;

    return {
      ...process,
      completed,
      weeklyAmount,
      percentage,
      progressText: `${completed}/${totalUnits}(${percentage}%)`,
    };
  });
};

const sectionDefinitions = [
  {
    title: '공무사항',
    subtitle: '(기성, 공무)',
    currentKey: 'publicCurrent',
    nextKey: 'publicNext',
    count: 3,
  },
  {
    title: '공정사항',
    subtitle: '',
    currentKey: 'progressCurrent',
    nextKey: 'progressNext',
    count: 3,
  },
  {
    title: '회의내용',
    subtitle: '',
    currentKey: 'meetingCurrent',
    nextKey: 'meetingNext',
    count: 3,
  },
  {
    title: '지시사항',
    subtitle: '',
    currentKey: 'directiveCurrent',
    nextKey: 'directiveNext',
    count: 3,
  },
  {
    title: '자재 반입계획',
    subtitle: '',
    currentKey: 'materialCurrent',
    nextKey: 'materialNext',
    count: 3,
  },
  {
    title: '특이사항',
    subtitle: '(안전 등)',
    currentKey: 'specialCurrent',
    nextKey: 'specialNext',
    count: 5,
  },
];

function FormSection({ definition, form, onLineChange }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography fontWeight={800} sx={{ fontSize: '0.84rem', color: '#334155' }}>
        {definition.title} {definition.subtitle}
      </Typography>

      <Box
        sx={{
          mt: 0.75,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
        }}
      >
        <Box>
          <Typography sx={{ mb: 0.5, fontSize: '0.72rem', color: '#64748b' }}>
            금주 현황
          </Typography>
          {form[definition.currentKey].map((value, index) => (
            <TextField
              key={`${definition.currentKey}-${index}`}
              fullWidth
              size="small"
              placeholder={`${definition.title} ${index + 1}`}
              value={value}
              onChange={(event) =>
                onLineChange(definition.currentKey, index, event.target.value)
              }
              sx={{ mb: 0.6, '& .MuiInputBase-input': { fontSize: '0.76rem' } }}
            />
          ))}
        </Box>

        <Box>
          <Typography sx={{ mb: 0.5, fontSize: '0.72rem', color: '#64748b' }}>
            차주 계획
          </Typography>
          {form[definition.nextKey].map((value, index) => (
            <TextField
              key={`${definition.nextKey}-${index}`}
              fullWidth
              size="small"
              placeholder={`${definition.title} ${index + 1}`}
              value={value}
              onChange={(event) =>
                onLineChange(definition.nextKey, index, event.target.value)
              }
              sx={{ mb: 0.6, '& .MuiInputBase-input': { fontSize: '0.76rem' } }}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function PreviewLines({ values, minRows = 3 }) {
  const normalized = Array.from({ length: minRows }, (_, index) => values[index] || '');

  return (
    <Box sx={{ display: 'grid', gridTemplateRows: `repeat(${minRows}, 28px)` }}>
      {normalized.map((value, index) => (
        <Box
          key={index}
          sx={{
            px: 0.8,
            display: 'flex',
            alignItems: 'center',
            borderBottom: index === normalized.length - 1 ? 'none' : '1px solid #d1d5db',
            fontSize: '0.68rem',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}
        >
          {value}
        </Box>
      ))}
    </Box>
  );
}

function WeeklyReportPreview({ projectName, managerName, period, stats, form }) {
  const workRows = stats.length > 0
    ? stats
    : REPORT_PROCESSES.map((process) => ({
        ...process,
        progressText: '0/0(0%)',
        weeklyAmount: 0,
      }));

  return (
    <Box
      sx={{
        width: 820,
        minHeight: 1120,
        mx: 'auto',
        bgcolor: '#ffffff',
        color: '#111827',
        border: '1px solid #cbd5e1',
        boxShadow: '0 8px 30px rgba(15,23,42,0.12)',
        fontFamily: '"Malgun Gothic", "맑은 고딕", sans-serif',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 100px' }}>
        <Box
          sx={{
            p: 2.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              width: '100%',
              fontSize: '1.7rem',
              fontWeight: 900,
              textAlign: 'center',
            }}
          >
            주간업무보고
          </Typography>
        </Box>

        {['담당', '이사', '실장', '사장'].map((title, index) => (
          <Box key={title} sx={{ borderLeft: '1px solid #111827' }}>
            <Box
              sx={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '1px solid #111827',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {title}
            </Box>
            <Box
              sx={{
                height: 70,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 0.4,
                textAlign: 'center',
                fontFamily: index === 0 ? '"Gungsuh", "궁서", serif' : 'inherit',
                fontSize: index === 0 ? '18px' : '0.8rem',
                fontWeight: index === 0 ? 800 : 400,
              }}
            >
              {index === 0 ? managerName : ''}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '90px 1fr', borderTop: '1px solid #111827' }}>
        <Box sx={{ p: 0.8, borderRight: '1px solid #111827', fontWeight: 800, fontSize: '0.76rem' }}>현장명</Box>
        <Box sx={{ p: 0.8, fontSize: '0.76rem' }}>{projectName}</Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '90px 1fr', borderTop: '1px solid #111827' }}>
        <Box sx={{ p: 0.8, borderRight: '1px solid #111827', fontWeight: 800, fontSize: '0.76rem' }}>기간</Box>
        <Box sx={{ p: 0.8, fontSize: '0.76rem' }}>{period.display}</Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '95px 1fr 110px 105px 1fr 110px 105px',
          borderTop: '1px solid #111827',
          borderBottom: '1px solid #111827',
        }}
      >
        <Box sx={{ gridRow: 'span 2', ...previewHeaderCell }}>구분</Box>
        <Box
          sx={{
            gridColumn: 'span 3',
            ...previewHeaderCell,
            bgcolor: '#ffffff',
            color: '#111827',
          }}
        >
          금주현황
        </Box>
        <Box
          sx={{
            gridColumn: 'span 3',
            ...previewHeaderCell,
            bgcolor: '#ffffff',
            color: '#111827',
          }}
        >
          차주계획
        </Box>
        {['공종명', '진도율', '1주간 작업량', '공종명', '진도율', '1주간 작업량'].map((label) => (
          <Box key={label} sx={previewHeaderCell}>{label}</Box>
        ))}

        <Box
          sx={{
            gridRow: `span ${workRows.length}`,
            px: 0.7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            whiteSpace: 'pre-line',
            borderRight: '1px solid #9ca3af',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          {'공사사항\n(작업현황)'}
        </Box>

        {workRows.map((row) => (
          <React.Fragment key={row.processType}>
            <Box sx={previewBodyCell}>{row.label}</Box>
            <Box
              sx={{
                ...previewBodyCell,
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              {row.progressText}
            </Box>
            <Box
              sx={{
                ...previewBodyCell,
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              {`${row.weeklyAmount || 0}세대`}
            </Box>
            <Box sx={previewBodyCell}>{row.label}</Box>
            <Box sx={{ ...previewBodyCell, textAlign: 'center' }} />
            <Box sx={{ ...previewBodyCell, textAlign: 'center' }} />
          </React.Fragment>
        ))}
      </Box>

      {sectionDefinitions.map((definition, index) => (
        <Box
          key={definition.currentKey}
          sx={{
            display: 'grid',
            gridTemplateColumns: '95px 1fr 1fr',
            borderBottom: '1px solid #111827',
            minHeight: definition.count * 28,
          }}
        >
          <Box
            sx={{
              px: 0.7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              whiteSpace: 'pre-line',
              borderRight: '1px solid #9ca3af',
              fontSize: '0.7rem',
              fontWeight: 800,
            }}
          >
            {definition.title}
            {definition.subtitle ? `\n${definition.subtitle}` : ''}
          </Box>

          <Box sx={{ borderRight: '1px solid #9ca3af' }}>
            <Box sx={previewSectionTitle}>□{definition.title}</Box>
            <PreviewLines values={form[definition.currentKey]} minRows={definition.count} />
          </Box>

          <Box>
            <Box sx={previewSectionTitle}>□{definition.title}</Box>
            <PreviewLines values={form[definition.nextKey]} minRows={definition.count} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const previewHeaderCell = {
  minHeight: 34,
  px: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRight: '1px solid #9ca3af',
  borderBottom: '1px solid #9ca3af',
  fontSize: '0.7rem',
  fontWeight: 800,
  textAlign: 'center',
};

const previewBodyCell = {
  minHeight: 28,
  px: 0.6,
  display: 'flex',
  alignItems: 'center',
  borderRight: '1px solid #d1d5db',
  borderBottom: '1px solid #d1d5db',
  fontSize: '0.66rem',
};

const previewSectionTitle = {
  height: 27,
  px: 0.8,
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid #d1d5db',
  fontSize: '0.68rem',
  fontWeight: 800,
};

export default function WeeklyReport({ userProfile, buildingConfigs = {} }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [progressRows, setProgressRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const projectName = userProfile?.project_name || '';
  const managerName = userProfile?.manager_name || '';
  const period = useMemo(() => getReportPeriod(new Date()), []);
  const totalUnits = useMemo(
    () => calculateTotalUnits(buildingConfigs),
    [buildingConfigs],
  );

  const stats = useMemo(
    () => buildProcessStats(progressRows, totalUnits, period),
    [progressRows, totalUnits, period],
  );

  const fetchProgressRows = async () => {
    if (!projectName) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const allRows = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('unit_progress')
          .select('building, unit, process_type, status, completion_date')
          .eq('project_name', projectName)
          .in(
            'process_type',
            REPORT_PROCESSES.map((process) => process.processType),
          )
          .range(from, from + pageSize - 1);

        if (error) throw error;

        const pageRows = data || [];
        allRows.push(...pageRows);

        if (pageRows.length < pageSize) break;
        from += pageSize;
      }

      setProgressRows(allRows);
    } catch (error) {
      console.error('주간 업무 보고 공정 데이터 조회 실패:', error);
      setErrorMessage(error?.message || '공정 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgressRows();
  }, [projectName]);

  const handleLineChange = (key, index, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: previous[key].map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  };

  const handleDownloadExcel = async () => {
    try {
      const response = await fetch('/templates/주간업무보고.xlsx');
      if (!response.ok) {
        throw new Error('public/templates/주간업무보고.xlsx 파일을 찾을 수 없습니다.');
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      worksheet.getCell('B4').value = projectName;
      worksheet.getCell('B5').value = period.display;
      worksheet.getCell('D2').value = managerName;
      worksheet.getCell('D2').font = {
        ...(worksheet.getCell('D2').font || {}),
        name: '궁서',
        bold: true,
        size: 18,
      };

      stats.forEach((row, index) => {
        const excelRow = 8 + index;
        worksheet.getCell(`C${excelRow}`).value = row.progressText;
        worksheet.getCell(`D${excelRow}`).value = row.weeklyAmount || '';
      });

      Object.entries(EXCEL_INPUT_MAP).forEach(([key, cells]) => {
        cells.forEach((cellAddress, index) => {
          worksheet.getCell(cellAddress).value = form[key][index] || '';
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_');
      link.href = url;
      link.download = `주간업무보고_${safeProjectName}_${toDateKey(period.currentWeekStart)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('주간 업무 보고 엑셀 생성 실패:', error);
      alert(error?.message || '엑셀 파일 생성에 실패했습니다.');
    }
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 38%) minmax(620px, 62%)',
        gap: 1.5,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderColor: '#cbd5e1',
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography fontWeight={900} sx={{ color: '#1e293b', fontSize: '0.96rem' }}>
              주간 업무 보고 작성
            </Typography>
            <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.72rem' }}>
              입력한 내용은 오른쪽 미리보기에 즉시 반영됩니다.
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
            onClick={fetchProgressRows}
            disabled={loading}
          >
            새로고침
          </Button>

          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadExcel}
          >
            엑셀 다운로드
          </Button>
        </Box>

        <Divider />

        <Box sx={{ p: 1.5, overflowY: 'auto' }}>
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {errorMessage}
            </Alert>
          )}

          <Paper
            variant="outlined"
            sx={{
              mb: 1.5,
              p: 1.2,
              bgcolor: '#f8fafc',
              borderColor: '#e2e8f0',
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: '84px 1fr', rowGap: 0.7 }}>
              <Typography sx={infoLabelStyle}>현장명</Typography>
              <Typography sx={infoValueStyle}>{projectName || '-'}</Typography>
              <Typography sx={infoLabelStyle}>작성자</Typography>
              <Typography sx={infoValueStyle}>{managerName || '-'}</Typography>
              <Typography sx={infoLabelStyle}>보고기간</Typography>
              <Typography sx={infoValueStyle}>{period.display}</Typography>
              <Typography sx={infoLabelStyle}>전체 세대</Typography>
              <Typography sx={infoValueStyle}>{totalUnits.toLocaleString()}세대</Typography>
            </Box>
          </Paper>

          <Typography fontWeight={900} sx={{ mb: 0.8, fontSize: '0.84rem', color: '#334155' }}>
            자동 공정 현황
          </Typography>

          <Box
            sx={{
              mb: 2,
              border: '1px solid #cbd5e1',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 115px 85px', bgcolor: '#e2e8f0' }}>
              {['공종명', '진도율', '금주량'].map((label) => (
                <Box key={label} sx={compactHeaderStyle}>{label}</Box>
              ))}
            </Box>

            {stats.map((row) => (
              <Box
                key={row.processType}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 115px 85px',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <Box sx={compactBodyStyle}>{row.label}</Box>
                <Box sx={{ ...compactBodyStyle, justifyContent: 'center' }}>{row.progressText}</Box>
                <Box sx={{ ...compactBodyStyle, justifyContent: 'center' }}>{row.weeklyAmount}</Box>
              </Box>
            ))}
          </Box>

          {sectionDefinitions.map((definition) => (
            <FormSection
              key={definition.currentKey}
              definition={definition}
              form={form}
              onLineChange={handleLineChange}
            />
          ))}
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          p: 1.5,
          bgcolor: '#e2e8f0',
          borderColor: '#cbd5e1',
        }}
      >
        <WeeklyReportPreview
          projectName={projectName}
          managerName={managerName}
          period={period}
          stats={stats}
          form={form}
        />
      </Paper>
    </Box>
  );
}

const infoLabelStyle = {
  color: '#64748b',
  fontSize: '0.74rem',
  fontWeight: 700,
};

const infoValueStyle = {
  color: '#1e293b',
  fontSize: '0.76rem',
  fontWeight: 700,
};

const compactHeaderStyle = {
  minHeight: 30,
  px: 0.8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRight: '1px solid #cbd5e1',
  fontSize: '0.72rem',
  fontWeight: 800,
};

const compactBodyStyle = {
  minHeight: 29,
  px: 0.8,
  display: 'flex',
  alignItems: 'center',
  borderRight: '1px solid #e2e8f0',
  fontSize: '0.72rem',
};
