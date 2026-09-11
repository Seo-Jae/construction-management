export const normalizeMaterialAlias = (value) => String(value ?? '')
  .normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

export const attachMaterialAliases = (materials, aliases) => {
  const byMaterial = new Map();
  for (const alias of aliases) {
    if (!['pending', 'approved'].includes(alias.status)) continue;
    const list = byMaterial.get(alias.material_id) || [];
    list.push(alias);
    byMaterial.set(alias.material_id, list);
  }
  return materials.map((material) => ({
    ...material,
    sharedAliases: byMaterial.get(material.materialId || material.id) || [],
  }));
};

export const matchingMaterialAliases = (material, keyword) => {
  const normalized = normalizeMaterialAlias(keyword);
  if (!normalized) return [];
  return (material.sharedAliases || []).filter((alias) =>
    normalizeMaterialAlias(alias.keyword).includes(normalized));
};

export const isKnownMaterialAlias = (material, keyword) => {
  const normalized = normalizeMaterialAlias(keyword);
  return !normalized || [material.standard_name, ...(material.aliases || []),
    ...(material.sharedAliases || []).map((alias) => alias.keyword)]
    .some((value) => normalizeMaterialAlias(value) === normalized);
};

export const loadMaterialAliasPages = async (client, rpc, args) => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.rpc(rpc, { ...args, p_offset: offset });
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
};

export const isMaterialAliasSchemaMissing = (error) =>
  ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code);

export const loadMaterialRowsInBatches = async (ids, buildQuery) => {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await buildQuery(ids.slice(offset, offset + 200));
    if (error) return { data: [], error };
    rows.push(...(data || []));
  }
  return { data: rows, error: null };
};
