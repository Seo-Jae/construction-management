import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const STORAGE_BUCKET = 'drawing-quantity-files';
const ANALYZER_VERSION = 'v51.51';
const MAX_DXF_FILE_SIZE = 25 * 1024 * 1024;

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

const dedupeSelectedLayerEntities = (entities = [], selectedLayer = '') => {
  if (!selectedLayer) return entities;
  const seen = new Set();
  return entities.filter((entity) => {
    if (String(entity.layer || '').trim() !== selectedLayer) return true;
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

const getEntityStyle = (entity, selectedLayer, patternId, displayMode = 'view') => {
  const layer = String(entity.layer || '').trim();
  const compact = layer.replace(/\s+/g, '').toUpperCase();
  const active = layer.startsWith('WL-');
  const hasSelectedLayer = Boolean(selectedLayer);
  const selected = hasSelectedLayer && selectedLayer === layer;
  const patternName = String(entity.geometry?.patternName || '').replace(/\s+/g, '').toUpperCase();

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
        stroke: '#dc2626',
        fill: 'none',
        opacity: 1,
        strokeScale: 1.25,
        pointerEnabled: true,
        selectedRange: true,
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
  baseStrokeWidth,
  patternId,
  displayMode,
}) {
  const geometry = entity.geometry || {};
  const style = getEntityStyle(entity, selectedLayer, patternId, displayMode);
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

  const isClosedRange = Boolean(entity.closed || entity.type === 'HATCH');
  const selectedRangeShape = style.selectedRange
    ? React.cloneElement(shape, {
        stroke: '#bfdbfe',
        fill: isClosedRange ? '#dbeafe' : 'none',
        strokeWidth: isClosedRange
          ? Math.max(1.2, baseStrokeWidth * 1.4)
          : Math.max(20, baseStrokeWidth * 10),
        opacity: 0.82,
        pointerEvents: 'none',
      })
    : null;

  return (
    <g key={`${entity.type}-${entity.layer}-${index}`} opacity={style.opacity} pointerEvents="none">
      {selectedRangeShape}
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
  baseStrokeWidth,
  patternId,
  displayMode,
}) {
  return (
    <g transform="scale(1,-1)">
      {entities.map((entity, index) => (
        <DxfEntityShape
          key={`${entity.type}-${entity.layer}-${index}`}
          entity={entity}
          index={index}
          selectedLayer={selectedLayer}
          baseStrokeWidth={baseStrokeWidth}
          patternId={patternId}
          displayMode={displayMode}
        />
      ))}
    </g>
  );
});

function MeasurementMagnifier({
  centerPoint,
  snapPointValue,
  currentPoints,
  entities,
  selectedLayer,
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
  interactive = false,
  displayMode = 'view',
  tooltipEnabled = false,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const fittedViewBox = useMemo(() => getFittedViewBox(analysis.bounds), [analysis.bounds]);
  const [currentViewBox, setCurrentViewBox] = useState(fittedViewBox);
  const [tooltip, setTooltip] = useState(null);
  const [toolMode, setToolMode] = useState('pan');
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
    () => dedupeSelectedLayerEntities(analysis.entities || [], selectedLayer),
    [analysis.entities, selectedLayer],
  );

  const selectedEntities = useMemo(
    () =>
      selectedLayer
        ? renderedEntities.filter((entity) => String(entity.layer || '').trim() === selectedLayer)
        : [],
    [renderedEntities, selectedLayer],
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
    setToolMode('pan');
    setMeasurements([]);
    setCurrentMeasurementPoints([]);
    setHoverMeasurePoint(null);
    setHoverRawPoint(null);
    setIsDragging(false);
  }, [fittedViewBox]);

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
      if (event.key === 'Escape' && toolMode !== 'pan') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setCurrentMeasurementPoints([]);
        setHoverMeasurePoint(null);
        setHoverRawPoint(null);
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
  }, [interactive, toolMode]);

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

      const previousPoint = currentMeasurementPoints[currentMeasurementPoints.length - 1];
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
      if (toolMode === 'continuous' && currentMeasurementPoints.length >= 3) {
        const firstPoint = currentMeasurementPoints[0];
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
    [currentMeasurementPoints, modelToleranceFromPixels, snapPoints, snapSegments, toolMode],
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
    if (toolMode !== 'pan' && drag.button === 0 && !drag.moved) {
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
            끝점·근처점·직각 스냅 · {toolMode === 'continuous' ? '첫 점으로 닫으면 면적 표시 · Enter/더블클릭 완료 · Backspace 마지막점 취소 · ' : ''}ESC 현재 측정만 취소
          </Typography>
        </Paper>
      )}

      {interactive && toolMode !== 'pan' && hoverRawPoint && (
        <MeasurementMagnifier
          centerPoint={hoverRawPoint}
          snapPointValue={hoverMeasurePoint}
          currentPoints={currentMeasurementPoints}
          entities={renderedEntities}
          selectedLayer={selectedLayer}
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
          baseStrokeWidth={baseStrokeWidth}
          patternId={patternId}
          displayMode={displayMode}
        />
        {interactive && (
          <g transform="scale(1,-1)">
            <MeasurementOverlay
              measurements={measurements}
              currentPoints={currentMeasurementPoints}
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

function DxfPreview({ analysis, heightSettings, onOpenView }) {
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
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            도면 미리보기
          </Typography>
          <Typography variant="caption" color="text.secondary">
            골조·조적은 일반 검정계열 선과 해치로 표시됩니다. 미리보기에서는 공정 산출정보를 표시하지 않습니다.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip size="small" label={`전체 ${formatInteger(analysis.totalObjectCount)}개`} />
          <Button size="small" variant="contained" onClick={onOpenView}>
            도면 VIEW
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
          height: { xs: 380, lg: 540 },
          minHeight: 300,
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
            클릭시 도면 VIEW
          </Typography>
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
}) {
  const [selectedLayer, setSelectedLayer] = useState('');
  const [layerOrder, setLayerOrder] = useState([]);

  useEffect(() => {
    if (!open || !analysis) return;
    const sorted = sortLayersByDefaultOrder(analysis.activeLayers || []);
    setSelectedLayer('');
    setLayerOrder(sorted.map((layer) => layer.layer));
  }, [open, analysis]);

  const orderedLayers = useMemo(() => {
    if (!analysis) return [];
    const layerMap = new Map((analysis.activeLayers || []).map((layer) => [layer.layer, layer]));
    const ordered = layerOrder.map((layerName) => layerMap.get(layerName)).filter(Boolean);
    const missing = sortLayersByDefaultOrder(
      (analysis.activeLayers || []).filter((layer) => !layerOrder.includes(layer.layer)),
    );
    return [...ordered, ...missing];
  }, [analysis, layerOrder]);

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

  if (!analysis) return null;

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ px: 2, py: 1.25, borderBottom: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 900 }}>
              {typeName || '-'} 도면 VIEW
            </Typography>
            <Typography variant="caption" color="text.secondary">
              마우스 휠 확대·축소, 이동 모드에서 드래그 · 측정 모드에서는 우측 상단 확대창과 끝점·근처점·직각 스냅을 사용합니다.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={onClose}>닫기</Button>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, p: 1, bgcolor: '#f8fafc' }}>
            <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
              <DrawingCanvas
                analysis={analysis}
                heightSettings={heightSettings}
                selectedLayer={selectedLayer}
                interactive
                displayMode="view"
                tooltipEnabled={Boolean(selectedLayer)}
              />
            </Paper>
          </Box>

          <Paper
            square
            elevation={0}
            sx={{
              width: { xs: 230, md: 310 },
              flexShrink: 0,
              borderLeft: '1px solid #cbd5e1',
              p: 1.25,
              overflow: 'auto',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.75 }}>
              공정 레이어
            </Typography>

            <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25 }}>
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
              const result = getLayerResult(layer, heightSettings);
              const selected = selectedLayer === layer.layer;
              return (
                <Button
                  key={layer.layer}
                  fullWidth
                  variant={selected ? 'contained' : 'outlined'}
                  color={selected ? 'error' : 'primary'}
                  onClick={() => setSelectedLayer(layer.layer)}
                  sx={{
                    mb: 0.75,
                    py: 0.8,
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
                    <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                      {result.quantity === null || result.quantity === undefined
                        ? result.status
                        : `${formatNumber(result.quantity)}${result.unit}`}
                    </Typography>
                  </Box>
                  <Typography component="span" variant="caption" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                    {formatInteger(layer.objectCount)}개
                  </Typography>
                </Button>
              );
            })}

            <Button
              fullWidth
              variant={!selectedLayer ? 'contained' : 'outlined'}
              color="primary"
              onClick={() => setSelectedLayer('')}
              sx={{
                mt: 0.25,
                py: 0.9,
                px: 1,
                justifyContent: 'flex-start',
                textAlign: 'left',
                textTransform: 'none',
              }}
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
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions sx={{ py: 0.75, borderTop: '1px solid #e2e8f0' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 1 }}>
          겹치는 동일 객체는 한 번만 표시하며, 커서 정보는 가장 가까운 객체 한 건만 보여줍니다.
        </Typography>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DrawingQuantityAnalysis({ projectName, userProfile }) {
  const fileInputRef = useRef(null);
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
  const [toast, setToast] = useState(null);

  const activeRows = useMemo(() => {
    if (!analysis) return [];
    return (analysis.activeLayers || []).map((layer) => ({
      ...layer,
      ...getLayerResult(layer, heightSettings),
    }));
  }, [analysis, heightSettings]);

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

      if (!nextAnalysis?.entities?.length) {
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

  useEffect(() => {
    let active = true;

    const loadProjectData = async () => {
      setAnalysis(null);
      setCurrentDrawing(null);
      setSelectedFileName('');
      setTypeName('');
      setSavedDrawings([]);
      setHeightSettings({});
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
                  label={`${formatInteger(analysis.activeLayers.length)}개 레이어 · ${formatInteger(analysis.activeObjectCount)}개 객체`}
                />
              </Box>

              <TableContainer sx={{ maxHeight: 580 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>레이어</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>객체</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>원본 길이</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>적용 높이</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>최종 수량</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>산출기준</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>상태</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeRows.map((row) => (
                      <TableRow key={row.layer} hover>
                        <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{row.layer}</TableCell>
                        <TableCell align="right">{formatInteger(row.objectCount)}</TableCell>
                        <TableCell align="right">{row.lengthM > 0 ? `${formatNumber(row.lengthM)}M` : '-'}</TableCell>
                        <TableCell align="right">
                          {row.heightMm ? `${formatNumber(row.heightMm / 1000)}M` : '-'}
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
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {analysis.activeLayers.length === 0 && (
                <Alert severity="warning" sx={{ m: 1.25 }}>
                  WL-로 시작하는 활성 레이어가 없습니다.
                </Alert>
              )}
            </Paper>

            <DxfPreview
              analysis={analysis}
              heightSettings={heightSettings}
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

      <FullDrawingDialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        analysis={analysis}
        heightSettings={heightSettings}
        typeName={typeName}
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
