// disc-02: short Spanish buying guides and the try-out checklists for the meetup (docs/feature-ideas/discovery.md).
// Plain data, so the pages, the listing page's link and the tests share it. The text waits for a review by a musician
// before launch; every guide says what it is: advice to check an instrument, never a promise about one.

export type ChecklistItem = { id: string; label: string; hint?: string };
export type ChecklistGroup = { title: string; items: readonly ChecklistItem[] };
export type GuideSection = { heading: string; paragraphs: readonly string[] };

export type BuyingGuide = {
  slug: string;
  title: string;
  // One line for the guide list and the page's description.
  summary: string;
  kind: "elegir" | "revisar";
  sections: readonly GuideSection[];
  // The try-out checklist (kind "revisar"), grouped as the buyer tries the instrument.
  checklist?: readonly ChecklistGroup[];
  // Where the guide applies: a category, optionally narrowed to types. A listing of that kind links to it.
  appliesTo: { category: string; types?: readonly string[] };
};

const MEETUP: ChecklistGroup = {
  title: "Antes de pagar",
  items: [
    { id: "lugar", label: "Prueba en un lugar seguro y con luz", hint: "Una tienda de música o un centro comercial con cámaras y gente alrededor." },
    { id: "cable", label: "Lleva tu propio cable, audífonos o afinador", hint: "Así pruebas con algo que sabes que funciona." },
    { id: "serie", label: "Compara el número de serie con el de las fotos" },
    { id: "precio", label: "Confirma el precio y lo que incluye antes de pagar" },
    { id: "comprobante", label: "Pide un comprobante o, al menos, un mensaje con lo acordado" },
  ],
};

export const buyingGuides: readonly BuyingGuide[] = [
  {
    slug: "como-elegir-tu-primera-guitarra",
    title: "Cómo elegir tu primera guitarra",
    summary: "Clásica, acústica o eléctrica: cuál conviene para empezar, qué tamaño y cuánto gastar.",
    kind: "elegir",
    appliesTo: { category: "guitars" },
    sections: [
      {
        heading: "Clásica, acústica o eléctrica",
        paragraphs: [
          "La guitarra clásica o criolla usa cuerdas de nylon: son suaves para los dedos y sirven para el vals, la trova y casi todo lo que se aprende en una academia. Es la opción más común para empezar.",
          "La acústica usa cuerdas de metal: suena más brillante y fuerte, ideal para acompañar canciones, pero al inicio cansa más los dedos.",
          "La eléctrica necesita un amplificador. Sus cuerdas son delgadas y el mástil es cómodo; conviene si lo que quieres tocar es rock, pop o blues.",
        ],
      },
      {
        heading: "El tamaño correcto",
        paragraphs: [
          "Para niños de 6 a 8 años suele ir una guitarra 1/2; de 8 a 11 años, una 3/4; desde los 12, una de tamaño completo (4/4). Si puedes, que la persona la cargue y la abrace antes de decidir.",
        ],
      },
      {
        heading: "Lo que más importa en una guitarra para empezar",
        paragraphs: [
          "Que las cuerdas estén cerca del mástil (la acción baja) y que afine bien. Una guitarra difícil de tocar es la razón más común para dejar de practicar.",
          "Una guitarra usada de una buena marca suele tocar mejor que una nueva muy barata. Revisa la guía «Qué revisar en una guitarra o bajo usado» antes de ir a verla.",
        ],
      },
      {
        heading: "Lo que conviene sumar",
        paragraphs: [
          "Un afinador, una funda, cuerdas de repuesto y, si es eléctrica, un cable y un amplificador pequeño. Pregunta si la publicación ya los incluye.",
        ],
      },
    ],
  },
  {
    slug: "que-revisar-en-una-guitarra-usada",
    title: "Qué revisar en una guitarra o bajo usado",
    summary: "La lista para la prueba: mástil, trastes, alma, electrónica y lo que no se ve en las fotos.",
    kind: "revisar",
    appliesTo: { category: "guitars" },
    sections: [
      {
        heading: "Por qué probarla en persona",
        paragraphs: [
          "Muchos problemas de una guitarra o un bajo usado no se ven en una foto: un mástil torcido, un trasteo o un jack que corta el sonido. Llévate esta lista y márcala mientras pruebas; toma unos diez minutos.",
          "Si algo falla, no siempre es motivo para no comprar: una calibración o un cambio de jack es barato. Pero sí es algo para conversar sobre el precio.",
        ],
      },
    ],
    checklist: [
      {
        title: "Madera y mástil",
        items: [
          { id: "mastil-recto", label: "El mástil está recto", hint: "Mira a lo largo desde la pala hacia el cuerpo, como si apuntaras." },
          { id: "alma", label: "El alma (truss rod) tiene su tapa y no está forzada", hint: "Pregunta cuándo se calibró por última vez." },
          { id: "rajaduras", label: "No hay rajaduras en la tapa, los aros ni la unión del mástil" },
          { id: "puente", label: "El puente está bien pegado", hint: "En una acústica, intenta pasar una hoja de papel por debajo: no debería entrar." },
        ],
      },
      {
        title: "Al tocar",
        items: [
          { id: "trastes", label: "Los trastes no tienen surcos marcados", hint: "Sobre todo del 1 al 7, donde más se toca." },
          { id: "trasteo", label: "Ninguna cuerda trastea", hint: "Toca cada cuerda en varios trastes; un zumbido metálico es trasteo." },
          { id: "accion", label: "Las cuerdas no están demasiado altas en el traste 12" },
          { id: "afinacion", label: "Afina y se mantiene afinada", hint: "Compara la cuerda al aire con el traste 12: debería sonar la misma nota, una octava arriba." },
          { id: "clavijas", label: "Las clavijas giran suaves y sin juego" },
        ],
      },
      {
        title: "Electrónica (eléctricas, electroacústicas y bajos)",
        items: [
          { id: "jack", label: "El jack no hace ruido al mover el cable" },
          { id: "potes", label: "Las perillas no raspan al girarlas" },
          { id: "selector", label: "Cada posición del selector suena" },
          { id: "pastillas", label: "Cada pastilla suena parejo en todas las cuerdas" },
          { id: "bateria", label: "El compartimiento de la batería cierra y no tiene sulfato", hint: "En electroacústicas y bajos activos." },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "como-elegir-tu-primer-teclado",
    title: "Cómo elegir tu primer teclado",
    summary: "Teclado portátil, piano digital o controlador: cuántas teclas, sensibilidad y qué incluir.",
    kind: "elegir",
    appliesTo: { category: "keyboards" },
    sections: [
      {
        heading: "Para qué lo vas a usar",
        paragraphs: [
          "Un teclado portátil o arreglista trae ritmos y muchos sonidos: es divertido para empezar y para tocar en casa o en la iglesia.",
          "Un piano digital tiene 88 teclas contrapesadas que se sienten como un piano acústico. Conviene si quieres aprender piano en serio o vas a clases.",
          "Un controlador MIDI no suena solo: necesita una computadora. Es para producir música.",
        ],
      },
      {
        heading: "Teclas y sensibilidad",
        paragraphs: [
          "Con 61 teclas se puede aprender casi todo; 88 es el piano completo. Busca teclas sensibles al toque: suenan más fuerte cuanto más fuerte presionas, y eso cambia mucho la forma de aprender.",
        ],
      },
      {
        heading: "Lo que conviene sumar",
        paragraphs: [
          "La fuente original, un atril o soporte, un pedal de sustain y audífonos. Pregunta si la publicación los incluye: comprarlos aparte suma.",
        ],
      },
    ],
  },
  {
    slug: "que-revisar-en-un-teclado-usado",
    title: "Qué revisar en un teclado o piano digital usado",
    summary: "La lista para la prueba: cada tecla, los botones, las salidas y la fuente.",
    kind: "revisar",
    appliesTo: { category: "keyboards" },
    sections: [
      {
        heading: "Cómo probarlo",
        paragraphs: [
          "Toca todas las teclas, una por una, suave y fuerte. Una tecla que suena más bajo o se queda hundida es la falla más común en un teclado usado.",
        ],
      },
    ],
    checklist: [
      {
        title: "Teclas y sonido",
        items: [
          { id: "teclas", label: "Cada tecla suena", hint: "De la más grave a la más aguda." },
          { id: "sensibilidad", label: "Suave y fuerte suenan distinto en todas las teclas" },
          { id: "pegadas", label: "Ninguna tecla se queda hundida ni hace ruido al soltarla" },
          { id: "parlantes", label: "Los parlantes no vibran ni distorsionan a volumen alto" },
        ],
      },
      {
        title: "Controles y conexiones",
        items: [
          { id: "botones", label: "Los botones y perillas responden" },
          { id: "pantalla", label: "La pantalla se lee completa, sin líneas ni manchas" },
          { id: "audifonos", label: "La salida de audífonos suena en los dos lados" },
          { id: "pedal", label: "La entrada del pedal de sustain funciona" },
          { id: "usb", label: "El USB o MIDI conecta, si lo vas a usar", hint: "Lleva tu celular con un adaptador o una laptop." },
          { id: "fuente", label: "La fuente es la original o del voltaje correcto" },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "que-revisar-en-una-bateria-usada",
    title: "Qué revisar en una batería o platillos usados",
    summary: "La lista para la prueba: cascos, aros, herrajes, pedal, platillos y módulos electrónicos.",
    kind: "revisar",
    appliesTo: { category: "percussion", types: ["drums", "cymbals"] },
    sections: [
      {
        heading: "Cómo probarla",
        paragraphs: [
          "Una batería usada casi siempre necesita parches nuevos, y eso está bien. Lo que importa es que los cascos, los aros y los herrajes estén sanos: son lo caro de reemplazar.",
        ],
      },
    ],
    checklist: [
      {
        title: "Cascos y herrajes",
        items: [
          { id: "cascos", label: "Los cascos no tienen rajaduras ni capas despegadas", hint: "Mira por dentro con la linterna del celular." },
          { id: "aros", label: "Los aros están redondos", hint: "Apoya el tambor sin parche sobre el piso: no debería bailar." },
          { id: "tensores", label: "Los tensores giran y ninguna rosca está barrida" },
          { id: "atriles", label: "Patas, atriles y mariposas aprietan y no resbalan" },
          { id: "pedal", label: "El pedal del bombo vuelve parejo y no chirría" },
        ],
      },
      {
        title: "Platillos",
        items: [
          { id: "rajaduras", label: "Ningún platillo tiene rajaduras, ni siquiera pequeñas en el borde" },
          { id: "ojo", label: "El agujero del centro no está ovalado" },
        ],
      },
      {
        title: "Baterías electrónicas",
        items: [
          { id: "pads", label: "Cada pad responde suave y fuerte" },
          { id: "modulo", label: "El módulo enciende y cada entrada funciona" },
          { id: "cables", label: "El cableado y la fuente están completos" },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "que-revisar-en-un-amplificador-usado",
    title: "Qué revisar en un amplificador usado",
    summary: "La lista para la prueba: voltaje, canales, perillas, parlante, reverb y tubos.",
    kind: "revisar",
    appliesTo: { category: "amplifiers" },
    sections: [
      {
        heading: "Antes de enchufarlo",
        paragraphs: [
          "En Perú la corriente es de 220 V. Un amplificador traído de Estados Unidos puede ser de 110 V y necesitar un transformador: pregúntalo antes de enchufarlo.",
        ],
      },
    ],
    checklist: [
      {
        title: "Al encenderlo",
        items: [
          { id: "voltaje", label: "Es de 220 V o viene con su transformador" },
          { id: "zumbido", label: "No hace un zumbido fuerte sin nada conectado" },
          { id: "canales", label: "Cada canal suena", hint: "Limpio y distorsión, si tiene." },
          { id: "potes", label: "Las perillas no raspan ni cortan el sonido al girarlas" },
          { id: "jack", label: "El jack de entrada sujeta el cable firme" },
        ],
      },
      {
        title: "Parlante y efectos",
        items: [
          { id: "parlante", label: "El parlante no suena rasgado a volumen medio" },
          { id: "reverb", label: "La reverb funciona y no hace estruendo al mover el amplificador" },
          { id: "footswitch", label: "El footswitch, si viene, cambia de canal" },
          { id: "tubos", label: "Los tubos se encienden y no hacen ruido al golpear suave la caja", hint: "Solo en amplificadores de tubos." },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "que-revisar-en-un-pedal-usado",
    title: "Qué revisar en un pedal de efecto usado",
    summary: "La lista para la prueba: fuente, jacks, switch, ruido y perillas.",
    kind: "revisar",
    appliesTo: { category: "pedals" },
    sections: [
      {
        heading: "Cómo probarlo",
        paragraphs: [
          "Lleva tu guitarra, dos cables y, si puedes, tu propia fuente de 9 V. La mayoría de pedales usa centro negativo; una fuente equivocada puede dañarlo.",
        ],
      },
    ],
    checklist: [
      {
        title: "Al conectarlo",
        items: [
          { id: "fuente", label: "Enciende con la fuente correcta", hint: "Mira el voltaje y la polaridad junto a la entrada." },
          { id: "led", label: "El LED prende al activarlo" },
          { id: "jacks", label: "Los jacks de entrada y salida no hacen ruido al mover los cables" },
          { id: "switch", label: "El switch activa y desactiva siempre, sin saltos" },
          { id: "ruido", label: "Apagado, no le quita volumen ni brillo a tu sonido" },
          { id: "perillas", label: "Cada perilla cambia el sonido sin raspar" },
          { id: "bateria", label: "La tapa de la batería y los tornillos de la base están completos" },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "que-revisar-en-un-microfono-usado",
    title: "Qué revisar en un micrófono usado",
    summary: "La lista para la prueba: rejilla, cápsula, conector, ruido y alimentación phantom.",
    kind: "revisar",
    appliesTo: { category: "microphones" },
    sections: [
      {
        heading: "Cómo probarlo",
        paragraphs: [
          "Pruébalo con un cable y un parlante o una interfaz que conozcas. Un micrófono de condensador necesita alimentación phantom (48 V); uno dinámico no.",
          "Un micrófono muy barato de una marca conocida puede ser una imitación. Compara el número de serie, el logo y el peso con las fotos del fabricante.",
        ],
      },
    ],
    checklist: [
      {
        title: "Al probarlo",
        items: [
          { id: "rejilla", label: "La rejilla no está hundida ni oxidada" },
          { id: "sonido", label: "Suena claro, sin crujidos, al hablar cerca y lejos" },
          { id: "cable", label: "No hace ruido al mover el cable en el conector" },
          { id: "phantom", label: "Con phantom encendido funciona, si es de condensador" },
          { id: "usb", label: "Tu computadora o celular lo reconoce, si es USB" },
          { id: "pinza", label: "Incluye la pinza o el soporte que muestra la publicación" },
        ],
      },
      MEETUP,
    ],
  },
  {
    slug: "como-elegir-un-charango-o-una-quena",
    title: "Cómo elegir un charango, una quena o una zampoña",
    summary: "Madera, afinación y lo que revisar en un instrumento andino, hecho a mano o de tienda.",
    kind: "revisar",
    appliesTo: { category: "andean" },
    sections: [
      {
        heading: "El charango",
        paragraphs: [
          "El charango tiene diez cuerdas en cinco órdenes y se afina, en el temple más común, sol, do, mi, la, mi. Uno de caja tallada en una sola pieza de madera suele sonar mejor y durar más que uno de caja armada o laminada.",
          "Si lo hizo un luthier, pregunta quién, en qué ciudad y con qué madera. Muchos talleres firman o sellan sus instrumentos por dentro.",
        ],
      },
      {
        heading: "La quena y la zampoña",
        paragraphs: [
          "La quena se hace de caña, madera o, para empezar, de material sintético. La más común está en sol. Lo que más importa es el bisel, la escotadura donde soplas: debe estar limpio y parejo.",
          "Una zampoña o siku tiene dos filas de tubos, arca e ira. Revisa que ningún tubo esté rajado y que todos estén bien amarrados.",
        ],
      },
    ],
    checklist: [
      {
        title: "Charango, ronroco o bandurria",
        items: [
          { id: "caja", label: "La caja no tiene rajaduras ni partes despegadas" },
          { id: "mastil", label: "El mástil está recto y las cuerdas no trastean" },
          { id: "clavijas", label: "Las clavijas sostienen la afinación" },
          { id: "afina", label: "Afina parejo en los primeros trastes" },
        ],
      },
      {
        title: "Quena, zampoña o antara",
        items: [
          { id: "bisel", label: "El bisel de la quena está limpio y sin astillas" },
          { id: "notas", label: "Suenan todas las notas, de la más grave a la más aguda" },
          { id: "tubos", label: "Ningún tubo está rajado ni suelto" },
        ],
      },
      {
        title: "Tinya, bombo o wankara",
        items: [
          { id: "parche", label: "El parche no está roto ni demasiado flojo" },
          { id: "amarres", label: "Los amarres o tensores están completos" },
        ],
      },
      MEETUP,
    ],
  },
];

export const GUIDES_PATH = "/guias";

export function guidePath(slug: string) {
  return `${GUIDES_PATH}/${slug}`;
}

export function getBuyingGuide(slug: string) {
  return buyingGuides.find((guide) => guide.slug === slug) ?? null;
}

function applies(guide: BuyingGuide, category: string | null | undefined, instrumentType: string | null | undefined) {
  if (!category || guide.appliesTo.category !== category) return false;
  return !guide.appliesTo.types || (instrumentType ? guide.appliesTo.types.includes(instrumentType) : false);
}

// The guides a listing of this kind links to: the try-out checklist first, then the "cómo elegir" guide. Basses read
// the guitar checklist, which covers them.
export function guidesForListing(category: string | null | undefined, instrumentType: string | null | undefined): BuyingGuide[] {
  const lookup = category === "basses" ? "guitars" : category;
  return buyingGuides
    .filter((guide) => applies(guide, lookup, instrumentType) && !(category === "basses" && guide.kind === "elegir"))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "revisar" ? -1 : 1));
}

export function checklistItemCount(guide: BuyingGuide) {
  return (guide.checklist ?? []).reduce((total, group) => total + group.items.length, 0);
}
