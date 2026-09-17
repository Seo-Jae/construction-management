-- Main 개인 프로필 사진: 본인 계정의 사진만 조회/등록/교체할 수 있습니다.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_owner on storage.objects;
create policy profile_photos_owner on storage.objects
for all to authenticated
using (bucket_id = 'profile-photos' and name = auth.uid()::text || '/avatar')
with check (bucket_id = 'profile-photos' and name = auth.uid()::text || '/avatar');

-- 다른 저장소의 기존 광범위 정책이 있어도 이 버킷은 본인 파일만 허용합니다.
drop policy if exists profile_photos_owner_guard on storage.objects;
create policy profile_photos_owner_guard on storage.objects
as restrictive for all to public
using (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar')
with check (bucket_id <> 'profile-photos' or name = auth.uid()::text || '/avatar');
commit;
