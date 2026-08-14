-- v52.48.5.26
-- 경비(단수정리)를 재료비(단수정리)로 정정

alter table public.unit_price_spec_items
  drop constraint if exists unit_price_spec_items_cost_type_check;

alter table public.unit_price_document_items
  drop constraint if exists unit_price_document_items_cost_type_check;

update public.unit_price_spec_items
set
  cost_type = 'material_rounding',
  item_name = case when item_name = '경비 단수정리' then '' else item_name end,
  specification = case
    when specification = '제출금액 100원 단위 정리' then ''
    else specification
  end
where cost_type = 'expense_rounding';

update public.unit_price_document_items
set
  cost_type = 'material_rounding',
  item_name = case when item_name = '경비 단수정리' then '' else item_name end,
  specification = case
    when specification = '제출금액 100원 단위 정리' then ''
    else specification
  end,
  updated_at = now()
where cost_type = 'expense_rounding';

alter table public.unit_price_spec_items
  add constraint unit_price_spec_items_cost_type_check
  check (cost_type in ('material', 'labor', 'expense', 'material_rounding'));

alter table public.unit_price_document_items
  add constraint unit_price_document_items_cost_type_check
  check (cost_type in ('material', 'labor', 'expense', 'material_rounding'));

do $$
begin
  raise notice 'v52.48.5.26 적용 완료: 재료비(단수정리) 항목 유형 정정';
end $$;
