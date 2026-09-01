// v52.48.5.44.92 업무자료실 목록 한 줄·헤더 높이·용량 상태 간격
// v52.48.5.44.91 업무자료실 UI 정렬·등록자·원본 다운로드명 보정
// v52.48.5.44.90 업무자료실 Storage 내부 키 ASCII 전용화
// v52.48.5.44.89 업무자료실: 비공개 파일·외부 링크·버전 관리
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CloudDownloadRoundedIcon from '@mui/icons-material/CloudDownloadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import * as tus from 'tus-js-client';
import { supabase } from '../supabaseClient';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import {
  BUSINESS_LIBRARY_BUCKET,
  BUSINESS_LIBRARY_CATEGORIES,
  BUSINESS_LIBRARY_FREE_STORAGE_BYTES,
  BUSINESS_LIBRARY_MAX_FILE_BYTES,
  BUSINESS_LIBRARY_PROVIDERS,
  BUSINESS_LIBRARY_SCOPES,
  BUSINESS_LIBRARY_STANDARD_UPLOAD_BYTES,
  formatBusinessLibraryBytes,
  formatBusinessLibraryDate,
  getBusinessLibraryExtension,
} from '../config/businessLibraryCatalog.js';

const EMPTY_FORM = {
  category:'회사양식',
  title:'',
  description:'',
  scope_type:'company',
  project_name:'',
  storage_provider:'supabase',
  external_url:'',
  version_label:'v1',
};

const fieldSx = {
  '& .MuiInputBase-root': { fontSize:12 },
  '& .MuiInputLabel-root': { fontSize:12 },
};

const safeUuid = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isPreviewableImage = (row) => String(row?.mime_type || '').startsWith('image/');
const isPreviewablePdf = (row) => (
  String(row?.mime_type || '').includes('pdf')
  || String(row?.file_extension || '').toLowerCase() === 'pdf'
);

const getScopeLabel = (row) => row?.scope_type === 'project'
  ? String(row?.project_name || '현장 전용')
  : '회사 공통';

const storageTone = (percent) => {
  if (percent >= 90) return { color:'error', label:'용량 부족' };
  if (percent >= 75) return { color:'warning', label:'확인 필요' };
  return { color:'primary', label:'정상' };
};

export default function BusinessLibrary({
  projectName = '',
  userId = '',
  userProfile = {},
}) {
  const isSuperAdmin = String(userProfile?.role || '').trim() === '최고관리자';
  const resolvedUserId = String(userId || userProfile?.auth_user_id || '').trim();
  const resolvedUserName = String(
    userProfile?.manager_name
      || userProfile?.name
      || userProfile?.user_name
      || userProfile?.display_name
      || '',
  ).trim();
  const resolvedUserPosition = String(
    userProfile?.position_title || userProfile?.role || '',
  ).trim();
  const resolvedUploaderLabel = [resolvedUserName, resolvedUserPosition]
    .filter(Boolean)
    .join(' (') + (resolvedUserName && resolvedUserPosition ? ')' : '');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [storageUsage, setStorageUsage] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create');
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const activeUploadRef = useRef(null);

  const latestRows = useMemo(
    () => rows.filter((row) => row.is_latest),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalized = String(keyword || '').trim().toLowerCase();
    return latestRows.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (scopeFilter === 'company' && row.scope_type !== 'company') return false;
      if (scopeFilter === 'project' && row.scope_type !== 'project') return false;
      if (scopeFilter === 'current' && (
        row.scope_type !== 'project'
        || String(row.project_name || '').trim() !== String(projectName || '').trim()
      )) return false;
      if (!normalized) return true;
      return [
        row.title, row.description, row.category, row.project_name,
        row.original_file_name, row.version_label,
      ].some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [categoryFilter, keyword, latestRows, projectName, scopeFilter]);

  const selected = useMemo(
    () => latestRows.find((row) => String(row.id) === String(selectedId)) || filteredRows[0] || null,
    [filteredRows, latestRows, selectedId],
  );

  const selectedHistory = useMemo(
    () => rows
      .filter((row) => selected && row.document_group_id === selected.document_group_id)
      .sort((a, b) => Number(b.version_number) - Number(a.version_number)),
    [rows, selected],
  );

  const getCreatorLabel = useCallback((row) => {
    const stored = String(row?.created_by_name || '').trim();
    if (stored) return stored;
    return String(row?.created_by || '') === resolvedUserId
      ? resolvedUploaderLabel || '-'
      : '-';
  }, [resolvedUploaderLabel, resolvedUserId]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase
        .from('business_library_documents')
        .select('*')
        .order('created_at', { ascending:false });
      if (error) throw error;
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      setSelectedId((current) => {
        if (nextRows.some((row) => String(row.id) === String(current) && row.is_latest)) return current;
        return String(nextRows.find((row) => row.is_latest)?.id || '');
      });
    } catch (error) {
      console.error('업무자료실 조회 실패:', error);
      setMessage({ severity:'error', text:error?.message || '업무자료를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStorageUsage = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const { data, error } = await supabase.rpc('business_library_storage_usage');
      if (error) throw error;
      const usage = Array.isArray(data) ? data[0] : data;
      setStorageUsage(usage || { total_bytes:0, library_bytes:0, library_file_count:0 });
    } catch (error) {
      console.error('저장용량 조회 실패:', error);
      setStorageUsage(null);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadRows();
    loadStorageUsage();
  }, [loadRows, loadStorageUsage]);

  useEffect(() => {
    let active = true;
    setPreviewUrl('');
    if (!selected || selected.storage_provider !== 'supabase'
      || (!isPreviewableImage(selected) && !isPreviewablePdf(selected))) return undefined;

    setPreviewLoading(true);
    supabase.storage
      .from(BUSINESS_LIBRARY_BUCKET)
      .createSignedUrl(selected.storage_path, 60 * 10)
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setPreviewUrl(String(data?.signedUrl || ''));
        setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => () => {
    activeUploadRef.current?.abort?.(true);
  }, []);

  const openCreate = () => {
    setEditorMode('create');
    setForm({ ...EMPTY_FORM, project_name:String(projectName || '') });
    setSelectedFile(null);
    setUploadProgress(0);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditorMode('edit');
    setForm({
      category:selected.category,
      title:selected.title,
      description:selected.description || '',
      scope_type:selected.scope_type,
      project_name:selected.project_name || String(projectName || ''),
      storage_provider:selected.storage_provider,
      external_url:selected.external_url || '',
      version_label:selected.version_label || `v${selected.version_number}`,
    });
    setSelectedFile(null);
    setUploadProgress(0);
    setEditorOpen(true);
  };

  const openNewVersion = () => {
    if (!selected) return;
    const nextVersion = Number(selected.version_number || 1) + 1;
    setEditorMode('version');
    setForm({
      category:selected.category,
      title:selected.title,
      description:selected.description || '',
      scope_type:selected.scope_type,
      project_name:selected.project_name || String(projectName || ''),
      storage_provider:selected.storage_provider === 'external' ? 'external' : 'supabase',
      external_url:'',
      version_label:`v${nextVersion}`,
    });
    setSelectedFile(null);
    setUploadProgress(0);
    setEditorOpen(true);
  };

  const updateForm = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]:value }));
  };

  const validateForm = () => {
    if (!String(form.title || '').trim()) return '자료 제목을 입력해주세요.';
    if (form.scope_type === 'project' && !String(form.project_name || '').trim()) {
      return '현장 전용 자료는 현장명을 입력해야 합니다.';
    }
    if (editorMode !== 'edit' && form.storage_provider === 'supabase' && !selectedFile) {
      return '등록할 파일을 선택해주세요.';
    }
    if (selectedFile && selectedFile.size > BUSINESS_LIBRARY_MAX_FILE_BYTES) {
      return '직접 등록은 파일당 45MB까지 가능합니다. 외부 링크 등록을 이용해주세요.';
    }
    if (editorMode !== 'edit' && form.storage_provider === 'external') {
      try {
        const parsed = new URL(String(form.external_url || '').trim());
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('invalid');
      } catch {
        return 'http 또는 https로 시작하는 올바른 외부 링크를 입력해주세요.';
      }
    }
    return '';
  };

  const hashFile = async (file) => {
    if (!file || !globalThis.crypto?.subtle) return '';
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const uploadWithTus = async (file, storagePath) => {
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.');

    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '');
    const projectId = new URL(supabaseUrl).hostname.split('.')[0];
    const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

    await new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays:[0, 3000, 5000, 10000, 20000],
        headers:{
          authorization:`Bearer ${session.access_token}`,
          'x-upsert':'false',
        },
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        metadata:{
          bucketName:BUSINESS_LIBRARY_BUCKET,
          objectName:storagePath,
          contentType:file.type || 'application/octet-stream',
          cacheControl:'3600',
        },
        chunkSize:6 * 1024 * 1024,
        onError:reject,
        onProgress:(uploaded, total) => setUploadProgress(
          total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : 0,
        ),
        onSuccess:resolve,
      });
      activeUploadRef.current = upload;
      upload.start();
    });
    activeUploadRef.current = null;
  };

  const uploadFile = async (file, storagePath) => {
    if (file.size > BUSINESS_LIBRARY_STANDARD_UPLOAD_BYTES) {
      await uploadWithTus(file, storagePath);
      return;
    }
    const { error } = await supabase.storage
      .from(BUSINESS_LIBRARY_BUCKET)
      .upload(storagePath, file, {
        cacheControl:'3600',
        contentType:file.type || 'application/octet-stream',
        upsert:false,
      });
    if (error) throw error;
    setUploadProgress(100);
  };

  const saveDocument = async () => {
    if (!isSuperAdmin || saving) return;
    const validation = validateForm();
    if (validation) {
      setMessage({ severity:'warning', text:validation });
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    let uploadedPath = '';
    try {
      if (editorMode === 'edit') {
        const { error } = await supabase
          .from('business_library_documents')
          .update({
            category:form.category,
            title:String(form.title).trim(),
            description:String(form.description || '').trim(),
            scope_type:form.scope_type,
            project_name:form.scope_type === 'project' ? String(form.project_name).trim() : '',
            updated_at:new Date().toISOString(),
          })
          .eq('document_group_id', selected.document_group_id);
        if (error) throw error;
        const { error:versionError } = await supabase
          .from('business_library_documents')
          .update({
            version_label:String(form.version_label || '').trim() || selected.version_label,
            updated_at:new Date().toISOString(),
          })
          .eq('id', selected.id);
        if (versionError) throw versionError;
      } else {
        const groupId = editorMode === 'version' ? selected.document_group_id : safeUuid();
        const versionNumber = editorMode === 'version'
          ? Number(selected.version_number || 1) + 1
          : 1;
        let fileHash = '';
        let sourceFields = {
          storage_path:'', external_url:'', original_file_name:'', file_size:0,
          mime_type:'', file_extension:'', file_hash:'',
        };

        if (form.storage_provider === 'supabase') {
          fileHash = await hashFile(selectedFile);
          if (fileHash) {
            const { data:duplicate, error:duplicateError } = await supabase
              .from('business_library_documents')
              .select('id, title, version_label')
              .eq('file_hash', fileHash)
              .limit(1);
            if (duplicateError) throw duplicateError;
            if (duplicate?.length) {
              throw new Error(`같은 파일이 이미 “${duplicate[0].title}” 자료에 등록되어 있습니다.`);
            }
          }

          // 원본 파일명은 DB에 보존하고 Storage 객체 키는 ASCII UUID만 사용합니다.
          // 한글·괄호·공백이 포함된 파일도 TUS InvalidKey 없이 업로드됩니다.
          const safeExtension = getBusinessLibraryExtension(selectedFile.name)
            .replace(/[^0-9a-z]/gi, '')
            .slice(0, 20);
          const storageFileName = `${safeUuid()}${safeExtension ? `.${safeExtension}` : ''}`;
          uploadedPath = `${groupId}/v${versionNumber}/${storageFileName}`;
          await uploadFile(selectedFile, uploadedPath);
          sourceFields = {
            storage_path:uploadedPath,
            external_url:'',
            original_file_name:selectedFile.name,
            file_size:selectedFile.size,
            mime_type:selectedFile.type || 'application/octet-stream',
            file_extension:getBusinessLibraryExtension(selectedFile.name),
            file_hash:fileHash,
          };
        } else {
          sourceFields.external_url = String(form.external_url || '').trim();
          sourceFields.original_file_name = sourceFields.external_url;
          sourceFields.file_extension = 'LINK';
        }

        if (editorMode === 'version') {
          const { error:latestError } = await supabase
            .from('business_library_documents')
            .update({ is_latest:false, updated_at:new Date().toISOString() })
            .eq('document_group_id', groupId)
            .eq('is_latest', true);
          if (latestError) throw latestError;
        }

        const { data:inserted, error:insertError } = await supabase
          .from('business_library_documents')
          .insert({
            document_group_id:groupId,
            version_number:versionNumber,
            is_latest:true,
            category:form.category,
            title:String(form.title).trim(),
            description:String(form.description || '').trim(),
            scope_type:form.scope_type,
            project_name:form.scope_type === 'project' ? String(form.project_name).trim() : '',
            storage_provider:form.storage_provider,
            version_label:String(form.version_label || '').trim() || `v${versionNumber}`,
            created_by:resolvedUserId,
            created_by_name:resolvedUploaderLabel,
            ...sourceFields,
          })
          .select('id')
          .single();

        if (insertError) {
          if (editorMode === 'version') {
            await supabase.from('business_library_documents')
              .update({ is_latest:true })
              .eq('id', selected.id);
          }
          throw insertError;
        }
        setSelectedId(String(inserted?.id || ''));
      }

      setEditorOpen(false);
      setMessage({ severity:'success', text:editorMode === 'edit' ? '자료 정보를 수정했습니다.' : '자료를 등록했습니다.' });
      await Promise.all([loadRows(), loadStorageUsage()]);
    } catch (error) {
      console.error('업무자료 저장 실패:', error);
      if (uploadedPath) {
        await supabase.storage.from(BUSINESS_LIBRARY_BUCKET).remove([uploadedPath]);
      }
      setMessage({ severity:'error', text:error?.message || '자료를 저장하지 못했습니다.' });
    } finally {
      activeUploadRef.current = null;
      setSaving(false);
    }
  };

  const openDocument = async (row) => {
    if (!row) return;
    try {
      if (row.storage_provider === 'external') {
        const url = String(row.external_url || '');
        if (!url) throw new Error('외부 자료 주소를 확인할 수 없습니다.');
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (row.storage_provider === 'supabase') {
        const { data, error } = await supabase.storage
          .from(BUSINESS_LIBRARY_BUCKET)
          .download(row.storage_path);
        if (error) throw error;
        if (!(data instanceof Blob)) throw new Error('다운로드 파일을 확인할 수 없습니다.');

        const objectUrl = URL.createObjectURL(data);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = String(row.original_file_name || 'download').trim() || 'download';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
      } else {
        const url = String(row.external_url || row.storage_path || '');
        if (!url) throw new Error('자료 주소를 확인할 수 없습니다.');
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      await supabase.rpc('business_library_record_download', {
        p_document_id:row.id,
        p_user_name:resolvedUploaderLabel,
      });
      setRows((current) => current.map((item) => item.id === row.id
        ? { ...item, download_count:Number(item.download_count || 0) + 1 }
        : item));
    } catch (error) {
      setMessage({ severity:'error', text:error?.message || '자료를 열지 못했습니다.' });
    }
  };

  const deleteDocument = async () => {
    if (!isSuperAdmin || !selected) return;
    setSaving(true);
    try {
      const paths = selectedHistory
        .filter((row) => row.storage_provider === 'supabase' && row.storage_path)
        .map((row) => row.storage_path);
      if (paths.length) {
        const { error:storageError } = await supabase.storage
          .from(BUSINESS_LIBRARY_BUCKET).remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await supabase
        .from('business_library_documents')
        .delete()
        .eq('document_group_id', selected.document_group_id);
      if (error) throw error;
      setDeleteOpen(false);
      setSelectedId('');
      setMessage({ severity:'success', text:'자료와 모든 이전 버전을 삭제했습니다.' });
      await Promise.all([loadRows(), loadStorageUsage()]);
    } catch (error) {
      setMessage({ severity:'error', text:error?.message || '자료를 삭제하지 못했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const totalBytes = Number(storageUsage?.total_bytes || 0);
  const storagePercent = Math.min(100, (totalBytes / BUSINESS_LIBRARY_FREE_STORAGE_BYTES) * 100);
  const tone = storageTone(storagePercent);

  return (
    <Box sx={{ display:'flex', flexDirection:'column', gap:1, minHeight:0 }}>
      <Paper variant="outlined" sx={{ px:1.4, py:1, borderColor:'#d8e0ea' }}>
        <Box sx={{ display:'flex', alignItems:'center', width:'100%', gap:1 }}>
          <SystemPageTitle
            title="업무자료실"
            help={'회사 공통 양식과 현장 업무자료를 한곳에서 조회하고 내려받습니다.\n자료 등록·수정·삭제와 저장용량 관리는 최고관리자만 사용할 수 있습니다.'}
            meta="회사양식, 시공계획서, 카탈로그, 시방서 등 최신 업무자료를 공유합니다."
          />
          <Stack direction="row" gap={0.7} alignItems="center" sx={{ ml:'auto', flexShrink:0 }}>
            {isSuperAdmin && (
              <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>자료 등록</Button>
            )}
            <Tooltip title="새로고침"><IconButton size="small" onClick={() => Promise.all([loadRows(), loadStorageUsage()])}><RefreshRoundedIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        </Box>
      </Paper>

      {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ py:0 }}>{message.text}</Alert>}

      {isSuperAdmin && (
        <Paper variant="outlined" sx={{ p:1.2, borderColor:'#d8e0ea' }}>
          <Stack direction={{ xs:'column', md:'row' }} gap={{ xs:1.2, md:2.4 }} alignItems={{ md:'center' }}>
            <Stack direction="row" gap={1} alignItems="center" sx={{ minWidth:245 }}>
              <StorageRoundedIcon sx={{ color:'#475569' }} />
              <Box>
                <Typography sx={{ fontSize:12, fontWeight:800 }}>Supabase 저장용량</Typography>
                <Typography sx={{ fontSize:11, color:'#64748b' }}>
                  전체 {formatBusinessLibraryBytes(totalBytes)} / 1 GB
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ flex:1, minWidth:220 }}>
              <Stack direction="row" alignItems="center" sx={{ mb:0.7, columnGap:'28px' }}>
                <Chip size="small" color={tone.color} label={tone.label} sx={{ fontSize:10, height:21 }} />
                <Typography sx={{ fontSize:10.5, color:'#64748b' }}>
                  전체 사용률 {storagePercent.toFixed(1)}% · 업무자료실 {formatBusinessLibraryBytes(storageUsage?.library_bytes || 0)} ({Number(storageUsage?.library_file_count || 0).toLocaleString()}개 파일)
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={storagePercent} color={tone.color} sx={{ height:8, borderRadius:4 }} />
            </Box>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p:0.9, borderColor:'#d8e0ea' }}>
        <Stack direction={{ xs:'column', md:'row' }} gap={0.8}>
          <FormControl size="small" sx={{ minWidth:145 }}>
            <InputLabel>분류</InputLabel>
            <Select label="분류" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} sx={{ fontSize:12 }}>
              <MenuItem value="all">전체 분류</MenuItem>
              {BUSINESS_LIBRARY_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth:145 }}>
            <InputLabel>공개 범위</InputLabel>
            <Select label="공개 범위" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} sx={{ fontSize:12 }}>
              <MenuItem value="all">전체 자료</MenuItem>
              <MenuItem value="company">회사 공통</MenuItem>
              <MenuItem value="project">현장 전용 전체</MenuItem>
              {projectName && <MenuItem value="current">현재 현장</MenuItem>}
            </Select>
          </FormControl>
          <TextField
            size="small"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="제목·설명·파일명 검색"
            InputProps={{ startAdornment:<SearchRoundedIcon sx={{ mr:0.7, color:'#94a3b8', fontSize:18 }} /> }}
            sx={{ ...fieldSx, flex:1 }}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', lg:'minmax(390px, 42%) minmax(0, 58%)' }, height:{ xs:'auto', lg:'calc(100vh - 330px)' }, minHeight:{ xs:640, lg:510 }, overflow:'hidden', borderColor:'#d8e0ea' }}>
        <Box sx={{ minWidth:0, borderRight:{ lg:'1px solid #e2e8f0' }, borderBottom:{ xs:'1px solid #e2e8f0', lg:0 }, display:'flex', flexDirection:'column', minHeight:0 }}>
          <Stack direction="row" alignItems="center" sx={{ height:44, px:1.2, bgcolor:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
            <Typography sx={{ display:'flex', alignItems:'baseline', gap:0.55, fontSize:14, fontWeight:800, lineHeight:1 }}>
              자료 목록
              <Box component="span" sx={{ fontSize:11, fontWeight:500, color:'#64748b' }}>
                {filteredRows.length.toLocaleString()}건
              </Box>
            </Typography>
          </Stack>
          <Box sx={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <Stack alignItems="center" justifyContent="center" sx={{ height:'100%', minHeight:180 }}><CircularProgress size={28} /></Stack>
            ) : filteredRows.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" sx={{ height:'100%', minHeight:180, color:'#94a3b8' }}>
                <DescriptionOutlinedIcon sx={{ fontSize:38, mb:0.7 }} />
                <Typography sx={{ fontSize:12 }}>조건에 맞는 자료가 없습니다.</Typography>
              </Stack>
            ) : filteredRows.map((row) => {
              const active = selected?.id === row.id;
              return (
                <Box
                  key={row.id}
                  component="button"
                  type="button"
                  onClick={() => setSelectedId(String(row.id))}
                  sx={{ display:'flex', alignItems:'center', width:'100%', minHeight:36, textAlign:'left', border:0, borderBottom:'1px solid #edf1f5', bgcolor:active ? '#eff6ff' : '#fff', px:1.2, py:0.55, cursor:'pointer', '&:hover':{ bgcolor:active ? '#eff6ff' : '#f8fafc' } }}
                >
                  <Stack direction="row" gap={0.75} alignItems="center" sx={{ width:'100%', minWidth:0 }}>
                    <InsertDriveFileOutlinedIcon sx={{ flexShrink:0, fontSize:18, color:active ? '#2563eb' : '#64748b' }} />
                    <Typography noWrap title={row.title} sx={{ minWidth:0, fontSize:12, fontWeight:active ? 800 : 700, color:'#0f172a' }}>
                      {row.title}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ minWidth:0, minHeight:0, display:'flex', flexDirection:'column' }}>
          {!selected ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height:'100%', minHeight:300, color:'#94a3b8' }}>
              <DescriptionOutlinedIcon sx={{ fontSize:46, mb:1 }} />
              <Typography sx={{ fontSize:12 }}>왼쪽 목록에서 자료를 선택해주세요.</Typography>
            </Stack>
          ) : (
            <>
              <Box sx={{ display:'flex', alignItems:'center', gap:0.65, width:'100%', minHeight:44, px:1.4, py:0.7, borderBottom:'1px solid #e2e8f0' }}>
                <Typography noWrap title={selected.title} sx={{ mr:0.2, minWidth:0, maxWidth:'38%', fontSize:14, fontWeight:800, color:'#0f172a' }}>{selected.title}</Typography>
                <Chip size="small" label={selected.category} color="primary" variant="outlined" sx={{ flexShrink:0, height:24, fontSize:10 }} />
                <Chip size="small" label={getScopeLabel(selected)} variant="outlined" sx={{ flexShrink:0, height:24, fontSize:10 }} />
                <Chip size="small" label={selected.version_label} sx={{ flexShrink:0, height:24, fontSize:10 }} />
                <Stack direction="row" gap={0.45} alignItems="center" sx={{ ml:'auto', flexShrink:0 }}>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={selected.storage_provider === 'external' ? <OpenInNewRoundedIcon sx={{ fontSize:'15px !important' }} /> : <CloudDownloadRoundedIcon sx={{ fontSize:'15px !important' }} />}
                    onClick={() => openDocument(selected)}
                    sx={{ minWidth:'auto', height:24, px:0.9, py:0, fontSize:10, lineHeight:1, '& .MuiButton-startIcon':{ mr:0.45 } }}
                  >
                    {selected.storage_provider === 'external' ? '링크 열기' : '다운로드'}
                  </Button>
                  {isSuperAdmin && (
                    <>
                      <Tooltip title="자료 정보 수정"><IconButton size="small" onClick={openEdit} sx={{ width:24, height:24 }}><EditOutlinedIcon sx={{ fontSize:16 }} /></IconButton></Tooltip>
                      <Tooltip title="새 버전 등록"><IconButton size="small" onClick={openNewVersion} sx={{ width:24, height:24 }}><HistoryRoundedIcon sx={{ fontSize:16 }} /></IconButton></Tooltip>
                      <Tooltip title="자료 삭제"><IconButton size="small" color="error" onClick={() => setDeleteOpen(true)} sx={{ width:24, height:24 }}><DeleteOutlineRoundedIcon sx={{ fontSize:16 }} /></IconButton></Tooltip>
                    </>
                  )}
                </Stack>
              </Box>

              <Box sx={{ flex:1, minHeight:0, overflowY:'auto', p:1.4 }}>
                {selected.description && (
                  <Typography sx={{ mb:1.2, fontSize:11.5, color:'#334155', lineHeight:1.65, whiteSpace:'pre-wrap' }}>{selected.description}</Typography>
                )}
                <Paper variant="outlined" sx={{ p:1, mb:1.2, bgcolor:'#f8fafc' }}>
                  <Box sx={{ display:'grid', gridTemplateColumns:'92px minmax(0, 1fr)', rowGap:0.55, columnGap:1 }}>
                    <Typography sx={{ fontSize:10.5, color:'#64748b' }}>파일/링크</Typography>
                    <Typography sx={{ fontSize:10.5, fontWeight:700, wordBreak:'break-all' }}>{selected.original_file_name || selected.external_url}</Typography>
                    <Typography sx={{ fontSize:10.5, color:'#64748b' }}>크기</Typography>
                    <Typography sx={{ fontSize:10.5 }}>{selected.storage_provider === 'external' ? '외부 저장소' : formatBusinessLibraryBytes(selected.file_size)}</Typography>
                    <Typography sx={{ fontSize:10.5, color:'#64748b' }}>등록자</Typography>
                    <Typography sx={{ fontSize:10.5 }}>{getCreatorLabel(selected)}</Typography>
                    <Typography sx={{ fontSize:10.5, color:'#64748b' }}>등록일</Typography>
                    <Typography sx={{ fontSize:10.5 }}>{formatBusinessLibraryDate(selected.created_at)}</Typography>
                  </Box>
                </Paper>

                {previewLoading && <LinearProgress sx={{ mb:1 }} />}
                {previewUrl && isPreviewableImage(selected) && (
                  <Box component="img" src={previewUrl} alt={selected.title} sx={{ display:'block', maxWidth:'100%', maxHeight:520, mx:'auto', objectFit:'contain', border:'1px solid #e2e8f0' }} />
                )}
                {previewUrl && isPreviewablePdf(selected) && (
                  <Box component="iframe" title={`${selected.title} 미리보기`} src={previewUrl} sx={{ width:'100%', height:520, border:'1px solid #e2e8f0', bgcolor:'#fff' }} />
                )}
                {!previewUrl && !previewLoading && (
                  <Stack alignItems="center" justifyContent="center" sx={{ minHeight:180, border:'1px dashed #cbd5e1', borderRadius:1, color:'#94a3b8' }}>
                    {selected.storage_provider === 'external' ? <LinkRoundedIcon sx={{ fontSize:36 }} /> : <AttachFileRoundedIcon sx={{ fontSize:36 }} />}
                    <Typography sx={{ mt:0.7, fontSize:11 }}>이 형식은 화면 미리보기를 제공하지 않습니다.</Typography>
                  </Stack>
                )}

                {selectedHistory.length > 1 && (
                  <Box sx={{ mt:1.5 }}>
                    <Typography sx={{ mb:0.6, fontSize:11.5, fontWeight:800 }}>버전 이력</Typography>
                    <Stack gap={0.55}>
                      {selectedHistory.map((history) => (
                        <Stack key={history.id} direction="row" alignItems="center" gap={0.7} sx={{ px:0.9, py:0.65, border:'1px solid #e2e8f0', borderRadius:1, bgcolor:history.is_latest ? '#eff6ff' : '#fff' }}>
                          <Chip size="small" label={history.version_label} sx={{ height:20, fontSize:9.5 }} />
                          <Typography noWrap sx={{ flex:1, fontSize:10.5 }}>{history.original_file_name || '외부 링크'}</Typography>
                          <Typography sx={{ fontSize:9.5, color:'#64748b' }}>{formatBusinessLibraryDate(history.created_at)}</Typography>
                          <IconButton size="small" onClick={() => openDocument(history)}><CloudDownloadRoundedIcon sx={{ fontSize:17 }} /></IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      </Paper>

      <Dialog open={editorOpen} onClose={saving ? undefined : () => setEditorOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper:{ sx:{ height:'min(720px, calc(100vh - 40px))' } } }}>
        <DialogTitle sx={{ fontSize:15, fontWeight:800 }}>
          {editorMode === 'create' ? '업무자료 등록' : editorMode === 'version' ? '새 버전 등록' : '업무자료 수정'}
        </DialogTitle>
        <DialogContent dividers sx={{ overflowY:'auto' }}>
          <Stack gap={1.2}>
            <Stack direction={{ xs:'column', sm:'row' }} gap={1}>
              <TextField select size="small" label="분류" value={form.category} onChange={updateForm('category')} sx={{ ...fieldSx, minWidth:180 }}>
                {BUSINESS_LIBRARY_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
              </TextField>
              <TextField size="small" label="버전 표시" value={form.version_label} onChange={updateForm('version_label')} inputProps={{ maxLength:50 }} sx={{ ...fieldSx, flex:1 }} />
            </Stack>
            <TextField size="small" label="자료 제목" value={form.title} onChange={updateForm('title')} inputProps={{ maxLength:200 }} fullWidth sx={fieldSx} />
            <TextField multiline minRows={4} maxRows={8} label="설명" value={form.description} onChange={updateForm('description')} inputProps={{ maxLength:10000 }} fullWidth sx={fieldSx} />
            <Divider />
            <Stack direction={{ xs:'column', sm:'row' }} gap={1}>
              <TextField select size="small" label="자료 범위" value={form.scope_type} onChange={updateForm('scope_type')} sx={{ ...fieldSx, minWidth:180 }}>
                {BUSINESS_LIBRARY_SCOPES.map((scope) => <MenuItem key={scope.value} value={scope.value}>{scope.label}</MenuItem>)}
              </TextField>
              {form.scope_type === 'project' && (
                <TextField size="small" label="현장명" value={form.project_name} onChange={updateForm('project_name')} fullWidth sx={fieldSx} />
              )}
            </Stack>

            {editorMode === 'edit' ? (
              <Alert severity="info">파일을 교체해야 한다면 저장 후 ‘새 버전 등록’을 이용해주세요. 이전 파일도 버전 이력에 보관됩니다.</Alert>
            ) : (
              <>
                <TextField select size="small" label="등록 방식" value={form.storage_provider} onChange={updateForm('storage_provider')} sx={{ ...fieldSx, maxWidth:260 }}>
                  {BUSINESS_LIBRARY_PROVIDERS.map((provider) => <MenuItem key={provider.value} value={provider.value}>{provider.label}</MenuItem>)}
                </TextField>
                {form.storage_provider === 'supabase' ? (
                  <Box>
                    <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={saving}>
                      파일 선택
                      <input hidden type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                    </Button>
                    <Typography sx={{ mt:0.7, fontSize:10.5, color:selectedFile?.size > BUSINESS_LIBRARY_MAX_FILE_BYTES ? '#dc2626' : '#64748b' }}>
                      {selectedFile ? `${selectedFile.name} · ${formatBusinessLibraryBytes(selectedFile.size)}` : '파일당 최대 45MB · 6MB 초과 파일은 중단 시 이어올리기를 지원합니다.'}
                    </Typography>
                  </Box>
                ) : (
                  <TextField size="small" label="외부 자료 링크" value={form.external_url} onChange={updateForm('external_url')} placeholder="https://..." fullWidth sx={fieldSx} />
                )}
              </>
            )}

            {saving && editorMode !== 'edit' && form.storage_provider === 'supabase' && (
              <Box>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography align="right" sx={{ mt:0.35, fontSize:10.5, color:'#64748b' }}>업로드 {uploadProgress}%</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)} disabled={saving}>취소</Button>
          <Button variant="contained" onClick={saveDocument} disabled={saving} startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <UploadFileRoundedIcon />}>
            {editorMode === 'edit' ? '수정 저장' : '등록'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={saving ? undefined : () => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize:15, fontWeight:800 }}>업무자료 삭제</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning">“{selected?.title}” 자료와 {selectedHistory.length > 1 ? `이전 버전 ${selectedHistory.length - 1}개를 포함한 모든 파일을` : '등록된 파일을'} 삭제합니다. 삭제 후 복구할 수 없습니다.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={saving}>취소</Button>
          <Button color="error" variant="contained" onClick={deleteDocument} disabled={saving}>삭제</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
