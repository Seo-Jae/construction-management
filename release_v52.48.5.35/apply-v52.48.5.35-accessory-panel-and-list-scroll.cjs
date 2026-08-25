const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.35';
const ROOT = process.cwd();
const PAGE = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const UTIL_DST = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const UTIL_SRC = path.join(__dirname, 'files', 'src', 'utils', 'technicalImageSheetEditor.js');
const SQL_DST = path.join(ROOT, 'supabase', 'v52.48.5.35_unit_price_technical_accessories.sql');
const SQL_SRC = path.join(__dirname, 'files', 'supabase', 'v52.48.5.35_unit_price_technical_accessories.sql');

function stop(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(PAGE) || !fs.existsSync(UTIL_DST)) {
  stop('현재 프로젝트의 UnitPriceAnalysis.jsx 또는 technicalImageSheetEditor.js를 찾지 못했습니다.');
  return;
}
if (!fs.existsSync(UTIL_SRC) || !fs.existsSync(SQL_SRC)) {
  stop('교체 패키지 내부 파일을 찾지 못했습니다. ZIP을 다시 풀어주세요.');
  return;
}

let source = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
const currentUtil = fs.readFileSync(UTIL_DST, 'utf8');

if (source.includes('v52.48.5.35 상세 부속자재')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  return;
}
if (!source.includes('v52.48.5.34.2 Supabase Storage object key')) {
  stop('UnitPriceAnalysis.jsx가 v52.48.5.34.2 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}
if (!currentUtil.includes('stroke: #2563eb; stroke-width: .78')) {
  stop('technicalImageSheetEditor.js가 v52.48.5.34.1 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);
fs.mkdirSync(path.join(backupRoot, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupRoot, 'src', 'utils'), { recursive: true });
fs.copyFileSync(PAGE, path.join(backupRoot, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.copyFileSync(UTIL_DST, path.join(backupRoot, 'src', 'utils', 'technicalImageSheetEditor.js'));

function replaceOnce(find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`${label} 기준 코드를 찾지 못했습니다.`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`${label} 기준 코드가 2개 이상 발견되었습니다.`);
  }
  source = source.slice(0, index) + replacement + source.slice(index + find.length);
}

try {
  // 1) 공통 Storage path helper
  replaceOnce(
`const getTechnicalImageStoragePath = (imageKey) => (
  \`${'${'}normalizeTechnicalImageStorageKey(imageKey)}/technical-image\`
);`,
`const getTechnicalImageStoragePath = (imageKey) => (
  \`${'${'}normalizeTechnicalImageStorageKey(imageKey)}/technical-image\`
);

// v52.48.5.35 상세 부속자재 공통 라이브러리
const getTechnicalAccessoryStoragePath = (accessoryId) => (
  \`accessories/\${String(accessoryId || '').trim()}/image\`
);

const createTechnicalAccessoryId = () => (
  globalThis.crypto?.randomUUID?.()
  || \`accessory-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`
);`,
    'Storage helper',
  );

  // 2) state/ref
  replaceOnce(
`  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);


  const showToast`,
`  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);

  const technicalAccessoryImageInputRef = useRef(null);
  const [technicalAccessories, setTechnicalAccessories] = useState([]);
  const [technicalAccessoryIds, setTechnicalAccessoryIds] = useState([]);
  const [technicalAccessoryDialogOpen, setTechnicalAccessoryDialogOpen] = useState(false);
  const [technicalAccessoryName, setTechnicalAccessoryName] = useState('');
  const [technicalAccessoryUploadTarget, setTechnicalAccessoryUploadTarget] = useState(null);
  const [technicalAccessoryBusy, setTechnicalAccessoryBusy] = useState(false);


  const showToast`,
    '상세 부속자재 state',
  );

  // 3) accessory loader inserted after annotation effect
  replaceOnce(
`  }, [loadTechnicalAnnotations, selectedSpec?.image_key]);

  // v52.48.5.29 기술자료 이미지는 기존 image_key 그룹 단위로 관리합니다.`,
`  }, [loadTechnicalAnnotations, selectedSpec?.image_key]);

  // v52.48.5.35 상세 부속자재는 공통 라이브러리에 1회 업로드 후
  // image_key별 연결만 저장하여 여러 천정 공법에서 같은 이미지를 재사용합니다.
  const loadTechnicalAccessories = useCallback(async (imageKey) => {
    const normalizedKey = String(imageKey || '').trim();
    if (!normalizedKey) {
      setTechnicalAccessories([]);
      setTechnicalAccessoryIds([]);
      return [];
    }

    try {
      const [libraryResult, linksResult] = await Promise.all([
        supabase
          .from('unit_price_technical_accessory_library')
          .select('id, name, image_url, storage_path, created_at, updated_at')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('unit_price_technical_accessory_links')
          .select('accessory_id, sort_order')
          .eq('image_key', normalizedKey)
          .order('sort_order'),
      ]);

      if (libraryResult.error) throw libraryResult.error;
      if (linksResult.error) throw linksResult.error;

      const library = libraryResult.data || [];
      const linkedIds = (linksResult.data || []).map((item) => item.accessory_id);
      setTechnicalAccessories(library);
      setTechnicalAccessoryIds(linkedIds);
      return library;
    } catch (error) {
      const message = String(error?.message || '');
      if (
        error?.code === '42P01'
        || /unit_price_technical_accessory_/i.test(message)
      ) {
        console.warn('상세 부속자재 DB가 아직 준비되지 않았습니다:', error);
        setTechnicalAccessories([]);
        setTechnicalAccessoryIds([]);
        return [];
      }

      console.error('상세 부속자재 조회 실패:', error);
      setTechnicalAccessories([]);
      setTechnicalAccessoryIds([]);
      return [];
    }
  }, []);

  useEffect(() => {
    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTechnicalAccessories([]);
      setTechnicalAccessoryIds([]);
      return;
    }
    loadTechnicalAccessories(imageKey);
  }, [loadTechnicalAccessories, selectedSpec?.image_key]);

  const linkedTechnicalAccessories = useMemo(() => {
    const byId = new Map(technicalAccessories.map((item) => [item.id, item]));
    return technicalAccessoryIds
      .map((id, index) => {
        const item = byId.get(id);
        return item ? { ...item, sort_order: index } : null;
      })
      .filter(Boolean);
  }, [technicalAccessories, technicalAccessoryIds]);

  const persistTechnicalAccessoryLinks = useCallback(async (nextIds) => {
    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) throw new Error('기술자료 image_key가 없습니다.');

    const { error } = await supabase.rpc('set_unit_price_technical_accessories', {
      p_image_key: imageKey,
      p_accessory_ids: nextIds,
    });
    if (error) throw error;
    setTechnicalAccessoryIds(nextIds);
  }, [selectedSpec?.image_key]);

  const toggleTechnicalAccessory = useCallback(async (accessoryId, checked) => {
    if (!canManageTechnicalImages || technicalAccessoryBusy) return;

    const nextIds = checked
      ? [...new Set([...technicalAccessoryIds, accessoryId])]
      : technicalAccessoryIds.filter((id) => id !== accessoryId);

    setTechnicalAccessoryBusy(true);
    try {
      await persistTechnicalAccessoryLinks(nextIds);
    } catch (error) {
      console.error('상세 부속자재 연결 저장 실패:', error);
      showToast(error?.message || '부속자재 연결을 저장하지 못했습니다.', 'error');
    } finally {
      setTechnicalAccessoryBusy(false);
    }
  }, [
    canManageTechnicalImages,
    persistTechnicalAccessoryLinks,
    showToast,
    technicalAccessoryBusy,
    technicalAccessoryIds,
  ]);

  const beginTechnicalAccessoryUpload = useCallback((accessory = null) => {
    if (!canManageTechnicalImages || technicalAccessoryBusy) return;

    if (!accessory && !String(technicalAccessoryName || '').trim()) {
      showToast('새 부속자재명을 먼저 입력해주세요.', 'warning');
      return;
    }

    setTechnicalAccessoryUploadTarget(
      accessory
        ? {
          id: accessory.id,
          name: accessory.name,
          storagePath: accessory.storage_path,
        }
        : {
          id: '',
          name: String(technicalAccessoryName || '').trim(),
          storagePath: '',
        },
    );
    technicalAccessoryImageInputRef.current?.click();
  }, [
    canManageTechnicalImages,
    showToast,
    technicalAccessoryBusy,
    technicalAccessoryName,
  ]);

  const uploadTechnicalAccessory = useCallback(async (file) => {
    const target = technicalAccessoryUploadTarget;
    if (!file || !target || !canManageTechnicalImages) return;

    if (!UNIT_PRICE_TECHNICAL_IMAGE_TYPES.has(file.type)) {
      showToast('PNG, JPG(JPEG), WEBP 이미지만 업로드할 수 있습니다.', 'warning');
      return;
    }
    if (file.size > UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES) {
      showToast('부속자재 이미지는 10MB 이하만 업로드할 수 있습니다.', 'warning');
      return;
    }

    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) {
      showToast('선택한 규격의 기술자료 image_key가 없습니다.', 'warning');
      return;
    }

    const isNew = !target.id;
    const accessoryId = target.id || createTechnicalAccessoryId();
    const storagePath = target.storagePath || getTechnicalAccessoryStoragePath(accessoryId);

    setTechnicalAccessoryBusy(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = String(publicUrlData?.publicUrl || '').trim();
      if (!publicUrl) throw new Error('업로드된 부속자재 이미지 URL을 만들지 못했습니다.');

      const versionedUrl = \`${'${'}publicUrl}?v=\${Date.now()}\`;
      const { error: saveError } = await supabase.rpc('save_unit_price_technical_accessory', {
        p_accessory_id: accessoryId,
        p_name: target.name,
        p_image_url: versionedUrl,
        p_storage_path: storagePath,
      });
      if (saveError) throw saveError;

      if (isNew) {
        await persistTechnicalAccessoryLinks([
          ...new Set([...technicalAccessoryIds, accessoryId]),
        ]);
        setTechnicalAccessoryName('');
      }

      await loadTechnicalAccessories(imageKey);
      showToast(isNew ? '공통 부속자재를 업로드하고 현재 기술자료에 연결했습니다.' : '부속자재 이미지를 교체했습니다.');
    } catch (error) {
      console.error('상세 부속자재 업로드 실패:', error);
      showToast(error?.message || '상세 부속자재 이미지를 업로드하지 못했습니다.', 'error');
    } finally {
      setTechnicalAccessoryBusy(false);
      setTechnicalAccessoryUploadTarget(null);
      if (technicalAccessoryImageInputRef.current) {
        technicalAccessoryImageInputRef.current.value = '';
      }
    }
  }, [
    canManageTechnicalImages,
    loadTechnicalAccessories,
    persistTechnicalAccessoryLinks,
    selectedSpec?.image_key,
    showToast,
    technicalAccessoryIds,
    technicalAccessoryUploadTarget,
  ]);

  const deleteTechnicalAccessory = useCallback(async (accessory) => {
    if (!accessory?.id || !canManageTechnicalImages || technicalAccessoryBusy) return;

    const confirmed = window.confirm(
      \`"\${accessory.name}" 공통 부속자재를 삭제하시겠습니까?\\n\\n이 이미지는 다른 기술자료에서도 함께 사용될 수 있으며, 삭제하면 모든 연결에서 제거됩니다.\`,
    );
    if (!confirmed) return;

    setTechnicalAccessoryBusy(true);
    try {
      const { data: storagePath, error } = await supabase.rpc(
        'delete_unit_price_technical_accessory',
        { p_accessory_id: accessory.id },
      );
      if (error) throw error;

      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
          .remove([storagePath]);
        if (storageError) {
          console.warn('부속자재 Storage 파일 삭제 경고:', storageError);
        }
      }

      await loadTechnicalAccessories(selectedSpec?.image_key);
      showToast('공통 부속자재를 삭제했습니다.', 'info');
    } catch (error) {
      console.error('상세 부속자재 삭제 실패:', error);
      showToast(error?.message || '상세 부속자재를 삭제하지 못했습니다.', 'error');
    } finally {
      setTechnicalAccessoryBusy(false);
    }
  }, [
    canManageTechnicalImages,
    loadTechnicalAccessories,
    selectedSpec?.image_key,
    showToast,
    technicalAccessoryBusy,
  ]);

  // v52.48.5.29 기술자료 이미지는 기존 image_key 그룹 단위로 관리합니다.`,
    '상세 부속자재 loader/functions',
  );

  // 4) pass accessory list into viewer
  replaceOnce(
`    const previewWindow = openTechnicalSheetViewerWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
    });`,
`    const previewWindow = openTechnicalSheetViewerWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: linkedTechnicalAccessories,
    });`,
    'VIEW 상세 부속자재 전달',
  );

  replaceOnce(
`  }, [
    selectedDetail,
    selectedMiddle,
    selectedSpec?.image_url,
    showToast,
    technicalAnnotations,
    technicalSheetLayout,
  ]);`,
`  }, [
    selectedDetail,
    selectedMiddle,
    selectedSpec?.image_url,
    showToast,
    technicalAnnotations,
    technicalSheetLayout,
    linkedTechnicalAccessories,
  ]);`,
    'VIEW dependency',
  );

  // 5) technical card controls
  replaceOnce(
`                      {canManageTechnicalImages && selectedSpec?.image_url && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={technicalAnnotationBusy ? <CircularProgress size={13} /> : <EditNoteRoundedIcon />}
                          disabled={technicalAnnotationBusy}
                          onClick={openTechnicalAnnotationEditor}
                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}
                        >
                          지시선 편집
                        </Button>
                      )}
                      {canManageTechnicalImages && (`,
`                      {linkedTechnicalAccessories.length > 0 && (
                        <Chip
                          size="small"
                          label={\`부속 \${linkedTechnicalAccessories.length}\`}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.58rem', bgcolor: '#ffffff' }}
                        />
                      )}
                      {canManageTechnicalImages && selectedSpec?.image_url && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={technicalAnnotationBusy ? <CircularProgress size={13} /> : <EditNoteRoundedIcon />}
                          disabled={technicalAnnotationBusy}
                          onClick={openTechnicalAnnotationEditor}
                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}
                        >
                          지시선 편집
                        </Button>
                      )}
                      {canManageTechnicalImages && selectedSpec?.image_key && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ImageOutlinedIcon />}
                          disabled={technicalAccessoryBusy}
                          onClick={() => setTechnicalAccessoryDialogOpen(true)}
                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}
                        >
                          부속자재 관리
                        </Button>
                      )}
                      {canManageTechnicalImages && (`,
    '기술자료 카드 부속자재 버튼',
  );

  // 6) dialog before snackbar
  replaceOnce(
`      <Snackbar open={toast.open}`,
`      <Dialog
        open={technicalAccessoryDialogOpen}
        onClose={() => {
          if (!technicalAccessoryBusy) setTechnicalAccessoryDialogOpen(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          상세 부속자재 관리
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 1.5, fontSize: '0.74rem' }}>
            천정 공통자재는 이미지를 한 번만 업로드한 뒤 여러 기술자료에서 체크하여 재사용합니다.
            현재 기술자료에 체크된 항목만 VIEW 우측에 표시됩니다.
          </Alert>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={0.8}
            sx={{ mb: 1.5 }}
          >
            <TextField
              size="small"
              fullWidth
              label="새 공통 부속자재명"
              placeholder="예: SQ-Bar Hanger+Pin"
              value={technicalAccessoryName}
              disabled={technicalAccessoryBusy}
              onChange={(event) => setTechnicalAccessoryName(event.target.value)}
            />
            <Button
              variant="contained"
              startIcon={technicalAccessoryBusy ? <CircularProgress size={14} color="inherit" /> : <UploadFileRoundedIcon />}
              disabled={technicalAccessoryBusy || !String(technicalAccessoryName || '').trim()}
              onClick={() => beginTechnicalAccessoryUpload(null)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              이미지 업로드
            </Button>
          </Stack>

          <input
            ref={technicalAccessoryImageInputRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => uploadTechnicalAccessory(event.target.files?.[0])}
          />

          <Stack spacing={0.8}>
            {technicalAccessories.map((accessory) => {
              const checked = technicalAccessoryIds.includes(accessory.id);
              return (
                <Paper
                  key={accessory.id}
                  variant="outlined"
                  sx={{
                    p: 0.75,
                    display: 'grid',
                    gridTemplateColumns: '36px 110px minmax(0,1fr) auto',
                    gap: 1,
                    alignItems: 'center',
                    borderColor: checked ? '#93c5fd' : '#e2e8f0',
                    bgcolor: checked ? '#eff6ff' : '#fff',
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={checked}
                    disabled={technicalAccessoryBusy}
                    onChange={(event) => toggleTechnicalAccessory(accessory.id, event.target.checked)}
                    inputProps={{ 'aria-label': \`\${accessory.name} 현재 기술자료 연결\` }}
                  />
                  <Box
                    component="img"
                    src={accessory.image_url}
                    alt={accessory.name}
                    sx={{
                      width: 110,
                      height: 72,
                      objectFit: 'contain',
                      bgcolor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 0.8,
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>
                      {accessory.name}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: '0.62rem', color: checked ? '#2563eb' : '#94a3b8' }}>
                      {checked ? '현재 기술자료 VIEW에 표시 중' : '공통 라이브러리 · 미연결'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={technicalAccessoryBusy}
                      onClick={() => beginTechnicalAccessoryUpload(accessory)}
                      sx={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
                    >
                      이미지 교체
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      disabled={technicalAccessoryBusy}
                      onClick={() => deleteTechnicalAccessory(accessory)}
                      sx={{ fontSize: '0.65rem' }}
                    >
                      삭제
                    </Button>
                  </Stack>
                </Paper>
              );
            })}

            {technicalAccessories.length === 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  textAlign: 'center',
                  color: '#94a3b8',
                  borderStyle: 'dashed',
                }}
              >
                <ImageOutlinedIcon sx={{ fontSize: 38, mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 800 }}>
                  등록된 공통 부속자재가 없습니다.
                </Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setTechnicalAccessoryDialogOpen(false)}
            disabled={technicalAccessoryBusy}
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open}`,
    '상세 부속자재 관리 Dialog',
  );

  fs.writeFileSync(PAGE, source, 'utf8');
  fs.copyFileSync(UTIL_SRC, UTIL_DST);
  fs.mkdirSync(path.dirname(SQL_DST), { recursive: true });
  fs.copyFileSync(SQL_SRC, SQL_DST);

  console.log(`[${VERSION}] 적용 완료`);
  console.log('- VIEW: 좌측 기술자료 + 우측 상세 부속자재 패널');
  console.log('- 공통 부속자재 라이브러리 업로드/재사용/연결/교체/삭제');
  console.log('- 업로드/수정 권한: 기존 기술자료 이미지 관리 권한 그대로 사용');
  console.log('- 편집기 등록항목 목록: 남는 높이를 끝까지 사용하고 부족할 때만 스크롤');
  console.log(`- SQL 생성: ${path.relative(ROOT, SQL_DST)}`);
  console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
} catch (error) {
  console.error(`[적용 중단] ${error.message}`);
  console.error('기존 변경 보호를 위해 적용 도중 예상 코드가 다르면 더 이상 진행하지 않습니다.');
  process.exitCode = 1;
}
