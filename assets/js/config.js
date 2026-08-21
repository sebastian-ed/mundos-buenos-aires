/*
  Configuración pública del frontend.
  Es seguro exponer la Publishable Key de Supabase cuando RLS está correctamente configurado.
  Nunca coloques aquí OPENAI_API_KEY, SUPABASE_SECRET_KEY ni service_role.

  CHAT_MODE:
  - 'local': asistente basado en el catálogo, sin consumo de una API de IA de pago.
  - 'openai': usa la Edge Function cultural-assistant y consume la API de OpenAI.
*/
window.APP_CONFIG = {
  SUPABASE_URL: 'https://ftpojkdldlikmemmsmck.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1kAAZ9Gj6JQ8LC8pHcL-BA_YksZS05m',
  CHAT_FUNCTION_NAME: 'cultural-assistant',
  CHAT_MODE: 'local'
};
