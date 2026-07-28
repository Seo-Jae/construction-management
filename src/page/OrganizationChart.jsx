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

const BASE_RENDER_SCALE = 0.7;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;
const SNAP_GRID = {
  x: 24,
  y: 24,
};

const LAYOUT = {
  padding: 48,
  departmentWidth: 190,
  departmentHeaderHeight: 58,
  personWidth: 190,
  personHeight: 82,
  memberHeight: 64,
  memberGap: 8,
  memberPadding: 10,
  horizontalGap: 72,
  verticalGap: 48,
  minCanvasWidth: 1400,
  minCanvasHeight: 820,
};

const emptyForm = {
  id: '',
  parent_id: '',
  node_type: NODE_TYPES.PERSON,
  department: '',
  position_title: '',
  person_name: '',
  contact: '',
  sort_order: 0,
};

const normalizeText = (value) => String(value || '').trim();
const normalizeParentId = (value) => value || '';
const getParentKey = (value) => normalizeParentId(value) || ROOT_KEY;
const isFiniteCoordinate = (value) =>
  value !== null && value !== '' && Number.isFinite(Number(value));
const snapCoordinate = (value, step) =>
  Math.max(
    0,
    Math.round(Number(value || 0) / step) * step,
  );
const snapPosition = (position) => ({
  x: snapCoordinate(position?.x, SNAP_GRID.x),
  y: snapCoordinate(position?.y, SNAP_GRID.y),
});

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

    if (departmentDifference !== 0) return departmentDifference;

    return normalizeText(first?.person_name).localeCompare(
      normalizeText(second?.person_name),
      'ko',
    );
  });

const buildChildrenMap = (nodes) => {
  const map = new Map();

  nodes.forEach((node) => {
    const key = getParentKey(node.parent_id);
    const children = map.get(key) || [];
    children.push(node);
    map.set(key, children);
  });

  map.forEach((children, key) => {
    map.set(key, sortNodes(children));
  });

  return map;
};

const buildNodeMap = (nodes) =>
  new Map(nodes.map((node) => [node.id, node]));

const getStructuralNodeIds = (nodes, childrenByParent, nodeById) => {
  const result = new Set();

  nodes.forEach((node) => {
    const children = childrenByParent.get(node.id) || [];
    const hasDepartmentChild = children.some(
      (child) => child.node_type === NODE_TYPES.DEPARTMENT,
    );
    const parent = nodeById.get(node.parent_id);

    if (
      node.node_type === NODE_TYPES.DEPARTMENT ||
      !node.parent_id ||
      hasDepartmentChild ||
      node.layout_type === LAYOUT_TYPES.SIDE ||
      (node.node_type === NODE_TYPES.PERSON &&
        parent?.node_type === NODE_TYPES.PERSON)
    ) {
      result.add(node.id);
    }
  });

  return result;
};

const getEmbeddedMembers = (
  departmentId,
  childrenByParent,
  structuralNodeIds,
) =>
  (childrenByParent.get(departmentId) || []).filter(
    (node) =>
      node.node_type === NODE_TYPES.PERSON &&
      !structuralNodeIds.has(node.id),
  );

const getLayoutItemSize = (
  node,
  childrenByParent,
  structuralNodeIds,
) => {
  if (node.node_type !== NODE_TYPES.DEPARTMENT) {
    return {
      width: LAYOUT.personWidth,
      height: LAYOUT.personHeight,
    };
  }

  const members = getEmbeddedMembers(
    node.id,
    childrenByParent,
    structuralNodeIds,
  );
  const membersHeight =
    members.length > 0
      ? LAYOUT.memberPadding * 2 +
        members.length * LAYOUT.memberHeight +
        Math.max(0, members.length - 1) * LAYOUT.memberGap
      : 0;

  return {
    width: LAYOUT.departmentWidth,
    height: LAYOUT.departmentHeaderHeight + membersHeight,
  };
};

const findStructuralParentId = (
  node,
  structuralNodeIds,
  nodeById,
) => {
  let parentId = normalizeParentId(node.parent_id);
  const visited = new Set();

  while (parentId && !visited.has(parentId)) {
    if (structuralNodeIds.has(parentId)) return parentId;
    visited.add(parentId);
    parentId = normalizeParentId(nodeById.get(parentId)?.parent_id);
  }

  return '';
};

const buildStructuralGraph = (
  nodes,
  structuralNodeIds,
  nodeById,
) => {
  const children = new Map();
  const parentById = new Map();

  nodes
    .filter((node) => structuralNodeIds.has(node.id))
    .forEach((node) => {
      const parentId = findStructuralParentId(
        node,
        structuralNodeIds,
        nodeById,
      );
      parentById.set(node.id, parentId);
      const key = parentId || ROOT_KEY;
      const siblings = children.get(key) || [];
      siblings.push(node);
      children.set(key, siblings);
    });

  children.forEach((siblings, key) => {
    children.set(key, sortNodes(siblings));
  });

  return { children, parentById };
};

const createAutoLayout = ({
  nodes,
  structuralNodeIds,
  structuralChildren,
  childrenByParent,
}) => {
  const structuralNodes = nodes.filter((node) =>
    structuralNodeIds.has(node.id),
  );
  const sizeById = new Map(
    structuralNodes.map((node) => [
      node.id,
      getLayoutItemSize(
        node,
        childrenByParent,
        structuralNodeIds,
      ),
    ]),
  );
  const subtreeWidthById = new Map();
  const calculating = new Set();

  const calculateSubtreeWidth = (nodeId) => {
    if (subtreeWidthById.has(nodeId)) {
      return subtreeWidthById.get(nodeId);
    }

    const ownWidth = sizeById.get(nodeId)?.width || LAYOUT.personWidth;
    if (calculating.has(nodeId)) return ownWidth;

    calculating.add(nodeId);
    const children = structuralChildren.get(nodeId) || [];
    const childrenWidth = children.reduce(
      (total, child, index) =>
        total +
        calculateSubtreeWidth(child.id) +
        (index > 0 ? LAYOUT.horizontalGap : 0),
      0,
    );
    calculating.delete(nodeId);

    const result = Math.max(ownWidth, childrenWidth);
    subtreeWidthById.set(nodeId, result);
    return result;
  };

  const roots = structuralChildren.get(ROOT_KEY) || structuralNodes;
  roots.forEach((root) => calculateSubtreeWidth(root.id));

  const depthById = new Map();
  const queue = roots.map((node) => ({ node, depth: 0 }));
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.node.id)) continue;
    visited.add(current.node.id);
    depthById.set(current.node.id, current.depth);

    (structuralChildren.get(current.node.id) || []).forEach((child) => {
      queue.push({ node: child, depth: current.depth + 1 });
    });
  }

  structuralNodes.forEach((node) => {
    if (!depthById.has(node.id)) depthById.set(node.id, 0);
  });

  const maximumDepth = Math.max(0, ...depthById.values());
  const heightByDepth = Array.from(
    { length: maximumDepth + 1 },
    () => LAYOUT.personHeight,
  );

  structuralNodes.forEach((node) => {
    const depth = depthById.get(node.id) || 0;
    heightByDepth[depth] = Math.max(
      heightByDepth[depth],
      sizeById.get(node.id)?.height || LAYOUT.personHeight,
    );
  });

  const yByDepth = [];
  let nextY = LAYOUT.padding;

  heightByDepth.forEach((height, depth) => {
    yByDepth[depth] = nextY;
    nextY += height + LAYOUT.verticalGap;
  });

  const positions = {};
  const placeSubtree = (node, left, ancestry = new Set()) => {
    if (ancestry.has(node.id)) return;

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(node.id);
    const subtreeWidth = calculateSubtreeWidth(node.id);
    const ownSize = sizeById.get(node.id) || {
      width: LAYOUT.personWidth,
      height: LAYOUT.personHeight,
    };
    const depth = depthById.get(node.id) || 0;

    positions[node.id] = snapPosition({
      x: Math.round(left + (subtreeWidth - ownSize.width) / 2),
      y: Math.round(yByDepth[depth] || LAYOUT.padding),
    });

    const children = structuralChildren.get(node.id) || [];
    const childrenTotalWidth = children.reduce(
      (total, child, index) =>
        total +
        calculateSubtreeWidth(child.id) +
        (index > 0 ? LAYOUT.horizontalGap : 0),
      0,
    );
    let childLeft = left + Math.max(0, (subtreeWidth - childrenTotalWidth) / 2);

    children.forEach((child) => {
      placeSubtree(child, childLeft, nextAncestry);
      childLeft +=
        calculateSubtreeWidth(child.id) + LAYOUT.horizontalGap;
    });
  };

  const rootsTotalWidth = roots.reduce(
    (total, root, index) =>
      total +
      calculateSubtreeWidth(root.id) +
      (index > 0 ? LAYOUT.horizontalGap : 0),
    0,
  );
  let rootLeft = LAYOUT.padding;

  roots.forEach((root) => {
    placeSubtree(root, rootLeft);
    rootLeft += calculateSubtreeWidth(root.id) + LAYOUT.horizontalGap;
  });

  structuralNodes
    .filter((node) => !positions[node.id])
    .forEach((node, index) => {
      positions[node.id] = snapPosition({
        x:
          LAYOUT.padding +
          (rootsTotalWidth > 0 ? rootsTotalWidth + LAYOUT.horizontalGap : 0) +
          index * (LAYOUT.personWidth + LAYOUT.horizontalGap),
        y: LAYOUT.padding,
      });
    });

  return positions;
};

const createConnectorPath = (parentRect, childRect) => {
  const parentCenterX = parentRect.x + parentRect.width / 2;
  const parentCenterY = parentRect.y + parentRect.height / 2;
  const childCenterX = childRect.x + childRect.width / 2;
  const childCenterY = childRect.y + childRect.height / 2;

  if (childRect.y >= parentRect.y + parentRect.height + 16) {
    const startY = parentRect.y + parentRect.height;
    const endY = childRect.y;
    const middleY = startY + (endY - startY) / 2;
    return `M ${parentCenterX} ${startY} V ${middleY} H ${childCenterX} V ${endY}`;
  }

  if (parentRect.y >= childRect.y + childRect.height + 16) {
    const startY = parentRect.y;
    const endY = childRect.y + childRect.height;
    const middleY = endY + (startY - endY) / 2;
    return `M ${parentCenterX} ${startY} V ${middleY} H ${childCenterX} V ${endY}`;
  }

  if (childCenterX >= parentCenterX) {
    const startX = parentRect.x + parentRect.width;
    const endX = childRect.x;
    const middleX = startX + (endX - startX) / 2;
    return `M ${startX} ${parentCenterY} H ${middleX} V ${childCenterY} H ${endX}`;
  }

  const startX = parentRect.x;
  const endX = childRect.x + childRect.width;
  const middleX = endX + (startX - endX) / 2;
  return `M ${startX} ${parentCenterY} H ${middleX} V ${childCenterY} H ${endX}`;
};

function NodeMenu({
  node,
  light = false,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  const run = (action) => {
    close();
    action(node);
  };

  return (
    <>
      <Tooltip title="조직도 메뉴">
        <IconButton
          size="small"
          aria-label="조직도 메뉴"
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(event.currentTarget);
          }}
          sx={{
            position: 'absolute',
            top: 2,
            right: 3,
            zIndex: 4,
            width: 24,
            height: 24,
            color: light ? '#ffffff' : '#475569',
            bgcolor: light ? 'rgba(15,23,42,0.18)' : 'transparent',
            '&:hover': {
              bgcolor: light ? 'rgba(15,23,42,0.32)' : '#e2e8f0',
            },
          }}
        >
          <Typography
            component="span"
            sx={{ mt: -0.7, fontSize: 18, fontWeight: 900, lineHeight: 1 }}
          >
            ...
          </Typography>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        MenuListProps={{ dense: true }}
        PaperProps={{
          sx: {
            minWidth: 158,
            boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
          },
        }}
      >
        <MenuItem onClick={() => run(onAddDepartment)} sx={{ fontSize: '0.75rem' }}>
          하위 부서 추가
        </MenuItem>
        <MenuItem onClick={() => run(onAddPerson)} sx={{ fontSize: '0.75rem' }}>
          하위 직원 추가
        </MenuItem>
        <MenuItem onClick={() => run(onAddSibling)} sx={{ fontSize: '0.75rem' }}>
          같은 단계에 추가
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => run(onEdit)} sx={{ fontSize: '0.75rem' }}>
          수정
        </MenuItem>
        <MenuItem
          onClick={() => run(onDelete)}
          sx={{ color: '#dc2626', fontSize: '0.75rem' }}
        >
          삭제
        </MenuItem>
      </Menu>
    </>
  );
}

function MemberCard({
  node,
  editMode,
  layoutMode,
  dragging,
  onDragStart,
  onDragEnd,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  return (
    <Paper
      variant="outlined"
      draggable={layoutMode}
      onDragStart={(event) => onDragStart(event, node)}
      onDragEnd={onDragEnd}
      sx={{
        position: 'relative',
        height: LAYOUT.memberHeight,
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        borderRadius: 1,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 2px 7px rgba(15,23,42,0.06)',
        cursor: layoutMode ? 'grab' : 'default',
        opacity: dragging ? 0.45 : 1,
      }}
    >
      <Box sx={{ flex: '0 0 4px', bgcolor: '#16a34a' }} />
      <Stack
        spacing={0.15}
        justifyContent="center"
        sx={{
          minWidth: 0,
          flex: 1,
          pl: 1,
          pr: editMode ? 3.15 : 0.85,
          py: 0.45,
        }}
      >
        <Typography noWrap sx={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800 }}>
          {node.position_title || '직책 미입력'}
        </Typography>
        <Typography noWrap sx={{ color: '#0f172a', fontSize: '0.74rem', fontWeight: 900 }}>
          {node.person_name || '이름 미입력'}
        </Typography>
        <Typography noWrap sx={{ color: '#64748b', fontSize: '0.54rem', fontWeight: 700 }}>
          {node.contact || '연락처 미입력'}
        </Typography>
      </Stack>

      {editMode && (
        <NodeMenu
          node={node}
          onAddDepartment={onAddDepartment}
          onAddPerson={onAddPerson}
          onAddSibling={onAddSibling}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </Paper>
  );
}

function DepartmentGroup({
  node,
  members,
  position,
  size,
  editMode,
  layoutMode,
  moving,
  memberDraggingId,
  memberDropTargetId,
  onPointerDown,
  onMemberDragStart,
  onMemberDragEnd,
  onMemberDragOver,
  onMemberDragLeave,
  onMemberDrop,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  const activeMemberDrop = memberDropTargetId === node.id;

  return (
    <Paper
      variant="outlined"
      onDragOver={(event) => onMemberDragOver(event, node)}
      onDragLeave={(event) => onMemberDragLeave(event, node)}
      onDrop={(event) => onMemberDrop(event, node)}
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: moving ? 5 : 2,
        width: size.width,
        minHeight: size.height,
        overflow: 'hidden',
        borderRadius: 1.2,
        borderWidth: activeMemberDrop ? 2 : 1,
        borderColor: activeMemberDrop ? '#0ea5e9' : '#94a3b8',
        bgcolor: '#f8fafc',
        boxShadow: moving
          ? '0 14px 32px rgba(15,23,42,0.22)'
          : '0 5px 14px rgba(15,23,42,0.09)',
        userSelect: layoutMode ? 'none' : 'auto',
      }}
    >
      <Box
        onPointerDown={(event) => onPointerDown(event, node)}
        sx={{
          position: 'relative',
          height: LAYOUT.departmentHeaderHeight,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: 1.15,
          pr: editMode ? 3.6 : 1.15,
          bgcolor: '#166534',
          color: '#ffffff',
          cursor: layoutMode ? (moving ? 'grabbing' : 'grab') : 'default',
          touchAction: layoutMode ? 'none' : 'auto',
        }}
      >
        <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 900 }}>
          {node.department || '부서 미입력'}
        </Typography>
        <Typography sx={{ mt: 0.15, color: '#dcfce7', fontSize: '0.57rem', fontWeight: 800 }}>
          구성원 {members.length}명
          {layoutMode ? ' · 끌어서 위치 이동' : ''}
        </Typography>

        {editMode && (
          <NodeMenu
            node={node}
            light
            onAddDepartment={onAddDepartment}
            onAddPerson={onAddPerson}
            onAddSibling={onAddSibling}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </Box>

      {members.length > 0 && (
        <Stack spacing={`${LAYOUT.memberGap}px`} sx={{ p: `${LAYOUT.memberPadding}px` }}>
          {members.map((member) => (
            <MemberCard
              key={member.id}
              node={member}
              editMode={editMode}
              layoutMode={layoutMode}
              dragging={memberDraggingId === member.id}
              onDragStart={onMemberDragStart}
              onDragEnd={onMemberDragEnd}
              onAddDepartment={onAddDepartment}
              onAddPerson={onAddPerson}
              onAddSibling={onAddSibling}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      )}

      {activeMemberDrop && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 7,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(14,165,233,0.86)',
          }}
        >
          <Typography sx={{ px: 1, color: '#ffffff', fontSize: '0.68rem', fontWeight: 900 }}>
            이 부서로 소속 변경
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function PersonNode({
  node,
  position,
  size,
  editMode,
  layoutMode,
  moving,
  onPointerDown,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  return (
    <Paper
      variant="outlined"
      onPointerDown={(event) => onPointerDown(event, node)}
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: moving ? 5 : 2,
        width: size.width,
        height: size.height,
        overflow: 'hidden',
        borderRadius: 2,
        borderColor: '#64748b',
        bgcolor: '#ffffff',
        boxShadow: moving
          ? '0 14px 32px rgba(15,23,42,0.22)'
          : '0 5px 14px rgba(15,23,42,0.10)',
        cursor: layoutMode ? (moving ? 'grabbing' : 'grab') : 'default',
        touchAction: layoutMode ? 'none' : 'auto',
        userSelect: layoutMode ? 'none' : 'auto',
      }}
    >
      <Box sx={{ position: 'relative', py: 0.65, px: 1.2, pr: editMode ? 3.7 : 1.2, bgcolor: '#334155' }}>
        <Typography noWrap sx={{ color: '#ffffff', fontSize: '0.68rem', fontWeight: 900, textAlign: 'center' }}>
          {node.position_title || '직책 미입력'}
        </Typography>

        {editMode && (
          <NodeMenu
            node={node}
            light
            onAddDepartment={onAddDepartment}
            onAddPerson={onAddPerson}
            onAddSibling={onAddSibling}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </Box>
      <Stack spacing={0.15} alignItems="center" sx={{ px: 1, py: 0.7 }}>
        <Typography noWrap sx={{ maxWidth: '100%', color: '#0f172a', fontSize: '0.82rem', fontWeight: 900 }}>
          {node.person_name || '이름 미입력'}
        </Typography>
        <Typography noWrap sx={{ maxWidth: '100%', color: '#64748b', fontSize: '0.58rem', fontWeight: 700 }}>
          {node.contact || '연락처 미입력'}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function OrganizationChart({
  userRole = '',
  currentUserId = '',
}) {
  const isSuperAdmin = userRole === '최고관리자';
  const chartViewportRef = useRef(null);
  const dragStateRef = useRef(null);
  const positionOverridesRef = useRef({});
  const hasCenteredRef = useRef(false);

  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const renderScale = zoom * BASE_RENDER_SCALE;
  const [movingNodeId, setMovingNodeId] = useState('');
  const [positionOverrides, setPositionOverrides] = useState({});
  const [memberDraggingId, setMemberDraggingId] = useState('');
  const [memberDropTargetId, setMemberDropTargetId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, parent_id, node_type, layout_type, department, position_title, person_name, contact, sort_order, layout_x, layout_y, is_active, created_at, updated_at',
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
            ? '조직도 테이블이 없습니다. 조직도 SQL을 먼저 실행해주세요.'
            : error.code === '42703'
              ? 'v51.5 조직도 SQL을 먼저 실행해주세요. 자유배치 좌표 열이 아직 없습니다.'
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
      setPositionOverrides({});
      positionOverridesRef.current = {};
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadNodes();

    const handleFocus = () => loadNodes();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadNodes]);

  const nodeById = useMemo(() => buildNodeMap(nodes), [nodes]);
  const childrenByParent = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const structuralNodeIds = useMemo(
    () => getStructuralNodeIds(nodes, childrenByParent, nodeById),
    [childrenByParent, nodeById, nodes],
  );
  const structuralGraph = useMemo(
    () => buildStructuralGraph(nodes, structuralNodeIds, nodeById),
    [nodeById, nodes, structuralNodeIds],
  );
  const structuralNodes = useMemo(
    () => nodes.filter((node) => structuralNodeIds.has(node.id)),
    [nodes, structuralNodeIds],
  );
  const autoPositions = useMemo(
    () =>
      createAutoLayout({
        nodes,
        structuralNodeIds,
        structuralChildren: structuralGraph.children,
        childrenByParent,
      }),
    [childrenByParent, nodes, structuralGraph.children, structuralNodeIds],
  );

  const itemSizeById = useMemo(
    () =>
      new Map(
        structuralNodes.map((node) => [
          node.id,
          getLayoutItemSize(
            node,
            childrenByParent,
            structuralNodeIds,
          ),
        ]),
      ),
    [childrenByParent, structuralNodeIds, structuralNodes],
  );

  const resolvedPositions = useMemo(() => {
    const result = {};

    structuralNodes.forEach((node) => {
      const override = positionOverrides[node.id];
      if (override) {
        result[node.id] = snapPosition(override);
        return;
      }

      if (
        isFiniteCoordinate(node.layout_x) &&
        isFiniteCoordinate(node.layout_y)
      ) {
        result[node.id] = snapPosition({
          x: Number(node.layout_x),
          y: Number(node.layout_y),
        });
        return;
      }

      result[node.id] = snapPosition(autoPositions[node.id] || {
        x: LAYOUT.padding,
        y: LAYOUT.padding,
      });
    });

    return result;
  }, [autoPositions, positionOverrides, structuralNodes]);

  const layoutRects = useMemo(
    () =>
      new Map(
        structuralNodes.map((node) => {
          const position = resolvedPositions[node.id] || {
            x: LAYOUT.padding,
            y: LAYOUT.padding,
          };
          const size = itemSizeById.get(node.id) || {
            width: LAYOUT.personWidth,
            height: LAYOUT.personHeight,
          };
          return [
            node.id,
            {
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
            },
          ];
        }),
      ),
    [itemSizeById, resolvedPositions, structuralNodes],
  );

  const connectionPaths = useMemo(() => {
    const result = [];

    structuralNodes.forEach((node) => {
      const parentId = structuralGraph.parentById.get(node.id);
      if (!parentId) return;

      const parentRect = layoutRects.get(parentId);
      const childRect = layoutRects.get(node.id);
      if (!parentRect || !childRect) return;

      result.push({
        id: `${parentId}-${node.id}`,
        path: createConnectorPath(parentRect, childRect),
      });
    });

    return result;
  }, [layoutRects, structuralGraph.parentById, structuralNodes]);

  const canvasSize = useMemo(() => {
    let maximumX = LAYOUT.minCanvasWidth;
    let maximumY = LAYOUT.minCanvasHeight;

    layoutRects.forEach((rect) => {
      maximumX = Math.max(maximumX, rect.x + rect.width + LAYOUT.padding);
      maximumY = Math.max(maximumY, rect.y + rect.height + LAYOUT.padding);
    });

    return {
      width: Math.ceil(maximumX),
      height: Math.ceil(maximumY),
    };
  }, [layoutRects]);

  const latestUpdatedAt = useMemo(
    () =>
      nodes.reduce((latest, node) => {
        const value = node.updated_at || node.created_at;
        if (!value) return latest;
        if (!latest) return value;
        return new Date(value) > new Date(latest) ? value : latest;
      }, ''),
    [nodes],
  );

  const getDescendantIds = useCallback(
    (nodeId) => {
      const descendants = new Set();
      const queue = [nodeId];

      while (queue.length > 0) {
        const parentId = queue.shift();
        (childrenByParent.get(parentId) || []).forEach((child) => {
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
      const siblings =
        childrenByParent.get(getParentKey(parentId)) || [];
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

  const getSuggestedPosition = useCallback(
    (parentId = '') => {
      const parentStructuralId = parentId
        ? structuralNodeIds.has(parentId)
          ? parentId
          : findStructuralParentId(
              nodeById.get(parentId) || {},
              structuralNodeIds,
              nodeById,
            )
        : '';
      const siblingKey = parentStructuralId || ROOT_KEY;
      const structuralSiblings =
        structuralGraph.children.get(siblingKey) || [];
      const siblingRects = structuralSiblings
        .map((node) => layoutRects.get(node.id))
        .filter(Boolean);
      const parentRect = parentStructuralId
        ? layoutRects.get(parentStructuralId)
        : null;

      if (siblingRects.length > 0) {
        return snapPosition({
          x:
            Math.max(
              ...siblingRects.map((rect) => rect.x + rect.width),
            ) + LAYOUT.horizontalGap,
          y: Math.min(...siblingRects.map((rect) => rect.y)),
        });
      }

      if (parentRect) {
        return snapPosition({
          x: Math.max(LAYOUT.padding, parentRect.x),
          y: parentRect.y + parentRect.height + LAYOUT.verticalGap,
        });
      }

      const rootRects = (structuralGraph.children.get(ROOT_KEY) || [])
        .map((node) => layoutRects.get(node.id))
        .filter(Boolean);

      return snapPosition({
        x:
          rootRects.length > 0
            ? Math.max(...rootRects.map((rect) => rect.x + rect.width)) +
              LAYOUT.horizontalGap
            : LAYOUT.padding,
        y: LAYOUT.padding,
      });
    },
    [
      layoutRects,
      nodeById,
      structuralGraph.children,
      structuralNodeIds,
    ],
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
      setMessage({ severity: 'warning', text: '부서명을 입력해주세요.' });
      return;
    }

    if (!isDepartment && (!positionTitle || !personName || !contact)) {
      setMessage({
        severity: 'warning',
        text: '직책, 이름, 연락처를 모두 입력해주세요.',
      });
      return;
    }

    const parent = nodeById.get(form.parent_id);
    const becomesEmbeddedMember =
      !isDepartment &&
      parent?.node_type === NODE_TYPES.DEPARTMENT &&
      !getDescendantIds(form.id).size;
    const previousNode = nodeById.get(form.id);
    const suggested = getSuggestedPosition(form.parent_id);
    const needsCoordinates =
      !becomesEmbeddedMember &&
      (!previousNode ||
        !isFiniteCoordinate(previousNode.layout_x) ||
        !isFiniteCoordinate(previousNode.layout_y));

    const payload = {
      parent_id: form.parent_id || null,
      node_type: form.node_type,
      layout_type: LAYOUT_TYPES.NORMAL,
      department: isDepartment ? department : department || '',
      position_title: isDepartment ? '' : positionTitle,
      person_name: isDepartment ? '' : personName,
      contact: isDepartment ? '' : contact,
      sort_order: Number(form.sort_order || 0),
      updated_by: currentUserId || null,
      is_active: true,
      ...(needsCoordinates
        ? { layout_x: suggested.x, layout_y: suggested.y }
        : {}),
    };

    setSaving(true);
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
        : '조직도 항목을 추가했습니다. 배치 편집에서 위치를 격자에 맞춰 옮길 수 있습니다.',
    });
  };

  const persistPositions = useCallback(
    async (positionsById) => {
      if (!isSuperAdmin) return;

      const safePositions = Object.fromEntries(
        Object.entries(positionsById || {}).map(([nodeId, position]) => [
          nodeId,
          snapPosition(position),
        ]),
      );
      const positionEntries = Object.entries(safePositions);
      if (positionEntries.length === 0) return;

      setSavingLayout(true);
      setNodes((previous) =>
        previous.map((node) => {
          const safePosition = safePositions[node.id];
          return safePosition
            ? {
                ...node,
                layout_x: safePosition.x,
                layout_y: safePosition.y,
                updated_at: new Date().toISOString(),
              }
            : node;
        }),
      );

      let saveError = null;
      for (const [nodeId, safePosition] of positionEntries) {
        const { error } = await supabase
          .from(TABLE_NAME)
          .update({
            layout_x: safePosition.x,
            layout_y: safePosition.y,
            updated_by: currentUserId || null,
          })
          .eq('id', nodeId);

        if (error) {
          saveError = error;
          break;
        }
      }

      setSavingLayout(false);

      if (saveError) {
        console.error('조직도 좌표 저장 오류:', saveError);
        await loadNodes();
        setMessage({
          severity: 'error',
          text: `배치 위치를 저장하지 못했습니다: ${saveError.message}`,
        });
        return;
      }

      setPositionOverrides((previous) => {
        const next = { ...previous };
        positionEntries.forEach(([nodeId]) => {
          delete next[nodeId];
        });
        positionOverridesRef.current = next;
        return next;
      });
      setMessage({
        severity: 'success',
        text:
          positionEntries.length > 1
            ? `상위 박스와 하위 조직 ${positionEntries.length - 1}개의 위치를 함께 저장했습니다.`
            : '박스 위치를 저장했습니다.',
      });
    },
    [currentUserId, isSuperAdmin, loadNodes],
  );

  useEffect(() => {
    if (!movingNodeId) return undefined;

    const handlePointerMove = (event) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const nextRootPosition = snapPosition({
        x:
          drag.rootOrigin.x +
          (event.clientX - drag.startClientX) / renderScale,
        y:
          drag.rootOrigin.y +
          (event.clientY - drag.startClientY) / renderScale,
      });
      const delta = {
        x: nextRootPosition.x - drag.rootOrigin.x,
        y: nextRootPosition.y - drag.rootOrigin.y,
      };
      const nextPositions = Object.fromEntries(
        Object.entries(drag.origins).map(([nodeId, origin]) => [
          nodeId,
          snapPosition({
            x: origin.x + delta.x,
            y: origin.y + delta.y,
          }),
        ]),
      );
      drag.latest = nextPositions;

      setPositionOverrides((previous) => {
        const next = { ...previous, ...nextPositions };
        positionOverridesRef.current = next;
        return next;
      });
    };

    const finishPointerMove = (event) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const finalPositions =
        drag.latest ||
        drag.origins;
      dragStateRef.current = null;
      setMovingNodeId('');
      persistPositions(finalPositions);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPointerMove);
    window.addEventListener('pointercancel', finishPointerMove);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointerMove);
      window.removeEventListener('pointercancel', finishPointerMove);
    };
  }, [movingNodeId, persistPositions, renderScale]);

  const handleNodePointerDown = useCallback(
    (event, node) => {
      if (!layoutMode || savingLayout || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      const origin = resolvedPositions[node.id];
      if (!origin) return;
      const movingNodeIds = new Set([node.id]);
      getDescendantIds(node.id).forEach((descendantId) => {
        if (structuralNodeIds.has(descendantId)) {
          movingNodeIds.add(descendantId);
        }
      });
      const origins = Object.fromEntries(
        [...movingNodeIds]
          .map((nodeId) => [
            nodeId,
            resolvedPositions[nodeId],
          ])
          .filter(([, position]) => Boolean(position)),
      );

      dragStateRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        rootOrigin: origin,
        origins,
        latest: origins,
      };
      setMovingNodeId(node.id);
    },
    [
      getDescendantIds,
      layoutMode,
      resolvedPositions,
      savingLayout,
      structuralNodeIds,
    ],
  );

  const handleMemberDragStart = useCallback(
    (event, node) => {
      if (!layoutMode || savingLayout) {
        event.preventDefault();
        return;
      }

      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.id);
      setMemberDraggingId(node.id);
      setMemberDropTargetId('');
    },
    [layoutMode, savingLayout],
  );

  const resetMemberDrag = useCallback(() => {
    setMemberDraggingId('');
    setMemberDropTargetId('');
  }, []);

  const handleMemberDragOver = useCallback(
    (event, departmentNode) => {
      if (!layoutMode || !memberDraggingId || savingLayout) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setMemberDropTargetId(departmentNode.id);
    },
    [layoutMode, memberDraggingId, savingLayout],
  );

  const handleMemberDragLeave = useCallback(
    (event, departmentNode) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setMemberDropTargetId((previous) =>
          previous === departmentNode.id ? '' : previous,
        );
      }
    },
    [],
  );

  const handleMemberDrop = useCallback(
    async (event, departmentNode) => {
      if (!layoutMode || savingLayout) return;

      event.preventDefault();
      event.stopPropagation();
      const memberId =
        memberDraggingId ||
        event.dataTransfer?.getData('text/plain') ||
        '';
      const member = nodeById.get(memberId);
      resetMemberDrag();

      if (!member || member.node_type !== NODE_TYPES.PERSON) return;
      if (member.parent_id === departmentNode.id) {
        setMessage({ severity: 'info', text: '이미 해당 부서 소속입니다.' });
        return;
      }
      if (getDescendantIds(member.id).size > 0) {
        setMessage({
          severity: 'warning',
          text: '하위 조직이 연결된 직원은 먼저 하위 조직을 이동해야 합니다.',
        });
        return;
      }

      setSavingLayout(true);
      const nextSortOrder = getNextSortOrder(departmentNode.id);
      const { error } = await supabase
        .from(TABLE_NAME)
        .update({
          parent_id: departmentNode.id,
          department: departmentNode.department || '',
          layout_type: LAYOUT_TYPES.NORMAL,
          sort_order: nextSortOrder,
          updated_by: currentUserId || null,
        })
        .eq('id', member.id);

      if (error) {
        console.error('직원 소속 변경 오류:', error);
        setMessage({
          severity: 'error',
          text: `직원 소속을 변경하지 못했습니다: ${error.message}`,
        });
        setSavingLayout(false);
        return;
      }

      await loadNodes();
      setSavingLayout(false);
      setMessage({
        severity: 'success',
        text: `${member.person_name} 직원을 ${departmentNode.department} 소속으로 변경했습니다.`,
      });
    },
    [
      currentUserId,
      getDescendantIds,
      getNextSortOrder,
      layoutMode,
      loadNodes,
      memberDraggingId,
      nodeById,
      resetMemberDrag,
      savingLayout,
    ],
  );

  const handleAutoArrange = async () => {
    if (!isSuperAdmin || savingLayout || structuralNodes.length === 0) return;

    const confirmed = window.confirm(
      '현재 자유배치 위치를 자동정렬로 다시 맞추시겠습니까?',
    );
    if (!confirmed) return;

    setSavingLayout(true);
    let saveError = null;

    for (const node of structuralNodes) {
      const position = autoPositions[node.id];
      if (!position) continue;
      const snappedPosition = snapPosition(position);

      const { error } = await supabase
        .from(TABLE_NAME)
        .update({
          layout_x: snappedPosition.x,
          layout_y: snappedPosition.y,
          updated_by: currentUserId || null,
        })
        .eq('id', node.id);

      if (error) {
        saveError = error;
        break;
      }
    }

    await loadNodes();
    setSavingLayout(false);

    if (saveError) {
      console.error('조직도 자동정렬 오류:', saveError);
      setMessage({
        severity: 'error',
        text: `자동정렬 저장 중 오류가 발생했습니다: ${saveError.message}`,
      });
      return;
    }

    setMessage({
      severity: 'success',
      text: '하위 부서를 같은 단계에서 가로로 정렬했습니다. 이후 원하는 위치로 다시 옮길 수 있습니다.',
    });
  };

  const handleDelete = async (node) => {
    if (!isSuperAdmin) return;

    const children = childrenByParent.get(node.id) || [];
    if (children.length > 0) {
      setMessage({
        severity: 'warning',
        text: '하위 조직이 연결되어 있습니다. 하위 항목을 먼저 이동하거나 삭제해주세요.',
      });
      return;
    }

    const label =
      node.node_type === NODE_TYPES.DEPARTMENT
        ? node.department
        : `${node.position_title} ${node.person_name}`;
    if (!window.confirm(`[${label}] 항목을 조직도에서 삭제하시겠습니까?`)) {
      return;
    }

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
    setMessage({ severity: 'success', text: '조직도 항목을 삭제했습니다.' });
  };

  const addDepartment = (parentNode) =>
    openAddDialog(parentNode.id, NODE_TYPES.DEPARTMENT);
  const addPerson = (parentNode) =>
    openAddDialog(parentNode.id, NODE_TYPES.PERSON);
  const addSibling = (siblingNode) =>
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
      },
    );

  const toggleEditMode = () => {
    if (savingLayout) return;
    setEditMode((previous) => {
      const next = !previous;
      if (next) setLayoutMode(false);
      return next;
    });
    resetMemberDrag();
  };

  const toggleLayoutMode = () => {
    if (savingLayout) return;
    setLayoutMode((previous) => {
      const next = !previous;
      if (next) setEditMode(false);
      return next;
    });
    resetMemberDrag();
  };

  const changeZoom = (difference) => {
    setZoom((previous) =>
      Math.min(
        ZOOM_MAX,
        Math.max(
          ZOOM_MIN,
          Number((previous + difference).toFixed(1)),
        ),
      ),
    );
  };

  useEffect(() => {
    if (
      loading ||
      structuralNodes.length === 0 ||
      hasCenteredRef.current
    ) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const viewport = chartViewportRef.current;
      if (!viewport || layoutRects.size === 0) return;
      let minimumX = Number.POSITIVE_INFINITY;
      let maximumX = 0;
      let minimumY = Number.POSITIVE_INFINITY;

      layoutRects.forEach((rect) => {
        minimumX = Math.min(minimumX, rect.x);
        maximumX = Math.max(maximumX, rect.x + rect.width);
        minimumY = Math.min(minimumY, rect.y);
      });
      const chartCenterX = (minimumX + maximumX) / 2;

      viewport.scrollLeft = Math.max(
        0,
        chartCenterX * renderScale -
          viewport.clientWidth / 2,
      );
      viewport.scrollTop = Math.max(
        0,
        minimumY * renderScale - 24,
      );
      hasCenteredRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    layoutRects,
    loading,
    renderScale,
    structuralNodes.length,
  ]);

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
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              bgcolor: '#ccfbf1',
              color: '#0f766e',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.68rem',
              fontWeight: 900,
            }}
          >
            조직
          </Box>
          <Box>
            <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>
              욱림건설 조직도
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.68rem' }}>
              {layoutMode
                ? '부서 제목을 끌면 하위 조직 전체가 격자에 맞춰 함께 이동하고, 직원을 다른 부서에 놓으면 소속이 변경됩니다.'
                : '부서 위치와 연결선이 저장된 좌표에 따라 표시됩니다.'}
              {latestUpdatedAt
                ? ` 최종 수정 ${formatDateTime(latestUpdatedAt)}`
                : ''}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.65} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.2} alignItems="center">
            <Tooltip title="축소">
              <span>
                <IconButton size="small" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
                  <Typography sx={{ fontSize: 18, fontWeight: 900 }}>−</Typography>
                </IconButton>
              </span>
            </Tooltip>
            <Typography sx={{ minWidth: 42, textAlign: 'center', color: '#475569', fontSize: '0.68rem', fontWeight: 900 }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <Tooltip title="확대">
              <span>
                <IconButton size="small" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
                  <Typography sx={{ fontSize: 18, fontWeight: 900 }}>+</Typography>
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {isSuperAdmin && (
            <>
              {editMode && (
                <>
                  <Button size="small" variant="outlined" onClick={() => openAddDialog('', NODE_TYPES.DEPARTMENT)}>
                    최상위 부서 추가
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => openAddDialog('', NODE_TYPES.PERSON)}>
                    최상위 직원 추가
                  </Button>
                </>
              )}

              {layoutMode && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleAutoArrange}
                  disabled={savingLayout}
                >
                  자동정렬
                </Button>
              )}

              <Button
                size="small"
                variant={layoutMode ? 'contained' : 'outlined'}
                color={layoutMode ? 'success' : 'primary'}
                onClick={toggleLayoutMode}
                disabled={savingLayout}
                startIcon={savingLayout ? <CircularProgress size={14} /> : undefined}
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
            </>
          )}
        </Stack>
      </Box>

      <Divider />

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mx: 2, mt: 1.2, py: 0.15 }}>
          {message.text}
        </Alert>
      )}

      <Box
        ref={chartViewportRef}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#f8fafc',
        }}
      >
        {loading ? (
          <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ minHeight: 300 }}>
            <CircularProgress size={28} />
            <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>
              조직도를 불러오는 중입니다.
            </Typography>
          </Stack>
        ) : nodes.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" spacing={1.2} sx={{ minHeight: 320 }}>
            <Typography sx={{ fontSize: 40, color: '#94a3b8', fontWeight: 900, lineHeight: 1 }}>
              조직도
            </Typography>
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
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              width: 'max-content',
              minWidth: '100%',
              minHeight: '100%',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                flex: '0 0 auto',
                width: canvasSize.width * renderScale,
                height: canvasSize.height * renderScale,
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${renderScale})`,
                  transformOrigin: '0 0',
                  backgroundImage: layoutMode
                    ? 'linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)'
                    : 'none',
                  backgroundSize: layoutMode
                    ? `${SNAP_GRID.x}px ${SNAP_GRID.y}px`
                    : 'auto',
                }}
              >
              <Box
                component="svg"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  width: canvasSize.width,
                  height: canvasSize.height,
                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                {connectionPaths.map((connection) => (
                  <path
                    key={connection.id}
                    d={connection.path}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </Box>

              {structuralNodes.map((node) => {
                const position = resolvedPositions[node.id];
                const size = itemSizeById.get(node.id);
                if (!position || !size) return null;

                if (node.node_type === NODE_TYPES.DEPARTMENT) {
                  const members = getEmbeddedMembers(
                    node.id,
                    childrenByParent,
                    structuralNodeIds,
                  );

                  return (
                    <DepartmentGroup
                      key={node.id}
                      node={node}
                      members={members}
                      position={position}
                      size={size}
                      editMode={editMode}
                      layoutMode={layoutMode}
                      moving={movingNodeId === node.id}
                      memberDraggingId={memberDraggingId}
                      memberDropTargetId={memberDropTargetId}
                      onPointerDown={handleNodePointerDown}
                      onMemberDragStart={handleMemberDragStart}
                      onMemberDragEnd={resetMemberDrag}
                      onMemberDragOver={handleMemberDragOver}
                      onMemberDragLeave={handleMemberDragLeave}
                      onMemberDrop={handleMemberDrop}
                      onAddDepartment={addDepartment}
                      onAddPerson={addPerson}
                      onAddSibling={addSibling}
                      onEdit={openEditDialog}
                      onDelete={handleDelete}
                    />
                  );
                }

                return (
                  <PersonNode
                    key={node.id}
                    node={node}
                    position={position}
                    size={size}
                    editMode={editMode}
                    layoutMode={layoutMode}
                    moving={movingNodeId === node.id}
                    onPointerDown={handleNodePointerDown}
                    onAddDepartment={addDepartment}
                    onAddPerson={addPerson}
                    onAddSibling={addSibling}
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                  />
                );
              })}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
          {form.id ? '조직도 항목 수정' : '조직도 항목 추가'}
          <IconButton onClick={closeDialog} disabled={saving} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Typography component="span" sx={{ fontSize: 22, lineHeight: 1 }}>×</Typography>
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
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
              <MenuItem value={NODE_TYPES.DEPARTMENT}>부서</MenuItem>
              <MenuItem value={NODE_TYPES.PERSON}>직원</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="상위 조직"
              value={form.parent_id}
              onChange={(event) => {
                const nextParentId = event.target.value;
                const nextParent = nodeById.get(nextParentId);
                setForm((previous) => ({
                  ...previous,
                  parent_id: nextParentId,
                  department:
                    previous.node_type === NODE_TYPES.PERSON &&
                    nextParent?.node_type === NODE_TYPES.DEPARTMENT
                      ? nextParent.department
                      : previous.department,
                }));
              }}
              helperText="하위 부서는 생성 후 같은 단계의 빈 위치에 놓이며, 배치 편집에서 격자에 맞춰 옮길 수 있습니다."
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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
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
              helperText="직원은 같은 부서 안에서 숫자가 작은 순서대로 표시됩니다."
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={closeDialog} disabled={saving}>취소</Button>
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
