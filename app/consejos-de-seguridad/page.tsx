import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, LegalSection, MarketplaceLimitations } from "@/components/legal-page";
import { OPEN_GRAPH_BASE } from "@/lib/site";

const description = "Cómo comprar y vender instrumentos de forma más segura en Laria: qué revisar, cómo pagar y entregar, y señales de posible estafa.";

export const metadata: Metadata = {
  title: "Consejos de seguridad para comprar y vender",
  description,
  alternates: { canonical: "/consejos-de-seguridad" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Consejos de seguridad | Laria", description, url: "/consejos-de-seguridad" },
};

export default function SafetyPage() {
  return (
    <LegalPage
      path="/consejos-de-seguridad"
      eyebrow="Seguridad"
      title="Consejos de seguridad para comprar y vender"
      intro={<p>En Laria coordinas cada compra directamente con el vendedor. Estas recomendaciones reducen riesgos, pero no eliminan todos: decide con calma y desconfía de la prisa.</p>}
    >
      <LegalSection title="Lo que Laria no hace">
        <MarketplaceLimitations />
        <p><strong>Si alguien te dice que Laria cobra el pago, lo retiene hasta la entrega o gestiona el envío, es un intento de estafa.</strong> Laria nunca te pedirá tu contraseña, códigos de verificación ni pagos por WhatsApp.</p>
      </LegalSection>

      <LegalSection title="Si compras">
        <ul>
          <li>Siempre que puedas, revisa y prueba el instrumento en persona antes de pagar.</li>
          <li>Pide fotos o videos adicionales y, si aplica, el número de serie para compararlo con el artículo que recibes.</li>
          <li>Evita pagar adelantos a vendedores que no conoces y desconfía de precios muy por debajo del mercado.</li>
          <li>Encuéntrate en lugares públicos, concurridos y de día. Si puedes, ve acompañado.</li>
          <li>Guarda la conversación, el comprobante de pago y los datos del vendedor.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Si vendes">
        <ul>
          <li>Antes de entregar, confirma en tu banco o billetera que el dinero llegó. Las capturas de pantalla de transferencias pueden ser falsas.</li>
          <li>No compartas contraseñas, códigos que recibas por SMS ni datos de tarjetas.</li>
          <li>No hagas clic en enlaces que supuestamente liberan un pago o una entrega «de Laria».</li>
          <li>Marca tu publicación como vendida cuando concretes la venta.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Envíos entre ciudades">
        <p>Si decides enviar o recibir un artículo por agencia, el acuerdo y el riesgo son de comprador y vendedor. Prefiere agencias con código de seguimiento, acuerda por escrito quién paga el envío y cuándo se paga el artículo, y registra el estado del paquete al entregarlo y al recibirlo.</p>
      </LegalSection>

      <LegalSection title="Señales de alerta">
        <ul>
          <li>Te presionan para pagar ya o para cerrar el trato fuera de lo conversado.</li>
          <li>El vendedor no quiere mostrar el artículo ni enviar fotos nuevas.</li>
          <li>Te piden pagar a una cuenta a nombre de otra persona sin una explicación clara.</li>
          <li>Te envían enlaces, códigos o supuestos comprobantes de Laria.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Etiquetas y reseñas">
        <p>«Tienda Verificada» significa que Laria revisó manualmente los datos comerciales de la tienda. Las reseñas solo provienen de ventas que comprador y vendedor confirmaron como originadas en Laria. Ninguna de las dos es una garantía sobre un artículo o una transacción.</p>
      </LegalSection>

      <LegalSection title="Si algo sale mal">
        <p>Usa el botón «Reportar» en la publicación, tienda o reseña para que el equipo de Laria la revise. Laria no puede recuperar pagos ni resolver disputas entre las partes; si fuiste víctima de un delito, acude a la Policía Nacional del Perú. Consulta también los <Link href="/terminos">Términos</Link> y los <Link href="/articulos-prohibidos">Artículos prohibidos</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
