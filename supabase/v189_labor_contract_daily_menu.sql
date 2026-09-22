-- Move the contract menu into the construction permission group.
-- Keep permission keys so existing templates, user overrides and RLS remain valid.
update public.permission_definitions
set area_code = 'construction',
    area_label = '공사일보·공정',
    menu_label = '근로계약서 작성'
where permission_key like 'labor.contract.%';
