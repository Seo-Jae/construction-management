// v52.48.5.44.63 가이드 화면 이미지 - 번호 없는 설명박스 지원
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import {
  getGuideBadgePosition,
  getGuideConnectorPoints,
  normalizeGuideAnnotations,
} from '../config/guideCatalog.js';

const GUIDE_ANNOTATION_REFERENCE_WIDTH = 1000;

export default function GuideAnnotatedImage({ src, alt = '가이드 화면', annotations = [], maxHeight = 620 }) {
  const markerId = `guide-arrow-${useId().replace(/:/g, '')}`;
  const items = normalizeGuideAnnotations(annotations);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const outerRef = useRef(null);
  const imageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [annotationScale, setAnnotationScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const image = imageRef.current;
    if (!outer || !image) return undefined;

    const sync = () => {
      const naturalWidth = Number(image.naturalWidth) || 0;
      const naturalHeight = Number(image.naturalHeight) || 0;
      const availableWidth = Math.max(1, outer.clientWidth || outer.getBoundingClientRect().width || 0);
      if (!naturalWidth || !naturalHeight || !availableWidth) return;

      const maxHeightValue = Number(maxHeight) > 0 ? Number(maxHeight) : Number.POSITIVE_INFINITY;
      const scale = Math.min(1, availableWidth / naturalWidth, maxHeightValue / naturalHeight);
      const width = Math.max(1, naturalWidth * scale);
      const height = Math.max(1, naturalHeight * scale);

      setStageSize((prev) => (
        Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height }
      ));

      const next = Math.max(0.25, Math.min(3, width / GUIDE_ANNOTATION_REFERENCE_WIDTH));
      setAnnotationScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    };

    sync();
    image.addEventListener('load', sync);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(outer);
    window.addEventListener('resize', sync);
    return () => {
      image.removeEventListener('load', sync);
      ro?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [src, maxHeight]);

  if (!src) return null;
  const s = annotationScale;
  const hasSize = stageSize.width > 0 && stageSize.height > 0;

  return (
    <Box ref={outerRef} sx={{ display:'flex', justifyContent:'center', width:'100%', overflow:'auto', bgcolor:'#fff' }}>
      <Box
        sx={{
          position:'relative',
          flex:'0 0 auto',
          lineHeight:0,
          width: hasSize ? `${stageSize.width}px` : 'auto',
          height: hasSize ? `${stageSize.height}px` : 'auto',
          maxWidth:'100%',
        }}
      >
        <Box
          ref={imageRef}
          component="img"
          src={src}
          alt={alt}
          sx={{
            display:'block',
            width: hasSize ? '100%' : 'auto',
            height: hasSize ? '100%' : 'auto',
            maxWidth: hasSize ? 'none' : '100%',
            maxHeight: hasSize ? 'none' : maxHeight,
            objectFit:'contain',
          }}
        />
        {hasSize && (
          <>
            <Box component="svg" viewBox="0 0 100 100" preserveAspectRatio="none" sx={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible' }}>
              <defs><marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
              {items.map((item) => {
                const sw = Math.max(1, Number(item.strokeWidth) || 2.5);
                if (item.type === 'circle') return <ellipse key={item.id} cx={item.x + item.width/2} cy={item.y + item.height/2} rx={item.width/2} ry={item.height/2} fill="none" stroke={item.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
                if (item.type === 'box') return <rect key={item.id} x={item.x} y={item.y} width={item.width} height={item.height} rx="1" fill="none" stroke={item.color} strokeWidth={sw} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />;
                if (item.type === 'arrow') return <line key={item.id} x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId})`} />;
                if (item.type === 'connector') {
                  const p = getGuideConnectorPoints(item, itemMap);
                  return <line key={item.id} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={item.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId})`} />;
                }
                if (item.type === 'pointConnector') return <line key={item.id} x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId})`} />;
                return null;
              })}
            </Box>
            {items.filter((item) => item.type !== 'connector' && item.type !== 'pointConnector' && item.type !== 'note' && (item.type === 'number' || item.showNumber !== false)).map((item) => {
              const badge = getGuideBadgePosition(item);
              return <Box key={`badge-${item.id}`} sx={{ position:'absolute', left:`${badge.x}%`, top:`${badge.y}%`, transform:`translate(-50%,-50%) scale(${s})`, transformOrigin:'center', width:28, height:28, borderRadius:'50%', display:'grid', placeItems:'center', bgcolor:item.color, color:'#fff', border:'2px solid #fff', boxShadow:'0 2px 7px rgba(0,0,0,.45)', fontFamily:'Arial, "Malgun Gothic", sans-serif', fontSize:11, fontWeight:950, lineHeight:1, pointerEvents:'none', zIndex:4 }}>{item.number}</Box>;
            })}
            {items.filter((item) => item.type !== 'connector' && item.type !== 'pointConnector' && item.showLabel && (item.title || item.description)).map((item) => (
              <Box
                key={`label-${item.id}`}
                sx={{
                  position:'absolute',
                  left:`${item.labelX}%`,
                  top:`${item.labelY}%`,
                  width:'max-content',
                  maxWidth:360,
                  minWidth:0,
                  transform:`scale(${s})`,
                  transformOrigin:'top left',
                  px:'8px',
                  py:'6px',
                  bgcolor:'rgba(255,255,255,.97)',
                  border:`2px solid ${item.color}`,
                  borderRadius:'7px',
                  boxShadow:'0 4px 14px rgba(15,23,42,.2)',
                  fontFamily:'Arial, "Malgun Gothic", sans-serif',
                  lineHeight:1.35,
                  pointerEvents:'none',
                  zIndex:3,
                  overflowWrap:'anywhere',
                }}
              >
                {item.title && (
                  <Box component="div" sx={{ color:item.color, fontFamily:'inherit', fontSize:11, fontWeight:950, lineHeight:1.35 }}>
                    {item.title}
                  </Box>
                )}
                {item.description && (
                  <Box component="div" sx={{ mt:item.title ? '3px' : 0, color:'#334155', fontFamily:'inherit', fontSize:10, fontWeight:700, lineHeight:1.5, whiteSpace:'pre-wrap' }}>
                    {item.description}
                  </Box>
                )}
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
