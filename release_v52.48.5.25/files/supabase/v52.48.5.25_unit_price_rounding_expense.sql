-- v52.48.5.25
-- 일위대가 경비(단수정리) 항목 유형 추가

alter table public.unit_price_spec_items
  drop constraint if exists unit_price_spec_items_cost_type_check;

alter table public.unit_price_spec_items
  add constraint unit_price_spec_items_cost_type_check
  check (cost_type in ('material', 'labor', 'expense', 'expense_rounding'));

alter table public.unit_price_document_items
  drop constraint if exists unit_price_document_items_cost_type_check;

alter table public.unit_price_document_items
  add constraint unit_price_document_items_cost_type_check
  check (cost_type in ('material', 'labor', 'expense', 'expense_rounding'));

do $$
begin
  raise notice 'v52.48.5.25 적용 완료: 경비(단수정리) 항목 유형 추가';
end $$;
