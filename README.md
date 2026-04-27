# Instrumentos Perú MVP

Base inicial para un marketplace MVP de instrumentos musicales en Perú.

El proyecto usa Next.js, TypeScript, Tailwind CSS y Supabase para listados, tiendas, formularios públicos, almacenamiento de imágenes y moderación básica.

## Alcance MVP

- Vendedores individuales publican instrumentos usados.
- Tiendas pequeñas tienen páginas públicas.
- Los productos de tiendas aparecen en la búsqueda general.
- Compradores contactan vendedores por WhatsApp.
- Toda la UI debe estar en español.
- Diseño mobile-first.

Fuera del MVP inicial:

- Pagos
- Checkout
- Envíos
- Escrow
- Reseñas
- Comisiones
- Suscripciones
- Chat interno

## Estructura

```txt
app/
  admin/
  instrumentos/[slug]/
  listados/
  publicar/
  registrar-tienda/
  tiendas/[slug]/
  vender/
components/
  admin-panel.tsx
  listing-card.tsx
  listing-filters.tsx
  placeholder-page.tsx
  sell-listing-form.tsx
  site-footer.tsx
  site-header.tsx
  store-registration-form.tsx
```

## Primeros pasos

Instala dependencias:

```bash
npm install
```

Levanta el servidor local:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Variables de entorno

Copia `.env.example` a `.env.local` y agrega las credenciales públicas de Supabase:

```bash
cp .env.example .env.local
```

Para usar `/admin`, el usuario autenticado debe tener `app_metadata.role = "admin"` en Supabase Auth.

## Base de datos

Las migraciones viven en `supabase/migrations`.

La migración inicial crea:

- `stores`
- `listings`
- `listing_photos`
- Enums de tipo de vendedor, estado de publicación, estado de tienda y plan de tienda.
- Políticas RLS para lectura pública de contenido aprobado o activo, inserción pública como pendiente y actualización administrativa.

No incluye pagos, checkout, envíos, reseñas, suscripciones, comisiones ni chat.

## Datos de prueba

El archivo `supabase/seed.sql` incluye datos locales para desarrollo:

- 8 listados usados de vendedores individuales.
- 3 tiendas.
- 12 listados de tiendas.
- Ciudades de Peru: Lima, Ayacucho, Huancayo y Arequipa.
- Categorias: `guitars`, `basses`, `drums`, `cymbals`, `microphones`, `pedals`, `amplifiers` y `audio interfaces`.
- Mezcla de registros `approved` y `pending`.

Para recrear la base local con migraciones y seed:

```bash
supabase db reset
```

Para aplicar solo el seed sobre una base local ya creada:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```
