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
  ClickAwayListener,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';
import { UI_FONT_FAMILY } from '../theme.js';

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

const DEFAULT_DEPARTMENT_COLOR = '#166534';
const DEPARTMENT_COLOR_PRESETS = [
  '#166534',
  '#0F766E',
  '#0369A1',
  '#1D4ED8',
  '#4338CA',
  '#7E22CE',
  '#BE123C',
  '#B91C1C',
  '#C2410C',
  '#A16207',
  '#475569',
  '#334155',
];
const BASE_RENDER_SCALE = 0.7;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;
const CHART_FONT_FAMILY = UI_FONT_FAMILY;
const SNAP_GRID = {
  x: 24,
  y: 24,
};
const BRANCH_LINE = {
  edgeGap: 16,
  handleStrokeWidth: 18,
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
const normalizeHexColor = (
  value,
  fallback = DEFAULT_DEPARTMENT_COLOR,
) => {
  const normalized = normalizeText(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized)
    ? normalized
    : fallback;
};
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
const clampNumber = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number(value || 0)));
const snapCoordinateWithinRange = (
  value,
  minimum,
  maximum,
  step,
) => {
  const minimumSnap = Math.ceil(minimum / step) * step;
  const maximumSnap = Math.floor(maximum / step) * step;

  if (minimumSnap > maximumSnap) {
    return (minimum + maximum) / 2;
  }

  return clampNumber(
    Math.round(Number(value || 0) / step) * step,
    minimumSnap,
    maximumSnap,
  );
};

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

const buildDepartmentMemberStats = (nodes, childrenByParent) => {
  const stats = new Map();

  nodes
    .filter((node) => node.node_type === NODE_TYPES.DEPARTMENT)
    .forEach((department) => {
      const visitedNodeIds = new Set();
      const personIds = new Set();
      let includesSubdepartments = false;
      const pendingNodes = [
        ...(childrenByParent.get(department.id) || []),
      ];

      while (pendingNodes.length > 0) {
        const current = pendingNodes.pop();
        if (!current || visitedNodeIds.has(current.id)) continue;

        visitedNodeIds.add(current.id);

        if (current.node_type === NODE_TYPES.PERSON) {
          personIds.add(current.id);
        } else if (current.node_type === NODE_TYPES.DEPARTMENT) {
          includesSubdepartments = true;
        }

        (childrenByParent.get(current.id) || []).forEach((child) => {
          if (!visitedNodeIds.has(child.id)) pendingNodes.push(child);
        });
      }

      stats.set(department.id, {
        count: personIds.size,
        includesSubdepartments,
      });
    });

  return stats;
};

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

const createConnectorSegments = (
  parentRect,
  childRect,
  requestedBranchY = null,
) => {
  const parentCenterX = parentRect.x + parentRect.width / 2;
  const parentCenterY = parentRect.y + parentRect.height / 2;
  const childCenterX = childRect.x + childRect.width / 2;
  const childCenterY = childRect.y + childRect.height / 2;

  if (childRect.y >= parentRect.y + parentRect.height + 16) {
    const startY = parentRect.y + parentRect.height;
    const endY = childRect.y;
    const minimumY = startY + BRANCH_LINE.edgeGap;
    const maximumY = endY - BRANCH_LINE.edgeGap;
    const defaultMiddleY = startY + (endY - startY) / 2;
    const middleY =
      maximumY > minimumY && isFiniteCoordinate(requestedBranchY)
        ? clampNumber(requestedBranchY, minimumY, maximumY)
        : defaultMiddleY;
    return [
      { x1: parentCenterX, y1: startY, x2: parentCenterX, y2: middleY },
      { x1: parentCenterX, y1: middleY, x2: childCenterX, y2: middleY },
      { x1: childCenterX, y1: middleY, x2: childCenterX, y2: endY },
    ];
  }

  if (parentRect.y >= childRect.y + childRect.height + 16) {
    const startY = parentRect.y;
    const endY = childRect.y + childRect.height;
    const middleY = endY + (startY - endY) / 2;
    return [
      { x1: parentCenterX, y1: startY, x2: parentCenterX, y2: middleY },
      { x1: parentCenterX, y1: middleY, x2: childCenterX, y2: middleY },
      { x1: childCenterX, y1: middleY, x2: childCenterX, y2: endY },
    ];
  }

  if (childCenterX >= parentCenterX) {
    const startX = parentRect.x + parentRect.width;
    const endX = childRect.x;
    const middleX = startX + (endX - startX) / 2;
    return [
      { x1: startX, y1: parentCenterY, x2: middleX, y2: parentCenterY },
      { x1: middleX, y1: parentCenterY, x2: middleX, y2: childCenterY },
      { x1: middleX, y1: childCenterY, x2: endX, y2: childCenterY },
    ];
  }

  const startX = parentRect.x;
  const endX = childRect.x + childRect.width;
  const middleX = endX + (startX - endX) / 2;
  return [
    { x1: startX, y1: parentCenterY, x2: middleX, y2: parentCenterY },
    { x1: middleX, y1: parentCenterY, x2: middleX, y2: childCenterY },
    { x1: middleX, y1: childCenterY, x2: endX, y2: childCenterY },
  ];
};

const mergeConnectorSegments = (segments) => {
  const groups = new Map();
  const precision = (value) => Number(Number(value).toFixed(3));

  segments.forEach((segment) => {
    const vertical = Math.abs(segment.x1 - segment.x2) < 0.001;
    const horizontal = Math.abs(segment.y1 - segment.y2) < 0.001;
    if (!vertical && !horizontal) return;

    const fixed = precision(vertical ? segment.x1 : segment.y1);
    const start = precision(
      Math.min(
        vertical ? segment.y1 : segment.x1,
        vertical ? segment.y2 : segment.x2,
      ),
    );
    const end = precision(
      Math.max(
        vertical ? segment.y1 : segment.x1,
        vertical ? segment.y2 : segment.x2,
      ),
    );
    if (end - start < 0.001) return;

    const key = `${vertical ? 'v' : 'h'}:${fixed}`;
    const intervals = groups.get(key) || [];
    intervals.push({ start, end, fixed, vertical });
    groups.set(key, intervals);
  });

  const merged = [];
  groups.forEach((intervals) => {
    const sorted = [...intervals].sort(
      (first, second) =>
        first.start - second.start || first.end - second.end,
    );
    let current = null;

    sorted.forEach((interval) => {
      if (!current) {
        current = { ...interval };
        return;
      }

      if (interval.start <= current.end + 0.001) {
        current.end = Math.max(current.end, interval.end);
        return;
      }

      merged.push(current);
      current = { ...interval };
    });

    if (current) merged.push(current);
  });

  return merged.map((segment, index) => ({
    id: `${segment.vertical ? 'v' : 'h'}-${segment.fixed}-${segment.start}-${segment.end}-${index}`,
    x1: segment.vertical ? segment.fixed : segment.start,
    y1: segment.vertical ? segment.start : segment.fixed,
    x2: segment.vertical ? segment.fixed : segment.end,
    y2: segment.vertical ? segment.end : segment.fixed,
  }));
};

function NodeMenu({
  node,
  light = false,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onChangeColor,
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
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor) ? 'true' : undefined}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setAnchor((previous) =>
              previous ? null : event.currentTarget,
            );
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

      <Popper
        anchorEl={anchor}
        open={Boolean(anchor)}
        placement="bottom-end"
        modifiers={[
          {
            name: 'offset',
            options: { offset: [0, 4] },
          },
          {
            name: 'flip',
            enabled: true,
          },
          {
            name: 'preventOverflow',
            enabled: true,
            options: { padding: 8 },
          },
        ]}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 1,
        }}
      >
        <ClickAwayListener
          mouseEvent="onMouseDown"
          touchEvent="onTouchStart"
          onClickAway={close}
        >
          <Paper
            elevation={8}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            sx={{
              minWidth: 158,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
            }}
          >
            <MenuList
              dense
              autoFocusItem={Boolean(anchor)}
              aria-label={`${node.department || node.person_name || '조직도'} 수정 메뉴`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
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
              {node.node_type === NODE_TYPES.DEPARTMENT && onChangeColor && (
                <MenuItem onClick={() => run(onChangeColor)} sx={{ fontSize: '0.75rem' }}>
                  색 수정
                </MenuItem>
              )}
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
            </MenuList>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}

function MemberCard({
  node,
  accentColor,
  editMode,
  layoutMode,
  dragging,
  onDragStart,
  onDragEnd,
  onShowDetails,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  return (
    <Paper
      variant="outlined"
      data-chart-node="true"
      draggable={layoutMode}
      onDragStart={(event) => onDragStart(event, node)}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!layoutMode && node.person_name) onShowDetails(node);
      }}
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
        cursor: layoutMode ? 'grab' : 'pointer',
        opacity: dragging ? 0.45 : 1,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        '&:hover': {
          borderColor: layoutMode ? '#94a3b8' : accentColor,
          boxShadow: layoutMode
            ? '0 2px 7px rgba(15,23,42,0.06)'
            : '0 5px 13px rgba(15,23,42,0.13)',
        },
      }}
    >
      <Box sx={{ flex: '0 0 4px', bgcolor: accentColor }} />
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
        <Typography noWrap sx={{ color: '#475569', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
          {node.position_title || '직책 미입력'}
        </Typography>
        <Typography noWrap sx={{ color: '#020617', fontSize: '0.86rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
          {node.person_name || '이름 미입력'}
        </Typography>
        <Typography noWrap sx={{ color: '#475569', fontSize: '0.64rem', fontWeight: 750, letterSpacing: '-0.01em' }}>
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
  memberCount,
  showsAggregateCount,
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
  onShowDetails,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onChangeColor,
  onEdit,
  onDelete,
}) {
  const activeMemberDrop = memberDropTargetId === node.id;
  const departmentColor = normalizeHexColor(node.card_color);

  return (
    <Paper
      variant="outlined"
      data-chart-node="true"
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
          bgcolor: departmentColor,
          color: '#ffffff',
          cursor: layoutMode ? (moving ? 'grabbing' : 'grab') : 'default',
          touchAction: layoutMode ? 'none' : 'auto',
        }}
      >
        <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
          {node.department || '부서 미입력'}
        </Typography>
        <Typography sx={{ mt: 0.15, color: 'rgba(255,255,255,0.94)', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
          {showsAggregateCount ? '총 구성원' : '구성원'} {memberCount}명
          {layoutMode ? ' · 끌어서 위치 이동' : ''}
        </Typography>

        {editMode && (
          <NodeMenu
            node={node}
            light
            onAddDepartment={onAddDepartment}
            onAddPerson={onAddPerson}
            onAddSibling={onAddSibling}
            onChangeColor={onChangeColor}
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
              accentColor={departmentColor}
              editMode={editMode}
              layoutMode={layoutMode}
              dragging={memberDraggingId === member.id}
              onDragStart={onMemberDragStart}
              onDragEnd={onMemberDragEnd}
              onShowDetails={onShowDetails}
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
  onShowDetails,
  onAddDepartment,
  onAddPerson,
  onAddSibling,
  onEdit,
  onDelete,
}) {
  return (
    <Paper
      variant="outlined"
      data-chart-node="true"
      onPointerDown={(event) => onPointerDown(event, node)}
      onClick={() => {
        if (!layoutMode && node.person_name) onShowDetails(node);
      }}
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
        cursor: layoutMode ? (moving ? 'grabbing' : 'grab') : 'pointer',
        touchAction: layoutMode ? 'none' : 'auto',
        userSelect: layoutMode ? 'none' : 'auto',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        '&:hover': {
          borderColor: layoutMode ? '#64748b' : '#0f766e',
          boxShadow: moving
            ? '0 14px 32px rgba(15,23,42,0.22)'
            : '0 7px 18px rgba(15,23,42,0.16)',
        },
      }}
    >
      <Box sx={{ position: 'relative', py: 0.65, px: 1.2, pr: editMode ? 3.7 : 1.2, bgcolor: '#334155' }}>
        <Typography noWrap sx={{ color: '#ffffff', fontSize: '0.76rem', fontWeight: 900, textAlign: 'center', letterSpacing: '-0.01em' }}>
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
        <Typography noWrap sx={{ maxWidth: '100%', color: '#020617', fontSize: '0.94rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
          {node.person_name || '이름 미입력'}
        </Typography>
        <Typography noWrap sx={{ maxWidth: '100%', color: '#475569', fontSize: '0.68rem', fontWeight: 750, letterSpacing: '-0.01em' }}>
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
  const branchDragStateRef = useRef(null);
  const panDragStateRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const positionOverridesRef = useRef({});
  const branchOverridesRef = useRef({});
  const hasCenteredRef = useRef(false);

  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const renderScale = zoom * BASE_RENDER_SCALE;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [movingNodeId, setMovingNodeId] = useState('');
  const [movingBranchParentId, setMovingBranchParentId] =
    useState('');
  const [positionOverrides, setPositionOverrides] = useState({});
  const [branchOverrides, setBranchOverrides] = useState({});
  const [memberDraggingId, setMemberDraggingId] = useState('');
  const [memberDropTargetId, setMemberDropTargetId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [colorTarget, setColorTarget] = useState(null);
  const [colorValue, setColorValue] = useState(DEFAULT_DEPARTMENT_COLOR);
  const [savingColor, setSavingColor] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, parent_id, node_type, layout_type, department, position_title, person_name, contact, sort_order, layout_x, layout_y, connector_branch_offset_y, card_color, is_active, created_at, updated_at',
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
              ? 'v51.9 조직도 SQL을 먼저 실행해주세요. 분기선 위치 저장 열이 아직 없습니다.'
              : `조직도를 불러오지 못했습니다: ${error.message}`,
      });
    } else {
      setNodes(
        sortNodes(
          (data || []).map((node) => ({
            ...node,
            node_type: node.node_type || NODE_TYPES.PERSON,
            layout_type: node.layout_type || LAYOUT_TYPES.NORMAL,
            connector_branch_offset_y: isFiniteCoordinate(
              node.connector_branch_offset_y,
            )
              ? Number(node.connector_branch_offset_y)
              : null,
            card_color:
              node.node_type === NODE_TYPES.DEPARTMENT
                ? normalizeHexColor(node.card_color)
                : null,
          })),
        ),
      );
      setPositionOverrides({});
      positionOverridesRef.current = {};
      setBranchOverrides({});
      branchOverridesRef.current = {};
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
  const departmentMemberStats = useMemo(
    () => buildDepartmentMemberStats(nodes, childrenByParent),
    [childrenByParent, nodes],
  );
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

  const branchGroups = useMemo(() => {
    const groups = [];

    structuralNodes.forEach((parentNode) => {
      const parentRect = layoutRects.get(parentNode.id);
      if (!parentRect) return;

      const downwardChildren = (
        structuralGraph.children.get(parentNode.id) || []
      )
        .map((childNode) => ({
          node: childNode,
          rect: layoutRects.get(childNode.id),
        }))
        .filter(
          ({ rect }) =>
            rect &&
            rect.y >=
              parentRect.y +
                parentRect.height +
                BRANCH_LINE.edgeGap,
        );

      if (downwardChildren.length === 0) return;

      const parentBottom = parentRect.y + parentRect.height;
      const closestChildTop = Math.min(
        ...downwardChildren.map(({ rect }) => rect.y),
      );
      const minimumY = parentBottom + BRANCH_LINE.edgeGap;
      const maximumY = closestChildTop - BRANCH_LINE.edgeGap;
      if (maximumY <= minimumY) return;

      const defaultY =
        parentBottom + (closestChildTop - parentBottom) / 2;
      const overrideY = branchOverrides[parentNode.id];
      const storedOffset = parentNode.connector_branch_offset_y;
      const requestedY = isFiniteCoordinate(overrideY)
        ? Number(overrideY)
        : isFiniteCoordinate(storedOffset)
          ? parentBottom + Number(storedOffset)
          : defaultY;
      const branchY = snapCoordinateWithinRange(
        requestedY,
        minimumY,
        maximumY,
        SNAP_GRID.y,
      );
      const parentCenterX =
        parentRect.x + parentRect.width / 2;
      const childCenters = downwardChildren.map(
        ({ rect }) => rect.x + rect.width / 2,
      );

      groups.push({
        parentId: parentNode.id,
        parentLabel:
          parentNode.department ||
          parentNode.person_name ||
          '상위 조직',
        y: branchY,
        x1: Math.min(parentCenterX, ...childCenters),
        x2: Math.max(parentCenterX, ...childCenters),
        minimumY,
        maximumY,
        parentBottom,
        childCount: downwardChildren.length,
      });
    });

    return groups;
  }, [
    branchOverrides,
    layoutRects,
    structuralGraph.children,
    structuralNodes,
  ]);

  const branchGroupByParent = useMemo(
    () =>
      new Map(
        branchGroups.map((branchGroup) => [
          branchGroup.parentId,
          branchGroup,
        ]),
      ),
    [branchGroups],
  );

  const connectionSegments = useMemo(() => {
    const rawSegments = [];

    structuralNodes.forEach((node) => {
      const parentId = structuralGraph.parentById.get(node.id);
      if (!parentId) return;

      const parentRect = layoutRects.get(parentId);
      const childRect = layoutRects.get(node.id);
      if (!parentRect || !childRect) return;

      rawSegments.push(
        ...createConnectorSegments(
          parentRect,
          childRect,
          branchGroupByParent.get(parentId)?.y,
        ),
      );
    });

    return mergeConnectorSegments(rawSegments);
  }, [
    branchGroupByParent,
    layoutRects,
    structuralGraph.parentById,
    structuralNodes,
  ]);

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

  const openColorDialog = (node) => {
    if (!isSuperAdmin || node.node_type !== NODE_TYPES.DEPARTMENT) {
      return;
    }

    setColorTarget(node);
    setColorValue(normalizeHexColor(node.card_color));
  };

  const closeColorDialog = () => {
    if (savingColor) return;
    setColorTarget(null);
    setColorValue(DEFAULT_DEPARTMENT_COLOR);
  };

  const handleSaveColor = async () => {
    if (!isSuperAdmin || !colorTarget) return;

    const nextColor = normalizeHexColor(colorValue, '');
    if (!nextColor) {
      setMessage({
        severity: 'warning',
        text: '색상은 #166534 형식의 6자리 값으로 입력해주세요.',
      });
      return;
    }

    setSavingColor(true);
    const { error } = await supabase
      .from(TABLE_NAME)
      .update({
        card_color: nextColor,
        updated_by: currentUserId || null,
      })
      .eq('id', colorTarget.id);

    if (error) {
      console.error('부서 색상 저장 오류:', error);
      setMessage({
        severity: 'error',
        text: `부서 색상을 저장하지 못했습니다: ${error.message}`,
      });
      setSavingColor(false);
      return;
    }

    await loadNodes();
    setSavingColor(false);
    setColorTarget(null);
    setColorValue(DEFAULT_DEPARTMENT_COLOR);
    setMessage({
      severity: 'success',
      text: `${colorTarget.department} 카드 색상을 변경했습니다.`,
    });
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

  const persistBranchPosition = useCallback(
    async ({
      parentId,
      parentLabel,
      parentBottom,
      minimumY,
      maximumY,
      finalY,
    }) => {
      if (!isSuperAdmin || !parentId) return;

      const safeY = snapCoordinateWithinRange(
        finalY,
        minimumY,
        maximumY,
        SNAP_GRID.y,
      );
      const safeOffset = Number(
        (safeY - parentBottom).toFixed(3),
      );

      setSavingLayout(true);
      setNodes((previous) =>
        previous.map((node) =>
          node.id === parentId
            ? {
                ...node,
                connector_branch_offset_y: safeOffset,
                updated_at: new Date().toISOString(),
              }
            : node,
        ),
      );

      const { error } = await supabase
        .from(TABLE_NAME)
        .update({
          connector_branch_offset_y: safeOffset,
          updated_by: currentUserId || null,
        })
        .eq('id', parentId);

      setSavingLayout(false);

      if (error) {
        console.error('조직도 분기선 위치 저장 오류:', error);
        await loadNodes();
        setMessage({
          severity: 'error',
          text: `분기선 위치를 저장하지 못했습니다: ${error.message}`,
        });
        return;
      }

      setBranchOverrides((previous) => {
        const next = { ...previous };
        delete next[parentId];
        branchOverridesRef.current = next;
        return next;
      });
      setMessage({
        severity: 'success',
        text: `${parentLabel} 아래 가로 분기선 위치를 저장했습니다.`,
      });
    },
    [currentUserId, isSuperAdmin, loadNodes],
  );

  useEffect(() => {
    if (!movingBranchParentId) return undefined;

    const handleBranchPointerMove = (event) => {
      const drag = branchDragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const nextY = snapCoordinateWithinRange(
        drag.originY +
          (event.clientY - drag.startClientY) / renderScale,
        drag.minimumY,
        drag.maximumY,
        SNAP_GRID.y,
      );
      drag.latestY = nextY;

      setBranchOverrides((previous) => {
        const next = {
          ...previous,
          [drag.parentId]: nextY,
        };
        branchOverridesRef.current = next;
        return next;
      });
    };

    const finishBranchPointerMove = (event) => {
      const drag = branchDragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      branchDragStateRef.current = null;
      setMovingBranchParentId('');
      persistBranchPosition({
        ...drag,
        finalY: drag.latestY ?? drag.originY,
      });
    };

    window.addEventListener(
      'pointermove',
      handleBranchPointerMove,
    );
    window.addEventListener(
      'pointerup',
      finishBranchPointerMove,
    );
    window.addEventListener(
      'pointercancel',
      finishBranchPointerMove,
    );

    return () => {
      window.removeEventListener(
        'pointermove',
        handleBranchPointerMove,
      );
      window.removeEventListener(
        'pointerup',
        finishBranchPointerMove,
      );
      window.removeEventListener(
        'pointercancel',
        finishBranchPointerMove,
      );
    };
  }, [
    movingBranchParentId,
    persistBranchPosition,
    renderScale,
  ]);

  const handleBranchPointerDown = useCallback(
    (event, branchGroup) => {
      if (
        !layoutMode ||
        savingLayout ||
        event.button !== 0 ||
        branchGroup.childCount < 2
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      branchDragStateRef.current = {
        parentId: branchGroup.parentId,
        parentLabel: branchGroup.parentLabel,
        pointerId: event.pointerId,
        startClientY: event.clientY,
        originY: branchGroup.y,
        latestY: branchGroup.y,
        minimumY: branchGroup.minimumY,
        maximumY: branchGroup.maximumY,
        parentBottom: branchGroup.parentBottom,
      };
      setMovingBranchParentId(branchGroup.parentId);
    },
    [layoutMode, savingLayout],
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

  const setPanPosition = useCallback((nextPan) => {
    const safePan = {
      x: Number(nextPan?.x || 0),
      y: Number(nextPan?.y || 0),
    };
    panRef.current = safePan;
    setPan(safePan);
  }, []);

  const setZoomAtClientPoint = useCallback(
    (requestedZoom, clientX, clientY) => {
      const viewport = chartViewportRef.current;
      if (!viewport) return;

      const nextZoom = Math.min(
        ZOOM_MAX,
        Math.max(
          ZOOM_MIN,
          Number(Number(requestedZoom).toFixed(2)),
        ),
      );
      const currentZoom = zoomRef.current;
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      const rect = viewport.getBoundingClientRect();
      const anchorX = Number.isFinite(clientX)
        ? clientX - rect.left
        : rect.width / 2;
      const anchorY = Number.isFinite(clientY)
        ? clientY - rect.top
        : rect.height / 2;
      const currentScale = currentZoom * BASE_RENDER_SCALE;
      const nextScale = nextZoom * BASE_RENDER_SCALE;
      const currentPan = panRef.current;
      const worldX = (anchorX - currentPan.x) / currentScale;
      const worldY = (anchorY - currentPan.y) / currentScale;
      const nextPan = {
        x: anchorX - worldX * nextScale,
        y: anchorY - worldY * nextScale,
      };

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      setPanPosition(nextPan);
    },
    [setPanPosition],
  );

  const changeZoom = (difference) => {
    const viewport = chartViewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    setZoomAtClientPoint(
      zoomRef.current + difference,
      rect ? rect.left + rect.width / 2 : undefined,
      rect ? rect.top + rect.height / 2 : undefined,
    );
  };

  const handleViewportWheel = useCallback(
    (event) => {
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setZoomAtClientPoint(
        zoomRef.current * zoomFactor,
        event.clientX,
        event.clientY,
      );
    },
    [setZoomAtClientPoint],
  );

  const handleViewportPointerDown = useCallback(
    (event) => {
      if (
        event.button !== 0 ||
        movingNodeId ||
        movingBranchParentId ||
        event.target?.closest?.(
          '[data-chart-node="true"], [data-branch-handle="true"], button, input, textarea, select, a, [role="button"]',
        )
      ) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      panDragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origin: panRef.current,
      };
      setIsPanning(true);
    },
    [movingBranchParentId, movingNodeId],
  );

  const handleViewportPointerMove = useCallback(
    (event) => {
      const drag = panDragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      setPanPosition({
        x: drag.origin.x + event.clientX - drag.startClientX,
        y: drag.origin.y + event.clientY - drag.startClientY,
      });
    },
    [setPanPosition],
  );

  const finishViewportPan = useCallback((event) => {
    const drag = panDragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    panDragStateRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

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

      setPanPosition({
        x: viewport.clientWidth / 2 - chartCenterX * renderScale,
        y: 24 - minimumY * renderScale,
      });
      hasCenteredRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    layoutRects,
    loading,
    renderScale,
    setPanPosition,
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
        fontFamily: CHART_FONT_FAMILY,
        textRendering: 'geometricPrecision',
        WebkitFontSmoothing: 'antialiased',
        '& .MuiTypography-root, & .MuiButton-root, & .MuiMenuItem-root, & .MuiInputBase-root, & .MuiFormLabel-root, & .MuiFormHelperText-root':
          {
            fontFamily: 'inherit',
          },
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
                ? '부서 제목을 끌면 하위 조직 전체가 함께 이동하고, 가로 분기선을 위·아래로 끌면 높이가 24px 격자에 맞춰 저장됩니다.'
                : '빈 화면을 끌어 이동하고 마우스 위치에서 휠로 확대·축소할 수 있습니다.'}
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
        onWheel={handleViewportWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={finishViewportPan}
        onPointerCancel={finishViewportPan}
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          overflow: 'hidden',
          bgcolor: '#f8fafc',
          cursor: movingBranchParentId
            ? 'ns-resize'
            : isPanning
              ? 'grabbing'
              : 'grab',
          touchAction: 'none',
          userSelect:
            isPanning || movingBranchParentId ? 'none' : 'auto',
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
            data-chart-pan-surface="true"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${renderScale})`,
              transformOrigin: '0 0',
              backgroundImage: layoutMode
                ? 'linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)'
                : 'none',
              backgroundSize: layoutMode
                ? `${SNAP_GRID.x}px ${SNAP_GRID.y}px`
                : 'auto',
              willChange: 'transform',
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
                  '& .branch-drag-handle': {
                    pointerEvents: layoutMode ? 'stroke' : 'none',
                    cursor: layoutMode ? 'ns-resize' : 'default',
                    transition:
                      'stroke 120ms ease, opacity 120ms ease',
                  },
                  '& .branch-drag-handle:hover': {
                    stroke: 'rgba(14,165,233,0.72)',
                    opacity: 1,
                  },
                }}
              >
                {connectionSegments.map((segment) => (
                  <line
                    key={segment.id}
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                    stroke="#526278"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {layoutMode &&
                  branchGroups
                    .filter(
                      (branchGroup) =>
                        branchGroup.childCount >= 2 &&
                        branchGroup.x2 - branchGroup.x1 > 1,
                    )
                    .map((branchGroup) => (
                      <line
                        key={`branch-handle-${branchGroup.parentId}`}
                        className="branch-drag-handle"
                        data-branch-handle="true"
                        x1={branchGroup.x1}
                        y1={branchGroup.y}
                        x2={branchGroup.x2}
                        y2={branchGroup.y}
                        stroke={
                          movingBranchParentId ===
                          branchGroup.parentId
                            ? 'rgba(14,165,233,0.86)'
                            : 'rgba(14,165,233,0.05)'
                        }
                        strokeWidth={
                          BRANCH_LINE.handleStrokeWidth
                        }
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) =>
                          handleBranchPointerDown(
                            event,
                            branchGroup,
                          )
                        }
                      >
                        <title>
                          {branchGroup.parentLabel} 아래 가로
                          분기선 높이 이동
                        </title>
                      </line>
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
                  const memberStats = departmentMemberStats.get(node.id) || {
                    count: 0,
                    includesSubdepartments: false,
                  };

                  return (
                    <DepartmentGroup
                      key={node.id}
                      node={node}
                      members={members}
                      memberCount={memberStats.count}
                      showsAggregateCount={
                        memberStats.includesSubdepartments
                      }
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
                      onShowDetails={setSelectedPerson}
                      onAddDepartment={addDepartment}
                      onAddPerson={addPerson}
                      onAddSibling={addSibling}
                      onChangeColor={openColorDialog}
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
                    onShowDetails={setSelectedPerson}
                    onAddDepartment={addDepartment}
                    onAddPerson={addPerson}
                    onAddSibling={addSibling}
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                  />
                );
              })}
          </Box>
        )}
      </Box>

      <Dialog
        open={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
          구성원 정보
          <IconButton
            onClick={() => setSelectedPerson(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Typography component="span" sx={{ fontSize: 22, lineHeight: 1 }}>
              ×
            </Typography>
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.15}>
            {[
              ['이름', selectedPerson?.person_name || '미입력'],
              ['직책', selectedPerson?.position_title || '미입력'],
              ['전화번호', selectedPerson?.contact || '미입력'],
            ].map(([label, value]) => (
              <Box
                key={label}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '76px minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 1.2,
                  px: 1.2,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Typography sx={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 800 }}>
                  {label}
                </Typography>
                <Typography sx={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 900 }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedPerson(null)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(colorTarget)}
        onClose={closeColorDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
          부서 카드 색 수정
          <IconButton
            onClick={closeColorDialog}
            disabled={savingColor}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Typography component="span" sx={{ fontSize: 22, lineHeight: 1 }}>
              ×
            </Typography>
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.6}>
            <Typography sx={{ color: '#475569', fontSize: '0.74rem', fontWeight: 800 }}>
              {colorTarget?.department || '선택한 부서'}
            </Typography>

            <Box
              sx={{
                height: 58,
                px: 1.4,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 1.2,
                color: '#ffffff',
                bgcolor: normalizeHexColor(colorValue),
                boxShadow: '0 5px 14px rgba(15,23,42,0.14)',
              }}
            >
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>
                {colorTarget?.department || '부서명'}
              </Typography>
            </Box>

            <Box>
              <Typography sx={{ mb: 0.75, color: '#64748b', fontSize: '0.68rem', fontWeight: 800 }}>
                기본 색상
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.75 }}>
                {DEPARTMENT_COLOR_PRESETS.map((preset) => (
                  <Box
                    key={preset}
                    component="button"
                    type="button"
                    aria-label={`${preset} 색상 선택`}
                    onClick={() => setColorValue(preset)}
                    sx={{
                      height: 34,
                      p: 0,
                      borderRadius: 1,
                      border:
                        normalizeHexColor(colorValue) === preset
                          ? '3px solid #0f172a'
                          : '2px solid #ffffff',
                      outline: '1px solid #cbd5e1',
                      bgcolor: preset,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </Box>
            </Box>

            <Stack direction="row" spacing={1.2} alignItems="center">
              <Box
                component="input"
                type="color"
                value={normalizeHexColor(colorValue)}
                onChange={(event) => setColorValue(event.target.value.toUpperCase())}
                aria-label="직접 색상 선택"
                sx={{
                  width: 54,
                  height: 40,
                  p: 0.25,
                  border: '1px solid #cbd5e1',
                  borderRadius: 1,
                  bgcolor: '#ffffff',
                  cursor: 'pointer',
                }}
              />
              <TextField
                fullWidth
                size="small"
                label="색상 코드"
                value={colorValue}
                onChange={(event) => setColorValue(event.target.value.toUpperCase())}
                placeholder="#166534"
                inputProps={{ maxLength: 7 }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={closeColorDialog} disabled={savingColor}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveColor}
            disabled={savingColor}
            startIcon={savingColor ? <CircularProgress size={15} /> : undefined}
          >
            색상 저장
          </Button>
        </DialogActions>
      </Dialog>

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
