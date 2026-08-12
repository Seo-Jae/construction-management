import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
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
        width: 38,
        height: 38,
        flex: '0 0 38px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: meta.background,
        color: meta.color,
        fontSize: '0.68rem',
        fontWeight: 900,
        border: `1px solid ${meta.color}33`,
      }}
    >
      {meta.label}
    </Box>
  );
}

export default function RiskBroadcastManagement({
  currentProjectName,
  onMessage,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capability, setCapability] = useState({
    role: '',
    can_publish_common: false,
    can_publish_project: false,
    available_projects: [],
  });
  const [records, setRecords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scopeType, setScopeType] = useState('project');
  const [projectName, setProjectName] = useState(currentProjectName || '');
  const [content, setContent] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);

  const availableProjects = useMemo(
    () =>
      Array.isArray(capability.available_projects)
        ? capability.available_projects
        : [],
    [capability.available_projects],
  );

  const manageableRecords = useMemo(
    () => records.filter((row) => row?.can_manage === true),
    [records],
  );

  const allManageableSelected =
    manageableRecords.length > 0 &&
    manageableRecords.every((row) => selectedIds.has(row.id));

  const someManageableSelected =
    manageableRecords.some((row) => selectedIds.has(row.id)) &&
    !allManageableSelected;

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      const { data, error } = await supabase.rpc(
        'attendance_risk_management_v52_30',
      );

      if (error) {
        onMessage?.({
          severity: 'error',
          text:
            error.message ||
            '중점위험요인을 불러오지 못했습니다.',
        });
        setLoading(false);
        return;
      }

      const nextProjects = Array.isArray(data?.available_projects)
        ? data.available_projects
        : [];
      const canPublishCommon =
        data?.can_publish_common === true;
      const canPublishProject =
        data?.can_publish_project === true;
      const nextRecords = Array.isArray(data?.records)
        ? data.records
        : [];

      setCapability({
        role: String(data?.role || ''),
        can_publish_common: canPublishCommon,
        can_publish_project: canPublishProject,
        available_projects: nextProjects,
      });
      setRecords(nextRecords);
      setSelectedIds((previous) => {
        const validIds = new Set(
          nextRecords
            .filter((row) => row?.can_manage === true)
            .map((row) => row.id),
        );
        return new Set(
          [...previous].filter((id) => validIds.has(id)),
        );
      });
      setScopeType((previous) => {
        if (previous === 'common' && canPublishCommon) {
          return 'common';
        }
        if (previous === 'project' && canPublishProject) {
          return 'project';
        }
        return canPublishCommon ? 'common' : 'project';
      });
      setProjectName((previous) => {
        if (nextProjects.includes(previous)) return previous;
        if (nextProjects.includes(currentProjectName)) {
          return currentProjectName;
        }
        return nextProjects[0] || '';
      });
      setLoading(false);
    },
    [currentProjectName, onMessage],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    setSelectedIds(new Set());
    setDeleteOpen(false);
    setEditorOpen(false);
    setCloseTarget(null);
  }, [currentProjectName]);

  const openNewBroadcast = () => {
    const nextScope =
      capability.can_publish_project
        ? 'project'
        : 'common';

    setScopeType(nextScope);
    setProjectName((previous) => {
      if (availableProjects.includes(previous)) return previous;
      if (availableProjects.includes(currentProjectName)) {
        return currentProjectName;
      }
      return availableProjects[0] || '';
    });
    setContent('');
    setEditorOpen(true);
  };

  const publishBroadcast = async () => {
    const normalizedContent = content.trim();

    if (normalizedContent.length < 5) {
      onMessage?.({
        severity: 'warning',
        text: '중점위험요인을 5자 이상 입력해주세요.',
      });
      return;
    }

    if (scopeType === 'project' && !projectName) {
      onMessage?.({
        severity: 'warning',
        text: '전파할 현장을 선택해주세요.',
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc(
      'attendance_publish_risk_v52_14_9',
      {
        p_scope_type: scopeType,
        p_project_name:
          scopeType === 'common' ? null : projectName,
        p_content: normalizedContent,
      },
    );
    setSaving(false);

    if (error) {
      onMessage?.({
        severity: 'error',
        text:
          error.message ||
          '중점위험요인을 등록하지 못했습니다.',
      });
      return;
    }

    setContent('');
    setEditorOpen(false);
    onMessage?.({
      severity: 'success',
      text: '중점위험요인을 전파했습니다.',
    });
    await loadData(true);
  };

  const toggleSelection = (id) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (event) => {
    if (!event.target.checked) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(
      new Set(manageableRecords.map((row) => row.id)),
    );
  };

  const moveSelected = async (direction) => {
    if (selectedIds.size === 0 || saving) return;

    setSaving(true);
    const { error } = await supabase.rpc(
      'attendance_move_risk_broadcasts_v52_30',
      {
        p_broadcast_ids: [...selectedIds],
        p_direction: direction,
      },
    );
    setSaving(false);

    if (error) {
      onMessage?.({
        severity: 'error',
        text:
          error.message ||
          '중점위험요인 순서를 변경하지 못했습니다.',
      });
      return;
    }

    onMessage?.({
      severity: 'success',
      text:
        direction === 'up'
          ? '선택 중점위험요인을 위로 이동했습니다.'
          : '선택 중점위험요인을 아래로 이동했습니다.',
    });
    await loadData(true);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || saving) return;

    setSaving(true);
    const { data, error } = await supabase.rpc(
      'attendance_delete_risk_broadcasts_v52_30',
      {
        p_broadcast_ids: [...selectedIds],
      },
    );
    setSaving(false);

    if (error) {
      onMessage?.({
        severity: 'error',
        text:
          error.message ||
          '선택 중점위험요인을 삭제하지 못했습니다.',
      });
      return;
    }

    const deletedCount =
      Number(data?.deleted_count) || selectedIds.size;

    setDeleteOpen(false);
    setSelectedIds(new Set());
    onMessage?.({
      severity: 'success',
      text: `${deletedCount}건의 중점위험요인을 삭제했습니다.`,
    });
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
      onMessage?.({
        severity: 'error',
        text:
          error.message ||
          '전파를 종료하지 못했습니다.',
      });
      return;
    }

    setCloseTarget(null);
    onMessage?.({
      severity: 'success',
      text: '중점위험요인 전파를 종료했습니다.',
    });
    await loadData(true);
  };

  if (loading) {
    return (
      <Paper
        variant="outlined"
        sx={{
          py: 10,
          textAlign: 'center',
          borderColor: '#cbd5e1',
        }}
      >
        <CircularProgress size={32} />
        <Typography
          sx={{
            mt: 1.5,
            color: '#64748b',
            fontSize: '0.78rem',
          }}
        >
          중점위험요인을 불러오고 있습니다.
        </Typography>
      </Paper>
    );
  }

  const canAdd =
    capability.can_publish_common ||
    capability.can_publish_project;

  return (
    <>
      <Paper
        variant="outlined"
        sx={{ borderColor: '#cbd5e1' }}
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 900 }}>
              중점위험요인 관리
            </Typography>
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.72rem',
                lineHeight: 1.6,
              }}
            >
              공지사항 관리와 동일하게 체크박스로 선택한 뒤
              추가·삭제·위·아래 버튼으로 관리합니다. 공통 전파와
              현장 전파의 기존 권한 범위는 그대로 유지됩니다.
            </Typography>
          </Box>
          <IconButton
            onClick={() => loadData()}
            aria-label="중점위험요인 새로고침"
          >
            <RefreshRoundedIcon />
          </IconButton>
        </Box>

        <Divider />

        <Paper
          variant="outlined"
          sx={{
            m: 1.5,
            mb: 0,
            px: 1,
            py: 0.55,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            borderColor: '#cbd5e1',
            bgcolor: '#ffffff',
          }}
        >
          <Tooltip title="중점위험요인 등록" arrow>
            <span>
              <IconButton
                size="small"
                aria-label="중점위험요인 등록"
                onClick={openNewBroadcast}
                disabled={!canAdd || saving}
              >
                <AddCircleOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="선택 중점위험요인 삭제" arrow>
            <span>
              <IconButton
                size="small"
                aria-label="선택 중점위험요인 삭제"
                onClick={() => setDeleteOpen(true)}
                disabled={
                  saving || selectedIds.size === 0
                }
              >
                <RemoveCircleOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.35 }}
          />

          <Tooltip title="중점위험요인 위로 이동" arrow>
            <span>
              <IconButton
                size="small"
                aria-label="중점위험요인 위로 이동"
                onClick={() => moveSelected('up')}
                disabled={
                  saving || selectedIds.size === 0
                }
              >
                <ArrowUpwardRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="중점위험요인 아래로 이동" arrow>
            <span>
              <IconButton
                size="small"
                aria-label="중점위험요인 아래로 이동"
                onClick={() => moveSelected('down')}
                disabled={
                  saving || selectedIds.size === 0
                }
              >
                <ArrowDownwardRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.35 }}
          />

          <Typography
            sx={{
              fontSize: '0.68rem',
              color: '#64748b',
              fontWeight: 700,
            }}
          >
            선택 {selectedIds.size.toLocaleString()}개
          </Typography>
        </Paper>

        {!canAdd && manageableRecords.length === 0 && (
          <Alert severity="info" sx={{ m: 1.5, mb: 0 }}>
            현재 계정에는 중점위험요인 등록·관리 권한이 없어
            전파 이력만 조회할 수 있습니다.
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  padding="checkbox"
                  sx={{ width: 46 }}
                >
                  <Checkbox
                    size="small"
                    checked={allManageableSelected}
                    indeterminate={someManageableSelected}
                    onChange={toggleAll}
                    disabled={
                      saving || manageableRecords.length === 0
                    }
                    inputProps={{
                      'aria-label': '중점위험요인 전체 선택',
                    }}
                  />
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ width: 72 }}
                >
                  순번
                </TableCell>
                <TableCell sx={{ width: 68 }}>
                  구분
                </TableCell>
                <TableCell>내용</TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  대상
                </TableCell>
                <TableCell sx={{ minWidth: 160 }}>
                  등록자
                </TableCell>
                <TableCell sx={{ minWidth: 145 }}>
                  등록일시
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ width: 120 }}
                >
                  상태
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {records.map((row, index) => {
                const active = row.status === 'active';
                const canManage = row.can_manage === true;

                return (
                  <TableRow
                    key={row.id}
                    hover
                    selected={selectedIds.has(row.id)}
                    sx={{ opacity: active ? 1 : 0.62 }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedIds.has(row.id)}
                        onChange={() =>
                          toggleSelection(row.id)
                        }
                        disabled={!canManage || saving}
                        inputProps={{
                          'aria-label': `${index + 1}번 중점위험요인 선택`,
                        }}
                      />
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: 400,
                        fontFamily: 'inherit',
                      }}
                    >
                      {Number(row.sort_order) || index + 1}
                    </TableCell>

                    <TableCell>
                      <ScopeBadge
                        scopeType={row.scope_type}
                      />
                    </TableCell>

                    <TableCell
                      sx={{
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.65,
                        minWidth: 280,
                      }}
                    >
                      {row.content}
                    </TableCell>

                    <TableCell>
                      {row.scope_type === 'common'
                        ? '전체현장'
                        : row.project_name}
                    </TableCell>

                    <TableCell>
                      {row.author_position ||
                        row.author_role}{' '}
                      {row.author_name}
                    </TableCell>

                    <TableCell>
                      {formatKoreaDateTime(row.created_at)}
                    </TableCell>

                    <TableCell align="right">
                      {active && row.can_close ? (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={
                            <StopCircleRoundedIcon />
                          }
                          onClick={() =>
                            setCloseTarget(row)
                          }
                        >
                          전파 종료
                        </Button>
                      ) : (
                        <Chip
                          size="small"
                          label={active ? '전파중' : '종료'}
                          color={
                            active
                              ? 'success'
                              : 'default'
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {records.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                    sx={{ py: 8, color: '#94a3b8' }}
                  >
                    등록된 중점위험요인이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={editorOpen}
        onClose={() => {
          if (!saving) setEditorOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          중점위험요인 등록
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.2}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: '180px minmax(220px, 1fr)',
                },
                gap: 1.2,
              }}
            >
              <TextField
                select
                size="small"
                label="전파 범위"
                value={scopeType}
                onChange={(event) =>
                  setScopeType(event.target.value)
                }
              >
                {capability.can_publish_common && (
                  <MenuItem value="common">
                    전체 공통
                  </MenuItem>
                )}
                {capability.can_publish_project && (
                  <MenuItem value="project">
                    특정 현장
                  </MenuItem>
                )}
              </TextField>

              <TextField
                select
                size="small"
                label="대상 현장"
                value={projectName}
                onChange={(event) =>
                  setProjectName(event.target.value)
                }
                disabled={
                  scopeType === 'common' ||
                  availableProjects.length <= 1
                }
                helperText={
                  scopeType === 'common'
                    ? '모든 현장 근로자에게 표시됩니다.'
                    : ''
                }
              >
                {availableProjects.map((project) => (
                  <MenuItem
                    key={project}
                    value={project}
                  >
                    {project}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={5}
              inputProps={{ maxLength: 1000 }}
              label="중점위험요인 내용"
              value={content}
              onChange={(event) =>
                setContent(event.target.value)
              }
              placeholder="오늘 작업에서 반드시 공유해야 할 위험요인과 예방조치를 입력해주세요."
              helperText={`${content.length}/1000자`}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setEditorOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress
                  size={16}
                  color="inherit"
                />
              ) : (
                <CampaignRoundedIcon />
              )
            }
            disabled={
              saving ||
              (scopeType === 'common' &&
                !capability.can_publish_common) ||
              (scopeType === 'project' &&
                (!capability.can_publish_project ||
                  !projectName))
            }
            onClick={publishBroadcast}
            sx={{
              bgcolor: '#b91c1c',
              fontWeight: 900,
              '&:hover': { bgcolor: '#991b1b' },
            }}
          >
            중점위험요인 전파
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!saving) setDeleteOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          선택 중점위험요인 삭제
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 1.2 }}>
            삭제하면 근로자 앱에서도 즉시 사라지며 복구할 수
            없습니다.
          </Alert>
          <Typography
            sx={{
              fontSize: '0.82rem',
              lineHeight: 1.7,
            }}
          >
            선택한 {selectedIds.size.toLocaleString()}건을
            삭제하시겠습니까?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={deleteSelected}
            disabled={saving}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(closeTarget)}
        onClose={() => {
          if (!saving) setCloseTarget(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          중점위험요인 전파 종료
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 0.5 }}>
            종료하면 근로자 앱에서 이 내용이 더 이상 표시되지
            않습니다.
          </Alert>
          <Typography
            sx={{
              mt: 1.5,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
              fontSize: '0.84rem',
            }}
          >
            {closeTarget?.content || ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCloseTarget(null)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={closeBroadcast}
            disabled={saving}
          >
            전파 종료
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
