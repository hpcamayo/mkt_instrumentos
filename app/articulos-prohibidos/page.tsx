import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { OPEN_GRAPH_BASE } from "@/lib/site";

const description = "Qué artículos y anuncios no se pueden publicar en Laria y qué artículos tienen condiciones especiales.";

export const metadata: Metadata = {
  title: "Artículos prohibidos y restringidos",
  description,
  alternates: { canonical: "/articulos-prohibidos" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Artículos prohibidos y restringidos | Laria", description, url: "/articulos-prohibidos" },
};

export default function ProhibitedItemsPage() {
  return (
    <LegalPage
      path="/articulos-prohibidos"
      eyebrow="Reglas de publicación"
      title="Artículos prohibidos y restringidos"
      intro={<p>Laria es un marketplace de instrumentos musicales y equipo de música y audio. Estas reglas forman parte de los <Link href="/terminos">Términos</Link> y se aplican a todas las publicaciones, de Particulares y de tiendas.</p>}
    >
      <LegalSection title="No está permitido publicar">
        <ul>
          <li>Artículos robados, de procedencia dudosa o que no tienes derecho a vender.</li>
          <li>Falsificaciones, réplicas o copias presentadas como originales, y el uso engañoso de marcas o modelos.</li>
          <li>Artículos que no son instrumentos musicales ni equipo de música o audio de las categorías de Laria.</li>
          <li>Armas, drogas, medicamentos, alcohol, tabaco, animales, contenido para adultos o cualquier artículo cuya venta esté prohibida por la ley peruana.</li>
          <li>Anuncios que no ofrecen un artículo concreto a la venta: servicios, alquileres, pedidos de compra, rifas, sorteos o publicidad.</li>
          <li>Fotos que no corresponden al artículo real, precios ficticios o descripciones engañosas.</li>
          <li>Datos personales de terceros, o enlaces y datos para pagar a través de supuestos servicios de Laria.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Permitido con condiciones">
        <ul>
          <li><strong>Materiales de especies protegidas</strong>: instrumentos o piezas con materiales cuyo comercio está restringido (por ejemplo marfil, carey o ciertas maderas protegidas) solo pueden publicarse si el vendedor cuenta con la documentación legal exigible, y no deben ofrecerse para exportación sin los permisos correspondientes.</li>
          <li><strong>Instrumentos inspirados en modelos conocidos</strong>: se permiten si se publican con su marca real y sin sugerir que son de otra marca.</li>
          <li><strong>Artículos con fallas o modificaciones</strong>: se permiten si la condición, la descripción y las fotos muestran claramente las fallas, reparaciones o modificaciones.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Qué hace Laria">
        <p>Las publicaciones que incumplen estas reglas pueden ser rechazadas u ocultadas, con un motivo visible para su propietario. Las cuentas que incumplen de forma grave o repetida pueden ser restringidas.</p>
        <p>Si ves una publicación prohibida, usa el botón «Reportar publicación» y elige «Artículo o contenido prohibido».</p>
      </LegalSection>
    </LegalPage>
  );
}
