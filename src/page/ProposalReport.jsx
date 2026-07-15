import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import ExcelJS from 'exceljs';
import ApprovalRequestDialog from './ApprovalRequestDialog.jsx';

const MIN_REPORT_LINES = 5;
const MAX_REPORT_LINES = 16;

const pad2 = (value) => String(value).padStart(2, '0');

const getTodayKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(
    today.getDate(),
  )}`;
};

const formatDateForReport = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}`;
};

const formatAmount = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const numeric = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return '';
  return numeric.toLocaleString('ko-KR');
};

const sanitizeFilename = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);

const createInitialLines = () =>
  Array.from({ length: MIN_REPORT_LINES }, () => '');

const previewBorder = '1px solid #374151';

function ReportContentInputs({
  lines,
  onChange,
  onAdd,
  onRemove,
}) {
  return (
    <Box>
      <Box
        sx={{
          mb: 0.8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography
          fontWeight={800}
          sx={{ color: '#334155', fontSize: '0.86rem' }}
        >
          보고내용
        </Typography>

        <Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>
          {lines.length}/{MAX_REPORT_LINES}
        </Typography>
      </Box>

      {lines.map((line, index) => (
        <TextField
          key={`proposal-line-${index}`}
          fullWidth
          size="small"
          multiline
          minRows={1}
          maxRows={3}
          value={line}
          placeholder={`보고내용 ${index + 1}`}
          onChange={(event) => onChange(index, event.target.value)}
          sx={{
            mb: 0.65,
            '& .MuiInputBase-input': {
              fontSize: '0.78rem',
              lineHeight: 1.45,
            },
          }}
        />
      ))}

      <Box sx={{ display: 'flex', gap: 0.75, mt: 0.3 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={onAdd}
          disabled={lines.length >= MAX_REPORT_LINES}
          sx={{ fontSize: '0.72rem' }}
        >
          항목 추가
        </Button>

        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onRemove}
          disabled={lines.length <= MIN_REPORT_LINES}
          sx={{ fontSize: '0.72rem' }}
        >
          마지막 항목 삭제
        </Button>
      </Box>

      
    </Box>
  );
}

function ProposalPreview({
  projectName,
  title,
  reportDate,
  authorName,
  reportLines,
  itemName,
  amount,
  note,
}) {
  const narrative = title
    ? `당 현장의 ${title} 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.`
    : '당 현장의 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.';

  const visibleLines = Array.from(
    { length: MAX_REPORT_LINES },
    (_, index) => reportLines[index] || '',
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        maxWidth: 800,
        mx: 'auto',
        bgcolor: '#ffffff',
        borderColor: '#cbd5e1',
        boxShadow: '0 5px 18px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Box sx={{ p: { xs: 1.5, xl: 2.25 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              '110px minmax(0, 1fr) minmax(0, 1fr) repeat(4, minmax(82px, 0.82fr))',
            gridTemplateRows: '46px 34px repeat(4, 36px)',
            borderTop: previewBorder,
            borderLeft: previewBorder,
          }}
        >
          {/* 왼쪽 제목 영역 */}
          <Box
            sx={{
              gridColumn: '1 / 4',
              gridRow: '1 / 3',
              borderRight: previewBorder,
              borderBottom: previewBorder,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              px: 1,
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: '1.25rem', xl: '1.65rem' },
                fontWeight: 900,
                letterSpacing: '0.22em',
              }}
            >
              품 의 보 고 서
            </Typography>
          </Box>

          {/* 오른쪽 결재 제목 */}
          <Box
            sx={{
              gridColumn: '4 / 8',
              gridRow: '1',
              borderRight: previewBorder,
              borderBottom: previewBorder,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              fontWeight={900}
              sx={{
                fontSize: { xs: '1rem', xl: '1.25rem' },
                letterSpacing: '0.2em',
              }}
            >
              결 재
            </Typography>
          </Box>

          {/* 결재 직급 제목 */}
          {['담 당', '이 사', '실 장', '사 장'].map((label, index) => (
            <Box
              key={label}
              sx={{
                gridColumn: `${4 + index} / ${5 + index}`,
                gridRow: '2',
                borderRight: previewBorder,
                borderBottom: previewBorder,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography fontWeight={800} sx={{ fontSize: '0.78rem' }}>
                {label}
              </Typography>
            </Box>
          ))}

          {/* 왼쪽 기본 정보: 제목 바로 아래에 고정 */}
          {[
            ['현장명', projectName],
            ['제목', title],
            ['작성일', formatDateForReport(reportDate)],
            ['작성자', authorName],
          ].map(([label, value], index) => {
            const row = 3 + index;

            return (
              <React.Fragment key={label}>
                <Box
                  sx={{
                    gridColumn: '1',
                    gridRow: `${row}`,
                    borderRight: previewBorder,
                    borderBottom: previewBorder,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: '#ffffff',
                  }}
                >
                  <Typography fontWeight={800} sx={{ fontSize: '0.75rem' }}>
                    {label}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    gridColumn: '2 / 4',
                    gridRow: `${row}`,
                    borderRight: previewBorder,
                    borderBottom: previewBorder,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.76rem',
                      lineHeight: 1.35,
                      wordBreak: 'break-all',
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              </React.Fragment>
            );
          })}

          {/*
            오른쪽 서명 영역:
            가로 분할선 없이 담당/이사/실장/사장 세로 칸만 유지합니다.
          */}
          <Box
            sx={{
              gridColumn: '4 / 8',
              gridRow: '3 / 7',
              borderRight: previewBorder,
              borderBottom: previewBorder,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            }}
          >
            {['담당', '이사', '실장', '사장'].map((role, index) => (
              <Box
                key={role}
                sx={{
                  minWidth: 0,
                  borderLeft: index === 0 ? 'none' : previewBorder,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 0.5,
                  textAlign: 'center',
                  fontFamily:
                    index === 0
                      ? '"Gungsuh", "궁서", serif'
                      : 'inherit',
                  fontSize: index === 0 ? '18px' : '0.8rem',
                  fontWeight: index === 0 ? 800 : 400,
                  lineHeight: 1.2,
                  wordBreak: 'keep-all',
                }}
              >
                {index === 0 ? authorName : ''}
              </Box>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            mt: 2.8,
            px: 1.5,
            minHeight: 45,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
            {narrative}
          </Typography>
        </Box>

        <Typography
          align="center"
          fontWeight={900}
          sx={{ my: 1.5, fontSize: '0.9rem', letterSpacing: '0.08em' }}
        >
          *** 보고내용 ***
        </Typography>

        <Box
          sx={{
            minHeight: 405,
            px: 1.5,
            py: 0.5,
          }}
        >
          {visibleLines.map((line, index) => {
            const placeholder = `보고내용 ${index + 1}`;
            const hasValue = Boolean(line?.trim());

            return (
              <Box
                key={`preview-line-${index}`}
                sx={{
                  minHeight: 25,
                  display: 'flex',
                  alignItems: 'center',
                  py: 0.2,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.74rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: hasValue ? '#111827' : '#cbd5e1',
                    fontWeight: hasValue ? 500 : 400,
                  }}
                >
                  {hasValue ? line : placeholder}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Box
          sx={{
            mt: 2.5,
            display: 'grid',
            gridTemplateColumns: '1.2fr 2fr 1.25fr 1.25fr',
            borderTop: previewBorder,
            borderLeft: previewBorder,
          }}
        >
          {['현 장 명', '품 명', '금 액', '비 고'].map((label) => (
            <Box
              key={label}
              sx={{
                minHeight: 34,
                borderRight: previewBorder,
                borderBottom: previewBorder,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography fontWeight={900} sx={{ fontSize: '0.75rem' }}>
                {label}
              </Typography>
            </Box>
          ))}

          {[projectName, itemName, formatAmount(amount), note].map(
            (value, index) => (
              <Box
                key={`purchase-value-${index}`}
                sx={{
                  minHeight: 48,
                  borderRight: previewBorder,
                  borderBottom: previewBorder,
                  px: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: index === 2 ? 'flex-end' : 'center',
                  textAlign: index === 2 ? 'right' : 'center',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {value}
                </Typography>
              </Box>
            ),
          )}
        </Box>

        <Typography
          align="center"
          fontWeight={800}
          sx={{ mt: 2.5, fontSize: '0.82rem' }}
        >
          ㅡ 끝 ㅡ
        </Typography>
      </Box>
    </Paper>
  );
}

export default function ProposalReport({ userProfile }) {
  const projectName = userProfile?.project_name || '';
  const authorName = userProfile?.manager_name || '';

  const [title, setTitle] = useState('');
  const [reportDate, setReportDate] = useState(getTodayKey());
  const [reportLines, setReportLines] = useState(createInitialLines);
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [approvalOpen, setApprovalOpen] = useState(false);

  const narrative = useMemo(
    () =>
      title
        ? `당 현장의 ${title} 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.`
        : '당 현장의 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.',
    [title],
  );

  const handleLineChange = (index, value) => {
    setReportLines((previous) =>
      previous.map((line, lineIndex) =>
        lineIndex === index ? value : line,
      ),
    );
  };

  const handleAddLine = () => {
    setReportLines((previous) =>
      previous.length >= MAX_REPORT_LINES ? previous : [...previous, ''],
    );
  };

  const handleRemoveLine = () => {
    setReportLines((previous) =>
      previous.length <= MIN_REPORT_LINES
        ? previous
        : previous.slice(0, -1),
    );
  };

  const handleAmountChange = (event) => {
    const digitsOnly = event.target.value.replace(/[^\d]/g, '');
    setAmount(digitsOnly);
  };

  const handleReset = () => {
    if (!window.confirm('현재 작성한 품의 보고 내용을 초기화하시겠습니까?')) {
      return;
    }

    setTitle('');
    setReportDate(getTodayKey());
    setReportLines(createInitialLines());
    setItemName('');
    setAmount('');
    setNote('');
    setDownloadError('');
  };

  const handleOpenApproval = () => {
    const hasReportContent = reportLines.some((line) =>
      String(line || '').trim(),
    );

    if (!title.trim()) {
      window.alert('품의 보고 제목을 입력해주세요.');
      return;
    }

    if (!hasReportContent) {
      window.alert('품의 보고 내용을 한 줄 이상 입력해주세요.');
      return;
    }

    setApprovalOpen(true);
  };

  const handleDownloadExcel = async () => {
    setDownloadError('');

    try {
      const response = await fetch('/templates/품의보고.xlsx');

      if (!response.ok) {
        throw new Error(
          '품의보고.xlsx 양식을 불러오지 못했습니다. public/templates 경로를 확인해주세요.',
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        throw new Error('품의 보고 양식에서 첫 번째 시트를 찾지 못했습니다.');
      }

      worksheet.getCell('B4').value = projectName;
      worksheet.getCell('B5').value = title;
      worksheet.getCell('B6').value = formatDateForReport(reportDate);
      worksheet.getCell('B7').value = authorName;

      /*
        ExcelJS는 같은 서식을 사용하는 셀끼리 style 객체를 공유할 수 있습니다.
        B4:B7과 D4의 스타일을 각각 깊은 복사해 분리한 뒤 서식을 적용합니다.
        이렇게 해야 D4를 18pt로 바꿔도 B5:B7이 같이 바뀌지 않습니다.
      */
      const cloneCellStyle = (value) =>
        value ? JSON.parse(JSON.stringify(value)) : {};

      // D4와 같은 원본 스타일을 공유할 가능성이 있는 B4도 먼저 분리합니다.
      const projectCell = worksheet.getCell('B4');
      projectCell.style = cloneCellStyle(projectCell.style);

      // B5:B7 = 맑은 고딕 11pt, 굵게 아님
      ['B5', 'B6', 'B7'].forEach((address) => {
        const cell = worksheet.getCell(address);
        const isolatedStyle = cloneCellStyle(cell.style);
        const isolatedFont = cloneCellStyle(cell.font);

        cell.style = {
          ...isolatedStyle,
          font: {
            ...isolatedFont,
            name: '맑은 고딕',
            size: 11,
            bold: false,
            italic: false,
          },
        };
      });

      // D4만 궁서체 18pt, 굵게
      const signatureCell = worksheet.getCell('D4');
      const signatureStyle = cloneCellStyle(signatureCell.style);
      const signatureFont = cloneCellStyle(signatureCell.font);
      const signatureAlignment = cloneCellStyle(signatureCell.alignment);

      signatureCell.value = authorName;
      signatureCell.style = {
        ...signatureStyle,
        font: {
          ...signatureFont,
          name: '궁서',
          size: 18,
          bold: true,
          italic: false,
        },
        alignment: {
          ...signatureAlignment,
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        },
      };

      worksheet.getCell('A13').value = narrative;

      for (let index = 0; index < MAX_REPORT_LINES; index += 1) {
        const cell = worksheet.getCell(`A${16 + index}`);
        cell.value = reportLines[index] || '';
        cell.alignment = {
          ...(cell.alignment || {}),
          vertical: 'middle',
          wrapText: true,
        };
      }

      worksheet.getCell('B35').value = projectName;
      worksheet.getCell('C35').value = itemName;

      if (amount) {
        worksheet.getCell('E35').value = Number(amount);
        worksheet.getCell('E35').numFmt = '#,##0';
      } else {
        worksheet.getCell('E35').value = '';
      }

      worksheet.getCell('F35').value = note;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const titlePart = sanitizeFilename(title) || '미작성';
      link.href = url;
      link.download = `품의보고_${formatDateForReport(
        reportDate,
      )}_${titlePart}.xlsx`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setDownloadError(error?.message || '엑셀 파일을 생성하지 못했습니다.');
    }
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          lg: 'minmax(340px, 0.72fr) minmax(560px, 1.28fr)',
        },
        gap: 1.5,
        overflow: 'hidden',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          overflowY: 'auto',
          p: 1.6,
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography
              fontWeight={900}
              sx={{ color: '#1e293b', fontSize: '0.96rem' }}
            >
              품의 보고 작성
            </Typography>
            <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.72rem' }}>
              입력한 내용은 오른쪽 미리보기에 즉시 반영됩니다.
            </Typography>
          </Box>

          <Button
            size="small"
            variant="contained"
            onClick={handleOpenApproval}
            sx={{
              minWidth: 72,
              px: 1.15,
              whiteSpace: 'nowrap',
              fontSize: '0.72rem',
              fontWeight: 800,
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            결재요청
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={handleReset}
            sx={{
              minWidth: 72,
              px: 1.05,
              whiteSpace: 'nowrap',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            새로고침
          </Button>

          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={handleDownloadExcel}
            sx={{
              minWidth: 48,
              px: 1.05,
              whiteSpace: 'nowrap',
              fontSize: '0.72rem',
              fontWeight: 900,
            }}
          >
            XLS
          </Button>
        </Box>

        {downloadError && (
          <Alert severity="error" sx={{ mt: 1.2, fontSize: '0.74rem' }}>
            {downloadError}
          </Alert>
        )}

        <Divider sx={{ my: 1.4 }} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
          }}
        >
          <TextField
            fullWidth
            size="small"
            label="현장명"
            value={projectName}
            disabled
            sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
          />

          <TextField
            fullWidth
            size="small"
            label="작성자"
            value={authorName}
            disabled
            sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
          />

          <TextField
            fullWidth
            size="small"
            label="제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            sx={{
              gridColumn: '1 / -1',
              '& .MuiInputBase-input': { fontSize: '0.78rem' },
            }}
          />

          <TextField
            fullWidth
            size="small"
            type="date"
            label="작성일"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{
              gridColumn: '1 / -1',
              '& .MuiInputBase-input': { fontSize: '0.78rem' },
            }}
          />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <ReportContentInputs
          lines={reportLines}
          onChange={handleLineChange}
          onAdd={handleAddLine}
          onRemove={handleRemoveLine}
        />

        <Divider sx={{ my: 1.5 }} />

        <Typography
          fontWeight={800}
          sx={{ mb: 0.8, color: '#334155', fontSize: '0.86rem' }}
        >
          품의 금액 정보
        </Typography>

        <TextField
          fullWidth
          size="small"
          label="현장명"
          value={projectName}
          disabled
          sx={{
            mb: 0.8,
            '& .MuiInputBase-input': { fontSize: '0.78rem' },
          }}
        />

        <TextField
          fullWidth
          size="small"
          label="품명"
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          sx={{
            mb: 0.8,
            '& .MuiInputBase-input': { fontSize: '0.78rem' },
          }}
        />

        <TextField
          fullWidth
          size="small"
          label="금액"
          value={amount ? formatAmount(amount) : ''}
          onChange={handleAmountChange}
          inputMode="numeric"
          placeholder="예: 1,500,000"
          sx={{
            mb: 0.8,
            '& .MuiInputBase-input': {
              fontSize: '0.78rem',
              textAlign: 'right',
            },
          }}
        />

        <TextField
          fullWidth
          size="small"
          label="비고"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          multiline
          minRows={2}
          sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
        />
      </Paper>

      <Box
        sx={{
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          p: 0.2,
        }}
      >
        <ProposalPreview
          projectName={projectName}
          title={title}
          reportDate={reportDate}
          authorName={authorName}
          reportLines={reportLines}
          itemName={itemName}
          amount={amount}
          note={note}
        />
      </Box>

      <ApprovalRequestDialog
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        reportType="proposal"
        reportTitle={`품의 보고 - ${title || '제목 미작성'}`}
        reportKey={`proposal:${reportDate}:${title.trim()}`}
        projectName={projectName}
        requesterName={authorName}
        payload={{
          projectName,
          authorName,
          title,
          reportDate,
          reportLines,
          itemName,
          amount,
          note,
          narrative,
        }}
      />
    </Box>
  );
}
