// safe-10 (feature ideas, accounts batch): the help center's articles, in four topics. Plain data so the search runs in
// the browser with no request, and the article pages are static. Wording follows the product's promises: Laria does
// not charge, hold money, ship or guarantee anything (docs/functional-spec.md, "Product Model").

export type HelpTopicId = "comprar" | "vender" | "tiendas" | "cuenta";

export type HelpSection = {
  heading?: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
};

export type HelpArticle = {
  slug: string;
  topic: HelpTopicId;
  title: string;
  summary: string;
  keywords: string[];
  sections: HelpSection[];
  links?: { href: string; label: string }[];
};

export const HELP_TOPICS: { id: HelpTopicId; title: string; description: string }[] = [
  { id: "comprar", title: "Comprar con seguridad", description: "Contactar, pagar, recibir y qué hacer si algo no cuadra." },
  { id: "vender", title: "Vender", description: "Publicar, la revisión, vender y volver a publicar." },
  { id: "tiendas", title: "Tiendas", description: "Registrar tu tienda, verificación, cupo e inventario." },
  { id: "cuenta", title: "Tu cuenta", description: "Ingresar, seguridad, correo, tus datos y eliminar la cuenta." },
];

// The topics a "¿No encontraste tu respuesta?" message can carry (help_tickets.topic).
export const HELP_TICKET_TOPICS: { id: string; label: string }[] = [
  { id: "comprar", label: "Comprar" },
  { id: "vender", label: "Vender" },
  { id: "tiendas", label: "Tiendas" },
  { id: "cuenta", label: "Mi cuenta" },
  { id: "seguridad", label: "Seguridad o posible estafa" },
  { id: "robo", label: "Un equipo robado" },
  { id: "otro", label: "Otro tema" },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ------------------------------------------------------------------ comprar
  {
    slug: "contactar-a-quien-vende",
    topic: "comprar",
    title: "Cómo contactar a quien vende",
    summary: "El botón de WhatsApp de cada publicación abre la conversación directamente con quien vende.",
    keywords: ["whatsapp", "contacto", "mensaje", "vendedor", "preguntar", "pregunta publica"],
    sections: [
      {
        paragraphs: [
          "Cada publicación tiene un botón «Contactar por WhatsApp». Abre una conversación con quien vende, con un mensaje que ya menciona el equipo. Toda la conversación y el acuerdo de compra pasan por WhatsApp: Laria no tiene un chat propio.",
          "Si tu duda le sirve también a otras personas (por ejemplo, si incluye estuche o si tiene algún detalle), puedes dejarla como pregunta pública en la publicación. Quien vende la responde una vez y la respuesta queda visible para todos.",
        ],
      },
      {
        heading: "Antes de escribir",
        bullets: [
          "Revisa las fotos, el estado y la descripción: muchas respuestas ya están ahí.",
          "Si te interesa, pide fotos o un video adicional y, si aplica, el número de serie.",
          "Nunca compartas contraseñas ni códigos de verificación. Laria no te los pedirá nunca.",
        ],
      },
    ],
    links: [{ href: "/consejos-de-seguridad", label: "Consejos de seguridad" }],
  },
  {
    slug: "pagar-y-recibir",
    topic: "comprar",
    title: "Cómo pagar y recibir el equipo de forma segura",
    summary: "Laria no cobra ni retiene pagos: acuerdas con quien vende. Prueba el equipo antes de pagar siempre que puedas.",
    keywords: ["pago", "pagar", "yape", "plin", "transferencia", "adelanto", "envio", "entrega", "recojo", "probar"],
    sections: [
      {
        paragraphs: [
          "Laria no procesa pagos, no retiene dinero, no gestiona envíos y no garantiza el equipo ni la transacción. El pago y la entrega los acuerdas directamente con quien vende.",
        ],
      },
      {
        heading: "Lo más seguro",
        bullets: [
          "Revisa y prueba el instrumento en persona antes de pagar.",
          "Encuéntrense en un lugar público y concurrido, de día. Si puedes, ve con alguien.",
          "Evita pagar adelantos a alguien que no conoces.",
          "Guarda la conversación, el comprobante y los datos de quien vende.",
        ],
      },
      {
        heading: "Si alguien dice que Laria cobra o retiene el pago",
        paragraphs: ["Es un intento de estafa. Laria nunca cobra, nunca retiene dinero hasta la entrega y nunca te escribe para pedir un pago."],
      },
    ],
    links: [{ href: "/consejos-de-seguridad", label: "Consejos de seguridad" }],
  },
  {
    slug: "senales-de-estafa",
    topic: "comprar",
    title: "Señales de una posible estafa",
    summary: "Prisa, precios demasiado bajos, adelantos y pedidos de códigos son las señales más comunes.",
    keywords: ["estafa", "fraude", "sospechoso", "prisa", "codigo", "adelanto", "barato", "falso", "captura"],
    sections: [
      {
        bullets: [
          "Te apuran: «hay otra persona interesada», «solo hoy».",
          "El precio está muy por debajo de lo que cuesta un equipo parecido.",
          "Te piden un adelanto o el pago completo antes de ver el equipo.",
          "Te piden un código que te llegó por SMS o por correo, o tu contraseña.",
          "No quieren mostrar el equipo en video ni dar el número de serie.",
          "Si vendes: te mandan una captura de una transferencia en lugar de que el dinero llegue a tu cuenta.",
        ],
      },
      {
        heading: "Qué hacer",
        paragraphs: [
          "No sigas adelante. Reporta la publicación desde el botón «Reportar» y, si ya pagaste, guarda las pruebas y acude a la policía. También puedes escribirnos desde este Centro de ayuda.",
        ],
      },
    ],
    links: [{ href: "/consejos-de-seguridad", label: "Consejos de seguridad" }],
  },
  {
    slug: "confirmar-compra-y-resenas",
    topic: "comprar",
    title: "Confirmar una compra y dejar una reseña",
    summary: "Si compraste por Laria, confirmarlo habilita las reseñas de ambas partes durante 10 días.",
    keywords: ["resena", "reseñas", "calificar", "estrellas", "confirmar", "compre", "compraste", "transaccion"],
    sections: [
      {
        paragraphs: [
          "Cuando quien vende marca la publicación como vendida y te elige como comprador, o cuando tú respondes «Sí, lo compré» a la pregunta «¿Compraste…?», la compra queda confirmada por ambas partes.",
          "Desde ese momento, cada parte tiene 10 días para dejar una reseña de 1 a 5 estrellas, con un comentario opcional. Ninguna ve la reseña de la otra hasta que las dos la envían o hasta que termina el plazo.",
          "Confirmar una compra no verifica el pago, la entrega ni el estado del equipo: solo que la compra salió de Laria.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/transacciones", label: "Compras y ventas" }],
  },
  {
    slug: "favoritos-y-alertas",
    topic: "comprar",
    title: "Favoritos y alertas",
    summary: "Guarda publicaciones y crea alertas de búsqueda. Te avisamos solo cuando hay algo nuevo, y puedes dejar de recibirlas en un toque.",
    keywords: ["favorito", "guardar", "alerta", "aviso", "baja de precio", "notificacion", "correo"],
    sections: [
      {
        bullets: [
          "Toca el corazón de una publicación para guardarla. Si baja de precio, te avisamos.",
          "En el catálogo, «Crear alerta» guarda tu búsqueda con sus filtros: te escribimos cuando aparece algo que coincide, al momento o una vez al día.",
          "Cada correo de alerta trae un enlace para dejar de recibirlo, y en Mi cuenta, Correos, eliges qué te escribimos.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/alertas", label: "Mis alertas" }, { href: "/mi-cuenta/correos", label: "Correos" }],
  },
  {
    slug: "reportar",
    topic: "comprar",
    title: "Reportar una publicación, una tienda o una reseña",
    summary: "El botón «Reportar» envía tu reporte al equipo de Laria, que lo revisa.",
    keywords: ["reportar", "denunciar", "falso", "prohibido", "abuso", "moderacion"],
    sections: [
      {
        paragraphs: [
          "Las publicaciones, las tiendas, las reseñas y las preguntas públicas tienen un botón «Reportar». Elige el motivo y, si quieres, agrega un detalle. El equipo de Laria revisa cada reporte y decide si oculta el contenido.",
          "Quien publicó no sabe quién lo reportó.",
        ],
      },
    ],
    links: [{ href: "/articulos-prohibidos", label: "Artículos prohibidos" }],
  },
  {
    slug: "equipo-robado",
    topic: "comprar",
    title: "Si te robaron un instrumento",
    summary: "Repórtalo en Laria con su número de serie y fotos: si aparece en una publicación, el equipo de Laria lo revisa y te avisa.",
    keywords: ["robo", "robado", "robaron", "serie", "numero de serie", "denuncia", "policia", "perdido"],
    sections: [
      {
        steps: [
          "Haz la denuncia en la comisaría y guarda el número.",
          "En «Reportar un robo», escribe la marca, el modelo, el número de serie si lo tienes, y sube fotos tuyas del equipo.",
          "Laria compara el número de serie y las fotos con las publicaciones y con el inventario de las tiendas. Si algo coincide, el equipo de Laria lo revisa.",
          "Solo después de esa revisión te escribimos por correo. No publicamos tu reporte ni acusamos a nadie.",
        ],
      },
      {
        paragraphs: [
          "Una coincidencia no prueba nada por sí sola: comparte el código de tu reporte con la policía, que es quien puede actuar. Laria colabora con las autoridades cuando lo piden por los canales oficiales.",
        ],
      },
    ],
    links: [{ href: "/reportar-robo", label: "Reportar un robo" }],
  },
  // ------------------------------------------------------------------ vender
  {
    slug: "publicar",
    topic: "vender",
    title: "Cómo publicar un instrumento",
    summary: "Cuatro pasos: fotos, qué es, estado y precio, y revisar. Necesitas entre 2 y 10 fotos.",
    keywords: ["publicar", "vender", "anuncio", "fotos", "precio", "borrador", "subir"],
    sections: [
      {
        steps: [
          "Fotos: entre 2 y 10, con el frente y la parte de atrás como mínimo. Se suben mientras completas lo demás.",
          "Qué es: categoría, marca, modelo y título.",
          "Estado y precio: el estado real del equipo y su precio en soles.",
          "Revisar y publicar: ves la publicación tal como la verán los compradores.",
        ],
      },
      {
        paragraphs: [
          "El formulario se guarda en tu dispositivo mientras escribes, y «Guardar borrador» lo guarda en tu cuenta para terminarlo en otro dispositivo. Tu WhatsApp y tu ciudad se piden en la primera publicación.",
        ],
      },
    ],
    links: [{ href: "/vender", label: "Publicar un instrumento" }],
  },
  {
    slug: "revision-de-publicaciones",
    topic: "vender",
    title: "Por qué mi publicación está en revisión o fue rechazada",
    summary: "Las publicaciones de Particulares pasan por una revisión antes de verse. Si se rechaza, te decimos el motivo.",
    keywords: ["revision", "rechazada", "pendiente", "moderacion", "aprobada", "motivo", "corregir"],
    sections: [
      {
        paragraphs: [
          "Cada publicación nueva de un Particular, y la de una Tienda que aún no está verificada, la revisa el equipo de Laria antes de que aparezca en el catálogo. Mis publicaciones muestra en qué paso está.",
        ],
      },
      {
        heading: "Motivos frecuentes de rechazo",
        bullets: [
          "Teléfonos, enlaces o correos en el título o la descripción (el contacto va por el botón de WhatsApp).",
          "Títulos en mayúsculas o con símbolos para llamar la atención.",
          "Precios simbólicos, como S/ 1.",
          "Fotos que no muestran el equipo que vendes, o que copian fotos de otra publicación.",
          "Artículos prohibidos.",
        ],
      },
      {
        paragraphs: ["Si se rechaza, el correo y Mis publicaciones te dicen el motivo y te llevan a corregirla."],
      },
    ],
    links: [{ href: "/articulos-prohibidos", label: "Artículos prohibidos" }, { href: "/mi-cuenta/publicaciones", label: "Mis publicaciones" }],
  },
  {
    slug: "vender-pausar-republicar",
    topic: "vender",
    title: "Marcar como vendida, pausar o volver a publicar",
    summary: "«Ya lo vendí» la retira del catálogo; el modo vacaciones la pausa hasta 90 días; «Republicar» crea una copia.",
    keywords: ["vendido", "vendida", "pausar", "vacaciones", "ocultar", "republicar", "duplicar", "retirar"],
    sections: [
      {
        bullets: [
          "Vendida: deja de aparecer en el catálogo y su enlace muestra «Vendido». Si el comprador te contactó por Laria, puedes elegirlo para confirmar la compra y abrir las reseñas.",
          "Ocultar: deja de verse y puedes volver a mostrarla cuando quieras.",
          "Modo vacaciones: tus publicaciones siguen visibles con «Vuelve el…», sin contacto por WhatsApp, hasta la fecha que elijas (máximo 90 días).",
          "Republicar o Duplicar: crea un borrador con el texto, las fotos y los datos copiados para que ajustes el precio o las fotos.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/publicaciones", label: "Mis publicaciones" }],
  },
  {
    slug: "numero-de-serie",
    topic: "vender",
    title: "El número de serie de tu equipo",
    summary: "Es opcional y privado: nadie más lo ve. Laria lo usa solo para compararlo con reportes de equipos robados.",
    keywords: ["serie", "numero de serie", "serial", "privado", "robado", "sku"],
    sections: [
      {
        paragraphs: [
          "Al publicar puedes escribir el número de serie del equipo. No aparece en la publicación ni lo ve nadie fuera del equipo de Laria.",
          "Laria lo compara con los reportes de equipos robados. Si coincide, el equipo de Laria lo revisa con calma antes de hacer nada; no se rechaza nada de forma automática y nadie es señalado en público.",
          "Las tiendas pueden guardar el número de serie en cada producto de su inventario.",
        ],
      },
    ],
  },
  // ------------------------------------------------------------------ tiendas
  {
    slug: "registrar-tienda",
    topic: "tiendas",
    title: "Registrar tu tienda",
    summary: "Una tienda usa su propia cuenta. Envías los datos del negocio y el equipo de Laria los revisa.",
    keywords: ["tienda", "registrar", "ruc", "negocio", "empresa", "razon social", "solicitud"],
    sections: [
      {
        steps: [
          "Crea la cuenta de la tienda (es distinta de una cuenta Particular).",
          "Envía los datos del negocio: RUC, razón social, correo, teléfono, dirección, ubicación y la persona de contacto. El logo, el banner y las redes son opcionales.",
          "Puedes empezar a cargar publicaciones mientras revisamos la solicitud; se ven cuando la tienda está aprobada y cada publicación pasa su revisión.",
        ],
      },
      { paragraphs: ["Cada RUC puede registrar una sola tienda."] },
    ],
    links: [{ href: "/registrar-tienda", label: "Registrar mi tienda" }],
  },
  {
    slug: "tienda-verificada",
    topic: "tiendas",
    title: "Tienda y Tienda verificada",
    summary: "«Tienda» pasó la aprobación básica. «Tienda verificada» es un negocio cuya identidad revisó Laria, y publica sin esperar revisión.",
    keywords: ["verificada", "verificacion", "insignia", "tienda verificada", "aprobacion"],
    sections: [
      {
        bullets: [
          "Tienda: su página es pública y cada publicación nueva pasa por revisión.",
          "Tienda verificada: Laria revisó a mano los datos del negocio. Sus publicaciones y cambios que cumplen las reglas aparecen directamente.",
        ],
      },
      {
        paragraphs: ["La verificación la decide el equipo de Laria. No es una garantía sobre los productos ni sobre las ventas."],
      },
    ],
  },
  {
    slug: "cupo-de-publicaciones",
    topic: "tiendas",
    title: "Cupo de publicaciones de una tienda",
    summary: "Cada tienda tiene un cupo de publicaciones activas a la vez; las vendidas, ocultas y rechazadas no cuentan.",
    keywords: ["cupo", "limite", "50", "publicaciones", "maximo", "mas cupo"],
    sections: [
      {
        paragraphs: [
          "El cupo es de publicaciones a la vez, no un total: cuentan las que están en revisión y las publicadas. Las vendidas, ocultas, rechazadas o archivadas no cuentan.",
          "Mi tienda muestra cuántas usas. Si necesitas más, pídelo desde ahí y el equipo de Laria lo revisa.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/tienda", label: "Mi tienda" }],
  },
  {
    slug: "inventario-y-stock",
    topic: "tiendas",
    title: "Inventario, stock y «Agotado»",
    summary: "Con inventario, cada publicación muestra si hay unidades. Sin stock se ve «Agotado» y conserva su enlace.",
    keywords: ["inventario", "stock", "agotado", "unidades", "sku", "importar", "carga masiva", "excel"],
    sections: [
      {
        bullets: [
          "En Inventario registras tus productos y unidades, uno por uno o con un archivo.",
          "Cuando una publicación se queda sin unidades, muestra «Agotado» y mantiene su enlace; vuelve sola cuando repones stock.",
          "Las ventas de productos con inventario se registran en Inventario.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/tienda/inventario", label: "Inventario" }],
  },
  // ------------------------------------------------------------------ cuenta
  {
    slug: "ingresar",
    topic: "cuenta",
    title: "Ingresar y mantener la sesión iniciada",
    summary: "Ingresa con tu contraseña o con un enlace por correo. Con «Mantener sesión iniciada» no te volvemos a pedir nada en ese dispositivo.",
    keywords: ["ingresar", "iniciar sesion", "login", "contraseña", "olvide", "enlace", "mantener sesion", "google", "apple"],
    sections: [
      {
        bullets: [
          "Contraseña o enlace por correo: elige en la página de ingreso.",
          "«Mantener sesión iniciada» viene marcado. Desmárcalo en una computadora compartida y la sesión se cerrará al cerrar el navegador.",
          "Si olvidaste tu contraseña, «¿Olvidaste tu contraseña?» te envía un enlace para crear una nueva.",
          "Cuando está disponible, también puedes continuar con Google o con Apple.",
        ],
      },
    ],
    links: [{ href: "/login", label: "Ingresar" }, { href: "/recuperar-contrasena", label: "Recuperar contraseña" }],
  },
  {
    slug: "verificacion-en-dos-pasos",
    topic: "cuenta",
    title: "Verificación en dos pasos",
    summary: "Además de tu contraseña, un código de una app de autenticación. Lo pedimos solo en un dispositivo nuevo o después de cerrar sesión.",
    keywords: ["dos pasos", "2fa", "autenticacion", "codigo", "authenticator", "seguridad", "recuperacion", "telefono perdido"],
    sections: [
      {
        steps: [
          "En Mi cuenta, Seguridad, toca «Activar verificación en dos pasos».",
          "Escanea el código con una app de autenticación (Google Authenticator, Microsoft Authenticator u otra).",
          "Escribe el código de 6 números y guarda tus 10 códigos de recuperación fuera del teléfono.",
        ],
      },
      {
        heading: "¿Perdiste el teléfono?",
        paragraphs: [
          "Usa uno de tus códigos de recuperación. La app se desactiva, se cierran tus sesiones y te avisamos por correo; ingresa con tu contraseña y configúrala de nuevo.",
        ],
      },
      {
        heading: "Cuándo es obligatoria",
        paragraphs: ["Para las cuentas de Admin y para la cuenta de una tienda con medios de pago aprobados."],
      },
    ],
    links: [{ href: "/mi-cuenta/seguridad", label: "Seguridad" }],
  },
  {
    slug: "dispositivos-y-sesiones",
    topic: "cuenta",
    title: "Dispositivos con sesión iniciada",
    summary: "Te escribimos cuando alguien ingresa desde un dispositivo nuevo. En Seguridad puedes cerrar la sesión de cualquiera.",
    keywords: ["dispositivo", "sesion", "cerrar sesion", "nuevo ingreso", "correo de ingreso", "todos los dispositivos", "hackeo"],
    sections: [
      {
        bullets: [
          "Cada vez que tu cuenta ingresa desde un navegador nuevo, te llega un correo con el dispositivo y la hora.",
          "En Seguridad ves los dispositivos con sesión iniciada y cuándo se usaron por última vez.",
          "«Cerrar sesión» en un dispositivo lo obliga a ingresar de nuevo. «Cerrar sesión en todos los dispositivos» cierra todas, incluida la tuya.",
        ],
      },
      {
        heading: "Si no reconoces un ingreso",
        paragraphs: ["Cierra esa sesión, cambia tu contraseña y activa la verificación en dos pasos."],
      },
    ],
    links: [{ href: "/mi-cuenta/seguridad#dispositivos", label: "Mis dispositivos" }],
  },
  {
    slug: "cambiar-correo-o-contrasena",
    topic: "cuenta",
    title: "Cambiar tu correo o tu contraseña",
    summary: "Los dos se cambian en Mi cuenta, Seguridad. El correo nuevo se confirma con un enlace.",
    keywords: ["cambiar correo", "email", "correo nuevo", "cambiar contraseña", "clave"],
    sections: [
      {
        bullets: [
          "Correo: escribe el nuevo en «Correo de acceso». Te enviamos un enlace para confirmarlo; hasta que lo abras sigues ingresando con el actual.",
          "Contraseña: en «Cambiar contraseña», con al menos 8 caracteres.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/seguridad#correo", label: "Seguridad" }],
  },
  {
    slug: "tus-datos-y-eliminar-cuenta",
    topic: "cuenta",
    title: "Descargar tus datos o eliminar tu cuenta",
    summary: "En Mi cuenta, Tus datos, descargas una copia de tu información o eliminas la cuenta en dos pasos.",
    keywords: ["eliminar cuenta", "borrar cuenta", "darme de baja", "datos personales", "descargar datos", "privacidad"],
    sections: [
      {
        bullets: [
          "«Descargar mis datos» guarda un archivo con tu perfil, publicaciones, favoritos, alertas, compras y ventas, reseñas y consultas.",
          "«Eliminar mi cuenta» pide tu contraseña y una confirmación. Tus publicaciones dejan de verse y borramos tus datos personales.",
          "Las compras y ventas confirmadas, y sus reseñas, quedan como «Cuenta eliminada», sin tu nombre.",
          "Una cuenta que administra una tienda se cierra con el equipo: escríbenos desde este Centro de ayuda.",
        ],
      },
    ],
    links: [{ href: "/mi-cuenta/datos", label: "Tus datos" }, { href: "/privacidad", label: "Política de privacidad" }],
  },
];

export function helpArticle(slug: string) {
  return HELP_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function helpTopic(id: string) {
  return HELP_TOPICS.find((topic) => topic.id === id) ?? null;
}

// Lowercase without accents, so "contrasena", "Contraseña" and "CONTRASEÑA" all match.
export function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type HelpSearchEntry = { slug: string; topic: HelpTopicId; title: string; summary: string; text: string; titleText: string; keywordText: string };

export function helpSearchIndex(): HelpSearchEntry[] {
  return HELP_ARTICLES.map((article) => ({
    slug: article.slug,
    topic: article.topic,
    title: article.title,
    summary: article.summary,
    titleText: foldText(article.title),
    keywordText: foldText(article.keywords.join(" ")),
    text: foldText([
      article.summary,
      ...article.sections.flatMap((section) => [section.heading ?? "", ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? [])]),
    ].join(" ")),
  }));
}

// Every word of the query must appear somewhere; a word in the title counts most, then the keywords, then the text.
export function searchHelp(index: HelpSearchEntry[], query: string, limit = 8) {
  const words = foldText(query).split(/[^a-z0-9ñ]+/).filter((word) => word.length > 1);
  if (!words.length) return [];
  return index
    .map((entry) => {
      let score = 0;
      for (const word of words) {
        const inTitle = entry.titleText.includes(word);
        const inKeywords = entry.keywordText.includes(word);
        const inText = entry.text.includes(word);
        if (!inTitle && !inKeywords && !inText) return null;
        score += (inTitle ? 3 : 0) + (inKeywords ? 2 : 0) + (inText ? 1 : 0);
      }
      return { entry, score };
    })
    .filter((result): result is { entry: HelpSearchEntry; score: number } => result !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((result) => result.entry);
}
