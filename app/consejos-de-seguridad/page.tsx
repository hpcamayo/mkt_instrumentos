import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, LegalSection, MarketplaceLimitations } from "@/components/legal-page";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE } from "@/lib/site";

const description = "Cómo comprar y vender instrumentos de forma más segura en Laria: qué revisar, cómo pagar y entregar, y señales de posible estafa.";

export const metadata: Metadata = {
  title: "Consejos de seguridad para comprar y vender",
  description,
  alternates: { canonical: "/consejos-de-seguridad" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Consejos de seguridad | Laria", description, url: "/consejos-de-seguridad", images: DEFAULT_OG_IMAGES },
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

      {/* deal-trust (safe-03): the meetup section the «Encuentro seguro» sheet links to. */}
      <LegalSection id="encuentro" title="Si se encuentran en persona">
        <ul>
          <li>Elige un lugar público y concurrido, de día: un centro comercial, la puerta de una comisaría o una tienda que se ofrece como «Punto seguro Laria».</li>
          <li>Antes de salir, avisa a alguien de confianza a dónde vas, con quién y a qué hora. En la publicación de un particular, «Encuentro seguro» te prepara ese mensaje para WhatsApp.</li>
          <li>Prueba el instrumento con calma: enciéndelo y conéctalo, revisa cuerdas, trastes, teclas o parches, escucha si hay ruidos y compara el número de serie con el de las fotos.</li>
          <li>Si puedes, ve con alguien que conozca el instrumento.</li>
          <li>Paga solo después de revisarlo, y quien vende confirma el pago en su propia app antes de entregar.</li>
        </ul>
        <p>Un «Punto seguro Laria» es una tienda verificada que acepta que compradores y vendedores se vean en su local durante su horario. La tienda no revisa el instrumento, no recibe pagos y no participa en el trato. Laria no revisa estos lugares ni a las personas y no puede garantizar cómo resulta un encuentro.</p>
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
        <p>«Vendedor destacado» y «Tienda destacada» se asignan solos cada noche a quien cumple criterios públicos (ventas verificadas, reseñas, ningún reporte confirmado en los últimos 90 días y preguntas respondidas) y se quitan solos cuando deja de cumplirlos. Las fotos de las reseñas las revisa Laria antes de mostrarlas. Tampoco son una garantía sobre un artículo o una transacción.</p>
      </LegalSection>

      <LegalSection title="Si algo sale mal">
        <p>Usa el botón «Reportar» en la publicación, tienda o reseña para que el equipo de Laria la revise. Laria no puede recuperar pagos ni resolver disputas entre las partes; si fuiste víctima de un delito, acude a la Policía Nacional del Perú. Consulta también los <Link href="/terminos">Términos</Link> y los <Link href="/articulos-prohibidos">Artículos prohibidos</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
