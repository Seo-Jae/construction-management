import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import BuildingGrid from '../BuildingGrid';
import { getPackedTypeExceptionRowCount } from '../utils/buildingTypeFooter.js';

export default function FittedBuildingPreview({ buildings }) {
  const typeFooterRowSlots = useMemo(() => buildings.reduce(
    (maxRows, building) => Math.max(maxRows, 1 + getPackedTypeExceptionRowCount(building.config)),
    1,
  ), [buildings]);
  const viewport = useRef(null);
  const content = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0, scale: 1 });
  const [view, setView] = useState({ scale: null, x: 0, y: 0 });
  const drag = useRef(null);
  const [panning, setPanning] = useState(false);
  const scale = view.scale ?? size.scale;
  const changeZoom = useCallback((nextScale, clientPoint) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientPoint ? clientPoint.x - rect.left - rect.width / 2 : 0;
    const y = clientPoint ? clientPoint.y - rect.top - rect.height / 2 : 0;
    setView(previous => {
      const currentScale = previous.scale ?? size.scale;
      const newScale = Math.min(3, Math.max(Math.min(0.1, size.scale), nextScale(currentScale)));
      const ratio = newScale / Math.max(0.0001, currentScale);
      return { scale: newScale, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio };
    });
  }, [size.scale]);
  const zoom = delta => changeZoom(current => current + delta);
  useEffect(() => {
    const element = viewport.current;
    const handleWheel = event => {
      event.preventDefault();
      if (drag.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      changeZoom(current => current * Math.exp(-delta * 0.0015), { x: event.clientX, y: event.clientY });
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);
  const startPan = event => {
    if (![0, 1].includes(event.button) || drag.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y };
    setPanning(true);
  };
  const movePan = event => {
    const origin = drag.current;
    if (!origin || origin.id !== event.pointerId) return;
    const x = origin.x + event.clientX - origin.clientX;
    const y = origin.y + event.clientY - origin.clientY;
    setView(previous => ({ ...previous, x, y }));
  };
  const endPan = event => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useLayoutEffect(() => {
    const measure = () => {
      const width = content.current.offsetWidth;
      const height = content.current.offsetHeight;
      const scale = Math.min(1, Math.max(0, viewport.current.clientWidth - 24) / Math.max(1, width), Math.max(0, viewport.current.clientHeight - 24) / Math.max(1, height));
      setSize(previous => previous.width === width && previous.height === height && previous.scale === scale ? previous : { width, height, scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(content.current);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Typography sx={{ mr: 'auto', color: '#64748b', fontSize: 12 }}>휠: 확대·축소 · 드래그: 이동</Typography>
        <Tooltip title="축소"><span><IconButton size="small" aria-label="골구도 축소" disabled={scale <= 0.1} onClick={() => zoom(-0.1)}><RemoveRoundedIcon /></IconButton></span></Tooltip>
        <Typography sx={{ minWidth: 48, textAlign: 'center', fontSize: 12 }}>{Math.round(scale * 100)}%</Typography>
        <Tooltip title="확대"><span><IconButton size="small" aria-label="골구도 확대" disabled={scale >= 3} onClick={() => zoom(0.1)}><AddRoundedIcon /></IconButton></span></Tooltip>
        <Button size="small" onClick={() => setView({ scale: null, x: 0, y: 0 })}>화면 맞춤</Button>
      </Box>
      <Box
        ref={viewport}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: panning ? 'grabbing' : 'grab' }}
      >
          <Box sx={{ position: 'absolute', left: `calc(50% + ${view.x}px)`, top: `calc(50% + ${view.y}px)`, transform: 'translate(-50%, -50%)', width: size.width * scale, height: size.height * scale }}>
        <Box ref={content} sx={{ position: 'absolute', top: 0, left: 0, width: 'max-content', display: 'flex', alignItems: 'flex-end', gap: 4, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {buildings.map(building => (
            <Box key={building.id} sx={{ flexShrink: 0 }}>
              <BuildingGrid buildingName={building.name} config={building.config} typeFooterRowSlots={typeFooterRowSlots} readOnly />
            </Box>
          ))}
        </Box>
          </Box>
      </Box>
    </Box>
  );
}
