// v52.48.5.44.47 현재 메뉴 가이드 팝업 버튼
import React, { useCallback } from 'react';
import { Button, Tooltip } from '@mui/material';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { supabase } from '../supabaseClient';
import { GUIDE_IMAGE_BUCKET, getGuideMeta, normalizeGuideSections } from '../config/guideCatalog.js';
import { openSystemGuidePopup, renderSystemGuidePopup } from '../utils/systemGuidePopup.js';

const resolveSections = async (sections) => Promise.all(normalizeGuideSections(sections).map(async (section) => {
  if (!section.imagePath) return { ...section, imageUrl: '' };
  const { data, error } = await supabase.storage.from(GUIDE_IMAGE_BUCKET).createSignedUrl(section.imagePath, 3600);
  return { ...section, imageUrl: error ? '' : String(data?.signedUrl || '') };
}));

export default function SystemGuideButton({ currentView }) {
  const meta = getGuideMeta(currentView);
  const handleOpen = useCallback(async () => {
    if (!meta) return;
    const popup = openSystemGuidePopup({ menuKey: meta.id, label: meta.label, breadcrumb: meta.breadcrumb });
    if (!popup) { window.alert('가이드 팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.'); return; }
    try {
      const { data, error } = await supabase.rpc('get_system_guide', { p_menu_key: meta.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        renderSystemGuidePopup(popup, { label: meta.label, breadcrumb: meta.breadcrumb, published: false, message: meta.systemPreparing ? '현재 메뉴 기능과 가이드가 모두 준비중입니다.' : '현재 메뉴의 가이드는 아직 준비중입니다.' });
        return;
      }
      renderSystemGuidePopup(popup, { label: meta.label, breadcrumb: meta.breadcrumb, title: row.title || meta.label, summary: row.summary || '', sections: await resolveSections(row.content), published: true });
    } catch (error) {
      console.error('시스템 가이드 불러오기 실패:', error);
      renderSystemGuidePopup(popup, { label: meta.label, breadcrumb: meta.breadcrumb, published: false, message: '가이드를 불러오지 못했습니다. 가이드 설정 또는 DB 초기화 상태를 확인해주세요.' });
    }
  }, [meta]);
  if (!meta) return null;
  return <Tooltip title={`${meta.breadcrumb} 가이드`} arrow><Button size="small" onClick={handleOpen} startIcon={<MenuBookRoundedIcon sx={{ fontSize: '0.95rem !important' }} />} sx={{ minWidth:0,height:32,px:.95,color:'#e2e8f0',border:'1px solid rgba(255,255,255,.34)',borderRadius:1,fontSize:'.7rem',fontWeight:800,whiteSpace:'nowrap','& .MuiButton-startIcon':{mr:.45},'&:hover':{borderColor:'rgba(255,255,255,.66)',bgcolor:'rgba(255,255,255,.08)'} }}>가이드</Button></Tooltip>;
}
