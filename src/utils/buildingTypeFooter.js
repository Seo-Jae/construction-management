import { buildFloorVisualCells, getCanonicalUnitNumber } from './buildingUnits.js';

/*
  층별 타입 예외가 화면 하단에서 실제 몇 줄을 차지하는지 계산합니다.
  BuildingGrid의 예외타입 압축 규칙과 동일합니다.

  - 같은 층에서 인접한 동일 타입은 하나의 segment
  - 동일 패턴 반복층은 1회만 표시
  - 서로 차지하는 호 범위가 겹치지 않으면 같은 행에 배치
*/
export const getPackedTypeExceptionRowCount = (config) => {
  const baseTypes = config?.unitTypes || {};
  const exceptionRows = [];
  const seenSignatures = new Set();

  Object.entries(config?.floorUnitTypes || {})
    .map(([floorKey, floorMap]) => [
      Number(floorKey),
      floorMap,
    ])
    .filter(
      ([floor, floorMap]) =>
        Number.isInteger(floor) &&
        floor > 0 &&
        floorMap &&
        typeof floorMap === 'object',
    )
    .sort(
      ([firstFloor], [secondFloor]) =>
        secondFloor - firstFloor,
    )
    .forEach(([floor, floorMap]) => {
      const rawSegments = [];

      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell?.type !== 'valid') return;

        const canonicalUnitNumber =
          getCanonicalUnitNumber(
            config,
            floor,
            cell.visualStart,
          );

        const overrideType =
          floorMap?.[canonicalUnitNumber] ??
          floorMap?.[String(canonicalUnitNumber)] ??
          floorMap?.[cell.visualStart] ??
          floorMap?.[String(cell.visualStart)];

        const normalizedOverrideType =
          String(overrideType || '').trim();

        if (!normalizedOverrideType) return;

        const baseType =
          String(
            baseTypes?.[canonicalUnitNumber] ??
              baseTypes?.[String(canonicalUnitNumber)] ??
              baseTypes?.[cell.visualStart] ??
              baseTypes?.[String(cell.visualStart)] ??
              '',
          ).trim();

        if (
          normalizedOverrideType ===
          baseType
        ) {
          return;
        }

        rawSegments.push({
          start: cell.visualStart,
          end: cell.visualEnd,
          typeName:
            normalizedOverrideType,
        });
      });

      rawSegments.sort(
        (first, second) =>
          first.start - second.start,
      );

      const mergedSegments = [];

      rawSegments.forEach((segment) => {
        const previous =
          mergedSegments[
            mergedSegments.length - 1
          ];

        if (
          previous &&
          previous.typeName ===
            segment.typeName &&
          previous.end + 1 ===
            segment.start
        ) {
          previous.end = segment.end;
          return;
        }

        mergedSegments.push({
          ...segment,
        });
      });

      const signature =
        mergedSegments
          .map(
            (segment) =>
              `${segment.start}-${segment.end}:${segment.typeName}`,
          )
          .join('|');

      if (
        !signature ||
        seenSignatures.has(signature)
      ) {
        return;
      }

      seenSignatures.add(signature);
      exceptionRows.push({
        segments: mergedSegments,
      });
    });

  const packedRows = [];

  exceptionRows.forEach((sourceRow) => {
    let targetRow = null;

    for (
      let rowIndex = 0;
      rowIndex < packedRows.length;
      rowIndex += 1
    ) {
      const candidate =
        packedRows[rowIndex];

      const overlaps =
        sourceRow.segments.some(
          (segment) =>
            candidate.segments.some(
              (existing) =>
                !(
                  segment.end <
                    existing.start ||
                  segment.start >
                    existing.end
                ),
            ),
        );

      if (!overlaps) {
        targetRow = candidate;
        break;
      }
    }

    if (!targetRow) {
      targetRow = {
        segments: [],
      };
      packedRows.push(targetRow);
    }

    targetRow.segments.push(
      ...sourceRow.segments,
    );
  });

  return packedRows.length;
};
