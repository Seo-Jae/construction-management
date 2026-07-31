import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';
import UserManagement from './UserManagement.jsx';

const ACCESS_HISTORY_REFRESH_MS = 30 * 1000;

const formatKoreaDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

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
  const parts = {};

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  });

  return `${parts.year}-${parts.month}-${parts.day} [${parts.hour}-${parts.minute}-${parts.second}]`;
};

function AccessHistoryPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadRows = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase.rpc(
      'admin_get_user_access_history',
      { p_limit: 1000 },
    );

    if (error) {
      console.error('접속현황 조회 오류:', error);
      setRows([]);
      setErrorMessage(
        '접속현황을 불러오지 못했습니다. v51.72 Supabase SQL 적용 여부와 최고관리자 권한을 확인해주세요.',
      );
      setLoading(false);
      return;
    }

    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRows();

    const timer = window.setInterval(() => {
      loadRows({ silent: true });
    }, ACCESS_HISTORY_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [loadRows]);

  const onlineCount = useMemo(
    () => rows.filter((row) => row.is_online === true).length,
    [rows],
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        p: 1.5,
        bgcolor: '#f8fafc',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            접속현황 및 기록
          </Typography>
          <Typography variant="caption" color="text.secondary">
            가입승인이 완료된 활성 회원의 접속 시작·종료 기록입니다.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Chip
            size="small"
            color={onlineCount > 0 ? 'success' : 'default'}
            label={`현재 접속 ${onlineCount}명`}
          />
          <Chip size="small" variant="outlined" label={`기록 ${rows.length}건`} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => loadRows()}
            disabled={loading}
          >
            새로고침
          </Button>
        </Box>
      </Paper>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        {loading ? (
          <Box
            sx={{
              height: '100%',
              minHeight: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              접속기록을 불러오고 있습니다.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ height: '100%' }}>
            <Table
              stickyHeader
              size="small"
              sx={{
                minWidth: 980,
                '& th, & td': {
                  whiteSpace: 'nowrap',
                  fontSize: '0.78rem',
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>현장</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>직책</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>이름</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>접속일시</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>접속종료</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={`${row.auth_user_id || 'user'}-${row.access_session_id || index}`}
                    hover
                  >
                    <TableCell sx={{ fontWeight: 700 }}>
                      {row.project_name || '-'}
                    </TableCell>
                    <TableCell>{row.position_title || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {row.manager_name || '-'}
                    </TableCell>
                    <TableCell>
                      {formatKoreaDateTime(row.access_started_at)}
                    </TableCell>
                    <TableCell>
                      {row.is_online ? (
                        <Chip size="small" color="success" label="접속 중" />
                      ) : (
                        formatKoreaDateTime(row.access_ended_at)
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        표시할 회원 또는 접속기록이 없습니다.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}

export default function UserManagementWithAccessHistory({
  currentUserId = '',
}) {
  const wrapperRef = useRef(null);
  const [mode, setMode] = useState('members');
  const [portalHost, setPortalHost] = useState(null);
  const [overlayTop, setOverlayTop] = useState(52);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    let resizeObserver = null;

    const locateTabBar = () => {
      const buttons = Array.from(
        wrapper.querySelectorAll('button'),
      );
      const allTabButton = buttons.find((button) =>
        /^전체\s*\d*/.test(
          String(button.textContent || '')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      );

      if (!allTabButton) {
        setPortalHost(null);
        return;
      }

      const tabBar =
        allTabButton.closest('[role="group"]') ||
        allTabButton.parentElement;

      if (!tabBar) return;

      let host = tabBar.querySelector(
        '[data-access-history-tab-host="true"]',
      );

      if (!host) {
        host = document.createElement('span');
        host.dataset.accessHistoryTabHost = 'true';
        host.style.display = 'inline-flex';
        host.style.alignItems = 'stretch';
        host.style.marginLeft = '6px';
        allTabButton.insertAdjacentElement('afterend', host);
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      const tabBarRect = tabBar.getBoundingClientRect();
      setOverlayTop(
        Math.max(48, tabBarRect.bottom - wrapperRect.top + 8),
      );
      setPortalHost(host);

      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(() => {
        const nextWrapperRect = wrapper.getBoundingClientRect();
        const nextTabBarRect = tabBar.getBoundingClientRect();
        setOverlayTop(
          Math.max(
            48,
            nextTabBarRect.bottom - nextWrapperRect.top + 8,
          ),
        );
      });
      resizeObserver.observe(tabBar);
    };

    const mutationObserver = new MutationObserver(locateTabBar);
    mutationObserver.observe(wrapper, {
      childList: true,
      subtree: true,
    });

    const handleMemberTabClick = (event) => {
      if (
        event.target.closest(
          '[data-access-history-tab-host="true"]',
        )
      ) {
        return;
      }

      const clickedButton = event.target.closest('button');
      if (!clickedButton) return;

      const text = String(clickedButton.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (
        /^전체\s*\d*/.test(text) ||
        text.includes('승인') ||
        text.includes('사용중') ||
        text.includes('중지') ||
        text.includes('거절')
      ) {
        setMode('members');
      }
    };

    wrapper.addEventListener('click', handleMemberTabClick, true);
    locateTabBar();

    return () => {
      mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      wrapper.removeEventListener(
        'click',
        handleMemberTabClick,
        true,
      );
    };
  }, []);

  const accessTabButton = (
    <Button
      size="small"
      variant={mode === 'access' ? 'contained' : 'outlined'}
      onClick={() => setMode('access')}
      sx={{
        minHeight: 34,
        whiteSpace: 'nowrap',
        fontWeight: 800,
        boxShadow: 'none',
      }}
    >
      접속현황 및 기록
    </Button>
  );

  return (
    <Box
      ref={wrapperRef}
      sx={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
      }}
    >
      <UserManagement currentUserId={currentUserId} />

      {portalHost
        ? createPortal(accessTabButton, portalHost)
        : (
          <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 30 }}>
            {accessTabButton}
          </Box>
        )}

      {mode === 'access' && (
        <Paper
          elevation={0}
          square
          sx={{
            position: 'absolute',
            top: overlayTop,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 20,
            overflow: 'hidden',
            bgcolor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <AccessHistoryPanel />
        </Paper>
      )}
    </Box>
  );
}
