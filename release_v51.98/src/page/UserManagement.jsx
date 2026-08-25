import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
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

const areDraftsEqual = (first, second) => {
  if (!first || !second) return false;

  const firstProjects = normalizeProjectNames(first.projectNames)
    .slice()
    .sort();
  const secondProjects = normalizeProjectNames(second.projectNames)
    .slice()
    .sort();

  return (
    first.role === second.role &&
    first.organizationType === second.organizationType &&
    JSON.stringify(firstProjects) === JSON.stringify(secondProjects)
  );
};

const getProjectSummary = (projectNames) => {
  const normalized = normalizeProjectNames(projectNames);

  if (normalized.includes(ALL_PROJECTS_OPTION)) return '전체현장';
  if (normalized.length === 0) return '접근현장 미설정';
  if (normalized.length === 1) return normalized[0];
  return `${normalized[0]} 외 ${normalized.length - 1}개`;
};

function SectionTitle({ number, title, description, ready = true }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '7px',
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: ready ? '#0f172a' : '#e2e8f0',
            color: ready ? '#ffffff' : '#64748b',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          {number}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 900 }}>
            {title}
          </Typography>
          {description && (
            <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.66rem', lineHeight: 1.45 }}>
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      {!ready && (
        <Chip
          size="small"
          variant="outlined"
          label="DB 연결 예정"
          sx={{ flex: '0 0 auto', height: 22, color: '#64748b', fontSize: '0.62rem' }}
        />
      )}
    </Box>
  );
}

export default function UserManagement({ currentUserId = '' }) {
  const [accounts, setAccounts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [projectOptions, setProjectOptions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
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
      setSelectedUserId((previous) => (
        nextAccounts.some((account) => account.auth_user_id === previous)
          ? previous
          : nextAccounts[0]?.auth_user_id || ''
      ));
      setProjectOptions(
        [...new Set(
          (Array.isArray(projectResult.data) ? projectResult.data : [])
            .map((row) => String(row?.project_name || row || '').trim())
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
      setErrorMessage(error?.message || '회원목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAccounts();
    }, 0);

    return () => window.clearTimeout(timer);
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
        ...(Array.isArray(account.project_names) ? account.project_names : []),
        account.role,
        account.organization_type,
      ].some((value) => normalizeSearchText(value).includes(keyword));
    });
  }, [accounts, searchText, statusFilter]);

  const effectiveSelectedUserId = visibleAccounts.some(
    (account) => account.auth_user_id === selectedUserId,
  )
    ? selectedUserId
    : visibleAccounts[0]?.auth_user_id || '';

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.auth_user_id === effectiveSelectedUserId) || null,
    [accounts, effectiveSelectedUserId],
  );
  const selectedDraft = selectedAccount
    ? drafts[selectedAccount.auth_user_id] || createDraft(selectedAccount)
    : null;
  const selectedStatus = selectedAccount?.account_status || 'pending';
  const selectedStatusInfo = STATUS_INFO[selectedStatus] || STATUS_INFO.pending;
  const selectedIsCurrentUser = Boolean(
    selectedAccount && String(selectedAccount.auth_user_id) === String(currentUserId),
  );
  const selectedIsProcessing = Boolean(
    selectedAccount && processingId === selectedAccount.auth_user_id,
  );
  const selectedIsDirty = Boolean(
    selectedAccount &&
    !areDraftsEqual(selectedDraft, createDraft(selectedAccount)),
  );

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
        normalizeProjectNames(current.projectNames).includes(ALL_PROJECTS_OPTION)
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
          projectNames: normalizeProjectSelection(values, current.projectNames),
        },
      };
    });
  };

  const resetDraft = (account) => {
    if (!account) return;
    setDrafts((previous) => ({
      ...previous,
      [account.auth_user_id]: createDraft(account),
    }));
    setErrorMessage('');
    setSuccessMessage('');
  };

  const selectAccount = (account) => {
    if (!account) return;

    if (selectedIsDirty && selectedAccount && selectedAccount.auth_user_id !== account.auth_user_id) {
      const shouldMove = window.confirm(
        `${selectedAccount.manager_name || selectedAccount.email}의 저장하지 않은 변경사항이 있습니다.\n변경을 취소하고 다른 회원을 선택할까요?`,
      );
      if (!shouldMove) return;
      resetDraft(selectedAccount);
    }

    setSelectedUserId(account.auth_user_id);
    setErrorMessage('');
    setSuccessMessage('');
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

    if (nextStatus === 'disabled' && String(userId) === String(currentUserId)) {
      setErrorMessage('현재 로그인한 본인 계정은 사용중지할 수 없습니다.');
      return;
    }

    const actionLabel =
      nextStatus === 'active'
        ? account.account_status === 'pending'
          ? '승인'
          : account.account_status === 'active'
            ? '권한 저장'
            : '다시 사용'
        : nextStatus === 'disabled'
          ? '사용중지'
          : nextStatus === 'rejected'
            ? '승인거절'
            : '저장';

    if (
      nextStatus === 'disabled' &&
      !window.confirm(
        `${account.manager_name || account.email} 계정을 사용중지할까요?\n기존 작성이력은 삭제되지 않습니다.`,
      )
    ) {
      return;
    }

    if (
      nextStatus === 'rejected' &&
      !window.confirm(`${account.manager_name || account.email}의 가입 요청을 거절할까요?`)
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
      setErrorMessage(error?.message || '회원 상태를 변경하지 못했습니다.');
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
      const { data, error } = await supabase.rpc('admin_disable_legacy_accounts');

      if (error) throw error;

      const disabledCount = Number(data?.[0]?.disabled_count ?? data ?? 0);

      setSuccessMessage(
        `기존 계정 ${disabledCount.toLocaleString()}개를 사용중지했습니다.`,
      );
      await loadAccounts();
    } catch (error) {
      console.error('기존 계정 일괄 사용중지 오류:', error);
      setErrorMessage(error?.message || '기존 계정을 일괄 사용중지하지 못했습니다.');
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
      <Box
        sx={{
          px: 2,
          py: 1.35,
          borderBottom: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          display: 'flex',
          alignItems: { xs: 'stretch', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          gap: 1.2,
        }}
      >
        <Box>
          <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>
            회원관리
          </Typography>
          <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.68rem' }}>
            왼쪽에서 회원을 선택한 뒤 오른쪽에서 기본정보와 접근현장을 설정합니다.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={loadAccounts}
            disabled={loading || bulkProcessing}
          >
            새로고침
          </Button>
          <Button
            color="error"
            variant="outlined"
            size="small"
            onClick={disableLegacyAccounts}
            disabled={loading || bulkProcessing}
          >
            {bulkProcessing ? '처리 중...' : '기존 계정 전체 사용중지'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: { xs: 'stretch', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
          }}
        >
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
            placeholder="이름·이메일·직책·현장 검색"
            sx={{ ml: { md: 'auto' }, width: { xs: '100%', md: 300 }, bgcolor: '#ffffff' }}
          />
        </Box>

        {errorMessage && (
          <Alert
            severity="error"
            sx={{ mt: 1, fontSize: '0.74rem' }}
            onClose={() => setErrorMessage('')}
          >
            {errorMessage}
          </Alert>
        )}
        {successMessage && (
          <Alert
            severity="success"
            sx={{ mt: 1, fontSize: '0.74rem' }}
            onClose={() => setSuccessMessage('')}
          >
            {successMessage}
          </Alert>
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '330px minmax(0, 1fr)' },
          gridTemplateRows: { xs: 'minmax(210px, 36%) minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
        }}
      >
        <Box
          sx={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: { md: '1px solid #e2e8f0' },
            borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
            bgcolor: '#f8fafc',
          }}
        >
          <Box
            sx={{
              px: 1.4,
              py: 0.9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <Typography sx={{ color: '#334155', fontSize: '0.74rem', fontWeight: 900 }}>
              회원목록
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.66rem' }}>
              {visibleAccounts.length}명
            </Typography>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 0.8 }}>
            {loading ? (
              <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : visibleAccounts.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                  해당 조건의 계정이 없습니다.
                </Typography>
              </Box>
            ) : (
              visibleAccounts.map((account) => {
                const userId = account.auth_user_id;
                const status = account.account_status || 'pending';
                const statusInfo = STATUS_INFO[status] || STATUS_INFO.pending;
                const draft = drafts[userId] || createDraft(account);
                const isSelected = userId === effectiveSelectedUserId;
                const isDirty = !areDraftsEqual(draft, createDraft(account));

                return (
                  <Box
                    key={userId || account.email}
                    component="button"
                    type="button"
                    onClick={() => selectAccount(account)}
                    sx={{
                      width: '100%',
                      mb: 0.7,
                      p: 1.1,
                      display: 'block',
                      border: '1px solid',
                      borderColor: isSelected ? '#0284c7' : '#e2e8f0',
                      borderRadius: '10px',
                      bgcolor: isSelected ? '#f0f9ff' : '#ffffff',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 0 0 1px #0284c7' : 'none',
                      transition: 'border-color 120ms ease, background-color 120ms ease',
                      '&:hover': { borderColor: '#38bdf8', bgcolor: '#f8fcff' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.8 }}>
                      <Chip
                        size="small"
                        label={statusInfo.label}
                        color={statusInfo.color}
                        variant={status === 'active' ? 'filled' : 'outlined'}
                        sx={{ height: 21, fontSize: '0.61rem' }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                        {account.is_legacy_account && (
                          <Chip size="small" label="기존" variant="outlined" sx={{ height: 20, fontSize: '0.58rem' }} />
                        )}
                        {isDirty && (
                          <Chip size="small" color="warning" label="저장 안 됨" sx={{ height: 20, fontSize: '0.58rem' }} />
                        )}
                      </Box>
                    </Box>
                    <Typography sx={{ mt: 0.8, color: '#0f172a', fontSize: '0.78rem', fontWeight: 900 }}>
                      {account.manager_name || '-'}
                      {String(userId) === String(currentUserId) ? ' (현재 계정)' : ''}
                    </Typography>
                    <Typography noWrap sx={{ mt: 0.1, color: '#64748b', fontSize: '0.65rem' }}>
                      {account.email}
                    </Typography>
                    <Box sx={{ mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${draft.organizationType} · ${draft.role}`}
                        sx={{ height: 21, fontSize: '0.6rem', bgcolor: '#ffffff' }}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={getProjectSummary(draft.projectNames)}
                        sx={{ height: 21, maxWidth: '100%', fontSize: '0.6rem', bgcolor: '#ffffff' }}
                      />
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#ffffff' }}>
          {!selectedAccount || !selectedDraft ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                왼쪽 회원목록에서 설정할 회원을 선택해주세요.
              </Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  px: { xs: 1.5, md: 2 },
                  py: 1.2,
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 0.8,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, flexWrap: 'wrap' }}>
                    <Typography sx={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 900 }}>
                      {selectedAccount.manager_name || '-'}
                    </Typography>
                    <Chip
                      size="small"
                      label={selectedStatusInfo.label}
                      color={selectedStatusInfo.color}
                      variant={selectedStatus === 'active' ? 'filled' : 'outlined'}
                      sx={{ height: 22, fontSize: '0.62rem' }}
                    />
                    {selectedIsDirty && (
                      <Chip size="small" color="warning" label="변경사항 있음" sx={{ height: 22, fontSize: '0.62rem' }} />
                    )}
                  </Box>
                  <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.66rem' }}>
                    {selectedAccount.email} · 가입일 {formatDateTime(selectedAccount.created_at)}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  label={selectedAccount.position_title || '직급 미입력'}
                  sx={{ bgcolor: '#f8fafc', fontSize: '0.64rem' }}
                />
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.2, md: 1.6 }, bgcolor: '#f8fafc' }}>
                <Paper variant="outlined" sx={{ p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="1"
                    title="기본정보"
                    description="사용자 구분과 현재 시스템 역할을 설정합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.1 }}>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="사용자 구분"
                      value={selectedDraft.organizationType}
                      onChange={(event) => changeDraft(selectedAccount.auth_user_id, 'organizationType', event.target.value)}
                      disabled={selectedIsProcessing}
                    >
                      <MenuItem value="본사">본사</MenuItem>
                      <MenuItem value="현장">현장</MenuItem>
                      <MenuItem value="외부업체" disabled>외부업체 · DB 구성 후 사용</MenuItem>
                    </TextField>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="시스템 역할"
                      value={selectedDraft.role}
                      onChange={(event) => changeDraft(selectedAccount.auth_user_id, 'role', event.target.value)}
                      disabled={selectedIsProcessing}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <MenuItem key={role} value={role}>{role}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      fullWidth
                      label="직급"
                      value={selectedAccount.position_title || ''}
                      disabled
                      helperText="현재 가입정보를 표시합니다. 수정 기능은 DB 개편 단계에서 연결합니다."
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="부서"
                      value="미설정"
                      disabled
                      helperText="공사·안전·관리·자재·외주 부서는 다음 단계에서 연결합니다."
                    />
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="2"
                    title="접근현장"
                    description="현재 저장방식과 동일하게 복수현장 또는 전체현장을 지정합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  {selectedDraft.organizationType === '본사' && (
                    <TextField
                      size="small"
                      fullWidth
                      label="근무처"
                      value="본사"
                      disabled
                      sx={{ mb: 1.1 }}
                    />
                  )}
                  <Autocomplete
                    multiple
                    disableCloseOnSelect
                    limitTags={3}
                    size="small"
                    options={
                      selectedDraft.organizationType === '본사' &&
                      ['관리자', '최고관리자'].includes(selectedDraft.role)
                        ? [ALL_PROJECTS_OPTION, ...projectOptions]
                        : projectOptions
                    }
                    value={selectedDraft.projectNames || []}
                    onChange={(_event, value) => changeProjectSelection(selectedAccount.auth_user_id, value)}
                    disabled={selectedIsProcessing}
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
                        placeholder={(selectedDraft.projectNames || []).length === 0 ? '현장 또는 전체현장 선택' : ''}
                        helperText={
                          (selectedDraft.projectNames || []).includes(ALL_PROJECTS_OPTION)
                            ? '현재 등록 현장과 앞으로 추가될 현장까지 자동으로 접근합니다.'
                            : '필요한 현장을 여러 개 선택할 수 있습니다.'
                        }
                      />
                    )}
                  />
                  {selectedAccount.requested_project_name &&
                    selectedAccount.requested_project_name !== '본사' &&
                    !(selectedDraft.projectNames || []).includes(selectedAccount.requested_project_name) && (
                    <Alert severity="warning" sx={{ mt: 1, py: 0, fontSize: '0.7rem' }}>
                      가입 시 신청한 현장은 {selectedAccount.requested_project_name}입니다.
                    </Alert>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none', bgcolor: '#ffffff' }}>
                  <SectionTitle
                    number="3"
                    title="권한 템플릿"
                    description="본사 공사담당·현장소장 등 확정한 기본 권한 묶음을 선택하는 영역입니다."
                    ready={false}
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <TextField
                    size="small"
                    fullWidth
                    label="현재 권한 기준"
                    value={`기존 ${selectedDraft.role} 권한 유지`}
                    disabled
                    helperText="2단계 권한 테이블 구성 전까지 현재 사용자의 기존 메뉴 접근권한은 바뀌지 않습니다."
                  />
                </Paper>

                <Box sx={{ mt: 1.2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 1.2 }}>
                  <Paper variant="outlined" sx={{ p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                    <SectionTitle
                      number="4"
                      title="세부권한"
                      description="조회·작성·수정·삭제·결재·다운로드 권한표가 표시될 영역입니다."
                      ready={false}
                    />
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                    <SectionTitle
                      number="5"
                      title="특수권한"
                      description="개인정보·마감취소·권한설정 등 민감 권한이 표시될 영역입니다."
                      ready={false}
                    />
                  </Paper>
                </Box>
              </Box>

              <Box
                sx={{
                  px: { xs: 1.2, md: 1.6 },
                  py: 1.1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  flexWrap: 'wrap',
                  borderTop: '1px solid #e2e8f0',
                  bgcolor: '#ffffff',
                }}
              >
                <Box sx={{ display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => resetDraft(selectedAccount)}
                    disabled={!selectedIsDirty || selectedIsProcessing}
                  >
                    변경 취소
                  </Button>
                  {selectedStatus === 'active' && (
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => updateAccount(selectedAccount, 'disabled')}
                      disabled={selectedIsProcessing || selectedIsCurrentUser}
                    >
                      사용중지
                    </Button>
                  )}
                  {selectedStatus === 'pending' && (
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => updateAccount(selectedAccount, 'rejected')}
                      disabled={selectedIsProcessing}
                    >
                      승인 거절
                    </Button>
                  )}
                </Box>

                {selectedStatus === 'pending' ? (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => updateAccount(selectedAccount, 'active')}
                    disabled={selectedIsProcessing}
                    sx={{ bgcolor: '#0284c7', fontWeight: 900, boxShadow: 'none' }}
                  >
                    {selectedIsProcessing ? '처리 중...' : '승인 후 사용 시작'}
                  </Button>
                ) : selectedStatus === 'active' ? (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => updateAccount(selectedAccount, 'active')}
                    disabled={selectedIsProcessing}
                    sx={{ bgcolor: '#0284c7', fontWeight: 900, boxShadow: 'none' }}
                  >
                    {selectedIsProcessing ? '저장 중...' : '권한 저장'}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => updateAccount(selectedAccount, 'active')}
                    disabled={selectedIsProcessing}
                    sx={{ bgcolor: '#0284c7', fontWeight: 900, boxShadow: 'none' }}
                  >
                    {selectedIsProcessing ? '처리 중...' : '다시 사용'}
                  </Button>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
