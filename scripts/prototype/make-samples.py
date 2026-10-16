#!/usr/bin/env python3
"""Sample bulk-upload files for reviewing the Store Operations prototype (synthetic data, no real merchant).

    python3 scripts/prototype/make-samples.py [out-dir]     # default scripts/prototype/samples

Needs Pillow and openpyxl. Writes four scenarios for the demo store "Laria Demo Música" (scripts/prototype/demo-seed.sql):
  01  a clean new-stock catalog (XLSX) with two or three photos per SKU, as loose files and as a ZIP
  02  a messy point-of-sale export (CSV) with photos named by a Foto(s) column, a photo list, and photos that fail checks
  03  a stock count and price update (XLSX) for the 12 SKUs the demo seed creates
  04  a 2,000-row file is made by make-bench-import.mjs (see README)
"""
import csv
import io
import os
import random
import sys
import zipfile

from openpyxl import Workbook
from openpyxl.styles import Font
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "samples")
random.seed(2026)

FONT = None
for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"):
    if os.path.exists(path):
        FONT = path
        break


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


PALETTE = {
    "Pedales": (232, 120, 32), "Guitarras": (150, 62, 40), "Bajos": (40, 70, 120), "Amplificadores": (40, 40, 44),
    "Micrófonos": (110, 110, 118), "Audio": (30, 90, 80), "Percusión": (170, 140, 80), "Teclados y pianos": (60, 60, 70),
    "Cuerdas": (180, 150, 60), "Vientos": (190, 160, 70),
}


def photo(path, title, n, category, size=(1200, 900), fmt="JPEG"):
    """A plain product-card picture: a coloured object on a light ground, with the product name and photo number."""
    w, h = size
    img = Image.new("RGB", size, (236, 233, 226))
    d = ImageDraw.Draw(img)
    color = PALETTE.get(category, (90, 90, 90))
    # A different framing per photo number, so photos of one SKU are visibly different.
    if n == 1:
        d.rounded_rectangle((w * .30, h * .22, w * .70, h * .78), radius=int(w * .03), fill=color)
    elif n == 2:
        d.rounded_rectangle((w * .18, h * .36, w * .82, h * .66), radius=int(w * .02), fill=color)
    else:
        d.ellipse((w * .32, h * .25, w * .68, h * .75), fill=color)
    d.text((w * .05, h * .05), title, font=font(int(h * .055)), fill=(40, 40, 40))
    d.text((w * .05, h * .88), f"foto {n}", font=font(int(h * .04)), fill=(90, 90, 90))
    img.save(path, fmt, quality=78) if fmt == "JPEG" else img.save(path, fmt)


def xlsx(path, headers, rows, title=None):
    wb = Workbook()
    ws = wb.active
    ws.title = "Productos"
    if title:
        ws.append([title])
        ws["A1"].font = Font(bold=True, size=14)
    ws.append(headers)
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append(row)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    wb.save(path)


# --------------------------------------------------------------------------------------- 01 clean new-stock catalog
CATALOG = [
    # sku, name, brand, model, category, type, variant, price, qty, description
    ("BOSS-BD2", "Boss BD-2 Blues Driver", "Boss", "BD-2", "Pedales", "Pedales", "", 449, 6, "Overdrive de respuesta dinámica, el clásico del blues. Nuevo en caja, garantía de la tienda por un año."),
    ("BOSS-DD8", "Boss DD-8 Digital Delay", "Boss", "DD-8", "Pedales", "Pedales", "", 799, 4, "Delay digital con once modos, looper de 40 segundos y salida estéreo. Nuevo, sellado."),
    ("ELH-BIGMUFF", "Electro-Harmonix Big Muff Pi", "Electro-Harmonix", "Big Muff Pi", "Pedales", "Pedales", "", 429, 5, "Fuzz de sustain largo, versión reeditada. Nuevo en caja con fuente de 9 V incluida."),
    ("MXR-M300", "MXR M300 Reverb", "MXR", "M300", "Pedales", "Pedales", "", 899, 2, "Reverb con seis algoritmos, true bypass o trails seleccionable. Nuevo, garantía de un año."),
    ("FEN-PLTELE-BTB", "Fender Player Telecaster", "Fender", "Player Telecaster", "Guitarras", "Guitarras eléctricas", "Butterscotch Blonde", 4199, 2, "Telecaster de cuerpo de aliso y mástil de arce, pastillas Player Series. Nueva, con funda."),
    ("SQR-CVSTRAT-SB", "Squier Classic Vibe 60s Stratocaster", "Squier", "Classic Vibe 60s Stratocaster", "Guitarras", "Guitarras eléctricas", "3-Color Sunburst", 2299, 3, "Stratocaster inspirada en los años sesenta, pastillas Alnico. Nueva, regulada en la tienda."),
    ("YAM-PAC112V-BL", "Yamaha Pacifica 112V", "Yamaha", "Pacifica 112V", "Guitarras", "Guitarras eléctricas", "Old Violin Sunburst", 1399, 5, "Guitarra eléctrica versátil para empezar o tocar en vivo, configuración HSS. Nueva en caja."),
    ("YAM-F310", "Yamaha F310", "Yamaha", "F310", "Guitarras", "Guitarras acústicas", "Natural", 649, 8, "Guitarra acústica dreadnought con tapa de abeto, ideal para principiantes. Nueva, con garantía."),
    ("TAK-GD11M", "Takamine GD11M", "Takamine", "GD11M", "Guitarras", "Guitarras acústicas", "Natural satinado", 1149, 3, "Acústica con tapa de caoba y acabado satinado, sonido cálido. Nueva, incluye funda."),
    ("FEN-JB-PLAYER", "Fender Player Jazz Bass", "Fender", "Player Jazz Bass", "Bajos", "Bajos", "Polar White", 4399, 1, "Bajo Jazz Bass de cuatro cuerdas, cuerpo de aliso, pastillas Player Series. Nuevo con funda."),
    ("IBZ-SR300E", "Ibanez SR300E", "Ibanez", "SR300E", "Bajos", "Bajos", "Iron Pewter", 1899, 2, "Bajo activo de cuatro cuerdas con ecualizador de tres bandas y mástil delgado. Nuevo."),
    ("BOSS-KTN50", "Boss Katana 50 MkII", "Boss", "Katana-50 MkII", "Amplificadores", "Amplificadores", "", 1599, 3, "Amplificador de 50 W con cinco tipos de amplificador y efectos integrados. Nuevo en caja."),
    ("FEN-CHAMP20", "Fender Champion 20", "Fender", "Champion 20", "Amplificadores", "Amplificadores", "", 599, 4, "Amplificador de práctica de 20 W con voces y efectos de Fender. Nuevo con garantía."),
    ("ORG-CRUSH20", "Orange Crush 20", "Orange", "Crush 20", "Amplificadores", "Amplificadores", "", 749, 2, "Combo de 20 W con canal limpio y distorsión, afinador incorporado. Nuevo en caja."),
    ("SHU-SM57", "Shure SM57", "Shure", "SM57", "Micrófonos", "Micrófonos", "", 529, 10, "Micrófono dinámico para instrumentos y voz, estándar de escenario. Nuevo, con pinza."),
    ("AT-2020", "Audio-Technica AT2020", "Audio-Technica", "AT2020", "Micrófonos", "Micrófonos", "", 489, 4, "Micrófono de condensador cardioide para estudio en casa. Nuevo, con soporte de rosca."),
    ("RODE-NT1", "Rode NT1 5th Gen", "Rode", "NT1 5th Gen", "Micrófonos", "Micrófonos", "", 1299, 2, "Condensador de estudio con salida XLR y USB, muy bajo ruido. Nuevo, sellado."),
    ("FOC-SOLO-G4", "Focusrite Scarlett Solo", "Focusrite", "Scarlett Solo", "Audio", "Interfaces de audio", "4ta generación", 549, 6, "Interfaz de audio USB-C de una entrada de micrófono y una de instrumento. Nueva."),
    ("BEH-UMC204", "Behringer UMC204HD", "Behringer", "UMC204HD", "Audio", "Interfaces de audio", "", 399, 5, "Interfaz de audio USB con dos entradas combo y preamplificadores Midas. Nueva en caja."),
    ("YAM-P45", "Yamaha P-45", "Yamaha", "P-45", "Teclados y pianos", "Teclados y pianos", "Negro", 2199, 2, "Piano digital de 88 teclas contrapesadas, ideal para estudio. Nuevo, incluye pedal sostenido."),
    ("CAS-CTS300", "Casio CT-S300", "Casio", "CT-S300", "Teclados y pianos", "Teclados y pianos", "", 799, 3, "Teclado de 61 teclas sensibles al tacto con 400 tonos y ritmos. Nuevo, con adaptador."),
    ("ZIL-PLANETZ", "Zildjian Planet Z Pack", "Zildjian", "Planet Z", "Percusión", "Platillos", "", 999, 2, "Set de platillos hi-hat 14, crash 16 y ride 20 para empezar. Nuevo en caja."),
    ("LP-BONGO-CITY", "LP City Bongos", "Latin Percussion", "City Bongos", "Percusión", "Percusión latina y de mano", "Natural", 329, 3, "Bongos de madera con parches naturales y herrajes cromados. Nuevos con garantía."),
    ("YAM-YRS24B", "Flauta dulce Yamaha YRS-24B", "Yamaha", "YRS-24B", "Vientos", "Vientos", "", 39, 40, "Flauta dulce soprano de digitación barroca, la más usada en colegios. Nueva, con funda."),
]

d01 = os.path.join(OUT, "01-catalogo-nuevo")
os.makedirs(os.path.join(d01, "fotos"), exist_ok=True)
xlsx(os.path.join(d01, "01-catalogo-nuevo.xlsx"),
     ["SKU", "Nombre", "Marca", "Modelo", "Categoría", "Tipo de instrumento", "Variante", "Precio (PEN)", "Stock", "Condición", "Descripción", "Umbral de stock bajo"],
     [[s, n, b, m, c, t, v, p, q, "Nuevo", desc, 2] for s, n, b, m, c, t, v, p, q, desc in CATALOG])
zbuf = io.BytesIO()
with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_STORED) as zf:
    for i, (sku, name, *_rest) in enumerate(CATALOG):
        category = _rest[2]
        for k in range(1, 3 + (i % 2)):
            fname = f"{sku}__0{k}.jpg"
            path = os.path.join(d01, "fotos", fname)
            photo(path, name, k, category)
            zf.write(path, fname)
with open(os.path.join(d01, "01-fotos.zip"), "wb") as f:
    f.write(zbuf.getvalue())

# --------------------------------------------------------------------------------------- 02 messy point-of-sale export
d02 = os.path.join(OUT, "02-exportacion-desordenada")
os.makedirs(os.path.join(d02, "fotos"), exist_ok=True)
MESSY = [
    # Cód.; Artículo; Marca; Familia; P. Venta; Existencias; Estado; Detalle; Cód. barras; Imágenes
    ("CAB-XLR-6M", "Cable XLR 6 m", "Proel", "Audio", "45", "50", "Nuevo", "Cable balanceado XLR macho a hembra, 6 metros, conectores metálicos.", "8033786123456", "IMG_2041.jpg;IMG_2042.jpg"),
    ("CEJ-KYSER", "Cejilla Kyser KG6", "Kyser", "Accesorios", "79", "12", "Nuevo", "Cejilla de resorte para guitarra acústica de seis cuerdas, color negro.", "", ""),
    ("AFI-TU3W", "Afinador Boss TU-3W Waza", "Boss", "Pedales", "549", "2", "Nuevo", "Afinador cromático de pedal, edición Waza Craft, con salida de corriente.", "", "IMG_2050.jpg;IMG_2051.jpg"),
    ("PED-SD1", "Boss SD-1 Super OverDrive", "Boss", "Pedales", "1.500", "4", "Nuevo", "Precio escrito con punto de miles: el importador no adivina y marca error.", "", ""),
    ("PED-SD1", "Boss SD-1 (fila repetida)", "Boss", "Pedales", "319", "4", "Nuevo", "Mismo SKU que la fila anterior: las dos quedan con error.", "", ""),
    ("MIC-PG48", "Shure PGA48", "Shure", "Micrófonos", "259", "-1", "Nuevo", "Stock negativo: error de validación a propósito.", "", ""),
    ("", "Correa de cuero marrón", "Levy's", "Accesorios", "149", "6", "Nuevo", "Sin código: Laria genera uno y avisa que reimportar duplicaría.", "", ""),
    ("=HYPERLINK(\"x\")", "Fila con fórmula", "N/A", "Pedales", "10", "1", "Nuevo", "Una celda que parece fórmula se trata como texto y se rechaza como SKU.", "", ""),
    ("BAQ-VF5B", "Baquetas Vic Firth 5B", "Vic Firth", "Percusión", "65", "24", "Nuevo", "Par de baquetas de nogal americano, punta de madera, modelo 5B.", "7.50E+11", ""),
    ("GTR-CORT-AD810", "Guitarra Cort AD810", "Cort", "Guitarras", "599", "3", "Usado - buen estado", "Acústica dreadnought de exhibición, pequeña marca en el aro, cuerdas nuevas.", "", "IMG_2060.jpg;IMG_2061.jpg"),
    ("KEY-MAUDIO-K2", "M-Audio Keystation 49 MK3", "M-Audio", "Teclados", "449", "2", "Nuevo", "Controlador MIDI de 49 teclas por USB, alimentado por el puerto. Nuevo en caja.", "", ""),
    ("AMP-VOX-PF10", "Vox Pathfinder 10", "Vox", "Amplificadores", "349", "5", "nuevo ", "Condición con mayúsculas y espacio de más: se normaliza.", "", ""),
    ("ACC-PUAS", "Uñetas surtidas x 6", "Dunlop", "Accesorios", "15.50", "100", "Nuevo", "Precio con céntimos: Laria usa soles enteros y marca error.", "", ""),
    ("STR-DAD-EJ16", "Cuerdas D'Addario EJ16", "D'Addario", "Cuerdas", "45", "30", "Nuevo", "Juego de cuerdas de bronce fosforado para acústica, calibre 12-53.", "", ""),
]
with open(os.path.join(d02, "02-exportacion-pos.csv"), "w", encoding="utf-8-sig", newline="") as f:
    f.write("Exportación de artículos - Sistema de caja - 16/10/2026;;;;;;;;;\n")
    w = csv.writer(f, delimiter=";")
    w.writerow(["Cód.", "Artículo", "Marca", "Familia", "P. Venta", "Existencias", "Estado", "Detalle", "Cód. barras", "Imágenes"])
    w.writerows(MESSY)
for name, cat, title in [("IMG_2041.jpg", "Audio", "Cable XLR 6 m"), ("IMG_2042.jpg", "Audio", "Cable XLR 6 m"),
                         ("IMG_2050.jpg", "Pedales", "Boss TU-3W"), ("IMG_2051.jpg", "Pedales", "Boss TU-3W"),
                         ("IMG_2060.jpg", "Guitarras", "Cort AD810"), ("IMG_2061.jpg", "Guitarras", "Cort AD810")]:
    photo(os.path.join(d02, "fotos", name), title, int(name[-5]) % 3 + 1, cat)
# Photos matched by the photo list instead of the file name.
for name, title in [("vox-frente.jpg", "Vox Pathfinder 10"), ("vox-atras.jpg", "Vox Pathfinder 10")]:
    photo(os.path.join(d02, "fotos", name), title, 1 if "frente" in name else 2, "Amplificadores")
with open(os.path.join(d02, "fotos", "lista-de-fotos.csv"), "w", encoding="utf-8", newline="") as f:
    f.write("archivo;SKU;orden\nvox-frente.jpg;AMP-VOX-PF10;1\nvox-atras.jpg;AMP-VOX-PF10;2\n")
# Photos that the checks set aside or refuse.
photo(os.path.join(d02, "fotos", "KEY-MAUDIO-K2__01.jpg"), "M-Audio Keystation", 1, "Teclados y pianos")
photo(os.path.join(d02, "fotos", "KEY-MAUDIO-K2__01 (copia).jpg"), "M-Audio Keystation", 1, "Teclados y pianos")  # same slot twice
photo(os.path.join(d02, "fotos", "SKU-QUE-NO-ESTA__01.jpg"), "Producto fuera del archivo", 1, "Audio")
photo(os.path.join(d02, "fotos", "foto-pequena.jpg"), "300 px", 1, "Audio", size=(300, 220))
with open(os.path.join(d02, "fotos", "no-es-imagen.jpg"), "w") as f:
    f.write("Este archivo es texto con extensión .jpg; el servidor lo rechaza.\n")

# --------------------------------------------------------------------------------------- 03 stock count and price update
d03 = os.path.join(OUT, "03-actualizacion-stock")
os.makedirs(d03, exist_ok=True)
UPDATE = [  # SKUs created by demo-seed.sql; the stock column is the counted total, not a change
    ("BOSS-DS1", 289, 10), ("FEN-PLSTRAT-3TS", None, 2), ("YAM-C40", 449, 15), ("SHU-SM58", None, 6), ("FOC-2I2-G4", 949, 5),
    ("BOSS-TU3", None, 3), ("IBZ-GSR200-BK", None, 0), ("FEN-FM10G", 369, 4), ("DAD-EXL110", 42, 120), ("ERN-2221", None, 48),
    ("PLK-DUNLOP-TORTEX-088", None, 36), ("NO-EXISTE-01", None, 5),
]
xlsx(os.path.join(d03, "03-conteo-y-precios.xlsx"), ["SKU", "Precio", "Stock"],
     [[s, p, q] for s, p, q in UPDATE], title="Conteo de inventario 16/10/2026")

print(f"Wrote samples to {OUT}")
