import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import { supabase } from '../supabaseClient';
import { formatKoreaDateTime } from '../utils/attendance';

const SCOPE_META = {
  common: {
    label: '공통',
    color: '#15803d',
    background: '#dcfce7',
  },
  project: {
    label: '담당',
    color: '#1d4ed8',
    background: '#dbeafe',
  },
};

function ScopeBadge({ scopeType }) {
  const meta = SCOPE_META[scopeType] || SCOPE_META.project;

  return (
    <Box
      sx={{
        width: 44,
        height: 44,
        flex: '0 0 44px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: meta.background,
        color: meta.color,
        fontSize: '0.72rem',
        fontWeight: 900,
        border: `1px solid ${meta.color}33`,
      }}
    >
      {meta.label}
    </Box>
  );
}

export default function RiskBroadcastManagement({ currentProjectName, onMessage }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capability, setCapability] = useState({
    role: '',
    can_publish_common: false,
    can_publish_project: false,
    available_projects: [],
  });
  const [records, setRecords] = useState([]);
  const [scopeType, setScopeType] = useState('project');
  const [projectName, setProjectName] = useState(currentProjectName || '');
  const [content, setContent] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);

  const availableProjects = useMemo(
    () => Array.isArray(capability.available_projects)
      ? capability.available_projects
      : [],
    [capability.available_projects],
  );

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    const { data, error } = await supabase.rpc(
      'attendance_risk_management_v52_14_9',
    );

    if (error) {
      onMessage?.({
        severity: 'error',
        text: error.message || '중점위험요인을 불러오지 못했습니다.',
      });
      setLoading(false);
      return;
    }

    const nextProjects = Array.isArray(data?.available_projects)
      ? data.available_projects
      : [];
    const canPublishCommon = data?.can_publish_common === true;
    const canPublishProject = data?.can_publish_project === true;

    setCapability({
      role: String(data?.role || ''),
      can_publish_common: canPublishCommon,
      can_publish_project: canPublishProject,
      available_projects: nextProjects,
    });
    setRecords(Array.isArray(data?.records) ? data.records : []);
    setScopeType((previous) => {
      if (previous === 'common' && canPublishCommon) return 'common';
      if (previous === 'project' && canPublishProject) return 'project';
      return canPublishCommon ? 'common' : 'project';
    });
    setProjectName((previous) => {
      if (nextProjects.includes(previous)) return previous;
      if (nextProjects.includes(currentProjectName)) return currentProjectName;
      return nextProjects[0] || '';
    });
    setLoading(false);
  }, [currentProjectName, onMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const publishBroadcast = async () => {
    const normalizedContent = content.trim();
    if (normalizedContent.length < 5) {
      onMessage?.({ severity: 'warning', text: '중점위험요인을 5자 이상 입력해주세요.' });
      return;
    }
    if (scopeType === 'project' && !projectName) {
      onMessage?.({ severity: 'warning', text: '전파할 현장을 선택해주세요.' });
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc(
      'attendance_publish_risk_v52_14_9',
      {
        p_scope_type: scopeType,
        p_project_name: scopeType === 'common' ? null : projectName,
        p_content: normalizedContent,
      },
    );
    setSaving(false);

    if (error) {
      onMessage?.({ severity: 'error', text: error.message || '중점위험요인을 등록하지 못했습니다.' });
      return;
    }

    setContent('');
    onMessage?.({ severity: 'success', text: '중점위험요인을 전파했습니다.' });
    await loadData(true);
  };

  const closeBroadcast = async () => {
    if (!closeTarget?.id) return;

    setSaving(true);
    const { error } = await supabase.rpc(
      'attendance_close_risk_v52_14_9',
      { p_broadcast_id: closeTarget.id },
    );
    setSaving(false);

    if (error) {
      onMessage?.({ severity: 'error', text: error.message || '전파를 종료하지 못했습니다.' });
      return;
    }

    setCloseTarget(null);
    onMessage?.({ severity: 'success', text: '중점위험요인 전파를 종료했습니다.' });
    await loadData(true);
  };

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ py: 10, textAlign: 'center', borderColor: '#cbd5e1' }}>
        <CircularProgress size={32} />
        <Typography sx={{ mt: 1.5, color: '#64748b', fontSize: '0.78rem' }}>
          중점위험요인을 불러오고 있습니다.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 2, borderColor: '#cbd5e1' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CampaignRoundedIcon sx={{ color: '#b91c1c' }} />
          <Box>
            <Typography sx={{ fontWeight: 900 }}>중점위험요인 전파 등록</Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>
              {capability.role === '담당자'
                ? '담당자는 배정된 현장에만 전파할 수 있습니다.'
                : '전체 공통 또는 접근 가능한 특정 현장을 선택해 전파할 수 있습니다.'}
            </Typography>
          </Box>
        </Stack>
        <Divider sx={{ my: 1.5 }} />

        {!capability.can_publish_common && !capability.can_publish_project && (
          <Alert severity="info" sx={{ mb: 1.2 }}>
            현재 계정에는 중점위험요인 등록 권한이 없어 전파 이력만 조회할 수 있습니다.
          </Alert>
        )}

        {(capability.can_publish_common || capability.can_publish_project) && (
          <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px minmax(220px, 1fr)' }, gap: 1.2 }}>
          <TextField
            select
            size="small"
            label="전파 범위"
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value)}
          >
            {capability.can_publish_common && <MenuItem value="common">전체 공통</MenuItem>}
            {capability.can_publish_project && <MenuItem value="project">특정 현장</MenuItem>}
          </TextField>
          <TextField
            select
            size="small"
            label="대상 현장"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            disabled={scopeType === 'common' || availableProjects.length <= 1}
            helperText={scopeType === 'common' ? '모든 현장 근로자에게 표시됩니다.' : ''}
          >
            {availableProjects.map((project) => (
              <MenuItem key={project} value={project}>{project}</MenuItem>
            ))}
          </TextField>
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={4}
          inputProps={{ maxLength: 1000 }}
          label="중점위험요인 내용"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="오늘 작업에서 반드시 공유해야 할 위험요인과 예방조치를 입력해주세요."
          helperText={`${content.length}/1000자`}
          sx={{ mt: 1.2 }}
        />
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.2 }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CampaignRoundedIcon />}
            disabled={
              saving
              || (scopeType === 'common' && !capability.can_publish_common)
              || (scopeType === 'project' && (!capability.can_publish_project || !projectName))
            }
            onClick={publishBroadcast}
            sx={{ bgcolor: '#b91c1c', fontWeight: 900, '&:hover': { bgcolor: '#991b1b' } }}
          >
            중점위험요인 전파
          </Button>
          </Stack>
          </>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
        <Box sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 900 }}>전파 이력</Typography>
          <Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>
            전파 종료 시 근로자 앱에서 즉시 표시되지 않습니다.
          </Typography>
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 68 }}>구분</TableCell>
                <TableCell>내용</TableCell>
                <TableCell sx={{ minWidth: 150 }}>대상</TableCell>
                <TableCell sx={{ minWidth: 160 }}>등록자</TableCell>
                <TableCell sx={{ minWidth: 145 }}>등록일시</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((row) => {
                const active = row.status === 'active';
                return (
                  <TableRow key={row.id} hover sx={{ opacity: active ? 1 : 0.62 }}>
                    <TableCell><ScopeBadge scopeType={row.scope_type} /></TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{row.content}</TableCell>
                    <TableCell>{row.scope_type === 'common' ? '전체현장' : row.project_name}</TableCell>
                    <TableCell>{row.author_position || row.author_role} {row.author_name}</TableCell>
                    <TableCell>{formatKoreaDateTime(row.created_at)}</TableCell>
                    <TableCell align="right">
                      {active && row.can_close ? (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<StopCircleRoundedIcon />}
                          onClick={() => setCloseTarget(row)}
                        >
                          전파 종료
                        </Button>
                      ) : (
                        <Chip size="small" label={active ? '전파중' : '종료'} color={active ? 'success' : 'default'} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8, color: '#94a3b8' }}>
                    등록된 중점위험요인이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>중점위험요인 전파 종료</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 0.5 }}>
            종료하면 근로자 앱에서 이 내용이 더 이상 표시되지 않습니다.
          </Alert>
          <Typography sx={{ mt: 1.5, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '0.84rem' }}>
            {closeTarget?.content || ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseTarget(null)} disabled={saving}>취소</Button>
          <Button variant="contained" color="error" onClick={closeBroadcast} disabled={saving}>전파 종료</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
