import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
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
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import { supabase } from '../supabaseClient';
import KoreanDatePicker from '../components/KoreanDatePicker.jsx';

const ROLE_OPTIONS = ['담당자', '관리자', '최고관리자'];
const ALL_PROJECTS_OPTION = '전체현장';
const ACCESS_SCOPE_OPTIONS = [
  { value: 'home_project', label: '소속현장' },
  { value: 'selected', label: '선택현장' },
  { value: 'all', label: '전체현장' },
];

const STATUS_INFO = {
  pending: { label: '승인대기', color: 'warning' },
  active: { label: '사용중', color: 'success' },
  disabled: { label: '사용중지', color: 'default' },
  rejected: { label: '승인거절', color: 'error' },
};

const PERMISSION_SCOPE_COMMON = '*';
const OVERRIDE_STATE_OPTIONS = [
  { value: 'inherit', label: '상속', color: '#64748b' },
  { value: 'allow', label: '추가', color: '#0369a1' },
  { value: 'deny', label: '차단', color: '#b91c1c' },
];
const DASHBOARD_PERMISSION_KEYS = {
  view: 'construction.dashboard.view',
  edit: 'construction.dashboard.manage',
};
const DASHBOARD_ACCESS_OPTIONS = [
  { value: 'view', label: '조회' },
  { value: 'edit', label: '수정' },
  { value: 'deny', label: '차단' },
];

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

const normalizeProjectAccess = (projectNames, projectAccess) => {
  const accessByProject = new Map(
    (Array.isArray(projectAccess) ? projectAccess : []).map((item) => [
      String(item?.project_name || item?.projectName || '').trim(),
      item,
    ]),
  );

  return normalizeProjectNames(projectNames)
    .filter((projectName) => projectName !== ALL_PROJECTS_OPTION)
    .map((projectName) => {
      const saved = accessByProject.get(projectName) || {};
      return {
        projectName,
        accessStartDate: String(
          saved.access_start_date || saved.accessStartDate || '',
        ).slice(0, 10),
        accessEndDate: String(
          saved.access_end_date || saved.accessEndDate || '',
        ).slice(0, 10),
        isActive: saved.is_active !== false && saved.isActive !== false,
      };
    });
};

const normalizePermissionOverrides = (values) => (
  (Array.isArray(values) ? values : [])
    .map((item) => ({
      scopeKey: String(item?.scope_key || item?.scopeKey || PERMISSION_SCOPE_COMMON).trim(),
      permissionKey: String(item?.permission_key || item?.permissionKey || '').trim(),
      effect: item?.effect === 'deny' ? 'deny' : 'allow',
    }))
    .filter((item) => item.permissionKey && item.scopeKey)
    .sort((first, second) => (
      `${first.scopeKey}:${first.permissionKey}`.localeCompare(
        `${second.scopeKey}:${second.permissionKey}`,
      )
    ))
);

const normalizeSpecialPermissions = (values) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item?.permission_key || item || '').trim())
      .filter(Boolean),
  )].sort()
);

const inferDepartmentCode = (organizationType) =>
  organizationType === '외부업체' ? 'external' : 'construction';

const inferTemplateCode = (account, organizationType) => {
  const role = String(account?.role || '담당자');

  if (role === '최고관리자') return 'super_admin';
  if (organizationType === '본사') return 'hq_construction';
  if (organizationType === '외부업체') return 'external_partner';
  return role === '관리자' ? 'site_manager' : 'site_construction';
};

const createDraft = (account, accessSetting = null) => {
  const organizationType =
    accessSetting?.organization_type ||
    (account?.organization_type === '본사' ? '본사' : '현장');
  const role = account?.role || '담당자';
  const isManagementRole = ['관리자', '최고관리자'].includes(role);
  const accessProjects = Array.isArray(accessSetting?.project_access)
    ? accessSetting.project_access
    : [];
  const savedProjectNames = normalizeProjectNames(
    accessProjects.length > 0
      ? accessProjects.map((item) => item?.project_name)
      : account?.project_names,
  );
  const fallbackProjectName = String(
    account?.project_name || account?.requested_project_name || '',
  ).trim();
  const inferredProjectNames =
    savedProjectNames.length > 0
      ? savedProjectNames
      : organizationType === '본사' && isManagementRole
        ? [ALL_PROJECTS_OPTION]
        : fallbackProjectName && fallbackProjectName !== '본사'
          ? [fallbackProjectName]
          : [];
  const accessScope =
    accessSetting?.access_scope ||
    (inferredProjectNames.includes(ALL_PROJECTS_OPTION)
      ? 'all'
      : organizationType === '현장'
        ? 'home_project'
        : 'selected');
  const projectNames =
    accessScope === 'all'
      ? [ALL_PROJECTS_OPTION]
      : inferredProjectNames.filter((name) => name !== ALL_PROJECTS_OPTION);

  return {
    role,
    positionTitle: String(account?.position_title || '').trim(),
    organizationType,
    departmentCode:
      accessSetting?.department_code || inferDepartmentCode(organizationType),
    permissionTemplateCode:
      accessSetting?.permission_template_code ||
      inferTemplateCode(account, organizationType),
    accessScope,
    projectNames,
    projectAccess: normalizeProjectAccess(projectNames, accessProjects),
    permissionOverrides: normalizePermissionOverrides(
      accessSetting?.permission_overrides,
    ),
    specialPermissions: normalizeSpecialPermissions(
      accessSetting?.special_permissions,
    ),
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
    first.positionTitle === second.positionTitle &&
    first.organizationType === second.organizationType &&
    first.departmentCode === second.departmentCode &&
    first.permissionTemplateCode === second.permissionTemplateCode &&
    first.accessScope === second.accessScope &&
    JSON.stringify(firstProjects) === JSON.stringify(secondProjects) &&
    JSON.stringify(first.projectAccess || []) ===
      JSON.stringify(second.projectAccess || []) &&
    JSON.stringify(normalizePermissionOverrides(first.permissionOverrides)) ===
      JSON.stringify(normalizePermissionOverrides(second.permissionOverrides)) &&
    JSON.stringify(normalizeSpecialPermissions(first.specialPermissions)) ===
      JSON.stringify(normalizeSpecialPermissions(second.specialPermissions))
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

function DetailedPermissionEditor({
  catalog,
  draft,
  scopeKey,
  onScopeChange,
  onOverrideChange,
  disabled,
}) {
  const regularPermissions = useMemo(
    () => (catalog.permissions || []).filter((permission) => !permission.is_sensitive),
    [catalog.permissions],
  );
  const templatePermissionSet = useMemo(
    () => new Set(
      (catalog.templatePermissions || [])
        .filter((item) => item.template_code === draft.permissionTemplateCode)
        .map((item) => item.permission_key),
    ),
    [catalog.templatePermissions, draft.permissionTemplateCode],
  );
  const overrideMap = useMemo(
    () => new Map(
      normalizePermissionOverrides(draft.permissionOverrides).map((item) => [
        `${item.scopeKey}:${item.permissionKey}`,
        item.effect,
      ]),
    ),
    [draft.permissionOverrides],
  );
  const [expandedAreas, setExpandedAreas] = useState({});

  const groupedAreas = useMemo(() => {
    const areas = new Map();

    regularPermissions.forEach((permission) => {
      if (!areas.has(permission.area_code)) {
        areas.set(permission.area_code, {
          areaCode: permission.area_code,
          areaLabel: permission.area_label,
          menus: new Map(),
        });
      }
      const area = areas.get(permission.area_code);
      if (!area.menus.has(permission.menu_code)) {
        area.menus.set(permission.menu_code, {
          menuCode: permission.menu_code,
          menuLabel: permission.menu_label,
          isPreparing: permission.is_preparing,
          permissions: [],
        });
      }
      area.menus.get(permission.menu_code).permissions.push(permission);
    });

    return [...areas.values()].map((area) => ({
      ...area,
      menus: [...area.menus.values()],
    }));
  }, [regularPermissions]);

  const getDirectState = (permissionKey) => (
    overrideMap.get(`${scopeKey}:${permissionKey}`) || 'inherit'
  );

  const isEffectivelyGranted = (permissionKey) => {
    let granted = templatePermissionSet.has(permissionKey);
    const commonEffect = overrideMap.get(
      `${PERMISSION_SCOPE_COMMON}:${permissionKey}`,
    );
    if (commonEffect) granted = commonEffect === 'allow';

    if (scopeKey !== PERMISSION_SCOPE_COMMON) {
      const projectEffect = overrideMap.get(`${scopeKey}:${permissionKey}`);
      if (projectEffect) granted = projectEffect === 'allow';
    }

    return granted;
  };

  return (
    <>
      <Box
        sx={{
          mb: 1.1,
          display: 'flex',
          alignItems: { xs: 'stretch', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 0.8,
        }}
      >
        <TextField
          select
          size="small"
          label="권한 적용 범위"
          value={scopeKey}
          onChange={(event) => onScopeChange(event.target.value)}
          disabled={disabled}
          sx={{ minWidth: { xs: '100%', md: 310 } }}
        >
          <MenuItem value={PERMISSION_SCOPE_COMMON}>모든 접근현장 공통</MenuItem>
          {(draft.projectNames || [])
            .filter((projectName) => projectName !== ALL_PROJECTS_OPTION)
            .map((projectName) => (
              <MenuItem key={projectName} value={projectName}>{projectName}</MenuItem>
            ))}
        </TextField>
        <Typography sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1.5 }}>
          Dashboard는 조회·수정·차단 중 하나를 지정합니다. 다른 메뉴는 상속·추가·차단으로 세부 동작을 설정합니다.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 0.8 }}>
        {groupedAreas.map((area) => {
          const expanded = Boolean(expandedAreas[area.areaCode]);
          const directOverrides = area.menus
            .flatMap((menu) => menu.permissions)
            .filter((permission) => getDirectState(permission.permission_key) !== 'inherit')
            .length;

          return (
            <Paper
              key={area.areaCode}
              variant="outlined"
              sx={{
                overflow: 'hidden',
                boxShadow: 'none',
                borderColor: '#e2e8f0',
              }}
            >
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setExpandedAreas((previous) => ({
                  ...previous,
                  [area.areaCode]: !expanded,
                }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setExpandedAreas((previous) => ({
                      ...previous,
                      [area.areaCode]: !expanded,
                    }));
                  }
                }}
                sx={{
                  minHeight: 43,
                  px: 1.2,
                  py: 0.65,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                  cursor: 'pointer',
                  bgcolor: expanded ? '#f1f5f9' : '#f8fafc',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ color: '#334155', fontSize: '0.72rem', fontWeight: 900 }}>
                    {area.areaLabel}
                  </Typography>
                  <Typography sx={{ mt: 0.1, color: '#94a3b8', fontSize: '0.58rem' }}>
                    메뉴 {area.menus.length}개
                    {directOverrides > 0 ? ` · 현재 범위 개별설정 ${directOverrides}건` : ' · 템플릿 상속'}
                  </Typography>
                </Box>

                <Button
                  size="small"
                  variant="text"
                  endIcon={expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedAreas((previous) => ({
                      ...previous,
                      [area.areaCode]: !expanded,
                    }));
                  }}
                  sx={{
                    minWidth: 80,
                    color: '#475569',
                    fontSize: '0.64rem',
                    fontWeight: 800,
                  }}
                >
                  {expanded ? '접기' : '펼치기'}
                </Button>
              </Box>

              <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Divider />
                <TableContainer>
                  <Table size="small" sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#ffffff' }}>
                        <TableCell sx={{ width: 170, py: 0.7, fontSize: '0.66rem', fontWeight: 900 }}>
                          메뉴
                        </TableCell>
                        <TableCell sx={{ py: 0.7, fontSize: '0.66rem', fontWeight: 800 }}>
                          세부 동작 권한
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {area.menus.map((menu) => (
                        <TableRow key={menu.menuCode} hover>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'top' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                              <Typography sx={{ color: '#334155', fontSize: '0.68rem', fontWeight: 900 }}>
                                {menu.menuLabel}
                              </Typography>
                              {menu.isPreparing && (
                                <Chip size="small" label="준비중" variant="outlined" sx={{ height: 19, fontSize: '0.55rem' }} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 0.55 }}>
                            {menu.menuCode === 'dashboard' ? (() => {
                              const canView = isEffectivelyGranted(
                                DASHBOARD_PERMISSION_KEYS.view,
                              );
                              const canEdit = isEffectivelyGranted(
                                DASHBOARD_PERMISSION_KEYS.edit,
                              );
                              const accessMode = canView && canEdit
                                ? 'edit'
                                : canView
                                  ? 'view'
                                  : 'deny';

                              const handleDashboardModeChange = (nextMode) => {
                                const viewEffect = nextMode === 'deny'
                                  ? 'deny'
                                  : 'allow';
                                const editEffect = nextMode === 'edit'
                                  ? 'allow'
                                  : 'deny';

                                onOverrideChange(
                                  scopeKey,
                                  DASHBOARD_PERMISSION_KEYS.view,
                                  viewEffect,
                                );
                                onOverrideChange(
                                  scopeKey,
                                  DASHBOARD_PERMISSION_KEYS.edit,
                                  editEffect,
                                );
                              };

                              return (
                                <Box
                                  sx={{
                                    maxWidth: 360,
                                    p: 0.65,
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '7px',
                                    bgcolor: accessMode === 'deny' ? '#ffffff' : '#f0f9ff',
                                  }}
                                >
                                  <Box sx={{ mb: 0.45, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                                    <Typography sx={{ color: '#334155', fontSize: '0.62rem', fontWeight: 800 }}>
                                      Dashboard 사용 권한
                                    </Typography>
                                    <Chip
                                      size="small"
                                      label={
                                        accessMode === 'edit'
                                          ? '최종 수정 가능'
                                          : accessMode === 'view'
                                            ? '최종 조회 전용'
                                            : '최종 차단'
                                      }
                                      color={accessMode === 'deny' ? 'default' : 'info'}
                                      variant={accessMode === 'deny' ? 'outlined' : 'filled'}
                                      sx={{ height: 18, fontSize: '0.53rem' }}
                                    />
                                  </Box>
                                  <ToggleButtonGroup
                                    exclusive
                                    size="small"
                                    fullWidth
                                    value={accessMode}
                                    onChange={(_event, value) => value && handleDashboardModeChange(value)}
                                    disabled={disabled}
                                    sx={{
                                      height: 25,
                                      '& .MuiToggleButton-root': { px: 0.55, py: 0, fontSize: '0.55rem', fontWeight: 800 },
                                      '& .MuiToggleButton-root.Mui-selected:nth-of-type(1)': { color: '#0369a1', bgcolor: '#e0f2fe' },
                                      '& .MuiToggleButton-root.Mui-selected:nth-of-type(2)': { color: '#166534', bgcolor: '#dcfce7' },
                                      '& .MuiToggleButton-root.Mui-selected:nth-of-type(3)': { color: '#b91c1c', bgcolor: '#fee2e2' },
                                    }}
                                  >
                                    {DASHBOARD_ACCESS_OPTIONS.map((option) => (
                                      <ToggleButton key={option.value} value={option.value}>
                                        {option.label}
                                      </ToggleButton>
                                    ))}
                                  </ToggleButtonGroup>
                                </Box>
                              );
                            })() : (
                            <Box sx={{ display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
                              {menu.permissions.map((permission) => {
                                const state = getDirectState(permission.permission_key);
                                const granted = isEffectivelyGranted(permission.permission_key);

                                return (
                                  <Box
                                    key={permission.permission_key}
                                    sx={{
                                      minWidth: 215,
                                      p: 0.65,
                                      border: '1px solid #e2e8f0',
                                      borderRadius: '7px',
                                      bgcolor: granted ? '#f0f9ff' : '#ffffff',
                                    }}
                                  >
                                    <Box sx={{ mb: 0.45, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                                      <Typography sx={{ color: '#334155', fontSize: '0.62rem', fontWeight: 800 }}>
                                        {permission.action_label}
                                      </Typography>
                                      <Chip
                                        size="small"
                                        label={granted ? '최종 허용' : '최종 차단'}
                                        color={granted ? 'info' : 'default'}
                                        variant={granted ? 'filled' : 'outlined'}
                                        sx={{ height: 18, fontSize: '0.53rem' }}
                                      />
                                    </Box>
                                    <ToggleButtonGroup
                                      exclusive
                                      size="small"
                                      fullWidth
                                      value={state}
                                      onChange={(_event, value) => value && onOverrideChange(
                                        scopeKey,
                                        permission.permission_key,
                                        value,
                                      )}
                                      disabled={disabled}
                                      sx={{
                                        height: 25,
                                        '& .MuiToggleButton-root': { px: 0.55, py: 0, fontSize: '0.55rem', fontWeight: 800 },
                                        '& .MuiToggleButton-root.Mui-selected:nth-of-type(2)': { color: '#0369a1', bgcolor: '#e0f2fe' },
                                        '& .MuiToggleButton-root.Mui-selected:nth-of-type(3)': { color: '#b91c1c', bgcolor: '#fee2e2' },
                                      }}
                                    >
                                      {OVERRIDE_STATE_OPTIONS.map((option) => (
                                        <ToggleButton key={option.value} value={option.value}>
                                          {option.label}
                                        </ToggleButton>
                                      ))}
                                    </ToggleButtonGroup>
                                  </Box>
                                );
                              })}
                            </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>
          );
        })}
      </Box>
    </>
  );
}

function SpecialPermissionEditor({ catalog, draft, onChange, disabled }) {
  const permissions = (catalog.permissions || []).filter(
    (permission) => permission.is_sensitive,
  );
  const grantedSet = new Set(normalizeSpecialPermissions(draft.specialPermissions));
  const isSuperAdmin = draft.permissionTemplateCode === 'super_admin';

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 0.7 }}>
      {permissions.map((permission) => (
        <Box
          key={permission.permission_key}
          sx={{
            px: 0.9,
            py: 0.45,
            border: '1px solid',
            borderColor: permission.action_rank >= 90 ? '#fecaca' : '#e2e8f0',
            borderRadius: '8px',
            bgcolor: permission.action_rank >= 90 ? '#fff7f7' : '#ffffff',
          }}
        >
          <FormControlLabel
            control={(
              <Switch
                size="small"
                checked={isSuperAdmin || grantedSet.has(permission.permission_key)}
                onChange={(event) => onChange(permission.permission_key, event.target.checked)}
                disabled={disabled || isSuperAdmin}
              />
            )}
            label={(
              <Box>
                <Typography sx={{ color: '#334155', fontSize: '0.66rem', fontWeight: 900 }}>
                  {permission.action_label}
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.57rem' }}>
                  {permission.menu_label}{permission.is_preparing ? ' · 준비중' : ''}
                </Typography>
              </Box>
            )}
            sx={{ m: 0, width: '100%' }}
          />
        </Box>
      ))}
    </Box>
  );
}

function AuditHistory({ logs }) {
  const items = Array.isArray(logs) ? logs : [];

  if (items.length === 0) {
    return (
      <Typography sx={{ py: 1, color: '#94a3b8', fontSize: '0.68rem', textAlign: 'center' }}>
        아직 기록된 변경이력이 없습니다.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ maxHeight: 260, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 145, fontSize: '0.62rem', fontWeight: 900 }}>변경일시</TableCell>
            <TableCell sx={{ width: 130, fontSize: '0.62rem', fontWeight: 900 }}>변경자</TableCell>
            <TableCell sx={{ fontSize: '0.62rem', fontWeight: 900 }}>변경내용</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontSize: '0.61rem' }}>{formatDateTime(item.changed_at)}</TableCell>
              <TableCell sx={{ fontSize: '0.61rem' }}>{item.changed_by_name || item.changed_by_email || '시스템 자동변환'}</TableCell>
              <TableCell sx={{ fontSize: '0.61rem' }}>
                {item.change_summary || '회원 권한 설정 변경'}
                {Array.isArray(item.changed_fields) && item.changed_fields.length > 0
                  ? ` · ${item.changed_fields.join(', ')}`
                  : ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function UserManagement({ currentUserId = '' }) {
  const [accounts, setAccounts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [accessSettings, setAccessSettings] = useState({});
  const [accessCatalog, setAccessCatalog] = useState({
    departments: [],
    templates: [],
    permissions: [],
    templatePermissions: [],
  });
  const [permissionScopeByUser, setPermissionScopeByUser] = useState({});
  const [templateChangeRequest, setTemplateChangeRequest] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
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
      const [
        accountResult,
        projectResult,
        catalogResult,
        accessResult,
      ] = await Promise.all([
        supabase.rpc('admin_list_user_accounts'),
        supabase.rpc('list_registration_projects'),
        supabase.rpc('admin_get_access_catalog_v2'),
        supabase.rpc('admin_list_user_access_v2'),
      ]);

      if (accountResult.error) throw accountResult.error;
      if (projectResult.error) throw projectResult.error;
      if (catalogResult.error) throw catalogResult.error;
      if (accessResult.error) throw accessResult.error;

      const nextAccounts = Array.isArray(accountResult.data)
        ? accountResult.data
        : [];
      const nextAccessSettings = Object.fromEntries(
        (Array.isArray(accessResult.data) ? accessResult.data : []).map(
          (setting) => [setting.auth_user_id, setting],
        ),
      );
      const nextCatalog = {
        departments: Array.isArray(catalogResult.data?.departments)
          ? catalogResult.data.departments
          : [],
        templates: Array.isArray(catalogResult.data?.templates)
          ? catalogResult.data.templates
          : [],
        permissions: Array.isArray(catalogResult.data?.permissions)
          ? catalogResult.data.permissions
          : [],
        templatePermissions: Array.isArray(catalogResult.data?.template_permissions)
          ? catalogResult.data.template_permissions
          : [],
      };

      setAccounts(nextAccounts);
      setAccessSettings(nextAccessSettings);
      setAccessCatalog(nextCatalog);
      setDrafts(
        Object.fromEntries(
          nextAccounts.map((account) => [
            account.auth_user_id,
            createDraft(account, nextAccessSettings[account.auth_user_id]),
          ]),
        ),
      );
      setPermissionScopeByUser((previous) => Object.fromEntries(
        nextAccounts.map((account) => [
          account.auth_user_id,
          previous[account.auth_user_id] || PERMISSION_SCOPE_COMMON,
        ]),
      ));
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
      const message = String(error?.message || '');
      setErrorMessage(
        message.includes('admin_get_access_catalog_v2') ||
        message.includes('admin_list_user_access_v2')
          ? '회원권한 2~5단계 통합 SQL이 아직 적용되지 않았습니다. 제공된 Supabase SQL을 먼저 실행해주세요.'
          : message || '회원목록을 불러오지 못했습니다.',
      );
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
    ? drafts[selectedAccount.auth_user_id] ||
      createDraft(
        selectedAccount,
        accessSettings[selectedAccount.auth_user_id],
      )
    : null;
  const selectedStatus = selectedAccount?.account_status || 'pending';
  const selectedStatusInfo = STATUS_INFO[selectedStatus] || STATUS_INFO.pending;
  const selectedIsCurrentUser = Boolean(
    selectedAccount && String(selectedAccount.auth_user_id) === String(currentUserId),
  );
  const selectedIsSuperAdmin = selectedAccount?.role === '최고관리자';
  const selectedIsProcessing = Boolean(
    selectedAccount && processingId === selectedAccount.auth_user_id,
  );
  const selectedIsDirty = Boolean(
    selectedAccount &&
    !areDraftsEqual(
      selectedDraft,
      createDraft(
        selectedAccount,
        accessSettings[selectedAccount.auth_user_id],
      ),
    ),
  );

  const selectedDepartment = useMemo(
    () => accessCatalog.departments.find(
      (department) => department.code === selectedDraft?.departmentCode,
    ) || null,
    [accessCatalog.departments, selectedDraft?.departmentCode],
  );

  const compatibleTemplates = useMemo(
    () => accessCatalog.templates.filter((template) => (
      template.organization_type === '공통' ||
      template.organization_type === selectedDraft?.organizationType
    ) && (
      !template.department_code ||
      template.department_code === selectedDraft?.departmentCode
    ) && (
      template.code !== 'super_admin' ||
      selectedDraft?.role === '최고관리자'
    )),
    [
      accessCatalog.templates,
      selectedDraft?.departmentCode,
      selectedDraft?.organizationType,
      selectedDraft?.role,
    ],
  );

  const selectedTemplate = useMemo(
    () => accessCatalog.templates.find(
      (template) => template.code === selectedDraft?.permissionTemplateCode,
    ) || null,
    [accessCatalog.templates, selectedDraft?.permissionTemplateCode],
  );
  const selectedPermissionScope = selectedAccount && selectedDraft
    ? (
        permissionScopeByUser[selectedAccount.auth_user_id] === PERMISSION_SCOPE_COMMON ||
        (selectedDraft.projectNames || []).includes(
          permissionScopeByUser[selectedAccount.auth_user_id],
        )
      )
      ? permissionScopeByUser[selectedAccount.auth_user_id]
      : PERMISSION_SCOPE_COMMON
    : PERMISSION_SCOPE_COMMON;

  const changeDraft = (userId, field, value) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      const nextOrganizationType =
        field === 'organizationType' ? value : current.organizationType;
      const nextDepartmentCode =
        field === 'organizationType'
          ? inferDepartmentCode(value)
          : field === 'departmentCode'
            ? value
            : current.departmentCode;
      const matchingTemplate = accessCatalog.templates.find((template) => (
        template.organization_type === nextOrganizationType &&
        template.department_code === nextDepartmentCode
      ));
      const nextDraft = {
        ...previous,
        [userId]: {
          ...current,
          [field]: value,
          ...(field === 'organizationType'
            ? {
                departmentCode: nextDepartmentCode,
                permissionTemplateCode:
                  value === '본사' && current.role === '최고관리자'
                    ? 'super_admin'
                    : matchingTemplate?.code ||
                      inferTemplateCode({ role: current.role }, value),
                accessScope: value === '현장' ? 'home_project' : 'selected',
                projectNames: [],
                projectAccess: [],
              }
            : {}),
          ...(field === 'departmentCode'
            ? {
                permissionTemplateCode:
                  matchingTemplate?.code || current.permissionTemplateCode,
              }
            : {}),
        },
      };

      if (
        field === 'role' &&
        value === '담당자' &&
        current.accessScope === 'all'
      ) {
        nextDraft[userId].accessScope = 'selected';
        nextDraft[userId].projectNames = [];
        nextDraft[userId].projectAccess = [];
      }

      if (
        field === 'role' &&
        value !== '최고관리자' &&
        current.permissionTemplateCode === 'super_admin'
      ) {
        nextDraft[userId].permissionTemplateCode =
          matchingTemplate?.code ||
          inferTemplateCode({ role: value }, current.organizationType);
      }

      if (
        field === 'role' &&
        value === '최고관리자'
      ) {
        nextDraft[userId].organizationType = '본사';
        nextDraft[userId].departmentCode = 'construction';
        nextDraft[userId].permissionTemplateCode = 'super_admin';
        nextDraft[userId].accessScope = 'all';
        nextDraft[userId].projectNames = [ALL_PROJECTS_OPTION];
        nextDraft[userId].projectAccess = [];
      }

      return nextDraft;
    });
  };

  const changeProjectSelection = (userId, values) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      const projectNames = normalizeProjectSelection(values, current.projectNames);

      return {
        ...previous,
        [userId]: {
          ...current,
          projectNames,
          projectAccess: normalizeProjectAccess(
            projectNames,
            current.projectAccess,
          ),
          permissionOverrides: normalizePermissionOverrides(
            current.permissionOverrides,
          ).filter((item) => (
            item.scopeKey === PERMISSION_SCOPE_COMMON ||
            projectNames.includes(item.scopeKey)
          )),
        },
      };
    });
  };

  const changeAccessScope = (userId, accessScope) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      const projectNames =
        accessScope === 'all'
          ? [ALL_PROJECTS_OPTION]
          : normalizeProjectNames(current.projectNames)
            .filter((name) => name !== ALL_PROJECTS_OPTION);
      const limitedProjectNames =
        accessScope === 'home_project' ? projectNames.slice(0, 1) : projectNames;

      return {
        ...previous,
        [userId]: {
          ...current,
          accessScope,
          projectNames: limitedProjectNames,
          projectAccess:
            accessScope === 'all'
              ? []
              : normalizeProjectAccess(limitedProjectNames, current.projectAccess),
          permissionOverrides: normalizePermissionOverrides(
            current.permissionOverrides,
          ).filter((item) => (
            item.scopeKey === PERMISSION_SCOPE_COMMON ||
            limitedProjectNames.includes(item.scopeKey)
          )),
        },
      };
    });
  };

  const applyTemplateChange = (userId, templateCode, resetPersonalSettings) => {
    setDrafts((previous) => ({
      ...previous,
      [userId]: {
        ...(previous[userId] || {}),
        permissionTemplateCode: templateCode,
        ...(resetPersonalSettings
          ? { permissionOverrides: [], specialPermissions: [] }
          : {}),
      },
    }));
    setTemplateChangeRequest(null);
  };

  const requestTemplateChange = (userId, templateCode) => {
    const current = drafts[userId] || {};
    if (current.permissionTemplateCode === templateCode) return;

    const hasPersonalSettings =
      normalizePermissionOverrides(current.permissionOverrides).length > 0 ||
      normalizeSpecialPermissions(current.specialPermissions).length > 0;

    if (!hasPersonalSettings) {
      applyTemplateChange(userId, templateCode, false);
      return;
    }

    setTemplateChangeRequest({ userId, templateCode });
  };

  const changePermissionOverride = (userId, scopeKey, permissionKey, state) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      const remaining = normalizePermissionOverrides(
        current.permissionOverrides,
      ).filter((item) => !(
        item.scopeKey === scopeKey && item.permissionKey === permissionKey
      ));
      const nextOverrides = state === 'inherit'
        ? remaining
        : [
            ...remaining,
            { scopeKey, permissionKey, effect: state },
          ];

      return {
        ...previous,
        [userId]: {
          ...current,
          permissionOverrides: normalizePermissionOverrides(nextOverrides),
        },
      };
    });
  };

  const changeSpecialPermission = (userId, permissionKey, granted) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      const currentPermissions = new Set(
        normalizeSpecialPermissions(current.specialPermissions),
      );
      if (granted) currentPermissions.add(permissionKey);
      else currentPermissions.delete(permissionKey);

      return {
        ...previous,
        [userId]: {
          ...current,
          specialPermissions: [...currentPermissions].sort(),
        },
      };
    });
  };

  const changeProjectAccessDate = (userId, projectName, field, value) => {
    setDrafts((previous) => {
      const current = previous[userId] || {};
      return {
        ...previous,
        [userId]: {
          ...current,
          projectAccess: (current.projectAccess || []).map((item) =>
            item.projectName === projectName
              ? { ...item, [field]: value }
              : item,
          ),
        },
      };
    });
  };

  const resetDraft = (account) => {
    if (!account) return;
    setDrafts((previous) => ({
      ...previous,
      [account.auth_user_id]: createDraft(
        account,
        accessSettings[account.auth_user_id],
      ),
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
    const draft = drafts[userId] || createDraft(
      account,
      accessSettings[userId],
    );
    const projectNames = normalizeProjectNames(draft.projectNames)
      .filter((projectName) => projectName !== ALL_PROJECTS_OPTION);

    if (draft.accessScope !== 'all' && projectNames.length === 0) {
      setErrorMessage(`${account.manager_name || account.email}의 접근 현장을 하나 이상 선택해주세요.`);
      return;
    }

    if (
      draft.accessScope === 'all' &&
      (
        draft.organizationType !== '본사' ||
        !['관리자', '최고관리자'].includes(draft.role)
      )
    ) {
      setErrorMessage('전체현장은 본사 관리자·최고관리자에게만 지정할 수 있습니다.');
      return;
    }

    if (draft.accessScope === 'home_project' && projectNames.length !== 1) {
      setErrorMessage('소속현장 범위는 현장 한 곳만 선택해주세요.');
      return;
    }

    if (!draft.departmentCode) {
      setErrorMessage('부서를 선택해주세요.');
      return;
    }

    if (!draft.permissionTemplateCode) {
      setErrorMessage('권한 템플릿을 선택해주세요.');
      return;
    }

    const invalidAccessDate = (draft.projectAccess || []).find(
      (item) =>
        item.accessStartDate &&
        item.accessEndDate &&
        item.accessStartDate > item.accessEndDate,
    );

    if (invalidAccessDate) {
      setErrorMessage(`${invalidAccessDate.projectName}의 접근 종료일은 시작일보다 빠를 수 없습니다.`);
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
        'admin_update_user_access_v2',
        {
          p_user_id: userId,
          p_role: draft.role,
          p_position_title: String(draft.positionTitle || '').trim(),
          p_organization_type: draft.organizationType,
          p_department_code: draft.departmentCode,
          p_permission_template_code: draft.permissionTemplateCode,
          p_access_scope: draft.accessScope,
          p_project_names: projectNames,
          p_project_access: (draft.projectAccess || []).map((item) => ({
            project_name: item.projectName,
            access_start_date: item.accessStartDate || null,
            access_end_date: item.accessEndDate || null,
            is_active: item.isActive !== false,
          })),
          p_permission_overrides: normalizePermissionOverrides(
            draft.permissionOverrides,
          ).map((item) => ({
            scope_key: item.scopeKey,
            permission_key: item.permissionKey,
            effect: item.effect,
          })),
          p_special_permissions: normalizeSpecialPermissions(
            draft.specialPermissions,
          ),
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

  const openDeleteDialog = (account) => {
    if (!account) return;

    if (String(account.auth_user_id) === String(currentUserId)) {
      setErrorMessage('현재 로그인한 본인 계정은 삭제할 수 없습니다.');
      return;
    }

    if (account.role === '최고관리자') {
      setErrorMessage('최고관리자 계정은 회원관리 화면에서 삭제할 수 없습니다.');
      return;
    }

    setDeleteRequest(account);
    setDeleteConfirmationText('');
    setErrorMessage('');
    setSuccessMessage('');
  };

  const closeDeleteDialog = () => {
    if (deleteRequest && processingId === deleteRequest.auth_user_id) return;
    setDeleteRequest(null);
    setDeleteConfirmationText('');
  };

  const deleteAccount = async () => {
    if (!deleteRequest) return;

    const targetEmail = String(deleteRequest.email || '').trim();
    if (
      String(deleteConfirmationText || '').trim().toLowerCase() !==
      targetEmail.toLowerCase()
    ) {
      setErrorMessage('삭제 대상의 이메일 주소를 정확히 입력해주세요.');
      return;
    }

    const userId = deleteRequest.auth_user_id;
    const displayName = deleteRequest.manager_name || targetEmail;

    setProcessingId(userId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.rpc('admin_delete_user_account', {
        p_user_id: userId,
        p_confirmation_email: targetEmail,
      });

      if (error) throw error;

      setDeleteRequest(null);
      setDeleteConfirmationText('');
      setSuccessMessage(`${displayName} 계정을 영구 삭제했습니다.`);
      await loadAccounts();
      window.dispatchEvent(new CustomEvent('user-account-changed'));
    } catch (error) {
      console.error('회원 계정 삭제 오류:', error);
      setErrorMessage(
        error?.message || '회원 계정을 삭제하지 못했습니다.',
      );
    } finally {
      setProcessingId('');
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
                const savedAccess = accessSettings[userId];
                const draft = drafts[userId] || createDraft(account, savedAccess);
                const isSelected = userId === effectiveSelectedUserId;
                const isDirty = !areDraftsEqual(
                  draft,
                  createDraft(account, savedAccess),
                );

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
                        label={
                          accessCatalog.templates.find(
                            (template) => template.code === draft.permissionTemplateCode,
                          )?.name || '권한 템플릿 미설정'
                        }
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
                  label={selectedDraft.positionTitle || '직급 미입력'}
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
                      <MenuItem value="외부업체">외부업체</MenuItem>
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
                      value={selectedDraft.positionTitle || ''}
                      onChange={(event) => changeDraft(
                        selectedAccount.auth_user_id,
                        'positionTitle',
                        event.target.value,
                      )}
                      disabled={selectedIsProcessing}
                      helperText="직급은 최고관리자만 수정할 수 있습니다."
                    />
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="부서"
                      value={selectedDraft.departmentCode || ''}
                      onChange={(event) => changeDraft(
                        selectedAccount.auth_user_id,
                        'departmentCode',
                        event.target.value,
                      )}
                      disabled={selectedIsProcessing || selectedDraft.role === '최고관리자'}
                      helperText={selectedDepartment ? `${selectedDepartment.name} 부서 권한 기준` : '부서를 선택해주세요.'}
                    >
                      {accessCatalog.departments
                        .filter((department) =>
                          department.organization_type === '공통' ||
                          department.organization_type === selectedDraft.organizationType,
                        )
                        .map((department) => (
                          <MenuItem key={department.code} value={department.code}>
                            {department.name}
                          </MenuItem>
                        ))}
                    </TextField>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="2"
                    title="접근현장"
                    description="소속현장·선택현장·전체현장 범위와 현장별 접근기간을 설정합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="현장 접근 범위"
                    value={selectedDraft.accessScope}
                    onChange={(event) => changeAccessScope(
                      selectedAccount.auth_user_id,
                      event.target.value,
                    )}
                    disabled={selectedIsProcessing || selectedDraft.role === '최고관리자'}
                    sx={{ mb: 1.1 }}
                  >
                    {ACCESS_SCOPE_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        value={option.value}
                        disabled={
                          option.value === 'all' &&
                          (
                            selectedDraft.organizationType !== '본사' ||
                            !['관리자', '최고관리자'].includes(selectedDraft.role)
                          )
                        }
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>

                  {selectedDraft.accessScope === 'all' ? (
                    <Alert severity="info" sx={{ py: 0.2, fontSize: '0.72rem' }}>
                      현재 등록 현장과 앞으로 추가될 현장까지 모두 접근합니다.
                    </Alert>
                  ) : selectedDraft.accessScope === 'home_project' ? (
                    <Autocomplete
                      size="small"
                      options={projectOptions}
                      value={selectedDraft.projectNames?.[0] || null}
                      onChange={(_event, value) => changeProjectSelection(
                        selectedAccount.auth_user_id,
                        value ? [value] : [],
                      )}
                      disabled={selectedIsProcessing}
                      noOptionsText="검색되는 현장이 없습니다."
                      renderInput={(params) => (
                        <TextField {...params} label="소속현장" placeholder="현장 검색" />
                      )}
                    />
                  ) : (
                    <Autocomplete
                      multiple
                      disableCloseOnSelect
                      limitTags={3}
                      size="small"
                      options={projectOptions}
                      value={selectedDraft.projectNames || []}
                      onChange={(_event, value) => changeProjectSelection(
                        selectedAccount.auth_user_id,
                        value,
                      )}
                      disabled={selectedIsProcessing}
                      noOptionsText="검색되는 현장이 없습니다."
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="선택현장"
                          placeholder={(selectedDraft.projectNames || []).length === 0 ? '현장 검색·복수 선택' : ''}
                        />
                      )}
                    />
                  )}

                  {selectedDraft.accessScope !== 'all' &&
                    (selectedDraft.projectAccess || []).length > 0 && (
                    <Box sx={{ mt: 1.1, display: 'grid', gap: 0.7 }}>
                      {(selectedDraft.projectAccess || []).map((item) => (
                        <Box
                          key={item.projectName}
                          sx={{
                            p: 0.9,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', lg: 'minmax(180px, 1fr) 145px 145px' },
                            gap: 0.8,
                            alignItems: 'center',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            bgcolor: '#f8fafc',
                          }}
                        >
                          <Typography sx={{ color: '#334155', fontSize: '0.72rem', fontWeight: 800 }}>
                            {item.projectName}
                          </Typography>
                          <KoreanDatePicker
                            size="small"
                            label="접근 시작일"
                            value={item.accessStartDate || ''}
                            onChange={(value) => changeProjectAccessDate(
                              selectedAccount.auth_user_id,
                              item.projectName,
                              'accessStartDate',
                              value,
                            )}
                            allowClear
                            disabled={selectedIsProcessing}
                          />
                          <KoreanDatePicker
                            size="small"
                            label="접근 종료일"
                            value={item.accessEndDate || ''}
                            onChange={(value) => changeProjectAccessDate(
                              selectedAccount.auth_user_id,
                              item.projectName,
                              'accessEndDate',
                              value,
                            )}
                            allowClear
                            disabled={selectedIsProcessing}
                          />
                        </Box>
                      ))}
                      <Typography sx={{ color: '#64748b', fontSize: '0.64rem' }}>
                        날짜를 비워두면 기간 제한 없이 접근합니다.
                      </Typography>
                    </Box>
                  )}
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
                    description="부서와 사용자 구분에 맞는 기본 권한 묶음을 지정합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="권한 템플릿"
                    value={selectedDraft.permissionTemplateCode || ''}
                    onChange={(event) => requestTemplateChange(
                      selectedAccount.auth_user_id,
                      event.target.value,
                    )}
                    disabled={selectedIsProcessing || selectedDraft.role === '최고관리자'}
                    helperText={selectedTemplate?.description || '권한 템플릿을 선택해주세요.'}
                  >
                    {compatibleTemplates.map((template) => (
                      <MenuItem key={template.code} value={template.code}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Alert severity="info" sx={{ mt: 1, py: 0, fontSize: '0.7rem' }}>
                    템플릿의 기본값 위에 개인별 권한이 적용됩니다. Dashboard는 조회·수정·차단으로 구분되며, 조회는 화면만 열 수 있고 수정부터 일정 저장이 가능합니다.
                  </Alert>
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="4"
                    title="세부권한"
                    description="Dashboard는 조회·수정·차단으로 지정하고, 다른 메뉴는 필요한 동작을 공통 또는 현장별로 추가·차단합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <DetailedPermissionEditor
                    catalog={accessCatalog}
                    draft={selectedDraft}
                    scopeKey={selectedPermissionScope}
                    onScopeChange={(scopeKey) => setPermissionScopeByUser((previous) => ({
                      ...previous,
                      [selectedAccount.auth_user_id]: scopeKey,
                    }))}
                    onOverrideChange={(scopeKey, permissionKey, state) => changePermissionOverride(
                      selectedAccount.auth_user_id,
                      scopeKey,
                      permissionKey,
                      state,
                    )}
                    disabled={selectedIsProcessing || selectedDraft.role === '최고관리자'}
                  />
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="5"
                    title="특수권한"
                    description="개인정보·마감취소·강제삭제처럼 일반 관리권한과 분리해야 하는 민감 기능입니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <Alert severity="warning" sx={{ mb: 1, py: 0, fontSize: '0.68rem' }}>
                    특수권한은 필요한 사용자에게만 개별 부여되며 모든 접근현장에 공통 적용됩니다.
                  </Alert>
                  <SpecialPermissionEditor
                    catalog={accessCatalog}
                    draft={selectedDraft}
                    onChange={(permissionKey, granted) => changeSpecialPermission(
                      selectedAccount.auth_user_id,
                      permissionKey,
                      granted,
                    )}
                    disabled={selectedIsProcessing}
                  />
                </Paper>

                <Paper variant="outlined" sx={{ mt: 1.2, p: 1.4, borderColor: '#e2e8f0', boxShadow: 'none' }}>
                  <SectionTitle
                    number="6"
                    title="권한 변경이력"
                    description="자동 변환과 관리자 저장 내역을 최근 순서로 표시합니다."
                  />
                  <Divider sx={{ my: 1.2 }} />
                  <AuditHistory logs={accessSettings[selectedAccount.auth_user_id]?.audit_logs} />
                </Paper>
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
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    onClick={() => openDeleteDialog(selectedAccount)}
                    disabled={
                      selectedIsProcessing ||
                      selectedIsCurrentUser ||
                      selectedIsSuperAdmin
                    }
                  >
                    계정 영구삭제
                  </Button>
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

      <Dialog
        open={Boolean(deleteRequest)}
        onClose={closeDeleteDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: '#b91c1c', fontSize: '0.95rem', fontWeight: 900 }}>
          회원 계정 영구삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.74rem' }}>
            삭제한 계정은 다시 로그인할 수 없으며 복구할 수 없습니다. 기존 작성 문서와 업무 이력은 삭제하지 않습니다.
          </Alert>
          <Typography sx={{ color: '#334155', fontSize: '0.76rem', lineHeight: 1.7 }}>
            삭제 대상: <strong>{deleteRequest?.manager_name || '-'}</strong>
            <br />
            이메일: <strong>{deleteRequest?.email || '-'}</strong>
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="확인을 위해 삭제 대상 이메일 입력"
            value={deleteConfirmationText}
            onChange={(event) => setDeleteConfirmationText(event.target.value)}
            disabled={Boolean(
              deleteRequest && processingId === deleteRequest.auth_user_id,
            )}
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.4, pb: 2, gap: 0.6 }}>
          <Button
            size="small"
            onClick={closeDeleteDialog}
            disabled={Boolean(
              deleteRequest && processingId === deleteRequest.auth_user_id,
            )}
          >
            취소
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={deleteAccount}
            disabled={
              !deleteRequest ||
              Boolean(processingId) ||
              String(deleteConfirmationText || '').trim().toLowerCase() !==
                String(deleteRequest?.email || '').trim().toLowerCase()
            }
          >
            {deleteRequest && processingId === deleteRequest.auth_user_id
              ? '삭제 중...'
              : '계정 영구삭제'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(templateChangeRequest)}
        onClose={() => setTemplateChangeRequest(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 900 }}>
          권한 템플릿 변경
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#334155', fontSize: '0.76rem', lineHeight: 1.7 }}>
            개인별 세부권한 또는 특수권한이 설정되어 있습니다. 새 템플릿으로 바꿀 때 기존 개인별 설정을 어떻게 처리할지 선택해주세요.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.4, pb: 2, gap: 0.6, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setTemplateChangeRequest(null)}>
            변경 취소
          </Button>
          <Button
            size="small"
            color="warning"
            variant="outlined"
            onClick={() => templateChangeRequest && applyTemplateChange(
              templateChangeRequest.userId,
              templateChangeRequest.templateCode,
              true,
            )}
          >
            새 템플릿으로 초기화
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => templateChangeRequest && applyTemplateChange(
              templateChangeRequest.userId,
              templateChangeRequest.templateCode,
              false,
            )}
          >
            개인별 설정 유지
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
