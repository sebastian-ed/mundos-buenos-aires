(() => {
  const { getSupabase, isSupabaseConfigured } = window.Trama;
  const PAGE_SIZE = 1000;

  function normalizeSupabaseRow(row) {
    return {
      ...row,
      category: row.categories?.name || row.category || null,
      category_id: row.category_id || row.categories?.id || null
    };
  }

  async function loadFromSupabase() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase no está configurado.');
    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await client
        .from('spaces')
        .select('*, categories(id,name,slug)')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      const batch = (data || []).map(normalizeSupabaseRow);
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  }

  async function loadLocalData() {
    const response = await fetch('data/espacios-culturales.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar el archivo local de espacios.');
    return response.json();
  }

  async function loadSpaces() {
    if (isSupabaseConfigured()) {
      try {
        const data = await loadFromSupabase();
        if (data.length) return { data, source: 'supabase' };
        const local = await loadLocalData();
        return { data: local, source: 'local-empty-db' };
      } catch (error) {
        console.warn('Fallback a dataset local:', error);
        const local = await loadLocalData();
        return { data: local, source: 'local-fallback', error };
      }
    }

    return { data: await loadLocalData(), source: 'local' };
  }

  window.TramaData = { loadSpaces };
})();
