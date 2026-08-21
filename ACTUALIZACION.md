# Actualización — Trama Buenos Aires

## Después de subir esta versión a GitHub Pages

1. Reemplazá los archivos del repositorio por el contenido de este ZIP.
2. Esperá a que GitHub Pages termine el deploy y hacé una recarga forzada del navegador (`Ctrl + F5`).
3. Entrá a `admin.html` con el mismo usuario administrador.
4. Si el panel muestra menos de **3.053 espacios**, pulsá **Importar base inicial** una vez.
   - La versión anterior se detenía cuando encontraba coordenadas con el texto `NA`.
   - Esta versión convierte esos valores en `null` y continúa con todos los lotes.
   - La importación usa `source_fid`, por lo que actualiza los 1.800 ya cargados y agrega los faltantes sin duplicarlos.
5. Al terminar, el panel debe mostrar **3.053 espacios**, **16 categorías** y **48 barrios reales** (los registros sin barrio ya no cuentan como un barrio `NA`).

## Chat sin costo de API

`assets/js/config.js` queda configurado con:

```js
CHAT_MODE: 'local'
```

En ese modo, el chat responde consultando el catálogo y no llama a OpenAI ni a otra API de IA paga.

Si más adelante querés volver a la respuesta generativa de OpenAI, cambiá el valor a:

```js
CHAT_MODE: 'openai'
```

La Edge Function existente queda incluida y no se eliminaron las credenciales públicas de Supabase que ya tenía el proyecto.
