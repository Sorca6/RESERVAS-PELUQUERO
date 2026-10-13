# Manual: publicar la web en Render sin instalar Node.js

La página ya incluye un servidor Node.js. **No necesitas instalar Node.js ni ejecutar comandos en tu ordenador**: GitHub guarda los archivos y Render instala Node.js, ejecuta el servidor y publica la web.

## Antes de empezar

Necesitas una cuenta de GitHub y una de Render. El proyecto está en la carpeta `H:\JEYBI`. Incluye las fotos, el código, `package.json` y `render.yaml`.

## 1. Sube la carpeta a GitHub

1. Entra en [github.com](https://github.com) e inicia sesión o crea una cuenta.
2. Pulsa **New repository**. Ponle un nombre, por ejemplo `peluqueria-reservas`, déjalo **Private** y pulsa **Create repository**. No marques la opción para crear un README: ya hay uno en la carpeta.
3. En el repositorio nuevo, pulsa **Add file → Upload files**.
4. Abre `H:\JEYBI` en el Explorador de Windows. Selecciona los archivos de la web y arrástralos al área de GitHub. Asegúrate de incluir también `render.yaml`, `package.json`, `server.js`, `app.js`, `index.html`, `styles.css`, los JPEG y `README.md`. Puedes excluir `precios.jpeg` si no quieres publicar la captura de referencia.
5. Espera a que termine la carga y pulsa **Commit changes**.

No subas claves privadas, contraseñas ni archivos `.env`.

## 2. Despliega desde Blueprint en Render

1. Abre [dashboard.render.com](https://dashboard.render.com) y crea una cuenta o inicia sesión.
2. Pulsa **New + → Blueprint**.
3. Conecta GitHub si Render lo pide y autoriza el acceso al repositorio privado que acabas de crear.
4. Selecciona `peluqueria-reservas` y pulsa **Connect**.
5. Render leerá `render.yaml`. Antes de aplicar, define el valor de `ADMIN_PASSWORD` cuando lo solicite. Usa una contraseña larga y única, de al menos 16 caracteres; no la pongas en `index.html`, `app.js` ni en GitHub.
6. Pulsa **Apply**. Render crea el servicio web y la base de datos. La primera compilación puede tardar unos minutos.
7. En Render abre el servicio `estudio-luma`. Cuando el despliegue termine como **Live**, pulsa la URL `https://...onrender.com` para abrir la web.

El `render.yaml` configura el comando de compilación `npm install`, el arranque `npm start`, el puerto de Render, el chequeo `/health`, PostgreSQL y el secreto para el acceso a la agenda. Render instala y ejecuta el servidor en la nube; tu PC puede estar apagado.

## 3. Comprueba las reservas y la agenda

1. En la web publicada, elige un servicio, fecha y hora y envía una cita de prueba.
2. Abre **Agenda del estudio**, escribe la contraseña que configuraste en Render y pulsa **Entrar**. La cita debe aparecer en la lista.
3. Comprueba que el horario reservado ya no se ofrece para otra cita que se solape. Si usaste una reserva de prueba, cancélala desde la agenda.

Las reservas quedan en PostgreSQL, no en un archivo temporal del servidor. La lista de citas y la cancelación solo funcionan después de iniciar sesión. La solicitud de cita es pública.

## Importante sobre el plan gratuito

El archivo está preparado para crear el servicio y PostgreSQL en plan gratuito para que puedas hacer una primera prueba. En Render, el servidor gratuito se duerme tras 15 minutos sin visitas y puede tardar cerca de un minuto en volver a arrancar. **La base PostgreSQL gratuita caduca a los 30 días**; tras otros 14 días Render puede eliminarla junto con las citas. No la uses para gestionar clientes a largo plazo. Antes de recibir reservas reales, cambia la base de datos a un plan de pago desde su página **Settings / Compute** en Render y revisa el precio actual. Conserva una copia de las citas importantes.

## Cambios posteriores

Para corregir texto o fotos: modifica los archivos en el equipo, vuelve a GitHub y sube los archivos editados mediante **Add file → Upload files**, confirmando el cambio. Render desplegará automáticamente cada nuevo commit.

Antes de publicar, cambia el nombre provisional **Estudio Luma**, el texto, los horarios y la zona horaria por los reales. Los horarios actuales son de ejemplo: martes a viernes de 10:00 a 14:00 y 16:00 a 19:00; sábados de 10:00 a 15:00; domingos y lunes cerrado. Ajusta tanto `app.js` como `server.js` para que el formulario y el servidor coincidan. El catálogo y los importes reflejan la captura `precios.jpeg`; confirma con el peluquero la moneda y cualquier precio actualizado.

Si un despliegue falla: en Render abre el servicio → **Events** o **Logs**, mira el primer error de compilación o arranque y corrige el archivo indicado. Comprueba también que `ADMIN_PASSWORD` se haya definido y que `DATABASE_URL` figure como variable conectada a `estudio-luma-db`.
