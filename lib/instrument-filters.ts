export type InstrumentFilterType = "select" | "multiselect" | "boolean" | "number";

export type InstrumentFilterOption = {
  value: string;
  label: string;
};

export type InstrumentFilterConfig = {
  key: string;
  label: string;
  type: InstrumentFilterType;
  options?: readonly InstrumentFilterOption[];
};

export type InstrumentFilterGroup = {
  instrumentType: string;
  label: string;
  filters: readonly InstrumentFilterConfig[];
};

const yesNoOptions = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
] as const;

const handednessOptions = [
  { value: "right_handed", label: "Diestro" },
  { value: "left_handed", label: "Zurdo" },
] as const;

export const coreInstrumentFilters = [
  {
    key: "condition",
    label: "Condición",
    type: "select",
  },
  {
    key: "brand",
    label: "Marca",
    type: "select",
  },
  {
    key: "price_pen",
    label: "Precio",
    type: "number",
  },
  {
    key: "location",
    label: "Ubicación",
    type: "select",
  },
] as const satisfies readonly InstrumentFilterConfig[];

export const instrumentFilterGroups = [
  {
    instrumentType: "electric_guitar",
    label: "Guitarras eléctricas",
    filters: [
      {
        key: "body_type",
        label: "Tipo de cuerpo",
        type: "select",
        options: [
          { value: "solid_body", label: "Solid body" },
          { value: "semi_hollow", label: "Semi-hollow" },
          { value: "hollow_body", label: "Hollow body" },
        ],
      },
      {
        key: "shape",
        label: "Forma",
        type: "select",
        options: [
          { value: "strat", label: "Strat" },
          { value: "tele", label: "Tele" },
          { value: "les_paul", label: "Les Paul" },
          { value: "sg", label: "SG" },
          { value: "offset", label: "Offset" },
          { value: "superstrat", label: "Superstrat" },
          { value: "explorer", label: "Explorer" },
          { value: "flying_v", label: "Flying V" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "strings",
        label: "Número de cuerdas",
        type: "select",
        options: [
          { value: "6", label: "6" },
          { value: "7", label: "7" },
          { value: "8", label: "8" },
          { value: "12", label: "12" },
        ],
      },
      {
        key: "bridge",
        label: "Puente",
        type: "select",
        options: [
          { value: "fixed", label: "Fijo" },
          { value: "tremolo", label: "Trémolo" },
          { value: "floyd_rose", label: "Floyd Rose" },
          { value: "bigsby", label: "Bigsby" },
        ],
      },
      {
        key: "pickups",
        label: "Pastillas",
        type: "multiselect",
        options: [
          { value: "single_coil", label: "Single coil" },
          { value: "humbucker", label: "Humbucker" },
          { value: "p90", label: "P90" },
          { value: "hss", label: "HSS" },
          { value: "sss", label: "SSS" },
          { value: "hh", label: "HH" },
          { value: "hsh", label: "HSH" },
        ],
      },
      {
        key: "handedness",
        label: "Mano",
        type: "select",
        options: handednessOptions,
      },
      {
        key: "frets",
        label: "Trastes",
        type: "select",
        options: [
          { value: "21", label: "21" },
          { value: "22", label: "22" },
          { value: "24", label: "24" },
        ],
      },
    ],
  },
  {
    instrumentType: "bass",
    label: "Bajos",
    filters: [
      {
        key: "strings",
        label: "Número de cuerdas",
        type: "select",
        options: [
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
        ],
      },
      {
        key: "bass_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "jazz_bass", label: "Jazz Bass" },
          { value: "precision", label: "Precision" },
          { value: "stingray", label: "StingRay" },
          { value: "modern", label: "Moderno" },
          { value: "hollow", label: "Hollow" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "pickups",
        label: "Pastillas",
        type: "multiselect",
        options: [
          { value: "j", label: "J" },
          { value: "p", label: "P" },
          { value: "pj", label: "PJ" },
          { value: "humbucker", label: "Humbucker" },
          { value: "active", label: "Activas" },
          { value: "passive", label: "Pasivas" },
        ],
      },
      {
        key: "scale_length",
        label: "Escala",
        type: "select",
        options: [
          { value: "short", label: "Corta" },
          { value: "medium", label: "Media" },
          { value: "long", label: "Larga" },
        ],
      },
      {
        key: "handedness",
        label: "Mano",
        type: "select",
        options: handednessOptions,
      },
    ],
  },
  {
    instrumentType: "acoustic_guitar",
    label: "Guitarras acústicas",
    filters: [
      {
        key: "acoustic_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "classical", label: "Clásica" },
          { value: "acoustic", label: "Acústica" },
          { value: "electro_acoustic", label: "Electroacústica" },
        ],
      },
      {
        key: "body_shape",
        label: "Cuerpo",
        type: "select",
        options: [
          { value: "dreadnought", label: "Dreadnought" },
          { value: "jumbo", label: "Jumbo" },
          { value: "concert", label: "Concert" },
          { value: "parlor", label: "Parlor" },
          { value: "grand_auditorium", label: "Grand Auditorium" },
          { value: "cutaway", label: "Cutaway" },
        ],
      },
      {
        key: "strings_material",
        label: "Cuerdas",
        type: "select",
        options: [
          { value: "nylon", label: "Nylon" },
          { value: "steel", label: "Acero" },
        ],
      },
      {
        key: "handedness",
        label: "Mano",
        type: "select",
        options: handednessOptions,
      },
      {
        key: "has_preamp",
        label: "Incluye preamp",
        type: "boolean",
        options: yesNoOptions,
      },
    ],
  },
  {
    instrumentType: "drums",
    label: "Baterías",
    filters: [
      {
        key: "drum_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "acoustic", label: "Acústica" },
          { value: "electronic", label: "Electrónica" },
        ],
      },
      {
        key: "configuration",
        label: "Configuración",
        type: "select",
        options: [
          { value: "shell_pack", label: "Shell pack" },
          { value: "complete", label: "Completa" },
          { value: "shells_only", label: "Solo cuerpos" },
        ],
      },
      {
        key: "pieces",
        label: "Número de piezas",
        type: "select",
        options: [
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
          { value: "7_plus", label: "7+" },
        ],
      },
      {
        key: "material",
        label: "Material",
        type: "select",
        options: [
          { value: "maple", label: "Maple" },
          { value: "birch", label: "Birch" },
          { value: "poplar", label: "Poplar" },
          { value: "mahogany", label: "Mahogany" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "includes_hardware",
        label: "Incluye hardware",
        type: "boolean",
        options: yesNoOptions,
      },
      {
        key: "includes_cymbals",
        label: "Incluye platillos",
        type: "boolean",
        options: yesNoOptions,
      },
      {
        key: "kick_size",
        label: "Medida de bombo",
        type: "select",
        options: [
          { value: "18", label: "18" },
          { value: "20", label: "20" },
          { value: "22", label: "22" },
          { value: "24", label: "24" },
        ],
      },
    ],
  },
  {
    instrumentType: "cymbals",
    label: "Platillos",
    filters: [
      {
        key: "cymbal_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "hi_hat", label: "Hi-hat" },
          { value: "crash", label: "Crash" },
          { value: "ride", label: "Ride" },
          { value: "china", label: "China" },
          { value: "splash", label: "Splash" },
          { value: "stack", label: "Stack" },
        ],
      },
      {
        key: "size",
        label: "Medida",
        type: "select",
        options: [
          { value: "8", label: "8" },
          { value: "10", label: "10" },
          { value: "12", label: "12" },
          { value: "14", label: "14" },
          { value: "16", label: "16" },
          { value: "18", label: "18" },
          { value: "20", label: "20" },
          { value: "22", label: "22" },
        ],
      },
      {
        key: "alloy",
        label: "Aleación",
        type: "select",
        options: [
          { value: "b20", label: "B20" },
          { value: "b12", label: "B12" },
          { value: "b8", label: "B8" },
          { value: "brass", label: "Brass" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "finish",
        label: "Acabado",
        type: "select",
        options: [
          { value: "traditional", label: "Traditional" },
          { value: "brilliant", label: "Brilliant" },
          { value: "dry", label: "Dry" },
          { value: "dark", label: "Dark" },
        ],
      },
    ],
  },
  {
    instrumentType: "microphones",
    label: "Micrófonos",
    filters: [
      {
        key: "microphone_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "dynamic", label: "Dinámico" },
          { value: "condenser", label: "Condensador" },
          { value: "ribbon", label: "Ribbon" },
          { value: "lavalier", label: "Lavalier" },
          { value: "shotgun", label: "Shotgun" },
        ],
      },
      {
        key: "use_case",
        label: "Uso",
        type: "multiselect",
        options: [
          { value: "voice", label: "Voz" },
          { value: "instrument", label: "Instrumento" },
          { value: "drums", label: "Batería" },
          { value: "podcast", label: "Podcast" },
          { value: "camera", label: "Cámara" },
        ],
      },
      {
        key: "polar_pattern",
        label: "Patrón polar",
        type: "select",
        options: [
          { value: "cardioid", label: "Cardioide" },
          { value: "supercardioid", label: "Supercardioide" },
          { value: "omnidirectional", label: "Omnidireccional" },
          { value: "figure_8", label: "Figura 8" },
        ],
      },
      {
        key: "connection",
        label: "Conexión",
        type: "select",
        options: [
          { value: "xlr", label: "XLR" },
          { value: "usb", label: "USB" },
          { value: "3_5mm", label: "3.5mm" },
        ],
      },
    ],
  },
  {
    instrumentType: "audio_interface",
    label: "Interfaces / audio",
    filters: [
      {
        key: "inputs",
        label: "Entradas",
        type: "select",
        options: [
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "4", label: "4" },
          { value: "8_plus", label: "8+" },
        ],
      },
      {
        key: "connection",
        label: "Conexión",
        type: "select",
        options: [
          { value: "usb", label: "USB" },
          { value: "usb_c", label: "USB-C" },
          { value: "thunderbolt", label: "Thunderbolt" },
        ],
      },
      {
        key: "phantom_power",
        label: "Phantom power",
        type: "boolean",
        options: yesNoOptions,
      },
      {
        key: "midi",
        label: "MIDI",
        type: "boolean",
        options: yesNoOptions,
      },
    ],
  },
  {
    instrumentType: "pedals",
    label: "Pedales",
    filters: [
      {
        key: "pedal_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "overdrive", label: "Overdrive" },
          { value: "distortion", label: "Distortion" },
          { value: "fuzz", label: "Fuzz" },
          { value: "delay", label: "Delay" },
          { value: "reverb", label: "Reverb" },
          { value: "chorus", label: "Chorus" },
          { value: "wah", label: "Wah" },
          { value: "compressor", label: "Compressor" },
          { value: "tuner", label: "Tuner" },
          { value: "multi_fx", label: "Multi-FX" },
        ],
      },
      {
        key: "format",
        label: "Formato",
        type: "select",
        options: [
          { value: "compact", label: "Compacto" },
          { value: "double", label: "Doble" },
          { value: "multi_effect", label: "Multiefecto" },
        ],
      },
      {
        key: "true_bypass",
        label: "True bypass",
        type: "boolean",
        options: yesNoOptions,
      },
    ],
  },
  {
    instrumentType: "amplifiers",
    label: "Amplificadores",
    filters: [
      {
        key: "amplifier_type",
        label: "Tipo",
        type: "select",
        options: [
          { value: "combo", label: "Combo" },
          { value: "head", label: "Cabezal" },
          { value: "cabinet", label: "Cabinet" },
        ],
      },
      {
        key: "technology",
        label: "Tecnología",
        type: "select",
        options: [
          { value: "tube", label: "Tubos" },
          { value: "solid_state", label: "Transistores" },
          { value: "modeling", label: "Modelado" },
          { value: "hybrid", label: "Híbrido" },
        ],
      },
      {
        key: "power",
        label: "Potencia",
        type: "select",
        options: [
          { value: "1_15w", label: "1–15W" },
          { value: "16_50w", label: "16–50W" },
          { value: "51_100w", label: "51–100W" },
          { value: "100w_plus", label: "100W+" },
        ],
      },
      {
        key: "use_case",
        label: "Uso",
        type: "select",
        options: [
          { value: "guitar", label: "Guitarra" },
          { value: "bass", label: "Bajo" },
          { value: "keyboard", label: "Teclado" },
        ],
      },
    ],
  },
] as const satisfies readonly InstrumentFilterGroup[];

export function getInstrumentFilterGroup(instrumentType: string) {
  return (
    instrumentFilterGroups.find(
      (group) => group.instrumentType === instrumentType,
    ) ?? null
  );
}
