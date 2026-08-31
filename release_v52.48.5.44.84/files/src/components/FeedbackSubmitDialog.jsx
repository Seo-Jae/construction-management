import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { supabase } from '../supabaseClient';
import {
  FEEDBACK_BUCKET,
  FEEDBACK_CATEGORIES,
  sanitizeFeedbackFileName,
} from '../config/feedbackCatalog.js';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_FILES = 'image/*,.pdf,.xlsx,.xls,.doc,.docx,.zip,.txt';

const emptyDraft = () => ({
  category: 'bug',
  title: '',
  content: '',
});

export default function FeedbackSubmitDialog({
  open,
  onClose,
  onSubmitted,
  userId = '',
  userProfile = {},
  sourceView = '',
  sourceLabel = '',
  dashboardScale = 1,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const resolvedUserId = String(
    userId || userProfile?.auth_user_id || '',
  ).trim();

  const reporterName = String(
    userProfile?.manager_name
      || userProfile?.name
      || userProfile?.email
      || '',
  ).trim();

  const projectName = String(
    userProfile?.project_name || '',
  ).trim();

  const role = String(
    userProfile?.role || '',
  ).trim();

  const sourceText = useMemo(() => (
    String(sourceLabel || sourceView || '현재 화면').trim()
  ), [sourceLabel, sourceView]);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setFiles([]);
    setMessage(null);
  }, [open]);

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';

    if (!selected.length) return;

    const next = [...files];

    for (const file of selected) {
      if (next.length >= MAX_FILES) {
        setMessage({
          severity: 'warning',
          text: `첨부파일은 최대 ${MAX_FILES}개까지 등록할 수 있습니다.`,
        });
        break;
      }

      if (file.size > MAX_FILE_SIZE) {
        setMessage({
          severity: 'warning',
          text: `${file.name} 파일은 10MB를 초과하여 제외했습니다.`,
        });
        continue;
      }

      next.push(file);
    }

    setFiles(next);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleSubmit = async () => {
    const title = String(draft.title || '').trim();
    const content = String(draft.content || '').trim();

    if (!resolvedUserId) {
      setMessage({
        severity: 'error',
        text: '로그인 사용자 정보를 확인하지 못했습니다.',
      });
      return;
    }

    if (!title) {
      setMessage({
        severity: 'warning',
        text: '제목을 입력해주세요.',
      });
      return;
    }

    if (!content) {
      setMessage({
        severity: 'warning',
        text: '내용을 입력해주세요.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const feedbackId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const uploadedPaths = [];

    try {
      const attachments = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const path = `${resolvedUserId}/${feedbackId}/${Date.now()}-${index}-${sanitizeFeedbackFileName(file.name)}`;

        const { error: uploadError } = await supabase
          .storage
          .from(FEEDBACK_BUCKET)
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
          });

        if (uploadError) throw uploadError;

        uploadedPaths.push(path);
        attachments.push({
          path,
          name: file.name,
          size: file.size,
          type: file.type || '',
        });
      }

      const clientMeta = {
        userAgent: navigator.userAgent || '',
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        dashboardScale: Number(dashboardScale) || 1,
        appVersion: import.meta.env.VITE_APP_VERSION || '',
        locationPath: window.location.pathname || '',
      };

      const { error } = await supabase
        .from('system_feedback')
        .insert({
          id: feedbackId,
          category: draft.category,
          title,
          content,
          project_name: projectName,
          source_view: String(sourceView || '').trim(),
          source_label: sourceText,
          created_by: resolvedUserId,
          created_by_name: reporterName,
          created_by_role: role,
          attachments,
          client_meta: clientMeta,
        });

      if (error) throw error;

      window.dispatchEvent(new CustomEvent('system-feedback-changed'));

      if (typeof onSubmitted === 'function') {
        onSubmitted(feedbackId);
      }

      onClose?.();
    } catch (error) {
      console.error('건의·오류 제보 등록 실패:', error);

      if (uploadedPaths.length) {
        await supabase
          .storage
          .from(FEEDBACK_BUCKET)
          .remove(uploadedPaths)
          .catch(() => {});
      }

      setMessage({
        severity: 'error',
        text: error?.message || '제보를 등록하지 못했습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(open)}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      {saving && <LinearProgress />}

      <DialogTitle sx={{ pb: 1 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
          건의·오류 제보
        </Typography>
        <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.7rem' }}>
          현재 화면과 사용자 정보는 자동으로 함께 기록됩니다.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.3}>
          {message && (
            <Alert severity={message.severity}>
              {message.text}
            </Alert>
          )}

          <Box
            sx={{
              p: 1,
              border: '1px solid #dbeafe',
              borderRadius: 1,
              bgcolor: '#eff6ff',
            }}
          >
            <Typography sx={{ color: '#1e3a8a', fontSize: '0.69rem', fontWeight: 800 }}>
              발생 화면
            </Typography>
            <Typography sx={{ mt: 0.15, color: '#334155', fontSize: '0.76rem' }}>
              {sourceText}
              {projectName ? ` · ${projectName}` : ''}
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="구분"
            value={draft.category}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              category: event.target.value,
            }))}
          >
            {FEEDBACK_CATEGORIES.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label="제목"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              title: event.target.value,
            }))}
            placeholder="예: 저장 버튼을 눌러도 반응이 없습니다."
            inputProps={{ maxLength: 120 }}
          />

          <TextField
            multiline
            minRows={6}
            label="내용"
            value={draft.content}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              content: event.target.value,
            }))}
            placeholder={'발생 상황과 원하는 개선 내용을 적어주세요.\n오류라면 어떤 순서로 발생했는지도 함께 적어주시면 확인이 빠릅니다.'}
            inputProps={{ maxLength: 4000 }}
          />

          <Box>
            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<AttachFileRoundedIcon />}
              disabled={saving || files.length >= MAX_FILES}
              sx={{ fontWeight: 800 }}
            >
              이미지·파일 첨부
              <input
                hidden
                multiple
                type="file"
                accept={ACCEPTED_FILES}
                onChange={handleFiles}
              />
            </Button>

            <Typography sx={{ mt: 0.5, color: '#94a3b8', fontSize: '0.64rem' }}>
              최대 5개 · 파일당 10MB
            </Typography>

            {files.length > 0 && (
              <Stack direction="row" gap={0.55} flexWrap="wrap" sx={{ mt: 0.8 }}>
                {files.map((file, index) => (
                  <Chip
                    key={`${file.name}-${file.size}-${index}`}
                    size="small"
                    label={file.name}
                    onDelete={saving ? undefined : () => removeFile(index)}
                    sx={{ maxWidth: 260 }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          startIcon={<SendRoundedIcon />}
          sx={{ fontWeight: 900 }}
        >
          등록
        </Button>
      </DialogActions>
    </Dialog>
  );
}
