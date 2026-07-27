import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const TABLE_NAME = 'organization_chart_nodes';

const emptyForm = {
  id: '',
  parent_id: '',
  department: '',
  position_title: '',
  person_name: '',
  contact: '',
  sort_order: 0,
};

const normalizeText = (value) => String(value || '').trim();

const formatDateTime = (value) => {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

const sortNodes = (rows) =>
  [...rows].sort((first, second) => {
    const orderDifference =
      Number(first?.sort_order || 0) -
      Number(second?.sort_order || 0);

    if (orderDifference !== 0) return orderDifference;

    const departmentDifference = normalizeText(
      first?.department,
    ).localeCompare(normalizeText(second?.department), 'ko');

    if (departmentDifference !== 0) {
      return departmentDifference;
    }

    return normalizeText(first?.person_name).localeCompare(
      normalizeText(second?.person_name),
      'ko',
    );
  });

function OrganizationCard({
  node,
  editMode,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);

  const closeMenu = () => setMenuAnchor(null);

  const runMenuAction = (action) => {
    closeMenu();
    action(node);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'relative',
        width: 164,
        minHeight: 104,
        mx: 'auto',
        overflow: 'hidden',
        borderRadius: 1.5,
        borderColor: '#94a3b8',
        bgcolor: '#ffffff',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Box
        sx={{
          pl: 1.05,
          pr: editMode ? 3.4 : 1.05,
          py: 0.52,
          bgcolor: '#e2e8f0',
          borderBottom: '1px solid #cbd5e1',
        }}
      >
        <Typography
          noWrap
          sx={{
            color: '#334155',
            fontSize: '0.66rem',
            fontWeight: 900,
          }}
          title={node.department}
        >
          {node.department || '부서 미입력'}
        </Typography>
      </Box>

      <Stack
        spacing={0.35}
        alignItems="center"
        sx={{ px: 1, py: 0.72 }}
      >
        <Chip
          size="small"
          label={node.position_title || '직책 미입력'}
          sx={{
            height: 18,
            maxWidth: '100%',
            bgcolor: '#f1f5f9',
            color: '#475569',
            fontSize: '0.59rem',
            fontWeight: 800,
            '& .MuiChip-label': {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />

        <Typography
          noWrap
          title={node.person_name}
          sx={{
            maxWidth: '100%',
            color: '#0f172a',
            fontSize: '0.84rem',
            fontWeight: 900,
          }}
        >
          {node.person_name || '이름 미입력'}
        </Typography>

        <Stack
          direction="row"
          spacing={0.45}
          alignItems="center"
          sx={{ minWidth: 0, color: '#64748b' }}
        >
          <Typography component="span" sx={{ fontSize: 10, lineHeight: 1 }}>☎</Typography>
          <Typography
            noWrap
            title={node.contact}
            sx={{
              maxWidth: 126,
              fontSize: '0.61rem',
              fontWeight: 700,
            }}
          >
            {node.contact || '연락처 미입력'}
          </Typography>
        </Stack>
      </Stack>

      {editMode && (
        <>
          <Tooltip title="조직도 메뉴">
            <IconButton
              size="small"
              aria-label={`${node.person_name || '조직원'} 메뉴`}
              aria-controls={menuAnchor ? `organization-menu-${node.id}` : undefined}
              aria-haspopup="true"
              aria-expanded={menuAnchor ? 'true' : undefined}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{
                position: 'absolute',
                top: 1,
                right: 2,
                width: 24,
                height: 24,
                color: '#475569',
              }}
            >
              <Typography
                component="span"
                sx={{
                  mt: -0.65,
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  lineHeight: 1,
                }}
              >
                ...
              </Typography>
            </IconButton>
          </Tooltip>

          <Menu
            id={`organization-menu-${node.id}`}
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={closeMenu}
            MenuListProps={{
              dense: true,
              'aria-label': `${node.person_name || '조직원'} 편집 메뉴`,
            }}
            PaperProps={{
              sx: {
                minWidth: 154,
                boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
              },
            }}
          >
            <MenuItem
              onClick={() => runMenuAction(onAddChild)}
              sx={{ fontSize: '0.75rem' }}
            >
              하위 항목 추가
            </MenuItem>
            <MenuItem
              onClick={() => runMenuAction(onAddSibling)}
              sx={{ fontSize: '0.75rem' }}
            >
              같은 단계에 추가
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => runMenuAction(onEdit)}
              sx={{ fontSize: '0.75rem' }}
            >
              수정
            </MenuItem>
            <MenuItem
              onClick={() => runMenuAction(onDelete)}
              sx={{ color: '#dc2626', fontSize: '0.75rem' }}
            >
              삭제
            </MenuItem>
          </Menu>
        </>
      )}
    </Paper>
  );
}

function TreeItem({
  node,
  childrenByParent,
  editMode,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  const children = childrenByParent.get(node.id) || [];

  return (
    <Box
      component="li"
      sx={{
        position: 'relative',
        listStyle: 'none',
        textAlign: 'center',
        px: 0.75,
        pt: 2.2,
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          width: '50%',
          height: 18,
          borderTop: '1.5px solid #94a3b8',
        },
        '&::before': {
          right: '50%',
        },
        '&::after': {
          left: '50%',
          borderLeft: '1.5px solid #94a3b8',
        },
        '&:only-child::before, &:only-child::after': {
          display: 'none',
        },
        '&:only-child': {
          pt: 0,
        },
        '&:first-of-type::before': {
          border: 0,
        },
        '&:first-of-type::after': {
          borderRadius: '5px 0 0 0',
        },
        '&:last-of-type::after': {
          border: 0,
        },
        '&:last-of-type::before': {
          borderRight: '1.5px solid #94a3b8',
          borderRadius: '0 5px 0 0',
        },
      }}
    >
      <OrganizationCard
        node={node}
        editMode={editMode}
        onAddChild={onAddChild}
        onAddSibling={onAddSibling}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {children.length > 0 && (
        <Box
          component="ul"
          sx={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            m: 0,
            p: 0,
            pt: 2.2,
            listStyle: 'none',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '50%',
              width: 0,
              height: 18,
              borderLeft: '1.5px solid #94a3b8',
            },
          }}
        >
          {children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              editMode={editMode}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function OrganizationChart({
  userRole = '',
  currentUserId = '',
}) {
  const isSuperAdmin = userRole === '최고관리자';
  const chartViewportRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, parent_id, department, position_title, person_name, contact, sort_order, is_active, created_at, updated_at',
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('조직도 조회 오류:', error);
      setNodes([]);
      setMessage({
        severity: 'error',
        text:
          error.code === '42P01'
            ? '조직도 테이블이 없습니다. 제공된 Supabase SQL을 먼저 실행해주세요.'
            : `조직도를 불러오지 못했습니다: ${error.message}`,
      });
    } else {
      setNodes(sortNodes(data || []));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadNodes();

    const handleFocus = () => loadNodes();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadNodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map();

    nodes.forEach((node) => {
      const parentKey = node.parent_id || '__root__';
      const siblings = map.get(parentKey) || [];
      siblings.push(node);
      map.set(parentKey, siblings);
    });

    map.forEach((siblings, key) => {
      map.set(key, sortNodes(siblings));
    });

    return map;
  }, [nodes]);

  const rootNodes = childrenByParent.get('__root__') || [];

  useEffect(() => {
    if (loading || rootNodes.length === 0) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      const viewport = chartViewportRef.current;
      if (!viewport) return;

      viewport.scrollLeft = Math.max(
        0,
        (viewport.scrollWidth - viewport.clientWidth) / 2,
      );
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [loading, nodes, rootNodes.length]);

  const latestUpdatedAt = useMemo(() => {
    return nodes.reduce((latest, node) => {
      const value = node.updated_at || node.created_at;
      if (!value) return latest;
      if (!latest) return value;
      return new Date(value) > new Date(latest) ? value : latest;
    }, '');
  }, [nodes]);

  const getDescendantIds = useCallback(
    (nodeId) => {
      const descendants = new Set();
      const queue = [nodeId];

      while (queue.length > 0) {
        const parentId = queue.shift();
        const children = childrenByParent.get(parentId) || [];

        children.forEach((child) => {
          if (!descendants.has(child.id)) {
            descendants.add(child.id);
            queue.push(child.id);
          }
        });
      }

      return descendants;
    },
    [childrenByParent],
  );

  const parentOptions = useMemo(() => {
    if (!form.id) return nodes;

    const excluded = getDescendantIds(form.id);
    excluded.add(form.id);

    return nodes.filter((node) => !excluded.has(node.id));
  }, [form.id, getDescendantIds, nodes]);

  const getNextSortOrder = useCallback(
    (parentId = '') => {
      const parentKey = parentId || '__root__';
      const siblings = childrenByParent.get(parentKey) || [];

      return (
        siblings.reduce(
          (highest, node) =>
            Math.max(highest, Number(node.sort_order || 0)),
          0,
        ) + 1
      );
    },
    [childrenByParent],
  );

  const openAddDialog = (parentId = '', defaults = {}) => {
    setForm({
      ...emptyForm,
      parent_id: parentId,
      department: defaults.department || '',
      position_title: defaults.position_title || '',
      sort_order: getNextSortOrder(parentId),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (node) => {
    setForm({
      id: node.id,
      parent_id: node.parent_id || '',
      department: node.department || '',
      position_title: node.position_title || '',
      person_name: node.person_name || '',
      contact: node.contact || '',
      sort_order: Number(node.sort_order || 0),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!isSuperAdmin) return;

    const department = normalizeText(form.department);
    const positionTitle = normalizeText(form.position_title);
    const personName = normalizeText(form.person_name);
    const contact = normalizeText(form.contact);

    if (!department || !positionTitle || !personName || !contact) {
      setMessage({
        severity: 'warning',
        text: '부서, 직책, 이름, 연락처를 모두 입력해주세요.',
      });
      return;
    }

    setSaving(true);

    const payload = {
      parent_id: form.parent_id || null,
      department,
      position_title: positionTitle,
      person_name: personName,
      contact,
      sort_order: Number(form.sort_order || 0),
      updated_by: currentUserId || null,
      is_active: true,
    };

    let error = null;

    if (form.id) {
      const result = await supabase
        .from(TABLE_NAME)
        .update(payload)
        .eq('id', form.id);
      error = result.error;
    } else {
      const result = await supabase.from(TABLE_NAME).insert({
        ...payload,
        created_by: currentUserId || null,
      });
      error = result.error;
    }

    if (error) {
      console.error('조직도 저장 오류:', error);
      setMessage({
        severity: 'error',
        text: `조직도를 저장하지 못했습니다: ${error.message}`,
      });
      setSaving(false);
      return;
    }

    await loadNodes();
    setDialogOpen(false);
    setForm(emptyForm);
    setSaving(false);
    setMessage({
      severity: 'success',
      text: form.id
        ? '조직도 정보를 수정했습니다.'
        : '조직도 항목을 추가했습니다.',
    });
  };

  const handleDelete = async (node) => {
    if (!isSuperAdmin) return;

    const children = childrenByParent.get(node.id) || [];

    if (children.length > 0) {
      setMessage({
        severity: 'warning',
        text: '하위 조직원이 연결되어 있습니다. 하위 항목을 먼저 이동하거나 삭제해주세요.',
      });
      return;
    }

    const confirmed = window.confirm(
      `[${node.department} / ${node.person_name}] 항목을 조직도에서 삭제하시겠습니까?`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({
        is_active: false,
        updated_by: currentUserId || null,
      })
      .eq('id', node.id);

    if (error) {
      console.error('조직도 삭제 오류:', error);
      setMessage({
        severity: 'error',
        text: `조직도 항목을 삭제하지 못했습니다: ${error.message}`,
      });
      return;
    }

    await loadNodes();
    setMessage({
      severity: 'success',
      text: '조직도 항목을 삭제했습니다.',
    });
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.35,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box sx={{ width: 26, height: 26, borderRadius: 1, bgcolor: '#ccfbf1', color: '#0f766e', display: 'grid', placeItems: 'center', fontSize: '0.72rem', fontWeight: 900 }}>조직</Box>
          <Box>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '1rem',
                fontWeight: 900,
              }}
            >
              욱림건설 조직도
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>
              같은 상위 항목에 연결된 조직원은 같은 단계에 가로로 표시합니다.
              {latestUpdatedAt
                ? ` 최종 수정 ${formatDateTime(latestUpdatedAt)}`
                : ''}
            </Typography>
          </Box>
        </Stack>

        {isSuperAdmin && (
          <Stack direction="row" spacing={0.75}>
            {editMode && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => openAddDialog('')}
              >
                최상위 항목 추가
              </Button>
            )}

            <Button
              size="small"
              variant={editMode ? 'contained' : 'outlined'}
              color={editMode ? 'success' : 'primary'}
              onClick={() => setEditMode((previous) => !previous)}
            >
              {editMode ? '수정완료' : '수정'}
            </Button>
          </Stack>
        )}
      </Box>

      <Divider />

      {message && (
        <Alert
          severity={message.severity}
          onClose={() => setMessage(null)}
          sx={{ mx: 2, mt: 1.25, py: 0.2 }}
        >
          {message.text}
        </Alert>
      )}

      <Box
        ref={chartViewportRef}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          px: 2,
          py: 2.5,
          bgcolor: '#f8fafc',
          scrollBehavior: 'smooth',
        }}
      >
        {loading ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            spacing={1}
            sx={{ minHeight: 260 }}
          >
            <CircularProgress size={28} />
            <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>
              조직도를 불러오는 중입니다.
            </Typography>
          </Stack>
        ) : rootNodes.length === 0 ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            spacing={1.2}
            sx={{ minHeight: 300 }}
          >
            <Typography sx={{ fontSize: 42, color: '#94a3b8', fontWeight: 900, lineHeight: 1 }}>조직도</Typography>
            <Typography fontWeight={900} color="#334155">
              등록된 조직도 항목이 없습니다.
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.74rem' }}>
              최고관리자가 수정 버튼을 눌러 조직도를 등록할 수 있습니다.
            </Typography>
            {isSuperAdmin && (
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setEditMode(true);
                  openAddDialog('');
                }}
              >
                첫 항목 등록
              </Button>
            )}
          </Stack>
        ) : (
          <Box
            sx={{
              width: 'max-content',
              minWidth: '100%',
              display: 'flex',
              justifyContent: 'center',
              pb: 4,
            }}
          >
            <Box
              component="ul"
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                m: 0,
                p: 0,
                listStyle: 'none',
                '& > li': {
                  pt: 0,
                },
                '& > li::before, & > li::after': {
                  display: 'none',
                },
              }}
            >
              {rootNodes.map((node) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  childrenByParent={childrenByParent}
                  editMode={editMode}
                  onAddChild={(parentNode) =>
                    openAddDialog(parentNode.id)
                  }
                  onAddSibling={(siblingNode) =>
                    openAddDialog(siblingNode.parent_id || '', {
                      department: siblingNode.department,
                      position_title: siblingNode.position_title,
                    })
                  }
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
          {form.id ? '조직도 항목 수정' : '조직도 항목 추가'}
          <IconButton
            onClick={closeDialog}
            disabled={saving}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Typography component="span" sx={{ fontSize: 22, lineHeight: 1 }}>×</Typography>
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField
              select
              size="small"
              label="상위 조직"
              value={form.parent_id}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  parent_id: event.target.value,
                }))
              }
              helperText="같은 상위 조직을 선택한 항목끼리 같은 단계에 가로로 표시됩니다. 최상위 항목은 선택하지 않습니다."
            >
              <MenuItem value="">최상위</MenuItem>
              {sortNodes(parentOptions).map((node) => (
                <MenuItem key={node.id} value={node.id}>
                  {node.department} · {node.position_title} · {node.person_name}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                fullWidth
                required
                size="small"
                label="부서"
                placeholder="예: 경영지원부"
                value={form.department}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    department: event.target.value,
                  }))
                }
              />
              <TextField
                fullWidth
                required
                size="small"
                label="직책"
                placeholder="예: 대표이사"
                value={form.position_title}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    position_title: event.target.value,
                  }))
                }
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                fullWidth
                required
                size="small"
                label="이름"
                placeholder="예: 홍길동"
                value={form.person_name}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    person_name: event.target.value,
                  }))
                }
              />
              <TextField
                fullWidth
                required
                size="small"
                label="연락처"
                placeholder="예: 010-0000-0000"
                value={form.contact}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    contact: event.target.value,
                  }))
                }
              />
            </Stack>

            <TextField
              size="small"
              type="number"
              label="표시순서"
              value={form.sort_order}
              inputProps={{ min: 0, step: 1 }}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  sort_order: event.target.value,
                }))
              }
              helperText="같은 단계에서 숫자가 작은 항목부터 왼쪽에 표시됩니다."
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={closeDialog} disabled={saving}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={15} /> : undefined}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
