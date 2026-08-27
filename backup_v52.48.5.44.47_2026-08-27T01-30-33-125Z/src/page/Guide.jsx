// v52.48.5.44.46 시스템 가이드 메뉴 기본 구조 추가
import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import SystemPageTitle from '../components/SystemPageTitle.jsx';

const GUIDE_STATUS = {
  READY: 'ready',
  PREPARING: 'preparing',
};

const GUIDE_GROUPS = [
  {
    id: 'admin-dashboard-group',
    label: 'Dashboard',
    direct: true,
    items: [{ id: 'admin-dashboard', label: 'Dashboard' }],
  },
  {
    id: 'project-management-group',
    label: '현장관리',
    direct: true,
    items: [{ id: 'project-management', label: '현장관리' }],
  },
  {
    id: 'user-management-group',
    label: '회원관리',
    direct: true,
    items: [{ id: 'user-management', label: '회원관리' }],
  },
  {
    id: 'attendance-group',
    label: '근태관리',
    direct: true,
    items: [{ id: 'attendance', label: '근태관리' }],
  },
  {
    id: 'approval-inbox-group',
    label: '결재함',
    direct: true,
    items: [{ id: 'approval-inbox', label: '결재함' }],
  },
  {
    id: 'weekly-overview-group',
    label: '주간업무총괄',
    items: [
      { id: 'weekly-overview', label: '주간업무작성' },
      { id: 'weekly-overview-archive', label: '주간업무보관' },
    ],
  },
  {
    id: 'main-group',
    label: 'Main',
    direct: true,
    items: [{ id: 'main', label: 'Main' }],
  },
  {
    id: 'organization-chart-group',
    label: '조직도',
    direct: true,
    items: [{ id: 'organization-chart', label: '조직도' }],
  },
  {
    id: 'daily-group',
    label: '공사일보관리',
    items: [
      { id: 'daily', label: '출력일보작성' },
      { id: 'daily-monthly-workers', label: '금월 투입현황' },
      { id: 'daily-cumulative-workers', label: '누계투입조회' },
    ],
  },
  {
    id: 'progress-group',
    label: '공정진척관리',
    items: [
      { id: 'progress-input', label: '공종별 현황 입력' },
      { id: 'progress-multi', label: '다중 공종 진척 현황' },
      { id: 'progress-daily', label: '일별 완료 집계' },
      { id: 'progress-weekly', label: '주별 완료 집계' },
      { id: 'progress-monthly', label: '월별 완료 집계' },
    ],
  },
  {
    id: 'option-group',
    label: '옵션관리',
    items: [
      { id: 'option-insulation-status', label: '옵션현황(단열)' },
      { id: 'option-selection-status', label: '옵션현황(선택)' },
      { id: 'option-comparison', label: '옵션별 비교' },
    ],
  },
  {
    id: 'household-quantity-group',
    label: '세대물량관리',
    direct: true,
    items: [{ id: 'household-quantity-management', label: '세대물량관리' }],
  },
  {
    id: 'drawing-quantity-group',
    label: '타입별 도면분석',
    direct: true,
    items: [{ id: 'drawing-quantity', label: '타입별 도면분석' }],
  },
  {
    id: 'material-group',
    label: '자재관리',
    items: [
      { id: 'material-unit-price', label: '일위대가작성' },
      {
        id: 'material-order',
        label: '자재발주작성',
        systemPreparing: true,
      },
      { id: 'material-input-status', label: '자재투입현황' },
    ],
  },
  {
    id: 'payment-group',
    label: '기성관리',
    items: [
      { id: 'payment-claim', label: '기성내역서작성' },
      { id: 'payment-contract-mapping', label: '계약품목 공정연결' },
      {
        id: 'payment-sales-status',
        label: '매입매출현황',
        systemPreparing: true,
      },
    ],
  },
  {
    id: 'labor-group',
    label: '노임관리',
    items: [
      { id: 'labor-monthly', label: '월별 노임작성' },
      { id: 'labor-worker-master', label: '근로자 정보관리' },
      { id: 'labor-contract', label: '근로계약서작성' },
      { id: 'labor-cost', label: '공정별 노임작성' },
      {
        id: 'labor-documents',
        label: '노임서류작성',
        systemPreparing: true,
      },
    ],
  },
  {
    id: 'report-group',
    label: '업무 보고 관리',
    items: [
      { id: 'report-weekly', label: '주간 업무 보고' },
      { id: 'report-expense-resolution', label: '지출결의서 작성' },
      { id: 'report-approval', label: '품의 보고' },
      {
        id: 'report-outsourcing-approval',
        label: '외주 품의 보고',
        systemPreparing: true,
      },
      {
        id: 'report-accident',
        label: '사고 경위 보고',
        systemPreparing: true,
      },
    ],
  },
];

const GUIDE_CONTENT = {};

const getGuideStatus = (guideId) =>
  GUIDE_CONTENT[guideId] ? GUIDE_STATUS.READY : GUIDE_STATUS.PREPARING;

const statusChipSx = {
  height: 19,
  '& .MuiChip-label': {
    px: 0.7,
    fontSize: '0.62rem',
    fontWeight: 800,
  },
};

export default function Guide() {
  const [selectedGuideId, setSelectedGuideId] = useState('main');
  const [expandedGroups, setExpandedGroups] = useState(() =>
    new Set(GUIDE_GROUPS.filter((group) => !group.direct).map((group) => group.id)),
  );

  const flatItems = useMemo(
    () => GUIDE_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        parentLabel: group.direct ? '' : group.label,
      })),
    ),
    [],
  );

  const selectedItem =
    flatItems.find((item) => item.id === selectedGuideId) || flatItems[0];

  const readyCount = flatItems.filter(
    (item) => getGuideStatus(item.id) === GUIDE_STATUS.READY,
  ).length;

  const toggleGroup = (groupId) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderGuideStatus = (item) => {
    const status = getGuideStatus(item.id);

    if (status === GUIDE_STATUS.READY) {
      return (
        <Chip
          label="완료"
          size="small"
          sx={{
            ...statusChipSx,
            color: '#166534',
            bgcolor: '#dcfce7',
          }}
        />
      );
    }

    return (
      <Chip
        label="준비중"
        size="small"
        sx={{
          ...statusChipSx,
          color: '#64748b',
          bgcolor: '#f1f5f9',
        }}
      />
    );
  };

  const renderItemButton = (item, nested = false) => {
    const selected = item.id === selectedGuideId;

    return (
      <ListItemButton
        key={item.id}
        selected={selected}
        onClick={() => setSelectedGuideId(item.id)}
        sx={{
          minHeight: 34,
          ml: nested ? 1.5 : 0,
          mb: 0.2,
          pl: nested ? 1.5 : 1.2,
          pr: 0.8,
          py: 0.25,
          borderRadius: 1,
          '&.Mui-selected': {
            bgcolor: '#eff6ff',
            color: '#1d4ed8',
          },
          '&.Mui-selected:hover': {
            bgcolor: '#dbeafe',
          },
        }}
      >
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            noWrap: true,
            fontSize: '0.76rem',
            fontWeight: selected ? 800 : 600,
          }}
        />
        <Stack direction="row" spacing={0.45} alignItems="center">
          {item.systemPreparing && (
            <Chip
              label="기능 준비중"
              size="small"
              sx={{
                ...statusChipSx,
                color: '#92400e',
                bgcolor: '#fef3c7',
              }}
            />
          )}
          {renderGuideStatus(item)}
        </Stack>
      </ListItemButton>
    );
  };

  const content = GUIDE_CONTENT[selectedItem?.id] || null;

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
          px: 1.25,
          py: 1,
          borderColor: '#dbe3ed',
          bgcolor: '#ffffff',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <SystemPageTitle
            title="시스템 가이드"
            meta="실제 시스템 메뉴 구조와 동일하게 구성되며, 가이드가 완료되지 않은 메뉴는 준비중으로 표시됩니다."
          />
          <Stack direction="row" spacing={0.7} alignItems="center">
            <Chip
              label={`가이드 완료 ${readyCount}`}
              size="small"
              sx={{
                height: 24,
                color: '#166534',
                bgcolor: '#dcfce7',
                fontWeight: 800,
              }}
            />
            <Chip
              label={`전체 ${flatItems.length}`}
              size="small"
              sx={{
                height: 24,
                color: '#334155',
                bgcolor: '#f1f5f9',
                fontWeight: 800,
              }}
            />
          </Stack>
        </Stack>
      </Paper>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '360px minmax(0, 1fr)' },
          gap: 1,
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            minHeight: 0,
            overflow: 'auto',
            borderColor: '#dbe3ed',
            bgcolor: '#ffffff',
          }}
        >
          <Box sx={{ px: 1.25, py: 1 }}>
            <Typography sx={{ color: '#334155', fontSize: '0.78rem', fontWeight: 900 }}>
              가이드 메뉴
            </Typography>
            <Typography sx={{ mt: 0.2, color: '#94a3b8', fontSize: '0.67rem' }}>
              메뉴를 선택하면 우측에서 가이드 내용을 확인할 수 있습니다.
            </Typography>
          </Box>
          <Divider />
          <List dense disablePadding sx={{ p: 0.75 }}>
            {GUIDE_GROUPS.map((group) => {
              if (group.direct) return renderItemButton(group.items[0]);

              const expanded = expandedGroups.has(group.id);

              return (
                <Box key={group.id} sx={{ mb: 0.2 }}>
                  <ListItemButton
                    onClick={() => toggleGroup(group.id)}
                    sx={{
                      minHeight: 36,
                      px: 1.2,
                      py: 0.25,
                      borderRadius: 1,
                      color: '#334155',
                      '&:hover': { bgcolor: '#f8fafc' },
                    }}
                  >
                    <ListItemText
                      primary={group.label}
                      primaryTypographyProps={{
                        fontSize: '0.77rem',
                        fontWeight: 900,
                      }}
                    />
                    {expanded ? (
                      <ExpandLessRoundedIcon sx={{ fontSize: 18, color: '#64748b' }} />
                    ) : (
                      <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: '#64748b' }} />
                    )}
                  </ListItemButton>
                  <Collapse in={expanded} timeout="auto" unmountOnExit={false}>
                    {group.items.map((item) => renderItemButton(item, true))}
                  </Collapse>
                </Box>
              );
            })}
          </List>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            minWidth: 0,
            minHeight: 0,
            overflow: 'auto',
            borderColor: '#dbe3ed',
            bgcolor: '#ffffff',
          }}
        >
          <Box sx={{ px: 1.75, py: 1.4 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700 }}>
                  {selectedItem?.parentLabel
                    ? `${selectedItem.parentLabel} > ${selectedItem.label}`
                    : selectedItem?.label}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    color: '#0f172a',
                    fontSize: '1.08rem',
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {selectedItem?.label}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {selectedItem?.systemPreparing && (
                  <Chip
                    label="기능 준비중"
                    size="small"
                    sx={{
                      height: 23,
                      color: '#92400e',
                      bgcolor: '#fef3c7',
                      fontWeight: 800,
                    }}
                  />
                )}
                {selectedItem && renderGuideStatus(selectedItem)}
              </Stack>
            </Stack>
          </Box>
          <Divider />

          {content ? (
            <Box sx={{ p: 1.75 }}>{content}</Box>
          ) : (
            <Box
              sx={{
                minHeight: 360,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
              }}
            >
              <Stack spacing={1} alignItems="center" sx={{ maxWidth: 560, textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#64748b',
                    bgcolor: '#f1f5f9',
                  }}
                >
                  <MenuBookRoundedIcon sx={{ fontSize: 29 }} />
                </Box>
                <Typography sx={{ color: '#334155', fontSize: '0.9rem', fontWeight: 900 }}>
                  가이드 준비중
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.76rem', lineHeight: 1.7 }}>
                  해당 메뉴의 가이드가 아직 작성되지 않았습니다. 가이드가 완료되면 이 영역에 화면 목적,
                  클릭 순서, 버튼 설명, 입력 방법과 주의사항을 단계별로 표시합니다.
                </Typography>
                {selectedItem?.systemPreparing && (
                  <Typography sx={{ color: '#92400e', fontSize: '0.71rem', fontWeight: 700 }}>
                    이 메뉴는 실제 시스템 기능도 현재 준비중 상태입니다.
                  </Typography>
                )}
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
