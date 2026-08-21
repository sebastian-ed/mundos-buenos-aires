(() => {
  const { getSupabase, isSupabaseConfigured, normalizeText } = window.Trama;
  const drawer = document.getElementById('chatDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const messages = document.getElementById('chatMessages');
  const note = document.getElementById('chatNote');
  const history = [];
  const chatMode = String(window.Trama.cfg.CHAT_MODE || 'local').toLowerCase();
  let localCatalogCache = null;

  const STOPWORDS = new Set([
    'quiero','puedo','hacer','donde','para','como','esta','este','estos','estas','algo','algun','alguna','unos','unas','sobre','entre','desde','hasta',
    'ciudad','buenos','aires','espacio','espacios','cultural','culturales','buscar','recomendas','recomienda','recomendame','tengo','interesa','interesan',
    'visitar','conocer','ver','hay','por','que','una','uno','del','las','los','con','sin','mas','me','mi','en','el','la','y','o','de','un','a','qué','cómo','dónde'
  ].map(normalizeText));

  const CATEGORY_SYNONYMS = {
    'MUSEO': ['museo','museos'],
    'GALERIA DE ARTE': ['galeria','galerias','arte'],
    'SALA DE TEATRO': ['teatro','teatros','obra','obras'],
    'BIBLIOTECA': ['biblioteca','bibliotecas','lectura'],
    'LIBRERIA': ['libreria','librerias','libros'],
    'CENTRO CULTURAL': ['centro cultural','centros culturales'],
    'CLUB DE MUSICA EN VIVO': ['musica','recital','recitales','concierto','conciertos','musica en vivo'],
    'CLUB DE MUSICA EN VIVO - NUEVO': ['musica','recital','recitales','concierto','conciertos'],
    'SALA DE CINE': ['cine','cines','pelicula','peliculas'],
    'ANFITEATRO': ['anfiteatro','anfiteatros'],
    'MONUMENTOS Y LUGARES HISTORICOS': ['monumento','monumentos','historico','historia','patrimonio'],
    'ESPACIO DE FORMACION': ['taller','talleres','curso','cursos','formacion'],
    'ESPACIO FERIAL': ['feria','ferias'],
    'BAR': ['bar','bares'],
    'DISQUERIA': ['disqueria','disquerias','discos','vinilos'],
    'CALESITA': ['calesita','calesitas']
  };

  if (chatMode === 'local' && note) {
    note.textContent = 'Modo local: responde con el catálogo cargado y no consume una API de IA de pago.';
  }

  ['openChat', 'openChatTop', 'openChatCta'].forEach(id => document.getElementById(id)?.addEventListener('click', open));
  document.getElementById('closeChat')?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer?.classList.contains('open')) close(); });

  document.querySelectorAll('.chat-context [data-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt;
      input.focus();
    });
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const loading = addMessage('assistant loading', chatMode === 'local' ? 'Buscando en el catálogo…' : 'Consultando el catálogo…');
    setFormDisabled(true);

    try {
      let answer;
      if (chatMode === 'local') {
        answer = await answerLocally(text);
      } else {
        answer = await answerWithOpenAI(text);
      }
      loading.remove();
      addMessage('assistant', answer);
      history.push({ role: 'assistant', content: answer });
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (error) {
      console.error(error);
      loading.remove();
      addMessage('assistant', chatMode === 'local'
        ? 'No pude consultar el catálogo en este momento. Probá recargando la página.'
        : 'No pude consultar el asistente en este momento. El directorio y el mapa siguen disponibles; revisá el despliegue de la función y sus secretos si el problema persiste.');
    } finally {
      setFormDisabled(false);
      input.focus();
    }
  });

  async function answerWithOpenAI(text) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase no está configurado para el modo OpenAI.');
    }
    const client = getSupabase();
    const { data, error } = await client.functions.invoke(window.Trama.cfg.CHAT_FUNCTION_NAME || 'cultural-assistant', {
      body: { message: text, history: history.slice(-8) }
    });
    if (error) throw error;
    if (!data?.answer) throw new Error('La función no devolvió una respuesta válida.');
    return data.answer;
  }

  async function answerLocally(text) {
    const catalog = await getLocalCatalog();
    if (!catalog.length) return 'El catálogo todavía no está disponible.';

    const q = normalizeText(text);
    const neighborhoods = [...new Set(catalog.map(x => x.neighborhood).filter(n => n && n !== 'SIN BARRIO'))];
    const categories = [...new Set(catalog.map(x => x.category).filter(Boolean))];
    const matchedNeighborhoods = neighborhoods.filter(n => containsPhrase(q, normalizeText(n)));
    const matchedCategories = detectCategories(q, categories);

    if (asksTopNeighborhoods(q)) {
      const counts = new Map();
      catalog.forEach(item => counts.set(item.neighborhood, (counts.get(item.neighborhood) || 0) + 1));
      const top = [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8);
      return `Los barrios con más espacios en este catálogo son:\n${top.map(([name,count],i) => `${i + 1}. ${title(name)} — ${count} espacios`).join('\n')}\n\nPodés elegir uno en el índice de barrios para filtrar el mapa.`;
    }

    const keywords = extractKeywords(q, matchedNeighborhoods, matchedCategories);
    let candidates = catalog.filter(item => {
      if (matchedNeighborhoods.length && !matchedNeighborhoods.includes(item.neighborhood)) return false;
      if (matchedCategories.length && !matchedCategories.includes(item.category)) return false;
      return true;
    });

    if (!matchedNeighborhoods.length && !matchedCategories.length && keywords.length) {
      candidates = candidates
        .map(item => ({ item, score: scoreItem(item, keywords) }))
        .filter(x => x.score > 0)
        .sort((a,b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'es'))
        .map(x => x.item);
    }

    if (!matchedNeighborhoods.length && !matchedCategories.length && !keywords.length) {
      return 'Decime un barrio, una categoría o el tipo de plan que buscás. Por ejemplo: “museos en Palermo”, “teatros en Almagro” o “qué hay en San Telmo”.';
    }

    if (!candidates.length) {
      return 'No encontré espacios que coincidan con esa consulta dentro del catálogo actual. Probá con otro barrio, categoría o término.';
    }

    if (asksCount(q)) {
      const scope = [matchedCategories.map(title).join(' + '), matchedNeighborhoods.map(title).join(' + ')].filter(Boolean).join(' en ');
      const categoryBreakdown = summarizeBy(candidates, 'category', 6);
      return `Encontré ${candidates.length} ${candidates.length === 1 ? 'espacio' : 'espacios'}${scope ? ` para ${scope}` : ''}.\n${categoryBreakdown.length > 1 ? `\nDistribución principal: ${categoryBreakdown.map(([k,v]) => `${title(k)} (${v})`).join(', ')}.` : ''}`;
    }

    const selected = diversify(candidates, 7);
    const scopeParts = [];
    if (matchedCategories.length) scopeParts.push(matchedCategories.map(title).join(' y '));
    if (matchedNeighborhoods.length) scopeParts.push(`en ${matchedNeighborhoods.map(title).join(' y ')}`);

    const lines = selected.map((item, i) => {
      const meta = [title(item.category), title(item.neighborhood), item.address].filter(Boolean).join(' · ');
      return `${i + 1}. ${title(item.name)} — ${meta}`;
    });

    let intro = scopeParts.length
      ? `En el catálogo encontré ${candidates.length} opciones ${scopeParts.join(' ')}. Te dejo una selección:`
      : `Encontré ${candidates.length} coincidencias. Te dejo las más relevantes:`;

    if (asksRoute(q)) intro += ' El orden es una sugerencia editorial; este modo no calcula tiempos ni distancias reales.';
    if (asksUnavailableData(q)) intro += ' El dataset no trae horarios, precios ni agenda actualizada de forma confiable, así que no los invento.';

    return `${intro}\n\n${lines.join('\n')}\n\nPodés usar los filtros del mapa para verlas por ubicación.`;
  }

  async function getLocalCatalog() {
    const fromApp = window.TramaCatalog?.getAllSpaces?.();
    if (Array.isArray(fromApp) && fromApp.length) return fromApp;
    if (localCatalogCache) return localCatalogCache;
    const result = await window.TramaData.loadSpaces();
    localCatalogCache = (result.data || []).map(item => ({
      ...item,
      name: clean(item.name || item.establishment),
      category: clean(item.category || item.categories?.name || 'OTROS'),
      neighborhood: clean(item.neighborhood) || 'SIN BARRIO',
      address: clean(item.address),
      commune: clean(item.commune)
    })).filter(x => x.name);
    return localCatalogCache;
  }

  function detectCategories(q, availableCategories) {
    const matches = new Set();
    availableCategories.forEach(category => {
      if (containsPhrase(q, normalizeText(category))) matches.add(category);
    });
    for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
      if (!availableCategories.includes(category)) continue;
      if (synonyms.some(s => containsPhrase(q, normalizeText(s)))) matches.add(category);
    }
    return [...matches];
  }

  function extractKeywords(q, neighborhoods, categories) {
    let cleaned = ` ${q} `;
    [...neighborhoods, ...categories].forEach(value => {
      const token = normalizeText(value);
      cleaned = cleaned.replaceAll(` ${token} `, ' ');
    });
    return [...new Set(cleaned.trim().split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w)))].slice(0, 6);
  }

  function scoreItem(item, keywords) {
    const haystack = normalizeText([
      item.name, item.category, item.subcategory, item.secondary_function, item.programming,
      item.neighborhood, item.commune, item.address, item.street, item.tag, item.description
    ].filter(Boolean).join(' '));
    let score = 0;
    keywords.forEach(k => {
      if (normalizeText(item.name).includes(k)) score += 8;
      else if (normalizeText(item.category).includes(k)) score += 6;
      else if (normalizeText(item.neighborhood).includes(k)) score += 5;
      else if (haystack.includes(k)) score += 2;
    });
    return score;
  }

  function diversify(items, limit) {
    const ordered = [...items].sort((a,b) => a.name.localeCompare(b.name, 'es'));
    const chosen = [];
    const usedCategories = new Set();
    for (const item of ordered) {
      if (!usedCategories.has(item.category)) {
        chosen.push(item);
        usedCategories.add(item.category);
        if (chosen.length >= limit) return chosen;
      }
    }
    for (const item of ordered) {
      if (!chosen.includes(item)) chosen.push(item);
      if (chosen.length >= limit) break;
    }
    return chosen;
  }

  function summarizeBy(items, key, limit) {
    const counts = new Map();
    items.forEach(item => counts.set(item[key] || 'Sin dato', (counts.get(item[key] || 'Sin dato') || 0) + 1));
    return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
  }

  function containsPhrase(text, phrase) {
    if (!phrase) return false;
    return text === phrase || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`) || text.includes(` ${phrase} `);
  }

  function asksCount(q) {
    return /\b(cuantos|cuantas|cantidad|total)\b/.test(q);
  }

  function asksTopNeighborhoods(q) {
    return q.includes('barrios') && /\b(mas|mayor|mayores|cantidad)\b/.test(q);
  }

  function asksRoute(q) {
    return /\b(recorrido|ruta|itinerario|recorrer)\b/.test(q);
  }

  function asksUnavailableData(q) {
    return /\b(horario|horarios|precio|precios|entrada|entradas|agenda|abierto|abierta|abre|cierra)\b/.test(q);
  }

  function clean(value) {
    if (value == null) return '';
    const text = String(value).trim();
    return /^(na|n\/a|null|undefined)$/i.test(text) ? '' : text;
  }

  function title(value = '') {
    return String(value).toLocaleLowerCase('es-AR').replace(/(^|[\s/(-])([a-záéíóúüñ])/g, (_, p, c) => p + c.toLocaleUpperCase('es-AR'));
  }

  function open() {
    drawer?.classList.add('open');
    drawer?.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => input?.focus(), 180);
  }

  function close() {
    drawer?.classList.remove('open');
    drawer?.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function addMessage(classes, text) {
    const el = document.createElement('div');
    el.className = `message ${classes}`;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function setFormDisabled(disabled) {
    input.disabled = disabled;
    form.querySelector('button').disabled = disabled;
  }
})();
