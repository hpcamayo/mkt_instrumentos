import Link from "next/link";
import { LegalSection } from "@/components/legal-page";
import { assistedCommerceEnabled } from "@/lib/payment-methods";

// PAY-1 legal drafts (design §11.4). DRAFT PENDING LEGAL REVIEW: the brief's §22 compliance review (consumer
// protection, Ley 29733, electronic invoicing, provider terms) must approve this wording before the public pilot.
// Both sections render only while the pilot switch is on (LARIA_ASSISTED_COMMERCE=1), so the published Terms and
// Privacy stay exactly as approved until then. When the pilot goes live, update LEGAL_LAST_UPDATED in lib/legal-pages.ts.

export function TermsAssistedCommerceSection() {
  if (!assistedCommerceEnabled()) return null;
  return (
    <LegalSection title="4 bis. Medios de pago de tiendas verificadas (piloto)">
      <ul>
        <li>Algunas tiendas verificadas pueden indicar en Laria los medios de pago que aceptan, por ejemplo efectivo o tarjeta al recoger, Yape o Plin, o un enlace de pago que la propia tienda envía por WhatsApp. Antes de mostrar un medio, Laria revisa a mano que su titular coincida con la razón social o el RUC de la tienda. Esa revisión no es una garantía sobre el pago, la tienda ni lo que vende.</li>
        <li>El pago se hace directamente a la tienda. Laria no procesa pagos, no recibe ni retiene dinero, no muestra enlaces de pago y no es parte de la compraventa.</li>
        <li>«Solicitar compra» abre WhatsApp con un mensaje para la tienda. No reserva unidades ni crea un pedido: la tienda confirma la disponibilidad, el precio final, el pago y la entrega. La disponibilidad que muestra Laria la informa la tienda y puede no estar al día.</li>
        <li>La tienda es responsable de emitir el comprobante de pago (boleta o factura), de atender cambios, devoluciones y garantías, y de su Libro de Reclamaciones, según las normas de protección al consumidor.</li>
        <li>Paga solo por los medios que la tienda indica en su página de Laria. Nadie cobra en nombre de Laria; si alguien lo hace, repórtalo y revisa los <Link href="/consejos-de-seguridad">consejos de seguridad</Link>.</li>
        <li>Laria puede desactivar un medio de pago o dejar de mostrarlo si la tienda pierde la verificación, cambia sus datos comerciales o incumple estas reglas.</li>
      </ul>
    </LegalSection>
  );
}

export function PrivacyAssistedCommerceSection() {
  if (!assistedCommerceEnabled()) return null;
  return (
    <LegalSection title="4 bis. Medios de pago y solicitudes de compra (piloto)">
      <ul>
        <li>Cuando una tienda verificada indica un medio de pago, Laria guarda el tipo de medio, el nombre del proveedor que verán los compradores, el titular que recibe el pago y una nota opcional. El titular no se muestra a los compradores: solo tú y el equipo autorizado de Laria pueden verlo, y Laria lo usa para compararlo con la razón social. No guardamos números de teléfono, cuentas, tarjetas ni enlaces de pago.</li>
        <li>Cuando usas «Solicitar compra», registramos que se inició una solicitud de compra desde esa publicación, igual que un contacto por WhatsApp: la fecha, la publicación, la tienda y, si iniciaste sesión, tu cuenta. No vemos el mensaje ni sabemos si la compra se concretó o se pagó.</li>
        <li>Lo que compartas con la tienda por WhatsApp para pagar, recibir tu comprobante o coordinar la entrega lo trata la tienda bajo su propia responsabilidad.</li>
      </ul>
    </LegalSection>
  );
}
