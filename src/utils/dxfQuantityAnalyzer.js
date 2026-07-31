const DEG_TO_RAD = Math.PI / 180;

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeLayerName = (value) => String(value || '').trim();

const decodeUtf8OrKorean = (arrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
  } catch (_error) {
    try {
      return new TextDecoder('euc-kr').decode(arrayBuffer);
    } catch (_koreanError) {
      return new TextDecoder('utf-8').decode(arrayBuffer);
    }
  }
};

const parsePairs = (text) => {
  const lines = String(text || '').replace(/\u0000/g, '').split(/\r?\n/);
  const pairs = [];

  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[index + 1] ?? '' });
  }

  return pairs;
};

const getFirst = (record, code, fallback = '') => {
  const pair = record.find((item) => item.code === code);
  return pair ? pair.value : fallback;
};

const getAll = (record, code) =>
  record.filter((item) => item.code === code).map((item) => item.value);

const distance = (first, second) =>
  Math.hypot(second.x - first.x, second.y - first.y);

const bulgeSegmentLength = (first, second, bulge = 0) => {
  const chord = distance(first, second);
  if (!chord || Math.abs(bulge) < 1e-12) return chord;

  const theta = 4 * Math.atan(bulge);
  const denominator = 2 * Math.sin(Math.abs(theta) / 2);
  if (Math.abs(denominator) < 1e-12) return chord;

  const radius = chord / denominator;
  return Math.abs(radius * theta);
};

const bulgeAreaCorrection = (first, second, bulge = 0) => {
  const chord = distance(first, second);
  if (!chord || Math.abs(bulge) < 1e-12) return 0;

  const theta = 4 * Math.atan(bulge);
  const denominator = 2 * Math.sin(Math.abs(theta) / 2);
  if (Math.abs(denominator) < 1e-12) return 0;

  const radius = chord / denominator;
  return 0.5 * radius * radius * (theta - Math.sin(theta));
};

const calculatePolylineLength = (vertices, closed) => {
  if (!Array.isArray(vertices) || vertices.length < 2) return 0;

  let total = 0;
  for (let index = 0; index < vertices.length - 1; index += 1) {
    total += bulgeSegmentLength(
      vertices[index],
      vertices[index + 1],
      vertices[index].bulge,
    );
  }

  if (closed) {
    total += bulgeSegmentLength(
      vertices[vertices.length - 1],
      vertices[0],
      vertices[vertices.length - 1].bulge,
    );
  }

  return total;
};

const calculatePolylineArea = (vertices, closed) => {
  if (!closed || !Array.isArray(vertices) || vertices.length < 3) return 0;

  let doubledChordArea = 0;
  let curvedCorrection = 0;

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    doubledChordArea += current.x * next.y - next.x * current.y;
    curvedCorrection += bulgeAreaCorrection(current, next, current.bulge);
  }

  return Math.abs(doubledChordArea / 2 + curvedCorrection);
};

const parseLwPolylineVertices = (record) => {
  const vertices = [];
  let current = null;

  record.forEach((pair) => {
    if (pair.code === 10) {
      if (current) vertices.push(current);
      current = { x: toFiniteNumber(pair.value), y: 0, bulge: 0 };
      return;
    }

    if (!current) return;
    if (pair.code === 20) current.y = toFiniteNumber(pair.value);
    if (pair.code === 42) current.bulge = toFiniteNumber(pair.value);
  });

  if (current) vertices.push(current);
  return vertices;
};

const sampleArc = ({ center, radius, startAngle, endAngle, counterClockwise = true }) => {
  if (!center || !radius) return [];

  let sweep = endAngle - startAngle;
  if (counterClockwise) {
    while (sweep < 0) sweep += 360;
  } else {
    while (sweep > 0) sweep -= 360;
  }
  if (Math.abs(sweep) < 1e-9) sweep = counterClockwise ? 360 : -360;

  const count = Math.max(8, Math.ceil(Math.abs(sweep) / 10));
  return Array.from({ length: count + 1 }, (_unused, index) => {
    const angle = (startAngle + (sweep * index) / count) * DEG_TO_RAD;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
};

const stitchSegments = (segments) => {
  const points = [];
  segments.forEach((segment) => {
    const segmentPoints = segment || [];
    if (segmentPoints.length === 0) return;
    if (points.length === 0) {
      points.push(...segmentPoints);
      return;
    }

    const last = points[points.length - 1];
    const first = segmentPoints[0];
    if (distance(last, first) < 0.01) points.push(...segmentPoints.slice(1));
    else points.push(...segmentPoints);
  });
  return points;
};


const identityMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

// first(second(point)) 순서로 적용되는 2D affine matrix 결합
const multiplyMatrices = (first, second) => ({
  a: first.a * second.a + first.c * second.b,
  b: first.b * second.a + first.d * second.b,
  c: first.a * second.c + first.c * second.d,
  d: first.b * second.c + first.d * second.d,
  e: first.a * second.e + first.c * second.f + first.e,
  f: first.b * second.e + first.d * second.f + first.f,
});

const translationMatrix = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const scaleMatrix = (x, y) => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
const rotationMatrix = (degrees) => {
  const radians = toFiniteNumber(degrees) * DEG_TO_RAD;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
};

const transformPoint = (matrix, point) => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

const createInsertMatrix = (geometry = {}, basePoint = { x: 0, y: 0 }) => {
  const point = geometry.point || { x: 0, y: 0 };
  const scaleX = toFiniteNumber(geometry.scaleX, 1);
  const scaleY = toFiniteNumber(geometry.scaleY, 1);
  return multiplyMatrices(
    translationMatrix(point.x, point.y),
    multiplyMatrices(
      rotationMatrix(geometry.rotation || 0),
      multiplyMatrices(
        scaleMatrix(scaleX, scaleY),
        translationMatrix(-toFiniteNumber(basePoint.x), -toFiniteNumber(basePoint.y)),
      ),
    ),
  );
};

const matrixRotationDegrees = (matrix) => (Math.atan2(matrix.b, matrix.a) / DEG_TO_RAD);
const matrixAverageScale = (matrix) => {
  const xScale = Math.hypot(matrix.a, matrix.b);
  const yScale = Math.hypot(matrix.c, matrix.d);
  return Math.max(0.000001, (xScale + yScale) / 2);
};

const sampleCircle = (center, radius, count = 64) =>
  Array.from({ length: count }, (_unused, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });

const parseHatchPaths = (record) => {
  const loopCountIndex = record.findIndex((pair) => pair.code === 91);
  if (loopCountIndex < 0) return [];

  const loopCount = Math.max(0, Number.parseInt(record[loopCountIndex].value, 10) || 0);
  const paths = [];
  let index = loopCountIndex + 1;

  for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
    while (index < record.length && record[index].code !== 92) index += 1;
    if (index >= record.length) break;

    const pathFlags = Number.parseInt(record[index].value, 10) || 0;
    index += 1;

    if ((pathFlags & 2) === 2) {
      let closed = true;
      let vertexCount = 0;
      while (index < record.length && ![92, 93].includes(record[index].code)) {
        if (record[index].code === 73) closed = toFiniteNumber(record[index].value) === 1;
        index += 1;
      }
      if (record[index]?.code === 93) {
        vertexCount = Number.parseInt(record[index].value, 10) || 0;
        index += 1;
      }

      const vertices = [];
      for (let vertexIndex = 0; vertexIndex < vertexCount && index < record.length; vertexIndex += 1) {
        while (index < record.length && record[index].code !== 10) index += 1;
        if (index >= record.length) break;
        const point = { x: toFiniteNumber(record[index].value), y: 0, bulge: 0 };
        index += 1;
        while (index < record.length && ![10, 92, 97].includes(record[index].code)) {
          if (record[index].code === 20) point.y = toFiniteNumber(record[index].value);
          if (record[index].code === 42) point.bulge = toFiniteNumber(record[index].value);
          index += 1;
        }
        vertices.push(point);
      }
      if (vertices.length > 1) paths.push({ vertices, closed });
      continue;
    }

    while (index < record.length && record[index].code !== 93) index += 1;
    if (index >= record.length) break;
    const edgeCount = Number.parseInt(record[index].value, 10) || 0;
    index += 1;
    const segments = [];

    for (let edgeIndex = 0; edgeIndex < edgeCount && index < record.length; edgeIndex += 1) {
      while (index < record.length && record[index].code !== 72) index += 1;
      if (index >= record.length) break;
      const edgeType = Number.parseInt(record[index].value, 10) || 0;
      index += 1;

      if (edgeType === 1) {
        const values = {};
        while (index < record.length && record[index].code !== 72 && record[index].code !== 97) {
          if ([10, 20, 11, 21].includes(record[index].code)) {
            values[record[index].code] = toFiniteNumber(record[index].value);
          }
          index += 1;
          if ([10, 20, 11, 21].every((code) => Number.isFinite(values[code]))) break;
        }
        if ([10, 20, 11, 21].every((code) => Number.isFinite(values[code]))) {
          segments.push([
            { x: values[10], y: values[20] },
            { x: values[11], y: values[21] },
          ]);
        }
        continue;
      }

      if (edgeType === 2) {
        const values = {};
        while (index < record.length && record[index].code !== 72 && record[index].code !== 97) {
          if ([10, 20, 40, 50, 51, 73].includes(record[index].code)) {
            values[record[index].code] = toFiniteNumber(record[index].value);
          }
          index += 1;
          if ([10, 20, 40, 50, 51, 73].every((code) => Number.isFinite(values[code]))) break;
        }
        if ([10, 20, 40, 50, 51].every((code) => Number.isFinite(values[code]))) {
          segments.push(
            sampleArc({
              center: { x: values[10], y: values[20] },
              radius: Math.abs(values[40]),
              startAngle: values[50],
              endAngle: values[51],
              counterClockwise: values[73] !== 0,
            }),
          );
        }
        continue;
      }

      // 타원·스플라인 경계는 현재 미리보기에서 제외하되 다음 경계를 정상적으로 읽는다.
      while (index < record.length && record[index].code !== 72 && record[index].code !== 97) index += 1;
    }

    const vertices = stitchSegments(segments);
    if (vertices.length > 1) paths.push({ vertices, closed: true });

    while (index < record.length && record[index].code !== 92) {
      if (record[index].code === 97) {
        index += 1;
        break;
      }
      index += 1;
    }
  }

  return paths;
};

const makeEntity = ({
  type,
  layer,
  geometry,
  lengthMm = 0,
  areaMm2 = 0,
  closed = false,
  colorIndex = null,
}) => ({
  type,
  layer: normalizeLayerName(layer),
  geometry,
  lengthMm: Math.max(0, toFiniteNumber(lengthMm)),
  areaMm2: Math.max(0, toFiniteNumber(areaMm2)),
  closed: Boolean(closed),
  colorIndex: Number.isFinite(Number(colorIndex)) ? Number(colorIndex) : null,
});

const parseSimpleEntity = (type, record) => {
  const layer = getFirst(record, 8, '0');
  const colorIndex = getFirst(record, 62, null);

  if (type === 'LINE') {
    const start = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    const end = { x: toFiniteNumber(getFirst(record, 11)), y: toFiniteNumber(getFirst(record, 21)) };
    return makeEntity({ type, layer, geometry: { start, end }, lengthMm: distance(start, end), colorIndex });
  }

  if (type === 'LWPOLYLINE') {
    const vertices = parseLwPolylineVertices(record);
    const flags = toFiniteNumber(getFirst(record, 70));
    const closed = (flags & 1) === 1;
    return makeEntity({
      type,
      layer,
      geometry: { vertices },
      lengthMm: calculatePolylineLength(vertices, closed),
      areaMm2: calculatePolylineArea(vertices, closed),
      closed,
      colorIndex,
    });
  }

  if (type === 'CIRCLE') {
    const center = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    const radius = Math.abs(toFiniteNumber(getFirst(record, 40)));
    return makeEntity({
      type,
      layer,
      geometry: { center, radius },
      lengthMm: 2 * Math.PI * radius,
      areaMm2: Math.PI * radius * radius,
      closed: true,
      colorIndex,
    });
  }

  if (type === 'ARC') {
    const center = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    const radius = Math.abs(toFiniteNumber(getFirst(record, 40)));
    const startAngle = toFiniteNumber(getFirst(record, 50));
    const endAngle = toFiniteNumber(getFirst(record, 51));
    let sweep = endAngle - startAngle;
    while (sweep < 0) sweep += 360;
    while (sweep >= 360) sweep -= 360;
    return makeEntity({
      type,
      layer,
      geometry: { center, radius, startAngle, endAngle, sweep },
      lengthMm: radius * sweep * DEG_TO_RAD,
      colorIndex,
    });
  }

  if (type === 'HATCH') {
    const paths = parseHatchPaths(record);
    const allVertices = paths.flatMap((path) => path.vertices || []);
    const lengthMm = paths.reduce(
      (sum, path) => sum + calculatePolylineLength(path.vertices || [], path.closed !== false),
      0,
    );
    const areaMm2 = paths.reduce(
      (sum, path) => sum + calculatePolylineArea(path.vertices || [], path.closed !== false),
      0,
    );
    return makeEntity({
      type,
      layer,
      geometry: {
        paths,
        vertices: allVertices,
        patternName: String(getFirst(record, 2, '')).trim(),
        solid: toFiniteNumber(getFirst(record, 70)) === 1,
      },
      lengthMm,
      areaMm2,
      closed: true,
      colorIndex,
    });
  }

  if (type === 'TEXT' || type === 'MTEXT') {
    const point = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    const textParts = type === 'MTEXT' ? [...getAll(record, 3), ...getAll(record, 1)] : getAll(record, 1);
    return makeEntity({
      type,
      layer,
      geometry: {
        point,
        text: textParts.join('').replace(/\\P/g, ' '),
        height: Math.abs(toFiniteNumber(getFirst(record, 40), 120)),
        rotation: toFiniteNumber(getFirst(record, 50)),
      },
      colorIndex,
    });
  }

  if (type === 'INSERT') {
    const point = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    return makeEntity({
      type,
      layer,
      geometry: {
        point,
        blockName: String(getFirst(record, 2, '')).trim(),
        scaleX: toFiniteNumber(getFirst(record, 41, '1'), 1),
        scaleY: toFiniteNumber(getFirst(record, 42, '1'), 1),
        rotation: toFiniteNumber(getFirst(record, 50)),
      },
      colorIndex,
    });
  }

  if (type === 'POINT') {
    const point = { x: toFiniteNumber(getFirst(record, 10)), y: toFiniteNumber(getFirst(record, 20)) };
    return makeEntity({ type, layer, geometry: { point }, colorIndex });
  }

  if (type === 'SPLINE') {
    const xValues = getAll(record, 10).map(toFiniteNumber);
    const yValues = getAll(record, 20).map(toFiniteNumber);
    const points = xValues.map((x, index) => ({ x, y: yValues[index] ?? 0 }));
    let lengthMm = 0;
    for (let index = 0; index < points.length - 1; index += 1) lengthMm += distance(points[index], points[index + 1]);
    return makeEntity({ type, layer, geometry: { points }, lengthMm, colorIndex });
  }

  return makeEntity({ type, layer, geometry: {}, colorIndex });
};

const extractSection = (pairs, sectionName) => {
  let inSection = false;
  const sectionPairs = [];
  const wanted = String(sectionName || '').trim().toUpperCase();

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (
      pair.code === 0 &&
      String(pair.value).trim().toUpperCase() === 'SECTION' &&
      pairs[index + 1]?.code === 2 &&
      String(pairs[index + 1]?.value).trim().toUpperCase() === wanted
    ) {
      inSection = true;
      index += 1;
      continue;
    }
    if (inSection && pair.code === 0 && String(pair.value).trim().toUpperCase() === 'ENDSEC') break;
    if (inSection) sectionPairs.push(pair);
  }

  return sectionPairs;
};

const parseEntities = (pairs) => {
  const entities = [];
  let index = 0;

  while (index < pairs.length) {
    if (pairs[index].code !== 0) {
      index += 1;
      continue;
    }

    const type = String(pairs[index].value || '').trim().toUpperCase();

    if (type === 'POLYLINE') {
      const header = [];
      index += 1;
      while (index < pairs.length && pairs[index].code !== 0) {
        header.push(pairs[index]);
        index += 1;
      }

      const vertices = [];
      while (index < pairs.length) {
        if (pairs[index].code !== 0) {
          index += 1;
          continue;
        }

        const nestedType = String(pairs[index].value || '').trim().toUpperCase();
        if (nestedType === 'SEQEND') {
          index += 1;
          while (index < pairs.length && pairs[index].code !== 0) index += 1;
          break;
        }
        if (nestedType !== 'VERTEX') break;

        const vertexRecord = [];
        index += 1;
        while (index < pairs.length && pairs[index].code !== 0) {
          vertexRecord.push(pairs[index]);
          index += 1;
        }
        vertices.push({
          x: toFiniteNumber(getFirst(vertexRecord, 10)),
          y: toFiniteNumber(getFirst(vertexRecord, 20)),
          bulge: toFiniteNumber(getFirst(vertexRecord, 42)),
        });
      }

      const flags = toFiniteNumber(getFirst(header, 70));
      const closed = (flags & 1) === 1;
      entities.push(
        makeEntity({
          type,
          layer: getFirst(header, 8, '0'),
          geometry: { vertices },
          lengthMm: calculatePolylineLength(vertices, closed),
          areaMm2: calculatePolylineArea(vertices, closed),
          closed,
          colorIndex: getFirst(header, 62, null),
        }),
      );
      continue;
    }

    const record = [];
    index += 1;
    while (index < pairs.length && pairs[index].code !== 0) {
      record.push(pairs[index]);
      index += 1;
    }

    if (!['ENDSEC', 'EOF', 'SEQEND', 'VERTEX'].includes(type)) entities.push(parseSimpleEntity(type, record));
  }

  return entities;
};


const parseBlocks = (pairs) => {
  const blocks = new Map();
  let index = 0;

  while (index < pairs.length) {
    if (pairs[index].code !== 0 || String(pairs[index].value || '').trim().toUpperCase() !== 'BLOCK') {
      index += 1;
      continue;
    }

    const header = [];
    index += 1;
    while (index < pairs.length && pairs[index].code !== 0) {
      header.push(pairs[index]);
      index += 1;
    }

    const entityPairs = [];
    while (
      index < pairs.length &&
      !(
        pairs[index].code === 0 &&
        String(pairs[index].value || '').trim().toUpperCase() === 'ENDBLK'
      )
    ) {
      entityPairs.push(pairs[index]);
      index += 1;
    }

    if (index < pairs.length) {
      index += 1;
      while (index < pairs.length && pairs[index].code !== 0) index += 1;
    }

    const name = String(getFirst(header, 2, '')).trim();
    if (!name) continue;
    blocks.set(name, {
      name,
      basePoint: {
        x: toFiniteNumber(getFirst(header, 10)),
        y: toFiniteNumber(getFirst(header, 20)),
      },
      entities: parseEntities(entityPairs),
    });
  }

  return blocks;
};

const transformRenderEntity = (entity, matrix, inheritedLayer, sourceBlockName) => {
  const geometry = entity.geometry || {};
  const layer = normalizeLayerName(entity.layer) === '0'
    ? normalizeLayerName(inheritedLayer || '0')
    : normalizeLayerName(entity.layer);
  const common = {
    layer,
    colorIndex: entity.colorIndex,
    renderOnly: true,
    sourceBlockName,
  };

  if (entity.type === 'LINE' && geometry.start && geometry.end) {
    const start = transformPoint(matrix, geometry.start);
    const end = transformPoint(matrix, geometry.end);
    return { ...makeEntity({ type: 'LINE', layer, geometry: { start, end }, lengthMm: distance(start, end), colorIndex: entity.colorIndex }), ...common };
  }

  if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
    const vertices = (geometry.vertices || []).map((point) => ({ ...transformPoint(matrix, point), bulge: 0 }));
    return {
      ...makeEntity({
        type: entity.type,
        layer,
        geometry: { vertices },
        lengthMm: calculatePolylineLength(vertices, entity.closed),
        areaMm2: calculatePolylineArea(vertices, entity.closed),
        closed: entity.closed,
        colorIndex: entity.colorIndex,
      }),
      ...common,
    };
  }

  if (entity.type === 'CIRCLE' && geometry.center && geometry.radius) {
    const vertices = sampleCircle(geometry.center, geometry.radius).map((point) => transformPoint(matrix, point));
    return {
      ...makeEntity({
        type: 'POLYLINE',
        layer,
        geometry: { vertices },
        lengthMm: calculatePolylineLength(vertices, true),
        areaMm2: calculatePolylineArea(vertices, true),
        closed: true,
        colorIndex: entity.colorIndex,
      }),
      ...common,
      sourceEntityType: 'CIRCLE',
    };
  }

  if (entity.type === 'ARC') {
    const vertices = sampleArc({
      center: geometry.center,
      radius: geometry.radius,
      startAngle: geometry.startAngle,
      endAngle: geometry.endAngle,
      counterClockwise: true,
    }).map((point) => transformPoint(matrix, point));
    return {
      ...makeEntity({
        type: 'POLYLINE',
        layer,
        geometry: { vertices },
        lengthMm: calculatePolylineLength(vertices, false),
        closed: false,
        colorIndex: entity.colorIndex,
      }),
      ...common,
      sourceEntityType: 'ARC',
    };
  }

  if (entity.type === 'HATCH') {
    const paths = (geometry.paths || []).map((path) => ({
      ...path,
      vertices: (path.vertices || []).map((point) => transformPoint(matrix, point)),
    }));
    return {
      ...makeEntity({
        type: 'HATCH',
        layer,
        geometry: { ...geometry, paths, vertices: paths.flatMap((path) => path.vertices || []) },
        lengthMm: paths.reduce((sum, path) => sum + calculatePolylineLength(path.vertices || [], path.closed !== false), 0),
        areaMm2: paths.reduce((sum, path) => sum + calculatePolylineArea(path.vertices || [], path.closed !== false), 0),
        closed: true,
        colorIndex: entity.colorIndex,
      }),
      ...common,
    };
  }

  if (['TEXT', 'MTEXT'].includes(entity.type) && geometry.point) {
    return {
      ...makeEntity({
        type: entity.type,
        layer,
        geometry: {
          ...geometry,
          point: transformPoint(matrix, geometry.point),
          height: Math.abs(toFiniteNumber(geometry.height, 120) * matrixAverageScale(matrix)),
          rotation: toFiniteNumber(geometry.rotation) + matrixRotationDegrees(matrix),
        },
        colorIndex: entity.colorIndex,
      }),
      ...common,
    };
  }

  if (entity.type === 'SPLINE') {
    const points = (geometry.points || []).map((point) => transformPoint(matrix, point));
    let lengthMm = 0;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      lengthMm += distance(points[pointIndex], points[pointIndex + 1]);
    }
    return {
      ...makeEntity({ type: 'SPLINE', layer, geometry: { points }, lengthMm, colorIndex: entity.colorIndex }),
      ...common,
    };
  }

  return null;
};

const expandInsertEntity = ({
  insert,
  blocks,
  parentMatrix = identityMatrix(),
  inheritedLayer = '0',
  depth = 0,
  ancestry = [],
}) => {
  if (!insert || depth > 8) return [];
  const blockName = String(insert.geometry?.blockName || '').trim();
  const block = blocks.get(blockName);
  if (!block || ancestry.includes(blockName)) return [];

  const insertLayer = normalizeLayerName(insert.layer) === '0'
    ? normalizeLayerName(inheritedLayer || '0')
    : normalizeLayerName(insert.layer);
  const matrix = multiplyMatrices(parentMatrix, createInsertMatrix(insert.geometry, block.basePoint));
  const nextAncestry = [...ancestry, blockName];
  const expanded = [];

  block.entities.forEach((child) => {
    const childLayer = normalizeLayerName(child.layer) === '0' ? insertLayer : child.layer;
    if (child.type === 'INSERT') {
      expanded.push(
        ...expandInsertEntity({
          insert: { ...child, layer: childLayer },
          blocks,
          parentMatrix: matrix,
          inheritedLayer: insertLayer,
          depth: depth + 1,
          ancestry: nextAncestry,
        }),
      );
      return;
    }

    const transformed = transformRenderEntity(child, matrix, childLayer, blockName);
    if (transformed) expanded.push(transformed);
  });

  return expanded;
};

const entityHasPointNearBounds = (entity, bounds, margin) => {
  const minX = bounds.minX - margin;
  const maxX = bounds.maxX + margin;
  const minY = bounds.minY - margin;
  const maxY = bounds.maxY + margin;
  const geometry = entity.geometry || {};
  const points = [];
  if (geometry.start) points.push(geometry.start);
  if (geometry.end) points.push(geometry.end);
  if (geometry.point) points.push(geometry.point);
  (geometry.vertices || []).forEach((point) => points.push(point));
  (geometry.points || []).forEach((point) => points.push(point));
  (geometry.paths || []).forEach((path) => (path.vertices || []).forEach((point) => points.push(point)));
  return points.some((point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY);
};

const updateBoundsWithPoint = (bounds, point) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
};

const calculateBounds = (entities) => {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  entities.forEach((entity) => {
    // 블록 기준점은 실제 블록 형상과 멀리 떨어진 경우가 있어 전체 도면 중심을 왜곡한다.
    if (entity.type === 'INSERT' || entity.type === 'POINT') return;
    const geometry = entity.geometry || {};
    if (geometry.start) updateBoundsWithPoint(bounds, geometry.start);
    if (geometry.end) updateBoundsWithPoint(bounds, geometry.end);
    (geometry.vertices || []).forEach((point) => updateBoundsWithPoint(bounds, point));
    (geometry.points || []).forEach((point) => updateBoundsWithPoint(bounds, point));
    (geometry.paths || []).forEach((path) =>
      (path.vertices || []).forEach((point) => updateBoundsWithPoint(bounds, point)),
    );

    if (geometry.center && Number.isFinite(geometry.radius)) {
      updateBoundsWithPoint(bounds, { x: geometry.center.x - geometry.radius, y: geometry.center.y - geometry.radius });
      updateBoundsWithPoint(bounds, { x: geometry.center.x + geometry.radius, y: geometry.center.y + geometry.radius });
    }

    if (['TEXT', 'MTEXT'].includes(entity.type) && geometry.point) {
      updateBoundsWithPoint(bounds, geometry.point);
      const width = Math.max(geometry.height || 100, String(geometry.text || '').length * (geometry.height || 100) * 0.7);
      updateBoundsWithPoint(bounds, { x: geometry.point.x + width, y: geometry.point.y + (geometry.height || 100) });
    }
  });

  if (!Number.isFinite(bounds.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  return {
    ...bounds,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
};

const summarizeLayers = (entities) => {
  const map = new Map();

  entities.forEach((entity) => {
    if (entity.renderOnly) return;
    const layer = normalizeLayerName(entity.layer || '0');
    const previous = map.get(layer) || {
      layer,
      active: layer.startsWith('WL-'),
      objectCount: 0,
      totalLengthMm: 0,
      closedAreaMm2: 0,
      closedPolylineCount: 0,
      openPolylineCount: 0,
      entityTypes: {},
    };

    previous.objectCount += 1;
    previous.totalLengthMm += entity.lengthMm || 0;
    previous.closedAreaMm2 += entity.areaMm2 || 0;
    previous.entityTypes[entity.type] = (previous.entityTypes[entity.type] || 0) + 1;

    if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) {
      if (entity.closed) previous.closedPolylineCount += 1;
      else previous.openPolylineCount += 1;
    }

    map.set(layer, previous);
  });

  return Array.from(map.values()).sort((first, second) => first.layer.localeCompare(second.layer, 'ko'));
};

export const classifyQuantityLayer = (layerName) => {
  const normalized = normalizeLayerName(layerName).replace(/\s+/g, '');
  if (!normalized.startsWith('WL-')) return { mode: 'background', label: '배경 도면', requiresHeight: false };
  if (normalized === 'WL-실면적' || normalized.startsWith('WL-실면적-')) {
    return { mode: 'room_boundary', label: '실 경계', requiresHeight: false };
  }
  if (normalized.includes('그라스울')) return { mode: 'pending', label: '규칙 미설정', requiresHeight: false };
  if (normalized.includes('경량석고') || normalized.includes('합지석고') || normalized.startsWith('WL-단열')) {
    return { mode: 'length_to_area', label: '길이×높이', requiresHeight: true };
  }
  if (normalized.includes('천정면적') || normalized.includes('천장면적')) {
    return { mode: 'closed_area', label: '폐합면적', requiresHeight: false };
  }
  if (normalized.includes('몰딩') || normalized.includes('걸레받이')) {
    return { mode: 'length', label: '길이', requiresHeight: false };
  }
  return { mode: 'reference', label: '길이 참고', requiresHeight: false };
};

export const analyzeDxfArrayBuffer = (arrayBuffer) => {
  const text = decodeUtf8OrKorean(arrayBuffer);
  const pairs = parsePairs(text);
  const entityPairs = extractSection(pairs, 'ENTITIES');
  const blockPairs = extractSection(pairs, 'BLOCKS');

  if (entityPairs.length === 0) {
    throw new Error('DXF의 ENTITIES 구간을 찾지 못했습니다. ASCII DXF 파일인지 확인해주세요.');
  }

  const sourceEntities = parseEntities(entityPairs);
  if (sourceEntities.length === 0) throw new Error('분석 가능한 DXF 객체가 없습니다.');

  const blocks = parseBlocks(blockPairs);
  const sourceBounds = calculateBounds(sourceEntities);
  const expandedEntities = sourceEntities
    .filter(
      (entity) =>
        entity.type === 'INSERT' &&
        !normalizeLayerName(entity.layer).startsWith('WL-'),
    )
    .flatMap((insert) => expandInsertEntity({ insert, blocks, inheritedLayer: insert.layer || '0' }));

  // 잘못된 기준점의 외부 블록 하나가 전체 화면 맞춤을 망가뜨리지 않도록
  // 본 도면 범위 부근의 확장 형상만 표시·스냅 대상으로 포함한다.
  const proximityMargin = Math.max(sourceBounds.width, sourceBounds.height) * 0.55;
  const visibleExpandedEntities =
    sourceBounds.width <= 1 && sourceBounds.height <= 1
      ? expandedEntities
      : expandedEntities.filter((entity) => entityHasPointNearBounds(entity, sourceBounds, proximityMargin));
  const entities = [...sourceEntities, ...visibleExpandedEntities];
  const layers = summarizeLayers(entities);
  const activeLayers = layers.filter((layer) => layer.active);

  return {
    entities,
    layers,
    activeLayers,
    bounds: calculateBounds(entities),
    totalObjectCount: sourceEntities.length,
    renderedBlockObjectCount: visibleExpandedEntities.length,
    activeObjectCount: activeLayers.reduce((sum, layer) => sum + layer.objectCount, 0),
    analyzerVersion: 'v51.67',
  };
};

export const formatMeters = (millimeters) => toFiniteNumber(millimeters) / 1000;
export const formatSquareMeters = (squareMillimeters) => toFiniteNumber(squareMillimeters) / 1_000_000;
