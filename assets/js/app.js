(() => {
  const {
    normalizeText,
    escapeHtml,
    safeUrl,
    formatNumber,
    debounce,
    communeSort
  } = window.Trama;

  const state = {
    all: [],
    filtered: [],
    source: 'local',
    expandedNeighborhoods: new Set(),
    map: null,
    markerLayer: null,
    markersByKey: new Map(),
    mapReady: false
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    els.currentYear.textContent = new Date().getFullYear();

    try {
      const result = await window.TramaData.loadSpaces();
      state.all = (result.data || []).map(normalizeRecord).filter(r => r.name);
      state.source = result.source;
      configureFilters();
      renderNeighborhoodIndex();
      updateHeroStats();
      initMap();
      applyFilters();
      updateDataStatus();
    } catch (error) {
      console.error(error);
      els.loadingState.innerHTML = '<p>No se pudo cargar el catálogo. Revisá la configuración o serví el proyecto desde un servidor web.</p>';
      els.dataStatus.textContent = 'Error de carga';
    }
  }

  function cacheElements() {
    Object.assign(els, {
      searchInput: document.getElementById('searchInput'),
      categoryFilter: document.getElementById('categoryFilter'),
      neighborhoodFilter: document.getElementById('neighborhoodFilter'),
      communeFilter: document.getElementById('communeFilter'),
      sortFilter: document.getElementById('sortFilter'),
      clearFilters: document.getElementById('clearFilters'),
      emptyReset: document.getElementById('emptyReset'),
      resultCount: document.getElementById('resultCount'),
      catalogView: document.getElementById('catalogView'),
      loadingState: document.getElementById('loadingState'),
      emptyState: document.getElementById('emptyState'),
      neighborhoodLinks: document.getElementById('neighborhoodLinks'),
      dataStatus: document.getElementById('dataStatus'),
      dataStatusDot: document.getElementById('dataStatusDot'),
      heroSpaces: document.getElementById('heroSpaces'),
      heroNeighborhoods: document.getElementById('heroNeighborhoods'),
      heroCategories: document.getElementById('heroCategories'),
      mapCount: document.getElementById('mapCount'),
      currentYear: document.getElementById('currentYear')
    });
  }

  function bindEvents() {
    const debouncedFilter = debounce(applyFilters, 170);
    els.searchInput.addEventListener('input', debouncedFilter);
    [els.categoryFilter, els.neighborhoodFilter, els.communeFilter, els.sortFilter].forEach(el => el.addEventListener('change', applyFilters));
    els.clearFilters.addEventListener('click', resetFilters);
    els.emptyReset.addEventListener('click', resetFilters);

    els.catalogView.addEventListener('click', e => {
      const more = e.target.closest('[data-more-neighborhood]');
      if (more) {
        state.expandedNeighborhoods.add(more.dataset.moreNeighborhood);
        renderCatalog();
        return;
      }
      const mapButton = e.target.closest('[data-map-key]');
      if (mapButton) focusOnMap(mapButton.dataset.mapKey);
    });

    els.neighborhoodLinks.addEventListener('click', e => {
      const button = e.target.closest('[data-neighborhood]');
      if (!button) return;
      els.neighborhoodFilter.value = button.dataset.neighborhood;
      applyFilters();
      document.getElementById('explorar').scrollIntoView({ behavior: 'smooth' });
    });

    document.querySelectorAll('[data-view]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button));
        if (button.dataset.view === 'map') {
          document.getElementById('mapa').scrollIntoView({ behavior: 'smooth' });
          setTimeout(() => state.map?.invalidateSize(), 450);
        } else {
          document.getElementById('explorar').scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  function normalizeRecord(record) {
    return {
      ...record,
      name: record.name || record.establishment || '',
      category: record.category || record.categories?.name || 'OTROS',
      neighborhood: record.neighborhood || 'SIN BARRIO',
      commune: record.commune || '',
      address: record.address || '',
      latitude: toFiniteNumber(record.latitude),
      longitude: toFiniteNumber(record.longitude),
      capacity_total: toFiniteNumber(record.capacity_total),
      room_count: toFiniteNumber(record.room_count)
    };
  }

  function toFiniteNumber(value) {
    const n = Number(value);
    return value !== '' && value != null && Number.isFinite(n) ? n : null;
  }

  function configureFilters() {
    const categories = [...new Set(state.all.map(x => x.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es'));
    const neighborhoods = [...new Set(state.all.map(x => x.neighborhood).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es'));
    const communes = [...new Set(state.all.map(x => x.commune).filter(Boolean))].sort(communeSort);
    fillSelect(els.categoryFilter, categories, 'Todas');
    fillSelect(els.neighborhoodFilter, neighborhoods, 'Todos');
    fillSelect(els.communeFilter, communes, 'Todas');
  }

  function fillSelect(select, values, allLabel) {
    const first = `<option value="">${allLabel}</option>`;
    select.innerHTML = first + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  function buildSearchHaystack(item) {
    return normalizeText([
      item.name, item.category, item.subcategory, item.secondary_function, item.programming,
      item.neighborhood, item.commune, item.address, item.street, item.tag,
      item.culture_point, item.networks, item.other_networks
    ].filter(Boolean).join(' '));
  }

  function applyFilters() {
    state.expandedNeighborhoods.clear();
    const q = normalizeText(els.searchInput.value);
    const terms = q.split(' ').filter(Boolean);
    const category = els.categoryFilter.value;
    const neighborhood = els.neighborhoodFilter.value;
    const commune = els.communeFilter.value;

    state.filtered = state.all.filter(item => {
      if (category && item.category !== category) return false;
      if (neighborhood && item.neighborhood !== neighborhood) return false;
      if (commune && item.commune !== commune) return false;
      if (!terms.length) return true;
      const haystack = item.__haystack || (item.__haystack = buildSearchHaystack(item));
      return terms.every(term => haystack.includes(term));
    });

    renderCatalog();
    renderMapMarkers();
    els.resultCount.textContent = formatNumber(state.filtered.length);
    els.loadingState.classList.add('d-none');
    els.emptyState.classList.toggle('d-none', state.filtered.length > 0);
    els.catalogView.classList.toggle('d-none', state.filtered.length === 0);
  }

  function resetFilters() {
    els.searchInput.value = '';
    els.categoryFilter.value = '';
    els.neighborhoodFilter.value = '';
    els.communeFilter.value = '';
    els.sortFilter.value = 'name';
    applyFilters();
  }

  function sortItems(items) {
    const mode = els.sortFilter.value;
    const copy = [...items];
    if (mode === 'capacity') {
      return copy.sort((a,b) => (b.capacity_total || -1) - (a.capacity_total || -1) || a.name.localeCompare(b.name,'es'));
    }
    return copy.sort((a,b) => a.name.localeCompare(b.name,'es'));
  }

  function renderCatalog() {
    const groups = new Map();
    state.filtered.forEach(item => {
      const key = item.neighborhood || 'SIN BARRIO';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const groupEntries = [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0],'es'));
    els.catalogView.innerHTML = groupEntries.map(([neighborhood, items]) => {
      const sorted = sortItems(items);
      const expanded = state.expandedNeighborhoods.has(neighborhood) || els.neighborhoodFilter.value === neighborhood;
      const visible = expanded ? sorted : sorted.slice(0, 6);
      return `
        <section class="neighborhood-group" id="group-${escapeHtml(window.Trama.slugify(neighborhood))}">
          <div class="neighborhood-head">
            <h3>${escapeHtml(toTitleCase(neighborhood))}</h3>
            <span>${formatNumber(items.length)} ${items.length === 1 ? 'espacio' : 'espacios'}</span>
          </div>
          <div class="space-grid">
            ${visible.map(renderCard).join('')}
          </div>
          ${!expanded && sorted.length > 6 ? `<button type="button" class="group-more" data-more-neighborhood="${escapeHtml(neighborhood)}">Ver ${formatNumber(sorted.length - 6)} más en ${escapeHtml(toTitleCase(neighborhood))}</button>` : ''}
        </section>`;
    }).join('');
  }

  function renderCard(item) {
    const key = item.id || item.source_fid || `${item.name}-${item.latitude}-${item.longitude}`;
    const site = safeUrl(item.website);
    const hasCoords = Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
    const hasImage = safeUrl(item.image_url);
    const imageForCss = hasImage ? hasImage.replace(/'/g, '%27').replace(/\"/g, '%22') : null;
    const cardStyle = imageForCss ? ` style="background-image:url('${escapeHtml(imageForCss)}')"` : '';
    const meta = [item.commune, item.subcategory, item.capacity_total ? `Cap. ${formatNumber(item.capacity_total)}` : null].filter(Boolean);
    return `
      <article class="space-card${hasImage ? ' has-image' : ''}"${cardStyle}>
        <div class="space-category">${escapeHtml(item.category || 'Espacio cultural')}</div>
        <h4 class="space-name">${escapeHtml(toTitleCase(item.name))}</h4>
        <p class="space-address">${escapeHtml(item.address || item.neighborhood || 'Ciudad de Buenos Aires')}</p>
        <div class="space-meta">${meta.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div>
        <div class="space-actions">
          ${hasCoords ? `<button type="button" data-map-key="${escapeHtml(String(key))}">Ver en mapa</button>` : ''}
          ${site ? `<a href="${escapeHtml(site)}" target="_blank" rel="noopener noreferrer">Sitio web</a>` : ''}
        </div>
      </article>`;
  }

  function renderNeighborhoodIndex() {
    const counts = new Map();
    state.all.forEach(item => counts.set(item.neighborhood, (counts.get(item.neighborhood) || 0) + 1));
    els.neighborhoodLinks.innerHTML = [...counts.entries()]
      .sort((a,b) => a[0].localeCompare(b[0],'es'))
      .map(([name,count]) => `<button class="neighborhood-link" type="button" data-neighborhood="${escapeHtml(name)}"><strong>${escapeHtml(toTitleCase(name))}</strong><span>${formatNumber(count)}</span></button>`)
      .join('');
  }

  function updateHeroStats() {
    els.heroSpaces.textContent = formatNumber(state.all.length);
    els.heroNeighborhoods.textContent = formatNumber(new Set(state.all.map(x => x.neighborhood).filter(Boolean)).size);
    els.heroCategories.textContent = formatNumber(new Set(state.all.map(x => x.category).filter(Boolean)).size);
  }

  function updateDataStatus() {
    const labels = {
      supabase: 'Catálogo conectado · Supabase',
      'local-empty-db': 'Vista base local · Supabase todavía sin registros',
      'local-fallback': 'Vista base local · conexión a Supabase no disponible',
      local: 'Vista base local · configurá Supabase para gestión en vivo'
    };
    els.dataStatus.textContent = labels[state.source] || 'Catálogo cargado';
    els.dataStatusDot.classList.toggle('live', state.source === 'supabase');
  }

  function initMap() {
    if (!window.L || state.mapReady) return;
    state.map = L.map('culturalMap', { zoomControl: true, scrollWheelZoom: false }).setView([-34.6037, -58.3816], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
    state.markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 45
    });
    state.map.addLayer(state.markerLayer);
    state.mapReady = true;
  }

  function renderMapMarkers() {
    if (!state.mapReady || !state.markerLayer) return;
    state.markerLayer.clearLayers();
    state.markersByKey.clear();
    const markers = [];

    state.filtered.forEach(item => {
      if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;
      const key = String(item.id || item.source_fid || `${item.name}-${item.latitude}-${item.longitude}`);
      const marker = L.marker([item.latitude, item.longitude]);
      const site = safeUrl(item.website);
      marker.bindPopup(`
        <div class="popup-category">${escapeHtml(item.category || 'Espacio cultural')}</div>
        <div class="popup-title">${escapeHtml(toTitleCase(item.name))}</div>
        <p class="popup-copy">${escapeHtml(item.address || item.neighborhood || '')}</p>
        <p class="popup-copy">${escapeHtml(toTitleCase(item.neighborhood || ''))}${item.commune ? ` · ${escapeHtml(item.commune)}` : ''}</p>
        ${site ? `<a class="popup-link" href="${escapeHtml(site)}" target="_blank" rel="noopener noreferrer">Abrir sitio web</a>` : ''}
      `);
      state.markersByKey.set(key, marker);
      markers.push(marker);
    });

    state.markerLayer.addLayers(markers);
    els.mapCount.textContent = formatNumber(markers.length);

    if (markers.length && markers.length < 2000) {
      try { state.map.fitBounds(state.markerLayer.getBounds(), { padding: [30, 30], maxZoom: 15 }); } catch (_) {}
    } else {
      state.map.setView([-34.6037, -58.3816], 12);
    }
  }

  function focusOnMap(key) {
    const marker = state.markersByKey.get(String(key));
    document.getElementById('mapa').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      state.map?.invalidateSize();
      if (!marker) return;
      state.markerLayer.zoomToShowLayer(marker, () => {
        state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 16));
        marker.openPopup();
      });
    }, 520);
  }

  function toTitleCase(value = '') {
    return String(value).toLocaleLowerCase('es-AR').replace(/(^|[\s/(-])([a-záéíóúüñ])/g, (_, p, c) => p + c.toLocaleUpperCase('es-AR'));
  }
})();
