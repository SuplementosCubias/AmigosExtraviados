# Perritos Perdidos SV: guía para publicarla

Esta carpeta es una página estática (HTML, CSS y JavaScript) que guarda los reportes en **Supabase** y se publica gratis en **Cloudflare Pages**. Quien reporta no necesita cuenta.

Archivos:

| Archivo | Para qué sirve |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | La página pública |
| `admin.html` | Panel privado para ocultar o borrar reportes |
| `config.js` | Aquí pegas los datos de tu proyecto de Supabase |
| `schema.sql` | Crea las tablas, los permisos y la carpeta de fotos |

## Paso 1. Crear el proyecto en Supabase

1. Entra a supabase.com y crea una cuenta.
2. Crea un proyecto nuevo (New project). Elige una región cercana, por ejemplo la de EE. UU. este. Guarda la contraseña de la base de datos.
3. Espera a que termine de crearse.

## Paso 2. Crear las tablas

1. Abre `schema.sql` y cambia `CAMBIA_ESTE_CORREO@ejemplo.com` por **tu correo de administrador**.
2. En Supabase entra a **SQL Editor**, pega todo el contenido del archivo y presiona **Run**.
3. Debe decir que se ejecutó sin errores.

## Paso 3. Crear tu usuario administrador

1. Ve a **Authentication > Users > Add user** y crea un usuario con ese mismo correo y una contraseña segura. Marca la opción de confirmar el correo automáticamente.
2. En los ajustes de Authentication busca la opción que permite que **cualquier persona se registre** (Allow new users to sign up) y **desactívala**. Así nadie más puede crear cuentas.

## Paso 4. Conectar la página

1. En Supabase abre **Project Settings > API** y copia el **Project URL** y la clave **anon public**.
2. Pégalos en `config.js`.
3. La clave anon es pública por diseño. Nunca pongas la clave `service_role` en estos archivos.

## Paso 5. Publicar en Cloudflare Pages

1. Crea una cuenta en cloudflare.com.
2. Entra a **Workers & Pages > Create > Pages** y elige subir archivos directamente (Direct Upload).
3. Arrastra **la carpeta completa** y publica. Te da una dirección tipo `tu-proyecto.pages.dev`.
4. Prueba: publica un reporte con foto, ábrelo desde otro celular y entra a `/admin.html` con tu cuenta.

Para un dominio propio, cómpralo donde quieras y agrégalo en Pages en **Custom domains**.

## Cómo funciona sin cuentas

- Cada reporte se publica al instante.
- Al publicar, el navegador guarda un código secreto. Con él, esa persona puede marcar "Ya apareció" o eliminar su reporte, pero **solo desde el mismo dispositivo y navegador**. Si borra los datos del navegador, pierde ese permiso y tendrá que escribirte para que lo cierres desde el panel.
- Los demás ven un botón "Reportar" que cuenta como denuncia.
- Los reportes de más de 90 días dejan de mostrarse solos.

## Contra el spam

Ya incluye: máximo 5 reportes por teléfono al día, un límite general por minuto, un campo trampa para bots, fotos solo JPG de hasta 600 KB y validación de todos los campos en la base de datos.

Si empiezas a recibir spam, el siguiente paso es agregar Cloudflare Turnstile (captcha gratis). Se puede sumar después.

## Cosas a vigilar

- Los números de teléfono son públicos. Está avisado al pie de la página.
- Los planes gratis tienen límites que cambian con el tiempo. Revisa supabase.com/pricing y la sección de límites de Cloudflare Pages. Un proyecto gratis de Supabase puede pausarse si pasa varios días sin actividad.
- Haz una copia de seguridad de tus datos de vez en cuando desde **Table Editor > Export**.
