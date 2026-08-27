// v52.48.5.44.47 최고관리자 전용 가이드 설정
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, Divider, IconButton, LinearProgress,
  List, ListItemButton, ListItemText, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { supabase } from '../supabaseClient';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import {
  GUIDE_GROUPS, GUIDE_IMAGE_BUCKET, GUIDE_ITEMS, createGuideSection, normalizeGuideSections,
} from '../config/guideCatalog.js';
import { openSystemGuidePopup, renderSystemGuidePopup } from '../utils/systemGuidePopup.js';

const EMPTY_GUIDE = {
  menu_key:'', menu_label:'', menu_group:'', draft_title:'', draft_summary:'', draft_content:[],
  published_title:'', published_summary:'', published_content:[], status:'preparing', published_at:null, updated_at:null,
};
const statusChipSx = { height:20, '& .MuiChip-label':{ px:.75,fontSize:'.62rem',fontWeight:900 } };
const statusInfo = (row) => !row
  ? { label:'준비중', color:'#64748b', bgcolor:'#f1f5f9' }
  : row.status === 'published'
    ? { label:'공개', color:'#166534', bgcolor:'#dcfce7' }
    : { label:'작성중', color:'#1d4ed8', bgcolor:'#dbeafe' };
const safeFileName = (name) => String(name || 'image').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'') || 'image';

export default function Guide() {
  const [selectedGuideId,setSelectedGuideId] = useState('main');
  const [expandedGroups,setExpandedGroups] = useState(() => new Set(GUIDE_GROUPS.filter((g)=>!g.direct).map((g)=>g.id)));
  const [guideRows,setGuideRows] = useState({});
  const [editor,setEditor] = useState(EMPTY_GUIDE);
  const [imagePreviewUrls,setImagePreviewUrls] = useState({});
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState(null);

  const selectedItem = useMemo(() => GUIDE_ITEMS.find((item)=>item.id===selectedGuideId) || GUIDE_ITEMS[0],[selectedGuideId]);

  const loadGuideIndex = useCallback(async () => {
    const { data,error } = await supabase.from('system_guides').select('menu_key,status,updated_at,published_at');
    if (error) throw error;
    const next={}; (data||[]).forEach((row)=>{ next[row.menu_key]=row; }); setGuideRows(next);
  },[]);

  const createPreviewUrl = useCallback(async (path) => {
    const normalized=String(path||'').trim(); if(!normalized) return '';
    const { data,error } = await supabase.storage.from(GUIDE_IMAGE_BUCKET).createSignedUrl(normalized,3600);
    return error ? '' : String(data?.signedUrl||'');
  },[]);

  const refreshPreviews = useCallback(async (sections) => {
    const entries=await Promise.all(normalizeGuideSections(sections).map(async (section)=>[section.id,await createPreviewUrl(section.imagePath)]));
    setImagePreviewUrls(Object.fromEntries(entries));
  },[createPreviewUrl]);

  const loadSelectedGuide = useCallback(async (item) => {
    if(!item) return; setLoading(true); setMessage(null);
    try {
      const { data,error } = await supabase.from('system_guides').select('*').eq('menu_key',item.id).maybeSingle();
      if(error) throw error;
      const next=data ? { ...EMPTY_GUIDE,...data,draft_content:normalizeGuideSections(data.draft_content),published_content:normalizeGuideSections(data.published_content) }
        : { ...EMPTY_GUIDE,menu_key:item.id,menu_label:item.label,menu_group:item.groupLabel||'',draft_title:item.label,draft_content:[createGuideSection({title:'사용 방법'})] };
      setEditor(next); await refreshPreviews(next.draft_content);
    } catch(error) {
      console.error('가이드 설정 불러오기 실패:',error);
      setMessage({severity:'error',text:'가이드 설정을 불러오지 못했습니다. 제공된 Supabase SQL을 먼저 실행했는지 확인해주세요.'});
      setEditor({ ...EMPTY_GUIDE,menu_key:item.id,menu_label:item.label,menu_group:item.groupLabel||'',draft_title:item.label });
    } finally { setLoading(false); }
  },[refreshPreviews]);

  useEffect(()=>{ loadGuideIndex().catch(()=>setMessage({severity:'error',text:'가이드 DB가 아직 초기화되지 않았습니다. 이번 버전의 Supabase SQL을 먼저 실행해주세요.'})); },[loadGuideIndex]);
  useEffect(()=>{ loadSelectedGuide(selectedItem); },[loadSelectedGuide,selectedItem]);

  const toggleGroup=(groupId)=>setExpandedGroups((prev)=>{ const next=new Set(prev); next.has(groupId)?next.delete(groupId):next.add(groupId); return next; });
  const updateSection=(id,field,value)=>setEditor((prev)=>({ ...prev,draft_content:normalizeGuideSections(prev.draft_content).map((section)=>section.id===id?{...section,[field]:value}:section) }));
  const addSection=()=>setEditor((prev)=>({ ...prev,draft_content:[...normalizeGuideSections(prev.draft_content),createGuideSection()] }));
  const moveSection=(index,direction)=>setEditor((prev)=>{ const arr=[...normalizeGuideSections(prev.draft_content)]; const target=index+direction; if(target<0||target>=arr.length)return prev; [arr[index],arr[target]]=[arr[target],arr[index]]; return {...prev,draft_content:arr}; });
  const deleteSection=(id)=>{ setEditor((prev)=>({ ...prev,draft_content:normalizeGuideSections(prev.draft_content).filter((section)=>section.id!==id) })); setImagePreviewUrls((prev)=>{const next={...prev};delete next[id];return next;}); };

  const uploadSectionImage=async(id,file)=>{
    if(!file)return; if(!String(file.type||'').startsWith('image/')){setMessage({severity:'warning',text:'이미지 파일만 업로드할 수 있습니다.'});return;}
    if(file.size>12*1024*1024){setMessage({severity:'warning',text:'가이드 이미지는 12MB 이하만 업로드할 수 있습니다.'});return;}
    setSaving(true);
    try{
      const path=`${selectedItem.id}/${Date.now()}-${safeFileName(file.name)}`;
      const {error}=await supabase.storage.from(GUIDE_IMAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type}); if(error)throw error;
      updateSection(id,'imagePath',path); const previewUrl=await createPreviewUrl(path); setImagePreviewUrls((prev)=>({...prev,[id]:previewUrl}));
      setMessage({severity:'success',text:'이미지를 등록했습니다. 최종 반영은 저장 버튼을 눌러주세요.'});
    }catch(error){setMessage({severity:'error',text:error?.message||'이미지를 업로드하지 못했습니다.'});}finally{setSaving(false);}
  };
  const removeSectionImage=(id)=>{ updateSection(id,'imagePath',''); setImagePreviewUrls((prev)=>({...prev,[id]:''})); };

  const buildPayload=async()=>{
    const {data:authData}=await supabase.auth.getUser();
    return { menu_key:selectedItem.id,menu_label:selectedItem.label,menu_group:selectedItem.groupLabel||'',draft_title:String(editor.draft_title||'').trim()||selectedItem.label,draft_summary:String(editor.draft_summary||'').trim(),draft_content:normalizeGuideSections(editor.draft_content),updated_by:authData?.user?.id||null,updated_at:new Date().toISOString() };
  };

  const saveDraft=async()=>{ setSaving(true);setMessage(null);try{const payload=await buildPayload();const nextStatus=editor.status==='published'?'published':'draft';const {data,error}=await supabase.from('system_guides').upsert({...payload,status:nextStatus},{onConflict:'menu_key'}).select('*').single();if(error)throw error;setEditor({...data,draft_content:normalizeGuideSections(data.draft_content),published_content:normalizeGuideSections(data.published_content)});await loadGuideIndex();setMessage({severity:'success',text:nextStatus==='published'?'수정 내용을 저장했습니다. 기존 공개본은 그대로 유지됩니다.':'가이드 초안을 저장했습니다.'});}catch(error){setMessage({severity:'error',text:error?.message||'가이드를 저장하지 못했습니다.'});}finally{setSaving(false);}};
  const publishGuide=async()=>{const sections=normalizeGuideSections(editor.draft_content);if(!String(editor.draft_title||'').trim()||!sections.length){setMessage({severity:'warning',text:'제목과 최소 1개의 단계를 작성한 뒤 공개해주세요.'});return;}setSaving(true);try{const payload=await buildPayload();const now=new Date().toISOString();const {data,error}=await supabase.from('system_guides').upsert({...payload,published_title:payload.draft_title,published_summary:payload.draft_summary,published_content:payload.draft_content,status:'published',published_at:now},{onConflict:'menu_key'}).select('*').single();if(error)throw error;setEditor({...data,draft_content:normalizeGuideSections(data.draft_content),published_content:normalizeGuideSections(data.published_content)});await loadGuideIndex();setMessage({severity:'success',text:'가이드를 공개했습니다. 해당 메뉴의 가이드 버튼에 즉시 반영됩니다.'});}catch(error){setMessage({severity:'error',text:error?.message||'가이드를 공개하지 못했습니다.'});}finally{setSaving(false);}};
  const unpublishGuide=async()=>{if(editor.status!=='published')return;setSaving(true);try{const {data,error}=await supabase.from('system_guides').update({status:'draft',updated_at:new Date().toISOString()}).eq('menu_key',selectedItem.id).select('*').single();if(error)throw error;setEditor((prev)=>({...prev,...data}));await loadGuideIndex();setMessage({severity:'info',text:'공개를 중지했습니다. 일반 사용자에게는 준비중으로 표시됩니다.'});}catch(error){setMessage({severity:'error',text:error?.message||'공개를 중지하지 못했습니다.'});}finally{setSaving(false);}};

  const previewDraft=async()=>{const popup=openSystemGuidePopup({menuKey:`${selectedItem.id}-draft`,label:selectedItem.label,breadcrumb:`${selectedItem.breadcrumb} · 작성 미리보기`});if(!popup){setMessage({severity:'warning',text:'팝업이 차단되었습니다.'});return;}const sections=await Promise.all(normalizeGuideSections(editor.draft_content).map(async(section)=>({...section,imageUrl:imagePreviewUrls[section.id]||await createPreviewUrl(section.imagePath)})));renderSystemGuidePopup(popup,{label:selectedItem.label,breadcrumb:`${selectedItem.breadcrumb} · 작성 미리보기`,title:editor.draft_title||selectedItem.label,summary:editor.draft_summary||'',sections,published:true});};

  const changed=editor.status==='published'&&(String(editor.draft_title||'')!==String(editor.published_title||'')||String(editor.draft_summary||'')!==String(editor.published_summary||'')||JSON.stringify(normalizeGuideSections(editor.draft_content))!==JSON.stringify(normalizeGuideSections(editor.published_content)));
  const renderStatus=(item)=>{const st=statusInfo(guideRows[item.id]);return <Chip label={st.label} size="small" sx={{...statusChipSx,color:st.color,bgcolor:st.bgcolor}}/>;};
  const renderItem=(item,nested=false)=>{const selected=item.id===selectedGuideId;return <ListItemButton key={item.id} selected={selected} onClick={()=>setSelectedGuideId(item.id)} sx={{minHeight:34,ml:nested?1.5:0,mb:.2,pl:nested?1.5:1.2,pr:.8,py:.25,borderRadius:1,'&.Mui-selected':{bgcolor:'#eff6ff',color:'#1d4ed8'},'&.Mui-selected:hover':{bgcolor:'#dbeafe'}}}><ListItemText primary={item.label} primaryTypographyProps={{noWrap:true,fontSize:'.76rem',fontWeight:selected?800:600}}/><Stack direction="row" spacing={.4}>{item.systemPreparing&&<Chip label="기능 준비중" size="small" sx={{...statusChipSx,color:'#92400e',bgcolor:'#fef3c7'}}/>}{renderStatus(item)}</Stack></ListItemButton>;};

  return <Box sx={{height:'100%',minHeight:0,display:'flex',flexDirection:'column',gap:1}}>
    <Paper variant="outlined" sx={{px:1.25,py:1,borderColor:'#dbe3ed'}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{xs:'flex-start',md:'center'}} justifyContent="space-between"><SystemPageTitle title="가이드 설정" meta="최고관리자 전용 · 메뉴별 가이드를 작성·수정·공개합니다. 일반 사용자는 현재 메뉴의 가이드 버튼으로 공개본만 확인합니다."/><Stack direction="row" spacing={.6}><Chip label={`공개 ${Object.values(guideRows).filter((r)=>r.status==='published').length}`} size="small" sx={{color:'#166534',bgcolor:'#dcfce7',fontWeight:900}}/><Chip label={`전체 ${GUIDE_ITEMS.length}`} size="small" sx={{color:'#334155',bgcolor:'#f1f5f9',fontWeight:900}}/></Stack></Stack></Paper>
    {message&&<Alert severity={message.severity} onClose={()=>setMessage(null)} sx={{py:.2}}>{message.text}</Alert>}
    {(loading||saving)&&<LinearProgress/>}
    <Box sx={{flex:1,minHeight:0,display:'grid',gridTemplateColumns:{xs:'1fr',lg:'345px minmax(0,1fr)'},gap:1}}>
      <Paper variant="outlined" sx={{minHeight:0,overflow:'auto',borderColor:'#dbe3ed'}}><Box sx={{px:1.25,py:1}}><Typography sx={{fontSize:'.78rem',fontWeight:900}}>메뉴별 가이드</Typography><Typography sx={{mt:.2,color:'#94a3b8',fontSize:'.67rem'}}>준비중 → 작성중 → 공개 순으로 관리합니다.</Typography></Box><Divider/><List dense disablePadding sx={{p:.75}}>{GUIDE_GROUPS.map((group)=>group.direct?renderItem(group.items[0]):<Box key={group.id} sx={{mb:.2}}><ListItemButton onClick={()=>toggleGroup(group.id)} sx={{minHeight:36,px:1.2,py:.25,borderRadius:1}}><ListItemText primary={group.label} primaryTypographyProps={{fontSize:'.77rem',fontWeight:900}}/>{expandedGroups.has(group.id)?<ExpandLessRoundedIcon sx={{fontSize:18}}/>:<ExpandMoreRoundedIcon sx={{fontSize:18}}/>}</ListItemButton><Collapse in={expandedGroups.has(group.id)} timeout="auto" unmountOnExit={false}>{group.items.map((item)=>renderItem(item,true))}</Collapse></Box>)}</List></Paper>
      <Paper variant="outlined" sx={{minWidth:0,minHeight:0,overflow:'auto',borderColor:'#dbe3ed'}}>
        <Box sx={{p:1.5}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{xs:'stretch',md:'center'}} justifyContent="space-between"><Box><Typography sx={{color:'#64748b',fontSize:'.68rem',fontWeight:800}}>{selectedItem.breadcrumb}</Typography><Stack direction="row" spacing={.7} alignItems="center"><Typography sx={{fontSize:'1.05rem',fontWeight:900}}>{selectedItem.label}</Typography>{renderStatus(selectedItem)}{changed&&<Chip label="수정사항 있음" size="small" sx={{...statusChipSx,color:'#92400e',bgcolor:'#fef3c7'}}/>}</Stack></Box><Stack direction="row" spacing={.6} flexWrap="wrap" useFlexGap><Button size="small" variant="outlined" startIcon={<VisibilityRoundedIcon/>} onClick={previewDraft}>작성 미리보기</Button><Button size="small" variant="outlined" startIcon={<SaveRoundedIcon/>} onClick={saveDraft} disabled={saving}>저장</Button>{editor.status==='published'&&<Button size="small" variant="outlined" color="warning" startIcon={<VisibilityOffRoundedIcon/>} onClick={unpublishGuide} disabled={saving}>공개 중지</Button>}<Button size="small" variant="contained" startIcon={<PublishRoundedIcon/>} onClick={publishGuide} disabled={saving}>공개</Button></Stack></Stack></Box><Divider/>
        <Box sx={{p:1.5}}><Stack spacing={1.2}><TextField size="small" label="가이드 제목" fullWidth value={editor.draft_title||''} onChange={(e)=>setEditor((p)=>({...p,draft_title:e.target.value}))}/><TextField size="small" label="가이드 요약 / 이 메뉴의 목적" fullWidth multiline minRows={2} value={editor.draft_summary||''} onChange={(e)=>setEditor((p)=>({...p,draft_summary:e.target.value}))}/><Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography sx={{fontSize:'.82rem',fontWeight:900}}>단계별 가이드</Typography><Typography sx={{color:'#64748b',fontSize:'.68rem'}}>설명·이미지·주의사항을 필요한 만큼 추가할 수 있습니다.</Typography></Box><Button size="small" variant="outlined" startIcon={<AddRoundedIcon/>} onClick={addSection}>단계 추가</Button></Stack>
          {!normalizeGuideSections(editor.draft_content).length&&<Alert severity="info">‘단계 추가’를 눌러 가이드를 작성하세요.</Alert>}
          {normalizeGuideSections(editor.draft_content).map((section,index)=><Paper key={section.id} variant="outlined" sx={{p:1.2,borderColor:'#cbd5e1',bgcolor:'#f8fafc'}}><Stack direction="row" spacing={.5} alignItems="center" sx={{mb:1}}><Chip label={`STEP ${index+1}`} size="small" sx={{height:23,color:'#1d4ed8',bgcolor:'#dbeafe',fontWeight:900}}/><Box sx={{flex:1}}/><Tooltip title="위로"><span><IconButton size="small" disabled={index===0} onClick={()=>moveSection(index,-1)}><ArrowUpwardRoundedIcon fontSize="small"/></IconButton></span></Tooltip><Tooltip title="아래로"><span><IconButton size="small" disabled={index===normalizeGuideSections(editor.draft_content).length-1} onClick={()=>moveSection(index,1)}><ArrowDownwardRoundedIcon fontSize="small"/></IconButton></span></Tooltip><Tooltip title="단계 삭제"><IconButton size="small" color="error" onClick={()=>deleteSection(section.id)}><DeleteOutlineRoundedIcon fontSize="small"/></IconButton></Tooltip></Stack><Stack spacing={1}><TextField size="small" label="단계 제목" fullWidth value={section.title} onChange={(e)=>updateSection(section.id,'title',e.target.value)}/><TextField size="small" label="설명" fullWidth multiline minRows={3} value={section.content} onChange={(e)=>updateSection(section.id,'content',e.target.value)}/>{imagePreviewUrls[section.id]?<Box component="img" src={imagePreviewUrls[section.id]} alt={section.title||'가이드 이미지'} sx={{display:'block',width:'100%',maxHeight:520,objectFit:'contain',border:'1px solid #cbd5e1',borderRadius:1,bgcolor:'#fff'}}/>:<Box sx={{minHeight:70,display:'grid',placeItems:'center',border:'1px dashed #cbd5e1',borderRadius:1,color:'#94a3b8',bgcolor:'#fff'}}><Stack direction="row" spacing={.5}><ImageRoundedIcon fontSize="small"/><Typography sx={{fontSize:'.72rem'}}>등록된 이미지 없음</Typography></Stack></Box>}<Stack direction="row" spacing={.7}><Button component="label" size="small" variant="outlined" startIcon={<ImageRoundedIcon/>}>이미지 {section.imagePath?'교체':'등록'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>{const file=e.target.files?.[0];e.target.value='';uploadSectionImage(section.id,file);}}/></Button>{section.imagePath&&<Button size="small" color="error" onClick={()=>removeSectionImage(section.id)}>초안에서 이미지 제거</Button>}</Stack><TextField size="small" label="이미지 설명(선택)" fullWidth value={section.imageCaption} onChange={(e)=>updateSection(section.id,'imageCaption',e.target.value)}/><TextField size="small" label="주의 / 참고사항(선택)" fullWidth multiline minRows={2} value={section.note} onChange={(e)=>updateSection(section.id,'note',e.target.value)}/></Stack></Paper>)}
        </Stack></Box>
      </Paper>
    </Box>
  </Box>;
}
