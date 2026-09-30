import { supabase } from '../supabaseClient';

export async function loadOrganizationPhotos() {
  const { data, error } = await supabase.rpc('organization_profile_photos_v196');
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return {};
  const paths = [...new Set(rows.map(row => row.photo_path))];
  const { data: urls, error: urlError } = await supabase.storage.from('profile-photos').createSignedUrls(paths, 3600);
  if (urlError) throw urlError;
  const byPath = new Map((urls || []).map(row => [row.path, row.signedUrl]));
  return Object.fromEntries(rows.map(row => [row.node_id, byPath.get(row.photo_path) || '']));
}
