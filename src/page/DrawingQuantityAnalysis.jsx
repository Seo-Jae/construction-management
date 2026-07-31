import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient.js';
import {
  analyzeDxfArrayBuffer,
  classifyQuantityLayer,
  formatMeters,
  formatSquareMeters,
} from '../utils/dxfQuantityAnalyzer.js';

const HEIGHT_SETTING_TABLE = 'drawing_quantity_height_settings';
const DRAWING_TABLE = 'drawing_quantity_drawings';
const ROOM_TABLE = 'drawing_quantity_rooms';
const ROOM_DEDUCTION_TABLE = 'drawing_quantity_room_deductions';
const OPENING_TABLE = 'drawing_quantity_openings';
const STORAGE_BUCKET = 'drawing-quantity-files';
const ANALYZER_VERSION = 'v51.67';
const MAX_DXF_FILE_SIZE = 25 * 1024 * 1024;

const MULTI_PROCESS_HIGHLIGHT_COLORS = [
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#9333ea',
];

const buildProcessHighlightColors = (layers = []) => {
  const normalized = (Array.isArray(layers) ? layers : [])
    .map((layer) => String(layer || '').trim())
    .filter((layer, index, values) => layer && values.indexOf(layer) === index);

  if (!normalized.length) return {};
  if (normalized.length === 1) return { [normalized[0]]: '#dc2626' };

  return normalized.reduce((result, layer, index) => {
    result[layer] = MULTI_PROCESS_HIGHLIGHT_COLORS[index % MULTI_PROCESS_HIGHLIGHT_COLORS.length];
    return result;
  }, {});
};

const numberFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const formatNumber = (value) => numberFormatter.format(Number(value || 0));
const formatInteger = (value) => integerFormatter.format(Number(value || 0));
const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateTimeFormatter.format(date);
};

const normalizeTypeName = (fileName) =>
  String(fileName || '')
    .replace(/\.dxf$/i, '')
    .replace(/\(\d+\)$/g, '')
    .trim();

const safeHeightValue = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const getLayerResult = (layer, heightSettings) => {
  const rule = classifyQuantityLayer(layer.layer);
  const lengthM = formatMeters(layer.totalLengthMm);
  const directAreaM2 = formatSquareMeters(layer.closedAreaMm2);
  const heightMm = safeHeightValue(heightSettings[layer.layer]);

  if (rule.mode === 'length_to_area') {
    return {
      rule,
      lengthM,
      heightMm,
      quantity: heightMm > 0 ? lengthM * (heightMm / 1000) : null,
      unit: '㎡',
      status: heightMm > 0 ? '정상' : '높이 입력 필요',
      severity: heightMm > 0 ? 'success' : 'warning',
    };
  }

  if (rule.mode === 'closed_area') {
    return {
      rule,
      lengthM,
      heightMm: null,
      quantity: directAreaM2,
      unit: '㎡',
      status:
        layer.openPolylineCount > 0
          ? `개방 PL ${formatInteger(layer.openPolylineCount)}개 제외`
          : '정상',
      severity: layer.openPolylineCount > 0 ? 'warning' : 'success',
    };
  }

  if (rule.mode === 'length') {
    return {
      rule,
      lengthM,
      heightMm: null,
      quantity: lengthM,
      unit: 'M',
      status: '정상',
      severity: 'success',
    };
  }

  if (rule.mode === 'pending') {
    return {
      rule,
      lengthM,
      heightMm: null,
      quantity: null,
      unit: '-',
      status: '규칙 미설정',
      severity: 'default',
    };
  }

  return {
    rule,
    lengthM,
    heightMm: null,
    quantity: lengthM,
    unit: 'M',
    status: '길이 참고값',
    severity: 'info',
  };
};

const createUuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const pointList = (points = []) =>
  points.map((point) => `${point.x},${point.y}`).join(' ');

const hatchPath = (paths = []) =>
  paths
    .map((path) => {
      const points = path.vertices || [];
      if (points.length < 2) return '';
      return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}${
        path.closed === false ? '' : ' Z'
      }`;
    })
    .filter(Boolean)
    .join(' ');

const arcPoints = (geometry, segmentCount = 48) => {
  const { center, radius, startAngle, sweep } = geometry;
  if (!center || !radius) return [];

  const count = Math.max(6, Math.ceil((Math.abs(sweep || 0) / 360) * segmentCount));
  return Array.from({ length: count + 1 }, (_unused, index) => {
    const angle = (startAngle + ((sweep || 0) * index) / count) * (Math.PI / 180);
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
};

const getFittedViewBox = (bounds) => {
  const margin = Math.max(bounds.width, bounds.height) * 0.025;
  return {
    x: bounds.minX - margin,
    y: -(bounds.maxY + margin),
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
};

const viewBoxString = (viewBox) =>
  `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

const layerDisplayName = (layer) => String(layer || '').replace(/^WL-\s*/i, '').trim();

const analysisLayerDisplayName = (layer) => {
  const displayName = layerDisplayName(layer);

  if (displayName === '합지석고') return '합지';

  return displayName;
};

const normalizeLayerToken = (layer) => String(layer || '').replace(/\s+/g, '').toUpperCase();
const isRoomAreaLayer = (layer) => {
  const token = normalizeLayerToken(layer);
  return token === 'WL-실면적' || token.startsWith('WL-실면적-');
};

const isCeilingAreaLayer = (layer) => {
  const token = normalizeLayerToken(layer);
  return token.startsWith('WL-') && (token.includes('천정면적') || token.includes('천장면적'));
};

const safeDeductionValue = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

// 수동 입력은 0.9처럼 M 단위로도, 900처럼 mm 단위로도 받을 수 있다.
// 20 이하의 양수는 M로 보고 mm로 변환한다.
const parseDimensionInputMm = (value) => {
  const number = safeDeductionValue(value);
  if (number <= 0) return 0;
  return number <= 20 ? number * 1000 : number;
};

const openingTypeLabel = () => '공제항목';
const isScheduleDeductionItem = (opening) => String(opening?.openingKey || '').startsWith('schedule-');
const calculateOpeningAreaM2 = (widthMm, heightMm, quantity = 1) =>
  (safeDeductionValue(widthMm) * safeDeductionValue(heightMm) * Math.max(1, Number(quantity || 1))) /
  1_000_000;

const getOpeningRoomKeys = (opening) =>
  [
    ...(Array.isArray(opening?.roomKeys) ? opening.roomKeys : []),
    opening?.roomKey,
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);

const openingBelongsToRoom = (opening, roomKey) =>
  getOpeningRoomKeys(opening).includes(String(roomKey || '').trim());

const isFiniteGeometryPoint = (point) =>
  Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));

const hasUsableOpeningSegment = (start, end) =>
  isFiniteGeometryPoint(start) &&
  isFiniteGeometryPoint(end) &&
  distanceBetweenPoints(start, end) > 0.001;

const buildFallbackOpeningSegment = ({ opening, candidate, widthMm, room }) => {
  if (hasUsableOpeningSegment(opening?.start, opening?.end)) {
    return {
      start: opening.start,
      end: opening.end,
      center: isFiniteGeometryPoint(opening?.center)
        ? opening.center
        : {
            x: (Number(opening.start.x) + Number(opening.end.x)) / 2,
            y: (Number(opening.start.y) + Number(opening.end.y)) / 2,
          },
    };
  }

  if (hasUsableOpeningSegment(candidate?.start, candidate?.end)) {
    return {
      start: candidate.start,
      end: candidate.end,
      center: isFiniteGeometryPoint(candidate?.center)
        ? candidate.center
        : {
            x: (Number(candidate.start.x) + Number(candidate.end.x)) / 2,
            y: (Number(candidate.start.y) + Number(candidate.end.y)) / 2,
          },
    };
  }

  const center = isFiniteGeometryPoint(candidate?.center)
    ? candidate.center
    : isFiniteGeometryPoint(opening?.center)
      ? opening.center
      : isFiniteGeometryPoint(room?.center)
        ? room.center
        : { x: 0, y: 0 };
  const halfWidth = Math.max(1, safeDeductionValue(widthMm)) / 2;
  return {
    start: { x: center.x - halfWidth, y: center.y },
    end: { x: center.x + halfWidth, y: center.y },
    center,
  };
};

const getOpeningDeductionQuantity = (opening, layerName) => {
  const mode = classifyQuantityLayer(layerName).mode;
  const count = Math.max(1, Number(opening?.quantity || 1));
  if (['length', 'reference'].includes(mode)) {
    return (safeDeductionValue(opening?.widthMm) / 1000) * count;
  }
  return safeDeductionValue(
    opening?.areaM2 || calculateOpeningAreaM2(opening?.widthMm, opening?.heightMm, count),
  );
};

const normalizeOpeningRow = (row) => ({
  openingId: row.id || null,
  openingKey: row.opening_key,
  roomKey: row.room_key,
  openingType: row.opening_type,
  openingName: row.opening_name || '',
  widthMm: Number(row.width_mm || 0),
  heightMm: Number(row.height_mm || 0),
  quantity: Number(row.quantity || 1),
  areaM2: Number(row.area_m2 || 0),
  start: { x: Number(row.start_x || 0), y: Number(row.start_y || 0) },
  end: { x: Number(row.end_x || 0), y: Number(row.end_y || 0) },
  center: { x: Number(row.center_x || 0), y: Number(row.center_y || 0) },
  appliedLayers: Array.isArray(row.applied_layers) ? row.applied_layers : [],
});

const simpleHash = (value) => {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const polygonCentroid = (points = []) => {
  if (!points.length) return { x: 0, y: 0 };
  let twiceArea = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    xSum += (current.x + next.x) * cross;
    ySum += (current.y + next.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    return points.reduce(
      (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
      { x: 0, y: 0 },
    );
  }
  return {
    x: xSum / (3 * twiceArea),
    y: ySum / (3 * twiceArea),
  };
};

const extractDrawingRooms = (analysis) => {
  if (!analysis?.entities?.length) return [];
  const rooms = analysis.entities
    .filter(
      (entity) =>
        !entity.renderOnly &&
        isRoomAreaLayer(entity.layer) &&
        ['LWPOLYLINE', 'POLYLINE'].includes(entity.type) &&
        entity.closed &&
        (entity.geometry?.vertices || []).length >= 3 &&
        Number(entity.areaMm2 || 0) > 0,
    )
    .map((entity) => {
      const points = entity.geometry.vertices || [];
      const canonical = canonicalPointSequenceKey(points, true);
      const center = polygonCentroid(points);
      const sourceAreaM2 = formatSquareMeters(entity.areaMm2 || 0);
      return {
        roomKey: `room-${simpleHash(`${entity.layer}|${canonical}|${Math.round(entity.areaMm2 || 0)}`)}`,
        layer: entity.layer,
        points,
        center,
        sourceAreaM2,
      };
    })
    .sort((left, right) => {
      const rowTolerance = Math.max(120, Math.min(analysis.bounds?.height || 1000, 12000) * 0.025);
      if (Math.abs(left.center.y - right.center.y) > rowTolerance) return right.center.y - left.center.y;
      return left.center.x - right.center.x;
    });

  return rooms.map((room, index) => ({ ...room, sortOrder: index + 1 }));
};


const polygonBoundaryDistance = (point, polygon = []) => {
  if (!point || polygon.length < 2) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    minimum = Math.min(
      minimum,
      pointToSegmentDistance(point, polygon[index], polygon[(index + 1) % polygon.length]),
    );
  }
  return minimum;
};

const findNearestRoomForPoint = (point, rooms = [], maxDistance = Number.POSITIVE_INFINITY) => {
  if (!point || !rooms.length) return null;
  const containing = rooms.filter(
    (room) => isPointInsidePolygon(point, room.points || []) || polygonBoundaryDistance(point, room.points || []) <= 1,
  );
  const candidates = containing.length ? containing : rooms;
  const ranked = candidates
    .map((room) => ({
      room,
      distance: containing.length
        ? distanceBetweenPoints(point, room.center)
        : polygonBoundaryDistance(point, room.points || []),
    }))
    .sort((left, right) => left.distance - right.distance);
  if (!ranked.length || ranked[0].distance > maxDistance) return null;
  return ranked[0].room;
};

// 창호·도어 주기가 실과 실 사이에 있으면 양쪽 실에 공제되도록 연결한다.
// 외벽 창호는 한 실만, 내부 도어는 최대 두 실까지 자동 연결한다.
const findAdjacentRoomKeysForOpening = ({
  point,
  widthMm = 0,
  rooms = [],
  primaryRoomKey = '',
}) => {
  if (!point || !rooms.length) return primaryRoomKey ? [primaryRoomKey] : [];

  const width = Math.max(1, safeDeductionValue(widthMm));
  const boundaryLimit = Math.max(100, Math.min(460, width * 0.45));
  const probeRadius = Math.max(90, Math.min(360, width * 0.32));
  const probePoints = [point];
  [0.35, 0.7, 1].forEach((ratio) => {
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      probePoints.push({
        x: Number(point.x) + Math.cos(angle) * probeRadius * ratio,
        y: Number(point.y) + Math.sin(angle) * probeRadius * ratio,
      });
    }
  });

  const rows = rooms
    .map((room) => {
      const points = room.points || [];
      const inside = isPointInsidePolygon(point, points);
      const boundaryDistance = polygonBoundaryDistance(point, points);
      const probeHits = probePoints.reduce(
        (count, probe) => count + (isPointInsidePolygon(probe, points) ? 1 : 0),
        0,
      );
      return { room, inside, boundaryDistance, probeHits };
    })
    .filter(
      (row) =>
        row.room.roomKey === primaryRoomKey ||
        row.inside ||
        row.probeHits > 0 ||
        row.boundaryDistance <= boundaryLimit,
    )
    .sort((left, right) => {
      const leftPrimary = left.room.roomKey === primaryRoomKey ? 1 : 0;
      const rightPrimary = right.room.roomKey === primaryRoomKey ? 1 : 0;
      if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
      if (left.probeHits !== right.probeHits) return right.probeHits - left.probeHits;
      if (left.inside !== right.inside) return Number(right.inside) - Number(left.inside);
      return left.boundaryDistance - right.boundaryDistance;
    });

  const result = [];
  const pushRoom = (roomKey) => {
    const key = String(roomKey || '').trim();
    if (key && !result.includes(key)) result.push(key);
  };
  pushRoom(primaryRoomKey);

  rows.forEach((row) => {
    if (result.length >= 2) return;
    if (row.room.roomKey === primaryRoomKey) return;
    const sharedBoundary = row.boundaryDistance <= Math.min(140, boundaryLimit * 0.4);
    const probedAcrossOpening = row.probeHits >= 2;
    if (sharedBoundary || probedAcrossOpening || row.inside) pushRoom(row.room.roomKey);
  });

  if (!result.length && rows[0]) pushRoom(rows[0].room.roomKey);
  return result.slice(0, 2);
};

// 실별 물량은 화면 표시용 OFFSET/확장 사각형과 완전히 분리한다.
// WL-실면적의 실제 폐합 PL을 기준으로 하되, 마감선이 실 경계의 벽체 두께 영역에 놓인 경우에는
// 해당 선과 가장 가까운 실제 WL-실면적 경계의 방향·실 안쪽 방향을 함께 확인해 배분한다.
// 다른 실 내부에 이미 들어간 선은 그 실을 최우선으로 확정하므로 표시용 OFFSET처럼 인접 실 물량이 섞이지 않는다.
const closestPointOnSegment = (point, start, end) => {
  const dx = Number(end?.x || 0) - Number(start?.x || 0);
  const dy = Number(end?.y || 0) - Number(start?.y || 0);
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) {
    return { x: Number(start?.x || 0), y: Number(start?.y || 0), ratio: 0 };
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((Number(point?.x || 0) - Number(start?.x || 0)) * dx +
        (Number(point?.y || 0) - Number(start?.y || 0)) * dy) /
        lengthSquared,
    ),
  );
  return {
    x: Number(start?.x || 0) + dx * ratio,
    y: Number(start?.y || 0) + dy * ratio,
    ratio,
  };
};

const nearestPolygonBoundaryInfo = (point, polygon = []) => {
  if (!point || polygon.length < 2) return null;
  let nearest = null;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const closest = closestPointOnSegment(point, start, end);
    const distance = distanceBetweenPoints(point, closest);
    if (!nearest || distance < nearest.distance) {
      nearest = { start, end, closest, distance };
    }
  }
  return nearest;
};

const findRoomForLinearSample = ({
  point,
  segmentStart,
  segmentEnd,
  rooms = [],
  boundaryTolerance = 1.5,
  associationTolerance = 220,
}) => {
  if (!point || !rooms.length) return null;

  const tolerance = Math.max(0.1, Number(boundaryTolerance || 0));
  const processDx = Number(segmentEnd?.x || 0) - Number(segmentStart?.x || 0);
  const processDy = Number(segmentEnd?.y || 0) - Number(segmentStart?.y || 0);
  const processLength = Math.hypot(processDx, processDy) || 1;
  const processTangent = { x: processDx / processLength, y: processDy / processLength };

  const rows = rooms.map((room) => {
    const points = room.points || [];
    const inside = isPointInsidePolygon(point, points);
    const boundaryInfo = nearestPolygonBoundaryInfo(point, points);
    return {
      room,
      inside,
      boundaryInfo,
      boundaryDistance: boundaryInfo?.distance ?? Number.POSITIVE_INFINITY,
      probeScore: 0,
    };
  });

  // 선의 표본점이 실제 WL-실면적 내부라면 그 실을 즉시 확정한다.
  // 이 규칙 때문에 인접 실 내부의 몰딩·걸레받이가 선택 실로 넘어오지 않는다.
  const insideRows = rows.filter((row) => row.inside);
  if (insideRows.length) {
    insideRows.sort((left, right) => {
      if (left.boundaryDistance !== right.boundaryDistance) {
        return right.boundaryDistance - left.boundaryDistance;
      }
      return distanceBetweenPoints(point, left.room.center) - distanceBetweenPoints(point, right.room.center);
    });
    return insideRows[0].room;
  }

  // 실제 경계 위에 놓인 선은 선의 양쪽을 짧게 확인해 어느 실 안쪽에 접하는지 판정한다.
  const exactBoundaryRows = rows.filter((row) => row.boundaryDistance <= tolerance);
  if (exactBoundaryRows.length) {
    const normal = { x: -processTangent.y, y: processTangent.x };
    const probeDistances = [Math.max(tolerance * 2, 1), 4, 12, 28];
    exactBoundaryRows.forEach((row) => {
      probeDistances.forEach((probeDistance) => {
        const firstProbe = {
          x: Number(point.x) + normal.x * probeDistance,
          y: Number(point.y) + normal.y * probeDistance,
        };
        const secondProbe = {
          x: Number(point.x) - normal.x * probeDistance,
          y: Number(point.y) - normal.y * probeDistance,
        };
        if (isPointInsidePolygon(firstProbe, row.room.points || [])) row.probeScore += 1;
        if (isPointInsidePolygon(secondProbe, row.room.points || [])) row.probeScore += 1;
      });
    });
    exactBoundaryRows.sort((left, right) => {
      if (left.probeScore !== right.probeScore) return right.probeScore - left.probeScore;
      if (left.boundaryDistance !== right.boundaryDistance) return left.boundaryDistance - right.boundaryDistance;
      return distanceBetweenPoints(point, left.room.center) - distanceBetweenPoints(point, right.room.center);
    });
    return exactBoundaryRows[0].room;
  }

  // 단열·석고·몰딩처럼 실제 선이 벽체 두께만큼 WL-실면적 경계 밖에 있는 경우를 처리한다.
  // 단순한 사각형 확장이 아니라 가장 가까운 실제 경계선과의 평행도 및 실 안쪽 진입 여부를 확인한다.
  const nearbyRows = rows
    .filter((row) => row.boundaryInfo && row.boundaryDistance <= Math.max(20, associationTolerance))
    .map((row) => {
      const boundaryDx = Number(row.boundaryInfo.end?.x || 0) - Number(row.boundaryInfo.start?.x || 0);
      const boundaryDy = Number(row.boundaryInfo.end?.y || 0) - Number(row.boundaryInfo.start?.y || 0);
      const boundaryLength = Math.hypot(boundaryDx, boundaryDy) || 1;
      const boundaryTangent = { x: boundaryDx / boundaryLength, y: boundaryDy / boundaryLength };
      const parallelScore = Math.abs(
        processTangent.x * boundaryTangent.x + processTangent.y * boundaryTangent.y,
      );
      if (parallelScore < 0.5) return null;

      const normalA = { x: -boundaryTangent.y, y: boundaryTangent.x };
      const normalB = { x: boundaryTangent.y, y: -boundaryTangent.x };
      const inwardTestDistances = [2, 8, 20, 45];
      const scoreNormal = (normal) =>
        inwardTestDistances.reduce((score, distance) => {
          const probe = {
            x: Number(row.boundaryInfo.closest.x) + normal.x * distance,
            y: Number(row.boundaryInfo.closest.y) + normal.y * distance,
          };
          return score + (isPointInsidePolygon(probe, row.room.points || []) ? 1 : 0);
        }, 0);
      const scoreA = scoreNormal(normalA);
      const scoreB = scoreNormal(normalB);
      const inwardNormal = scoreA >= scoreB ? normalA : normalB;
      const inwardScore = Math.max(scoreA, scoreB);
      if (!inwardScore) return null;

      const enterDistances = [
        row.boundaryDistance + 2,
        row.boundaryDistance + 10,
        row.boundaryDistance + 30,
        row.boundaryDistance + 70,
      ];
      const enterScore = enterDistances.reduce((score, distance) => {
        const probe = {
          x: Number(point.x) + inwardNormal.x * distance,
          y: Number(point.y) + inwardNormal.y * distance,
        };
        return score + (isPointInsidePolygon(probe, row.room.points || []) ? 1 : 0);
      }, 0);
      if (!enterScore) return null;

      return {
        ...row,
        parallelScore,
        enterScore,
        score:
          row.boundaryDistance +
          (1 - parallelScore) * 140 -
          inwardScore * 5 -
          enterScore * 10,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score);

  return nearbyRows[0]?.room || null;
};

const splitLinearSegmentByRoom = ({
  start,
  end,
  rooms = [],
  boundaryTolerance = 1.5,
  associationTolerance = 220,
  maxPartLength = 120,
}) => {
  const segmentLength = distanceBetweenPoints(start, end);
  if (!Number.isFinite(segmentLength) || segmentLength <= 0.001) return [];
  const sampleCount = Math.max(1, Math.ceil(segmentLength / Math.max(20, maxPartLength)));
  const runs = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const startRatio = sampleIndex / sampleCount;
    const endRatio = (sampleIndex + 1) / sampleCount;
    const partStart = {
      x: Number(start.x) + (Number(end.x) - Number(start.x)) * startRatio,
      y: Number(start.y) + (Number(end.y) - Number(start.y)) * startRatio,
    };
    const partEnd = {
      x: Number(start.x) + (Number(end.x) - Number(start.x)) * endRatio,
      y: Number(start.y) + (Number(end.y) - Number(start.y)) * endRatio,
    };
    const samplePoint = {
      x: (partStart.x + partEnd.x) / 2,
      y: (partStart.y + partEnd.y) / 2,
    };
    const room = findRoomForLinearSample({
      point: samplePoint,
      segmentStart: start,
      segmentEnd: end,
      rooms,
      boundaryTolerance,
      associationTolerance,
    });
    const roomKey = room?.roomKey || '';
    const partLength = distanceBetweenPoints(partStart, partEnd);
    const previous = runs[runs.length - 1];
    if (previous && previous.roomKey === roomKey) {
      previous.end = partEnd;
      previous.lengthMm += partLength;
    } else {
      runs.push({ roomKey, room, start: partStart, end: partEnd, lengthMm: partLength });
    }
  }

  return runs;
};

const parseScheduleDimension = (text) => {
  const match = String(text || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const widthM = Number(match[1]);
  const heightM = Number(match[2]);
  if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM <= 0 || heightM <= 0) return null;
  return { widthMm: widthM * 1000, heightMm: heightM * 1000 };
};

const extractScheduleDeductionCandidates = (analysis, rooms = []) => {
  if (!analysis?.entities?.length || !rooms.length) return [];
  const markers = analysis.entities
    .filter(
      (entity) =>
        entity.type === 'INSERT' &&
        String(entity.geometry?.blockName || '').replace(/\s+/g, '').includes('창호기호'),
    )
    .map((entity) => ({ entity, point: entity.geometry?.point }))
    .filter((item) => item.point)
    .sort((left, right) => {
      if (Math.abs(left.point.y - right.point.y) > 1) return right.point.y - left.point.y;
      return left.point.x - right.point.x;
    });

  const annotationTexts = analysis.entities
    .filter(
      (entity) =>
        ['TEXT', 'MTEXT'].includes(entity.type) &&
        String(entity.layer || '').replace(/\s+/g, '').includes('창호기호') &&
        String(entity.geometry?.text || '').trim(),
    )
    .map((entity) => ({
      entity,
      point: entity.geometry?.point,
      text: String(entity.geometry?.text || '').trim(),
      dimension: parseScheduleDimension(entity.geometry?.text),
    }))
    .filter((item) => item.point);

  const dimensions = annotationTexts.filter((item) => item.dimension);
  const labels = annotationTexts.filter((item) => !item.dimension);
  if (!markers.length || !dimensions.length || !labels.length) return [];

  const usedDimensions = new Set();
  const usedLabels = new Set();
  const labelCounts = {};
  const result = [];
  const matchLimit = Math.max(380, Math.min(650, Math.max(analysis.bounds?.width || 0, analysis.bounds?.height || 0) * 0.055));

  const nearestUnused = (items, used, point) =>
    items
      .map((item, index) => ({ item, index, distance: distanceBetweenPoints(point, item.point) }))
      .filter((entry) => !used.has(entry.index) && entry.distance <= matchLimit)
      .sort((left, right) => left.distance - right.distance)[0] || null;

  markers.forEach(({ entity, point }) => {
    const dimensionMatch = nearestUnused(dimensions, usedDimensions, point);
    const labelMatch = nearestUnused(labels, usedLabels, point);
    if (!dimensionMatch || !labelMatch) return;
    usedDimensions.add(dimensionMatch.index);
    usedLabels.add(labelMatch.index);

    const room = findNearestRoomForPoint(point, rooms);
    if (!room) return;
    const code = labelMatch.item.text.replace(/\s+/g, '') || '공제';
    labelCounts[code] = (labelCounts[code] || 0) + 1;
    const ordinal = labelCounts[code];
    const widthMm = dimensionMatch.item.dimension.widthMm;
    const heightMm = dimensionMatch.item.dimension.heightMm;
    const halfWidth = widthMm / 2;
    const openingKey = `schedule-${simpleHash(`${entity.geometry?.blockName}|${roundedCoordinate(point.x)}|${roundedCoordinate(point.y)}|${code}|${widthMm}|${heightMm}`)}`;
    const roomKeys = findAdjacentRoomKeysForOpening({
      point,
      widthMm,
      rooms,
      primaryRoomKey: room.roomKey,
    });

    result.push({
      openingId: null,
      openingKey,
      roomKey: room.roomKey,
      roomKeys,
      openingType: 'window',
      openingName: `${code}-${ordinal}`,
      widthMm,
      heightMm,
      quantity: 1,
      areaM2: calculateOpeningAreaM2(widthMm, heightMm, 1),
      start: { x: point.x - halfWidth, y: point.y },
      end: { x: point.x + halfWidth, y: point.y },
      center: { x: point.x, y: point.y },
      appliedLayers: [],
    });
  });

  return result;
};

const buildRoomLayerLengths = (analysis, rooms = []) => {
  const totals = Object.fromEntries(rooms.map((room) => [room.roomKey, {}]));
  if (!analysis?.entities?.length || !rooms.length) return totals;
  const drawingSpan = Math.max(analysis.bounds?.width || 0, analysis.bounds?.height || 0);
  const boundaryTolerance = Math.max(0.5, Math.min(2.5, drawingSpan * 0.00005));
  const associationTolerance = Math.max(220, Math.min(300, drawingSpan * 0.008));

  analysis.entities
    .filter((entity) => !entity.renderOnly && String(entity.layer || '').trim().startsWith('WL-'))
    .forEach((entity) => {
      const mode = classifyQuantityLayer(entity.layer).mode;
      if (mode === 'closed_area' || mode === 'room_boundary') return;
      getEntityLineGroups(entity).forEach((points) => {
        for (let index = 1; index < points.length; index += 1) {
          const runs = splitLinearSegmentByRoom({
            start: points[index - 1],
            end: points[index],
            rooms,
            boundaryTolerance,
            associationTolerance,
          });
          runs.forEach((run) => {
            if (!run.roomKey || !totals[run.roomKey]) return;
            totals[run.roomKey][entity.layer] =
              (totals[run.roomKey][entity.layer] || 0) + run.lengthMm;
          });
        }
      });
    });
  return totals;
};

const buildRoomProcessHighlightEntities = ({
  analysis,
  rooms = [],
  selectedRoomKey = '',
  layerNames = [],
}) => {
  if (!analysis?.entities?.length || !selectedRoomKey || !rooms.length || !layerNames.length) return [];
  const layerSet = new Set(layerNames.map((value) => String(value || '').trim()).filter(Boolean));
  const drawingSpan = Math.max(analysis.bounds?.width || 0, analysis.bounds?.height || 0);
  const boundaryTolerance = Math.max(0.5, Math.min(2.5, drawingSpan * 0.00005));
  const associationTolerance = Math.max(220, Math.min(300, drawingSpan * 0.008));
  const result = [];

  analysis.entities.forEach((entity, entityIndex) => {
    const layer = String(entity.layer || '').trim();
    if (entity.renderOnly || !layerSet.has(layer)) return;
    const mode = classifyQuantityLayer(layer).mode;
    if (mode === 'room_boundary') return;

    if (mode === 'closed_area') {
      const center = getClosedEntityCenter(entity);
      if (!center) return;
      const room = rooms.find(
        (candidate) =>
          isPointInsidePolygon(center, candidate.points || []) ||
          polygonBoundaryDistance(center, candidate.points || []) <= 2.5,
      );
      if (room?.roomKey === selectedRoomKey) result.push(entity);
      return;
    }

    getEntityLineGroups(entity).forEach((points, groupIndex) => {
      for (let index = 1; index < points.length; index += 1) {
        const runs = splitLinearSegmentByRoom({
          start: points[index - 1],
          end: points[index],
          rooms,
          boundaryTolerance,
          associationTolerance,
        });
        runs.forEach((run, runIndex) => {
          if (run.roomKey !== selectedRoomKey || run.lengthMm <= 0.001) return;
          result.push({
            ...entity,
            type: 'LINE',
            closed: false,
            lengthMm: run.lengthMm,
            areaMm2: 0,
            geometry: { start: run.start, end: run.end },
            __roomHighlightKey: `${entityIndex}-${groupIndex}-${index}-${runIndex}`,
          });
        });
      }
    });
  });

  return result;
};

const getClosedEntityCenter = (entity) => {
  const vertices = entity?.geometry?.vertices || entity?.geometry?.paths?.[0]?.vertices || [];
  if (vertices.length >= 3) return polygonCentroid(vertices);
  if (entity?.geometry?.center) return entity.geometry.center;
  if (entity?.geometry?.point) return entity.geometry.point;
  return null;
};

const buildRoomClosedAreas = (analysis, rooms = []) => {
  const totals = Object.fromEntries(rooms.map((room) => [room.roomKey, {}]));
  if (!analysis?.entities?.length || !rooms.length) return totals;
  const maxAssignDistance = Math.max(300, Math.min(900, Math.max(analysis.bounds?.width || 0, analysis.bounds?.height || 0) * 0.05));

  analysis.entities
    .filter((entity) => {
      if (entity.renderOnly || Number(entity.areaMm2 || 0) <= 0) return false;
      if (isRoomAreaLayer(entity.layer)) return false;
      return classifyQuantityLayer(entity.layer).mode === 'closed_area';
    })
    .forEach((entity) => {
      const center = getClosedEntityCenter(entity);
      if (!center) return;
      const room = findNearestRoomForPoint(center, rooms, maxAssignDistance);
      if (!room) return;
      totals[room.roomKey][entity.layer] =
        (totals[room.roomKey][entity.layer] || 0) + formatSquareMeters(entity.areaMm2 || 0);
    });

  return totals;
};

const buildRoomQuantityRows = ({
  analysis,
  rooms = [],
  roomSettings = {},
  openings = [],
  heightSettings = {},
}) => {
  if (!analysis || !rooms.length) return {};
  const roomLayerLengths = buildRoomLayerLengths(analysis, rooms);
  const roomClosedAreas = buildRoomClosedAreas(analysis, rooms);
  const layers = sortLayersByDefaultOrder(
    (analysis.activeLayers || []).filter(
      (layer) => classifyQuantityLayer(layer.layer).mode !== 'room_boundary',
    ),
  );
  const rowsByRoom = {};

  rooms.forEach((room) => {
    rowsByRoom[room.roomKey] = layers.map((layer) => {
      const rule = classifyQuantityLayer(layer.layer);
      const lengthM = formatMeters(roomLayerLengths[room.roomKey]?.[layer.layer] || 0);
      let grossQuantity = null;
      let unit = '-';
      let status = '';

      if (rule.mode === 'length_to_area') {
        const heightMm = safeHeightValue(heightSettings[layer.layer]);
        unit = '㎡';
        grossQuantity = heightMm > 0 ? lengthM * (heightMm / 1000) : null;
        status = heightMm > 0 ? '' : '높이 입력 필요';
      } else if (rule.mode === 'closed_area') {
        unit = '㎡';
        grossQuantity = roomClosedAreas[room.roomKey]?.[layer.layer] || 0;
      } else if (['length', 'reference'].includes(rule.mode)) {
        unit = 'M';
        grossQuantity = lengthM;
      } else if (rule.mode === 'pending') {
        status = '산출규칙 미설정';
      }

      const directDeductionM2 = unit === '㎡'
        ? safeDeductionValue(roomSettings[room.roomKey]?.deductions?.[layer.layer])
        : 0;
      const drawingDeductionM2 = openings
        .filter(
          (opening) =>
            openingBelongsToRoom(opening, room.roomKey) &&
            (opening.appliedLayers || []).includes(layer.layer),
        )
        .reduce((sum, opening) => sum + getOpeningDeductionQuantity(opening, layer.layer), 0);
      const deductionM2 = directDeductionM2 + drawingDeductionM2;
      const quantity = ['㎡', 'M'].includes(unit) && grossQuantity !== null
        ? Math.max(0, grossQuantity - deductionM2)
        : grossQuantity;

      return {
        layer: layer.layer,
        rule,
        grossQuantity,
        unit,
        status,
        directDeductionM2,
        drawingDeductionM2,
        deductionM2,
        quantity,
      };
    });
  });

  return rowsByRoom;
};


const DEFAULT_LAYER_ORDER = [
  '단열(90)',
  '단열(130)',
  '합지석고',
  '스터드',
  '그라스울',
  '경량석고',
  '천정면적',
  '몰딩',
  '걸레받이',
];

const normalizeLayerOrderName = (layer) =>
  layerDisplayName(layer).replace(/\s+/g, '').toUpperCase();

const sortLayersByDefaultOrder = (layers = []) => {
  const orderMap = new Map(
    DEFAULT_LAYER_ORDER.map((name, index) => [name.replace(/\s+/g, '').toUpperCase(), index]),
  );

  return [...layers].sort((left, right) => {
    const leftKey = normalizeLayerOrderName(left.layer);
    const rightKey = normalizeLayerOrderName(right.layer);
    const leftIndex = orderMap.has(leftKey) ? orderMap.get(leftKey) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderMap.has(rightKey) ? orderMap.get(rightKey) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return leftKey.localeCompare(rightKey, 'ko-KR');
  });
};

const roundedCoordinate = (value) => Math.round(Number(value || 0) * 10) / 10;
const geometryPointKey = (point) => `${roundedCoordinate(point?.x)},${roundedCoordinate(point?.y)}`;

const canonicalPointSequenceKey = (points = [], closed = false) => {
  const values = points.map(geometryPointKey);
  if (!values.length) return '';

  if (!closed) {
    const forward = values.join('|');
    const reverse = [...values].reverse().join('|');
    return forward < reverse ? forward : reverse;
  }

  const withoutRepeatedEnd =
    values.length > 1 && values[0] === values[values.length - 1] ? values.slice(0, -1) : values;
  if (!withoutRepeatedEnd.length) return '';

  const variants = [];
  const sequences = [withoutRepeatedEnd, [...withoutRepeatedEnd].reverse()];
  sequences.forEach((sequence) => {
    sequence.forEach((_value, index) => {
      variants.push([...sequence.slice(index), ...sequence.slice(0, index)].join('|'));
    });
  });
  variants.sort();
  return variants[0];
};

const entityGeometryKey = (entity) => {
  const geometry = entity.geometry || {};
  const layer = String(entity.layer || '').trim();

  if (entity.type === 'LINE') {
    return `${layer}|LINE|${canonicalPointSequenceKey([geometry.start, geometry.end])}`;
  }
  if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
    return `${layer}|${entity.type}|${canonicalPointSequenceKey(
      geometry.vertices || [],
      Boolean(entity.closed),
    )}`;
  }
  if (entity.type === 'ARC') {
    return `${layer}|ARC|${geometryPointKey(geometry.center)}|${roundedCoordinate(
      geometry.radius,
    )}|${roundedCoordinate(geometry.startAngle)}|${roundedCoordinate(geometry.sweep)}`;
  }
  if (entity.type === 'CIRCLE') {
    return `${layer}|CIRCLE|${geometryPointKey(geometry.center)}|${roundedCoordinate(
      geometry.radius,
    )}`;
  }
  if (entity.type === 'SPLINE') {
    return `${layer}|SPLINE|${canonicalPointSequenceKey(geometry.points || [])}`;
  }
  if (entity.type === 'HATCH') {
    const paths = (geometry.paths || [])
      .map((path) => canonicalPointSequenceKey(path.vertices || [], path.closed !== false))
      .sort();
    return `${layer}|HATCH|${paths.join('||')}`;
  }
  return `${layer}|${entity.type}|${entity.handle || ''}|${geometryPointKey(geometry.point)}`;
};

const dedupeSelectedLayerEntities = (entities = [], selectedLayer = '', highlightedLayers = []) => {
  const targetLayers = new Set(
    [selectedLayer, ...(Array.isArray(highlightedLayers) ? highlightedLayers : [])]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  if (!targetLayers.size) return entities;
  const seen = new Set();
  return entities.filter((entity) => {
    if (!targetLayers.has(String(entity.layer || '').trim())) return true;
    const key = entityGeometryKey(entity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getEntityLineGroups = (entity) => {
  const geometry = entity.geometry || {};
  if (entity.type === 'LINE' && geometry.start && geometry.end) {
    return [[geometry.start, geometry.end]];
  }
  if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
    const points = geometry.vertices || [];
    if (points.length < 2) return [];
    return [entity.closed ? [...points, points[0]] : points];
  }
  if (entity.type === 'ARC') return [arcPoints(geometry)];
  if (entity.type === 'SPLINE') return [geometry.points || []];
  if (entity.type === 'HATCH') {
    return (geometry.paths || [])
      .map((path) => {
        const points = path.vertices || [];
        return path.closed === false || !points.length ? points : [...points, points[0]];
      })
      .filter((points) => points.length > 1);
  }
  return [];
};

const projectPointToSegment = (point, start, end) => {
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const denominator = dx * dx + dy * dy;
  if (denominator === 0) {
    const x = Number(start.x);
    const y = Number(start.y);
    return {
      x,
      y,
      ratio: 0,
      distance: Math.hypot(point.x - x, point.y - y),
    };
  }

  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator),
  );
  const x = Number(start.x) + ratio * dx;
  const y = Number(start.y) + ratio * dy;
  return {
    x,
    y,
    ratio,
    distance: Math.hypot(point.x - x, point.y - y),
  };
};

const pointToSegmentDistance = (point, start, end) =>
  projectPointToSegment(point, start, end).distance;

const buildOpeningLayerCandidates = (analysis, processLayers = [], capturePoints = []) => {
  if (!analysis?.entities?.length || capturePoints.length < 2 || !processLayers.length) return [];
  const start = capturePoints[0];
  const end = capturePoints[1];
  const openingLength = distanceBetweenPoints(start, end);
  if (!Number.isFinite(openingLength) || openingLength <= 0.001) return [];

  const tolerance = Math.max(180, Math.min(320, openingLength * 0.08));
  const centerTolerance = Math.max(140, Math.min(300, openingLength * 0.24));
  const centerPoint = {
    x: (Number(start.x) + Number(end.x)) / 2,
    y: (Number(start.y) + Number(end.y)) / 2,
  };
  const sampleCount = Math.max(9, Math.min(31, Math.ceil(openingLength / 220) + 1));
  const samples = Array.from({ length: sampleCount }, (_unused, index) => {
    const ratio = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    return {
      x: Number(start.x) + (Number(end.x) - Number(start.x)) * ratio,
      y: Number(start.y) + (Number(end.y) - Number(start.y)) * ratio,
    };
  });

  const entitiesByLayer = new Map(processLayers.map((layer) => [layer.layer, []]));
  (analysis.entities || []).forEach((entity) => {
    const layerName = String(entity.layer || '').trim();
    if (!entitiesByLayer.has(layerName)) return;
    const groups = getEntityLineGroups(entity).filter((points) => points.length > 1);
    if (groups.length) entitiesByLayer.get(layerName).push(...groups);
  });

  return processLayers
    .map((layer) => {
      const lineGroups = entitiesByLayer.get(layer.layer) || [];
      if (!lineGroups.length) return null;
      const sampleDistances = samples.map((sample) => {
        let minimum = Number.POSITIVE_INFINITY;
        lineGroups.forEach((points) => {
          for (let index = 1; index < points.length; index += 1) {
            minimum = Math.min(minimum, pointToSegmentDistance(sample, points[index - 1], points[index]));
          }
        });
        return minimum;
      });
      const coveredCount = sampleDistances.filter((distance) => distance <= tolerance).length;
      const coverage = coveredCount / sampleDistances.length;
      const minimumDistance = Math.min(...sampleDistances);
      let centerDistance = Number.POSITIVE_INFINITY;
      lineGroups.forEach((points) => {
        for (let index = 1; index < points.length; index += 1) {
          centerDistance = Math.min(
            centerDistance,
            pointToSegmentDistance(centerPoint, points[index - 1], points[index]),
          );
        }
      });
      const minimumIndex = sampleDistances.indexOf(minimumDistance);
      const endpointHits = [sampleDistances[0], sampleDistances[sampleDistances.length - 1]].filter(
        (distance) => distance <= tolerance,
      ).length;
      const endpointBand = Math.max(1, Math.ceil(sampleDistances.length * 0.2));
      const closestPointIsNearEnd =
        minimumIndex <= endpointBand || minimumIndex >= sampleDistances.length - 1 - endpointBand;
      const detected =
        coverage >= 0.28 ||
        (coverage >= 0.18 && minimumDistance <= tolerance * 0.35) ||
        (coverage >= 0.08 && closestPointIsNearEnd && minimumDistance <= tolerance * 0.35) ||
        (endpointHits === 2 && minimumDistance <= tolerance) ||
        centerDistance <= centerTolerance;
      if (!detected) return null;
      return {
        layer: layer.layer,
        displayName: layerDisplayName(layer.layer),
        coverage,
        minimumDistance,
        centerDistance,
        tolerance,
      };
    })
    .filter(Boolean);
};

const isPointInsidePolygon = (point, points = []) => {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
};



// 선택 실 표시는 실제 굴곡선을 그대로 따라가지 않고, 실 전체를 감싸는 사각형으로 단순화한다.
// 복잡한 L자·다각형 실에서도 공정선과 경계선이 겹치지 않도록 CAD의 바깥 OFFSET처럼 여유를 둔다.
const expandedRoomRectangle = (points = [], distance = 0) => {
  const source = points.filter(
    (point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)),
  );
  if (!source.length) return source;
  const xs = source.map((point) => Number(point.x));
  const ys = source.map((point) => Number(point.y));
  const margin = Number.isFinite(Number(distance)) ? Math.max(0, Number(distance)) : 0;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
};

const distanceToEntity = (point, entity) => {
  const geometry = entity.geometry || {};
  if (entity.type === 'CIRCLE' && geometry.center) {
    return Math.abs(Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y) - geometry.radius);
  }

  if (entity.closed && ['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
    const vertices = geometry.vertices || [];
    if (vertices.length >= 3 && isPointInsidePolygon(point, vertices)) return 0;
  }

  if (entity.type === 'HATCH') {
    const closedPath = (geometry.paths || []).find(
      (path) => path.closed !== false && (path.vertices || []).length >= 3,
    );
    if (closedPath && isPointInsidePolygon(point, closedPath.vertices)) return 0;
  }

  let minimum = Number.POSITIVE_INFINITY;
  getEntityLineGroups(entity).forEach((points) => {
    for (let index = 1; index < points.length; index += 1) {
      minimum = Math.min(minimum, pointToSegmentDistance(point, points[index - 1], points[index]));
    }
  });
  return minimum;
};

const buildEndpointSnapPoints = (entities = []) => {
  const points = [];
  const seen = new Set();
  const addPoint = (point) => {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
    const key = geometryPointKey(point);
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ x: Number(point.x), y: Number(point.y), type: '끝점' });
  };

  entities.forEach((entity) => {
    const geometry = entity.geometry || {};
    if (entity.type === 'LINE') {
      addPoint(geometry.start);
      addPoint(geometry.end);
    } else if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
      (geometry.vertices || []).forEach(addPoint);
    } else if (entity.type === 'ARC') {
      const pointsOnArc = arcPoints(geometry);
      addPoint(pointsOnArc[0]);
      addPoint(pointsOnArc[pointsOnArc.length - 1]);
    } else if (entity.type === 'SPLINE') {
      const splinePoints = geometry.points || [];
      addPoint(splinePoints[0]);
      addPoint(splinePoints[splinePoints.length - 1]);
    }
  });
  return points;
};

const buildSnapSegments = (entities = []) => {
  const segments = [];
  entities.forEach((entity) => {
    if (entity.type === 'HATCH' || ['TEXT', 'MTEXT'].includes(entity.type)) return;
    getEntityLineGroups(entity).forEach((points) => {
      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        if (!start || !end || distanceBetweenPoints(start, end) <= 0.001) continue;
        segments.push({
          start,
          end,
          angle: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
        });
      }
    });
  });
  return segments;
};

const distanceBetweenPoints = (start, end) =>
  Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y));

const isClosedMeasurement = (points = []) =>
  points.length >= 4 && distanceBetweenPoints(points[0], points[points.length - 1]) <= 0.001;

const polygonAreaMm2 = (points = []) => {
  if (!isClosedMeasurement(points)) return 0;
  const polygon = points.slice(0, -1);
  if (polygon.length < 3) return 0;
  let doubledArea = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    doubledArea += Number(point.x) * Number(next.y) - Number(next.x) * Number(point.y);
  });
  return Math.abs(doubledArea) / 2;
};

const removeConsecutiveDuplicatePoints = (points = []) =>
  points.filter((point, index) => {
    if (index === 0) return true;
    return distanceBetweenPoints(points[index - 1], point) > 0.001;
  });

const buildEntityTooltip = (entity, heightSettings) => {
  const active = String(entity.layer || '').trim().startsWith('WL-');
  if (!active) return null;

  const row = getLayerResult(
    {
      layer: entity.layer,
      totalLengthMm: entity.lengthMm,
      closedAreaMm2: entity.areaMm2,
      openPolylineCount:
        ['LWPOLYLINE', 'POLYLINE'].includes(entity.type) && !entity.closed ? 1 : 0,
    },
    heightSettings,
  );

  const lines = [];
  if (entity.lengthMm > 0) lines.push(`길이 ${formatNumber(formatMeters(entity.lengthMm))}M`);
  if (row.heightMm) lines.push(`높이 ${formatNumber(row.heightMm / 1000)}M`);
  if (row.quantity !== null && row.quantity !== undefined) {
    lines.push(`${row.unit === '㎡' ? '면적' : '수량'} ${formatNumber(row.quantity)}${row.unit}`);
  } else {
    lines.push(row.status);
  }

  return {
    title: layerDisplayName(entity.layer),
    text: lines.join(' · '),
  };
};

const getEntityStyle = (entity, selectedLayer, patternId, displayMode = 'view', highlightedLayers = [], highlightedLayerColors = {}) => {
  const layer = String(entity.layer || '').trim();
  const compact = layer.replace(/\s+/g, '').toUpperCase();
  const active = layer.startsWith('WL-');
  const highlightSet = new Set(
    (Array.isArray(highlightedLayers) ? highlightedLayers : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  const hasSelectedLayer = Boolean(selectedLayer) || highlightSet.size > 0;
  const directlySelected = Boolean(selectedLayer) && selectedLayer === layer;
  const highlighted = highlightSet.has(layer);
  const selected = directlySelected || highlighted;
  const patternName = String(entity.geometry?.patternName || '').replace(/\s+/g, '').toUpperCase();

  if (isRoomAreaLayer(layer)) {
    return {
      stroke: 'none',
      fill: 'none',
      opacity: 0,
      strokeScale: 0,
      pointerEnabled: false,
    };
  }

  if (active) {
    if (displayMode === 'preview') {
      return {
        stroke: '#94a3b8',
        fill: 'none',
        opacity: 0.48,
        strokeScale: 0.55,
        pointerEnabled: false,
      };
    }

    if (selected) {
      return {
        stroke: directlySelected
          ? '#dc2626'
          : String(highlightedLayerColors?.[layer] || '#dc2626'),
        fill: 'none',
        opacity: 1,
        strokeScale: 1.45,
        pointerEnabled: true,
      };
    }

    return {
      stroke: '#cbd5e1',
      fill: 'none',
      opacity: hasSelectedLayer ? 0.22 : 0.42,
      strokeScale: hasSelectedLayer ? 0.45 : 0.5,
      pointerEnabled: false,
    };
  }

  const concreteWall = compact.includes('0KD2벽체');
  const concreteHatch = compact.includes('0KD해치') || patternName.includes('벽돌단면');
  const masonryLayer = compact.includes('조적') || compact.includes('벽돌');
  const windowLayer = compact.includes('창호') || compact.includes('WINDOW');
  const doorLayer =
    compact.includes('DOOR') ||
    compact.includes('도어') ||
    compact.includes('문틀') ||
    compact.includes('문짝');
  const solidHatch = entity.type === 'HATCH' && entity.geometry?.solid;

  if (concreteHatch) {
    return {
      stroke: '#4b5563',
      fill: `url(#${patternId})`,
      opacity: 0.5,
      strokeScale: 0.48,
      pointerEnabled: false,
    };
  }

  if (concreteWall || masonryLayer) {
    return {
      stroke: '#374151',
      fill: 'none',
      opacity: 0.56,
      strokeScale: 0.48,
      pointerEnabled: false,
    };
  }

  if (solidHatch) {
    return {
      stroke: '#94a3b8',
      fill: 'rgba(148,163,184,0.08)',
      opacity: 0.52,
      strokeScale: 0.5,
      pointerEnabled: false,
    };
  }

  if (windowLayer || doorLayer) {
    return {
      stroke: '#374151',
      fill: 'none',
      opacity: 0.62,
      strokeScale: 0.56,
      pointerEnabled: false,
    };
  }

  return {
    stroke: '#64748b',
    fill: entity.type === 'HATCH' ? 'rgba(100,116,139,0.025)' : 'none',
    opacity: hasSelectedLayer ? 0.22 : 0.5,
    strokeScale: 0.48,
    pointerEnabled: false,
  };
};

const DxfEntityShape = React.memo(function DxfEntityShape({
  entity,
  index,
  selectedLayer,
  highlightedLayers = [],
  highlightedLayerColors = {},
  baseStrokeWidth,
  patternId,
  displayMode,
}) {
  const geometry = entity.geometry || {};
  const style = getEntityStyle(entity, selectedLayer, patternId, displayMode, highlightedLayers, highlightedLayerColors);
  const shapeProps = {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: Math.max(0.45, baseStrokeWidth * style.strokeScale),
    vectorEffect: 'non-scaling-stroke',
  };

  let shape = null;

  if (entity.type === 'LINE' && geometry.start && geometry.end) {
    shape = (
      <line
        x1={geometry.start.x}
        y1={geometry.start.y}
        x2={geometry.end.x}
        y2={geometry.end.y}
        {...shapeProps}
      />
    );
  } else if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
    const points = geometry.vertices || [];
    shape = entity.closed ? (
      <polygon points={pointList(points)} {...shapeProps} />
    ) : (
      <polyline points={pointList(points)} fill="none" {...shapeProps} />
    );
  } else if (entity.type === 'CIRCLE' && geometry.center) {
    shape = (
      <circle
        cx={geometry.center.x}
        cy={geometry.center.y}
        r={geometry.radius}
        {...shapeProps}
      />
    );
  } else if (entity.type === 'ARC') {
    shape = <polyline points={pointList(arcPoints(geometry))} fill="none" {...shapeProps} />;
  } else if (entity.type === 'SPLINE') {
    shape = <polyline points={pointList(geometry.points || [])} fill="none" {...shapeProps} />;
  } else if (entity.type === 'HATCH') {
    const pathData = hatchPath(geometry.paths || []);
    if (pathData) {
      shape = <path d={pathData} fillRule="evenodd" clipRule="evenodd" {...shapeProps} />;
    }
  } else if (['TEXT', 'MTEXT'].includes(entity.type) && geometry.point && geometry.text) {
    shape = (
      <text
        x="0"
        y="0"
        transform={`translate(${geometry.point.x} ${geometry.point.y}) scale(1,-1) rotate(${-Number(
          geometry.rotation || 0,
        )})`}
        fontSize={Math.max(40, Number(geometry.height || 100))}
        fontFamily="Arial, sans-serif"
        fill={style.stroke}
        stroke="none"
        opacity={style.opacity}
      >
        {geometry.text}
      </text>
    );
  }

  if (!shape) return null;

  return (
    <g key={`${entity.type}-${entity.layer}-${index}`} opacity={style.opacity} pointerEvents="none">
      {shape}
    </g>
  );
});

function MeasurementLabel({ x, y, text, fontSize }) {
  const width = Math.max(fontSize * 2.3, text.length * fontSize * 0.58);
  const height = fontSize * 1.45;
  return (
    <g transform={`translate(${x} ${y}) scale(1,-1)`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={fontSize * 0.22}
        fill="rgba(255,255,255,0.98)"
        stroke="#6d28d9"
        strokeWidth={Math.max(1, fontSize * 0.025)}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="0"
        y={fontSize * 0.33}
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize={fontSize}
        fontWeight="700"
        fill="#5b21b6"
        stroke="#ffffff"
        strokeWidth={Math.max(0.8, fontSize * 0.035)}
        paintOrder="stroke"
      >
        {text}
      </text>
    </g>
  );
}

const getSegmentLabelPosition = (start, end, offset) => {
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const length = Math.hypot(dx, dy) || 1;
  let normalX = -dy / length;
  let normalY = dx / length;

  // 화면에서 글자가 선 위쪽 또는 오른쪽으로 빠져 선을 가리지 않게 한다.
  if (Math.abs(dy) > Math.abs(dx) * 1.4) {
    normalX = 1;
    normalY = 0;
  } else if (normalY < 0) {
    normalX *= -1;
    normalY *= -1;
  }

  return {
    x: (Number(start.x) + Number(end.x)) / 2 + normalX * offset,
    y: (Number(start.y) + Number(end.y)) / 2 + normalY * offset,
  };
};

function SnapMarker({ point, size, showLabel = false }) {
  if (!point?.snapped) return null;
  const markerSize = Math.max(0.001, Number(size || 0.001));
  const half = markerSize / 2;
  const isPerpendicular = point.snapType === '직각';
  const isNearest = point.snapType === '근처점';
  const isClosed = point.snapType === '닫힘';
  const color = isPerpendicular
    ? '#0891b2'
    : isNearest
      ? '#2563eb'
      : isClosed
        ? '#7c3aed'
        : '#16a34a';

  return (
    <g
      transform={`translate(${point.x} ${point.y}) rotate(${Number(point.snapAngle || 0)})`}
      pointerEvents="none"
    >
      {isPerpendicular ? (
        <path
          d={`M ${-half} ${half} L ${-half} ${-half} L ${half} ${-half} M ${-half} 0 L 0 0 L 0 ${-half}`}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1.6, markerSize * 0.12)}
          vectorEffect="non-scaling-stroke"
        />
      ) : isNearest ? (
        <path
          d={`M ${-half} 0 L 0 ${-half * 0.72} L ${half} 0 L 0 ${half * 0.72} Z M ${-half * 0.42} 0 L 0 ${-half * 0.3} L ${half * 0.42} 0 L 0 ${half * 0.3} Z`}
          fill="rgba(255,255,255,0.94)"
          fillRule="evenodd"
          stroke={color}
          strokeWidth={Math.max(1.6, markerSize * 0.11)}
          vectorEffect="non-scaling-stroke"
        />
      ) : isClosed ? (
        <circle
          cx="0"
          cy="0"
          r={half}
          fill="rgba(255,255,255,0.94)"
          stroke={color}
          strokeWidth={Math.max(1.6, markerSize * 0.12)}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          x={-half}
          y={-half}
          width={markerSize}
          height={markerSize}
          fill="rgba(255,255,255,0.92)"
          stroke={color}
          strokeWidth={Math.max(1.6, markerSize * 0.12)}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle cx="0" cy="0" r={Math.max(1.8, markerSize * 0.09)} fill={color} />
      {showLabel && (
        <g transform={`rotate(${-Number(point.snapAngle || 0)}) scale(1,-1)`}>
          <rect
            x={markerSize * 0.75}
            y={-markerSize * 1.25}
            width={markerSize * 3.5}
            height={markerSize * 1.35}
            rx={markerSize * 0.25}
            fill="rgba(15,23,42,0.88)"
          />
          <text
            x={markerSize * 2.5}
            y={-markerSize * 0.32}
            textAnchor="middle"
            fontSize={markerSize * 0.72}
            fontWeight="800"
            fill="#ffffff"
          >
            {point.snapType}
          </text>
        </g>
      )}
    </g>
  );
}

function MeasurementOverlay({
  measurements,
  currentPoints,
  hoverPoint,
  baseStrokeWidth,
  bounds,
  markerSize,
}) {
  const draftPoints = hoverPoint && currentPoints.length ? [...currentPoints, hoverPoint] : currentPoints;
  const fontSize = Math.max(72, Math.max(bounds.width, bounds.height) / 150);
  const strokeWidth = Math.max(1.2, baseStrokeWidth * 1.15);

  const normalizeMeasurement = (measurement) =>
    removeConsecutiveDuplicatePoints(measurement.points || measurement);

  const completed = measurements.map(normalizeMeasurement);
  const draft = normalizeMeasurement(draftPoints);

  const renderGeometry = (points, key, isDraft = false) => {
    if (points.length < 1) return null;
    return (
      <g key={`geometry-${key}`} pointerEvents="none">
        {points.length > 1 && (
          <polyline
            points={pointList(points)}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={strokeWidth}
            strokeDasharray={isDraft ? '7 5' : 'none'}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((point, pointIndex) => (
          <circle
            key={`point-${key}-${pointIndex}`}
            cx={point.x}
            cy={point.y}
            r={Math.max(markerSize * 0.32, baseStrokeWidth * 7)}
            fill="#ffffff"
            stroke="#7c3aed"
            strokeWidth={Math.max(1.2, baseStrokeWidth)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    );
  };

  const renderLabels = (points, key) => {
    if (points.length < 2) return null;
    const totalMm = points.slice(1).reduce(
      (sum, point, index) => sum + distanceBetweenPoints(points[index], point),
      0,
    );
    return (
      <g key={`labels-${key}`} pointerEvents="none">
        {points.slice(1).map((point, pointIndex) => {
          const start = points[pointIndex];
          const segmentMm = distanceBetweenPoints(start, point);
          const labelPoint = getSegmentLabelPosition(start, point, fontSize * 1.75);
          return (
            <MeasurementLabel
              key={`segment-label-${key}-${pointIndex}`}
              x={labelPoint.x}
              y={labelPoint.y}
              text={`${formatNumber(segmentMm / 1000)}M`}
              fontSize={fontSize}
            />
          );
        })}
        {points.length > 2 && totalMm > 0 && (
          <MeasurementLabel
            x={points[points.length - 1].x}
            y={points[points.length - 1].y + fontSize * 2.1}
            text={
              isClosedMeasurement(points)
                ? `누계 ${formatNumber(totalMm / 1000)}M · 면적 ${formatNumber(
                    polygonAreaMm2(points) / 1000000,
                  )}㎡`
                : `누계 ${formatNumber(totalMm / 1000)}M`
            }
            fontSize={fontSize}
          />
        )}
      </g>
    );
  };

  return (
    <g>
      {completed.map((points, index) => renderGeometry(points, index))}
      {draft.length > 0 && renderGeometry(draft, 'current', true)}
      {completed.map((points, index) => renderLabels(points, index))}
      {draft.length > 1 && renderLabels(draft, 'current')}
      <SnapMarker point={hoverPoint} size={markerSize} showLabel />
    </g>
  );
}

const DrawingEntityScene = React.memo(function DrawingEntityScene({
  entities,
  selectedLayer,
  highlightedLayers = [],
  highlightedLayerColors = {},
  baseStrokeWidth,
  patternId,
  displayMode,
  selectedRoomPoints = [],
  roomClipId = '',
  roomSelectedEntities = [],
}) {
  const selectionLayers = [
    ...(selectedLayer ? [selectedLayer] : []),
    ...(Array.isArray(highlightedLayers) ? highlightedLayers : []),
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const selectionSet = new Set(selectionLayers);
  const roomProcessMode = Boolean(selectionLayers.length && selectedRoomPoints.length >= 3 && roomClipId);
  const baseSelectionLayer = roomProcessMode ? '__ROOM_PROCESS_SELECTION__' : selectedLayer;
  const baseHighlightedLayers = roomProcessMode ? [] : highlightedLayers;
  const selectedLayerEntities = roomProcessMode
    ? roomSelectedEntities
    : [];

  return (
    <>
      <g transform="scale(1,-1)">
        {entities.map((entity, index) => (
          <DxfEntityShape
            key={`base-${entity.type}-${entity.layer}-${index}`}
            entity={entity}
            index={index}
            selectedLayer={baseSelectionLayer}
            highlightedLayers={baseHighlightedLayers}
            highlightedLayerColors={highlightedLayerColors}
            baseStrokeWidth={baseStrokeWidth}
            patternId={patternId}
            displayMode={displayMode}
          />
        ))}
      </g>
      {roomProcessMode && (
        <g transform="scale(1,-1)">
          {selectedLayerEntities.map((entity, index) => (
            <DxfEntityShape
              key={`room-${entity.__roomHighlightKey || `${entity.type}-${entity.layer}-${index}`}`}
              entity={entity}
              index={index}
              selectedLayer=""
              highlightedLayers={selectionLayers}
              highlightedLayerColors={highlightedLayerColors}
              baseStrokeWidth={baseStrokeWidth}
              patternId={patternId}
              displayMode={displayMode}
            />
          ))}
        </g>
      )}
    </>
  );
});


function RoomOverlay({
  rooms = [],
  roomSettings = {},
  selectedRoomKey = '',
  onRoomSelect = null,
  editable = false,
  showLabels = false,
  baseStrokeWidth = 1,
  selectedOffsetDistance = 0,
}) {
  if (!rooms.length) return null;
  const hasSelectedRoom = rooms.some((room) => room.roomKey === selectedRoomKey);
  return (
    <g transform="scale(1,-1)">
      {rooms.map((room) => {
        const selected = selectedRoomKey === room.roomKey;
        const dimmed = hasSelectedRoom && !selected;
        const roomName = String(roomSettings[room.roomKey]?.roomName || '').trim();
        const label = roomName ? `${room.sortOrder}. ${roomName}` : `${room.sortOrder}`;
        const selectedOutlinePoints =
          selected && selectedOffsetDistance > 0
            ? expandedRoomRectangle(room.points, selectedOffsetDistance)
            : room.points;
        return (
          <g key={room.roomKey}>
            <polygon
              points={pointList(room.points)}
              fill={
                selected
                  ? 'rgba(37,99,235,0.075)'
                  : dimmed
                    ? 'rgba(100,116,139,0.17)'
                    : editable
                      ? 'rgba(59,130,246,0.055)'
                      : 'transparent'
              }
              stroke={
                selected
                  ? 'transparent'
                  : dimmed
                    ? '#94a3b8'
                    : editable
                      ? '#60a5fa'
                      : 'transparent'
              }
              strokeWidth={Math.max(baseStrokeWidth * (dimmed ? 0.72 : 1), dimmed ? 0.65 : 0.9)}
              strokeDasharray={dimmed ? '6 6' : editable && !selected ? '7 5' : undefined}
              opacity={dimmed ? 0.92 : 1}
              vectorEffect="non-scaling-stroke"
              pointerEvents={editable ? 'all' : 'none'}
              onClick={(event) => {
                if (!editable || !onRoomSelect) return;
                event.preventDefault();
                event.stopPropagation();
                onRoomSelect(room.roomKey);
              }}
              style={{ cursor: editable ? 'pointer' : 'default' }}
            />
            {selected && (
              <polygon
                points={pointList(selectedOutlinePoints)}
                fill="none"
                stroke="#2563eb"
                strokeWidth={Math.max(baseStrokeWidth * 1.05, 0.95)}
                strokeDasharray="7 6"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {(showLabels || editable) && (
              <g
                pointerEvents="none"
                opacity={dimmed ? 0.78 : 1}
                transform={`translate(${room.center.x} ${room.center.y}) scale(1,-1) translate(${-room.center.x} ${-room.center.y})`}
              >
                <rect
                  x={room.center.x - Math.max(180, label.length * 58)}
                  y={room.center.y - 105}
                  width={Math.max(360, label.length * 116)}
                  height={210}
                  rx={45}
                  fill={selected ? '#2563eb' : dimmed ? 'rgba(226,232,240,0.94)' : 'rgba(255,255,255,0.90)'}
                  stroke={selected ? '#1d4ed8' : dimmed ? '#94a3b8' : '#94a3b8'}
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={room.center.x}
                  y={room.center.y + 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={selected ? '#ffffff' : dimmed ? '#475569' : '#0f172a'}
                  fontSize="132"
                  fontWeight="800"
                  vectorEffect="non-scaling-stroke"
                >
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}


function OpeningOverlay({
  openings = [],
  selectedOpeningKey = '',
  emphasizedOpeningKeys = null,
  dimUnemphasized = false,
  onOpeningSelect = null,
  editable = false,
  baseStrokeWidth = 1,
}) {
  if (!openings.length) return null;
  const markerSize = Math.max(110, baseStrokeWidth * 95);
  const emphasizedOpeningKeySet = Array.isArray(emphasizedOpeningKeys)
    ? new Set(emphasizedOpeningKeys)
    : null;
  return (
    <g transform="scale(1,-1)">
      {openings.map((opening) => {
        const selected = selectedOpeningKey === opening.openingKey;
        const emphasized = selected || !dimUnemphasized || !emphasizedOpeningKeySet
          || emphasizedOpeningKeySet.has(opening.openingKey);
        const center = opening.center || {
          x: (Number(opening.start?.x || 0) + Number(opening.end?.x || 0)) / 2,
          y: (Number(opening.start?.y || 0) + Number(opening.end?.y || 0)) / 2,
        };
        const label = opening.openingName || '공제';
        const hitWidth = Math.max(markerSize * 2.2, label.length * markerSize * 0.62);
        const hitHeight = markerSize * 1.15;

        return (
          <g
            key={opening.openingKey}
            onClick={(event) => {
              if (!editable || !onOpeningSelect) return;
              event.preventDefault();
              event.stopPropagation();
              onOpeningSelect(opening.openingKey);
            }}
            style={{ cursor: editable ? 'pointer' : 'default' }}
          >
            {editable && (
              <rect
                x={center.x - hitWidth / 2}
                y={center.y - hitHeight / 2}
                width={hitWidth}
                height={hitHeight}
                fill="transparent"
                pointerEvents="all"
              />
            )}
            <g
              pointerEvents="none"
              transform={`translate(${center.x} ${center.y}) scale(1,-1) translate(${-center.x} ${-center.y})`}
            >
              <text
                x={center.x}
                y={center.y + markerSize * 0.12}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={selected ? '#b91c1c' : emphasized ? '#dc2626' : '#94a3b8'}
                stroke="#ffffff"
                strokeWidth={selected ? '4' : emphasized ? '3' : '2.4'}
                opacity={emphasized ? 1 : 0.82}
                paintOrder="stroke"
                vectorEffect="non-scaling-stroke"
                fontSize={markerSize * 0.62}
                fontWeight={emphasized ? '900' : '800'}
              >
                {label}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

function MeasurementMagnifier({
  centerPoint,
  snapPointValue,
  currentPoints,
  entities,
  selectedLayer,
  highlightedLayers = [],
  highlightedLayerColors = {},
  baseStrokeWidth,
  displayMode,
  currentViewBox,
  canvasPixelSize,
  patternId,
}) {
  if (!centerPoint) return null;

  const lensPixels = 210;
  const magnification = 5.5;
  const modelWidth = Math.max(
    120,
    (currentViewBox.width / Math.max(1, canvasPixelSize.width)) * lensPixels / magnification,
  );
  const modelHeight = Math.max(
    120,
    (currentViewBox.height / Math.max(1, canvasPixelSize.height)) * lensPixels / magnification,
  );
  const lensViewBox = {
    x: centerPoint.x - modelWidth / 2,
    y: -centerPoint.y - modelHeight / 2,
    width: modelWidth,
    height: modelHeight,
  };
  const markerSize = Math.max(modelWidth, modelHeight) * 0.072;
  const crosshairSize = Math.max(modelWidth, modelHeight) * 0.075;
  const draftPoints = snapPointValue && currentPoints.length
    ? [...currentPoints, snapPointValue]
    : currentPoints;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        zIndex: 8,
        top: 10,
        right: 10,
        width: lensPixels,
        height: lensPixels,
        border: '4px solid #ffffff',
        outline: '2px solid #0f172a',
        bgcolor: '#ffffff',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={viewBoxString(lensViewBox)}
        preserveAspectRatio="xMidYMid meet"
        aria-label="측정점 확대 보기"
      >
        <defs>
          <pattern
            id={patternId}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="16" height="16" fill="rgba(255,255,255,0.12)" />
            <line x1="0" y1="0" x2="0" y2="16" stroke="#4b5563" strokeWidth="1" opacity="0.55" />
            <line x1="8" y1="0" x2="8" y2="16" stroke="#9ca3af" strokeWidth="0.7" opacity="0.42" />
          </pattern>
        </defs>
        <DrawingEntityScene
          entities={entities}
          selectedLayer={selectedLayer}
          highlightedLayers={highlightedLayers}
          highlightedLayerColors={highlightedLayerColors}
          baseStrokeWidth={baseStrokeWidth}
          patternId={patternId}
          displayMode={displayMode}
        />
        <g transform="scale(1,-1)" pointerEvents="none">
          {draftPoints.length > 1 && (
            <polyline
              points={pointList(removeConsecutiveDuplicatePoints(draftPoints))}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="2"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <line
            x1={centerPoint.x - crosshairSize}
            y1={centerPoint.y}
            x2={centerPoint.x + crosshairSize}
            y2={centerPoint.y}
            stroke="#0f172a"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={centerPoint.x}
            y1={centerPoint.y - crosshairSize}
            x2={centerPoint.x}
            y2={centerPoint.y + crosshairSize}
            stroke="#0f172a"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={centerPoint.x}
            cy={centerPoint.y}
            r={crosshairSize * 0.62}
            fill="none"
            stroke="#0f172a"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <SnapMarker point={snapPointValue} size={markerSize} showLabel />
        </g>
      </svg>
      <Box
        sx={{
          position: 'absolute',
          left: 5,
          top: 5,
          px: 0.65,
          py: 0.25,
          borderRadius: 0.75,
          bgcolor: 'rgba(15,23,42,0.82)',
          color: '#ffffff',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        측정점 확대 {snapPointValue?.snapped ? `· ${snapPointValue.snapType}` : ''}
      </Box>
    </Paper>
  );
}

function DrawingCanvas({
  analysis,
  heightSettings,
  selectedLayer = '',
  highlightedLayers = [],
  highlightedLayerColors = {},
  interactive = false,
  displayMode = 'view',
  tooltipEnabled = false,
  rooms = [],
  roomSettings = {},
  selectedRoomKey = '',
  onRoomSelect = null,
  roomEditable = false,
  showRoomLabels = false,
  openings = [],
  selectedOpeningKey = '',
  emphasizedOpeningKeys = null,
  dimUnemphasizedOpenings = false,
  onOpeningSelect = null,
  openingEditable = false,
  captureMode = false,
  captureKind = '창호',
  capturePoints = [],
  onCapturePointsChange = null,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const fittedViewBox = useMemo(() => getFittedViewBox(analysis.bounds), [analysis.bounds]);
  const [currentViewBox, setCurrentViewBox] = useState(fittedViewBox);
  const [tooltip, setTooltip] = useState(null);
  const [toolMode, setToolMode] = useState(captureMode ? 'capture' : 'pan');
  const [measurements, setMeasurements] = useState([]);
  const [currentMeasurementPoints, setCurrentMeasurementPoints] = useState([]);
  const [hoverMeasurePoint, setHoverMeasurePoint] = useState(null);
  const [hoverRawPoint, setHoverRawPoint] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canvasPixelSize, setCanvasPixelSize] = useState({ width: 1, height: 1 });
  const patternId = useMemo(() => `concrete-hatch-${Math.random().toString(36).slice(2)}`, []);
  const magnifierPatternId = useMemo(
    () => `concrete-hatch-magnifier-${Math.random().toString(36).slice(2)}`,
    [],
  );

  const renderedEntities = useMemo(
    () => dedupeSelectedLayerEntities(analysis.entities || [], selectedLayer, highlightedLayers),
    [analysis.entities, highlightedLayers, selectedLayer],
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomKey === selectedRoomKey) || null,
    [rooms, selectedRoomKey],
  );
  const roomClipId = useMemo(
    () => `room-process-clip-${Math.random().toString(36).slice(2)}`,
    [],
  );

  const selectedEntities = useMemo(
    () =>
      selectedLayer
        ? renderedEntities.filter((entity) => String(entity.layer || '').trim() === selectedLayer)
        : [],
    [renderedEntities, selectedLayer],
  );

  const roomSelectedEntities = useMemo(
    () =>
      buildRoomProcessHighlightEntities({
        analysis,
        rooms,
        selectedRoomKey: selectedRoom?.roomKey || '',
        layerNames: [selectedLayer, ...(Array.isArray(highlightedLayers) ? highlightedLayers : [])],
      }),
    [analysis, highlightedLayers, rooms, selectedLayer, selectedRoom?.roomKey],
  );

  const snapPoints = useMemo(
    () => buildEndpointSnapPoints(analysis.entities || []),
    [analysis.entities],
  );

  const snapSegments = useMemo(
    () => buildSnapSegments(analysis.entities || []),
    [analysis.entities],
  );

  useEffect(() => {
    setCurrentViewBox(fittedViewBox);
    setTooltip(null);
    setToolMode(captureMode ? 'capture' : 'pan');
    setMeasurements([]);
    setCurrentMeasurementPoints([]);
    setHoverMeasurePoint(null);
    setHoverRawPoint(null);
    setIsDragging(false);
  }, [captureMode, fittedViewBox]);

  useEffect(() => {
    setTooltip(null);
  }, [selectedLayer]);

  useEffect(() => {
    if (!interactive || !svgRef.current) return undefined;
    const svg = svgRef.current;
    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      setCanvasPixelSize((previous) => {
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        return previous.width === width && previous.height === height
          ? previous
          : { width, height };
      });
    };
    updateSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(svg);
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [interactive]);

  useEffect(() => {
    if (!interactive) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      const tagName = String(target?.tagName || '').toUpperCase();
      const isFormEditing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) ||
        Boolean(target?.isContentEditable) ||
        Boolean(target?.closest?.('[contenteditable="true"]'));
      if (isFormEditing) return;

      if (event.key === 'Escape' && toolMode !== 'pan') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (captureMode) onCapturePointsChange?.([]);
        else setCurrentMeasurementPoints([]);
        setHoverMeasurePoint(null);
        setHoverRawPoint(null);
      } else if (event.key === 'Backspace' && captureMode) {
        event.preventDefault();
        event.stopPropagation();
        onCapturePointsChange?.(capturePoints.slice(0, -1));
      } else if (event.key === 'Backspace' && toolMode === 'continuous') {
        event.preventDefault();
        event.stopPropagation();
        setCurrentMeasurementPoints((previous) => previous.slice(0, -1));
      } else if (event.key === 'Enter' && toolMode === 'continuous') {
        event.preventDefault();
        event.stopPropagation();
        setCurrentMeasurementPoints((previous) => {
          const cleaned = removeConsecutiveDuplicatePoints(previous);
          if (cleaned.length >= 2) {
            setMeasurements((stored) => [...stored, { points: cleaned }]);
          }
          return [];
        });
        setHoverMeasurePoint(null);
        setHoverRawPoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [captureMode, capturePoints, interactive, onCapturePointsChange, toolMode]);

  const baseStrokeWidth = Math.max(
    0.7,
    Math.max(analysis.bounds.width, analysis.bounds.height) / 5200,
  );
  const modelUnitsPerPixel = Math.max(
    currentViewBox.width / Math.max(1, canvasPixelSize.width),
    currentViewBox.height / Math.max(1, canvasPixelSize.height),
  );
  const snapMarkerSize = Math.max(0.001, modelUnitsPerPixel * 7.5);

  const zoomAtCenter = (factor) => {
    setCurrentViewBox((previous) => {
      const width = previous.width * factor;
      const height = previous.height * factor;
      return {
        x: previous.x + (previous.width - width) / 2,
        y: previous.y + (previous.height - height) / 2,
        width,
        height,
      };
    });
  };

  const screenToDxfPoint = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const transformed = svgPoint.matrixTransform(screenMatrix.inverse());
    return { x: transformed.x, y: -transformed.y };
  }, []);

  const modelToleranceFromPixels = useCallback(
    (pixelTolerance = 12) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return Number.POSITIVE_INFINITY;
      return (
        Math.max(
          currentViewBox.width / Math.max(1, rect.width),
          currentViewBox.height / Math.max(1, rect.height),
        ) * pixelTolerance
      );
    },
    [currentViewBox],
  );

  const activeMeasurementPoints = captureMode ? capturePoints : currentMeasurementPoints;

  const snapPoint = useCallback(
    (rawPoint) => {
      if (!rawPoint) return null;
      const tolerance = modelToleranceFromPixels(18);
      const candidates = [];

      snapPoints.forEach((candidate) => {
        const distance = distanceBetweenPoints(rawPoint, candidate);
        if (distance <= tolerance) {
          candidates.push({
            x: candidate.x,
            y: candidate.y,
            distance,
            priority: 0,
            snapType: '끝점',
            snapAngle: 0,
          });
        }
      });

      const previousPoint = activeMeasurementPoints[activeMeasurementPoints.length - 1];
      if (previousPoint) {
        snapSegments.forEach((segment) => {
          const projected = projectPointToSegment(previousPoint, segment.start, segment.end);
          if (projected.ratio <= 0.001 || projected.ratio >= 0.999) return;
          const cursorDistance = distanceBetweenPoints(rawPoint, projected);
          if (cursorDistance <= tolerance) {
            candidates.push({
              x: projected.x,
              y: projected.y,
              distance: cursorDistance,
              priority: 1,
              snapType: '직각',
              snapAngle: segment.angle,
            });
          }
        });
      }

      // 선의 끝점이 아니더라도 커서에서 가장 가까운 선 위 지점을 선택할 수 있게 한다.
      snapSegments.forEach((segment) => {
        const projected = projectPointToSegment(rawPoint, segment.start, segment.end);
        if (projected.ratio <= 0.001 || projected.ratio >= 0.999) return;
        if (projected.distance <= tolerance) {
          candidates.push({
            x: projected.x,
            y: projected.y,
            distance: projected.distance,
            priority: 2,
            snapType: '근처점',
            snapAngle: segment.angle,
          });
        }
      });

      // 연속 측정의 세 번째 점 이후에는 첫 점으로 정확히 닫을 수 있게 한다.
      if (toolMode === 'continuous' && activeMeasurementPoints.length >= 3) {
        const firstPoint = activeMeasurementPoints[0];
        const closingDistance = distanceBetweenPoints(rawPoint, firstPoint);
        if (closingDistance <= tolerance * 1.15) {
          candidates.push({
            x: firstPoint.x,
            y: firstPoint.y,
            distance: closingDistance,
            priority: -1,
            snapType: '닫힘',
            snapAngle: 0,
          });
        }
      }

      candidates.sort((left, right) => {
        const leftScore = left.distance + left.priority * tolerance * 0.12;
        const rightScore = right.distance + right.priority * tolerance * 0.12;
        return leftScore - rightScore;
      });
      const nearest = candidates[0];
      return nearest
        ? {
            x: nearest.x,
            y: nearest.y,
            snapped: true,
            snapType: nearest.snapType,
            snapAngle: nearest.snapAngle,
          }
        : { ...rawPoint, snapped: false };
    },
    [activeMeasurementPoints, modelToleranceFromPixels, snapPoints, snapSegments, toolMode],
  );

  const showNearestEntityTooltip = useCallback(
    (event) => {
      if (!tooltipEnabled || !selectedLayer || toolMode !== 'pan') {
        setTooltip(null);
        return;
      }
      const point = screenToDxfPoint(event);
      if (!point) return;
      const tolerance = modelToleranceFromPixels(14);
      if (
        selectedRoom &&
        !isPointInsidePolygon(point, selectedRoom.points || []) &&
        polygonBoundaryDistance(point, selectedRoom.points || []) > tolerance
      ) {
        setTooltip(null);
        return;
      }
      let nearestEntity = null;
      let nearestDistance = tolerance;
      selectedEntities.forEach((entity) => {
        const distance = distanceToEntity(point, entity);
        if (distance <= nearestDistance) {
          nearestDistance = distance;
          nearestEntity = entity;
        }
      });
      const entityTooltip = nearestEntity ? buildEntityTooltip(nearestEntity, heightSettings) : null;
      setTooltip(
        entityTooltip
          ? { ...entityTooltip, x: event.clientX + 14, y: event.clientY + 14 }
          : null,
      );
    },
    [
      heightSettings,
      modelToleranceFromPixels,
      screenToDxfPoint,
      selectedEntities,
      selectedLayer,
      selectedRoom,
      toolMode,
      tooltipEnabled,
    ],
  );

  const handleWheel = (event) => {
    if (!interactive) return;
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY > 0 ? 1.14 : 0.86;

    setCurrentViewBox((previous) => {
      const ratioX = (event.clientX - rect.left) / Math.max(1, rect.width);
      const ratioY = (event.clientY - rect.top) / Math.max(1, rect.height);
      const width = previous.width * factor;
      const height = previous.height * factor;
      return {
        x: previous.x + (previous.width - width) * ratioX,
        y: previous.y + (previous.height - height) * ratioY,
        width,
        height,
      };
    });
  };

  const addMeasurementPoint = (point) => {
    if (!point) return;
    if (captureMode) {
      const previous = Array.isArray(capturePoints) ? capturePoints : [];
      const next = previous.length >= 2 ? [point] : removeConsecutiveDuplicatePoints([...previous, point]);
      onCapturePointsChange?.(next.slice(0, 2));
      setHoverMeasurePoint(null);
      setHoverRawPoint(null);
      return;
    }
    if (toolMode === 'distance') {
      setCurrentMeasurementPoints((previous) => {
        if (!previous.length) return [point];
        const cleaned = removeConsecutiveDuplicatePoints([previous[0], point]);
        if (cleaned.length >= 2) {
          setMeasurements((stored) => [...stored, { points: cleaned }]);
        }
        return [];
      });
      setHoverMeasurePoint(null);
      setHoverRawPoint(null);
      return;
    }
    if (toolMode === 'continuous') {
      setCurrentMeasurementPoints((previous) => {
        if (previous.length && distanceBetweenPoints(previous[previous.length - 1], point) <= 0.001) {
          return previous;
        }
        return [...previous, point];
      });
    }
  };

  const handlePointerDown = (event) => {
    if (!interactive || ![0, 1].includes(event.button)) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      button: event.button,
      x: event.clientX,
      y: event.clientY,
      viewBox: currentViewBox,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (interactive && drag && drag.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      const movedDistance = Math.hypot(deltaX, deltaY);

      if (!drag.moved && movedDistance >= 4) {
        drag.moved = true;
        setIsDragging(true);
      }

      if (drag.moved) {
        setCurrentViewBox({
          ...drag.viewBox,
          x: drag.viewBox.x - (deltaX / Math.max(1, drag.width)) * drag.viewBox.width,
          y: drag.viewBox.y - (deltaY / Math.max(1, drag.height)) * drag.viewBox.height,
        });
        setTooltip(null);
        setHoverMeasurePoint(null);
        setHoverRawPoint(null);
        return;
      }
    }

    if (interactive && toolMode !== 'pan') {
      const rawPoint = screenToDxfPoint(event);
      setHoverRawPoint(rawPoint);
      setHoverMeasurePoint(snapPoint(rawPoint));
      setTooltip(null);
      return;
    }

    showNearestEntityTooltip(event);
  };

  const cancelDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    // 측정 모드에서도 좌클릭을 누른 채 움직이면 이동, 짧게 클릭하면 측정점 지정이다.
    if ((toolMode !== 'pan' || captureMode) && drag.button === 0 && !drag.moved) {
      event.preventDefault();
      const rawPoint = screenToDxfPoint(event);
      const measuredPoint = snapPoint(rawPoint);
      addMeasurementPoint(measuredPoint);
      setHoverRawPoint(rawPoint);
      setHoverMeasurePoint(measuredPoint);
    }
  };

  const completeContinuousMeasurement = () => {
    if (toolMode !== 'continuous') return;
    setCurrentMeasurementPoints((previous) => {
      const cleaned = removeConsecutiveDuplicatePoints(previous);
      if (cleaned.length >= 2) setMeasurements((stored) => [...stored, { points: cleaned }]);
      return [];
    });
    setHoverMeasurePoint(null);
    setHoverRawPoint(null);
  };

  const changeToolMode = (nextMode) => {
    dragRef.current = null;
    setIsDragging(false);
    setToolMode(nextMode);
    setCurrentMeasurementPoints([]);
    setHoverMeasurePoint(null);
    setHoverRawPoint(null);
    setTooltip(null);
  };

  const cursor = !interactive
    ? 'default'
    : isDragging
      ? 'grabbing'
      : toolMode === 'pan'
        ? 'grab'
        : 'crosshair';

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        bgcolor: '#ffffff',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {interactive && (
        <Box
          sx={{
            position: 'absolute',
            zIndex: 3,
            top: 10,
            left: 10,
            display: 'flex',
            gap: 0.5,
            flexWrap: 'wrap',
            bgcolor: 'rgba(255,255,255,0.94)',
            p: 0.5,
            borderRadius: 1,
            border: '1px solid #cbd5e1',
            maxWidth: toolMode === 'pan' ? 'calc(100% - 20px)' : 'calc(100% - 240px)',
          }}
        >
          {captureMode ? (
            <>
              <Button size="small" variant="contained">{captureKind} 위치 두 점 지정</Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  onCapturePointsChange?.([]);
                  setHoverMeasurePoint(null);
                  setHoverRawPoint(null);
                }}
              >
                다시 지정
              </Button>
            </>
          ) : (
            <>
              <Button
                size="small"
                variant={toolMode === 'pan' ? 'contained' : 'outlined'}
                onClick={() => changeToolMode('pan')}
              >
                이동
              </Button>
              <Button
                size="small"
                variant={toolMode === 'distance' ? 'contained' : 'outlined'}
                onClick={() => changeToolMode('distance')}
              >
                거리 측정
              </Button>
              <Button
                size="small"
                variant={toolMode === 'continuous' ? 'contained' : 'outlined'}
                onClick={() => changeToolMode('continuous')}
              >
                연속, 면적측정
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setMeasurements([]);
                  setCurrentMeasurementPoints([]);
                  setHoverMeasurePoint(null);
                  setHoverRawPoint(null);
                }}
              >
                측정 초기화
              </Button>
            </>
          )}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Button size="small" variant="outlined" onClick={() => zoomAtCenter(0.8)}>확대</Button>
          <Button size="small" variant="outlined" onClick={() => zoomAtCenter(1.25)}>축소</Button>
          <Button size="small" variant="outlined" onClick={() => setCurrentViewBox(fittedViewBox)}>맞춤</Button>
        </Box>
      )}

      {interactive && toolMode !== 'pan' && (
        <Paper
          variant="outlined"
          sx={{
            position: 'absolute',
            zIndex: 3,
            left: 10,
            top: 58,
            px: 1,
            py: 0.5,
            bgcolor: 'rgba(255,255,255,0.94)',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {captureMode
              ? `${captureKind}의 좌우 끝점을 순서대로 선택 · 끝점·근처점·직각 스냅 · ESC/Backspace 다시 지정`
              : `끝점·근처점·직각 스냅 · ${toolMode === 'continuous' ? '첫 점으로 닫으면 면적 표시 · Enter/더블클릭 완료 · Backspace 마지막점 취소 · ' : ''}ESC 현재 측정만 취소`}
          </Typography>
        </Paper>
      )}

      {interactive && toolMode !== 'pan' && hoverRawPoint && (
        <MeasurementMagnifier
          centerPoint={hoverRawPoint}
          snapPointValue={hoverMeasurePoint}
          currentPoints={activeMeasurementPoints}
          entities={renderedEntities}
          selectedLayer={selectedLayer}
          highlightedLayers={highlightedLayers}
          highlightedLayerColors={highlightedLayerColors}
          baseStrokeWidth={baseStrokeWidth}
          displayMode={displayMode}
          currentViewBox={currentViewBox}
          canvasPixelSize={canvasPixelSize}
          patternId={magnifierPatternId}
        />
      )}

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBoxString(currentViewBox)}
        preserveAspectRatio="xMidYMid meet"
        aria-label="DXF 도면"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelDrag}
        onDoubleClick={completeContinuousMeasurement}
        onAuxClick={(event) => event.preventDefault()}
        onPointerLeave={() => {
          // 드래그 중에는 pointer capture를 유지하여 도면 밖으로 나가도 이동이 끊기지 않게 한다.
          if (dragRef.current) return;
          setTooltip(null);
          if (toolMode !== 'pan') {
            setHoverMeasurePoint(null);
            setHoverRawPoint(null);
          }
        }}
        style={{ cursor, touchAction: 'none' }}
      >
        <defs>
          {selectedRoom && (selectedLayer || highlightedLayers.length > 0) && (
            <clipPath id={roomClipId} clipPathUnits="userSpaceOnUse">
              <polygon
                points={pointList(
                  (selectedRoom.points || []).map((point) => ({
                    x: point.x,
                    y: -point.y,
                  })),
                )}
              />
            </clipPath>
          )}
          <pattern
            id={patternId}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="16" height="16" fill="rgba(255,255,255,0.12)" />
            <line x1="0" y1="0" x2="0" y2="16" stroke="#4b5563" strokeWidth="1" opacity="0.55" />
            <line x1="8" y1="0" x2="8" y2="16" stroke="#9ca3af" strokeWidth="0.7" opacity="0.42" />
          </pattern>
        </defs>
        <DrawingEntityScene
          entities={renderedEntities}
          selectedLayer={selectedLayer}
          highlightedLayers={highlightedLayers}
          highlightedLayerColors={highlightedLayerColors}
          baseStrokeWidth={baseStrokeWidth}
          patternId={patternId}
          displayMode={displayMode}
          selectedRoomPoints={selectedRoom?.points || []}
          roomClipId={roomClipId}
          roomSelectedEntities={roomSelectedEntities}
        />
        <RoomOverlay
          rooms={rooms}
          roomSettings={roomSettings}
          selectedRoomKey={selectedRoomKey}
          onRoomSelect={onRoomSelect}
          editable={roomEditable}
          showLabels={showRoomLabels}
          baseStrokeWidth={baseStrokeWidth}
          selectedOffsetDistance={modelUnitsPerPixel * 14}
        />
        <OpeningOverlay
          openings={openings}
          selectedOpeningKey={selectedOpeningKey}
          emphasizedOpeningKeys={emphasizedOpeningKeys}
          dimUnemphasized={dimUnemphasizedOpenings}
          onOpeningSelect={onOpeningSelect}
          editable={openingEditable}
          baseStrokeWidth={baseStrokeWidth}
        />
        {interactive && (
          <g transform="scale(1,-1)">
            <MeasurementOverlay
              measurements={captureMode && capturePoints.length >= 2 ? [{ points: capturePoints }] : measurements}
              currentPoints={captureMode && capturePoints.length < 2 ? capturePoints : currentMeasurementPoints}
              hoverPoint={hoverMeasurePoint}
              baseStrokeWidth={baseStrokeWidth}
              bounds={analysis.bounds}
              markerSize={snapMarkerSize}
            />
          </g>
        )}
      </svg>

      {tooltipEnabled && tooltip && (
        <Paper
          elevation={5}
          sx={{
            position: 'fixed',
            zIndex: 1500,
            left: tooltip.x,
            top: tooltip.y,
            pointerEvents: 'none',
            px: 1.25,
            py: 0.8,
            maxWidth: 360,
            border: '1px solid #94a3b8',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
            {tooltip.title}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
            {tooltip.text}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

function DxfPreview({
  analysis,
  heightSettings,
  onOpenView,
  rooms = [],
  roomSettings = {},
  openings = [],
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
            도면 VIEW
          </Typography>
          <Typography variant="caption" color="text.secondary">
            미리보기에서는 설정할 수 없습니다. 도면을 클릭해 실 설정·공제면적 설정·실별 공정 물량확인을 진행합니다.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip size="small" label={`전체 ${formatInteger(analysis.totalObjectCount)}개`} />
          <Button size="small" variant="contained" onClick={onOpenView}>
            도면 VIEW 열기
          </Button>
        </Box>
      </Box>

      <Box
        onClick={onOpenView}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onOpenView();
        }}
        sx={{
          height: { xs: 430, lg: 580 },
          minHeight: 320,
          border: '1px solid #cbd5e1',
          borderRadius: 1,
          bgcolor: '#ffffff',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          outline: 'none',
          '&:focus-visible': {
            boxShadow: '0 0 0 3px rgba(37,99,235,0.25)',
          },
          '& .drawing-preview-open-hint': {
            opacity: 0,
            transform: 'translate(-50%, -44%)',
            transition: 'opacity 140ms ease, transform 140ms ease',
          },
          '&:hover .drawing-preview-open-hint, &:focus-visible .drawing-preview-open-hint': {
            opacity: 1,
            transform: 'translate(-50%, -50%)',
          },
        }}
      >
        <DrawingCanvas
          analysis={analysis}
          heightSettings={heightSettings}
          displayMode="preview"
          tooltipEnabled={false}
          rooms={rooms}
          roomSettings={roomSettings}
          showRoomLabels
          openings={openings}
        />
        <Paper
          className="drawing-preview-open-hint"
          elevation={4}
          sx={{
            position: 'absolute',
            zIndex: 4,
            left: '50%',
            top: '50%',
            px: 1.75,
            py: 0.9,
            borderRadius: 5,
            bgcolor: 'rgba(15,23,42,0.88)',
            color: '#ffffff',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}>
            클릭해 통합 도면 VIEW 열기
          </Typography>
        </Paper>
      </Box>
    </Paper>
  );
}


function OpeningEditorDialog({
  open,
  onClose,
  analysis,
  heightSettings,
  rooms = [],
  roomSettings = {},
  initialRoomKey = '',
  processLayers = [],
  existingOpenings = [],
  opening,
  onConfirm,
}) {
  const [roomKey, setRoomKey] = useState(initialRoomKey);
  const [openingName, setOpeningName] = useState('');
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [appliedLayers, setAppliedLayers] = useState([]);
  const [layerToAdd, setLayerToAdd] = useState('');
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [selectedScheduleKey, setSelectedScheduleKey] = useState('');
  const autoCandidateKeyRef = useRef('');

  const scheduleCandidates = useMemo(
    () => extractScheduleDeductionCandidates(analysis, rooms),
    [analysis, rooms],
  );
  const matchedScheduleCandidate = useMemo(() => {
    if (!opening || !isScheduleDeductionItem(opening)) return null;
    const byKey = scheduleCandidates.find((candidate) => candidate.openingKey === opening.openingKey);
    if (byKey) return byKey;
    return scheduleCandidates.find(
      (candidate) =>
        candidate.openingName === opening.openingName &&
        Math.abs(Number(candidate.widthMm || 0) - Number(opening.widthMm || 0)) < 1 &&
        Math.abs(Number(candidate.heightMm || 0) - Number(opening.heightMm || 0)) < 1,
    ) || null;
  }, [opening, scheduleCandidates]);
  const selectedScheduleCandidate = useMemo(
    () => scheduleCandidates.find((candidate) => candidate.openingKey === selectedScheduleKey) || null,
    [scheduleCandidates, selectedScheduleKey],
  );
  const selectedRegisteredOpening = useMemo(
    () => existingOpenings.find((item) => item.openingKey === selectedScheduleKey) || null,
    [existingOpenings, selectedScheduleKey],
  );
  const effectiveOpening = opening || selectedRegisteredOpening;
  const activeScheduleCandidate = selectedScheduleCandidate || matchedScheduleCandidate;
  const scheduleItem = Boolean(activeScheduleCandidate || (opening && isScheduleDeductionItem(opening)));
  const existingOpeningKeys = useMemo(
    () => new Set(existingOpenings.map((item) => item.openingKey)),
    [existingOpenings],
  );

  useEffect(() => {
    if (!open) return;
    const nextRoomKey = opening?.roomKey || initialRoomKey || rooms[0]?.roomKey || '';
    setRoomKey(nextRoomKey);
    setOpeningName(opening?.openingName || `공제${existingOpenings.length + 1}`);
    setWidthInput(opening?.widthMm ? String(opening.widthMm) : '');
    setHeightInput(opening?.heightMm ? String(opening.heightMm) : '');
    setQuantity(opening?.quantity ? String(opening.quantity) : '1');
    setAppliedLayers(opening?.appliedLayers || []);
    setLayerToAdd('');
    setSelectedScheduleKey(matchedScheduleCandidate?.openingKey || '');
    setSchedulePickerOpen(false);
    autoCandidateKeyRef.current = '';
  }, [existingOpenings.length, initialRoomKey, matchedScheduleCandidate, open, opening, rooms]);

  const selectedRoom = rooms.find((room) => room.roomKey === roomKey) || rooms[0];
  const selectedRoomName = String(roomSettings[selectedRoom?.roomKey]?.roomName || '').trim();
  const widthMm = parseDimensionInputMm(widthInput);
  const heightMm = parseDimensionInputMm(heightInput);
  const resolvedSegment = buildFallbackOpeningSegment({
    opening: effectiveOpening,
    candidate: activeScheduleCandidate,
    widthMm,
    room: selectedRoom,
  });
  const canDetectLayers = Boolean(
    activeScheduleCandidate || hasUsableOpeningSegment(effectiveOpening?.start, effectiveOpening?.end),
  );
  const detectionPoints = canDetectLayers ? [resolvedSegment.start, resolvedSegment.end] : [];
  const linkedRoomKeys = findAdjacentRoomKeysForOpening({
    point: resolvedSegment.center,
    widthMm,
    rooms,
    primaryRoomKey: selectedRoom?.roomKey || '',
  });
  const linkedRooms = linkedRoomKeys
    .map((key) => rooms.find((room) => room.roomKey === key))
    .filter(Boolean);
  const linkedRoomLabels = linkedRooms.map((room) => {
    const roomName = String(roomSettings[room.roomKey]?.roomName || '').trim() || '미입력';
    return `${room.sortOrder}. ${roomName}`;
  });

  const overlapCandidates = useMemo(
    () => buildOpeningLayerCandidates(analysis, processLayers, detectionPoints),
    [analysis, detectionPoints, processLayers],
  );
  const detectedLayerNames = useMemo(
    () => overlapCandidates.map((candidate) => candidate.layer),
    [overlapCandidates],
  );
  const detectedLayerSet = useMemo(() => new Set(detectedLayerNames), [detectedLayerNames]);

  useEffect(() => {
    if (!open || !detectedLayerNames.length) return;
    const automaticKey =
      activeScheduleCandidate?.openingKey ||
      effectiveOpening?.openingKey ||
      `manual-${selectedRoom?.roomKey || ''}-${openingName}`;
    if (autoCandidateKeyRef.current === automaticKey) return;
    autoCandidateKeyRef.current = automaticKey;
    if (!(effectiveOpening?.appliedLayers || []).length) setAppliedLayers(detectedLayerNames);
  }, [activeScheduleCandidate, detectedLayerNames, effectiveOpening, open, openingName, selectedRoom]);

  if (!analysis || !rooms.length) return null;

  const areaM2 = calculateOpeningAreaM2(widthMm, heightMm, quantity);
  const processLayerMap = new Map(processLayers.map((layer) => [layer.layer, layer]));
  const orderedAppliedLayers = processLayers
    .map((layer) => layer.layer)
    .filter((layerName) => appliedLayers.includes(layerName));
  const unknownAppliedLayers = appliedLayers.filter((layerName) => !processLayerMap.has(layerName));
  const visibleAppliedLayers = [...orderedAppliedLayers, ...unknownAppliedLayers];
  const appliedLayerColors = buildProcessHighlightColors(visibleAppliedLayers);
  const availableLayers = processLayers.filter((layer) => !appliedLayers.includes(layer.layer));

  const removeLayer = (layerName) => {
    setAppliedLayers((previous) => previous.filter((value) => value !== layerName));
  };

  const addLayer = () => {
    if (!layerToAdd) return;
    setAppliedLayers((previous) => (previous.includes(layerToAdd) ? previous : [...previous, layerToAdd]));
    setLayerToAdd('');
  };

  const applyDetectedLayers = () => {
    setAppliedLayers(detectedLayerNames);
    setLayerToAdd('');
  };

  const selectScheduleCandidate = (candidate) => {
    const registered = existingOpenings.find((item) => item.openingKey === candidate.openingKey) || null;
    const source = registered || candidate;
    setSelectedScheduleKey(candidate.openingKey);
    setOpeningName(source.openingName || candidate.openingName);
    setWidthInput(String(source.widthMm || candidate.widthMm));
    setHeightInput(String(source.heightMm || candidate.heightMm));
    setQuantity(String(source.quantity || candidate.quantity || 1));
    setRoomKey(source.roomKey || candidate.roomKey || rooms[0]?.roomKey || '');
    setAppliedLayers(Array.isArray(source.appliedLayers) ? source.appliedLayers : []);
    setLayerToAdd('');
    autoCandidateKeyRef.current = '';
    setSchedulePickerOpen(false);
  };

  const submit = () => {
    const count = Math.max(1, Math.floor(Number(quantity || 1)));
    if (!selectedRoom) return window.alert('공제항목을 연결할 기준 실을 선택해주세요.');
    if (!openingName.trim()) return window.alert('공제항목 명칭을 입력해주세요.');
    if (widthMm <= 0 || heightMm <= 0) {
      return window.alert('폭과 높이를 0보다 크게 입력해주세요. 0.9처럼 M 단위 또는 900처럼 mm 단위로 입력할 수 있습니다.');
    }

    const finalSegment = buildFallbackOpeningSegment({
      opening: effectiveOpening,
      candidate: activeScheduleCandidate,
      widthMm,
      room: selectedRoom,
    });
    const finalRoomKeys = findAdjacentRoomKeysForOpening({
      point: finalSegment.center,
      widthMm,
      rooms,
      primaryRoomKey: selectedRoom.roomKey,
    });

    onConfirm({
      openingId: effectiveOpening?.openingId || null,
      openingKey: effectiveOpening?.openingKey || activeScheduleCandidate?.openingKey || createUuid(),
      roomKey: selectedRoom.roomKey,
      roomKeys: finalRoomKeys.length ? finalRoomKeys : [selectedRoom.roomKey],
      openingType: effectiveOpening?.openingType || 'window',
      openingName: openingName.trim(),
      widthMm,
      heightMm,
      quantity: count,
      areaM2: calculateOpeningAreaM2(widthMm, heightMm, count),
      start: finalSegment.start,
      end: finalSegment.end,
      center: finalSegment.center,
      appliedLayers: visibleAppliedLayers,
    });
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen>
        <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0', py: 1.25 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                {effectiveOpening ? '도면 공제항목 수정' : '도면 공제항목 추가'} · {selectedRoomName || `실 ${selectedRoom?.sortOrder || ''}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                위치 두 점을 다시 지정하지 않습니다. 주기표 항목은 도면 위치를 그대로 사용하고, 수동 항목은 실·규격·공정만 입력합니다.
              </Typography>
            </Box>
            <Button variant="outlined" onClick={onClose}>닫기</Button>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
          <Box sx={{ height: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 390px' } }}>
            <Box sx={{ p: 1, minHeight: 0, bgcolor: '#f8fafc' }}>
              <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
                <DrawingCanvas
                  analysis={analysis}
                  heightSettings={heightSettings}
                  highlightedLayers={visibleAppliedLayers}
                  highlightedLayerColors={appliedLayerColors}
                  interactive
                  displayMode="view"
                  rooms={linkedRooms.length ? linkedRooms : [selectedRoom]}
                  roomSettings={Object.fromEntries(
                    (linkedRooms.length ? linkedRooms : [selectedRoom]).map((room) => [
                      room.roomKey,
                      roomSettings[room.roomKey] || { roomName: '' },
                    ]),
                  )}
                  selectedRoomKey={selectedRoom?.roomKey || ''}
                  showRoomLabels
                  openings={existingOpenings}
                  selectedOpeningKey={effectiveOpening?.openingKey || activeScheduleCandidate?.openingKey || ''}
                  emphasizedOpeningKeys={effectiveOpening?.openingKey ? [effectiveOpening.openingKey] : []}
                  dimUnemphasizedOpenings
                  captureMode={false}
                />
              </Paper>
            </Box>
            <Paper square elevation={0} sx={{ borderLeft: '1px solid #cbd5e1', p: 1.5, overflow: 'auto' }}>
              <TextField select fullWidth required size="small" label="기준 실" value={selectedRoom?.roomKey || ''} onChange={(event) => setRoomKey(event.target.value)} sx={{ mb: 1.2 }}>
                {rooms.map((room) => (
                  <MenuItem key={room.roomKey} value={room.roomKey}>
                    {room.sortOrder}. {String(roomSettings[room.roomKey]?.roomName || '').trim() || '미입력'}
                  </MenuItem>
                ))}
              </TextField>

              {linkedRoomLabels.length > 1 && (
                <Alert severity="info" sx={{ mb: 1.2 }}>
                  실 사이 공제항목으로 판단되어 <strong>{linkedRoomLabels.join(' + ')}</strong> 양쪽 실에 함께 반영됩니다.
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0.75, mb: 1.2 }}>
                <TextField
                  required
                  size="small"
                  label="명칭"
                  value={openingName}
                  onChange={(event) => setOpeningName(event.target.value)}
                  placeholder="예: PW-1, WD-1"
                />
                <Button variant="outlined" onClick={() => setSchedulePickerOpen(true)}>
                  창호목록 불러오기
                </Button>
              </Box>

              <TextField
                fullWidth
                required
                size="small"
                type="number"
                label="폭"
                value={widthInput}
                onChange={(event) => setWidthInput(event.target.value)}
                inputProps={{ min: 0.001, step: 0.01 }}
                helperText={scheduleItem ? '도면 주기표에서 자동으로 가져온 규격입니다.' : '0.9(M) 또는 900(mm)처럼 입력할 수 있습니다.'}
                sx={{ mb: 1.2 }}
              />
              <TextField
                fullWidth
                required
                size="small"
                type="number"
                label="높이"
                value={heightInput}
                onChange={(event) => setHeightInput(event.target.value)}
                inputProps={{ min: 0.001, step: 0.01 }}
                helperText="2.3(M) 또는 2300(mm)처럼 입력할 수 있습니다."
                sx={{ mb: 1.2 }}
              />
              <TextField fullWidth required size="small" type="number" label="개수" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputProps={{ min: 1, step: 1 }} InputProps={{ endAdornment: <Typography variant="caption">EA</Typography> }} sx={{ mb: 1.2 }} />

              {scheduleItem && (
                <Alert severity="info" sx={{ mb: 1.2 }}>
                  주기표의 명칭·규격·위치를 사용합니다. 별도의 두 점 지정 없이 실 연결과 공제 공정만 확인하면 됩니다.
                </Alert>
              )}
              <Alert severity={areaM2 > 0 ? 'success' : 'info'} sx={{ mb: 1.4 }}>
                공제면적: <strong>{formatNumber(areaM2)}㎡</strong> = 폭 {formatNumber(widthMm / 1000)}M × 높이 {formatNumber(heightMm / 1000)}M × {Math.max(1, Number(quantity || 1))}개
              </Alert>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>공제 적용 공정</Typography>
                <Button size="small" variant="outlined" onClick={applyDetectedLayers} disabled={!detectedLayerNames.length}>
                  주기 위치 공정 자동선택
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.85 }}>
                주기표 또는 기존 저장 위치 주변의 WL 공정을 후보로 표시합니다. 자동 감지가 없으면 필요한 공정을 아래에서 직접 추가하세요.
              </Typography>

              {visibleAppliedLayers.length ? (
                <Box sx={{ display: 'grid', gap: 0.65, mb: 1.1 }}>
                  {visibleAppliedLayers.map((layerName) => (
                    <Paper key={layerName} variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1, py: 0.7 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box aria-label={`${layerDisplayName(layerName)} 표시색`} sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: appliedLayerColors[layerName] || '#dc2626', border: '1px solid rgba(15,23,42,0.22)', flex: '0 0 auto' }} />
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{layerDisplayName(layerName)}</Typography>
                        </Box>
                        <Chip size="small" label={detectedLayerSet.has(layerName) ? '겹침 감지' : '수동 추가'} color={detectedLayerSet.has(layerName) ? 'primary' : 'default'} variant={detectedLayerSet.has(layerName) ? 'filled' : 'outlined'} sx={{ mt: 0.35, height: 20, fontSize: 11 }} />
                      </Box>
                      <Button size="small" color="error" onClick={() => removeLayer(layerName)}>삭제</Button>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mb: 1.1 }}>
                  자동 감지된 WL 공정이 없습니다. 필요한 공정은 아래에서 직접 추가해주세요.
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 0.75, mb: 1.5 }}>
                <TextField select size="small" label="공정 추가" value={layerToAdd} onChange={(event) => setLayerToAdd(event.target.value)} disabled={!availableLayers.length}>
                  {availableLayers.map((layer) => (
                    <MenuItem key={layer.layer} value={layer.layer}>
                      {layerDisplayName(layer.layer)}{detectedLayerSet.has(layer.layer) ? ' · 겹침 감지' : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <Button variant="outlined" onClick={addLayer} disabled={!layerToAdd}>추가</Button>
              </Box>

              <Button fullWidth variant="contained" onClick={submit}>적용</Button>
            </Paper>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={schedulePickerOpen} onClose={() => setSchedulePickerOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>창호목록 불러오기</DialogTitle>
        <DialogContent dividers>
          {scheduleCandidates.length ? (
            <Box sx={{ display: 'grid', gap: 0.75 }}>
              {scheduleCandidates.map((candidate) => {
                const alreadyRegistered = existingOpeningKeys.has(candidate.openingKey) && candidate.openingKey !== opening?.openingKey;
                const candidateRooms = getOpeningRoomKeys(candidate)
                  .map((key) => rooms.find((room) => room.roomKey === key))
                  .filter(Boolean)
                  .map((room) => `${room.sortOrder}. ${String(roomSettings[room.roomKey]?.roomName || '').trim() || '미입력'}`);
                return (
                  <Button
                    key={candidate.openingKey}
                    variant={selectedScheduleKey === candidate.openingKey ? 'contained' : 'outlined'}
                    onClick={() => selectScheduleCandidate(candidate)}
                    sx={{ justifyContent: 'space-between', textAlign: 'left', py: 1, px: 1.25 }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 900 }}>{candidate.openingName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatNumber(candidate.widthMm / 1000)}M × {formatNumber(candidate.heightMm / 1000)}M · {candidateRooms.join(' + ') || '실 자동판단'}
                      </Typography>
                    </Box>
                    <Chip size="small" label={alreadyRegistered ? '등록값 불러오기' : '선택'} color="primary" variant="outlined" />
                  </Button>
                );
              })}
            </Box>
          ) : (
            <Alert severity="info">도면에서 불러올 수 있는 창호·도어 주기표를 찾지 못했습니다.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSchedulePickerOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function RoomSettingsPanel({
  analysis,
  rooms,
  roomSettings,
  setRoomSettings,
  selectedRoomKey,
  setSelectedRoomKey,
  processLayers,
  heightSettings,
  loading,
  saving,
  onSave,
  openings = [],
  openingSaving = false,
  onAddOpening,
  onEditOpening,
  onDeleteOpening,
  onSaveOpenings,
  onImportSchedule,
}) {
  const selectedRoom = rooms.find((room) => room.roomKey === selectedRoomKey) || rooms[0] || null;
  const selectedSetting = selectedRoom ? roomSettings[selectedRoom.roomKey] || {} : {};
  const [selectedOpeningKey, setSelectedOpeningKey] = useState('');
  const [deductionExpanded, setDeductionExpanded] = useState(false);
  const selectedRoomOpenings = selectedRoom
    ? openings.filter((opening) => openingBelongsToRoom(opening, selectedRoom.roomKey))
    : [];

  useEffect(() => {
    if (!rooms.length) return;
    if (!rooms.some((room) => room.roomKey === selectedRoomKey)) {
      setSelectedRoomKey(rooms[0].roomKey);
    }
  }, [rooms, selectedRoomKey, setSelectedRoomKey]);

  useEffect(() => {
    setSelectedOpeningKey('');
  }, [selectedRoomKey]);

  const updateRoomName = (value) => {
    if (!selectedRoom) return;
    setRoomSettings((previous) => ({
      ...previous,
      [selectedRoom.roomKey]: {
        ...previous[selectedRoom.roomKey],
        roomName: value,
        deductions: previous[selectedRoom.roomKey]?.deductions || {},
      },
    }));
  };

  const updateDeduction = (layerName, value) => {
    if (!selectedRoom) return;
    setRoomSettings((previous) => ({
      ...previous,
      [selectedRoom.roomKey]: {
        ...previous[selectedRoom.roomKey],
        roomName: previous[selectedRoom.roomKey]?.roomName || '',
        deductions: {
          ...(previous[selectedRoom.roomKey]?.deductions || {}),
          [layerName]: value,
        },
      },
    }));
  };

  if (!rooms.length) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
          실명·공제면적 설정
        </Typography>
        <Alert severity="warning" sx={{ mt: 1 }}>
          폐합된 WL-실면적 폴리라인이 없어 실을 구분할 수 없습니다. 각 실의 전체 경계를 공제 없이 닫힌 PL로 작성해주세요.
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 1,
          mb: 1.25,
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            실명·공제면적 설정
          </Typography>
          <Typography variant="caption" color="text.secondary">
            이 화면에서는 실명과 직접 공제·도면 공제항목만 설정합니다. 실별 공정 물량은 도면 VIEW에서 확인합니다.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={onSaveOpenings} disabled={loading || openingSaving}>
            {openingSaving ? '저장 중' : '도면 공제항목 저장'}
          </Button>
          <Button variant="contained" onClick={onSave} disabled={loading || saving}>
            {saving ? '저장 중' : '실명·직접공제 저장'}
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(620px, 1.2fr) minmax(420px, 0.8fr)' },
          gap: 1.25,
          alignItems: 'stretch',
        }}
      >
        <Paper variant="outlined" sx={{ height: { xs: 430, xl: 560 }, overflow: 'hidden' }}>
          <DrawingCanvas
            analysis={analysis}
            heightSettings={heightSettings}
            displayMode="preview"
            tooltipEnabled={false}
            rooms={rooms}
            roomSettings={roomSettings}
            selectedRoomKey={selectedRoom?.roomKey || ''}
            onRoomSelect={setSelectedRoomKey}
            roomEditable
            showRoomLabels
            openings={openings}
            selectedOpeningKey={selectedOpeningKey}
            emphasizedOpeningKeys={selectedRoomOpenings.map((opening) => opening.openingKey)}
            dimUnemphasizedOpenings={Boolean(selectedRoom)}
            onOpeningSelect={setSelectedOpeningKey}
            openingEditable
          />
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.25, minWidth: 0, height: { xs: 'auto', xl: 560 }, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 0.65, flexWrap: 'wrap', mb: 1.25 }}>
            {rooms.map((room) => {
              const name = String(roomSettings[room.roomKey]?.roomName || '').trim();
              const selected = selectedRoom?.roomKey === room.roomKey;
              return (
                <Button
                  key={room.roomKey}
                  size="small"
                  variant={selected ? 'contained' : 'outlined'}
                  onClick={() => setSelectedRoomKey(room.roomKey)}
                  sx={{ textTransform: 'none' }}
                >
                  {room.sortOrder}. {name || '미입력'}
                </Button>
              );
            })}
          </Box>

          {selectedRoom && (
            <>
              <TextField
                fullWidth
                required
                size="small"
                label={`실 ${selectedRoom.sortOrder} 실명`}
                value={selectedSetting.roomName || ''}
                onChange={(event) => updateRoomName(event.target.value)}
                placeholder="예: 거실, 안방, 침실1"
                error={!String(selectedSetting.roomName || '').trim()}
                helperText={
                  String(selectedSetting.roomName || '').trim()
                    ? `실면적 ${formatNumber(selectedRoom.sourceAreaM2)}㎡`
                    : '필수입력'
                }
                sx={{ mb: 1.25 }}
              />

              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Button
                  fullWidth
                  onClick={() => setDeductionExpanded((previous) => !previous)}
                  sx={{ px: 1.25, py: 1, justifyContent: 'space-between', textTransform: 'none', color: 'text.primary' }}
                >
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>공제면적 설정</Typography>
                    <Typography variant="caption" color="text.secondary">
                      직접 공제 + 도면 주기표 공제항목 {selectedRoomOpenings.length}개
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 900 }}>{deductionExpanded ? '▲ 접기' : '▼ 펼치기'}</Typography>
                </Button>

                {deductionExpanded && (
                  <Box sx={{ p: 1.1, borderTop: '1px solid #e2e8f0' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 0.25 }}>공정별 직접 공제면적</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.65 }}>
                      도면 공제항목 외에 추가로 차감할 면적만 입력합니다.
                    </Typography>
                    <TableContainer sx={{ maxHeight: 290, border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>공정</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>직접 공제</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {processLayers.map((layer) => {
                            const rule = classifyQuantityLayer(layer.layer);
                            const value = selectedSetting.deductions?.[layer.layer] ?? '';
                            return (
                              <TableRow key={layer.layer} hover>
                                <TableCell>
                                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{layerDisplayName(layer.layer)}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {rule.mode === 'pending' ? '현재 산출규칙 보류 · 공제값만 저장' : rule.label}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ width: 165 }}>
                                  <TextField
                                    value={value}
                                    onChange={(event) => updateDeduction(layer.layer, event.target.value)}
                                    type="number"
                                    size="small"
                                    inputProps={{ min: 0, step: 0.01 }}
                                    InputProps={{ endAdornment: <Typography variant="caption">㎡</Typography> }}
                                    sx={{ width: 145 }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <Divider sx={{ my: 1.15 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mb: 0.75 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>도면 공제항목</Typography>
                        <Typography variant="caption" color="text.secondary">
                          창호·도어 구분 없이 폭×높이를 각 공정의 공제면적으로 적용합니다.
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Button size="small" variant="outlined" onClick={onImportSchedule}>주기표 자동 불러오기</Button>
                        <Button size="small" variant="outlined" onClick={onAddOpening}>공제항목 추가</Button>
                      </Box>
                    </Box>

                    {selectedRoomOpenings.length > 0 ? (
                      <Box sx={{ display: 'grid', gap: 0.65 }}>
                        {selectedRoomOpenings.map((opening) => (
                          <Paper
                            key={opening.openingKey}
                            variant="outlined"
                            onClick={() => setSelectedOpeningKey(opening.openingKey)}
                            sx={{
                              p: 0.85,
                              cursor: 'pointer',
                              borderColor: selectedOpeningKey === opening.openingKey ? '#7c3aed' : '#e2e8f0',
                              bgcolor: selectedOpeningKey === opening.openingKey ? 'rgba(124,58,237,0.045)' : '#ffffff',
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 900 }}>
                                  {opening.openingName}
                                  {isScheduleDeductionItem(opening) && <Chip size="small" label="주기표" sx={{ ml: 0.7, height: 20 }} />}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  폭 {formatNumber(opening.widthMm / 1000)}M × 높이 {formatNumber(opening.heightMm / 1000)}M × {opening.quantity}개 = {formatNumber(opening.areaM2)}㎡
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  공제: {opening.appliedLayers.length ? opening.appliedLayers.map(layerDisplayName).join(', ') : '공정 미선택'}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 0.4, flexShrink: 0 }}>
                                <Button size="small" onClick={(event) => { event.stopPropagation(); onEditOpening?.(opening); }}>수정</Button>
                                <Button size="small" color="error" onClick={(event) => { event.stopPropagation(); onDeleteOpening?.(opening); }}>삭제</Button>
                              </Box>
                            </Box>
                          </Paper>
                        ))}
                      </Box>
                    ) : (
                      <Alert severity="info">선택한 실에 등록된 도면 공제항목이 없습니다.</Alert>
                    )}
                  </Box>
                )}
              </Paper>
            </>
          )}
        </Paper>
      </Box>
    </Paper>
  );
}

function FullDrawingDialog({
  open,
  onClose,
  analysis,
  heightSettings,
  typeName,
  rooms = [],
  roomSettings = {},
  setRoomSettings,
  selectedRoomKey = '',
  setSelectedRoomKey,
  processLayers = [],
  roomSettingsLoading = false,
  roomSettingsSaving = false,
  onSaveRoomSettings,
  openings = [],
  openingSaving = false,
  onAddOpening,
  onEditOpening,
  onDeleteOpening,
  onSaveOpenings,
  onImportSchedule,
  deductionTotalsByLayer = {},
  roomQuantityRowsByKey = {},
}) {
  const [panelMode, setPanelMode] = useState('room');
  const [selectedLayer, setSelectedLayer] = useState('');
  const [layerOrder, setLayerOrder] = useState([]);
  const [selectedViewRoomKey, setSelectedViewRoomKey] = useState('');
  const [selectedOpeningKey, setSelectedOpeningKey] = useState('');
  const [directDeductionCollapsed, setDirectDeductionCollapsed] = useState(true);

  useEffect(() => {
    if (!open || !analysis) return;
    const sorted = sortLayersByDefaultOrder(
      (analysis.activeLayers || []).filter(
        (layer) => classifyQuantityLayer(layer.layer).mode !== 'room_boundary',
      ),
    );
    const initialRoomKey = rooms.some((room) => room.roomKey === selectedRoomKey)
      ? selectedRoomKey
      : rooms[0]?.roomKey || '';
    setPanelMode('room');
    setSelectedLayer('');
    setLayerOrder(sorted.map((layer) => layer.layer));
    setSelectedViewRoomKey(initialRoomKey);
    setSelectedOpeningKey('');
    setDirectDeductionCollapsed(true);
  }, [open, analysis, rooms]);

  useEffect(() => {
    if (panelMode === 'quantity') return;
    if (!selectedViewRoomKey && rooms[0]) {
      setSelectedViewRoomKey(rooms[0].roomKey);
    }
  }, [panelMode, rooms, selectedViewRoomKey]);

  useEffect(() => {
    if (selectedViewRoomKey) setSelectedRoomKey?.(selectedViewRoomKey);
    setSelectedOpeningKey('');
  }, [selectedViewRoomKey, setSelectedRoomKey]);

  useEffect(() => {
    if (!open || panelMode === 'quantity') return;
    if (
      selectedRoomKey &&
      selectedRoomKey !== selectedViewRoomKey &&
      rooms.some((room) => room.roomKey === selectedRoomKey)
    ) {
      setSelectedViewRoomKey(selectedRoomKey);
    }
  }, [open, panelMode, rooms, selectedRoomKey, selectedViewRoomKey]);

  const orderedLayers = useMemo(() => {
    if (!analysis) return [];
    const processLayerList = (analysis.activeLayers || []).filter(
      (layer) => classifyQuantityLayer(layer.layer).mode !== 'room_boundary',
    );
    const layerMap = new Map(processLayerList.map((layer) => [layer.layer, layer]));
    const ordered = layerOrder.map((layerName) => layerMap.get(layerName)).filter(Boolean);
    const missing = sortLayersByDefaultOrder(
      processLayerList.filter((layer) => !layerOrder.includes(layer.layer)),
    );
    return [...ordered, ...missing];
  }, [analysis, layerOrder]);

  const selectedRoom = rooms.find((room) => room.roomKey === selectedViewRoomKey) || null;
  const selectedSetting = selectedRoom ? roomSettings[selectedRoom.roomKey] || {} : {};
  const selectedRoomName = selectedRoom
    ? String(roomSettings[selectedRoom.roomKey]?.roomName || '').trim()
    : '';
  const selectedRoomRows = selectedRoom
    ? roomQuantityRowsByKey[selectedRoom.roomKey] || []
    : [];
  const selectedRoomRowMap = useMemo(
    () => new Map(selectedRoomRows.map((row) => [row.layer, row])),
    [selectedRoomRows],
  );
  const selectedRoomLabel = selectedRoom
    ? `${selectedRoom.sortOrder}. ${selectedRoomName || '미입력'}`
    : '0. 전체';
  const selectedRoomOpenings = selectedRoom
    ? openings.filter((opening) => openingBelongsToRoom(opening, selectedRoom.roomKey))
    : [];
  const directDeductionCount = processLayers.filter(
    (layer) => Number(selectedSetting.deductions?.[layer.layer] || 0) > 0,
  ).length;

  const selectedIndex = layerOrder.indexOf(selectedLayer);

  const moveSelectedLayer = (direction) => {
    if (!selectedLayer) return;
    setLayerOrder((previous) => {
      const index = previous.indexOf(selectedLayer);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateRoomName = (value) => {
    if (!selectedRoom) return;
    setRoomSettings?.((previous) => ({
      ...previous,
      [selectedRoom.roomKey]: {
        ...previous[selectedRoom.roomKey],
        roomName: value,
        deductions: previous[selectedRoom.roomKey]?.deductions || {},
      },
    }));
  };

  const updateDeduction = (layerName, value) => {
    if (!selectedRoom) return;
    setRoomSettings?.((previous) => ({
      ...previous,
      [selectedRoom.roomKey]: {
        ...previous[selectedRoom.roomKey],
        roomName: previous[selectedRoom.roomKey]?.roomName || '',
        deductions: {
          ...(previous[selectedRoom.roomKey]?.deductions || {}),
          [layerName]: value,
        },
      },
    }));
  };

  const selectRoom = (roomKey) => {
    setSelectedViewRoomKey(roomKey);
    if (roomKey) setSelectedRoomKey?.(roomKey);
  };

  const renderRoomButtons = (includeAll = false) => (
    <Box sx={{ display: 'flex', gap: 0.55, flexWrap: 'wrap', mb: 1.15 }}>
      {includeAll && (
        <Button
          size="small"
          variant={!selectedViewRoomKey ? 'contained' : 'outlined'}
          onClick={() => setSelectedViewRoomKey('')}
          sx={{ textTransform: 'none' }}
        >
          0. 전체
        </Button>
      )}
      {rooms.map((room) => {
        const roomName = String(roomSettings[room.roomKey]?.roomName || '').trim();
        return (
          <Button
            key={room.roomKey}
            size="small"
            variant={selectedViewRoomKey === room.roomKey ? 'contained' : 'outlined'}
            onClick={() => selectRoom(room.roomKey)}
            sx={{ textTransform: 'none' }}
          >
            {room.sortOrder}. {roomName || '미입력'}
          </Button>
        );
      })}
    </Box>
  );

  const modeDescription = {
    room: '도면의 실 번호를 선택하고 실명을 입력합니다.',
    deduction: '실별 직접 공제와 도면 주기표 공제항목을 설정합니다.',
    quantity: '실과 공정을 선택해 해당 범위의 물량과 공정선을 확인합니다.',
  }[panelMode];

  if (!analysis) return null;

  const canvasSelectedLayer = panelMode === 'quantity' ? selectedLayer : '';
  const canvasRoomEditable = panelMode === 'room' || panelMode === 'deduction';
  const canvasOpeningEditable = panelMode === 'deduction';

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ px: 2, py: 1.05, borderBottom: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 900 }}>
              {typeName || '-'} 통합 도면 VIEW
            </Typography>
            <Typography variant="caption" color="text.secondary">
              실 설정·공제면적 설정·실별 공정 물량확인을 오른쪽 고정 패널에서 전환합니다.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={onClose} sx={{ ml: 'auto', flexShrink: 0 }}>닫기</Button>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, p: 1, bgcolor: '#f8fafc' }}>
            <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
              <DrawingCanvas
                analysis={analysis}
                heightSettings={heightSettings}
                selectedLayer={canvasSelectedLayer}
                interactive
                displayMode="view"
                tooltipEnabled={panelMode === 'quantity' && Boolean(selectedLayer)}
                rooms={rooms}
                roomSettings={roomSettings}
                selectedRoomKey={selectedViewRoomKey}
                onRoomSelect={selectRoom}
                roomEditable={canvasRoomEditable}
                showRoomLabels
                openings={openings}
                selectedOpeningKey={selectedOpeningKey}
                emphasizedOpeningKeys={panelMode === 'deduction' && selectedRoom
                  ? selectedRoomOpenings.map((opening) => opening.openingKey)
                  : null}
                dimUnemphasizedOpenings={panelMode === 'deduction' && Boolean(selectedRoom)}
                onOpeningSelect={setSelectedOpeningKey}
                openingEditable={canvasOpeningEditable}
              />
            </Paper>
          </Box>

          <Paper
            square
            elevation={0}
            sx={{
              width: { xs: 300, md: 400, xl: 440 },
              flexShrink: 0,
              borderLeft: '1px solid #cbd5e1',
              overflow: 'auto',
              bgcolor: '#ffffff',
            }}
          >
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                bgcolor: '#ffffff',
                p: 1.1,
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.55 }}>
                <Button
                  size="small"
                  variant={panelMode === 'room' ? 'contained' : 'outlined'}
                  onClick={() => setPanelMode('room')}
                  sx={{ textTransform: 'none', px: 0.5, minWidth: 0 }}
                >
                  ① 실 설정
                </Button>
                <Button
                  size="small"
                  variant={panelMode === 'deduction' ? 'contained' : 'outlined'}
                  onClick={() => setPanelMode('deduction')}
                  sx={{ textTransform: 'none', px: 0.5, minWidth: 0 }}
                >
                  ② 공제면적 설정
                </Button>
                <Button
                  size="small"
                  variant={panelMode === 'quantity' ? 'contained' : 'outlined'}
                  onClick={() => setPanelMode('quantity')}
                  sx={{ textTransform: 'none', px: 0.5, minWidth: 0, fontSize: 12 }}
                >
                  ③ 실별·공정 물량확인
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.7 }}>
                {modeDescription}
              </Typography>
            </Box>

            <Box sx={{ p: 1.25 }}>
              {panelMode === 'room' && (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.75 }}>실 설정</Typography>
                  {rooms.length ? renderRoomButtons(false) : (
                    <Alert severity="warning">폐합된 WL-실면적이 없어 실을 설정할 수 없습니다.</Alert>
                  )}
                  {selectedRoom && (
                    <>
                      <TextField
                        fullWidth
                        required
                        size="small"
                        label={`실 ${selectedRoom.sortOrder} 실명`}
                        value={selectedSetting.roomName || ''}
                        onChange={(event) => updateRoomName(event.target.value)}
                        placeholder="예: 거실, 안방, 침실1"
                        error={!String(selectedSetting.roomName || '').trim()}
                        helperText={
                          String(selectedSetting.roomName || '').trim()
                            ? `실면적 ${formatNumber(selectedRoom.sourceAreaM2)}㎡`
                            : '필수입력'
                        }
                        sx={{ mb: 1.15 }}
                      />
                      <Alert severity="info" sx={{ mb: 1.15 }}>
                        도면의 번호 영역을 클릭해 실을 바꿀 수 있습니다. 선택 실은 실제 굴곡보다 바깥쪽의 얇은 사각형 경계로 표시됩니다.
                      </Alert>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={onSaveRoomSettings}
                        disabled={roomSettingsLoading || roomSettingsSaving}
                      >
                        {roomSettingsSaving ? '저장 중' : '실명 저장'}
                      </Button>
                    </>
                  )}
                </>
              )}

              {panelMode === 'deduction' && (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.75 }}>공제면적 설정</Typography>
                  {rooms.length ? renderRoomButtons(false) : (
                    <Alert severity="warning">공제면적을 연결할 실이 없습니다.</Alert>
                  )}
                  {selectedRoom && (
                    <>
                      <Paper variant="outlined" sx={{ p: 1, mb: 1.15 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75, alignItems: 'center' }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                              {selectedRoom.sortOrder}. {selectedRoomName || '미입력'} · 공정별 직접 공제
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {directDeductionCount > 0
                                ? `입력된 직접 공제 ${directDeductionCount}개`
                                : '입력된 직접 공제 없음'}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setDirectDeductionCollapsed((previous) => !previous)}
                            sx={{ flexShrink: 0, minWidth: 68 }}
                          >
                            {directDeductionCollapsed ? '펼치기' : '접기'}
                          </Button>
                        </Box>

                        {!directDeductionCollapsed && (
                          <>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.65, mb: 0.7 }}>
                              도면 공제항목 외에 추가로 차감할 면적만 입력합니다.
                            </Typography>
                            <TableContainer sx={{ maxHeight: 300, border: '1px solid #e2e8f0', borderRadius: 1 }}>
                              <Table stickyHeader size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 800 }}>공정</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800 }}>직접 공제</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {processLayers.map((layer) => {
                                    const value = selectedSetting.deductions?.[layer.layer] ?? '';
                                    return (
                                      <TableRow key={layer.layer} hover>
                                        <TableCell sx={{ fontWeight: 800 }}>{layerDisplayName(layer.layer)}</TableCell>
                                        <TableCell align="right" sx={{ width: 150 }}>
                                          <TextField
                                            value={value}
                                            onChange={(event) => updateDeduction(layer.layer, event.target.value)}
                                            type="number"
                                            size="small"
                                            inputProps={{ min: 0, step: 0.01 }}
                                            InputProps={{ endAdornment: <Typography variant="caption">㎡</Typography> }}
                                            sx={{ width: 130 }}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </>
                        )}
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1, mb: 1.15 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75, alignItems: 'center', mb: 0.75 }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>도면 공제항목</Typography>
                            <Typography variant="caption" color="text.secondary">
                              폭×높이를 선택한 공정의 공제면적으로 반영합니다.
                            </Typography>
                          </Box>
                          <Chip size="small" label={`${selectedRoomOpenings.length}개`} />
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.55, mb: 0.85 }}>
                          <Button size="small" variant="outlined" onClick={onImportSchedule}>주기표 자동 불러오기</Button>
                          <Button size="small" variant="outlined" onClick={() => onAddOpening?.(selectedRoom.roomKey)}>공제항목 추가</Button>
                        </Box>

                        {selectedRoomOpenings.length > 0 ? (
                          <Box sx={{ display: 'grid', gap: 0.65 }}>
                            {selectedRoomOpenings.map((opening) => (
                              <Paper
                                key={opening.openingKey}
                                variant="outlined"
                                onClick={() => setSelectedOpeningKey(opening.openingKey)}
                                sx={{
                                  p: 0.8,
                                  cursor: 'pointer',
                                  borderColor: selectedOpeningKey === opening.openingKey ? '#2563eb' : '#e2e8f0',
                                  bgcolor: selectedOpeningKey === opening.openingKey ? 'rgba(37,99,235,0.045)' : '#ffffff',
                                }}
                              >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75 }}>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                                      {opening.openingName || '공제항목'}
                                      {isScheduleDeductionItem(opening) && <Chip size="small" label="주기표" sx={{ ml: 0.6, height: 20 }} />}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                      {formatNumber(opening.widthMm / 1000)}M × {formatNumber(opening.heightMm / 1000)}M × {opening.quantity}개 = {formatNumber(opening.areaM2)}㎡
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                      공제: {opening.appliedLayers.length ? opening.appliedLayers.map(layerDisplayName).join(', ') : '공정 미선택'}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 0.35, flexShrink: 0 }}>
                                    <Button size="small" onClick={(event) => { event.stopPropagation(); onEditOpening?.(opening); }}>수정</Button>
                                    <Button size="small" color="error" onClick={(event) => { event.stopPropagation(); onDeleteOpening?.(opening); }}>삭제</Button>
                                  </Box>
                                </Box>
                              </Paper>
                            ))}
                          </Box>
                        ) : (
                          <Alert severity="info">선택한 실에 등록된 도면 공제항목이 없습니다.</Alert>
                        )}
                      </Paper>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                        <Button
                          variant="outlined"
                          onClick={onSaveOpenings}
                          disabled={openingSaving}
                        >
                          {openingSaving ? '저장 중' : '도면 공제 저장'}
                        </Button>
                        <Button
                          variant="contained"
                          onClick={onSaveRoomSettings}
                          disabled={roomSettingsLoading || roomSettingsSaving}
                        >
                          {roomSettingsSaving ? '저장 중' : '직접 공제 저장'}
                        </Button>
                      </Box>
                    </>
                  )}
                </>
              )}

              {panelMode === 'quantity' && (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.35 }}>실별·공정 물량확인</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    실 선택: {selectedRoomLabel}
                  </Typography>
                  {renderRoomButtons(true)}

                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 0.55 }}>공정 선택</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, mb: 1.05 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      disabled={!selectedLayer || selectedIndex <= 0}
                      onClick={() => moveSelectedLayer(-1)}
                      aria-label="선택 공정 위로 이동"
                      sx={{ fontSize: 20, lineHeight: 1, minHeight: 34 }}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      disabled={!selectedLayer || selectedIndex < 0 || selectedIndex >= layerOrder.length - 1}
                      onClick={() => moveSelectedLayer(1)}
                      aria-label="선택 공정 아래로 이동"
                      sx={{ fontSize: 20, lineHeight: 1, minHeight: 34 }}
                    >
                      ↓
                    </Button>
                  </Box>

                  {orderedLayers.map((layer) => {
                    const totalResult = getLayerResult(layer, heightSettings);
                    const totalDeductionM2 = safeDeductionValue(deductionTotalsByLayer[layer.layer]);
                    const totalQuantity =
                      ['㎡', 'M'].includes(totalResult.unit) && totalResult.quantity !== null && totalResult.quantity !== undefined
                        ? Math.max(0, Number(totalResult.quantity) - totalDeductionM2)
                        : totalResult.quantity;
                    const roomRow = selectedRoomRowMap.get(layer.layer);
                    const displayedQuantity = selectedRoom ? roomRow?.quantity : totalQuantity;
                    const displayedUnit = selectedRoom ? roomRow?.unit || totalResult.unit : totalResult.unit;
                    const displayedStatus = selectedRoom ? roomRow?.status : totalResult.status;
                    const displayedDeduction = selectedRoom ? safeDeductionValue(roomRow?.deductionM2) : totalDeductionM2;
                    const displayedGross = selectedRoom ? roomRow?.grossQuantity : totalResult.quantity;
                    const selected = selectedLayer === layer.layer;
                    return (
                      <Button
                        key={layer.layer}
                        fullWidth
                        variant={selected ? 'contained' : 'outlined'}
                        color={selected ? 'error' : 'primary'}
                        onClick={() => setSelectedLayer(layer.layer)}
                        sx={{
                          mb: 0.65,
                          py: 0.75,
                          px: 1,
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          textTransform: 'none',
                        }}
                      >
                        <Box component="span" sx={{ minWidth: 0 }}>
                          <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 800 }}>
                            {layerDisplayName(layer.layer)}
                          </Typography>
                          <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.88 }}>
                            {displayedQuantity === null || displayedQuantity === undefined
                              ? displayedStatus || '산출값 없음'
                              : `${formatNumber(displayedQuantity)}${displayedUnit}${displayedDeduction > 0 && ['㎡', 'M'].includes(displayedUnit)
                                ? ` (총 ${formatNumber(displayedGross)}${displayedUnit} · 공제 ${formatNumber(displayedDeduction)}${displayedUnit})`
                                : ''}`}
                          </Typography>
                        </Box>
                        {!selectedRoom && (
                          <Typography component="span" variant="caption" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                            {formatInteger(layer.objectCount)}개
                          </Typography>
                        )}
                      </Button>
                    );
                  })}

                  <Button
                    fullWidth
                    variant={!selectedLayer ? 'contained' : 'outlined'}
                    color="primary"
                    onClick={() => setSelectedLayer('')}
                    sx={{ mt: 0.2, py: 0.85, px: 1, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
                  >
                    <Box component="span">
                      <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 900 }}>
                        기본도면
                      </Typography>
                      <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                        공정 강조 없이 보기
                      </Typography>
                    </Box>
                  </Button>
                </>
              )}
            </Box>
          </Paper>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default function DrawingQuantityAnalysis({ projectName, userProfile }) {
  const fileInputRef = useRef(null);
  const roomKeyMigrationRef = useRef(new Map());
  const [typeName, setTypeName] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [drawingSaving, setDrawingSaving] = useState(false);
  const [drawingLoading, setDrawingLoading] = useState(false);
  const [savedDrawings, setSavedDrawings] = useState([]);
  const [currentDrawing, setCurrentDrawing] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [heightSettings, setHeightSettings] = useState({});
  const [commonHeight, setCommonHeight] = useState('2300');
  const [roomSettings, setRoomSettings] = useState({});
  const [selectedRoomKey, setSelectedRoomKey] = useState('');
  const [roomSettingsLoading, setRoomSettingsLoading] = useState(false);
  const [roomSettingsSaving, setRoomSettingsSaving] = useState(false);
  const [openings, setOpenings] = useState([]);
  const [openingSettingsLoading, setOpeningSettingsLoading] = useState(false);
  const [openingSettingsSaving, setOpeningSettingsSaving] = useState(false);
  const [openingEditor, setOpeningEditor] = useState(null);
  const [toast, setToast] = useState(null);

  const drawingRooms = useMemo(() => extractDrawingRooms(analysis), [analysis]);

  const deductionProcessLayers = useMemo(() => {
    if (!analysis) return [];
    return sortLayersByDefaultOrder(
      (analysis.activeLayers || []).filter((layer) => {
        const mode = classifyQuantityLayer(layer.layer).mode;
        return ['length_to_area', 'closed_area', 'pending'].includes(mode);
      }),
    );
  }, [analysis]);

  const openingProcessLayers = useMemo(() => {
    if (!analysis) return [];
    return sortLayersByDefaultOrder(
      (analysis.activeLayers || []).filter(
        (layer) => classifyQuantityLayer(layer.layer).mode !== 'room_boundary',
      ),
    );
  }, [analysis]);

  const manualDeductionTotalsByLayer = useMemo(() => {
    const totals = {};
    Object.values(roomSettings || {}).forEach((setting) => {
      Object.entries(setting?.deductions || {}).forEach(([layerName, value]) => {
        totals[layerName] = (totals[layerName] || 0) + safeDeductionValue(value);
      });
    });
    return totals;
  }, [roomSettings]);

  const openingDeductionTotalsByLayer = useMemo(() => {
    const totals = {};
    openings.forEach((opening) => {
      const roomMultiplier = Math.max(1, getOpeningRoomKeys(opening).length);
      (opening.appliedLayers || []).forEach((layerName) => {
        totals[layerName] =
          (totals[layerName] || 0) + getOpeningDeductionQuantity(opening, layerName) * roomMultiplier;
      });
    });
    return totals;
  }, [openings]);

  const deductionTotalsByLayer = useMemo(() => {
    const totals = { ...manualDeductionTotalsByLayer };
    Object.entries(openingDeductionTotalsByLayer).forEach(([layerName, value]) => {
      totals[layerName] = (totals[layerName] || 0) + value;
    });
    return totals;
  }, [manualDeductionTotalsByLayer, openingDeductionTotalsByLayer]);

  const roomQuantityRowsByKey = useMemo(
    () =>
      buildRoomQuantityRows({
        analysis,
        rooms: drawingRooms,
        roomSettings,
        openings,
        heightSettings,
      }),
    [analysis, drawingRooms, heightSettings, openings, roomSettings],
  );

  const activeRows = useMemo(() => {
    if (!analysis) return [];
    return (analysis.activeLayers || [])
      .filter((layer) => classifyQuantityLayer(layer.layer).mode !== 'room_boundary')
      .map((layer) => {
      const result = getLayerResult(layer, heightSettings);
      const deductionM2 = safeDeductionValue(deductionTotalsByLayer[layer.layer]);
      const grossQuantity = result.quantity;
      const canDeduct = ['㎡', 'M'].includes(result.unit) && grossQuantity !== null && grossQuantity !== undefined;
      return {
        ...layer,
        ...result,
        grossQuantity,
        manualDeductionM2: safeDeductionValue(manualDeductionTotalsByLayer[layer.layer]),
        openingDeductionM2: safeDeductionValue(openingDeductionTotalsByLayer[layer.layer]),
        deductionM2,
        quantity: canDeduct ? Math.max(0, Number(grossQuantity) - deductionM2) : grossQuantity,
      };
    });
  }, [analysis, deductionTotalsByLayer, heightSettings, manualDeductionTotalsByLayer, openingDeductionTotalsByLayer]);

  const heightRequiredLayers = useMemo(
    () => activeRows.filter((row) => row.rule.requiresHeight),
    [activeRows],
  );

  const missingHeightCount = heightRequiredLayers.filter(
    (row) => safeHeightValue(heightSettings[row.layer]) <= 0,
  ).length;

  const loadDrawingRecord = useCallback(async (drawing, options = {}) => {
    if (!drawing?.id) return;
    const { silent = false } = options;
    setDrawingLoading(true);

    try {
      const { data, error } = await supabase
        .from(DRAWING_TABLE)
        .select('*')
        .eq('id', drawing.id)
        .single();
      if (error) throw error;

      let nextAnalysis = data.analysis_json;
      if (typeof nextAnalysis === 'string') nextAnalysis = JSON.parse(nextAnalysis);

      const requiresAnalyzerRefresh =
        !nextAnalysis?.entities?.length ||
        data.analyzer_version !== ANALYZER_VERSION ||
        nextAnalysis?.analyzerVersion !== ANALYZER_VERSION;

      if (requiresAnalyzerRefresh) {
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from(data.storage_bucket || STORAGE_BUCKET)
          .download(data.storage_path);
        if (downloadError) throw downloadError;
        nextAnalysis = analyzeDxfArrayBuffer(await fileBlob.arrayBuffer());

        await supabase
          .from(DRAWING_TABLE)
          .update({
            analysis_json: nextAnalysis,
            layer_summary: nextAnalysis.activeLayers,
            analyzer_version: ANALYZER_VERSION,
            upload_status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      }

      setAnalysis(nextAnalysis);
      setTypeName(data.drawing_type || '');
      setSelectedFileName(data.file_name || '');
      setCurrentDrawing(data);
      if (!silent) {
        setToast({
          severity: 'success',
          text: `${data.drawing_type} 저장 도면을 불러왔습니다.`,
        });
      }
    } catch (error) {
      console.error('저장 도면 불러오기 오류:', error);
      setToast({ severity: 'error', text: `저장 도면 불러오기 실패: ${error.message}` });
    } finally {
      setDrawingLoading(false);
    }
  }, []);

  const refreshSavedDrawings = useCallback(async ({ autoLoad = false } = {}) => {
    if (!projectName) {
      setSavedDrawings([]);
      return [];
    }

    const { data, error } = await supabase
      .from(DRAWING_TABLE)
      .select('id, project_name, drawing_type, file_name, file_size, storage_bucket, storage_path, analyzer_version, upload_status, updated_at')
      .eq('project_name', projectName)
      .eq('upload_status', 'ready')
      .order('drawing_type', { ascending: true });

    if (error) throw error;
    const rows = data || [];
    setSavedDrawings(rows);
    if (autoLoad && rows.length > 0) await loadDrawingRecord(rows[0], { silent: true });
    return rows;
  }, [loadDrawingRecord, projectName]);

  const loadRoomSettings = useCallback(async (drawingId, rooms = []) => {
    if (!drawingId) {
      roomKeyMigrationRef.current = new Map();
      setRoomSettings({});
      setSelectedRoomKey('');
      setOpenings([]);
      setOpeningEditor(null);
      return;
    }

    setRoomSettingsLoading(true);
    try {
      const { data: roomRows, error: roomError } = await supabase
        .from(ROOM_TABLE)
        .select('id, room_key, room_name, source_area_m2, sort_order, center_x, center_y')
        .eq('drawing_id', drawingId)
        .order('sort_order', { ascending: true });
      if (roomError) throw roomError;

      const roomIds = (roomRows || []).map((row) => row.id);
      let deductionRows = [];
      if (roomIds.length > 0) {
        const { data, error } = await supabase
          .from(ROOM_DEDUCTION_TABLE)
          .select('room_id, layer_name, deduction_area_m2')
          .in('room_id', roomIds);
        if (error) throw error;
        deductionRows = data || [];
      }

      const deductionsByRoomId = {};
      deductionRows.forEach((row) => {
        if (!deductionsByRoomId[row.room_id]) deductionsByRoomId[row.room_id] = {};
        deductionsByRoomId[row.room_id][row.layer_name] = String(Number(row.deduction_area_m2 || 0));
      });

      const savedRows = (roomRows || []).map((row) => ({
        roomKey: row.room_key,
        roomId: row.id,
        roomName: row.room_name || '',
        deductions: deductionsByRoomId[row.id] || {},
        sortOrder: Number(row.sort_order || 0),
        center: {
          x: Number(row.center_x || 0),
          y: Number(row.center_y || 0),
        },
      }));
      const savedByKey = new Map(savedRows.map((row) => [row.roomKey, row]));
      const usedRoomIds = new Set();

      const next = {};
      const roomKeyMigration = new Map();
      rooms.forEach((room) => {
        let matched = savedByKey.get(room.roomKey) || null;
        if (!matched) {
          const candidates = savedRows
            .filter((row) => !usedRoomIds.has(row.roomId))
            .map((row) => ({
              row,
              inside:
                isPointInsidePolygon(row.center, room.points || []) ||
                polygonBoundaryDistance(row.center, room.points || []) <= 1,
              sameOrder: row.sortOrder === room.sortOrder,
              distance: distanceBetweenPoints(row.center, room.center),
            }))
            .sort((left, right) => {
              if (left.inside !== right.inside) return left.inside ? -1 : 1;
              if (left.sameOrder !== right.sameOrder) return left.sameOrder ? -1 : 1;
              return left.distance - right.distance;
            });
          matched = candidates[0]?.row || null;
        }
        if (matched) {
          usedRoomIds.add(matched.roomId);
          roomKeyMigration.set(matched.roomKey, room.roomKey);
        }
        next[room.roomKey] = matched
          ? {
              roomId: matched.roomId,
              roomName: matched.roomName,
              deductions: matched.deductions,
            }
          : {
              roomName: '',
              deductions: {},
            };
      });
      roomKeyMigrationRef.current = roomKeyMigration;
      setRoomSettings(next);
      setSelectedRoomKey((previous) =>
        rooms.some((room) => room.roomKey === previous) ? previous : rooms[0]?.roomKey || '',
      );
    } catch (error) {
      console.error('실명·공제면적 설정 조회 오류:', error);
      setRoomSettings(
        Object.fromEntries(
          rooms.map((room) => [room.roomKey, { roomName: '', deductions: {} }]),
        ),
      );
      setToast({
        severity: 'error',
        text: `실명·공제면적 설정을 불러오지 못했습니다. v51.53 SQL 실행 여부를 확인해주세요. (${error.message})`,
      });
    } finally {
      setRoomSettingsLoading(false);
    }
  }, []);


  const loadOpeningSettings = useCallback(async (drawingId, rooms = []) => {
    if (!drawingId) {
      setOpenings([]);
      return;
    }
    setOpeningSettingsLoading(true);
    try {
      const { data, error } = await supabase
        .from(OPENING_TABLE)
        .select('id, opening_key, room_key, opening_type, opening_name, width_mm, height_mm, quantity, area_m2, start_x, start_y, end_x, end_y, center_x, center_y, applied_layers')
        .eq('drawing_id', drawingId)
        .order('opening_name', { ascending: true });
      if (error) throw error;
      const normalized = (data || []).map(normalizeOpeningRow);
      const validRoomKeys = new Set(rooms.map((room) => room.roomKey));
      setOpenings(
        normalized.map((opening) => {
          let nextOpening = opening;
          if (rooms.length && !validRoomKeys.has(nextOpening.roomKey)) {
            const migratedRoomKey = roomKeyMigrationRef.current.get(nextOpening.roomKey);
            if (migratedRoomKey && validRoomKeys.has(migratedRoomKey)) {
              nextOpening = { ...nextOpening, roomKey: migratedRoomKey };
            } else {
              const matchedRoom = findNearestRoomForPoint(nextOpening.center, rooms);
              if (matchedRoom) nextOpening = { ...nextOpening, roomKey: matchedRoom.roomKey };
            }
          }
          const roomKeys = findAdjacentRoomKeysForOpening({
            point: nextOpening.center,
            widthMm: nextOpening.widthMm,
            rooms,
            primaryRoomKey: nextOpening.roomKey,
          });
          return {
            ...nextOpening,
            roomKeys: roomKeys.length ? roomKeys : [nextOpening.roomKey].filter(Boolean),
          };
        }),
      );
    } catch (error) {
      console.error('도면 공제항목 설정 조회 오류:', error);
      setOpenings([]);
      setToast({ severity: 'error', text: `도면 공제항목을 불러오지 못했습니다. v51.54 SQL 실행 여부를 확인해주세요. (${error.message})` });
    } finally {
      setOpeningSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadProjectData = async () => {
      setAnalysis(null);
      setCurrentDrawing(null);
      setSelectedFileName('');
      setTypeName('');
      setSavedDrawings([]);
      setHeightSettings({});
      setRoomSettings({});
      setSelectedRoomKey('');
      if (!projectName) return;

      setSettingsLoading(true);
      try {
        const [{ data: settingsData, error: settingsError }] = await Promise.all([
          supabase
            .from(HEIGHT_SETTING_TABLE)
            .select('layer_name, height_mm')
            .eq('project_name', projectName)
            .order('layer_name', { ascending: true }),
        ]);

        if (settingsError) throw settingsError;
        if (!active) return;

        const nextSettings = {};
        (settingsData || []).forEach((row) => {
          nextSettings[row.layer_name] = String(Number(row.height_mm));
        });
        setHeightSettings(nextSettings);

        await refreshSavedDrawings({ autoLoad: true });
      } catch (error) {
        console.error('도면 설정·저장목록 조회 오류:', error);
        if (active) {
          setToast({
            severity: 'error',
            text: `도면 설정 또는 저장 도면을 불러오지 못했습니다. v51.45 SQL 실행 여부를 확인해주세요. (${error.message})`,
          });
        }
      } finally {
        if (active) setSettingsLoading(false);
      }
    };

    loadProjectData();
    return () => {
      active = false;
    };
  }, [projectName, refreshSavedDrawings]);

  useEffect(() => {
    if (!currentDrawing?.id || !analysis) {
      setRoomSettings({});
      setSelectedRoomKey('');
      setOpenings([]);
      return;
    }
    loadRoomSettings(currentDrawing.id, drawingRooms);
    loadOpeningSettings(currentDrawing.id, drawingRooms);
  }, [analysis, currentDrawing?.id, drawingRooms, loadOpeningSettings, loadRoomSettings]);

  const saveDrawing = async (file, result, effectiveTypeName) => {
    const existing = savedDrawings.find(
      (row) => String(row.drawing_type || '').trim().toLowerCase() === effectiveTypeName.toLowerCase(),
    );

    if (existing && !window.confirm(`${effectiveTypeName} 저장 도면을 새 파일로 교체할까요?`)) {
      return null;
    }

    const userId = userProfile?.auth_user_id || userProfile?.id || null;
    const drawingId = existing?.id || createUuid();
    const storagePath = existing?.storage_path || `${drawingId}/drawing.dxf`;
    const storageBucket = existing?.storage_bucket || STORAGE_BUCKET;
    let insertedNewRow = false;

    setDrawingSaving(true);
    try {
      if (!existing) {
        const { error: insertError } = await supabase.from(DRAWING_TABLE).insert({
          id: drawingId,
          project_name: projectName,
          drawing_type: effectiveTypeName,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/dxf',
          storage_bucket: storageBucket,
          storage_path: storagePath,
          upload_status: 'pending',
          analyzer_version: ANALYZER_VERSION,
          created_by: userId,
          updated_by: userId,
        });
        if (insertError) throw insertError;
        insertedNewRow = true;
      }

      const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/dxf',
          upsert: Boolean(existing),
        });
      if (uploadError) throw uploadError;

      const analysisJson = JSON.parse(JSON.stringify(result));
      const { data: updated, error: updateError } = await supabase
        .from(DRAWING_TABLE)
        .update({
          project_name: projectName,
          drawing_type: effectiveTypeName,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/dxf',
          storage_bucket: storageBucket,
          storage_path: storagePath,
          analysis_json: analysisJson,
          layer_summary: analysisJson.activeLayers || [],
          analyzer_version: ANALYZER_VERSION,
          upload_status: 'ready',
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', drawingId)
        .select('*')
        .single();
      if (updateError) throw updateError;

      await refreshSavedDrawings();
      setCurrentDrawing(updated);
      setToast({
        severity: 'success',
        text: `${effectiveTypeName} 도면 분석과 저장을 완료했습니다. 다음 접속부터 저장 도면을 바로 불러올 수 있습니다.`,
      });
      return updated;
    } catch (error) {
      console.error('DXF 저장 오류:', error);
      if (insertedNewRow) {
        await supabase.storage.from(storageBucket).remove([storagePath]);
        await supabase.from(DRAWING_TABLE).delete().eq('id', drawingId);
      }
      throw error;
    } finally {
      setDrawingSaving(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!projectName) {
      setToast({ severity: 'warning', text: '현장을 먼저 선택해주세요.' });
      return;
    }
    if (!/\.dxf$/i.test(file.name)) {
      setToast({ severity: 'warning', text: 'DXF 파일만 업로드할 수 있습니다.' });
      return;
    }
    if (file.size > MAX_DXF_FILE_SIZE) {
      setToast({ severity: 'warning', text: 'DXF 파일은 25MB 이하만 업로드할 수 있습니다.' });
      return;
    }

    const effectiveTypeName = typeName.trim() || normalizeTypeName(file.name);
    if (!effectiveTypeName) {
      setToast({ severity: 'warning', text: '타입명을 입력해주세요.' });
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);
    setCurrentDrawing(null);
    setSelectedFileName(file.name);
    setTypeName(effectiveTypeName);

    try {
      const result = analyzeDxfArrayBuffer(await file.arrayBuffer());
      setAnalysis(result);
      const saved = await saveDrawing(file, result, effectiveTypeName);
      if (!saved) {
        setAnalysis(null);
        setSelectedFileName('');
        return;
      }

      if (result.activeLayers.length === 0) {
        setToast({
          severity: 'warning',
          text: '도면은 저장됐지만 WL-로 시작하는 활성 레이어가 없어 수량 산출 대상은 없습니다.',
        });
      }
    } catch (error) {
      console.error('DXF 분석·저장 오류:', error);
      setAnalysis(null);
      setSelectedFileName('');
      setToast({ severity: 'error', text: error.message || 'DXF 분석·저장 중 오류가 발생했습니다.' });
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyCommonHeight = () => {
    const height = safeHeightValue(commonHeight);
    if (!height) {
      setToast({ severity: 'warning', text: '공통 높이를 0보다 큰 숫자로 입력해주세요.' });
      return;
    }
    if (heightRequiredLayers.length === 0) {
      setToast({ severity: 'info', text: '높이 설정이 필요한 활성 레이어가 없습니다.' });
      return;
    }

    setHeightSettings((previous) => {
      const next = { ...previous };
      heightRequiredLayers.forEach((row) => {
        next[row.layer] = String(height);
      });
      return next;
    });
  };

  const handleSaveSettings = async () => {
    if (!projectName) {
      setToast({ severity: 'warning', text: '현장을 먼저 선택해주세요.' });
      return;
    }
    if (heightRequiredLayers.length === 0) {
      setToast({ severity: 'info', text: '저장할 높이 설정이 없습니다.' });
      return;
    }
    if (missingHeightCount > 0) {
      setToast({
        severity: 'warning',
        text: `필수 높이가 입력되지 않은 레이어가 ${formatInteger(missingHeightCount)}개 있습니다.`,
      });
      return;
    }

    setSettingsSaving(true);
    try {
      const rows = heightRequiredLayers.map((row) => ({
        project_name: projectName,
        layer_name: row.layer,
        height_mm: safeHeightValue(heightSettings[row.layer]),
        updated_by: userProfile?.auth_user_id || userProfile?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from(HEIGHT_SETTING_TABLE)
        .upsert(rows, { onConflict: 'project_name,layer_name' });
      if (error) throw error;

      setToast({
        severity: 'success',
        text: `${projectName}의 높이 설정 ${formatInteger(rows.length)}개를 저장했습니다.`,
      });
    } catch (error) {
      console.error('도면 높이 설정 저장 오류:', error);
      setToast({ severity: 'error', text: `높이 설정 저장 실패: ${error.message}` });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveRoomSettings = async () => {
    if (!currentDrawing?.id) {
      setToast({ severity: 'warning', text: '저장된 타입 도면을 먼저 선택해주세요.' });
      return;
    }
    if (drawingRooms.length === 0) {
      setToast({ severity: 'warning', text: '저장할 실 영역이 없습니다.' });
      return;
    }

    const missingRooms = drawingRooms.filter(
      (room) => !String(roomSettings[room.roomKey]?.roomName || '').trim(),
    );
    if (missingRooms.length > 0) {
      setSelectedRoomKey(missingRooms[0].roomKey);
      setToast({
        severity: 'warning',
        text: `실명이 입력되지 않은 실이 ${formatInteger(missingRooms.length)}개 있습니다.`,
      });
      return;
    }

    for (const room of drawingRooms) {
      const deductions = roomSettings[room.roomKey]?.deductions || {};
      for (const layer of deductionProcessLayers) {
        const raw = deductions[layer.layer];
        if (raw === '' || raw === null || raw === undefined) continue;
        const value = Number(String(raw).replace(/,/g, ''));
        if (!Number.isFinite(value) || value < 0) {
          setSelectedRoomKey(room.roomKey);
          setToast({
            severity: 'warning',
            text: `${roomSettings[room.roomKey]?.roomName || `실 ${room.sortOrder}`}의 ${layerDisplayName(layer.layer)} 공제면적을 0 이상의 숫자로 입력해주세요.`,
          });
          return;
        }
        if (isCeilingAreaLayer(layer.layer)) {
          const ceilingRow = (roomQuantityRowsByKey[room.roomKey] || []).find(
            (row) => row.layer === layer.layer,
          );
          const roomCeilingArea = Number(ceilingRow?.grossQuantity || 0);
          if (value > roomCeilingArea + 0.0001) {
            setSelectedRoomKey(room.roomKey);
            setToast({
              severity: 'warning',
              text: `${roomSettings[room.roomKey]?.roomName}의 천정면적 공제는 해당 실 천정 산출면적 ${formatNumber(roomCeilingArea)}㎡를 초과할 수 없습니다.`,
            });
            return;
          }
        }
      }
    }

    for (const layer of deductionProcessLayers) {
      const grossResult = getLayerResult(layer, heightSettings);
      const totalDeduction =
        drawingRooms.reduce(
          (sum, room) => sum + safeDeductionValue(roomSettings[room.roomKey]?.deductions?.[layer.layer]),
          0,
        ) + safeDeductionValue(openingDeductionTotalsByLayer[layer.layer]);
      if (
        grossResult.unit === '㎡' &&
        grossResult.quantity !== null &&
        grossResult.quantity !== undefined &&
        totalDeduction > Number(grossResult.quantity) + 0.0001
      ) {
        setToast({
          severity: 'warning',
          text: `${layerDisplayName(layer.layer)} 총 공제면적 ${formatNumber(totalDeduction)}㎡가 산출면적 ${formatNumber(grossResult.quantity)}㎡를 초과합니다.`,
        });
        return;
      }
    }

    const payload = drawingRooms.map((room) => ({
      room_key: room.roomKey,
      room_name: String(roomSettings[room.roomKey]?.roomName || '').trim(),
      source_layer: room.layer,
      source_area_m2: Number(room.sourceAreaM2.toFixed(6)),
      center_x: Number(room.center.x.toFixed(3)),
      center_y: Number(room.center.y.toFixed(3)),
      sort_order: room.sortOrder,
      deductions: deductionProcessLayers
        .map((layer) => ({
          layer_name: layer.layer,
          deduction_area_m2: safeDeductionValue(
            roomSettings[room.roomKey]?.deductions?.[layer.layer],
          ),
        }))
        .filter((row) => row.deduction_area_m2 > 0),
    }));

    setRoomSettingsSaving(true);
    try {
      const { error } = await supabase.rpc('save_drawing_room_settings', {
        p_drawing_id: currentDrawing.id,
        p_rooms: payload,
      });
      if (error) throw error;
      await loadRoomSettings(currentDrawing.id, drawingRooms);
      setToast({
        severity: 'success',
        text: `${typeName || currentDrawing.drawing_type} 실명 ${formatInteger(payload.length)}개와 공정별 공제면적을 저장했습니다.`,
      });
    } catch (error) {
      console.error('실명·공제면적 저장 오류:', error);
      setToast({ severity: 'error', text: `실명·공제면적 저장 실패: ${error.message}` });
    } finally {
      setRoomSettingsSaving(false);
    }
  };

  const handleSaveOpenings = async () => {
    if (!currentDrawing?.id) {
      setToast({ severity: 'warning', text: '저장된 타입 도면을 먼저 선택해주세요.' });
      return;
    }
    for (const opening of openings) {
      if (!opening.roomKey || !drawingRooms.some((room) => room.roomKey === opening.roomKey)) {
        setToast({ severity: 'warning', text: `${opening.openingName || '공제항목'}의 실 연결이 올바르지 않습니다.` });
        return;
      }
      if (!opening.openingName || opening.widthMm <= 0 || opening.heightMm <= 0 || opening.quantity <= 0) {
        setToast({ severity: 'warning', text: '도면 공제항목의 명칭·폭·높이·개수를 확인해주세요.' });
        return;
      }
    }

    for (const layer of openingProcessLayers) {
      const grossResult = getLayerResult(layer, heightSettings);
      const combinedDeduction =
        safeDeductionValue(manualDeductionTotalsByLayer[layer.layer]) +
        safeDeductionValue(openingDeductionTotalsByLayer[layer.layer]);
      if (
        ['㎡', 'M'].includes(grossResult.unit) &&
        grossResult.quantity !== null &&
        grossResult.quantity !== undefined &&
        combinedDeduction > Number(grossResult.quantity) + 0.0001
      ) {
        setToast({
          severity: 'warning',
          text: `${layerDisplayName(layer.layer)} 공제합계 ${formatNumber(combinedDeduction)}${grossResult.unit}가 산출수량 ${formatNumber(grossResult.quantity)}${grossResult.unit}를 초과합니다.`,
        });
        return;
      }
    }

    const payload = openings.map((opening) => ({
      opening_key: opening.openingKey,
      room_key: opening.roomKey,
      opening_type: opening.openingType || 'window',
      opening_name: opening.openingName,
      width_mm: Number(opening.widthMm),
      height_mm: Number(opening.heightMm),
      quantity: Number(opening.quantity),
      start_x: Number(opening.start.x),
      start_y: Number(opening.start.y),
      end_x: Number(opening.end.x),
      end_y: Number(opening.end.y),
      applied_layers: opening.appliedLayers || [],
    }));

    setOpeningSettingsSaving(true);
    try {
      const { error } = await supabase.rpc('save_drawing_openings', {
        p_drawing_id: currentDrawing.id,
        p_openings: payload,
      });
      if (error) throw error;
      await loadOpeningSettings(currentDrawing.id, drawingRooms);
      setToast({ severity: 'success', text: `${typeName || currentDrawing.drawing_type} 도면 공제항목 ${formatInteger(payload.length)}개를 저장했습니다.` });
    } catch (error) {
      console.error('도면 공제항목 저장 오류:', error);
      setToast({ severity: 'error', text: `도면 공제항목 저장 실패: ${error.message}` });
    } finally {
      setOpeningSettingsSaving(false);
    }
  };

  const handleImportScheduleDeductions = () => {
    if (!analysis) {
      setToast({ severity: 'warning', text: '분석된 도면이 없습니다.' });
      return;
    }
    if (!drawingRooms.length) {
      setToast({ severity: 'warning', text: '공제항목을 연결할 실 영역이 없습니다.' });
      return;
    }
    const candidates = extractScheduleDeductionCandidates(analysis, drawingRooms);
    if (!candidates.length) {
      setToast({
        severity: 'info',
        text: '도면에서 창호기호 블록과 폭X높이 주기표 문자를 함께 찾지 못했습니다. 공제항목 추가에서 창호목록을 불러오거나 직접 입력해주세요.',
      });
      return;
    }
    const existingKeys = new Set(openings.map((opening) => opening.openingKey));
    const additions = candidates.filter((candidate) => !existingKeys.has(candidate.openingKey));
    if (!additions.length) {
      setToast({ severity: 'info', text: `주기표 공제항목 ${formatInteger(candidates.length)}개가 이미 불러와져 있습니다.` });
      return;
    }
    setOpenings((previous) => [...previous, ...additions]);
    setSelectedRoomKey(additions[0].roomKey);
    setToast({
      severity: 'success',
      text: `주기표에서 공제항목 ${formatInteger(candidates.length)}개를 인식해 신규 ${formatInteger(additions.length)}개를 추가했습니다. 실 연결과 공제 적용 공정을 확인한 뒤 저장해주세요.`,
    });
  };

  const openOpeningEditor = (opening = null, roomKeyOverride = '') => {
    const targetRoomKey = roomKeyOverride || opening?.roomKey || selectedRoomKey;
    const room = drawingRooms.find((item) => item.roomKey === targetRoomKey) || drawingRooms[0];
    if (!room) {
      setToast({ severity: 'warning', text: '공제항목을 연결할 실을 먼저 선택해주세요.' });
      return;
    }
    setSelectedRoomKey(room.roomKey);
    setOpeningEditor({ opening, roomKey: room.roomKey });
  };

  const applyOpening = (opening) => {
    setOpenings((previous) => {
      const exists = previous.some((item) => item.openingKey === opening.openingKey);
      return exists
        ? previous.map((item) => (item.openingKey === opening.openingKey ? opening : item))
        : [...previous, opening];
    });
  };

  const deleteOpening = (opening) => {
    if (!window.confirm(`${opening.openingName}을(를) 삭제할까요? 저장 버튼을 눌러야 DB에 반영됩니다.`)) return;
    setOpenings((previous) => previous.filter((item) => item.openingKey !== opening.openingKey));
  };

  return (
    <Box sx={{ height: '100%', minHeight: 0, overflow: 'auto', pr: 0.5 }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 900, mb: 0.5 }}>
          타입별 도면분석
        </Typography>
        <Typography variant="body2" color="text.secondary">
          타입별 DXF 원본과 분석결과를 현장에 저장합니다. 레이어명이 WL-로 시작하는 객체만 길이·면적 산출 대상으로 활성화하며, 이번 단계에서는 노임과 자재를 연결하지 않습니다.
        </Typography>

        <Divider sx={{ my: 1.5 }} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 420px) auto' },
            gap: 1.25,
            alignItems: 'center',
          }}
        >
          <TextField
            label="타입명"
            value={typeName}
            onChange={(event) => setTypeName(event.target.value)}
            size="small"
            required
            placeholder="예: 84A"
            helperText="같은 타입으로 다시 업로드하면 기존 저장 도면을 교체합니다."
          />

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,application/dxf,text/plain"
              hidden
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <Button
              variant="contained"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing || drawingSaving || !projectName}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {analyzing ? '도면 분석 중' : drawingSaving ? '도면 저장 중' : 'DXF 업로드·저장'}
            </Button>
            {(analyzing || drawingSaving || drawingLoading || settingsLoading) && <CircularProgress size={22} />}
            {currentDrawing && <Chip size="small" color="success" label="저장됨" />}
          </Box>
        </Box>

        {selectedFileName && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            현재 도면: {selectedFileName} · 타입: {typeName || '-'} · 도면 단위: mm
            {currentDrawing?.updated_at ? ` · 저장일 ${formatDateTime(currentDrawing.updated_at)}` : ''}
          </Typography>
        )}

        <Divider sx={{ my: 1.25 }} />

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 0.75 }}>
            저장된 타입 도면
          </Typography>
          {savedDrawings.length > 0 ? (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {savedDrawings.map((drawing) => (
                <Button
                  key={drawing.id}
                  size="small"
                  variant={currentDrawing?.id === drawing.id ? 'contained' : 'outlined'}
                  onClick={() => loadDrawingRecord(drawing)}
                  disabled={drawingLoading || drawingSaving || analyzing}
                  sx={{ textTransform: 'none' }}
                >
                  {drawing.drawing_type}
                </Button>
              ))}
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              저장된 타입 도면이 없습니다. 타입명을 입력하고 DXF를 업로드하면 자동 저장됩니다.
            </Typography>
          )}
        </Box>
      </Paper>

      {analysis && (
        <>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', md: 'center' },
                flexDirection: { xs: 'column', md: 'row' },
                gap: 1.25,
              }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                  현장 높이 설정
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  경량석고·합지석고·단열 레이어의 길이에 현장 높이를 곱해 ㎡를 계산합니다. 그라스울은 현재 규칙을 적용하지 않습니다.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                  label="공통 높이"
                  value={commonHeight}
                  onChange={(event) => setCommonHeight(event.target.value)}
                  size="small"
                  type="number"
                  inputProps={{ min: 1, step: 1 }}
                  sx={{ width: 145 }}
                  InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
                />
                <Button variant="outlined" onClick={handleApplyCommonHeight}>전체 적용</Button>
                <Button
                  variant="contained"
                  onClick={handleSaveSettings}
                  disabled={settingsSaving || settingsLoading || heightRequiredLayers.length === 0}
                >
                  {settingsSaving ? '저장 중' : '높이 설정 저장'}
                </Button>
              </Box>
            </Box>

            {heightRequiredLayers.length > 0 ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(210px, 1fr))',
                    lg: 'repeat(4, minmax(210px, 1fr))',
                  },
                  gap: 1,
                  mt: 1.25,
                }}
              >
                {heightRequiredLayers.map((row) => (
                  <TextField
                    key={row.layer}
                    label={`${row.layer} 높이`}
                    value={heightSettings[row.layer] ?? ''}
                    onChange={(event) =>
                      setHeightSettings((previous) => ({
                        ...previous,
                        [row.layer]: event.target.value,
                      }))
                    }
                    size="small"
                    type="number"
                    required
                    error={safeHeightValue(heightSettings[row.layer]) <= 0}
                    helperText={
                      safeHeightValue(heightSettings[row.layer]) > 0
                        ? `적용 높이 ${formatNumber(safeHeightValue(heightSettings[row.layer]) / 1000)}M`
                        : '필수입력'
                    }
                    inputProps={{ min: 1, step: 1 }}
                    InputProps={{ endAdornment: <Typography variant="caption">mm</Typography> }}
                  />
                ))}
              </Box>
            ) : (
              <Alert severity="info" sx={{ mt: 1.25 }}>
                현재 도면에는 높이 입력이 필요한 WL-경량석고, WL-합지석고, WL-단열 레이어가 없습니다.
              </Alert>
            )}
          </Paper>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'minmax(650px, 1.05fr) minmax(560px, 0.95fr)' },
              gap: 1.5,
              alignItems: 'start',
              pb: 2,
            }}
          >
            <Paper variant="outlined" sx={{ minWidth: 0, overflow: 'hidden' }}>
              <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    WL- 활성 레이어 분석결과
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    DXF 원본과 분석결과는 현장·타입별로 저장되며 이후 저장된 타입 버튼으로 다시 열 수 있습니다.
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color="primary"
                  label={`${formatInteger(activeRows.length)}개 공정 레이어`}
                />
              </Box>

              <TableContainer sx={{ maxHeight: 580 }}>
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    minWidth: 760,
                    '& th, & td': {
                      whiteSpace: 'nowrap',
                      fontSize: '0.76rem',
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>Layer</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>길이</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>높이</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>공제</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>최종 수량</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>산출기준</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>상태</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeRows.map((row) => (
                      <TableRow key={row.layer} hover>
                        <TableCell sx={{ fontWeight: 700 }}>
                          {analysisLayerDisplayName(row.layer)}
                        </TableCell>
                        <TableCell align="right">
                          {row.lengthM > 0 ? `${formatNumber(row.lengthM)}M` : '-'}
                        </TableCell>
                        <TableCell align="right">
                          {row.heightMm ? `${formatNumber(row.heightMm / 1000)}M` : '-'}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ whiteSpace: 'normal !important' }}
                        >
                          {['㎡', 'M'].includes(row.unit) && row.deductionM2 > 0 ? (
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>-{formatNumber(row.deductionM2)}{row.unit}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
                                {row.unit === '㎡' ? `직접 ${formatNumber(row.manualDeductionM2)} + ` : ''}도면 {formatNumber(row.openingDeductionM2)}
                              </Typography>
                            </Box>
                          ) : '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>
                          {row.quantity === null || row.quantity === undefined
                            ? '-'
                            : `${formatNumber(row.quantity)}${row.unit}`}
                        </TableCell>
                        <TableCell>{row.rule.label}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.status}
                            color={row.severity === 'default' ? 'default' : row.severity}
                            variant={row.severity === 'success' ? 'filled' : 'outlined'}
                            sx={{ whiteSpace: 'nowrap' }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {activeRows.length === 0 && (
                <Alert severity="warning" sx={{ m: 1.25 }}>
                  WL-로 시작하는 활성 레이어가 없습니다.
                </Alert>
              )}
            </Paper>

            <DxfPreview
              analysis={analysis}
              heightSettings={heightSettings}
              rooms={drawingRooms}
              roomSettings={roomSettings}
              openings={openings}
              onOpenView={() => setViewOpen(true)}
            />
          </Box>
        </>
      )}

      {!analysis && !analyzing && !drawingLoading && (
        <Paper
          variant="outlined"
          sx={{
            minHeight: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
              저장 도면을 선택하거나 DXF 도면을 업로드해주세요.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              새 DXF는 분석과 동시에 저장되며, 저장된 타입 도면은 다음 접속에서도 바로 열 수 있습니다.
            </Typography>
          </Box>
        </Paper>
      )}

      <OpeningEditorDialog
        open={Boolean(openingEditor)}
        onClose={() => setOpeningEditor(null)}
        analysis={analysis}
        heightSettings={heightSettings}
        rooms={drawingRooms}
        roomSettings={roomSettings}
        initialRoomKey={openingEditor?.roomKey || ''}
        processLayers={openingProcessLayers}
        existingOpenings={openings}
        opening={openingEditor?.opening || null}
        onConfirm={applyOpening}
      />

      <FullDrawingDialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        analysis={analysis}
        heightSettings={heightSettings}
        typeName={typeName}
        rooms={drawingRooms}
        roomSettings={roomSettings}
        setRoomSettings={setRoomSettings}
        selectedRoomKey={selectedRoomKey}
        setSelectedRoomKey={setSelectedRoomKey}
        processLayers={deductionProcessLayers}
        roomSettingsLoading={roomSettingsLoading}
        roomSettingsSaving={roomSettingsSaving}
        onSaveRoomSettings={handleSaveRoomSettings}
        openings={openings}
        openingSaving={openingSettingsLoading || openingSettingsSaving}
        onAddOpening={(roomKey) => openOpeningEditor(null, roomKey)}
        onEditOpening={(opening) => openOpeningEditor(opening)}
        onDeleteOpening={deleteOpening}
        onSaveOpenings={handleSaveOpenings}
        onImportSchedule={handleImportScheduleDeductions}
        deductionTotalsByLayer={deductionTotalsByLayer}
        roomQuantityRowsByKey={roomQuantityRowsByKey}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          setToast(null);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={toast?.severity || 'info'} variant="filled" onClose={() => setToast(null)}>
          {toast?.text || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
