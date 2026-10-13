# Estudio Luma — peluquería y reservas

Página responsive con galería filtrable, formulario de citas y una agenda de equipo protegida por contraseña. Las citas se guardan en PostgreSQL cuando se publica en Render; para una vista previa local, el servidor puede usar `data/appointments.json`.

## Publicar en Render sin instalar Node.js

Sigue el manual de [MANUAL_RENDER.md](MANUAL_RENDER.md). Sube los archivos del proyecto a un repositorio privado de GitHub y crea un Blueprint en Render usando `render.yaml`. Render instala Node.js y ejecuta la web por ti. Al crear el Blueprint tendrás que definir la contraseña secreta `ADMIN_PASSWORD`.

## Ejecutar localmente (opcional)

Requiere Node.js 20 o posterior: `npm install` y luego `npm start`. Abre `http://localhost:3000`. Si no defines `DATABASE_URL`, las reservas locales se guardan en un JSON.

## Antes de usar con clientes

Personaliza la marca, los textos, la zona horaria y el horario provisional en `index.html`, `app.js`, `server.js` y `render.yaml`. Revisa el plan de la base PostgreSQL: el gratuito caduca al cabo de 30 días. Cambia a un plan con persistencia antes de depender de la web para citas reales. Revisa también que los precios y la moneda coincidan con los actuales del peluquero.
