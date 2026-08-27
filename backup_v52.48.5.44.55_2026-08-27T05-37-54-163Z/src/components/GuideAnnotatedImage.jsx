// v52.48.5.44.50 가이드 화면 이미지 + 고정형 번호/자동폭 설명박스/여백 연결 화살표
import React, { useId, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  getGuideBadgePosition,
  getGuideConnectorPoints,
  normalizeGuideAnnotations,
} from '../config/guideCatalog.js';

export default function GuideAnnotatedImage({ src, alt = '가이드 화면', annotations = [], maxHeight = 620 }) {
  const markerId = `guide-arrow-${useId().replace(/:/g, '')}`;
  const items = normalizeGuideAnnotations(annotations);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  if (!src) return null;

  return (
    <Box sx={{ display:'flex', justifyContent:'center', width:'100%', overflow:'auto', bgcolor:'#fff' }}>
      <Box sx={{ position:'relative', display:'inline-block', lineHeight:0, maxWidth:'100%' }}>
        <Box component="img" src={src} alt={alt} sx={{ display:'block', width:'auto', maxWidth:'100%', maxHeight, objectFit:'contain' }} />
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
            return null;
          })}
        </Box>
        {items.filter((item) => item.type !== 'connector').map((item) => {
          const badge = getGuideBadgePosition(item);
          return <Box key={`badge-${item.id}`} sx={{ position:'absolute', left:`${badge.x}%`, top:`${badge.y}%`, transform:'translate(-50%,-50%)', width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', bgcolor:item.color, color:'#fff', border:'2px solid #fff', boxShadow:'0 2px 6px rgba(0,0,0,.38)', fontSize:11, fontWeight:900, lineHeight:1, pointerEvents:'none', zIndex:3 }}>{item.number}</Box>;
        })}
        {items.filter((item) => item.type !== 'connector' && item.showLabel && (item.title || item.description)).map((item) => (
          <Box key={`label-${item.id}`} sx={{ position:'absolute', left:`${item.labelX}%`, top:`${item.labelY}%`, width:'max-content', maxWidth:360, minWidth:0, transform:'translateY(-8px)', px:.75, py:.55, bgcolor:'rgba(255,255,255,.96)', border:`2px solid ${item.color}`, borderRadius:1, boxShadow:'0 4px 12px rgba(15,23,42,.18)', lineHeight:1.35, pointerEvents:'none', zIndex:2, overflowWrap:'anywhere' }}>
            {item.title && <Typography sx={{ color:item.color, fontSize:'.68rem', fontWeight:950, lineHeight:1.35 }}>{item.title}</Typography>}
            {item.description && <Typography sx={{ mt:item.title ? .3 : 0, color:'#334155', fontSize:'.61rem', fontWeight:700, lineHeight:1.45, whiteSpace:'pre-wrap' }}>{item.description}</Typography>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
