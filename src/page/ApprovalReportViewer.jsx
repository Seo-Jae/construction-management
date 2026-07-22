import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Typography,
} from '@mui/material';
import ExcelJS from 'exceljs';

const normalizeProcessText = (value) =>
  String(value || '').replace(
    /합지석고/g,
    '합지',
  );

const normalizeStoredProcessType = (
  value,
) =>
  value === '합지석고'
    ? '합지'
    : value;

const WEEKLY_REPORT_PROCESSES = [
  { label: '바닥먹매김', processType: '바닥먹' },
  { label: '단열', processType: '단열' },
  { label: '경량골조', processType: '경량골조' },
  { label: '경량석고', processType: '경량석고' },
  { label: '합지', processType: '합지' },
  { label: '세대천정', processType: '세대천정' },
  { label: '1차몰딩', processType: '1차몰딩' },
  { label: '2차몰딩', processType: '2차몰딩' },
  { label: '1차 걸레받이', processType: '1차 걸레받이' },
  { label: '2차 걸레받이', processType: '2차 걸레받이' },
];

const WEEKLY_EXCEL_INPUT_MAP = {
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

const WEEKLY_SECTIONS = [
  {
    title: '공무사항',
    subtitle: '(기성, 공무)',
    currentKey: 'publicCurrent',
    nextKey: 'publicNext',
    count: 3,
  },
  {
    title: '공정사항',
    currentKey: 'progressCurrent',
    nextKey: 'progressNext',
    count: 3,
  },
  {
    title: '회의내용',
    currentKey: 'meetingCurrent',
    nextKey: 'meetingNext',
    count: 3,
  },
  {
    title: '지시사항',
    currentKey: 'directiveCurrent',
    nextKey: 'directiveNext',
    count: 3,
  },
  {
    title: '자재 반입계획',
    currentKey: 'materialCurrent',
    nextKey: 'materialNext',
    count: 3,
  },
  {
    title: '특이사항',
    currentKey: 'specialCurrent',
    nextKey: 'specialNext',
    count: 5,
  },
];

const MAX_PROPOSAL_LINES = 16;

const cloneValue = (value) =>
  value ? JSON.parse(JSON.stringify(value)) : {};

const sanitizeFilename = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50);

const formatProposalDate = (value) => {
  if (!value) return '';

  const parts = String(value).split('-');

  if (parts.length !== 3) {
    return String(value);
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}`;
};


const getApprovalSlots = (steps) => {
  const ordered = [...(Array.isArray(steps) ? steps : [])]
    .sort(
      (first, second) =>
        Number(first?.step_order || 0) -
        Number(second?.step_order || 0),
    )
    .slice(0, 3)
    .map((step, index) => ({
      order: index + 1,
      position:
        String(step?.approver_position || '').trim() ||
        `${index + 1}차`,
      name:
        step?.status === 'approved'
          ? String(step?.approver_name || '').trim()
          : '',
    }));

  while (ordered.length < 3) {
    ordered.push({
      order: ordered.length + 1,
      position: '',
      name: '',
    });
  }

  return ordered;
};

const applySignatureCell = (
  worksheet,
  address,
  name,
) => {
  const cell = worksheet.getCell(address);

  cell.value = name || '';
  cell.font = {
    ...(cell.font || {}),
    name: '궁서',
    bold: true,
    size: 18,
    italic: false,
  };
  cell.alignment = {
    ...(cell.alignment || {}),
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
};

const saveWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadWeeklyReport = async (request) => {
  const payload = request?.payload || {};
  const period = payload?.period || {};
  const form = payload?.form || {};
  const stats = Array.isArray(payload?.stats)
    ? payload.stats.map((row) => ({
        ...row,
        processType:
          normalizeStoredProcessType(
            row?.processType,
          ),
        label:
          normalizeProcessText(
            row?.label,
          ),
      }))
    : [];
  const hasStoredHighlights = Array.isArray(
    payload?.nextWeekHighlights,
  );
  const nextWeekHighlights = hasStoredHighlights
    ? payload.nextWeekHighlights
        .map((value) =>
          normalizeProcessText(value).trim(),
        )
        .slice(0, 10)
    : WEEKLY_REPORT_PROCESSES.map(
        (process) => process.label,
      );

  const response = await fetch(
    '/templates/주간업무보고.xlsx',
  );

  if (!response.ok) {
    throw new Error(
      'public/templates/주간업무보고.xlsx 파일을 찾을 수 없습니다.',
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      '주간 업무 보고 양식의 첫 번째 시트를 찾지 못했습니다.',
    );
  }

  worksheet.getCell('B4').value =
    payload?.projectName ||
    request?.project_name ||
    '';
  worksheet.getCell('B5').value =
    period?.display ||
    request?.report_key ||
    '';
  const managerName =
    payload?.managerName ||
    request?.requester_name ||
    '';
  const approvalSlots = getApprovalSlots(
    request?.approval_steps,
  );

  worksheet.getCell('D1').value =
    request?.requester_position || '작성자';
  ['E1', 'F1', 'G1'].forEach((address, index) => {
    worksheet.getCell(address).value =
      approvalSlots[index].position || `${index + 1}차`;
  });

  applySignatureCell(
    worksheet,
    'D2',
    managerName,
  );
  applySignatureCell(
    worksheet,
    'E2',
    approvalSlots[0].name,
  );
  applySignatureCell(
    worksheet,
    'F2',
    approvalSlots[1].name,
  );
  applySignatureCell(
    worksheet,
    'G2',
    approvalSlots[2].name,
  );

  stats.forEach((row, index) => {
    const excelRow = 8 + index;

    if (excelRow > 17) return;

    worksheet.getCell(`C${excelRow}`).value =
      row?.progressText || '';
    worksheet.getCell(`D${excelRow}`).value =
      Number(row?.weeklyAmount) || '';
  });

  for (let index = 0; index < 10; index += 1) {
    worksheet.getCell(`E${8 + index}`).value =
      nextWeekHighlights[index] || '';
  }

  Object.entries(WEEKLY_EXCEL_INPUT_MAP).forEach(
    ([key, addresses]) => {
      const values = Array.isArray(form?.[key])
        ? form[key]
        : [];

      addresses.forEach((address, index) => {
        worksheet.getCell(address).value =
          values[index] || '';
      });
    },
  );

  const projectPart = sanitizeFilename(
    payload?.projectName ||
      request?.project_name ||
      '현장',
  );
  const datePart =
    period?.currentWeekStart ||
    String(request?.report_key || '')
      .replace(/^weekly:/, '') ||
    '기간';

  await saveWorkbook(
    workbook,
    `주간업무보고_${projectPart}_${datePart}.xlsx`,
  );
};

const downloadProposalReport = async (request) => {
  const payload = request?.payload || {};
  const reportLines = Array.isArray(
    payload?.reportLines,
  )
    ? payload.reportLines
    : [];

  const response = await fetch('/templates/품의보고.xlsx');

  if (!response.ok) {
    throw new Error(
      'public/templates/품의보고.xlsx 파일을 찾을 수 없습니다.',
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      '품의 보고 양식의 첫 번째 시트를 찾지 못했습니다.',
    );
  }

  const projectName =
    payload?.projectName ||
    request?.project_name ||
    '';
  const authorName =
    payload?.authorName ||
    request?.requester_name ||
    '';
  const title = payload?.title || '';
  const reportDate = payload?.reportDate || '';

  worksheet.getCell('B4').value = projectName;
  worksheet.getCell('B5').value = title;
  worksheet.getCell('B6').value =
    formatProposalDate(reportDate);
  worksheet.getCell('B7').value = authorName;

  const projectCell = worksheet.getCell('B4');
  projectCell.style = cloneValue(projectCell.style);

  ['B5', 'B6', 'B7'].forEach((address) => {
    const cell = worksheet.getCell(address);

    cell.style = {
      ...cloneValue(cell.style),
      font: {
        ...cloneValue(cell.font),
        name: '맑은 고딕',
        size: 11,
        bold: false,
        italic: false,
      },
    };
  });

  const approvalSlots = getApprovalSlots(
    request?.approval_steps,
  );

  worksheet.getCell('D3').value =
    request?.requester_position || '작성자';
  ['E3', 'F3', 'G3'].forEach((address, index) => {
    worksheet.getCell(address).value =
      approvalSlots[index].position || `${index + 1}차`;
  });

  applySignatureCell(
    worksheet,
    'D4',
    authorName,
  );
  applySignatureCell(
    worksheet,
    'E4',
    approvalSlots[0].name,
  );
  applySignatureCell(
    worksheet,
    'F4',
    approvalSlots[1].name,
  );
  applySignatureCell(
    worksheet,
    'G4',
    approvalSlots[2].name,
  );

  const narrative =
    payload?.narrative ||
    (title
      ? `당 현장의 ${title} 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.`
      : '관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.');

  worksheet.getCell('A13').value = narrative;

  for (
    let index = 0;
    index < MAX_PROPOSAL_LINES;
    index += 1
  ) {
    const cell = worksheet.getCell(`A${16 + index}`);

    cell.value = reportLines[index] || '';
    cell.alignment = {
      ...(cell.alignment || {}),
      vertical: 'middle',
      wrapText: true,
    };
  }

  worksheet.getCell('B35').value = projectName;
  worksheet.getCell('C35').value =
    payload?.itemName || '';

  if (payload?.amount) {
    worksheet.getCell('E35').value =
      Number(payload.amount);
    worksheet.getCell('E35').numFmt = '#,##0';
  } else {
    worksheet.getCell('E35').value = '';
  }

  worksheet.getCell('F35').value =
    payload?.note || '';

  const titlePart =
    sanitizeFilename(title) || '미작성';

  await saveWorkbook(
    workbook,
    `품의보고_${formatProposalDate(
      reportDate,
    )}_${titlePart}.xlsx`,
  );
};

export const downloadApprovalReportExcel = async (
  request,
) => {
  if (request?.report_type === 'weekly') {
    return downloadWeeklyReport(request);
  }

  if (request?.report_type === 'proposal') {
    return downloadProposalReport(request);
  }

  throw new Error(
    '현재 다운로드를 지원하지 않는 보고서 유형입니다.',
  );
};

const previewLabelSx = {
  p: 0.75,
  borderRight: '1px solid #374151',
  borderBottom: '1px solid #374151',
  bgcolor: '#f8fafc',
  fontSize: '0.72rem',
  fontWeight: 900,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

const previewValueSx = {
  p: 0.75,
  borderRight: '1px solid #374151',
  borderBottom: '1px solid #374151',
  fontSize: '0.72rem',
  display: 'flex',
  alignItems: 'center',
};

function ApprovalSignArea({
  authorName,
  authorPosition,
  approvalSteps = [],
}) {
  const approvalSlots = getApprovalSlots(approvalSteps);

  const signatures = [
    {
      role: authorPosition || '작성자',
      name: authorName,
    },
    ...approvalSlots.map((slot) => ({
      role: slot.position || `${slot.order}차`,
      name: slot.name,
    })),
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(4, minmax(90px, 1fr))',
        borderLeft: '1px solid #374151',
      }}
    >
      {signatures.map((signature) => (
        <Box
          key={signature.role}
          sx={{
            minWidth: 90,
            borderRight: '1px solid #374151',
          }}
        >
          <Box
            sx={{
              height: 29,
              borderBottom: '1px solid #374151',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 900,
            }}
          >
            {signature.role}
          </Box>
          <Box
            sx={{
              height: 75,
              px: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontFamily:
                '"Gungsuh", "궁서", serif',
              fontSize: '18px',
              fontWeight: 900,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
            }}
          >
            {signature.name || ''}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function WeeklyPreview({ request }) {
  const payload = request?.payload || {};
  const period = payload?.period || {};
  const form = payload?.form || {};
  const stats = Array.isArray(payload?.stats)
    ? payload.stats.map((row) => ({
        ...row,
        processType:
          normalizeStoredProcessType(
            row?.processType,
          ),
        label:
          normalizeProcessText(
            row?.label,
          ),
      }))
    : [];
  const hasStoredHighlights = Array.isArray(
    payload?.nextWeekHighlights,
  );
  const nextWeekHighlights = hasStoredHighlights
    ? payload.nextWeekHighlights
        .map((value) =>
          normalizeProcessText(value).trim(),
        )
        .slice(0, 10)
    : WEEKLY_REPORT_PROCESSES.map(
        (process) => process.label,
      );

  const statMap = new Map(
    stats.map((row) => {
      const normalizedProcessType =
        normalizeStoredProcessType(
          row?.processType,
        );

      return [
        normalizedProcessType,
        {
          ...row,
          processType:
            normalizedProcessType,
          label:
            normalizeProcessText(
              row?.label,
            ),
        },
      ];
    }),
  );

  const workRows = WEEKLY_REPORT_PROCESSES.map(
    (process) => ({
      ...process,
      ...(statMap.get(process.processType) || {}),
    }),
  );

  const projectName =
    payload?.projectName ||
    request?.project_name ||
    '';
  const managerName =
    payload?.managerName ||
    request?.requester_name ||
    '';

  return (
    <Paper
      variant="outlined"
      sx={{
        width: 900,
        minHeight: 1060,
        mx: 'auto',
        bgcolor: '#ffffff',
        color: '#111827',
        borderColor: '#94a3b8',
        boxShadow:
          '0 8px 28px rgba(15, 23, 42, 0.12)',
        fontFamily:
          '"Malgun Gothic", "맑은 고딕", sans-serif',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(360px, 1fr) 400px',
          borderTop: '1px solid #374151',
          borderLeft: '1px solid #374151',
        }}
      >
        <Box
          sx={{
            borderRight: '1px solid #374151',
            borderBottom: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 104,
          }}
        >
          <Typography
            sx={{
              fontSize: '1.75rem',
              fontWeight: 900,
              letterSpacing: '0.12em',
            }}
          >
            주간업무보고
          </Typography>
        </Box>

        <ApprovalSignArea
          authorName={managerName}
          authorPosition={request?.requester_position}
          approvalSteps={request?.approval_steps}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr',
          borderLeft: '1px solid #374151',
        }}
      >
        <Box sx={previewLabelSx}>현장명</Box>
        <Box sx={previewValueSx}>{projectName}</Box>
        <Box sx={previewLabelSx}>기간</Box>
        <Box sx={previewValueSx}>
          {period?.display ||
            request?.report_key ||
            '-'}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            '95px 1fr 115px 95px 1fr 115px 95px',
          borderTop: '1px solid #374151',
          borderLeft: '1px solid #374151',
        }}
      >
        <Box
          sx={{
            gridRow: 'span 2',
            ...previewLabelSx,
          }}
        >
          구분
        </Box>

        <Box
          sx={{
            gridColumn: 'span 3',
            ...previewLabelSx,
          }}
        >
          금주현황
        </Box>

        <Box
          sx={{
            gridColumn: 'span 3',
            ...previewLabelSx,
          }}
        >
          주요보고
        </Box>

        {['공종명', '진도율', '1주간 작업량'].map(
          (label) => (
            <Box key={label} sx={previewLabelSx}>
              {label}
            </Box>
          ),
        )}

        <Box
          sx={{
            gridColumn: 'span 3',
            ...previewLabelSx,
          }}
        >
          내용
        </Box>

        {workRows.map((row, index) => (
          <React.Fragment key={row.processType}>
            <Box sx={previewValueSx}>
              {index === 0 ? '공사사항' : ''}
            </Box>
            <Box sx={previewValueSx}>{row.label}</Box>
            <Box
              sx={{
                ...previewValueSx,
                justifyContent: 'center',
              }}
            >
              {row.progressText || '0/0(0%)'}
            </Box>
            <Box
              sx={{
                ...previewValueSx,
                justifyContent: 'center',
              }}
            >
              {Number(row.weeklyAmount) || 0}세대
            </Box>
            <Box
              sx={{
                gridColumn: 'span 3',
                ...previewValueSx,
                minHeight: 32,
                color: nextWeekHighlights[index]
                  ? '#92400e'
                  : '#94a3b8',
                fontWeight: nextWeekHighlights[index]
                  ? 800
                  : 400,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {nextWeekHighlights[index] || ''}
            </Box>
          </React.Fragment>
        ))}
      </Box>

      {WEEKLY_SECTIONS.map((section) => {
        const currentValues = Array.isArray(
          form?.[section.currentKey],
        )
          ? form[section.currentKey]
          : [];
        const nextValues = Array.isArray(
          form?.[section.nextKey],
        )
          ? form[section.nextKey]
          : [];

        return (
          <Box
            key={section.currentKey}
            sx={{
              display: 'grid',
              gridTemplateColumns: '95px 1fr 1fr',
              minHeight: section.count * 30 + 28,
              borderLeft: '1px solid #374151',
            }}
          >
            <Box
              sx={{
                ...previewLabelSx,
                whiteSpace: 'pre-line',
              }}
            >
              {section.title}
              {section.subtitle
                ? `\n${section.subtitle}`
                : ''}
            </Box>

            {[currentValues, nextValues].map(
              (values, sideIndex) => (
                <Box
                  key={`${section.currentKey}-${sideIndex}`}
                  sx={{
                    borderRight:
                      '1px solid #374151',
                    borderBottom:
                      '1px solid #374151',
                  }}
                >
                  <Box
                    sx={{
                      height: 28,
                      px: 0.7,
                      borderBottom:
                        '1px solid #9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '0.68rem',
                      fontWeight: 900,
                    }}
                  >
                    □{section.title}
                  </Box>

                  {Array.from(
                    { length: section.count },
                    (_, index) => (
                      <Box
                        key={index}
                        sx={{
                          minHeight: 30,
                          px: 0.8,
                          py: 0.45,
                          borderBottom:
                            index ===
                            section.count - 1
                              ? 'none'
                              : '1px dotted #cbd5e1',
                          fontSize: '0.68rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {values[index] || ''}
                      </Box>
                    ),
                  )}
                </Box>
              ),
            )}
          </Box>
        );
      })}
    </Paper>
  );
}

function ProposalPreview({ request }) {
  const payload = request?.payload || {};
  const projectName =
    payload?.projectName ||
    request?.project_name ||
    '';
  const authorName =
    payload?.authorName ||
    request?.requester_name ||
    '';
  const title = payload?.title || '';
  const reportDate = payload?.reportDate || '';
  const reportLines = Array.isArray(
    payload?.reportLines,
  )
    ? payload.reportLines
    : [];
  const narrative =
    payload?.narrative ||
    (title
      ? `당 현장의 ${title} 발생으로 관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.`
      : '관련 내용을 아래와 같이 보고드리오니 검토 후 재가 바랍니다.');

  return (
    <Paper
      variant="outlined"
      sx={{
        width: 820,
        minHeight: 1040,
        mx: 'auto',
        bgcolor: '#ffffff',
        color: '#111827',
        borderColor: '#94a3b8',
        boxShadow:
          '0 8px 28px rgba(15, 23, 42, 0.12)',
        fontFamily:
          '"Malgun Gothic", "맑은 고딕", sans-serif',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(320px, 1fr) 400px',
          borderTop: '1px solid #374151',
          borderLeft: '1px solid #374151',
        }}
      >
        <Box
          sx={{
            borderRight: '1px solid #374151',
            borderBottom: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 104,
          }}
        >
          <Typography
            sx={{
              fontSize: '1.65rem',
              fontWeight: 900,
              letterSpacing: '0.24em',
            }}
          >
            품 의 보 고 서
          </Typography>
        </Box>

        <ApprovalSignArea
          authorName={authorName}
          authorPosition={request?.requester_position}
          approvalSteps={request?.approval_steps}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr',
          borderLeft: '1px solid #374151',
        }}
      >
        {[
          ['현장명', projectName],
          ['제목', title],
          ['작성일', formatProposalDate(reportDate)],
          ['작성자', authorName],
        ].map(([label, value]) => (
          <React.Fragment key={label}>
            <Box sx={previewLabelSx}>{label}</Box>
            <Box sx={previewValueSx}>{value}</Box>
          </React.Fragment>
        ))}
      </Box>

      <Box
        sx={{
          p: 2.2,
          minHeight: 70,
          borderLeft: '1px solid #374151',
          borderRight: '1px solid #374151',
          borderBottom: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontSize: '0.78rem',
          lineHeight: 1.7,
        }}
      >
        {narrative}
      </Box>

      <Box
        sx={{
          px: 1,
          py: 0.8,
          borderLeft: '1px solid #374151',
          borderRight: '1px solid #374151',
          borderBottom: '1px solid #374151',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 900,
          letterSpacing: '0.08em',
        }}
      >
        *** 보고내용 ***
      </Box>

      <Box
        sx={{
          minHeight: 520,
          borderLeft: '1px solid #374151',
          borderRight: '1px solid #374151',
          borderBottom: '1px solid #374151',
        }}
      >
        {Array.from(
          { length: MAX_PROPOSAL_LINES },
          (_, index) => (
            <Box
              key={index}
              sx={{
                minHeight: 31,
                px: 1.2,
                py: 0.6,
                borderBottom:
                  index === MAX_PROPOSAL_LINES - 1
                    ? 'none'
                    : '1px dotted #cbd5e1',
                fontSize: '0.72rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {reportLines[index] || ''}
            </Box>
          ),
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            '100px 1fr 90px 150px 90px 1fr',
          borderLeft: '1px solid #374151',
        }}
      >
        <Box sx={previewLabelSx}>현장명</Box>
        <Box sx={previewValueSx}>{projectName}</Box>
        <Box sx={previewLabelSx}>품목</Box>
        <Box sx={previewValueSx}>
          {payload?.itemName || ''}
        </Box>
        <Box sx={previewLabelSx}>금액</Box>
        <Box sx={previewValueSx}>
          {payload?.amount
            ? `${Number(
                payload.amount,
              ).toLocaleString()}원`
            : ''}
        </Box>

        <Box sx={previewLabelSx}>비고</Box>
        <Box
          sx={{
            ...previewValueSx,
            gridColumn: '2 / 7',
          }}
        >
          {payload?.note || ''}
        </Box>
      </Box>
    </Paper>
  );
}

export default function ApprovalReportViewer({
  open,
  onClose,
  request,
}) {
  const [downloading, setDownloading] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setErrorMessage('');

    try {
      await downloadApprovalReportExcel(request);
    } catch (error) {
      console.error(
        '결재 보고서 XLS 다운로드 실패:',
        error,
      );
      setErrorMessage(
        error?.message ||
          '보고서 파일을 다운로드하지 못했습니다.',
      );
    } finally {
      setDownloading(false);
    }
  };

  const supported = ['weekly', 'proposal'].includes(
    request?.report_type,
  );

  return (
    <Dialog
      open={open}
      onClose={downloading ? undefined : onClose}
      fullWidth
      maxWidth="xl"
      PaperProps={{
        sx: {
          height: '92vh',
          bgcolor: '#f1f5f9',
        },
      }}
    >
      <DialogTitle
        sx={{
          py: 1.25,
          bgcolor: '#ffffff',
          color: '#0f172a',
          fontSize: '0.95rem',
          fontWeight: 900,
        }}
      >
        보고서 미리보기
        <Typography
          component="span"
          sx={{
            ml: 1,
            color: '#64748b',
            fontSize: '0.7rem',
            fontWeight: 500,
          }}
        >
          {request?.report_title || ''}
        </Typography>
      </DialogTitle>

      <Divider />

      <DialogContent
        sx={{
          p: 1.5,
          overflow: 'auto',
          bgcolor: '#e2e8f0',
        }}
      >
        {errorMessage && (
          <Alert
            severity="error"
            sx={{ mb: 1.2, fontSize: '0.72rem' }}
          >
            {errorMessage}
          </Alert>
        )}

        {!supported ? (
          <Alert severity="warning">
            현재 미리보기를 지원하지 않는 보고서
            유형입니다.
          </Alert>
        ) : request?.report_type === 'weekly' ? (
          <WeeklyPreview request={request} />
        ) : (
          <ProposalPreview request={request} />
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 1.5,
          py: 1.1,
          bgcolor: '#ffffff',
          borderTop: '1px solid #cbd5e1',
        }}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={onClose}
          disabled={downloading}
          sx={{
            minWidth: 64,
            whiteSpace: 'nowrap',
          }}
        >
          닫기
        </Button>

        <Button
          size="small"
          variant="contained"
          color="success"
          onClick={handleDownload}
          disabled={!supported || downloading}
          sx={{
            minWidth: 96,
            whiteSpace: 'nowrap',
            fontWeight: 900,
          }}
        >
          {downloading ? '생성 중...' : 'XLS 다운로드'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
