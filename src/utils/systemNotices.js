// v52.48.5.44.88 공지사항 공통 조회·정규화
import { supabase } from '../supabaseClient';

export const SYSTEM_NOTICE_BUCKET = 'system-notice-images';

export const formatSystemNoticeDate = (value, includeTime = false) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, includeTime ? 16 : 10).replace(/-/g, '.');
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : {}),
  })
    .format(date)
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
};

export const getSystemNoticeImageUrl = (path) => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  return supabase.storage
    .from(SYSTEM_NOTICE_BUCKET)
    .getPublicUrl(normalizedPath).data.publicUrl;
};

export const normalizeSystemNotice = (notice) => ({
  ...notice,
  summary: String(notice?.summary || notice?.content || '').trim(),
  content: String(
    notice?.content || notice?.summary || '',
  ).trim(),
  image_paths: Array.isArray(notice?.image_paths)
    ? notice.image_paths.filter(Boolean)
    : [],
  published_at:
    notice?.published_at || notice?.updated_at || notice?.created_at || '',
});

export const fetchSystemNotices = async ({ limit } = {}) => {
  let query = supabase
    .from('system_notice_posts')
    .select(
      'id, category, title, summary, content, image_paths, published_at, created_at, updated_at',
    )
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .order('updated_at', { ascending: false });

  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (!error) {
    return (Array.isArray(data) ? data : []).map(normalizeSystemNotice);
  }

  // v88 SQL 적용 전에도 기존 3개 공지 UI가 유지되도록 기존 테이블로 대체합니다.
  let legacyQuery = supabase
    .from('system_notices')
    .select('id, category, title, content, updated_at')
    .order('id', { ascending: true });

  if (Number.isFinite(limit) && limit > 0) {
    legacyQuery = legacyQuery.limit(limit);
  }

  const legacyResult = await legacyQuery;
  if (legacyResult.error) throw error;

  return (Array.isArray(legacyResult.data) ? legacyResult.data : []).map(
    normalizeSystemNotice,
  );
};
