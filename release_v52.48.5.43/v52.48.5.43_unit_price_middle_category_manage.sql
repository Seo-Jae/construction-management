-- v52.48.5.43 자재관리 > 일위대가작성 > 중분류 관리
-- 최고관리자만 중분류명을 변경할 수 있습니다.
-- 기존 문서의 현재 중분류 표기는 함께 갱신하되, 버전이력 snapshot은 변경하지 않습니다.

create or replace function public.rename_unit_price_middle_category_v1(
  p_major_category text,
  p_old_middle_category text,
  p_new_middle_category text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := '';
  v_major text := btrim(coalesce(p_major_category, ''));
  v_old_middle text := btrim(coalesce(p_old_middle_category, ''));
  v_new_middle text := btrim(coalesce(p_new_middle_category, ''));
  v_conflicts text[];
  v_spec_count integer := 0;
  v_document_count integer := 0;
  v_target_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(role, '')
    into v_role
    from public.user_profiles
   where auth_user_id = auth.uid()
     and coalesce(account_status, '') <> 'disabled'
   limit 1;

  if v_role <> '최고관리자' then
    raise exception '중분류 수정은 최고관리자만 가능합니다.';
  end if;

  if v_major not in ('벽체', '천정') then
    raise exception '대분류가 올바르지 않습니다.';
  end if;

  if v_old_middle = '' then
    raise exception '수정할 중분류를 선택해주세요.';
  end if;

  if v_new_middle = '' then
    raise exception '변경할 중분류명을 입력해주세요.';
  end if;

  if length(v_new_middle) > 60 then
    raise exception '중분류명은 60자 이하로 입력해주세요.';
  end if;

  if v_old_middle = v_new_middle then
    return jsonb_build_object(
      'changed', false,
      'merged', false,
      'renamed_specs', 0,
      'updated_documents', 0,
      'middle_category', v_new_middle
    );
  end if;

  if not exists (
    select 1
      from public.unit_price_specs
     where major_category = v_major
       and middle_category = v_old_middle
  ) then
    raise exception '수정할 중분류 기준정보를 찾을 수 없습니다.';
  end if;

  select count(*)
    into v_target_count
    from public.unit_price_specs
   where major_category = v_major
     and middle_category = v_new_middle;

  -- 이미 존재하는 중분류명으로 합칠 수는 있지만,
  -- 양쪽에 동일한 세부규격이 있으면 어떤 기준정보를 남길지 자동 판단하지 않습니다.
  -- 데이터 손실을 막기 위해 해당 경우에는 변경을 중단합니다.
  select array_agg(source_spec.detail_category order by source_spec.detail_category)
    into v_conflicts
    from public.unit_price_specs source_spec
    join public.unit_price_specs target_spec
      on target_spec.major_category = source_spec.major_category
     and target_spec.middle_category = v_new_middle
     and target_spec.detail_category = source_spec.detail_category
     and target_spec.id <> source_spec.id
   where source_spec.major_category = v_major
     and source_spec.middle_category = v_old_middle;

  if coalesce(array_length(v_conflicts, 1), 0) > 0 then
    raise exception '대상 중분류에 동일한 세부규격이 이미 있습니다: %. 세부규격 중복을 먼저 정리한 뒤 다시 시도해주세요.',
      array_to_string(v_conflicts, ', ');
  end if;

  update public.unit_price_specs
     set middle_category = v_new_middle
   where major_category = v_major
     and middle_category = v_old_middle;
  get diagnostics v_spec_count = row_count;

  -- 현재 문서 목록의 분류명도 새 이름으로 맞춥니다.
  -- version_no는 올리지 않으며, 과거 revision snapshot은 역사 보존을 위해 그대로 둡니다.
  update public.unit_price_documents
     set middle_category = v_new_middle
   where major_category = v_major
     and middle_category = v_old_middle;
  get diagnostics v_document_count = row_count;

  return jsonb_build_object(
    'changed', true,
    'merged', v_target_count > 0,
    'renamed_specs', v_spec_count,
    'updated_documents', v_document_count,
    'middle_category', v_new_middle
  );
end;
$$;

revoke all on function public.rename_unit_price_middle_category_v1(text, text, text) from public;
grant execute on function public.rename_unit_price_middle_category_v1(text, text, text) to authenticated;
