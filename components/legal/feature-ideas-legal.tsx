import Link from "next/link";
import { LegalSection } from "@/components/legal-page";

// Feature ideas (docs/feature-ideas/legal-review.md): the Terms and Privacy lines for the accounts, deal-trust,
// listing-details, selling-tools, store-floor, store-reach and store-locations batches, gathered by the integrator
// from each batch's "Copy for legal review". DRAFT PENDING LEGAL REVIEW: the wording, the section numbers and LEGAL_LAST_UPDATED in
// lib/legal-pages.ts are settled in that review, before features/marketplace reaches main. Services and discovery keep
// their own drafts (components/legal/services-legal.tsx, app/terminos/page.tsx).

export function TermsFeatureToolsSection() {
  return (
    <div id="herramientas" className="scroll-mt-4">
      <LegalSection title="5 ter. Seguridad, confianza y herramientas de venta">
        <ul>
          <li>Las cuentas de Admin y las de tiendas con medios de pago aprobados deben usar la verificación en dos pasos. Para las demás cuentas es opcional.</li>
          <li>Puedes reportar un instrumento robado con el número de la denuncia policial. El reporte debe ser verdadero: Laria puede descartarlo y restringir la cuenta si no lo es. Una coincidencia con una publicación, el inventario de una tienda o «Mi equipo» la revisa el equipo de Laria: no es una acusación, no cambia nada por sí sola y solo se informa a quien hizo el reporte, sin nombrar la publicación ni a quien vende. Laria no recupera instrumentos; eso corresponde a la policía.</li>
          <li>«Vendedor destacado» y «Tienda destacada» se otorgan y se retiran según los criterios que se explican en cada página. No son una garantía sobre quien vende ni sobre sus instrumentos.</li>
          <li>Una compra registrada en el mostrador de una tienda y confirmada con su código solo indica que la tienda y el comprador la reconocen. No verifica el pago, la garantía, la autenticidad ni el estado del instrumento.</li>
          <li>La garantía y los cambios que muestra una tienda son una oferta de esa tienda, no de Laria, y no reemplazan los derechos que la ley de protección al consumidor te reconoce. Reservar una prueba en una tienda aparta un horario, no el instrumento.</li>
          <li>Lo que una publicación dice sobre envíos, pruebas, combos o parte de pago lo indica quien vende. Laria no gestiona envíos, pagos ni cambios.</li>
          <li>Las ofertas de tiendas por tu equipo, la parte de pago y la consignación son acuerdos entre tú y la tienda. Laria no compra, no tasa, no cobra comisiones y no interviene en el pago: la tienda revisa el equipo y confirma el precio final.</li>
          <li>Un precio especial que quien vende ofrece a las personas que guardaron su publicación vale solo para ellas y hasta la fecha indicada. El precio publicado no cambia.</li>
          <li>En una campaña de Laria, Laria comprueba con su propio historial de precios que el precio «Antes» fue el más bajo de esa publicación en los 30 días anteriores a la campaña. El descuento y la disponibilidad son de la tienda.</li>
          <li>La marca «Distribuidor oficial» indica que Laria revisó un documento de autorización de la marca. No verifica cada instrumento ni su garantía.</li>
          <li>Una tienda puede importar sus publicaciones de Mercado Libre. Laria solo lee esa cuenta, no publica ni cambia nada en ella, y su uso se rige también por los términos de Mercado Libre.</li>
          <li>Una tienda puede emitir boletas y facturas desde su Mostrador con su propia cuenta de Nubefact. La tienda es quien emite el comprobante y responde por él ante SUNAT; Laria no emite comprobantes ni los revisa: solo envía a esa cuenta las ventas que la tienda registra. La disponibilidad por sede la informa la tienda.</li>
        </ul>
      </LegalSection>
    </div>
  );
}

export function PrivacyFeatureToolsSection() {
  return (
    <div id="herramientas" className="scroll-mt-4">
      <LegalSection title="4 quáter. Seguridad, confianza y herramientas de venta">
        <ul>
          <li><strong>Seguridad de la cuenta.</strong> Si activas la verificación en dos pasos, nuestro proveedor de autenticación guarda el vínculo con tu app y Laria guarda tus códigos de recuperación solo como hash. Registramos cada navegador desde el que inicias sesión (por ejemplo «Chrome en Android») y su última actividad, para mostrarte tus dispositivos y avisarte por correo de un ingreso desde uno nuevo. Si inicias sesión con Google o Apple, recibimos de ellos tu nombre y tu correo; Apple puede darnos una dirección de reenvío en lugar de tu correo.</li>
          <li><strong>Ayuda.</strong> Cuando escribes al equipo de Laria guardamos tu nombre, tu correo, el tema, tu mensaje, la página desde la que escribiste y nuestra respuesta.</li>
          <li><strong>Reportes de robo y números de serie.</strong> Un reporte guarda lo que escribes, sus fotos y el número de denuncia; solo lo ven tú y el equipo de Laria. Los números de serie que agregas a una publicación, al inventario de tu tienda o a «Mi equipo» no se muestran en ninguna página y solo se comparan con los reportes de robo activos.</li>
          <li><strong>Huellas de fotos.</strong> Para detectar fotos copiadas de otras publicaciones, calculamos en nuestros servidores una huella de 64 bits de cada foto de una publicación. La huella no identifica personas. Una coincidencia la revisa una persona del equipo de Laria; nada se rechaza ni se oculta automáticamente.</li>
          <li><strong>Mi equipo.</strong> Los equipos que registras, con sus fechas, notas y número de serie, solo los ves tú.</li>
          <li><strong>Ofertas de tiendas, parte de pago y consignación.</strong> Antes de que elijas una oferta, las tiendas ven la descripción y las fotos de tu equipo, pero no tu nombre ni tu teléfono. La tienda que eliges ve tu nombre y tu WhatsApp, y tú ves su dirección. Las fotos se borran a los 2 días si no enviaste el pedido, y 90 días después de que se cierra si lo enviaste.</li>
          <li><strong>Pruebas en tienda.</strong> La tienda ve el nombre, el WhatsApp y el mensaje que dejas al reservar. La reserva se borra 90 días después de su fecha.</li>
          <li><strong>Reseñas con fotos.</strong> Las fotos de una reseña se muestran solo si Laria las aprueba. Las que no llegaste a adjuntar a una reseña se borran a los 2 días.</li>
          <li><strong>Comprador con historial.</strong> Si lo activas, quien abre tu enlace ve tu nombre, desde cuándo compras en Laria, tus compras verificadas y el promedio de las calificaciones que te dieron los vendedores; nunca tu teléfono, tu correo ni qué compraste. Al desactivarlo, el enlace deja de funcionar.</li>
          <li><strong>Historial en Laria.</strong> Si vinculas una publicación a una compra hecha en Laria, la publicación muestra la fecha de esa compra y cuántos dueños anteriores tuvo en Laria, sin ningún dato de quien te la vendió.</li>
          <li><strong>Oferta a interesados.</strong> Quien vende ve cuántas personas guardaron su publicación, no quiénes son.</li>
          <li><strong>Lo que buscan en Laria.</strong> Las tiendas activas ven cuántas personas distintas buscaron algo, por ciudad, nunca en grupos de menos de 5. Ese informe se guarda solo como cifras, sin cuentas ni sesiones, durante 13 meses.</li>
          <li><strong>Niveles.</strong> «Vendedor destacado» y «Tienda destacada» se calculan con tu actividad en Laria: ventas verificadas, reseñas, reportes aceptados en tu contra y preguntas sin responder.</li>
          <li><strong>Artistas verificados.</strong> Laria guarda cómo comprobó la identidad de un artista solo para su registro interno. El nombre artístico, su página y su historia son públicos.</li>
          <li><strong>Comprobantes de tiendas.</strong> Cuando una tienda emite una boleta o factura desde su Mostrador, guardamos con el comprobante el documento, el nombre, la dirección fiscal y el correo que la tienda registra, y los enviamos a la cuenta de Nubefact de esa tienda. La tienda es responsable de esos datos, que guarda para sus obligaciones tributarias; Laria los trata por encargo de la tienda.</li>
          <li><strong>Tiendas conectadas a Mercado Libre.</strong> Guardamos cifrado el acceso que Mercado Libre nos da para leer sus publicaciones, y lo borramos cuando la tienda se desconecta.</li>
        </ul>
      </LegalSection>
    </div>
  );
}

export function PrivacyFeatureCookies() {
  return (
    <>
      <li>Con «Mantener sesión iniciada» marcado, las cookies de sesión duran hasta 400 días. Si lo desmarcas, una cookie <code>laria_recordar</code> hace que terminen al cerrar el navegador.</li>
      <li>Una cookie propia, <code>laria_dispositivo</code>, con un identificador aleatorio que dura hasta 400 días, para reconocer un navegador en el que ya iniciaste sesión. Guardamos solo un hash de ese identificador.</li>
      <li>Algunas funciones guardan datos solo en tu navegador, como la lista de un combo, y no nos los envían.</li>
    </>
  );
}

export function PrivacyFeatureProviders() {
  return (
    <ul>
      <li>Google y Apple, si inicias sesión con ellos.</li>
      <li>OpenFreeMap, que entrega las imágenes del mapa: tu navegador se las pide directamente, así que recibe tu dirección IP.</li>
      <li>Mercado Libre, solo para las tiendas que conectan su cuenta.</li>
      <li>Nubefact, solo para las tiendas que emiten comprobantes con su propia cuenta.</li>
      <li>Meta y Google reciben datos públicos de publicaciones, nunca datos de cuentas, en los catálogos que una tienda activa y en el de Laria.</li>
    </ul>
  );
}

export function PrivacyFeatureRights() {
  return <p>Desde <Link href="/mi-cuenta/datos">Tus datos</Link> puedes descargar tus datos y eliminar tu cuenta. Las compras y ventas confirmadas y sus reseñas se conservan como «Cuenta eliminada». Una cuenta de tienda o de Admin se cierra escribiendo al equipo.</p>;
}
