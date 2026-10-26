import Link from "next/link";
import { LegalSection } from "@/components/legal-page";

// feature-ideas services (bet-02): Servicios para músicos in the Terms and the Privacy policy. DRAFT PENDING LEGAL
// REVIEW (docs/feature-ideas/services.md, "Copy for legal review"): the wording, the section numbers and the
// LEGAL_LAST_UPDATED date in lib/legal-pages.ts are settled when the batch is merged.

export function TermsServicesSection() {
  return (
    <div id="servicios" className="scroll-mt-4">
      <LegalSection title="5 bis. Servicios para músicos">
        <ul>
          <li><Link href="/servicios">Servicios para músicos</Link> es una sección aparte donde Particulares y tiendas ofrecen clases de música, luthería y reparaciones, salas de ensayo, estudios de grabación y sonido para eventos. Los servicios no son publicaciones de instrumentos y no aparecen en el catálogo, en las búsquedas ni en las alertas de instrumentos.</li>
          <li>Cada servicio pasa por la revisión de Laria antes de mostrarse. Quien lo ofrece es responsable de la información que publica, de contar con los permisos, licencias o títulos que su actividad requiera, de su comprobante de pago y del trabajo que realiza.</li>
          <li>Laria no verifica títulos, experiencia, equipos ni la calidad del trabajo, no agenda citas, no cobra, no recibe dinero y no es parte del acuerdo. El precio «desde» es referencial: el precio final, el horario y las condiciones los acuerdan las partes.</li>
          <li>Quien ofrece el servicio puede pedirle a una persona que le escribió desde Laria que confirme la contratación, o el cliente puede indicar que lo contrató. Si la otra parte confirma, el cliente puede dejar una reseña durante 30 días. Esa confirmación no verifica el pago, el monto ni el trabajo realizado.</li>
          <li>Las reseñas de servicios siguen las mismas reglas que las demás: deben ser honestas y referirse a una experiencia real, no se pueden editar y Laria puede ocultarlas si son abusivas, pero no reescribe su contenido.</li>
          <li>Si contratas clases para una persona menor de edad, acompáñala y acuerda las condiciones directamente. Laria no revisa antecedentes de quienes ofrecen servicios.</li>
          <li>No se permiten servicios ajenos a la música, datos de contacto dentro del texto, precios ficticios ni la venta de instrumentos o equipos dentro de un servicio: esos se publican como instrumentos.</li>
        </ul>
      </LegalSection>
    </div>
  );
}

export function PrivacyServicesSection() {
  return (
    <div id="servicios" className="scroll-mt-4">
      <LegalSection title="4 ter. Servicios para músicos">
        <ul>
          <li>Cuando ofreces un servicio, guardamos lo que escribes en el formulario: el tipo de servicio, el título, la descripción, el nombre que se muestra, el precio desde, la ciudad, el distrito, las zonas que atiendes, dónde lo das, las fotos y el número de WhatsApp. Cuando se aprueba, todo eso es público; el botón de contacto abre WhatsApp con tu número.</li>
          <li>Cuando alguien usa el botón de contacto de un servicio, registramos la fecha, el servicio y, si inició sesión, su cuenta. Quien ofrece el servicio ve cifras agregadas de visitas y contactos, no la identidad de quienes vieron su página.</li>
          <li>Si escribiste con tu sesión iniciada, en los 180 días siguientes quien ofrece el servicio puede ver tu nombre con la inicial de tu apellido, la fecha de tu último contacto y los tres últimos dígitos de tu número, para pedirte que confirmes la contratación. Puedes responder que no lo contrataste.</li>
          <li>Una reseña de un servicio muestra la calificación, el comentario y tu nombre con la inicial de tu apellido. Quien ofrece el servicio no ve quién reportó su servicio o una reseña.</li>
          <li>Si eliminas un servicio, se borran su página y sus fotos. Un servicio con contrataciones confirmadas o reseñas no se elimina, para conservar esas reseñas, pero puedes pausarlo para que deje de mostrarse.</li>
        </ul>
      </LegalSection>
    </div>
  );
}
