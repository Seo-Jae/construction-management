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
const ROOT_KEY = '__root__';

const NODE_TYPES = {
  DEPARTMENT: 'department',
  PERSON: 'person',
};

const LAYOUT_TYPES = {
  NORMAL: 'normal',
  SIDE: 'side',
};

const emptyForm = {
  id: '',
  parent_id: '',
  node_type: NODE_TYPES.PERSON,
  layout_type: LAYOUT_TYPES.NORMAL,
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

const normalizeParentId = (value) => value || '';

const getParentKey = (value) => normalizeParentId(value) || ROOT_KEY;

const getCardDropPlacement = (event, orientation = 'horizontal') => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const placementRatio =
    orientation === 'vertical'
      ? bounds.height > 0
        ? (event.clientY - bounds.top) / bounds.height
        : 0.5
      : bounds.width > 0
        ? (event.clientX - bounds.left) / bounds.width
        : 0.5;

  if (placementRatio < 0.3) return 'before';
  if (placementRatio > 0.7) return 'after';
  return 'child';
};

const DROP_LABELS = {
  before: '앞에 배치',
  after: '뒤에 배치',
  child: '하위로 이동',
  root: '최상위로 이동',
};

function OrganizationCard({
  node,
  level,
  orientationFromParent,
  childCount,
  editMode,
  layoutMode,
  draggedNodeId,
  dropTarget,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onToggleSide,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const isDepartment = node.node_type === NODE_TYPES.DEPARTMENT;
  const isRootPerson = level === 0 && !isDepartment;
  const isDragging = draggedNodeId === node.id;
  const activeDrop =
    dropTarget?.targetId === node.id ? dropTarget.placement : '';

  const closeMenu = () => setMenuAnchor(null);

  const runMenuAction = (action) => {
    closeMenu();
    action(node);
  };

  return (
    <Paper
      variant="outlined"
      draggable={layoutMode}
      onDragStart={(event) => onDragStart(event, node)}
      onDragOver={(event) =>
        onDragOver(event, node, orientationFromParent)
      }
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onDragLeave(event, node);
        }
      }}
      onDrop={(event) =>
        onDrop(event, node, orientationFromParent)
      }
      onDragEnd={onDragEnd}
      sx={{
        position: 'relative',
        width: isRootPerson ? 196 : isDepartment ? 176 : 164,
        minHeight: isRootPerson ? 76 : isDepartment ? 58 : 64,
        mx: 'auto',
        overflow: 'hidden',
        borderRadius: isRootPerson ? 2.2 : 1,
        borderColor: activeDrop ? '#0ea5e9' : '#94a3b8',
        bgcolor: isDepartment
          ? '#f1f5f9'
          : node.layout_type === LAYOUT_TYPES.SIDE
            ? '#ecfdf5'
            : '#ffffff',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
        cursor: layoutMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
        opacity: isDragging ? 0.42 : 1,
        userSelect: layoutMode ? 'none' : 'auto',
        transition: 'border-color 120ms, box-shadow 120ms, opacity 120ms',
        ...(activeDrop
          ? {
              boxShadow: '0 0 0 3px rgba(14, 165, 233, 0.20)',
            }
          : {}),
      }}
    >
      {isDepartment ? (
        <>
          <Box
            sx={{
              pl: 1.15,
              pr: editMode ? 3.5 : 1.15,
              py: 0.72,
              bgcolor:
                node.layout_type === LAYOUT_TYPES.SIDE
                  ? '#65a30d'
                  : '#166534',
              borderBottom: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            <Typography
              noWrap
              title={node.department}
              sx={{
                color: '#ffffff',
                fontSize: '0.73rem',
                fontWeight: 900,
                letterSpacing: 0.15,
              }}
            >
              {node.department || '부서 미입력'}
            </Typography>
          </Box>
          <Typography
            sx={{
              px: 1,
              py: 0.62,
              color: '#475569',
              fontSize: '0.62rem',
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            구성원 {childCount}명
          </Typography>
        </>
      ) : isRootPerson ? (
        <>
          <Box
            sx={{
              pl: 1.3,
              pr: editMode ? 3.7 : 1.3,
              py: 0.68,
              bgcolor: '#334155',
            }}
          >
            <Typography
              noWrap
              title={node.position_title}
              sx={{
                color: '#ffffff',
                fontSize: '0.69rem',
                fontWeight: 900,
                textAlign: 'center',
              }}
            >
              {node.position_title || '직책 미입력'}
            </Typography>
          </Box>
          <Stack spacing={0.18} alignItems="center" sx={{ px: 1, py: 0.7 }}>
            <Typography
              noWrap
              title={node.person_name}
              sx={{
                maxWidth: '100%',
                color: '#0f172a',
                fontSize: '0.82rem',
                fontWeight: 900,
              }}
            >
              {node.person_name || '이름 미입력'}
            </Typography>
            <Typography
              noWrap
              title={node.contact}
              sx={{
                maxWidth: '100%',
                color: '#64748b',
                fontSize: '0.59rem',
                fontWeight: 700,
              }}
            >
              {node.contact || '연락처 미입력'}
            </Typography>
          </Stack>
        </>
      ) : (
        <Box
          sx={{
            minHeight: 64,
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          <Box
            sx={{
              flex: '0 0 4px',
              bgcolor:
                node.layout_type === LAYOUT_TYPES.SIDE
                  ? '#84cc16'
                  : '#16a34a',
            }}
          />
          <Stack
            spacing={0.18}
            justifyContent="center"
            sx={{
              minWidth: 0,
              flex: 1,
              pl: 1.05,
              pr: editMode ? 3.1 : 0.9,
              py: 0.52,
              textAlign: 'left',
            }}
          >
            <Typography
              noWrap
              title={node.position_title}
              sx={{
                color: '#64748b',
                fontSize: '0.55rem',
                fontWeight: 800,
              }}
            >
              {node.position_title || '직책 미입력'}
            </Typography>
            <Typography
              noWrap
              title={node.person_name}
              sx={{
                color: '#0f172a',
                fontSize: '0.74rem',
                fontWeight: 900,
              }}
            >
              {node.person_name || '이름 미입력'}
            </Typography>
            <Typography
              noWrap
              title={node.contact}
              sx={{
                color: '#64748b',
                fontSize: '0.54rem',
                fontWeight: 700,
              }}
            >
              {node.contact || '연락처 미입력'}
            </Typography>
          </Stack>
        </Box>
      )}

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
                color:
                  isDepartment || isRootPerson
                    ? '#ffffff'
                    : '#475569',
                bgcolor:
                  isDepartment || isRootPerson
                    ? 'rgba(15, 23, 42, 0.18)'
                    : 'transparent',
                '&:hover': {
                  bgcolor:
                    isDepartment || isRootPerson
                      ? 'rgba(15, 23, 42, 0.32)'
                      : '#e2e8f0',
                },
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
              onClick={() => runMenuAction(onAddDepartment)}
              sx={{ fontSize: '0.75rem' }}
            >
              하위 부서 추가
            </MenuItem>
            <MenuItem
              onClick={() => runMenuAction(onAddPerson)}
              sx={{ fontSize: '0.75rem' }}
            >
              하위 직원 추가
            </MenuItem>
            <MenuItem
              onClick={() => runMenuAction(onAddSibling)}
              sx={{ fontSize: '0.75rem' }}
            >
              같은 단계에 추가
            </MenuItem>
            <Divider />
            {node.parent_id && (
              <MenuItem
                onClick={() => runMenuAction(onToggleSide)}
                sx={{ fontSize: '0.75rem' }}
              >
                {node.layout_type === LAYOUT_TYPES.SIDE
                  ? '기본 위치로 배치'
                  : '측면에 배치'}
              </MenuItem>
            )}
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

      {activeDrop && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(14, 165, 233, 0.88)',
          }}
        >
          <Typography
            sx={{
              px: 0.65,
              color: '#ffffff',
              fontSize: '0.64rem',
              fontWeight: 900,
              textAlign: 'center',
            }}
          >
            {DROP_LABELS[activeDrop]}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function TreeItem({
  node,
  childrenByParent,
  level = 0,
  orientationFromParent = 'horizontal',
  editMode,
  layoutMode,
  draggedNodeId,
  dropTarget,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onToggleSide,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const children = childrenByParent.get(node.id) || [];
  const normalChildren = children.filter(
    (child) => child.layout_type !== LAYOUT_TYPES.SIDE,
  );
  const sideChildren = children.filter(
    (child) => child.layout_type === LAYOUT_TYPES.SIDE,
  );
  const isDepartment = node.node_type === NODE_TYPES.DEPARTMENT;

  const outerItemSx =
    orientationFromParent === 'vertical'
      ? {
          position: 'relative',
          listStyle: 'none',
          textAlign: 'center',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: -10,
            width: 10,
            borderTop: '1.5px solid #94a3b8',
          },
        }
      : orientationFromParent === 'side'
        ? {
            position: 'relative',
            listStyle: 'none',
            textAlign: 'center',
            px: 0.55,
          }
        : {
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
          };

  return (
    <Box
      component="li"
      sx={outerItemSx}
    >
      <OrganizationCard
        node={node}
        level={level}
        orientationFromParent={orientationFromParent}
        childCount={
          children.filter(
            (child) => child.node_type === NODE_TYPES.PERSON,
          ).length
        }
        editMode={editMode}
        layoutMode={layoutMode}
        draggedNodeId={draggedNodeId}
        dropTarget={dropTarget}
        onAddDepartment={onAddDepartment}
        onAddPerson={onAddPerson}
        onAddSibling={onAddSibling}
        onToggleSide={onToggleSide}
        onEdit={onEdit}
        onDelete={onDelete}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      />

      {sideChildren.length > 0 && (
        <Box
          component="ul"
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            width: 'max-content',
            mx: 'auto',
            mt: 1.3,
            pl: 4.5,
            transform: 'translateX(42%)',
            listStyle: 'none',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: 0,
              width: 36,
              borderTop: '1.5px solid #94a3b8',
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              top: -11,
              left: 0,
              height: 'calc(50% + 11px)',
              borderLeft: '1.5px solid #94a3b8',
            },
          }}
        >
          {sideChildren.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              level={level + 1}
              orientationFromParent="side"
              editMode={editMode}
              layoutMode={layoutMode}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              onAddDepartment={onAddDepartment}
              onAddPerson={onAddPerson}
              onAddSibling={onAddSibling}
              onToggleSide={onToggleSide}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </Box>
      )}

      {normalChildren.length > 0 && (
        <Box
          component="ul"
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: isDepartment ? 'column' : 'row',
            justifyContent: 'center',
            alignItems: isDepartment ? 'center' : 'flex-start',
            gap: isDepartment ? 0.8 : 0,
            width: isDepartment ? 'max-content' : 'auto',
            minWidth: isDepartment ? 176 : 0,
            m: 0,
            mx: isDepartment ? 'auto' : 0,
            p: 0,
            pl: isDepartment ? 2.2 : 0,
            pt: isDepartment ? 1.4 : 2.2,
            listStyle: 'none',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: isDepartment ? 8 : '50%',
              width: 0,
              height: isDepartment ? 'calc(100% - 32px)' : 18,
              borderLeft: '1.5px solid #94a3b8',
            },
          }}
        >
          {normalChildren.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              level={level + 1}
              orientationFromParent={
                isDepartment ? 'vertical' : 'horizontal'
              }
              editMode={editMode}
              layoutMode={layoutMode}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              onAddDepartment={onAddDepartment}
              onAddPerson={onAddPerson}
              onAddSibling={onAddSibling}
              onToggleSide={onToggleSide}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
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
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState('');
  const [dropTarget, setDropTarget] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, parent_id, node_type, layout_type, department, position_title, person_name, contact, sort_order, is_active, created_at, updated_at',
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
            : error.code === '42703'
              ? 'v51.3 조직도 SQL을 먼저 실행해주세요. 부서·직원 구분 열이 아직 없습니다.'
            : `조직도를 불러오지 못했습니다: ${error.message}`,
      });
    } else {
      setNodes(
        sortNodes(
          (data || []).map((node) => ({
            ...node,
            node_type: node.node_type || NODE_TYPES.PERSON,
            layout_type: node.layout_type || LAYOUT_TYPES.NORMAL,
          })),
        ),
      );
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
      const parentKey = getParentKey(node.parent_id);
      const siblings = map.get(parentKey) || [];
      siblings.push(node);
      map.set(parentKey, siblings);
    });

    map.forEach((siblings, key) => {
      map.set(key, sortNodes(siblings));
    });

    return map;
  }, [nodes]);

  const rootNodes = childrenByParent.get(ROOT_KEY) || [];

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
      const parentKey = getParentKey(parentId);
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

  const openAddDialog = (
    parentId = '',
    nodeType = NODE_TYPES.PERSON,
    defaults = {},
  ) => {
    const parentNode = nodes.find((node) => node.id === parentId);
    const inheritedDepartment =
      nodeType === NODE_TYPES.PERSON &&
      parentNode?.node_type === NODE_TYPES.DEPARTMENT
        ? parentNode.department
        : '';

    setForm({
      ...emptyForm,
      parent_id: parentId,
      node_type: nodeType,
      layout_type: defaults.layout_type || LAYOUT_TYPES.NORMAL,
      department: defaults.department || inheritedDepartment,
      position_title: defaults.position_title || '',
      sort_order: getNextSortOrder(parentId),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (node) => {
    setForm({
      id: node.id,
      parent_id: node.parent_id || '',
      node_type: node.node_type || NODE_TYPES.PERSON,
      layout_type: node.layout_type || LAYOUT_TYPES.NORMAL,
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
    const isDepartment = form.node_type === NODE_TYPES.DEPARTMENT;

    if (isDepartment && !department) {
      setMessage({
        severity: 'warning',
        text: '부서명을 입력해주세요.',
      });
      return;
    }

    if (!isDepartment && (!positionTitle || !personName || !contact)) {
      setMessage({
        severity: 'warning',
        text: '직책, 이름, 연락처를 모두 입력해주세요.',
      });
      return;
    }

    setSaving(true);

    const payload = {
      parent_id: form.parent_id || null,
      node_type: form.node_type,
      layout_type:
        form.parent_id && form.layout_type === LAYOUT_TYPES.SIDE
          ? LAYOUT_TYPES.SIDE
          : LAYOUT_TYPES.NORMAL,
      department: isDepartment ? department : department || '',
      position_title: isDepartment ? '' : positionTitle,
      person_name: isDepartment ? '' : personName,
      contact: isDepartment ? '' : contact,
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

  const handleToggleSide = async (node) => {
    if (!isSuperAdmin || savingLayout) return;

    const nextLayout =
      node.layout_type === LAYOUT_TYPES.SIDE
        ? LAYOUT_TYPES.NORMAL
        : LAYOUT_TYPES.SIDE;

    setSavingLayout(true);

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({
        layout_type: nextLayout,
        updated_by: currentUserId || null,
      })
      .eq('id', node.id);

    if (error) {
      console.error('조직도 측면 배치 오류:', error);
      setMessage({
        severity: 'error',
        text: `배치 방식을 저장하지 못했습니다: ${error.message}`,
      });
      setSavingLayout(false);
      return;
    }

    await loadNodes();
    setSavingLayout(false);
    setMessage({
      severity: 'success',
      text:
        nextLayout === LAYOUT_TYPES.SIDE
          ? '선택한 항목을 측면 분기로 배치했습니다.'
          : '선택한 항목을 기본 위치로 되돌렸습니다.',
    });
  };

  const resetDragState = useCallback(() => {
    setDraggedNodeId('');
    setDropTarget(null);
  }, []);

  const persistNodeMove = useCallback(
    async ({
      sourceId,
      destinationParentId = '',
      destinationIndex = 0,
      destinationLayout = LAYOUT_TYPES.NORMAL,
      successText,
    }) => {
      if (!isSuperAdmin || savingLayout) return;

      const source = nodes.find((node) => node.id === sourceId);
      if (!source) return;

      const nextParentId = normalizeParentId(destinationParentId);
      const descendants = getDescendantIds(sourceId);

      if (
        nextParentId === sourceId ||
        (nextParentId && descendants.has(nextParentId))
      ) {
        setMessage({
          severity: 'warning',
          text: '자기 자신 또는 자신의 하위 항목 아래로는 이동할 수 없습니다.',
        });
        return;
      }

      const previousParentId = normalizeParentId(source.parent_id);
      const destinationParent = nodes.find(
        (node) => node.id === nextParentId,
      );
      const inheritedDepartment =
        source.node_type === NODE_TYPES.PERSON &&
        destinationParent?.node_type === NODE_TYPES.DEPARTMENT
          ? destinationParent.department
          : source.department;

      const destinationSiblings = sortNodes(
        nodes.filter(
          (node) =>
            node.id !== sourceId &&
            normalizeParentId(node.parent_id) === nextParentId &&
            node.layout_type === destinationLayout,
        ),
      );

      const safeIndex = Math.max(
        0,
        Math.min(Number(destinationIndex || 0), destinationSiblings.length),
      );

      destinationSiblings.splice(safeIndex, 0, {
        ...source,
        parent_id: nextParentId || null,
        layout_type: destinationLayout,
        department: inheritedDepartment,
      });

      const patchMap = new Map();

      const addOrderedPatches = (orderedNodes, parentId, layoutType) => {
        orderedNodes.forEach((orderedNode, index) => {
          patchMap.set(orderedNode.id, {
            id: orderedNode.id,
            parent_id: parentId || null,
            sort_order: index + 1,
            layout_type: layoutType,
            department: orderedNode.department || '',
          });
        });
      };

      if (
        previousParentId !== nextParentId ||
        source.layout_type !== destinationLayout
      ) {
        const previousSiblings = sortNodes(
          nodes.filter(
            (node) =>
              node.id !== sourceId &&
              normalizeParentId(node.parent_id) === previousParentId &&
              node.layout_type === source.layout_type,
          ),
        );

        addOrderedPatches(
          previousSiblings,
          previousParentId,
          source.layout_type,
        );
      }

      addOrderedPatches(
        destinationSiblings,
        nextParentId,
        destinationLayout,
      );

      const patches = [...patchMap.values()].filter((patch) => {
        const original = nodes.find((node) => node.id === patch.id);
        if (!original) return false;

        return (
          normalizeParentId(original.parent_id) !==
            normalizeParentId(patch.parent_id) ||
          Number(original.sort_order || 0) !== patch.sort_order ||
          original.layout_type !== patch.layout_type ||
          normalizeText(original.department) !==
            normalizeText(patch.department)
        );
      });

      if (patches.length === 0) {
        setMessage({
          severity: 'info',
          text: '현재 위치와 동일합니다.',
        });
        return;
      }

      const patchById = new Map(
        patches.map((patch) => [patch.id, patch]),
      );
      const optimisticUpdatedAt = new Date().toISOString();

      setNodes((previous) =>
        sortNodes(
          previous.map((node) => {
            const patch = patchById.get(node.id);
            return patch
              ? {
                  ...node,
                  ...patch,
                  updated_at: optimisticUpdatedAt,
                }
              : node;
          }),
        ),
      );
      setSavingLayout(true);

      let saveError = null;

      for (const patch of patches) {
        const { error } = await supabase
          .from(TABLE_NAME)
          .update({
            parent_id: patch.parent_id,
            sort_order: patch.sort_order,
            layout_type: patch.layout_type,
            department: patch.department,
            updated_by: currentUserId || null,
          })
          .eq('id', patch.id);

        if (error) {
          saveError = error;
          break;
        }
      }

      await loadNodes();
      setSavingLayout(false);

      if (saveError) {
        console.error('조직도 드래그 배치 저장 오류:', saveError);
        setMessage({
          severity: 'error',
          text: `배치 저장 중 오류가 발생했습니다. 현재 DB 상태를 다시 불러왔습니다: ${saveError.message}`,
        });
        return;
      }

      setMessage({
        severity: 'success',
        text: successText || '조직도 배치를 저장했습니다.',
      });
    },
    [
      currentUserId,
      getDescendantIds,
      isSuperAdmin,
      loadNodes,
      nodes,
      savingLayout,
    ],
  );

  const getDraggedId = useCallback(
    (event) =>
      draggedNodeId ||
      event.dataTransfer?.getData('text/plain') ||
      '',
    [draggedNodeId],
  );

  const handleDragStart = useCallback(
    (event, node) => {
      if (!layoutMode || savingLayout) {
        event.preventDefault();
        return;
      }

      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.id);
      setDraggedNodeId(node.id);
      setDropTarget(null);
    },
    [layoutMode, savingLayout],
  );

  const handleCardDragOver = useCallback(
    (event, targetNode, orientationFromParent) => {
      if (!layoutMode || savingLayout) return;

      event.stopPropagation();
      const sourceId = getDraggedId(event);

      if (
        !sourceId ||
        sourceId === targetNode.id ||
        getDescendantIds(sourceId).has(targetNode.id)
      ) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const placement = getCardDropPlacement(
        event,
        orientationFromParent,
      );

      setDropTarget((previous) =>
        previous?.targetId === targetNode.id &&
        previous?.placement === placement
          ? previous
          : { targetId: targetNode.id, placement },
      );
    },
    [
      getDescendantIds,
      getDraggedId,
      layoutMode,
      savingLayout,
    ],
  );

  const handleCardDragLeave = useCallback((event, targetNode) => {
    event.stopPropagation();
    setDropTarget((previous) =>
      previous?.targetId === targetNode.id ? null : previous,
    );
  }, []);

  const handleCardDrop = useCallback(
    async (event, targetNode, orientationFromParent) => {
      if (!layoutMode || savingLayout) return;

      event.preventDefault();
      event.stopPropagation();

      const sourceId = getDraggedId(event);
      const placement = getCardDropPlacement(
        event,
        orientationFromParent,
      );
      setDropTarget(null);

      if (
        !sourceId ||
        sourceId === targetNode.id ||
        getDescendantIds(sourceId).has(targetNode.id)
      ) {
        setMessage({
          severity: 'warning',
          text: '자기 자신이나 자신의 하위 항목에는 놓을 수 없습니다.',
        });
        resetDragState();
        return;
      }

      if (placement === 'child') {
        const targetChildren = (
          childrenByParent.get(targetNode.id) || []
        ).filter(
          (node) =>
            node.id !== sourceId &&
            node.layout_type === LAYOUT_TYPES.NORMAL,
        );

        await persistNodeMove({
          sourceId,
          destinationParentId: targetNode.id,
          destinationIndex: targetChildren.length,
          destinationLayout: LAYOUT_TYPES.NORMAL,
          successText: `[${targetNode.node_type === NODE_TYPES.DEPARTMENT ? targetNode.department : targetNode.person_name}] 하위로 이동했습니다.`,
        });
        resetDragState();
        return;
      }

      const destinationParentId = normalizeParentId(
        targetNode.parent_id,
      );
      const destinationLayout =
        targetNode.layout_type || LAYOUT_TYPES.NORMAL;
      const targetSiblings = sortNodes(
        (childrenByParent.get(getParentKey(destinationParentId)) || []).filter(
          (node) =>
            node.id !== sourceId &&
            node.layout_type === destinationLayout,
        ),
      );
      const targetIndex = targetSiblings.findIndex(
        (node) => node.id === targetNode.id,
      );

      await persistNodeMove({
        sourceId,
        destinationParentId,
        destinationIndex:
          targetIndex + (placement === 'after' ? 1 : 0),
        destinationLayout,
        successText:
          placement === 'before'
            ? '선택한 항목의 앞으로 이동했습니다.'
            : '선택한 항목의 뒤로 이동했습니다.',
      });
      resetDragState();
    },
    [
      childrenByParent,
      getDescendantIds,
      getDraggedId,
      layoutMode,
      persistNodeMove,
      resetDragState,
      savingLayout,
    ],
  );

  const handleRootDragOver = useCallback(
    (event) => {
      if (!layoutMode || savingLayout || !getDraggedId(event)) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setDropTarget({ targetId: ROOT_KEY, placement: 'root' });
    },
    [getDraggedId, layoutMode, savingLayout],
  );

  const handleRootDrop = useCallback(
    async (event) => {
      if (!layoutMode || savingLayout) return;

      event.preventDefault();
      event.stopPropagation();
      const sourceId = getDraggedId(event);
      setDropTarget(null);

      if (!sourceId) return;

      const rootSiblings = (childrenByParent.get(ROOT_KEY) || []).filter(
        (node) =>
          node.id !== sourceId &&
          node.layout_type === LAYOUT_TYPES.NORMAL,
      );

      await persistNodeMove({
        sourceId,
        destinationParentId: '',
        destinationIndex: rootSiblings.length,
        destinationLayout: LAYOUT_TYPES.NORMAL,
        successText: '선택한 항목을 최상위로 이동했습니다.',
      });
      resetDragState();
    },
    [
      childrenByParent,
      getDraggedId,
      layoutMode,
      persistNodeMove,
      resetDragState,
      savingLayout,
    ],
  );

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

  const toggleEditMode = () => {
    if (savingLayout) return;
    setEditMode((previous) => {
      const next = !previous;
      if (next) setLayoutMode(false);
      return next;
    });
    resetDragState();
  };

  const toggleLayoutMode = () => {
    if (savingLayout) return;
    setLayoutMode((previous) => {
      const next = !previous;
      if (next) setEditMode(false);
      return next;
    });
    resetDragState();
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
              {layoutMode
                ? '카드 가장자리는 같은 단계 순서 변경, 중앙은 하위 이동입니다.'
                : '부서는 대분류로, 소속 직원은 직책·성명·연락처 카드로 표시합니다.'}
              {latestUpdatedAt
                ? ` 최종 수정 ${formatDateTime(latestUpdatedAt)}`
                : ''}
            </Typography>
          </Box>
        </Stack>

        {isSuperAdmin && (
          <Stack direction="row" spacing={0.75}>
            {editMode && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    openAddDialog('', NODE_TYPES.DEPARTMENT)
                  }
                >
                  최상위 부서 추가
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => openAddDialog('', NODE_TYPES.PERSON)}
                >
                  최상위 직원 추가
                </Button>
              </>
            )}

            <Button
              size="small"
              variant={layoutMode ? 'contained' : 'outlined'}
              color={layoutMode ? 'success' : 'primary'}
              onClick={toggleLayoutMode}
              disabled={savingLayout}
              startIcon={
                savingLayout ? <CircularProgress size={14} /> : undefined
              }
            >
              {layoutMode ? '배치완료' : '배치 편집'}
            </Button>
            <Button
              size="small"
              variant={editMode ? 'contained' : 'outlined'}
              color={editMode ? 'success' : 'primary'}
              onClick={toggleEditMode}
              disabled={savingLayout}
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
        {layoutMode && !loading && rootNodes.length > 0 && (
          <Paper
            variant="outlined"
            onDragOver={handleRootDragOver}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setDropTarget((previous) =>
                  previous?.targetId === ROOT_KEY ? null : previous,
                );
              }
            }}
            onDrop={handleRootDrop}
            sx={{
              position: 'sticky',
              left: 0,
              zIndex: 4,
              width: 'calc(100% - 32px)',
              maxWidth: 520,
              minWidth: 260,
              mx: 'auto',
              mb: 2,
              px: 1.5,
              py: 0.9,
              textAlign: 'center',
              color:
                dropTarget?.targetId === ROOT_KEY
                  ? '#0369a1'
                  : '#64748b',
              bgcolor:
                dropTarget?.targetId === ROOT_KEY
                  ? '#e0f2fe'
                  : '#ffffff',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor:
                dropTarget?.targetId === ROOT_KEY
                  ? '#0ea5e9'
                  : '#94a3b8',
              fontSize: '0.7rem',
              fontWeight: 900,
            }}
          >
            박스를 최상위로 옮기려면 여기에 놓으세요
          </Paper>
        )}

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
                  openAddDialog('', NODE_TYPES.PERSON);
                }}
              >
                첫 최상위 직원 등록
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
                  level={0}
                  orientationFromParent="horizontal"
                  editMode={editMode}
                  layoutMode={layoutMode}
                  draggedNodeId={draggedNodeId}
                  dropTarget={dropTarget}
                  onAddDepartment={(parentNode) =>
                    openAddDialog(
                      parentNode.id,
                      NODE_TYPES.DEPARTMENT,
                    )
                  }
                  onAddPerson={(parentNode) =>
                    openAddDialog(parentNode.id, NODE_TYPES.PERSON)
                  }
                  onAddSibling={(siblingNode) =>
                    openAddDialog(
                      siblingNode.parent_id || '',
                      siblingNode.node_type || NODE_TYPES.PERSON,
                      {
                        department:
                          siblingNode.node_type === NODE_TYPES.DEPARTMENT
                            ? ''
                            : siblingNode.department,
                        position_title:
                          siblingNode.node_type === NODE_TYPES.PERSON
                            ? siblingNode.position_title
                            : '',
                        layout_type:
                          siblingNode.layout_type ||
                          LAYOUT_TYPES.NORMAL,
                      },
                    )
                  }
                  onToggleSide={handleToggleSide}
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                  onDragStart={handleDragStart}
                  onDragOver={handleCardDragOver}
                  onDragLeave={handleCardDragLeave}
                  onDrop={handleCardDrop}
                  onDragEnd={resetDragState}
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                fullWidth
                select
                size="small"
                label="항목 구분"
                value={form.node_type}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    node_type: event.target.value,
                  }))
                }
              >
                <MenuItem value={NODE_TYPES.DEPARTMENT}>
                  부서
                </MenuItem>
                <MenuItem value={NODE_TYPES.PERSON}>직원</MenuItem>
              </TextField>

              <TextField
                fullWidth
                select
                size="small"
                label="배치 방식"
                value={
                  form.parent_id
                    ? form.layout_type
                    : LAYOUT_TYPES.NORMAL
                }
                disabled={!form.parent_id}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    layout_type: event.target.value,
                  }))
                }
                helperText={
                  form.parent_id
                    ? '측면 배치는 연결선 옆으로 분기됩니다.'
                    : '최상위 항목은 기본 배치로 저장됩니다.'
                }
              >
                <MenuItem value={LAYOUT_TYPES.NORMAL}>기본 배치</MenuItem>
                <MenuItem value={LAYOUT_TYPES.SIDE}>측면 배치</MenuItem>
              </TextField>
            </Stack>

            <TextField
              select
              size="small"
              label="상위 조직"
              value={form.parent_id}
              onChange={(event) => {
                const nextParentId = event.target.value;
                const nextParent = nodes.find(
                  (node) => node.id === nextParentId,
                );

                setForm((previous) => ({
                  ...previous,
                  parent_id: nextParentId,
                  layout_type: nextParentId
                    ? previous.layout_type
                    : LAYOUT_TYPES.NORMAL,
                  department:
                    previous.node_type === NODE_TYPES.PERSON &&
                    nextParent?.node_type === NODE_TYPES.DEPARTMENT
                      ? nextParent.department
                      : previous.department,
                }));
              }}
              helperText="직원을 부서 아래에 두면 부서 박스 아래로 세로 정렬됩니다."
            >
              <MenuItem value="">최상위</MenuItem>
              {sortNodes(parentOptions).map((node) => (
                <MenuItem key={node.id} value={node.id}>
                  {node.node_type === NODE_TYPES.DEPARTMENT
                    ? `[부서] ${node.department}`
                    : `[직원] ${node.position_title} · ${node.person_name}`}
                </MenuItem>
              ))}
            </TextField>

            {form.node_type === NODE_TYPES.DEPARTMENT ? (
              <TextField
                fullWidth
                required
                size="small"
                label="부서명"
                placeholder="예: 경영지원부"
                value={form.department}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    department: event.target.value,
                  }))
                }
                helperText="부서명이 대분류 제목으로 표시됩니다."
              />
            ) : (
              <>
                <TextField
                  fullWidth
                  required
                  size="small"
                  label="직책"
                  placeholder="예: 부장"
                  value={form.position_title}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      position_title: event.target.value,
                    }))
                  }
                />
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.25}
                >
                  <TextField
                    fullWidth
                    required
                    size="small"
                    label="성명"
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
              </>
            )}

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
              helperText="같은 단계에서는 숫자가 작은 항목부터 먼저 표시됩니다. 배치 편집에서는 드래그로 자동 변경됩니다."
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
