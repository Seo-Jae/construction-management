import { useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import BuildingGrid from '../BuildingGrid';

export default function FittedBuildingPreview({ name, config }) {
  const viewport = useRef(null);
  const content = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0, scale: 1 });
  useLayoutEffect(() => {
    const measure = () => {
      const width = content.current.offsetWidth;
      const height = content.current.offsetHeight;
      const scale = Math.min(1, Math.max(0, viewport.current.clientWidth - 24) / Math.max(1, width), Math.max(0, viewport.current.clientHeight - 24) / Math.max(1, height));
      setSize({ width, height, scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(content.current);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <Box ref={viewport} sx={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ position: 'relative', width: size.width * size.scale, height: size.height * size.scale, flexShrink: 0 }}>
        <Box ref={content} sx={{ position: 'absolute', top: 0, left: 0, width: 'max-content', transform: `scale(${size.scale})`, transformOrigin: 'top left' }}>
          <BuildingGrid buildingName={name} config={config} readOnly />
        </Box>
      </Box>
    </Box>
  );
}
