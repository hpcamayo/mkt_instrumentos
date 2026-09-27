import Link from "next/link";
import type { Metadata } from "next";
import { LegalContact, LegalPage, LegalSection } from "@/components/legal-page";
import { OPEN_GRAPH_BASE } from "@/lib/site";

const description = "Qué datos personales usa Laria, para qué, qué se muestra públicamente, qué cookies usamos y cómo ejercer tus derechos.";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description,
  alternates: { canonical: "/privacidad" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Política de privacidad | Laria", description, url: "/privacidad" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      path="/privacidad"
      eyebrow="Privacidad"
      title="Política de privacidad"
      intro={<p>Esta política explica qué datos personales trata Laria para operar el marketplace, qué información es pública y cómo puedes ejercer tus derechos según la Ley N.° 29733, Ley de Protección de Datos Personales del Perú.</p>}
    >
      <LegalSection title="1. Datos que tratamos">
        <ul>
          <li><strong>Cuenta</strong>: nombre, correo electrónico, número de WhatsApp, ciudad y región. Al crear la cuenta o cambiar la contraseña, esta se envía directamente a nuestro proveedor de autenticación, que no guarda la contraseña en sí, sino solo un hash de ella. Al iniciar sesión, la contraseña pasa por el servidor de Laria solo para reenviarla a ese proveedor; Laria no la guarda ni la registra.</li>
          <li><strong>Tiendas</strong>: RUC, razón social, correo y teléfono comerciales, dirección, ubicación, persona de contacto y, si los agregas, logo, banner, fotos y redes sociales.</li>
          <li><strong>Publicaciones</strong>: fotos, título, descripción, precio, estado, ubicación y características del artículo.</li>
          <li><strong>Actividad en Laria</strong>: publicaciones vistas o mostradas, favoritos, búsquedas y filtros, alertas guardadas, clics en el botón de WhatsApp, reportes, confirmaciones de transacción y reseñas.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Lo que no recopilamos">
        <ul>
          <li>El contenido de tus conversaciones de WhatsApp. Solo registramos que se inició un contacto desde una publicación.</li>
          <li>Datos de tarjetas o cuentas bancarias: Laria no procesa pagos.</li>
          <li>Huellas digitales del dispositivo (fingerprinting) ni píxeles de seguimiento publicitario.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para qué usamos tus datos">
        <ul>
          <li>Crear y proteger tu cuenta, e iniciar sesión.</li>
          <li>Publicar, moderar y mostrar artículos y tiendas.</li>
          <li>Permitir que los compradores te contacten por WhatsApp.</li>
          <li>Enviar correos del marketplace: resultados de moderación, alertas de búsqueda, bajadas de precio, confirmaciones de compra y avisos de reseñas.</li>
          <li>Mostrar estadísticas de tus publicaciones o tu tienda y entender, de forma agregada, cómo se usa Laria.</li>
          <li>Atender reportes y prevenir fraudes y abusos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Qué información es pública">
        <ul>
          <li>En una publicación aprobada se muestran el nombre del vendedor, su ciudad y región, y el botón de contacto, que abre WhatsApp con su número.</li>
          <li>Las páginas de tiendas aprobadas muestran los datos públicos de la tienda y su inventario.</li>
          <li>Las reseñas publicadas muestran la calificación, el comentario y el nombre de quien la escribió.</li>
          <li>Si contactas a un vendedor con tu sesión iniciada, al marcar esa publicación como vendida el vendedor puede ver tu nombre en la lista de posibles compradores, para indicar quién compró.</li>
          <li>Tu correo, tus favoritos, tus alertas y tu actividad de navegación no se muestran a otros usuarios. Vendedores y tiendas ven estadísticas agregadas, no la identidad de quienes vieron sus publicaciones.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Cookies">
        <ul>
          <li>Cookies de sesión necesarias para iniciar sesión y mantener tu cuenta segura.</li>
          <li>Una cookie propia de sesión del marketplace, válida por 24 horas, con un identificador aleatorio que nos permite contar vistas y búsquedas sin identificarte.</li>
          <li>No usamos cookies publicitarias ni de redes sociales.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Proveedores">
        <p>Para operar Laria usamos proveedores que tratan datos por nuestra cuenta: Supabase (base de datos, autenticación y almacenamiento de fotos), Vercel (alojamiento del sitio) y Resend (envío de correos). Estos servicios pueden procesar datos fuera del Perú. Al contactar a un vendedor, pasas a WhatsApp, que se rige por sus propias políticas.</p>
      </LegalSection>

      <LegalSection title="7. Conservación">
        <p>Conservamos tus datos mientras tu cuenta esté activa y el tiempo necesario para mantener el historial de publicaciones, ventas, reseñas y moderación, prevenir abusos y cumplir obligaciones legales. Las publicaciones vendidas se conservan como historial.</p>
      </LegalSection>

      <LegalSection title="8. Tus derechos">
        <p>Puedes actualizar tu nombre, WhatsApp, ciudad y región desde <Link href="/mi-cuenta/perfil">Mi cuenta</Link>. También puedes solicitar el acceso, la rectificación, la cancelación de tus datos o la oposición a su tratamiento.</p>
        <LegalContact purpose="Para ejercer estos derechos o hacer consultas sobre privacidad," />
      </LegalSection>

      <LegalSection title="9. Cambios">
        <p>Si cambiamos la forma en que tratamos tus datos, actualizaremos esta página y su fecha de actualización.</p>
      </LegalSection>
    </LegalPage>
  );
}
