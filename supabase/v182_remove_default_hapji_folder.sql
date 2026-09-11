-- Supabase SQL Editor에서 직접 실행하세요. 선행: v147 하위 폴더 SQL.
-- '각 공정자재' 아래 '합지' 폴더만 기존 폴더 삭제 방식대로 비활성화합니다.
-- 자재, 발주서, 품목 데이터는 변경하지 않습니다.
-- 기존 발주서는 상위 '각 공정자재' 목록에서 계속 조회할 수 있습니다.
begin;

update public.material_supply_category_folders as folder
set is_active = false,
    updated_at = now()
from public.material_supply_categories as category
where folder.category_id = category.id
  and category.name = '각 공정자재'
  and folder.name = '합지'
  and folder.is_active = true;

commit;

-- 적용 확인: 합지 폴더의 is_active가 false이면 완료입니다.
select category.name as category_name, folder.name as folder_name, folder.is_active
from public.material_supply_category_folders as folder
join public.material_supply_categories as category on category.id = folder.category_id
where category.name = '각 공정자재' and folder.name = '합지';
