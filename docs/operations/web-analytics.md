# Vercel Web Analytics

El layout raíz (`app/layout.tsx`) monta una sola instancia de `Analytics`, importada de
`@vercel/analytics/next`. El SDK registra visitas y cambios de ruta del App Router.
No requiere claves ni variables de entorno adicionales.

Esta integración complementa los eventos propios de Laria en Supabase. Las vistas de publicaciones,
favoritos, contactos de WhatsApp y estadísticas de vendedores siguen usando sus flujos existentes.
Este PR no añade eventos personalizados de Vercel ni envía perfiles o mensajes de WhatsApp al SDK.

## Activación

1. Abre [Web Analytics de mkt-instrumentos](https://vercel.com/henri-camayos-projects/mkt-instrumentos/analytics)
   y pulsa **Enable** si todavía está deshabilitado.
2. Despliega la rama con la integración **después** de habilitar Analytics. Vercel incorpora sus rutas de
   captura al siguiente despliegue; habilitarlo no modifica un despliegue anterior.
3. Para producción, integra el PR y comprueba el despliegue de `main` en `laria.audio`.
   Un preview correcto no demuestra que producción ya tenga el cambio.

## Comprobación

1. En el despliegue de Vercel, abre una página y las herramientas de desarrollo del navegador.
2. En **Network**, comprueba que carga el script de Analytics desde el mismo origen y que se envía
   una petición de visita a `/<unique-path>/view` (la ruta la asigna Vercel; no se debe hardcodear).
   La plataforma también utiliza rutas bajo `/_vercel/insights/*`.
3. Navega mediante un enlace interno y comprueba una nueva petición de visita.
4. Abre el panel de Analytics y selecciona el entorno y periodo correspondientes para comprobar los datos.

Si el script responde 404, revisa la activación y crea un nuevo despliegue. Si el navegador bloquea
la petición, prueba sin bloqueadores de contenido y revisa el error de red/CSP. Las rutas de captura
alojadas por Vercel en el mismo origen están permitidas por la CSP existente (`'self'`).
`pnpm dev` usa el modo de depuración del SDK, no acredita recepción de datos en Vercel; su script externo
de depuración está bloqueado por la CSP local actual. No hace falta cambiar la CSP para capturar visitas
reales en Vercel.

## Verificación del código

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Estos controles no acreditan la activación del servicio ni la recepción de visitas en el panel.

Referencias: [inicio rápido](https://vercel.com/docs/analytics/quickstart),
[SDK](https://vercel.com/docs/analytics/package) y
[diagnóstico](https://vercel.com/docs/analytics/troubleshooting).
