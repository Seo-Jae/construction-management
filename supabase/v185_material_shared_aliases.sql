-- 공동 자재 검색어 후보 / 승인 / 해제 / 오류 신고. 연결된 Supabase에서 적용 완료.
-- 선행: v180 자재 등록 요청. 기존 자재·발주 데이터는 변경하지 않습니다.
-- 신규 테이블은 직접 접근을 차단하고, 권한을 검사하는 RPC로만 사용합니다.
-- 공유 조회는 검색어·자재 ID·승인 상태만 반환합니다. 현장/사용자 정보는 공유하지 않습니다.
begin;

create or replace function public.normalize_material_alias_v185(p_value text)
returns text language sql immutable strict set search_path = public as $$
  select lower(regexp_replace(normalize(btrim(p_value), NFKC), '[[:space:]]+', '', 'g'));
$$;

create table if not exists public.material_shared_aliases (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  material_id uuid not null references public.material_master_items(id) on delete cascade,
  keyword text not null check (length(btrim(keyword)) between 1 and 300),
  normalized_keyword text generated always as (public.normalize_material_alias_v185(keyword)) stored check (normalized_keyword <> ''),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique (project_name, material_id, normalized_keyword)
);
create index if not exists idx_material_shared_aliases_material on public.material_shared_aliases(material_id, status);
create table if not exists public.material_shared_alias_reports (
  alias_id uuid not null references public.material_shared_aliases(id) on delete cascade,
  reported_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(alias_id, reported_by)
);
alter table public.material_shared_aliases enable row level security;
alter table public.material_shared_alias_reports enable row level security;
revoke all on public.material_shared_aliases, public.material_shared_alias_reports from public, anon, authenticated;

create or replace function public.list_material_aliases_v185(
  p_project_name text, p_category_id uuid default null, p_process_name text default null, p_offset integer default 0
)
returns table(id uuid, material_id uuid, keyword text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.material_request_access_v180(p_project_name, false)
    or public.material_request_access_v180(p_project_name, true)) then raise exception '이 현장의 자재 조회 권한이 없습니다.'; end if;
  return query select a.id, a.material_id, a.keyword, a.status
  from public.material_shared_aliases a join public.material_master_items m on m.id = a.material_id
  where m.is_active and a.status in ('pending', 'approved')
    and (p_category_id is null or m.category_id = p_category_id)
    and (nullif(p_process_name, '') is null or m.process_name = p_process_name)
  order by a.id limit 500 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.propose_material_alias_v185(p_project_name text, p_material_id uuid, p_keyword text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not (public.material_request_access_v180(p_project_name, false)
    or public.material_request_access_v180(p_project_name, true)) then raise exception '이 현장의 자재 권한이 없습니다.'; end if;
  if p_keyword is null or public.normalize_material_alias_v185(p_keyword) = '' or length(btrim(p_keyword)) not between 1 and 300 then raise exception '검색어를 1~300자로 입력해주세요.'; end if;
  select standard_name into v_name from public.material_master_items where id = p_material_id and is_active;
  if not found then raise exception '사용 중인 자재를 선택해주세요.'; end if;
  if public.normalize_material_alias_v185(p_keyword) = public.normalize_material_alias_v185(v_name) then
    raise exception '표준 품명과 다른 검색어를 입력해주세요.';
  end if;
  insert into public.material_shared_aliases(project_name, material_id, keyword, created_by)
  values (p_project_name, p_material_id, btrim(p_keyword), auth.uid())
  on conflict (project_name, material_id, normalized_keyword) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.material_shared_aliases where project_name = p_project_name
      and material_id = p_material_id and normalized_keyword = public.normalize_material_alias_v185(p_keyword)
      and status <> 'rejected';
    if v_id is null then raise exception '관리자가 해제한 연결입니다. 관리자에게 검토를 요청해주세요.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.review_material_aliases_v185(p_project_name text, p_ids uuid[], p_status text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.material_request_access_v180(p_project_name, true) then raise exception '이 현장의 자재관리 권한이 없습니다.'; end if;
  if p_status is null or p_status not in ('approved', 'rejected') then raise exception '잘못된 검토 상태입니다.'; end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 500 then raise exception '검토할 검색어를 1~500개 선택해주세요.'; end if;
  perform 1 from public.material_shared_aliases where id = any(p_ids) for update;
  if exists(select 1 from unnest(p_ids) requested(id) left join public.material_shared_aliases a on a.id = requested.id
    where a.id is null or a.project_name <> p_project_name) then raise exception '다른 현장의 검색어는 검토할 수 없습니다.'; end if;
  update public.material_shared_aliases set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
  where project_name = p_project_name and id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.list_material_alias_reviews_v185(p_project_name text, p_offset integer default 0)
returns table(id uuid, keyword text, status text, standard_name text, specification text, process_name text, report_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.material_request_access_v180(p_project_name, true) then raise exception '이 현장의 자재관리 권한이 없습니다.'; end if;
  return query select a.id, a.keyword, a.status, m.standard_name, m.specification, m.process_name,
    (select count(*) from public.material_shared_alias_reports r where r.alias_id = a.id)
  from public.material_shared_aliases a join public.material_master_items m on m.id = a.material_id
  where a.project_name = p_project_name order by a.created_at, a.id
  limit 500 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.report_material_alias_v185(p_project_name text, p_alias_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.material_request_access_v180(p_project_name, false)
    or public.material_request_access_v180(p_project_name, true)) then raise exception '이 현장의 자재 권한이 없습니다.'; end if;
  if not exists(select 1 from public.material_shared_aliases a join public.material_master_items m on m.id = a.material_id
    where a.id = p_alias_id and a.status in ('pending', 'approved') and m.is_active) then raise exception '사용 중인 검색어가 아닙니다.'; end if;
  insert into public.material_shared_alias_reports(alias_id, reported_by) values(p_alias_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- 신규자재 요청 당시 검색어를 보존하고, 관리자 연결 시 자동으로 후보를 만듭니다.
alter table public.material_registration_requests add column if not exists search_term text not null default '';
create or replace function public.capture_material_request_alias_v185()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_keyword text; v_name text;
begin
  if old.material_id is not null or new.material_id is null then return new; end if;
  v_keyword := coalesce(nullif(btrim(new.search_term), ''), new.standard_name);
  select standard_name into v_name from public.material_master_items where id = new.material_id;
  if length(btrim(v_keyword)) between 1 and 300 and public.normalize_material_alias_v185(v_keyword) <> '' and
    public.normalize_material_alias_v185(v_keyword) <> public.normalize_material_alias_v185(v_name) then
    insert into public.material_shared_aliases(project_name, material_id, keyword, created_by)
    values(new.project_name, new.material_id, btrim(v_keyword), new.requested_by)
    on conflict (project_name, material_id, normalized_keyword) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_capture_material_request_alias_v185 on public.material_registration_requests;
create trigger trg_capture_material_request_alias_v185 after update of material_id on public.material_registration_requests
for each row execute function public.capture_material_request_alias_v185();

revoke all on function public.normalize_material_alias_v185(text),
  public.list_material_aliases_v185(text,uuid,text,integer), public.propose_material_alias_v185(text,uuid,text),
  public.review_material_aliases_v185(text,uuid[],text), public.list_material_alias_reviews_v185(text,integer),
  public.report_material_alias_v185(text,uuid), public.capture_material_request_alias_v185() from public, anon, authenticated;
grant execute on function public.list_material_aliases_v185(text,uuid,text,integer),
  public.propose_material_alias_v185(text,uuid,text), public.review_material_aliases_v185(text,uuid[],text),
  public.list_material_alias_reviews_v185(text,integer), public.report_material_alias_v185(text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
