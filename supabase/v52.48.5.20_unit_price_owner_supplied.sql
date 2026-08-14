-- v52.48.5.20
-- 일위대가 지급자재 여부 저장 및 기본 구성값 지원

begin;

alter table public.unit_price_spec_items
  add column if not exists is_owner_supplied boolean not null default false;

alter table public.unit_price_document_items
  add column if not exists is_owner_supplied boolean not null default false;

create or replace function public.save_unit_price_document(
  p_document jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document_id uuid;
  v_version integer;
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_document_id := nullif(p_document ->> 'id', '')::uuid;

  if v_document_id is null then
    insert into public.unit_price_documents (
      project_name,
      document_name,
      status,
      spec_id,
      major_category,
      middle_category,
      detail_category,
      material_markup_percent,
      labor_markup_percent,
      expense_markup_percent,
      image_url,
      notes,
      version_no,
      created_by,
      updated_by
    ) values (
      p_document ->> 'project_name',
      p_document ->> 'document_name',
      coalesce(nullif(p_document ->> 'status', ''), 'draft'),
      nullif(p_document ->> 'spec_id', '')::uuid,
      p_document ->> 'major_category',
      p_document ->> 'middle_category',
      p_document ->> 'detail_category',
      coalesce((p_document ->> 'material_markup_percent')::numeric, 0),
      coalesce((p_document ->> 'labor_markup_percent')::numeric, 0),
      coalesce((p_document ->> 'expense_markup_percent')::numeric, 0),
      coalesce(p_document ->> 'image_url', ''),
      coalesce(p_document ->> 'notes', ''),
      1,
      auth.uid(),
      auth.uid()
    ) returning id, version_no into v_document_id, v_version;
  else
    update public.unit_price_documents
       set project_name = p_document ->> 'project_name',
           document_name = p_document ->> 'document_name',
           status = coalesce(nullif(p_document ->> 'status', ''), 'draft'),
           spec_id = nullif(p_document ->> 'spec_id', '')::uuid,
           major_category = p_document ->> 'major_category',
           middle_category = p_document ->> 'middle_category',
           detail_category = p_document ->> 'detail_category',
           material_markup_percent = coalesce((p_document ->> 'material_markup_percent')::numeric, 0),
           labor_markup_percent = coalesce((p_document ->> 'labor_markup_percent')::numeric, 0),
           expense_markup_percent = coalesce((p_document ->> 'expense_markup_percent')::numeric, 0),
           image_url = coalesce(p_document ->> 'image_url', ''),
           notes = coalesce(p_document ->> 'notes', ''),
           version_no = version_no + 1,
           updated_by = auth.uid(),
           updated_at = now()
     where id = v_document_id
     returning version_no into v_version;

    if v_version is null then
      raise exception '수정할 일위대가 문서를 찾을 수 없습니다.';
    end if;

    delete from public.unit_price_document_items
     where document_id = v_document_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.unit_price_document_items (
      document_id,
      source_template_item_id,
      material_id,
      item_code,
      cost_type,
      item_name,
      specification,
      unit,
      net_quantity,
      net_unit_price,
      markup_override_percent,
      submitted_quantity,
      is_owner_supplied,
      remarks,
      sort_order
    ) values (
      v_document_id,
      nullif(v_item ->> 'source_template_item_id', '')::uuid,
      nullif(v_item ->> 'material_id', '')::uuid,
      coalesce(v_item ->> 'item_code', ''),
      coalesce(nullif(v_item ->> 'cost_type', ''), 'material'),
      v_item ->> 'item_name',
      coalesce(v_item ->> 'specification', ''),
      coalesce(v_item ->> 'unit', ''),
      coalesce((v_item ->> 'net_quantity')::numeric, 0),
      coalesce((v_item ->> 'net_unit_price')::numeric, 0),
      nullif(v_item ->> 'markup_override_percent', '')::numeric,
      coalesce((v_item ->> 'submitted_quantity')::numeric, 0),
      coalesce((v_item ->> 'is_owner_supplied')::boolean, false),
      coalesce(v_item ->> 'remarks', ''),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;

  insert into public.unit_price_document_revisions (
    document_id,
    version_no,
    snapshot,
    created_by
  ) values (
    v_document_id,
    v_version,
    jsonb_build_object('document', p_document, 'items', p_items),
    auth.uid()
  );

  return v_document_id;
end;
$$;

create or replace function public.replace_unit_price_spec_items(
  p_spec_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  delete from public.unit_price_spec_items where spec_id = p_spec_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.unit_price_spec_items (
      spec_id,
      material_id,
      cost_type,
      item_name,
      specification,
      unit,
      net_quantity,
      unit_price_override,
      sort_order,
      is_owner_supplied,
      remarks
    ) values (
      p_spec_id,
      nullif(v_item ->> 'material_id', '')::uuid,
      coalesce(nullif(v_item ->> 'cost_type', ''), 'material'),
      v_item ->> 'item_name',
      coalesce(v_item ->> 'specification', ''),
      coalesce(v_item ->> 'unit', ''),
      coalesce((v_item ->> 'net_quantity')::numeric, 0),
      nullif(v_item ->> 'unit_price_override', '')::numeric,
      coalesce((v_item ->> 'sort_order')::integer, 0),
      coalesce((v_item ->> 'is_owner_supplied')::boolean, false),
      coalesce(v_item ->> 'remarks', '')
    );
  end loop;
end;
$$;

grant execute on function public.save_unit_price_document(jsonb, jsonb) to authenticated;
grant execute on function public.replace_unit_price_spec_items(uuid, jsonb) to authenticated;

commit;
