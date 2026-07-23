import React, { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EngineeringIcon from '@mui/icons-material/Engineering';
import AssessmentIcon from '@mui/icons-material/Assessment';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { fetchPendingApprovalSummary } from '../utils/approvalQueries.js';

const dailyMenus = [
  { value: 'daily', label: '출력일보작성' },
  {
    value: 'daily-monthly-workers',
    label: '금월 투입현황',
  },
  {
    value: 'daily-cumulative-workers',
    label: '누계투입조회',
  },
];

const weeklyOverviewMenus = [
  {
    value: 'weekly-overview',
    label: '주간업무작성',
  },
  {
    value: 'weekly-overview-archive',
    label: '주간업무보관',
  },
];

const progressMenus = [
  { value: 'progress-input', label: '공종별 현황 입력' },
  { value: 'progress-multi', label: '다중 공종 진척 현황' },
  { value: 'progress-daily', label: '일별 완료 집계' },
  { value: 'progress-weekly', label: '주별 완료 집계' },
  { value: 'progress-monthly', label: '월별 완료 집계' },
];

const materialMenus = [
  {
    value: 'material-order',
    label: '자재발주작성',
    disabled: true,
    statusLabel: '준비중',
  },
  {
    value: 'material-input-status',
    label: '자재투입현황',
  },
];

const laborMenus = [
  {
    value: 'labor-contract',
    label: '근로계약서작성',
  },
  {
    value: 'labor-documents',
    label: '노임서류작성',
    disabled: true,
    statusLabel: '작성중',
  },
];

const paymentMenus = [
  {
    value: 'payment-claim',
    label: '기성내역서작성',
  },
  {
    value: 'payment-sales-status',
    label: '매입매출현황',
    disabled: true,
    statusLabel: '다음단계',
  },
];

const reportMenus = [
  {
    value: 'report-weekly',
    label: '주간 업무 보고',
  },
  {
    value: 'report-approval',
    label: '품의 보고',
  },
  {
    value: 'report-outsourcing-approval',
    label: '외주 품의 보고',
    disabled: true,
    statusLabel: '준비중',
  },
  {
    value: 'report-accident',
    label: '사고 경위 보고',
    disabled: true,
    statusLabel: '준비중',
  },
];

const topMenuSx = (selected) => ({
  minHeight: 39,
  mb: 0.25,
  px: 1.25,
  py: 0.25,
  borderRadius: 1,
  color: selected ? '#ffffff' : '#cbd5e1',
  bgcolor: selected ? '#0284c7' : 'transparent',
  '&.Mui-selected': {
    bgcolor: '#0284c7',
    color: '#ffffff',
  },
  '&.Mui-selected:hover': {
    bgcolor: '#0369a1',
  },
  '&:hover': {
    bgcolor: 'rgba(255,255,255,0.08)',
  },
});

const subMenuSx = (selected) => ({
  minHeight: 31,
  mb: 0.05,
  pl: 1.35,
  pr: 0.75,
  py: 0,
  borderRadius: 0.75,
  color: selected ? '#ffffff' : '#aebbd0',
  bgcolor: selected ? '#0f766e' : 'transparent',
  '&.Mui-selected': {
    bgcolor: '#0f766e',
    color: '#ffffff',
  },
  '&.Mui-selected:hover': {
    bgcolor: '#115e59',
  },
  '&:hover': {
    bgcolor: 'rgba(255,255,255,0.07)',
    color: '#ffffff',
  },
});

function SubMenuList({ items, currentView, onViewChange }) {
  return (
    <Box
      sx={{
        ml: 1.25,
        mr: 0.25,
        pl: 0.7,
        py: 0.15,
        borderLeft: '1px solid #334155',
      }}
    >
      {items.map((item) => {
        const selected = currentView === item.value;

        return (
          <ListItemButton
            key={item.value}
            selected={
              selected &&
              !item.disabled
            }
            disabled={
              Boolean(
                item.disabled,
              )
            }
            onClick={() => {
              if (
                item.disabled
              ) {
                return;
              }

              onViewChange(
                item.value,
              );
            }}
            sx={{
              ...subMenuSx(
                selected &&
                  !item.disabled,
              ),
              '&.Mui-disabled': {
                opacity: 1,
                color:
                  '#64748b',
                cursor:
                  'not-allowed',
              },
            }}
          >
            <ListItemText
              primary={
                item.label
              }
              primaryTypographyProps={{
                noWrap: true,
                fontSize:
                  '0.72rem',
                lineHeight: 1.2,
                fontWeight:
                  selected &&
                  !item.disabled
                    ? 700
                    : 500,
              }}
            />

            {item.statusLabel && (
              <Box
                component="span"
                sx={{
                  ml: 0.5,
                  px: 0.55,
                  py: 0.05,
                  borderRadius:
                    10,
                  bgcolor:
                    'rgba(100,116,139,0.22)',
                  color:
                    '#94a3b8',
                  fontSize:
                    '0.58rem',
                  fontWeight:
                    800,
                  lineHeight:
                    1.4,
                  whiteSpace:
                    'nowrap',
                }}
              >
                {
                  item.statusLabel
                }
              </Box>
            )}
          </ListItemButton>
        );
      })}
    </Box>
  );
}

export default function Sidebar({
  currentView,
  onViewChange,
  drawerOpen = true,
  userRole = '담당자',
}) {
  const isManagementRole = ['관리자', '최고관리자'].includes(userRole);
  const isDailyView = [
    'daily',
    'daily-monthly-workers',
    'daily-cumulative-workers',
  ].includes(currentView);
  const isWeeklyOverviewView = [
    'weekly-overview',
    'weekly-overview-archive',
  ].includes(currentView);

  const isProgressView =
    currentView?.startsWith(
      'progress-',
    );

  const isMaterialView =
    currentView?.startsWith(
      'material-',
    );

  const isLaborView =
    currentView?.startsWith(
      'labor-',
    );

  const isPaymentView =
    currentView?.startsWith(
      'payment-',
    );

  const isReportView =
    currentView?.startsWith(
      'report-',
    );

  const [dailyOpen, setDailyOpen] = useState(isDailyView);
  const [
    weeklyOverviewOpen,
    setWeeklyOverviewOpen,
  ] = useState(
    isWeeklyOverviewView,
  );
  const [
    progressOpen,
    setProgressOpen,
  ] = useState(
    isProgressView,
  );

  const [
    materialOpen,
    setMaterialOpen,
  ] = useState(
    isMaterialView,
  );

  const [
    laborOpen,
    setLaborOpen,
  ] = useState(
    isLaborView,
  );

  const [
    paymentOpen,
    setPaymentOpen,
  ] = useState(
    isPaymentView,
  );

  const [
    reportOpen,
    setReportOpen,
  ] = useState(
    isReportView,
  );
  const [approvalPendingCount, setApprovalPendingCount] =
    useState(0);

  useEffect(() => {
    if (isDailyView) setDailyOpen(true);
  }, [isDailyView]);

  useEffect(() => {
    if (isWeeklyOverviewView) {
      setWeeklyOverviewOpen(true);
    }
  }, [isWeeklyOverviewView]);

  useEffect(() => {
    if (isProgressView) {
      setProgressOpen(true);
    }
  }, [isProgressView]);

  useEffect(() => {
    if (isMaterialView) {
      setMaterialOpen(true);
    }
  }, [isMaterialView]);

  useEffect(() => {
    if (isLaborView) {
      setLaborOpen(true);
    }
  }, [isLaborView]);

  useEffect(() => {
    if (isPaymentView) {
      setPaymentOpen(true);
    }
  }, [isPaymentView]);

  useEffect(() => {
    if (isReportView) {
      setReportOpen(true);
    }
  }, [isReportView]);

  useEffect(() => {
    let active = true;

    const loadApprovalCount = async () => {
      try {
        const result =
          await fetchPendingApprovalSummary();

        if (active) {
          setApprovalPendingCount(
            result.counts.total,
          );
        }
      } catch (error) {
        console.error(
          '사이드 결재 대기 건수 조회 오류:',
          error,
        );

        if (active) {
          setApprovalPendingCount(0);
        }
      }
    };

    loadApprovalCount();

    const timer = window.setInterval(
      loadApprovalCount,
      20 * 1000,
    );

    const handleFocus = () => {
      loadApprovalCount();
    };

    const handleApprovalChanged = () => {
      loadApprovalCount();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(
      'approval-workflow-changed',
      handleApprovalChanged,
    );

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(
        'approval-workflow-changed',
        handleApprovalChanged,
      );
    };
  }, [currentView]);

  const handleViewChange = (view) => {
    if (typeof onViewChange === 'function') onViewChange(view);
  };

  return (
    <List sx={{ px: 0.75, py: 0.75 }}>
      {isManagementRole && (
        <Tooltip
          title={drawerOpen ? '' : 'Dashboard'}
          placement="right"
          arrow
        >
          <ListItemButton
            selected={currentView === 'admin-dashboard'}
            onClick={() => handleViewChange('admin-dashboard')}
            sx={topMenuSx(currentView === 'admin-dashboard')}
          >
            <ListItemIcon
              sx={{
                minWidth: 34,
                color: 'inherit',
                justifyContent: 'center',
              }}
            >
              <AssessmentIcon fontSize="small" />
            </ListItemIcon>

            <ListItemText
              primary="Dashboard"
              primaryTypographyProps={{
                noWrap: true,
                fontSize: '0.8rem',
                fontWeight:
                  currentView === 'admin-dashboard' ? 700 : 500,
              }}
              sx={{ opacity: drawerOpen ? 1 : 0 }}
            />
          </ListItemButton>
        </Tooltip>
      )}

      <Tooltip
        title={
          drawerOpen
            ? ''
            : `결재함${
                approvalPendingCount > 0
                  ? ` (${approvalPendingCount})`
                  : ''
              }`
        }
        placement="right"
        arrow
      >
        <ListItemButton
          selected={currentView === 'approval-inbox'}
          onClick={() =>
            handleViewChange('approval-inbox')
          }
          sx={topMenuSx(
            currentView === 'approval-inbox',
          )}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent: 'center',
            }}
          >
            <Badge
              badgeContent={approvalPendingCount}
              color="error"
              max={99}
              invisible={approvalPendingCount === 0}
              sx={{
                '& .MuiBadge-badge': {
                  minWidth: 16,
                  height: 16,
                  px: 0.35,
                  fontSize: '0.58rem',
                  fontWeight: 900,
                },
              }}
            >
              <FactCheckOutlinedIcon fontSize="small" />
            </Badge>
          </ListItemIcon>

          <ListItemText
            primary="결재함"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight:
                currentView === 'approval-inbox'
                  ? 700
                  : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />

          {drawerOpen && approvalPendingCount > 0 && (
            <Box
              sx={{
                minWidth: 25,
                px: 0.65,
                py: 0.15,
                borderRadius: 999,
                textAlign: 'center',
                color: '#ffffff',
                bgcolor: '#dc2626',
                fontSize: '0.62rem',
                fontWeight: 900,
              }}
            >
              {approvalPendingCount > 99
                ? '99+'
                : approvalPendingCount}
            </Box>
          )}
        </ListItemButton>
      </Tooltip>

      {isManagementRole && (
        <>
          <Tooltip
            title={
              drawerOpen
                ? ''
                : '주간업무총괄'
            }
            placement="right"
            arrow
          >
            <ListItemButton
              selected={
                isWeeklyOverviewView
              }
              onClick={() =>
                setWeeklyOverviewOpen(
                  (previous) =>
                    !previous,
                )
              }
              sx={topMenuSx(
                isWeeklyOverviewView,
              )}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  color: 'inherit',
                  justifyContent:
                    'center',
                }}
              >
                <AssessmentIcon fontSize="small" />
              </ListItemIcon>

              <ListItemText
                primary="주간업무총괄"
                primaryTypographyProps={{
                  noWrap: true,
                  fontSize: '0.8rem',
                  fontWeight:
                    isWeeklyOverviewView
                      ? 700
                      : 500,
                }}
                sx={{
                  opacity:
                    drawerOpen
                      ? 1
                      : 0,
                }}
              />

              {drawerOpen &&
                (weeklyOverviewOpen ? (
                  <ExpandLessIcon fontSize="small" />
                ) : (
                  <ExpandMoreIcon fontSize="small" />
                ))}
            </ListItemButton>
          </Tooltip>

          <Collapse
            in={
              drawerOpen &&
              weeklyOverviewOpen
            }
            timeout="auto"
            unmountOnExit
          >
            <SubMenuList
              items={
                weeklyOverviewMenus
              }
              currentView={
                currentView
              }
              onViewChange={
                handleViewChange
              }
            />
          </Collapse>
        </>
      )}

      <Tooltip
        title={drawerOpen ? '' : 'Main'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={currentView === 'main'}
          onClick={() => handleViewChange('main')}
          sx={topMenuSx(currentView === 'main')}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent: 'center',
            }}
          >
            <HomeRoundedIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="Main"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight:
                currentView === 'main' ? 700 : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />
        </ListItemButton>
      </Tooltip>

      <Tooltip
        title={drawerOpen ? '' : '공사일보관리'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={isDailyView}
          onClick={() =>
            setDailyOpen((previous) => !previous)
          }
          sx={topMenuSx(isDailyView)}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent: 'center',
            }}
          >
            <AssignmentIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="공사일보관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight: isDailyView ? 700 : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />

          {drawerOpen &&
            (dailyOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse
        in={drawerOpen && dailyOpen}
        timeout="auto"
        unmountOnExit
      >
        <SubMenuList
          items={dailyMenus}
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </Collapse>

      <Tooltip
        title={drawerOpen ? '' : '공정진척관리'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={isProgressView}
          onClick={() => setProgressOpen((previous) => !previous)}
          sx={topMenuSx(isProgressView)}
        >
          <ListItemIcon
            sx={{ minWidth: 34, color: 'inherit', justifyContent: 'center' }}
          >
            <EngineeringIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="공정진척관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight: isProgressView ? 700 : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />

          {drawerOpen &&
            (progressOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse in={drawerOpen && progressOpen} timeout="auto" unmountOnExit>
        <SubMenuList
          items={progressMenus}
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </Collapse>

      <Tooltip
        title={
          drawerOpen
            ? ''
            : '자재관리'
        }
        placement="right"
        arrow
      >
        <ListItemButton
          selected={
            isMaterialView
          }
          onClick={() =>
            setMaterialOpen(
              (previous) =>
                !previous,
            )
          }
          sx={topMenuSx(
            isMaterialView,
          )}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent:
                'center',
            }}
          >
            <Inventory2OutlinedIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="자재관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight:
                isMaterialView
                  ? 700
                  : 500,
            }}
            sx={{
              opacity:
                drawerOpen
                  ? 1
                  : 0,
            }}
          />

          {drawerOpen &&
            (materialOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse
        in={
          drawerOpen &&
          materialOpen
        }
        timeout="auto"
        unmountOnExit
      >
        <SubMenuList
          items={
            materialMenus
          }
          currentView={
            currentView
          }
          onViewChange={
            handleViewChange
          }
        />
      </Collapse>

      <Tooltip
        title={drawerOpen ? '' : '기성관리'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={isPaymentView}
          onClick={() =>
            setPaymentOpen(
              (previous) => !previous,
            )
          }
          sx={topMenuSx(isPaymentView)}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent: 'center',
            }}
          >
            <RequestQuoteOutlinedIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="기성관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight: isPaymentView ? 700 : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />

          {drawerOpen &&
            (paymentOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse
        in={drawerOpen && paymentOpen}
        timeout="auto"
        unmountOnExit
      >
        <SubMenuList
          items={paymentMenus}
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </Collapse>

      <Tooltip
        title={drawerOpen ? '' : '노임관리'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={isLaborView}
          onClick={() =>
            setLaborOpen(
              (previous) => !previous,
            )
          }
          sx={topMenuSx(isLaborView)}
        >
          <ListItemIcon
            sx={{
              minWidth: 34,
              color: 'inherit',
              justifyContent: 'center',
            }}
          >
            <BadgeOutlinedIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="노임관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight: isLaborView ? 700 : 500,
            }}
            sx={{
              opacity: drawerOpen ? 1 : 0,
            }}
          />

          {drawerOpen &&
            (laborOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse
        in={drawerOpen && laborOpen}
        timeout="auto"
        unmountOnExit
      >
        <SubMenuList
          items={laborMenus}
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </Collapse>

      <Tooltip
        title={drawerOpen ? '' : '업무 보고 관리'}
        placement="right"
        arrow
      >
        <ListItemButton
          selected={isReportView}
          onClick={() => setReportOpen((previous) => !previous)}
          sx={topMenuSx(isReportView)}
        >
          <ListItemIcon
            sx={{ minWidth: 34, color: 'inherit', justifyContent: 'center' }}
          >
            <AssessmentIcon fontSize="small" />
          </ListItemIcon>

          <ListItemText
            primary="업무 보고 관리"
            primaryTypographyProps={{
              noWrap: true,
              fontSize: '0.8rem',
              fontWeight: isReportView ? 700 : 500,
            }}
            sx={{ opacity: drawerOpen ? 1 : 0 }}
          />

          {drawerOpen &&
            (reportOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            ))}
        </ListItemButton>
      </Tooltip>

      <Collapse in={drawerOpen && reportOpen} timeout="auto" unmountOnExit>
        <SubMenuList
          items={reportMenus}
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </Collapse>
    </List>
  );
}
