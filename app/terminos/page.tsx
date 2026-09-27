import Link from "next/link";
import type { Metadata } from "next";
import { LegalContact, LegalPage, LegalSection, MarketplaceLimitations } from "@/components/legal-page";
import { OPEN_GRAPH_BASE } from "@/lib/site";

const description = "Términos de uso y reglas del marketplace Laria: cuentas, publicaciones, moderación, reseñas y lo que Laria no hace (pagos, escrow, envíos ni garantías).";

export const metadata: Metadata = {
  title: "Términos y reglas del marketplace",
  description,
  alternates: { canonical: "/terminos" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Términos y reglas del marketplace | Laria", description, url: "/terminos" },
};

export default function TermsPage() {
  return (
    <LegalPage
      path="/terminos"
      eyebrow="Términos"
      title="Términos y reglas del marketplace"
      intro={<p>Al usar Laria, crear una cuenta o publicar un artículo aceptas estas reglas. Están escritas para ser claras: describen cómo funciona Laria hoy y qué esperamos de quienes compran y venden.</p>}
    >
      <LegalSection title="1. Qué es Laria">
        <p>Laria es un marketplace para descubrir instrumentos musicales y equipo de audio en Perú. Particulares y tiendas publican artículos, y los compradores contactan directamente a cada vendedor, principalmente por WhatsApp. El precio, el pago, la entrega y cualquier otra condición se acuerdan entre comprador y vendedor, fuera de Laria.</p>
        <MarketplaceLimitations />
      </LegalSection>

      <LegalSection title="2. Cuentas">
        <ul>
          <li>Una cuenta Particular sirve para comprar y vender. Una cuenta de Tienda es independiente y administra una sola tienda.</li>
          <li>Debes registrar datos verdaderos y mantenerlos actualizados, incluido tu número de WhatsApp.</li>
          <li>Eres responsable de la actividad de tu cuenta y de mantener tu contraseña en reserva. Laria nunca te pedirá tu contraseña ni códigos de verificación.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Publicaciones">
        <ul>
          <li>Solo puedes publicar artículos que te pertenecen o que estás autorizado a vender.</li>
          <li>El título, la descripción, el estado, el precio y las fotos deben corresponder al artículo real. Cada publicación requiere entre 2 y 10 fotos del artículo.</li>
          <li>No se permiten los artículos y anuncios descritos en <Link href="/articulos-prohibidos">Artículos prohibidos</Link>.</li>
          <li>Las publicaciones de Particulares y de Tiendas no verificadas se revisan antes de mostrarse. Algunos cambios en publicaciones aprobadas (por ejemplo título, categoría, marca, modelo, estado o fotos) también se revisan.</li>
          <li>Laria puede rechazar u ocultar una publicación que incumpla estas reglas; en ese caso indicará el motivo al propietario.</li>
          <li>Cuando vendas un artículo, márcalo como vendido. La publicación vendida se conserva como historial y no se reactiva.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Tiendas y etiquetas">
        <ul>
          <li><strong>Tienda</strong>: la tienda pasó una aprobación básica de Laria y su página puede ser pública.</li>
          <li><strong>Tienda Verificada</strong>: Laria revisó manualmente datos comerciales como RUC, razón social y datos de contacto. No es una verificación automática ante SUNAT ni una garantía sobre los productos o las transacciones de la tienda.</li>
          <li>Cada tienda gratuita puede tener hasta 50 publicaciones activas o en revisión al mismo tiempo.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Transacciones confirmadas y reseñas">
        <ul>
          <li>Al marcar una venta, el vendedor puede indicar a un comprador que lo contactó desde Laria. Si ese comprador confirma, la venta queda registrada como transacción de Laria.</li>
          <li>Esa confirmación solo indica que ambas partes reconocen que la venta se originó en Laria. No verifica el pago, el monto, la entrega ni el estado del artículo.</li>
          <li>Solo las transacciones confirmadas permiten reseñas. Deben ser honestas y referirse a la experiencia real. Una reseña publicada no se puede editar ni eliminar libremente.</li>
          <li>Laria puede ocultar reseñas abusivas o inapropiadas, pero no reescribe su contenido.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Conducta no permitida">
        <ul>
          <li>Estafas, suplantación de identidad o información falsa o engañosa.</li>
          <li>Acoso, amenazas, lenguaje discriminatorio o spam.</li>
          <li>Pedir pagos o datos sensibles con el pretexto de que Laria cobra, custodia el dinero o gestiona el envío.</li>
          <li>Usar los datos de contacto de otros usuarios para fines ajenos a la compraventa.</li>
          <li>Manipular reseñas, métricas o el sistema de reportes.</li>
        </ul>
        <p>Laria puede ocultar contenido y restringir cuentas que incumplan estas reglas.</p>
      </LegalSection>

      <LegalSection title="7. Reportes y moderación">
        <p>Puedes reportar publicaciones, tiendas y reseñas con el botón «Reportar». El equipo de Laria revisa cada reporte y puede resolverlo o desestimarlo. Laria no actúa como mediador ni árbitro en desacuerdos entre compradores y vendedores.</p>
      </LegalSection>

      <LegalSection title="8. Responsabilidad de cada parte">
        <p>Laria no es parte de los acuerdos entre usuarios. Comprador y vendedor son responsables de verificar el artículo, acordar el pago y la entrega, y cumplir sus obligaciones. Revisa los <Link href="/consejos-de-seguridad">consejos de seguridad</Link> antes de pagar o entregar un artículo.</p>
      </LegalSection>

      <LegalSection title="9. Datos personales">
        <p>El uso de tus datos se explica en la <Link href="/privacidad">Política de privacidad</Link>.</p>
      </LegalSection>

      <LegalSection title="10. Cambios y contacto">
        <p>Podemos actualizar estas reglas cuando cambie el funcionamiento de Laria. La fecha de la última actualización aparece al inicio de esta página.</p>
        <LegalContact purpose="Para consultas sobre estos términos," />
      </LegalSection>
    </LegalPage>
  );
}
