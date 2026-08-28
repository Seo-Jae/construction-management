-- v52.48.5.44.68
-- 결재완료된 주간업무보고를 담당자가 수정본(작성중)으로 다시 저장할 수 있게 합니다.
-- 기존 weekly_reports 완료본은 재결재요청 전까지 유지되며,
-- 재결재요청 시 기존 complete_weekly_report_direct RPC가 최신 payload로 총괄 원본을 갱신합니다.

create or replace function public.save_weekly_report_revision_draft(
  p_document_id uuid,
  p_title text,
  p_report_key text,
  p_project_name text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_document_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_document_id is null then
    raise exception '수정할 주간업무보고를 확인하지 못했습니다.';
  end if;

  update public.report_documents
     set title = coalesce(nullif(btrim(p_title), ''), title),
         report_key = coalesce(nullif(btrim(p_report_key), ''), report_key),
         project_name = coalesce(nullif(btrim(p_project_name), ''), project_name),
         payload = coalesce(p_payload, '{}'::jsonb),
         status = 'draft',
         submitted_at = null,
         completed_at = null,
         updated_at = now()
   where id = p_document_id
     and report_type = 'weekly'
     and author_user_id = v_user_id
   returning id into v_document_id;

  if v_document_id is null then
    raise exception '본인이 작성한 주간업무보고만 수정할 수 있습니다.';
  end if;

  return v_document_id;
end;
$$;

grant execute on function public.save_weekly_report_revision_draft(
  uuid,
  text,
  text,
  text,
  jsonb
) to authenticated;
