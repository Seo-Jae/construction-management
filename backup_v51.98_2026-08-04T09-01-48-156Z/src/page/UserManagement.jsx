import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const ROLE_OPTIONS = ['담당자', '관리자', '최고관리자'];
const ALL_PROJECTS_OPTION = '전체현장';

const STATUS_INFO = {
  pending: { label: '승인대기', color: 'warning' },
  active: { label: '사용중', color: 'success' },
  disabled: { label: '사용중지', color: 'default' },
  rejected: { label: '승인거절', color: 'error' },
};

const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '');

const normalizeProjectNames = (values) => {
  const normalized = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== '본사'),
  )];

  return normalized.includes(ALL_PROJECTS_OPTION)
    ? [ALL_PROJECTS_OPTION]
    : normalized;
};

const normalizeProjectSelection = (nextValues, previousValues) => {
  const next = [...new Set(
    (Array.isArray(nextValues) ? nextValues : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== '본사'),
  )];
  const previous = normalizeProjectNames(previousValues);
  const nextHasAll = next.includes(ALL_PROJECTS_OPTION);
  const previousHadAll = previous.includes(ALL_PROJECTS_OPTION);

  if (nextHasAll && !previousHadAll) {
    return [ALL_PROJECTS_OPTION];
  }

  if (nextHasAll && next.length > 1) {
    return next.filter((value) => value !== ALL_PROJECTS_OPTION);
  }

  return next;
};

const createDraft = (account) => {
  const organizationType =
    account?.organization_type === '본사' ? '본사' : '현장';
  const role = account?.role || '담당자';
  const isManagementRole = ['관리자', '최고관리자'].includes(role);
  const savedProjectNames = normalizeProjectNames(account?.project_names);
  const fallbackProjectName = String(
    account?.project_name || account?.requested_project_name || '',
  ).trim();

  return {
    role,
    organizationType,
    projectNames:
      savedProjectNames.length > 0
          ? savedProjectNames
          : organizationType === '본사' && isManagementRole
            ? [ALL_PROJECTS_OPTION]
          : fallbackProjectName && fallbackProjectName !== '본사'
            ? [fallbackProjectName]
            : [],
  };
};

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function UserManagement({ currentUserId = '' }) {
  const [accounts, setAccounts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [projectOptions, setProjectOptions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [accountResult, projectResult] = await Promise.all([
        supabase.rpc('admin_list_user_accounts'),
        supabase.rpc('list_registration_projects'),
      ]);

      if (accountResult.error) throw accountResult.error;
      if (projectResult.error) throw projectResult.error;

      const nextAccounts = Array.isArray(accountResult.data)
        ? accountResult.data
        : [];

      setAccounts(nextAccounts);
      setDrafts(
        Object.fromEntries(
          nextAccounts.map((account) => [
            account.auth_user_id,
            createDraft(account),
          ]),
        ),
      );
      setProjectOptions(
        [...new Set(
          (Array.isArray(projectResult.data) ? projectResult.data : [])
            .map((row) =>
              String(row?.project_name || row || '').trim(),
            )
            .filter(
              (projectName) =>
                projectName &&
                projectName !== '본사' &&
                projectName !== ALL_PROJECTS_OPTION,
            ),
        )].sort((first, second) =>
          first.localeCompare(second, 'ko', { numeric: true }),
        ),
      );
    } catch (error) {
      console.error('회원관리 조회 오류:', error);
      setErrorMessage(
        error?.message || '회원목록을 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const counts = useMemo(() => {
    const result = {
      all: accounts.length,
      pending: 0,
      active: 0,
      disabled: 0,
      rejected: 0,
    };

    accounts.forEach((account) => {
      const status = account.account_status || 'pending';
      result[status] = (result[status] || 0) + 1;
    });

    return result;
  }, [accounts]);

  const visibleAccounts = useMemo(() => {
    const keyword = normalizeSearchText(searchText);

    return accounts.filter((account) => {
      const status = account.account_status || 'pending';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!keyword) return true;

      return [
        account.email,
        account.manager_name,
        account.position_title,
        account.requested_project_name,
        account.project_name,
        ...(Array.isArray(account.project_names)
          ? account.project_names
          : []),
        account.role,
      ].some((value) => normalizeSearchText(value).includes(keyword));
    });
  }, [accounts, searchText, statusFilter]);

  const changeDraft = (userId, field, value) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};

      const nextDraft = {
        ...previous,
        [userId]: {
          ...current,
          [field]: value,
          ...(field === 'organizationType'
            ? {
                projectNames:
                  value === '본사' &&
                  ['관리자', '최고관리자'].includes(current.role)
                    ? [ALL_PROJECTS_OPTION]
                    : [],
              }
            : {}),
        },
      };

      if (
        field === 'role' &&
        value === '담당자' &&
        normalizeProjectNames(current.projectNames).includes(
          ALL_PROJECTS_OPTION,
        )
      ) {
        nextDraft[userId].projectNames = [];
      }

      if (
        field === 'role' &&
        ['관리자', '최고관리자'].includes(value) &&
        current.organizationType === '본사' &&
        normalizeProjectNames(current.projectNames).length === 0
      ) {
        nextDraft[userId].projectNames = [ALL_PROJECTS_OPTION];
      }

      return nextDraft;
    });
  };

  const changeProjectSelection = (userId, values) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};

      return {
        ...previous,
        [userId]: {
          ...current,
          projectNames: normalizeProjectSelection(
            values,
            current.projectNames,
          ),
        },
      };
    });
  };

  const updateAccount = async (account, nextStatus) => {
    const userId = account.auth_user_id;
    const draft = drafts[userId] || createDraft(account);
    const projectNames = normalizeProjectNames(draft.projectNames);

    if (projectNames.length === 0) {
      setErrorMessage(`${account.manager_name || account.email}의 접근 현장을 하나 이상 선택해주세요.`);
      return;
    }

    if (
      projectNames.includes(ALL_PROJECTS_OPTION) &&
      (
        draft.organizationType !== '본사' ||
        !['관리자', '최고관리자'].includes(draft.role)
      )
    ) {
      setErrorMessage('전체현장은 본사 관리자·최고관리자에게만 지정할 수 있습니다.');
      return;
    }

    if (
      nextStatus === 'disabled' &&
      String(userId) === String(currentUserId)
    ) {
      setErrorMessage('현재 로그인한 본인 계정은 사용중지할 수 없습니다.');
      return;
    }

    const actionLabel =
      nextStatus === 'active'
        ? account.account_status === 'pending'
          ? '승인'
          : '사용'
        : nextStatus === 'disabled'
          ? '사용중지'
          : '저장';

    if (
      nextStatus === 'disabled' &&
      !window.confirm(
        `${account.manager_name || account.email} 계정을 사용중지할까요?\n기존 작성이력은 삭제되지 않습니다.`,
      )
    ) {
      return;
    }

    setProcessingId(userId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.rpc(
        'admin_update_user_account_projects',
        {
          p_user_id: userId,
          p_role: draft.role,
          p_organization_type: draft.organizationType,
          p_project_names: projectNames,
          p_account_status: nextStatus,
        },
      );

      if (error) throw error;

      setSuccessMessage(
        `${account.manager_name || account.email} 계정이 ${actionLabel} 처리되었습니다.`,
      );
      await loadAccounts();
      window.dispatchEvent(new CustomEvent('user-account-changed'));
    } catch (error) {
      console.error('회원 상태 변경 오류:', error);
      setErrorMessage(
        error?.message || '회원 상태를 변경하지 못했습니다.',
      );
    } finally {
      setProcessingId('');
    }
  };

  const disableLegacyAccounts = async () => {
    if (
      !window.confirm(
        '시스템 전환 전에 사용하던 기존 계정을 모두 사용중지할까요?\n현재 로그인 계정은 제외되고 기존 작성이력은 보존됩니다.',
      )
    ) {
      return;
    }

    setBulkProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'admin_disable_legacy_accounts',
      );

      if (error) throw error;

      const disabledCount = Number(
        data?.[0]?.disabled_count ?? data ?? 0,
      );

      setSuccessMessage(
        `기존 계정 ${disabledCount.toLocaleString()}개를 사용중지했습니다.`,
      );
      await loadAccounts();
    } catch (error) {
      console.error('기존 계정 일괄 사용중지 오류:', error);
      setErrorMessage(
        error?.message || '기존 계정을 일괄 사용중지하지 못했습니다.',
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e2e8f0', bgcolor: '#ffffff', display: 'flex', alignItems: { xs: 'stretch', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 1.2 }}>
        <Box>
          <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>
            회원관리
          </Typography>
          <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.7rem' }}>
            가입 요청을 확인하고 역할·구분·복수 접근 현장을 승인합니다.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={loadAccounts} disabled={loading || bulkProcessing}>
            새로고침
          </Button>
          <Button color="error" variant="outlined" size="small" onClick={disableLegacyAccounts} disabled={loading || bulkProcessing}>
            {bulkProcessing ? '처리 중...' : '기존 계정 전체 사용중지'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ px: 2, py: 1.2, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: { xs: 'stretch', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={statusFilter}
            onChange={(_event, value) => value && setStatusFilter(value)}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="pending">승인대기 {counts.pending}</ToggleButton>
            <ToggleButton value="active">사용중 {counts.active}</ToggleButton>
            <ToggleButton value="disabled">사용중지 {counts.disabled}</ToggleButton>
            <ToggleButton value="all">전체 {counts.all}</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            size="small"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="이름·이메일·현장 검색"
            sx={{ ml: { md: 'auto' }, width: { xs: '100%', md: 280 }, bgcolor: '#ffffff' }}
          />
        </Box>

        {errorMessage && (
          <Alert severity="error" sx={{ mt: 1, fontSize: '0.74rem' }} onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mt: 1, fontSize: '0.74rem' }} onClose={() => setSuccessMessage('')}>
            {successMessage}
          </Alert>
        )}
      </Box>

      <TableContainer sx={{ flexGrow: 1, minHeight: 0 }}>
        <Table stickyHeader size="small" sx={{ minWidth: 1190 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 900, width: 86 }}>상태</TableCell>
              <TableCell sx={{ fontWeight: 900, minWidth: 190 }}>가입자</TableCell>
              <TableCell sx={{ fontWeight: 900, width: 100 }}>직책</TableCell>
              <TableCell sx={{ fontWeight: 900, minWidth: 330 }}>구분·접근 현장</TableCell>
              <TableCell sx={{ fontWeight: 900, width: 140 }}>시스템 역할</TableCell>
              <TableCell sx={{ fontWeight: 900, width: 120 }}>가입일</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900, width: 210 }}>처리</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 9 }}>
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : visibleAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 9, color: '#94a3b8' }}>
                  해당 조건의 계정이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              visibleAccounts.map((account) => {
                const userId = account.auth_user_id;
                const status = account.account_status || 'pending';
                const statusInfo = STATUS_INFO[status] || STATUS_INFO.pending;
                const draft = drafts[userId] || createDraft(account);
                const isCurrentUser = String(userId) === String(currentUserId);
                const isProcessing = processingId === userId;

                return (
                  <TableRow key={userId || account.email} hover>
                    <TableCell>
                      <Chip size="small" label={statusInfo.label} color={statusInfo.color} variant={status === 'active' ? 'filled' : 'outlined'} />
                      {account.is_legacy_account && (
                        <Chip size="small" label="기존" variant="outlined" sx={{ mt: 0.5, display: 'flex', width: 'fit-content', fontSize: '0.62rem' }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#334155' }}>
                        {account.manager_name || '-'}
                        {isCurrentUser ? ' (현재 계정)' : ''}
                      </Typography>
                      <Typography sx={{ mt: 0.2, fontSize: '0.68rem', color: '#64748b' }}>
                        {account.email}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.76rem' }}>
                      {account.position_title || '-'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          label="구분"
                          value={draft.organizationType}
                          onChange={(event) => changeDraft(userId, 'organizationType', event.target.value)}
                          disabled={isProcessing}
                        >
                          <MenuItem value="본사">본사</MenuItem>
                          <MenuItem value="현장">현장</MenuItem>
                        </TextField>

                        {draft.organizationType === '본사' && (
                          <TextField size="small" fullWidth label="근무처" value="본사" disabled />
                        )}

                        <Autocomplete
                          multiple
                          disableCloseOnSelect
                          limitTags={2}
                          size="small"
                          options={
                            draft.organizationType === '본사' &&
                            ['관리자', '최고관리자'].includes(draft.role)
                              ? [ALL_PROJECTS_OPTION, ...projectOptions]
                              : projectOptions
                          }
                          value={draft.projectNames || []}
                          onChange={(_event, value) => changeProjectSelection(userId, value)}
                          disabled={isProcessing}
                          filterOptions={(options, state) => {
                            const keyword = normalizeSearchText(state.inputValue);
                            if (!keyword) return options;
                            return options.filter((option) => normalizeSearchText(option).includes(keyword));
                          }}
                          noOptionsText="검색되는 현장이 없습니다."
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="접근 현장"
                              placeholder={(draft.projectNames || []).length === 0 ? '현장 또는 전체현장 선택' : ''}
                              helperText={
                                (draft.projectNames || []).includes(ALL_PROJECTS_OPTION)
                                  ? '현재 등록 현장과 앞으로 추가될 현장까지 자동으로 접근합니다.'
                                  : '필요한 현장을 여러 개 선택할 수 있습니다.'
                              }
                            />
                          )}
                        />
                      </Box>
                      {account.requested_project_name &&
                        account.requested_project_name !== '본사' &&
                        !(draft.projectNames || []).includes(account.requested_project_name) && (
                        <Typography sx={{ mt: 0.35, color: '#b45309', fontSize: '0.62rem' }}>
                          가입 신청: {account.requested_project_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={draft.role}
                        onChange={(event) => changeDraft(userId, 'role', event.target.value)}
                        disabled={isProcessing}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <MenuItem key={role} value={role}>{role}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                      {formatDateTime(account.created_at)}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6 }}>
                        {status === 'pending' ? (
                          <>
                            <Button size="small" variant="contained" onClick={() => updateAccount(account, 'active')} disabled={isProcessing} sx={{ bgcolor: '#0284c7' }}>
                              {isProcessing ? '처리 중' : '승인'}
                            </Button>
                            <Button size="small" color="error" variant="outlined" onClick={() => updateAccount(account, 'rejected')} disabled={isProcessing}>
                              거절
                            </Button>
                          </>
                        ) : status === 'active' ? (
                          <>
                            <Button size="small" variant="outlined" onClick={() => updateAccount(account, 'active')} disabled={isProcessing}>
                              권한저장
                            </Button>
                            <Button size="small" color="error" variant="outlined" onClick={() => updateAccount(account, 'disabled')} disabled={isProcessing || isCurrentUser}>
                              사용중지
                            </Button>
                          </>
                        ) : (
                          <Button size="small" variant="contained" onClick={() => updateAccount(account, 'active')} disabled={isProcessing} sx={{ bgcolor: '#0284c7' }}>
                            {isProcessing ? '처리 중' : '다시 사용'}
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
