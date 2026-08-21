(() => {
  const { getSupabase, isSupabaseConfigured, escapeHtml } = window.Trama;
  const drawer = document.getElementById('chatDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const messages = document.getElementById('chatMessages');
  const note = document.getElementById('chatNote');
  const history = [];

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

    if (!isSupabaseConfigured()) {
      addMessage('assistant', 'El catálogo público ya funciona con el archivo local. Para activar el asistente con IA, primero configurá Supabase y desplegá la función cultural-assistant siguiendo el README.');
      note.textContent = 'Asistente pendiente de configuración de Supabase.';
      return;
    }

    const loading = addMessage('assistant loading', 'Consultando el catálogo…');
    setFormDisabled(true);

    try {
      const client = getSupabase();
      const { data, error } = await client.functions.invoke(window.Trama.cfg.CHAT_FUNCTION_NAME || 'cultural-assistant', {
        body: { message: text, history: history.slice(-8) }
      });
      if (error) throw error;
      if (!data?.answer) throw new Error('La función no devolvió una respuesta válida.');
      loading.remove();
      addMessage('assistant', data.answer);
      history.push({ role: 'assistant', content: data.answer });
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (error) {
      console.error(error);
      loading.remove();
      addMessage('assistant', 'No pude consultar el asistente en este momento. El directorio y el mapa siguen disponibles; revisá el despliegue de la función y sus secretos si el problema persiste.');
    } finally {
      setFormDisabled(false);
      input.focus();
    }
  });

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
