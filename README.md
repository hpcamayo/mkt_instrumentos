# Laria

Marketplace de instrumentos musicales y equipo de audio en Perú: [laria.audio](https://laria.audio). Los compradores descubren productos de particulares y tiendas y coordinan directamente por WhatsApp. La interfaz está en español y se diseña primero para teléfonos.

Laria usa **Next.js, React, TypeScript, Tailwind CSS y Supabase** (Auth, Postgres y Storage), con despliegues de aplicación en Vercel. El producto incluye cuentas, herramientas de venta, inventario para tiendas, retención de compradores, reputación y operación administrativa; ya superó el alcance del MVP inicial.

## Alcance y estado de V1

V1 comprende la base del marketplace y las ampliaciones aprobadas por el propietario. Esta documentación incorpora **[PR #54: Feature ideas: the approved ideas, built for review](https://github.com/hpcamayo/mkt_instrumentos/pull/54)** al contrato de producto, distinguiendo su implementación de su liberación.

| Área | Alcance |
| --- | --- |
| Descubrimiento | Búsqueda por texto y filtros, categorías, tiendas, comparación, favoritos, alertas, recomendaciones en el dispositivo y Descubrir. |
| Publicación | Cuentas Particular y Tienda, fotos, borradores, edición con revisión, disponibilidad, reservas, historial y republicación. |
| Tiendas | Perfil público y verificación, cupo de publicaciones, inventario por SKU, Mostrador, importación de Excel/CSV y piloto de compra asistida con activación controlada. |
| Confianza y operación | Confirmación mutua de compras, reseñas, preguntas públicas, reportes, moderación, analítica, correos y avisos. |
| Ampliación de PR #54 | Mi equipo, ofertas y consignación, mapa, condiciones de venta, servicios separados, guías y colecciones, fabricantes/artistas, herramientas comerciales y de tienda, seguridad y control de datos. |

**Estado al 28 de octubre de 2026:** PR #54 sigue abierto y en borrador. Sus 44 ideas construidas de las 60 aprobadas forman parte del alcance ampliado, pero sus 61 migraciones adicionales aún no se han aplicado a producción. La revisión legal y las verificaciones de liberación siguen pendientes. La configuración de un proveedor o un preview compilado no demuestra que una función esté operativa. El detalle y las fuentes están en [Estado de la documentación](docs/documentation-status.md).

Laria no procesa ni custodia pagos, no ofrece escrow ni checkout propio, no gestiona envíos, no garantiza instrumentos o transacciones y no cobra comisiones ni suscripciones en este piloto. Mostrar los métodos de pago de una tienda, registrar sus ventas de mostrador o preparar un mensaje de compra no cambia esos límites. El chat privado sigue en WhatsApp.

## Documentación

- [Especificación funcional](docs/functional-spec.md): contrato canónico de V1, incluidas las ampliaciones aprobadas y sus condiciones de activación.
- [Funciones y estado](docs/features.md): qué hace cada área y dónde está implementada.
- [Estado, fuentes y liberación](docs/documentation-status.md): referencias verificadas de main y PR #54, dependencias y límites de esta actualización.
- [Roadmap](docs/roadmap.md): liberación del alcance aprobado y trabajo diferido.
- [Sistema de diseño](docs/design-system.md): referencia visual canónica; [rediseño UX](docs/ux-redesign/README.md) conserva decisiones y evidencia histórica.
- [Base de datos](docs/database.md), [arquitectura](docs/architecture.md) y [rendimiento](docs/performance.md): referencias técnicas; consultar también las fuentes actuales enlazadas en el estado de documentación.
- [Vercel Web Analytics](docs/operations/web-analytics.md): integración, activación y comprobación de visitas.
- [Registro de aceptación](acceptance/README.md): `acceptance/cases.tsv` es la fuente canónica; las propuestas de nuevas pruebas no son resultados de aceptación.

## Desarrollo local

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Completa las variables de Supabase que declara `.env.example` y abre [localhost:3000](http://localhost:3000). Las credenciales de servicio y de proveedores son exclusivamente de servidor. No copies configuración de producción a pruebas locales.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
python3 -B acceptance/validate.py
```

Estos comandos comprueban el checkout actual. Para revisar las funciones nuevas se necesita la rama y la base de datos correspondientes: una aplicación anterior con las migraciones de PR #54 no es una combinación compatible. Las suites SQL y de integración requieren un Supabase local preparado; las instrucciones actuales están enlazadas en [verificación](docs/documentation-status.md#verification).

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `app/` | Rutas públicas, cuenta, Admin y API de Next.js. |
| `components/` | Flujos de producto y componentes compartidos; `components/ui/` contiene las primitivas visuales. |
| `lib/` | Consultas, validación, autenticación, reglas compartidas e integraciones de servidor. |
| `supabase/migrations/` | Evolución de esquema, funciones, permisos, RLS y trabajos de base de datos. |
| `tests/` | Regresiones de aplicación, SQL e integración. |
| `acceptance/` | Casos canónicos y validación TSV. |
| `docs/` | Contrato, decisiones, guías de operación y evidencia de liberación. |

## Base de datos y datos de prueba

El esquema ya incluye perfiles, propiedad de publicaciones y tiendas, revisiones, favoritos, alertas, notificaciones, eventos, transacciones verificadas y reseñas. Las ampliaciones de inventario, importación y las nuevas funciones tienen sus propias migraciones; no basta con ejecutar el esquema inicial.

**Solo en un proyecto local desechable**, `supabase db reset` recrea la base con las migraciones y `supabase/seed.sql` del checkout. El seed es una muestra de desarrollo, no una copia ni un recuento del catálogo de producción. Nunca uses ese comando contra producción.

Vercel despliega la aplicación; no aplica automáticamente las migraciones de Supabase. La liberación de PR #54 exige coordinar aplicación y esquema según su plan de salida. Esta actualización documental no ejecuta migraciones, activa pilotos ni despliega código.
