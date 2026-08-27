// v52.48.5.44.48 가이드 화면 이미지 + 표시(번호/원/점선박스/화살표)
import React, { useId } from 'react';
import { Box } from '@mui/material';
import { normalizeGuideAnnotations } from '../config/guideCatalog.js';

export default function GuideAnnotatedImage({ src, alt = '가이드 화면', annotations = [], maxHeight = 620 }) {
  const markerId = `guide-arrow-${useId().replace(/:/g, '')}`;
  const items = normalizeGuideAnnotations(annotations);
  if (!src) return null;

  return (
    <Box sx={{ display:'flex', justifyContent:'center', width:'100%', overflow:'auto', bgcolor:'#fff' }}>
      <Box sx={{ position:'relative', display:'inline-block', lineHeight:0, maxWidth:'100%' }}>
        <Box component="img" src={src} alt={alt} sx={{ display:'block', width:'auto', maxWidth:'100%', maxHeight, objectFit:'contain' }} />
        <Box component="svg" viewBox="0 0 100 100" preserveAspectRatio="none" sx={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible' }}>
          <defs><marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
          {items.map((item) => {
            if (item.type === 'circle') return <ellipse key={item.id} cx={item.x + item.width/2} cy={item.y + item.height/2} rx={item.width/2} ry={item.height/2} fill="none" stroke={item.color} strokeWidth="0.75" vectorEffect="non-scaling-stroke" />;
            if (item.type === 'box') return <rect key={item.id} x={item.x} y={item.y} width={item.width} height={item.height} rx="1" fill="none" stroke={item.color} strokeWidth="0.75" strokeDasharray="2.2 1.4" vectorEffect="non-scaling-stroke" />;
            if (item.type === 'arrow') return <line key={item.id} x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth="1.1" vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId})`} />;
            return null;
          })}
        </Box>
        {items.map((item) => {
          const badgeX = item.type === 'number' ? item.x : item.type === 'arrow' ? item.x : Math.min(98, item.x + item.width);
          const badgeY = item.type === 'number' ? item.y : item.type === 'arrow' ? item.y : Math.max(2, item.y);
          return <Box key={`badge-${item.id}`} sx={{ position:'absolute', left:`${badgeX}%`, top:`${badgeY}%`, transform:'translate(-50%,-50%)', width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', bgcolor:item.color, color:'#fff', border:'2px solid #fff', boxShadow:'0 2px 6px rgba(0,0,0,.38)', fontSize:11, fontWeight:900, lineHeight:1, pointerEvents:'none' }}>{item.number}</Box>;
        })}
      </Box>
    </Box>
  );
}
