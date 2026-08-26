-- v52.48.5.44.31 세대물량관리 저장 분류 추가
-- Supabase SQL Editor에서 1회 실행합니다.

alter table public.option_status_documents
  drop constraint if exists option_status_documents_category_check;

alter table public.option_status_documents
  add constraint option_status_documents_category_check
  check (
    option_category in (
      'insulation',
      'selection',
      'household_quantity'
    )
  );
