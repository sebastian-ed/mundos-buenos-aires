(() => {
  const cfg = window.APP_CONFIG || {};

  function isSupabaseConfigured() {
    return Boolean(
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_PUBLISHABLE_KEY &&
      !cfg.SUPABASE_URL.includes('TU-PROYECTO') &&
      !cfg.SUPABASE_PUBLISHABLE_KEY.includes('TU_PUBLISHABLE_KEY')
    );
  }

  function getSupabase() {
    if (!isSupabaseConfigured() || !window.supabase) return null;
    if (!window.__TRAMA_SUPABASE__) {
      window.__TRAMA_SUPABASE__ = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }
    return window.__TRAMA_SUPABASE__;
  }

  function normalizeText(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9ñü\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeUrl(value) {
    if (!value) return null;
    let candidate = String(value).trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const url = new URL(candidate);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function slugify(value = '') {
    return normalizeText(value).replace(/\s+/g, '-').replace(/^-|-$/g, '');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('es-AR').format(Number(value || 0));
  }

  function debounce(fn, wait = 220) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function toNullableNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function communeSort(a, b) {
    const na = Number(String(a || '').match(/\d+/)?.[0] || 999);
    const nb = Number(String(b || '').match(/\d+/)?.[0] || 999);
    return na - nb || String(a).localeCompare(String(b), 'es');
  }

  window.Trama = {
    cfg,
    isSupabaseConfigured,
    getSupabase,
    normalizeText,
    escapeHtml,
    safeUrl,
    slugify,
    formatNumber,
    debounce,
    toNullableNumber,
    communeSort
  };
})();
