#!/usr/bin/env python3
"""Synthetic SMOKE fixture for the catalog audit tooling. NOT the Laria catalog.

The production catalog (20,386 products) and its build pipeline live on branch `catalog/canonical-catalog`, which was not
reachable from the audit session. This fixture exists only to:
  1. execute the real catalog_lookup / catalog_match / catalog_jev_inputs (applied from supabase/migrations) end to end;
  2. prove the benchmark runner and integrity checks run, and that each check detects a SEEDED defect;
  3. probe function behaviour that does not depend on the real data (latency vs input length, injection text, empty input,
     manufacturer hints, decision/tier combinations).
Metrics measured on it say nothing about the real catalog's quality. Its aliases and vocabulary are the auditor's
approximation of the ETL's output (names, 'Brand Model', punctuation variants, a few abbreviations).

Writes fixture.sql (load into a database that has the catalog migrations applied):
    python3 build_fixture.py > /tmp/fixture.sql && psql "$DSN" -f /tmp/fixture.sql
"""
import os
import re
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "corpus"))
from identities import FAMILIES, IDENTITIES  # noqa: E402

NS = uuid.UUID("6f1d3c2a-0000-4000-8000-00000000a0d1")


def uid(*parts):
    return str(uuid.uuid5(NS, "|".join(parts)))


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return "array[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"


CATS = [  # id, parent, en, es, depth, laria_category, laria_type, terms_es
    ("instruments", None, "Instruments", "Instrumentos", 0, None, None, []),
    ("instruments.guitars", "instruments", "Guitars", "Guitarras", 1, "guitars", None, ["guitarra", "guitarras"]),
    ("instruments.guitars.electric", "instruments.guitars", "Electric guitars", "Guitarras eléctricas", 2, "guitars", "electric_guitar", ["guitarra electrica"]),
    ("instruments.guitars.acoustic", "instruments.guitars", "Acoustic guitars", "Guitarras acústicas", 2, "guitars", "acoustic_guitar", ["guitarra acustica", "guitarra clasica", "electroacustica"]),
    ("instruments.bass", "instruments", "Basses", "Bajos", 1, "basses", "bass", ["bajo", "bajo electrico", "bajos"]),
    ("instruments.drums", "instruments", "Drums", "Baterías", 1, "drums", "drums", ["bateria", "baterias"]),
    ("instruments.drums.electronic", "instruments.drums", "Electronic drums", "Baterías electrónicas", 2, "drums", "drums", ["bateria electronica"]),
    ("instruments.drums.cymbals", "instruments.drums", "Cymbals", "Platillos", 2, "cymbals", "cymbals", ["platillo", "platillos"]),
    ("pro_audio", None, "Pro audio", "Audio profesional", 0, None, None, []),
    ("pro_audio.microphones", "pro_audio", "Microphones", "Micrófonos", 1, "microphones", "microphones", ["microfono", "microfonos"]),
    ("effects", None, "Effects", "Efectos", 0, None, None, []),
    ("effects.pedals", "effects", "Pedals", "Pedales", 1, "pedals", "pedals", ["pedal", "pedales", "multiefectos", "afinador"]),
    ("amplification", None, "Amplification", "Amplificación", 0, None, None, []),
    ("amplification.guitar", "amplification", "Guitar amplifiers", "Amplificadores de guitarra", 1, "amplifiers", "amplifiers", ["amplificador", "amplificadores"]),
    ("amplification.bass", "amplification", "Bass amplifiers", "Amplificadores de bajo", 1, "amplifiers", "amplifiers", ["amplificador de bajo"]),
    ("studio", None, "Studio", "Estudio", 0, None, None, []),
    ("studio.audio_interfaces", "studio", "Audio interfaces", "Interfaces de audio", 1, "audio interfaces", "audio_interface", ["interfaz", "interfaz de audio", "tarjeta de sonido"]),
]

CAT_OF = {"guitars": "instruments.guitars.electric", "basses": "instruments.bass", "drums": "instruments.drums",
          "cymbals": "instruments.drums.cymbals", "microphones": "pro_audio.microphones", "pedals": "effects.pedals",
          "amplifiers": "amplification.guitar", "audio interfaces": "studio.audio_interfaces"}
GROUP_OF = {"instruments.guitars.electric": "electric_guitar", "instruments.guitars.acoustic": "acoustic_guitar",
            "instruments.bass": "bass", "instruments.drums": "drums", "instruments.drums.electronic": "drums",
            "instruments.drums.cymbals": "cymbals", "pro_audio.microphones": "microphones", "effects.pedals": "pedals",
            "amplification.guitar": "amplifiers", "amplification.bass": "amplifiers", "studio.audio_interfaces": "audio_interface"}
REQUIRED = {  # fixture's notion of required attributes = V1 listing keys minus unit-specific ones
    "electric_guitar": ["body_type", "shape", "strings", "bridge", "pickups"],
    "acoustic_guitar": ["acoustic_type", "strings_material"],
    "bass": ["strings", "bass_type", "pickups"],
    "drums": ["drum_type"],
    "cymbals": ["cymbal_type", "size"],
    "microphones": ["microphone_type", "polar_pattern", "connection"],
    "pedals": ["pedal_type", "format"],
    "amplifiers": ["amplifier_type", "technology", "power"],
    "audio_interface": ["inputs", "connection", "phantom_power"],
}
ES = {"solid_body": "Cuerpo sólido", "semi_hollow": "Semi-hollow", "strat": "Strat", "tele": "Tele", "les_paul": "Les Paul",
      "sg": "SG", "superstrat": "Superstrat", "tremolo": "Trémolo", "fixed": "Fijo", "floyd_rose": "Floyd Rose",
      "sss": "SSS", "hss": "HSS", "hh": "HH", "hsh": "HSH", "acoustic": "Acústica", "classical": "Clásica",
      "electro_acoustic": "Electroacústica", "dreadnought": "Dreadnought", "grand_auditorium": "Grand Auditorium",
      "steel": "Acero", "nylon": "Nylon", "yes": "Sí", "no": "No", "precision": "Precision", "jazz_bass": "Jazz Bass",
      "modern": "Moderno", "stingray": "StingRay", "p": "P", "j": "J", "pj": "PJ", "active": "Activas",
      "humbucker": "Humbucker", "long": "Larga", "electronic": "Electrónica", "complete": "Completa", "maple": "Arce",
      "birch": "Abedul", "poplar": "Álamo", "crash": "Crash", "ride": "Ride", "hi_hat": "Hi-hat", "b20": "B20",
      "b8": "B8", "brass": "Latón", "brilliant": "Brillante", "traditional": "Tradicional", "dynamic": "Dinámico",
      "condenser": "Condensador", "voice": "Voz", "instrument": "Instrumento", "podcast": "Podcast",
      "cardioid": "Cardioide", "supercardioid": "Supercardioide", "xlr": "XLR", "usb": "USB", "usb_c": "USB-C",
      "distortion": "Distorsión", "overdrive": "Overdrive", "delay": "Delay", "tuner": "Afinador", "chorus": "Chorus",
      "multi_fx": "Multiefectos", "fuzz": "Fuzz", "wah": "Wah", "compact": "Compacto", "multi_effect": "Multiefecto",
      "combo": "Combo", "tube": "Tubos", "solid_state": "Transistores", "guitar": "Guitarra", "bass": "Bajo"}

# distractors: real sibling products that make the near-variant cases meaningful
DISTRACTORS = [
    ("Boss", "DS-1W", "pedals", {"pedal_type": "distortion", "format": "compact"}),
    ("Boss", "DS-1X", "pedals", {"pedal_type": "distortion", "format": "compact"}),
    ("Boss", "BD-2W", "pedals", {"pedal_type": "overdrive", "format": "compact"}),
    ("Boss", "DD-200", "pedals", {"pedal_type": "delay"}),
    ("Boss", "Katana-50 Gen 3", "amplifiers", {"amplifier_type": "combo", "technology": "solid_state", "power": "50"}),
    ("Boss", "Katana-50", "amplifiers", {"amplifier_type": "combo", "technology": "solid_state", "power": "50"}),
    ("Shure", "SM58S", "microphones", {"microphone_type": "dynamic", "polar_pattern": "cardioid", "connection": "xlr"}),
    ("Shure", "SM7dB", "microphones", {"microphone_type": "dynamic", "polar_pattern": "cardioid", "connection": "xlr"}),
    ("Focusrite", "Scarlett 2i2 2nd Gen", "audio interfaces", {"inputs": "2", "connection": "usb", "phantom_power": "yes"}),
    ("Focusrite", "Scarlett Solo 4th Gen", "audio interfaces", {"inputs": "2", "connection": "usb_c", "phantom_power": "yes"}),
    ("Fender", "Player II Stratocaster", "guitars", {"body_type": "solid_body", "shape": "strat", "strings": "6", "bridge": "tremolo", "pickups": "sss"}),
    ("Squier", "Sonic Stratocaster", "guitars", {"body_type": "solid_body", "shape": "strat", "strings": "6"}),
    ("Gibson", "Les Paul Standard '60s", "guitars", {"body_type": "solid_body", "shape": "les_paul", "strings": "6", "bridge": "fixed", "pickups": "hh"}),
    ("Epiphone", "Les Paul Standard 60s", "guitars", {"body_type": "solid_body", "shape": "les_paul", "strings": "6", "bridge": "fixed", "pickups": "hh"}),
    ("Ibanez", "TS9DX Turbo Tube Screamer", "pedals", {"pedal_type": "overdrive", "format": "compact"}),
    ("Yamaha", "Pacifica PAC612VIIFM", "guitars", {"body_type": "solid_body", "shape": "strat", "strings": "6"}),
    ("Zildjian", "18\" A Custom Projection Crash", "cymbals", {"cymbal_type": "crash", "size": "18"}),
    ("Zildjian", "17\" A Custom Crash", "cymbals", {"cymbal_type": "crash", "size": "17"}),
    ("Zildjian", "18\" K Custom Fast Crash", "cymbals", {"cymbal_type": "crash", "size": "18"}),
    ("Sabian", "18\" AAX Dark Crash", "cymbals", {"cymbal_type": "crash", "size": "18"}),
    ("Roland", "TD-17KV", "drums", {"drum_type": "electronic"}),
    ("Roland", "TD-17K-L", "drums", {"drum_type": "electronic"}),
    ("Alesis", "Nitro Max Kit", "drums", {"drum_type": "electronic"}),
    ("Behringer", "UMC204HD", "audio interfaces", {"inputs": "2", "connection": "usb", "phantom_power": "yes"}),
    ("Vox", "AC15C2", "amplifiers", {"amplifier_type": "combo", "technology": "tube", "power": "15"}),
    ("Steinberg", "UR22mkII", "audio interfaces", {"inputs": "2", "connection": "usb", "phantom_power": "yes"}),
    ("Fender", "Blues Junior III", "amplifiers", {"amplifier_type": "combo", "technology": "tube", "power": "15"}),
    ("Electro-Harmonix", "Op-Amp Big Muff Pi", "pedals", {"pedal_type": "fuzz"}),
    ("Fender", "Champion II 50", "amplifiers", {"amplifier_type": "combo", "technology": "solid_state", "power": "50"}),
]

MFR_ALIASES = {"Electro-Harmonix": ["EHX", "Electro Harmonix"], "Audio-Technica": ["Audio Technica"],
               "RØDE": ["Rode"], "Ernie Ball Music Man": ["Music Man", "MusicMan"], "Line 6": ["Line6"],
               "Universal Audio": ["UA"], "ESP": ["LTD", "ESP LTD"], "PRS": ["Paul Reed Smith"],
               "ProCo": ["Pro Co"], "MXR": ["Dunlop MXR"]}
PARENT = {"Squier": "Fender", "Epiphone": "Gibson"}
ABBREV = [("Stratocaster", "Strat"), ("Telecaster", "Tele"), ("Precision Bass", "P Bass"), ("Jazz Bass", "J Bass"),
          ("Junior", "Jr"), ("Les Paul", "LP"), ("Classic Vibe", "CV"), ("American Professional", "Am Pro")]

NOISE = ["vendo", "usado", "usada", "nuevo", "nueva", "original", "perfecto", "estado", "cambio", "oferta", "remato",
         "negro", "negra", "blanco", "natural", "sunburst", "buttercream", "blonde", "cherry", "heritage", "miami", "blue",
         "mn", "rw", "japonesa", "mexicana", "usa", "china", "con", "funda", "cable", "fuente", "sin", "para", "principiante",
         "en", "de", "del", "y", "la", "el", "impecable", "llamar", "todo", "naranja", "mahogany", "oil", "arch", "top",
         "quilt", "maple", "valvular", "condensador", "transistores", "loop", "station", "multiefectos", "expresion",
         "shock", "mount", "pulgadas", "piezas", "cuerpos", "platillos", "cuerdas", "generacion", "gen", "ra", "ta", "era",
         "tone", "hecho", "mano", "generico", "pc", "plus"]
WARN = ["ii", "iii", "iv", "pro", "mini", "deluxe", "dlx", "xl", "jr", "mk2", "mk3", "custom", "special", "ltd", "w", "x"]
COPY = ["tipo", "estilo", "replica", "clon", "imitacion"]
SYN = [("cabezal", "head"), ("hihat", "hi hat")]


def main():
    out = ["-- SYNTHETIC SMOKE FIXTURE for docs/catalog-audit (not Laria data). Generated by build_fixture.py.",
           "begin;",
           "truncate catalog_product_attributes, catalog_product_variants, catalog_product_aliases, catalog_review_candidates,"
           " catalog_products, catalog_product_families, catalog_manufacturer_aliases, catalog_manufacturers,"
           " catalog_lookup_terms, catalog_categories cascade;"]
    for cid, parent, en, es, depth, lc, lt, terms in CATS:
        out.append(f"insert into catalog_categories (id, parent_id, label_en, label_es, depth, laria_category, laria_instrument_type, terms_es) "
                   f"values ({q(cid)}, {q(parent)}, {q(en)}, {q(es)}, {depth}, {q(lc)}, {q(lt)}, {q(terms)});")
    mfrs = sorted({r[2] for r in IDENTITIES} | {r[2] for r in FAMILIES} | {d[0] for d in DISTRACTORS} | {"Dunlop"})
    for name in mfrs:
        out.append(f"insert into catalog_manufacturers (id, slug, canonical_name, normalized_name, is_curated) values "
                   f"({q(uid('m', name))}, {q(re.sub('[^a-z0-9]+', '-', name.lower()))}, {q(name)}, catalog_normalize({q(name)}), true);")
        for al in [name] + MFR_ALIASES.get(name, []):
            out.append(f"insert into catalog_manufacturer_aliases (manufacturer_id, alias, alias_key) values "
                       f"({q(uid('m', name))}, {q(al)}, catalog_compact({q(al)})) on conflict do nothing;")
    for child, parent in PARENT.items():
        out.append(f"update catalog_manufacturers set parent_id = {q(uid('m', parent))} where id = {q(uid('m', child))};")

    products = []  # (pid, mfr, model, cat_id, level, family_pid, status, attrs, vattrs)
    fam_pid = {}
    for key, cat, mfr, name, _keys in FAMILIES:
        pid = uid("p", mfr, name)
        fam_pid[key] = pid
        products.append((pid, mfr, name, CAT_OF[cat], "family", None, "current", {}, []))
    for key, cat, mfr, model, _keys, fam, status, attrs, vattrs in IDENTITIES:
        cid = CAT_OF[cat]
        if key.startswith("ac-"):
            cid = "instruments.guitars.acoustic"
        if key in ("drm-roland-td07kv", "drm-roland-td17kvx", "drm-alesis-nitro-mesh"):
            cid = "instruments.drums.electronic"
        if key in ("amp-fender-rumble40", "amp-ampeg-ba110"):
            cid = "amplification.bass"
        products.append((uid("p", mfr, model), mfr, model, cid, "model", fam_pid.get(fam), status, attrs, vattrs))
    for mfr, model, cat, attrs in DISTRACTORS:
        products.append((uid("p", mfr, model), mfr, model, CAT_OF[cat], "model", None, "current", attrs, []))

    for pid, mfr, model, cid, level, fpid, status, attrs, vattrs in products:
        group = GROUP_OF.get(cid)
        req = REQUIRED.get(group, [])
        missing = [a for a in req if a not in attrs] if level == "model" else []
        detail = "out_of_scope" if not req else ("none" if level == "family" else ("detailed" if not missing else "partial"))
        code = model if re.search(r"[0-9]", model) and len(model.split()) == 1 else None
        out.append(
            "insert into catalog_products (id, manufacturer_id, canonical_model_name, normalized_model_name, model_key, model_code,"
            " model_code_key, category_id, identity_domain, active_status, confidence, verification_status, entity_level,"
            " family_product_id, category_confidence, quality_status, publish_ready, detail_group, detail_status,"
            " missing_attributes, variant_attributes) values ("
            f"{q(pid)}, {q(uid('m', mfr))}, {q(model)}, catalog_normalize({q(model)}), catalog_compact({q(model)}), {q(code)},"
            f" {('catalog_compact(' + q(code) + ')') if code else 'null'}, {q(cid)}, {q(cid.split('.')[1] if '.' in cid else cid)},"
            f" {q(status)}, 0.95, 'VERIFIED', {q(level)}, {q(fpid)}, 'strong', 'ok', {q(level == 'model')}, {q(group)},"
            f" {q(detail)}, {q(missing)}, {q(vattrs)});")
        aliases = [(model, "official_alias"), (f"{mfr} {model}", "manufacturer_prefixed")]
        if "-" in model:
            aliases.append((model.replace("-", ""), "punctuation_variant"))
        for long, short in ABBREV:
            if long in model:
                aliases.append((model.replace(long, short), "abbreviation"))
                aliases.append((f"{mfr} {model.replace(long, short)}", "manufacturer_prefixed"))
        for al, t in aliases:
            out.append("insert into catalog_product_aliases (id, product_id, alias, normalized_alias, alias_key, alias_type, confidence) values "
                       f"({q(uid('a', pid, al))}, {q(pid)}, {q(al)}, catalog_normalize({q(al)}), catalog_compact({q(al)}), {q(t)}::catalog_alias_type, 0.9)"
                       " on conflict (id) do nothing;")
        for k, v in attrs.items():
            num = v if re.fullmatch(r"[0-9]+", v) else None
            out.append("insert into catalog_product_attributes (id, product_id, attribute_key, value, value_num, provenance, sources, weight, trusted, value_es) values "
                       f"({q(uid('at', pid, k))}, {q(pid)}, {q(k)}, {q(v)}, {num or 'null'}, 'spec', array['fixture'], 0.8, true, {q(ES.get(v, v))});")
    # every multi-product alias is ambiguous (the ETL's rule), then the seeded defects below
    out.append("update catalog_product_aliases a set is_ambiguous = true where alias_key in "
               "(select alias_key from catalog_product_aliases group by alias_key having count(distinct product_id) > 1);")
    for t in NOISE:
        out.append(f"insert into catalog_lookup_terms (term, kind) values ({q(t)}, 'noise') on conflict do nothing;")
    for t in WARN:
        out.append(f"insert into catalog_lookup_terms (term, kind) values ({q(t)}, 'warn') on conflict do nothing;")
    for t in COPY:
        out.append(f"insert into catalog_lookup_terms (term, kind) values ({q(t)}, 'copy') on conflict do nothing;")
    for t, tgt in SYN:
        out.append(f"insert into catalog_lookup_terms (term, kind, target) values ({q(t)}, 'synonym', {q(tgt)}) on conflict do nothing;")
    # one variant with SKU, so the sku path runs
    out.append(f"insert into catalog_product_variants (id, product_id, variant_name, sku, sku_key, color) values "
               f"({q(uid('v', 'bd2'))}, {q(uid('p', 'Boss', 'BD-2'))}, 'BD-2 Blues Driver', 'BD-2', catalog_compact('BD-2'), 'Azul');")

    # ---------------------------------------------------------------- SEEDED DEFECTS (each must be detected by a check)
    out.append("-- seeded defects: see fixture/README.md")
    # D1 alias_ambiguity_flag_wrong: a shared alias left unflagged
    out.append(f"insert into catalog_product_aliases (id, product_id, alias, normalized_alias, alias_key, alias_type, is_ambiguous) values "
               f"({q(uid('d1a'))}, {q(uid('p', 'Boss', 'DD-3'))}, 'Digital Delay', 'digital delay', 'digitaldelay', 'seller_common_name', false),"
               f"({q(uid('d1b'))}, {q(uid('p', 'Boss', 'DD-7'))}, 'Digital Delay', 'digital delay', 'digitaldelay', 'seller_common_name', false);")
    # D2 family_detailed: a family entity marked detailed and publish_ready
    out.append(f"update catalog_products set detail_status = 'detailed', publish_ready = true where id = {q(fam_pid['fam-boss-katana'])};")
    # D3 attr_trusted_with_conflict
    out.append(f"update catalog_product_attributes set conflict_values = array['8'] where product_id = {q(uid('p', 'Shure', 'SM58'))} and attribute_key = 'polar_pattern';")
    # D4 norm_noise_in_model + duplicate: a store-title product duplicating Player Telecaster
    dup = uid("p", "Fender", "Player Telecaster Black")
    out.append("insert into catalog_products (id, manufacturer_id, canonical_model_name, normalized_model_name, model_key, category_id,"
               " identity_domain, confidence, verification_status, entity_level, detail_group, detail_status) values "
               f"({q(dup)}, {q(uid('m', 'Fender'))}, 'Player Telecaster Black', 'player telecaster black', 'playertelecasterblack',"
               " 'instruments.guitars.electric', 'guitars', 0.6, 'UNVERIFIED', 'model', 'electric_guitar', 'partial');")
    # D5 variant_attr_also_product_level: handedness listed as variant attribute and stored
    out.append(f"insert into catalog_product_attributes (id, product_id, attribute_key, value, provenance, weight, trusted, value_es) values "
               f"({q(uid('d5'))}, {q(uid('p', 'Fender', 'Player Stratocaster'))}, 'handedness', 'right_handed', 'default', 0.5, false, 'Diestro');")
    # D6 attr_value_es_missing: no Spanish value / code as Spanish value
    out.append(f"update catalog_product_attributes set value_es = null where product_id = {q(uid('p', 'Yamaha', 'F310'))} and attribute_key = 'body_shape';")
    out.append(f"update catalog_product_attributes set value_es = 'solid_state' where product_id = {q(uid('p', 'Orange', 'Crush 20RT'))} and attribute_key = 'technology';")
    # D7 mfr_alias_collision: 'UA' also registered for another maker
    out.append(f"insert into catalog_manufacturer_aliases (manufacturer_id, alias, alias_key) values ({q(uid('m', 'Alesis'))}, 'UA', 'ua');")
    # D8 category_name_contradiction: a bass named product in the guitar category
    out.append(f"update catalog_products set category_id = 'instruments.guitars.electric' where id = {q(uid('p', 'Squier', 'Affinity Series Jazz Bass'))};")
    out.append("refresh materialized view catalog_category_terms;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
