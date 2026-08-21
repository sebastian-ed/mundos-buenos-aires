# Trama Buenos Aires

Web app estática + Supabase para explorar y administrar espacios culturales de la Ciudad de Buenos Aires.

## Qué incluye

- Directorio público con búsqueda textual.
- Filtros por categoría, barrio y comuna.
- Espacios agrupados por barrio.
- Mapa Leaflet + OpenStreetMap con clustering de marcadores.
- Panel `admin.html` con autenticación, alta, edición y eliminación de espacios.
- Gestión de categorías.
- Importación inicial del dataset desde el propio panel admin.
- Exportación JSON para backup.
- Asistente cultural con dos modos: **local sin costo de API** o **OpenAI** mediante una Supabase Edge Function.
- En modo OpenAI, la clave nunca se expone en el navegador y existe un límite diario básico por hash de IP.
- Fallback local: `index.html` funciona con `data/espacios-culturales.json` aunque Supabase todavía no esté configurado.

El archivo base incluido contiene **3.053 espacios**, **16 categorías**, **49 barrios** y **3.031 registros con coordenadas**.

## Estructura

```text
/
├─ index.html
├─ admin.html
├─ assets/
│  ├─ css/styles.css
│  ├─ img/ba-cultura-hero.jpg
│  └─ js/
│     ├─ config.js
│     ├─ core.js
│     ├─ data-service.js
│     ├─ app.js
│     ├─ chat.js
│     └─ admin.js
├─ data/
│  ├─ espacios-culturales.json
│  ├─ meta.json
│  └─ source/espacios-culturales.xlsx
└─ supabase/
   ├─ config.toml
   ├─ schema.sql
   └─ functions/cultural-assistant/index.ts
```

## 1. Crear el proyecto en Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ir a **SQL Editor**.
3. Copiar y ejecutar completo `supabase/schema.sql`.

El esquema crea tablas, índices, RLS, roles, políticas de administración, funciones auxiliares y el control de cuota del chat.

## 2. Crear el primer administrador

1. En Supabase ir a **Authentication > Users**.
2. Crear un usuario con email y contraseña.
3. En SQL Editor ejecutar:

```sql
select id, email from auth.users order by created_at desc;
```

Copiar el UUID del usuario y promoverlo:

```sql
update public.profiles
set role = 'admin'
where id = 'PEGAR_UUID_AQUI';
```

No hay registro público de administradores desde la web.

## 3. Conectar el frontend a Supabase

Editar `assets/js/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...',
  CHAT_FUNCTION_NAME: 'cultural-assistant',
  CHAT_MODE: 'local' // 'local' = sin API paga; 'openai' = Edge Function + OpenAI
};
```

La **Publishable Key** puede estar en el frontend porque las operaciones están protegidas con Row Level Security. No usar una Secret Key ni `service_role` en archivos públicos.

Referencia: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

## 4. Importar los 3.053 espacios

1. Publicar o servir el proyecto por HTTP.
2. Abrir `admin.html`.
3. Iniciar sesión con el usuario admin.
4. Hacer clic en **Importar base inicial**.

La importación:

- crea/actualiza las categorías del Excel;
- carga los espacios en lotes;
- usa `source_fid` para evitar duplicados si se ejecuta nuevamente;
- conserva los campos disponibles del archivo original;
- convierte coordenadas no numéricas como `NA` en `null`, evitando que un lote completo falle;
- puede ejecutarse nuevamente sobre una base parcial: actualiza por `source_fid` y completa los faltantes sin duplicarlos.

El catálogo público seguirá mostrando el JSON local si Supabase está vacío o temporalmente no responde.

## 5. Asistente cultural: modo local o OpenAI

Por defecto `assets/js/config.js` viene con `CHAT_MODE: 'local'`. En ese modo el chat consulta el catálogo ya cargado, detecta barrios/categorías y arma respuestas sin llamar a un modelo externo. **No genera consumo de OpenAI.**

Si querés respuestas generativas más flexibles, cambiá a `CHAT_MODE: 'openai'`. La integración paga está en `supabase/functions/cultural-assistant/index.ts`.

### Con Supabase CLI

Instalar y vincular el CLI de Supabase, luego desde la raíz del proyecto:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy cultural-assistant
```

Configurar secretos:

```bash
supabase secrets set OPENAI_API_KEY=TU_OPENAI_API_KEY
supabase secrets set OPENAI_MODEL=gpt-5.6-luna
supabase secrets set RATE_LIMIT_SALT=UNA_CADENA_ALEATORIA_LARGA
supabase secrets set CHAT_DAILY_LIMIT=30
```

`OPENAI_MODEL` es configurable; cambiarlo permite actualizar el modelo sin tocar el frontend.

La función usa la Responses API de OpenAI desde el backend. La API key queda en secretos de Supabase, no en GitHub ni en el navegador.

Referencias:

- https://platform.openai.com/docs
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/cors

### Comportamiento del asistente

- Detecta barrios y categorías presentes en la base.
- Recupera candidatos desde Supabase.
- Solo usa esos registros como fuente factual de lugares.
- No debe inventar horarios, precios, agenda o disponibilidad si el dataset no los contiene.
- Limita consultas por día mediante un hash de IP guardado en `ai_usage`.

Para un despliegue de gran tráfico conviene reemplazar este control simple por rate limiting de infraestructura/CDN.

## 6. Publicar en GitHub Pages

1. Crear un repositorio.
2. Subir el contenido de esta carpeta a la raíz.
3. En GitHub: **Settings > Pages**.
4. Seleccionar **Deploy from a branch**.
5. Elegir `main` y `/ (root)`.

No requiere build: HTML, CSS y JavaScript funcionan directamente.

## Desarrollo local

No abrir `index.html` con `file://`, porque el navegador puede bloquear `fetch()` del JSON local. Servir la carpeta:

```bash
python -m http.server 8080
```

Luego abrir:

```text
http://localhost:8080
```

## Criterios de diseño

- Tipografía sans de sistema (`Helvetica Neue`, Helvetica, Arial).
- Sin dependencia de Google Fonts.
- Geometría recta, bordes sobrios y jerarquía editorial.
- Paleta cálida y urbana, sin colores neón.
- Layout responsivo para celular, tablet y escritorio.
- Navegación y catálogo utilizables aunque la capa de IA no esté activa.

## Datos y atribuciones

- Dataset base: `data/source/espacios-culturales.xlsx`, provisto para este proyecto.
- Mapa: OpenStreetMap contributors.
- Foto principal: “Obelisco y Teatro Colón”, Omegadeepside, Wikimedia Commons, licencia CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Obelisco_y_Teatro_Col%C3%B3n.jpg

## Recomendación para producción

El proyecto ya es funcional, pero antes de una campaña pública de alto tráfico conviene sumar tres capas: dominio propio, monitoreo de errores y un proxy/CDN con rate limiting para el endpoint de IA. También conviene cargar imágenes editoriales propias por espacio en `image_url`, porque el Excel original no aporta fotografías.
