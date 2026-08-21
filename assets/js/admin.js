(() => {
  const { getSupabase, isSupabaseConfigured, escapeHtml, slugify, toNullableNumber, formatNumber } = window.Trama;
  const client = getSupabase();
  const PAGE_SIZE = 50;

  const state = {
    session: null,
    categories: [],
    slimSpaces: [],
    pageRows: [],
    page: 0,
    totalFiltered: 0,
    deleteTarget: null,
    editSpace: null,
    expectedTotal: null
  };

  const els = {};
  let spaceModal, categoryModal, deleteModal, toast;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    spaceModal = new bootstrap.Modal(document.getElementById('spaceModal'));
    categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));
    deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    toast = new bootstrap.Toast(document.getElementById('adminToast'), { delay: 3200 });

    if (!isSupabaseConfigured() || !client) {
      els.loginFeedback.textContent = 'Primero completá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en assets/js/config.js.';
      els.loginForm.querySelector('button').disabled = true;
      return;
    }

    const { data } = await client.auth.getSession();
    if (data.session) await establishAdminSession(data.session);
  }

  function cacheElements() {
    const ids = [
      'loginSection','dashboardSection','loginForm','loginEmail','loginPassword','loginFeedback','adminUserBox','adminEmail','logoutBtn',
      'seedBtn','exportBtn','newSpaceBtn','adminSpaceCount','adminActiveCount','adminCategoryCount','adminNeighborhoodCount','importStatus',
      'spacesTab','categoriesTab','adminSearch','adminCategoryFilter','adminNeighborhoodFilter','adminStatusFilter','spacesTableBody','adminPageInfo','prevPage','nextPage',
      'newCategoryBtn','categoriesList','spaceForm','spaceId','spaceName','spaceCategory','spaceSubcategory','spaceNeighborhood','spaceCommune','spaceAddress','spaceLatitude','spaceLongitude','spacePhone','spaceEmail','spaceWebsite','spaceInstagram','spaceFacebook','spaceImage','spaceDescription','spaceTag','spaceRooms','spaceCapacity','spaceActive','spaceFeatured','spaceFeedback','spaceModalTitle',
      'categoryForm','categoryId','categoryName','categoryFeedback','categoryModalTitle','deleteMessage','deleteConfirmInput','deleteFeedback','confirmDeleteBtn','adminToastBody'
    ];
    ids.forEach(id => els[id] = document.getElementById(id));
  }

  function bindEvents() {
    els.loginForm.addEventListener('submit', login);
    els.logoutBtn.addEventListener('click', logout);
    els.newSpaceBtn.addEventListener('click', () => openSpaceModal());
    els.newCategoryBtn.addEventListener('click', () => openCategoryModal());
    els.spaceForm.addEventListener('submit', saveSpace);
    els.categoryForm.addEventListener('submit', saveCategory);
    els.seedBtn.addEventListener('click', importBaseData);
    els.exportBtn.addEventListener('click', exportJson);

    document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.adminTab)));

    const refreshSearch = window.Trama.debounce(() => { state.page = 0; loadSpacePage(); }, 250);
    els.adminSearch.addEventListener('input', refreshSearch);
    [els.adminCategoryFilter, els.adminNeighborhoodFilter, els.adminStatusFilter].forEach(el => el.addEventListener('change', () => { state.page = 0; loadSpacePage(); }));
    els.prevPage.addEventListener('click', () => { if (state.page > 0) { state.page--; loadSpacePage(); } });
    els.nextPage.addEventListener('click', () => { if ((state.page + 1) * PAGE_SIZE < state.totalFiltered) { state.page++; loadSpacePage(); } });

    els.spacesTableBody.addEventListener('click', e => {
      const edit = e.target.closest('[data-edit-space]');
      const del = e.target.closest('[data-delete-space]');
      if (edit) openSpaceModal(state.pageRows.find(x => x.id === edit.dataset.editSpace));
      if (del) requestDelete('space', del.dataset.deleteSpace, del.dataset.name);
    });

    els.categoriesList.addEventListener('click', e => {
      const edit = e.target.closest('[data-edit-category]');
      const del = e.target.closest('[data-delete-category]');
      if (edit) openCategoryModal(state.categories.find(x => x.id === edit.dataset.editCategory));
      if (del) requestDelete('category', del.dataset.deleteCategory, del.dataset.name);
    });

    els.deleteConfirmInput.addEventListener('input', () => {
      els.confirmDeleteBtn.disabled = els.deleteConfirmInput.value.trim().toUpperCase() !== 'ELIMINAR';
    });
    els.confirmDeleteBtn.addEventListener('click', confirmDelete);
  }

  async function login(e) {
    e.preventDefault();
    els.loginFeedback.textContent = '';
    const button = els.loginForm.querySelector('button');
    button.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value
      });
      if (error) throw error;
      await establishAdminSession(data.session);
    } catch (error) {
      els.loginFeedback.textContent = readableError(error);
      await client.auth.signOut();
    } finally {
      button.disabled = false;
    }
  }

  async function establishAdminSession(session) {
    const { data: profile, error } = await client.from('profiles').select('role').eq('id', session.user.id).single();
    if (error || profile?.role !== 'admin') {
      await client.auth.signOut();
      els.loginFeedback.textContent = 'La cuenta existe, pero no tiene permisos de administrador.';
      return;
    }
    state.session = session;
    els.loginSection.classList.add('d-none');
    els.dashboardSection.classList.remove('d-none');
    els.adminUserBox.classList.remove('d-none');
    els.adminEmail.textContent = session.user.email || 'Administrador';
    await refreshAll();
  }

  async function logout() {
    await client.auth.signOut();
    location.reload();
  }

  async function refreshAll() {
    await Promise.all([loadCategories(), loadSlimSpaces(), loadBaseMeta()]);
    populateAdminFilters();
    updateStats();
    renderCategories();
    await loadSpacePage();
  }

  async function loadCategories() {
    const { data, error } = await client.from('categories').select('*').order('name');
    if (error) throw error;
    state.categories = data || [];
  }

  async function loadBaseMeta() {
    if (state.expectedTotal) return;
    try {
      const response = await fetch('data/meta.json', { cache: 'no-store' });
      if (!response.ok) return;
      const meta = await response.json();
      const total = Number(meta?.total_spaces);
      if (Number.isFinite(total) && total > 0) state.expectedTotal = total;
    } catch (_) {}
  }

  async function loadSlimSpaces() {
    const rows = [];
    let from = 0;
    while (true) {
      const { data, error } = await client.from('spaces').select('id,category_id,neighborhood,is_active').range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    state.slimSpaces = rows;
  }

  function updateStats() {
    els.adminSpaceCount.textContent = formatNumber(state.slimSpaces.length);
    els.adminActiveCount.textContent = formatNumber(state.slimSpaces.filter(x => x.is_active).length);
    els.adminCategoryCount.textContent = formatNumber(state.categories.length);
    els.adminNeighborhoodCount.textContent = formatNumber(new Set(state.slimSpaces.map(x => x.neighborhood).filter(Boolean)).size);

    if (els.importStatus && state.expectedTotal) {
      const missing = Math.max(0, state.expectedTotal - state.slimSpaces.length);
      els.importStatus.classList.toggle('d-none', missing === 0);
      els.importStatus.textContent = missing
        ? `Base incompleta: hay ${formatNumber(state.slimSpaces.length)} de ${formatNumber(state.expectedTotal)} espacios. Volvé a usar “Importar base inicial”: ahora la carga ignora coordenadas NA y completa los registros faltantes sin duplicar los existentes.`
        : '';
    }
  }

  function populateAdminFilters() {
    const currentCategory = els.adminCategoryFilter.value;
    const currentNeighborhood = els.adminNeighborhoodFilter.value;
    els.adminCategoryFilter.innerHTML = '<option value="">Todas las categorías</option>' + state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    els.spaceCategory.innerHTML = '<option value="">Seleccionar…</option>' + state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const neighborhoods = [...new Set(state.slimSpaces.map(x => x.neighborhood).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es'));
    els.adminNeighborhoodFilter.innerHTML = '<option value="">Todos los barrios</option>' + neighborhoods.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if ([...els.adminCategoryFilter.options].some(o => o.value === currentCategory)) els.adminCategoryFilter.value = currentCategory;
    if ([...els.adminNeighborhoodFilter.options].some(o => o.value === currentNeighborhood)) els.adminNeighborhoodFilter.value = currentNeighborhood;
  }

  async function loadSpacePage() {
    els.spacesTableBody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
    let query = client.from('spaces').select('*, categories(id,name)', { count: 'exact' });
    const search = els.adminSearch.value.trim();
    const category = els.adminCategoryFilter.value;
    const neighborhood = els.adminNeighborhoodFilter.value;
    const status = els.adminStatusFilter.value;

    if (search) {
      const q = search.replace(/[,%()]/g, ' ').trim();
      query = query.or(`name.ilike.%${q}%,address.ilike.%${q}%,neighborhood.ilike.%${q}%,tag.ilike.%${q}%`);
    }
    if (category) query = query.eq('category_id', category);
    if (neighborhood) query = query.eq('neighborhood', neighborhood);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);

    const from = state.page * PAGE_SIZE;
    const { data, error, count } = await query.order('name').range(from, from + PAGE_SIZE - 1);
    if (error) {
      els.spacesTableBody.innerHTML = `<tr><td colspan="6">${escapeHtml(readableError(error))}</td></tr>`;
      return;
    }
    state.pageRows = data || [];
    state.totalFiltered = count || 0;
    renderSpaceTable();
  }

  function renderSpaceTable() {
    if (!state.pageRows.length) {
      els.spacesTableBody.innerHTML = '<tr><td colspan="6">No hay registros con esos filtros.</td></tr>';
    } else {
      els.spacesTableBody.innerHTML = state.pageRows.map(row => `
        <tr>
          <td><div class="table-name">${escapeHtml(row.name || 'Sin nombre')}</div><div class="table-sub">ID ${escapeHtml(String(row.source_fid ?? row.id).slice(0,18))}</div></td>
          <td>${escapeHtml(row.categories?.name || '—')}</td>
          <td>${escapeHtml(row.neighborhood || '—')}</td>
          <td>${escapeHtml(row.address || '—')}</td>
          <td><span class="status-label ${row.is_active ? 'active' : ''}">${row.is_active ? 'Activo' : 'Inactivo'}</span></td>
          <td><div class="row-actions"><button type="button" data-edit-space="${row.id}">Editar</button><button class="danger" type="button" data-delete-space="${row.id}" data-name="${escapeHtml(row.name || '')}">Eliminar</button></div></td>
        </tr>`).join('');
    }
    const start = state.totalFiltered ? state.page * PAGE_SIZE + 1 : 0;
    const end = Math.min((state.page + 1) * PAGE_SIZE, state.totalFiltered);
    els.adminPageInfo.textContent = `${formatNumber(start)}–${formatNumber(end)} de ${formatNumber(state.totalFiltered)}`;
    els.prevPage.disabled = state.page === 0;
    els.nextPage.disabled = (state.page + 1) * PAGE_SIZE >= state.totalFiltered;
  }

  function openSpaceModal(row = null) {
    state.editSpace = row;
    els.spaceForm.reset();
    els.spaceFeedback.textContent = '';
    els.spaceId.value = row?.id || '';
    els.spaceModalTitle.textContent = row ? 'Editar espacio' : 'Nuevo espacio';
    els.spaceName.value = row?.name || '';
    els.spaceCategory.value = row?.category_id || row?.categories?.id || '';
    els.spaceSubcategory.value = row?.subcategory || '';
    els.spaceNeighborhood.value = row?.neighborhood || '';
    els.spaceCommune.value = row?.commune || '';
    els.spaceAddress.value = row?.address || '';
    els.spaceLatitude.value = row?.latitude ?? '';
    els.spaceLongitude.value = row?.longitude ?? '';
    els.spacePhone.value = row?.phone || '';
    els.spaceEmail.value = row?.email || '';
    els.spaceWebsite.value = row?.website || '';
    els.spaceInstagram.value = row?.instagram || '';
    els.spaceFacebook.value = row?.facebook || '';
    els.spaceImage.value = row?.image_url || '';
    els.spaceDescription.value = row?.description || '';
    els.spaceTag.value = row?.tag || '';
    els.spaceRooms.value = row?.room_count ?? '';
    els.spaceCapacity.value = row?.capacity_total ?? '';
    els.spaceActive.checked = row ? Boolean(row.is_active) : true;
    els.spaceFeatured.checked = row ? Boolean(row.is_featured) : false;
    spaceModal.show();
  }

  async function saveSpace(e) {
    e.preventDefault();
    els.spaceFeedback.textContent = 'Guardando…';
    const payload = {
      name: els.spaceName.value.trim(),
      category_id: els.spaceCategory.value,
      subcategory: nullableText(els.spaceSubcategory.value),
      neighborhood: nullableText(els.spaceNeighborhood.value),
      commune: nullableText(els.spaceCommune.value),
      address: nullableText(els.spaceAddress.value),
      latitude: toNullableNumber(els.spaceLatitude.value),
      longitude: toNullableNumber(els.spaceLongitude.value),
      phone: nullableText(els.spacePhone.value),
      email: nullableText(els.spaceEmail.value),
      website: nullableText(els.spaceWebsite.value),
      instagram: nullableText(els.spaceInstagram.value),
      facebook: nullableText(els.spaceFacebook.value),
      image_url: nullableText(els.spaceImage.value),
      description: nullableText(els.spaceDescription.value),
      tag: nullableText(els.spaceTag.value),
      room_count: toNullableNumber(els.spaceRooms.value),
      capacity_total: toNullableNumber(els.spaceCapacity.value),
      is_active: els.spaceActive.checked,
      is_featured: els.spaceFeatured.checked
    };
    try {
      let result;
      if (els.spaceId.value) result = await client.from('spaces').update(payload).eq('id', els.spaceId.value);
      else result = await client.from('spaces').insert(payload);
      if (result.error) throw result.error;
      spaceModal.hide();
      showToast(els.spaceId.value ? 'Espacio actualizado.' : 'Espacio creado.');
      await refreshAll();
    } catch (error) {
      els.spaceFeedback.textContent = readableError(error);
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === tab));
    els.spacesTab.classList.toggle('d-none', tab !== 'spaces');
    els.categoriesTab.classList.toggle('d-none', tab !== 'categories');
  }

  function renderCategories() {
    const usage = new Map();
    state.slimSpaces.forEach(x => usage.set(x.category_id, (usage.get(x.category_id) || 0) + 1));
    els.categoriesList.innerHTML = state.categories.map(c => `
      <div class="category-admin-row">
        <strong>${escapeHtml(c.name)}</strong>
        <span>${formatNumber(usage.get(c.id) || 0)} espacios</span>
        <div class="row-actions"><button type="button" data-edit-category="${c.id}">Renombrar</button><button class="danger" type="button" data-delete-category="${c.id}" data-name="${escapeHtml(c.name)}">Eliminar</button></div>
      </div>`).join('');
  }

  function openCategoryModal(category = null) {
    els.categoryForm.reset();
    els.categoryFeedback.textContent = '';
    els.categoryId.value = category?.id || '';
    els.categoryName.value = category?.name || '';
    els.categoryModalTitle.textContent = category ? 'Renombrar categoría' : 'Nueva categoría';
    categoryModal.show();
  }

  async function saveCategory(e) {
    e.preventDefault();
    const name = els.categoryName.value.trim().toUpperCase();
    if (!name) return;
    els.categoryFeedback.textContent = 'Guardando…';
    try {
      const payload = { name, slug: slugify(name) };
      const result = els.categoryId.value
        ? await client.from('categories').update(payload).eq('id', els.categoryId.value)
        : await client.from('categories').insert(payload);
      if (result.error) throw result.error;
      categoryModal.hide();
      showToast('Categoría guardada.');
      await refreshAll();
    } catch (error) {
      els.categoryFeedback.textContent = readableError(error);
    }
  }

  function requestDelete(type, id, name) {
    state.deleteTarget = { type, id, name };
    els.deleteConfirmInput.value = '';
    els.deleteFeedback.textContent = '';
    els.confirmDeleteBtn.disabled = true;
    els.deleteMessage.textContent = type === 'space'
      ? `Vas a eliminar definitivamente “${name}”. Esta acción no se puede deshacer.`
      : `Vas a eliminar la categoría “${name}”. Solo será posible si ningún espacio la está utilizando.`;
    deleteModal.show();
  }

  async function confirmDelete() {
    if (!state.deleteTarget || els.deleteConfirmInput.value.trim().toUpperCase() !== 'ELIMINAR') return;
    els.confirmDeleteBtn.disabled = true;
    els.deleteFeedback.textContent = 'Eliminando…';
    try {
      const table = state.deleteTarget.type === 'space' ? 'spaces' : 'categories';
      const { error } = await client.from(table).delete().eq('id', state.deleteTarget.id);
      if (error) throw error;
      deleteModal.hide();
      showToast(state.deleteTarget.type === 'space' ? 'Espacio eliminado.' : 'Categoría eliminada.');
      state.deleteTarget = null;
      await refreshAll();
    } catch (error) {
      els.deleteFeedback.textContent = state.deleteTarget?.type === 'category'
        ? 'No se pudo eliminar. Si la categoría está en uso, reasigná primero sus espacios.'
        : readableError(error);
      els.confirmDeleteBtn.disabled = false;
    }
  }

  async function importBaseData() {
    if (!state.session) return;
    const existing = state.slimSpaces.length;
    if (existing && !window.confirm(`Ya hay ${existing} espacios en la base. La importación actualizará por source_fid y agregará faltantes. ¿Continuar?`)) return;
    els.seedBtn.disabled = true;
    els.seedBtn.textContent = 'Importando…';
    try {
      const response = await fetch('data/espacios-culturales.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo leer el archivo base.');
      const records = await response.json();
      const categoryNames = [...new Set(records.map(r => r.category).filter(Boolean))];
      const categoryRows = categoryNames.map(name => ({ name, slug: slugify(name) }));
      const { error: catError } = await client.from('categories').upsert(categoryRows, { onConflict: 'name' });
      if (catError) throw catError;
      await loadCategories();
      const categoryMap = new Map(state.categories.map(c => [c.name, c.id]));

      const mapped = records.map(r => ({
        source_fid: r.source_fid,
        category_id: categoryMap.get(r.category),
        subcategory: nullableDatasetText(r.subcategory),
        name: r.name,
        secondary_function: nullableDatasetText(r.secondary_function),
        programming: nullableDatasetText(r.programming),
        branch: nullableDatasetText(r.branch),
        room: nullableDatasetText(r.room),
        street: nullableDatasetText(r.street),
        street_number: nullableDatasetText(r.street_number),
        neighborhood: nullableDatasetText(r.neighborhood),
        commune: nullableDatasetText(r.commune),
        address: nullableDatasetText(r.address),
        longitude: toNullableNumber(r.longitude),
        latitude: toNullableNumber(r.latitude),
        phone: nullableDatasetText(r.phone),
        email: nullableDatasetText(r.email),
        website: nullableDatasetText(r.website),
        facebook: nullableDatasetText(r.facebook),
        twitter: nullableDatasetText(r.twitter),
        instagram: nullableDatasetText(r.instagram),
        camera_1: nullableDatasetText(r.camera_1),
        camera_2: nullableDatasetText(r.camera_2),
        networks: nullableDatasetText(r.networks),
        culture_point: nullableDatasetText(r.culture_point),
        other_networks: nullableDatasetText(r.other_networks),
        room_count: toNullableNumber(r.room_count),
        capacity_total: toNullableNumber(r.capacity_total),
        tag: nullableDatasetText(r.tag),
        is_active: true
      }));

      for (let i = 0; i < mapped.length; i += 200) {
        els.seedBtn.textContent = `Importando ${Math.min(i + 200, mapped.length)}/${mapped.length}`;
        const { error } = await client.from('spaces').upsert(mapped.slice(i, i + 200), { onConflict: 'source_fid' });
        if (error) throw error;
      }
      showToast(`Base importada: ${formatNumber(mapped.length)} espacios.`);
      await refreshAll();
    } catch (error) {
      showToast(`Error de importación: ${readableError(error)}`);
    } finally {
      els.seedBtn.disabled = false;
      els.seedBtn.textContent = 'Importar base inicial';
    }
  }

  async function exportJson() {
    els.exportBtn.disabled = true;
    els.exportBtn.textContent = 'Exportando…';
    try {
      const all = [];
      let from = 0;
      while (true) {
        const { data, error } = await client.from('spaces').select('*, categories(name)').order('name').range(from, from + 999);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trama-espacios-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(`No se pudo exportar: ${readableError(error)}`);
    } finally {
      els.exportBtn.disabled = false;
      els.exportBtn.textContent = 'Exportar JSON';
    }
  }

  function nullableText(value) {
    const clean = String(value || '').trim();
    return clean || null;
  }

  function nullableDatasetText(value) {
    if (value == null) return null;
    const clean = String(value).trim();
    if (!clean || /^(na|n\/a|s\/d|sin dato|null|undefined)$/i.test(clean) || /^comuna\s+na$/i.test(clean)) return null;
    return clean;
  }

  function showToast(message) {
    els.adminToastBody.textContent = message;
    toast.show();
  }

  function readableError(error) {
    const msg = error?.message || String(error || 'Error desconocido');
    if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
    if (/duplicate key/i.test(msg)) return 'Ya existe un registro con ese valor único.';
    return msg;
  }
})();
