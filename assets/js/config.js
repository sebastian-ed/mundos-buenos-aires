/*
  Configuración pública del frontend.
  Es seguro exponer la Publishable Key de Supabase cuando RLS está correctamente configurado.
  Nunca coloques aquí OPENAI_API_KEY, SUPABASE_SECRET_KEY ni service_role.
*/
window.APP_CONFIG = {
  SUPABASE_URL: 'https://ftpojkdldlikmemmsmck.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1kAAZ9Gj6JQ8LC8pHcL-BA_YksZS05m',
  CHAT_FUNCTION_NAME: 'cultural-assistant'
};
