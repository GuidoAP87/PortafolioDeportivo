"""
NACHO LINGUA FOTOGRAFÍA — Backend Flask 2026
Persistencia: PostgreSQL (Render) + Cloudinary (imágenes)
"""

import os, json, smtplib, io, threading, math, re, hmac
import time as _time
import hashlib
import urllib.request, urllib.parse, urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import timedelta
from flask import (Flask, request, send_from_directory,
                   jsonify, session, send_file)
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text as _sqltext
import cloudinary, cloudinary.uploader
import boto3
from botocore.client import Config
try:
    import phonenumbers          # normalización de números AR (pip install phonenumbers)
except ImportError:
    phonenumbers = None

# ── CLOUDINARY (solo para previews con marca de agua) ────────────────────────
cloudinary.config(
    cloud_name = os.environ.get('CLOUD_NAME'),
    api_key    = os.environ.get('CLOUD_API_KEY'),
    api_secret = os.environ.get('CLOUD_API_SECRET'),
    secure     = True
)

# ── WASABI (para originales sin marca de agua) ────────────────────────────────
WASABI_ACCESS_KEY = os.environ.get('WASABI_ACCESS_KEY', '')
WASABI_SECRET_KEY = os.environ.get('WASABI_SECRET_KEY', '')
WASABI_BUCKET     = os.environ.get('WASABI_BUCKET', 'nacho-lingua-fotos')
WASABI_REGION     = os.environ.get('WASABI_REGION', 'us-east-1')
WASABI_ENDPOINT   = os.environ.get('WASABI_ENDPOINT', 'https://s3.wasabisys.com')
WASABI_ENABLED    = bool(WASABI_ACCESS_KEY and WASABI_SECRET_KEY)

def get_wasabi_client():
    return boto3.client(
        's3',
        endpoint_url          = WASABI_ENDPOINT,
        aws_access_key_id     = WASABI_ACCESS_KEY,
        aws_secret_access_key = WASABI_SECRET_KEY,
        region_name           = WASABI_REGION,
        config                = Config(
            signature_version   = 's3v4',
            s3                  = {'addressing_style': 'path'},   # Wasabi + bucket con guion bajo -> path style
            connect_timeout     = 10,
            read_timeout        = 60,
            retries             = {'max_attempts': 2, 'mode': 'standard'}
        )
    )

def subir_a_wasabi(ruta_local, key):
    """Sube un archivo a Wasabi y devuelve la URL pública."""
    try:
        client = get_wasabi_client()
        with open(ruta_local, 'rb') as f:
            client.upload_fileobj(
                f, WASABI_BUCKET, key,
                ExtraArgs={'ContentType': 'image/jpeg'}
            )
        # URL pública directa de Wasabi
        url = f"https://s3.wasabisys.com/{WASABI_BUCKET}/{key}"
        print(f"✓ Wasabi: subido {key}")
        return url
    except Exception as e:
        print(f"✗ Error Wasabi: {e}")
        return None

def subir_bytes_a_wasabi(data_bytes, key):
    """Sube bytes en memoria a Wasabi y devuelve la URL publica."""
    try:
        client = get_wasabi_client()
        client.put_object(Bucket=WASABI_BUCKET, Key=key, Body=data_bytes, ContentType='image/jpeg')
        url = f"https://s3.wasabisys.com/{WASABI_BUCKET}/{key}"
        print(f"✓ Wasabi (bytes): subido {key}")
        return url
    except Exception as e:
        print(f"✗ Error Wasabi (bytes): {e}")
        return None

def _cloudinary_public_id_de_url(url):
    """Extrae el public_id de una URL de Cloudinary (para poder borrar el original)."""
    try:
        if '/upload/' not in url:
            return None
        resto = url.split('/upload/', 1)[1]
        segs, out = resto.split('/'), []
        for i, s in enumerate(segs):
            if i == 0 and (',' in s or '_' in s) and not s.startswith('nacho'):
                continue                      # segmento de transformacion (q_100, w_500, ...)
            if s.startswith('v') and s[1:].isdigit():
                continue                      # version vNNN
            out.append(s)
        public = '/'.join(out)
        if '.' in public.rsplit('/', 1)[-1]:
            public = public.rsplit('.', 1)[0]
        return public or None
    except Exception:
        return None

def get_wasabi_presigned_url(key, expiry=3600*24*6):
    """Genera URL firmada para acceso privado (6 días; Wasabi no permite mas de 7)."""
    try:
        client = get_wasabi_client()
        url = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': WASABI_BUCKET, 'Key': key},
            ExpiresIn=expiry
        )
        return url
    except Exception as e:
        print(f"✗ Error presigned URL: {e}")
        return None

# ── APP ───────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'nl-sports-2026-CAMBIAR-en-produccion')

# ── BASE DE DATOS ─────────────────────────────────────────────────────────────
database_url = os.environ.get('DATABASE_URL', '')
if not database_url:
    raise RuntimeError(
        '❌ DATABASE_URL no configurada. '
        'Agregá la variable en Railway antes de deployar.'
    )
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

print(f'✓ Base de datos: {database_url.split("@")[-1]}')

app.config['SQLALCHEMY_DATABASE_URI']        = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH']             = 100 * 1024 * 1024  # 100MB por foto
app.config['SQLALCHEMY_ENGINE_OPTIONS']      = {
    'pool_pre_ping':  True,
    'pool_recycle':   300,
    'pool_timeout':   30,
    'pool_size':      5,
    'max_overflow':   10,
    'connect_args':   {
        'connect_timeout':     10,
        'keepalives':          1,
        'keepalives_idle':     30,
        'keepalives_interval': 10,
        'keepalives_count':    5,
    }
}
db = SQLAlchemy(app)

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config.update(
    SESSION_COOKIE_SECURE    = True,
    SESSION_COOKIE_HTTPONLY  = True,
    SESSION_COOKIE_SAMESITE  = 'Lax',
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
)
CORS(app, supports_credentials=True)

CARPETA_TEMP = 'temp_uploads'
os.makedirs(CARPETA_TEMP, exist_ok=True)

# ── MERCADOPAGO ───────────────────────────────────────────────────────────────
try:
    import mercadopago
    _tok          = os.environ.get('MP_ACCESS_TOKEN', '')
    MP_SDK        = mercadopago.SDK(_tok) if _tok else None
    MP_HABILITADO = bool(_tok)
except ImportError:
    MP_SDK        = None
    MP_HABILITADO = False

# ── SMTP ──────────────────────────────────────────────────────────────────────
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')

# ── AUTH ADMIN ────────────────────────────────────────────────────────────────
# Sin default hardcodeado: DEBE estar seteada en Railway. Si queda vacía, el
# login de admin y el acceso por ?key= quedan deshabilitados (no exponemos la
# contraseña en el repo público).
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

# ── WhatsApp (Meta Cloud API) + aviso de venta al admin (CallMeBot) ───────────
META_WA_TOKEN    = os.environ.get('META_WA_TOKEN', '')
META_WA_PHONE_ID = os.environ.get('META_WA_PHONE_ID', '')
META_WA_TEMPLATE = os.environ.get('META_WA_TEMPLATE', 'entrega_fotos')
META_GRAPH_VER   = os.environ.get('META_GRAPH_VERSION', 'v21.0')  # versión de la Graph API, configurable
META_WA_ENABLED  = bool(META_WA_TOKEN and META_WA_PHONE_ID)
CMB_PHONE        = os.environ.get('CMB_PHONE', '')   # tu numero (CallMeBot) para el aviso de venta
CMB_APIKEY       = os.environ.get('CMB_APIKEY', '')
PUBLIC_BASE_URL  = os.environ.get('PUBLIC_BASE_URL', 'https://nacholingua.com').rstrip('/')

# ── Helpers de la galeria privada del cliente ─────────────────────────────────
import secrets as _secrets
def generar_token():
    """Token unico para el link privado de la galeria del cliente."""
    return _secrets.token_urlsafe(24)

def url_galeria(token):
    """URL publica de la galeria privada (sirve tambien fuera de un request)."""
    return f"{PUBLIC_BASE_URL}/galeria/{token}"

# (Reconocimiento facial eliminado)
FACES_ENABLED = False

# ── MODELOS ───────────────────────────────────────────────────────────────────
class Evento(db.Model):
    __tablename__ = 'evento'
    id            = db.Column(db.Integer, primary_key=True)
    titulo        = db.Column(db.String(150), nullable=False)
    deporte       = db.Column(db.String(50),  nullable=False)
    fecha         = db.Column(db.String(50))
    descripcion   = db.Column(db.String(300))
    cover_foto_id = db.Column(db.Integer, nullable=True)
    usar_portada  = db.Column(db.Boolean, default=True)   # False = carpeta madre solo-titulo (sin portada)
    parent_id     = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=True)
    creado_en     = db.Column(db.DateTime, server_default=db.func.now())
    fotos         = db.relationship('Foto', backref='evento', lazy=True, cascade='all, delete-orphan')
    subcarpetas   = db.relationship('Evento',
                                    backref=db.backref('padre', remote_side='Evento.id'),
                                    lazy=True, cascade='all, delete-orphan')

class Foto(db.Model):
    __tablename__ = 'foto'
    id           = db.Column(db.Integer, primary_key=True)
    url_preview  = db.Column(db.String(500), nullable=False)
    url_original = db.Column(db.String(500), nullable=False)
    url_cover    = db.Column(db.String(500), nullable=True)   # portada limpia (sin marca, baja res)
    precio       = db.Column(db.Float, default=3000.0)
    evento_id    = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    subida_en    = db.Column(db.DateTime, server_default=db.func.now())

class Categoria(db.Model):
    __tablename__ = 'categoria'
    id       = db.Column(db.Integer, primary_key=True)
    nombre   = db.Column(db.String(80), nullable=False)
    icono    = db.Column(db.String(10), default='📷')   # emoji
    orden    = db.Column(db.Integer, default=0)
    activa   = db.Column(db.Boolean, default=True)
    slug     = db.Column(db.String(80), unique=True)    # ej: "futbol", "basquet"

    @staticmethod
    def slug_from(nombre):
        import unicodedata, re
        s = unicodedata.normalize('NFD', nombre.lower())
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
        return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


class JugadorRoster(db.Model):
    """Roster de jugadores por evento: número → nombre."""
    __tablename__ = 'jugador_roster'
    id         = db.Column(db.Integer, primary_key=True)
    evento_id  = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    numero     = db.Column(db.String(10))   # número de camiseta
    nombre     = db.Column(db.String(150))  # nombre del jugador
    equipo     = db.Column(db.String(100))  # nombre del equipo (opcional)
    foto_cara  = db.Column(db.String(500))  # URL de foto de referencia (opcional)
    creado_en  = db.Column(db.DateTime, server_default=db.func.now())

class FotoEtiqueta(db.Model):
    """Etiquetas IA asociadas a una foto."""
    __tablename__ = 'foto_etiqueta'
    id               = db.Column(db.Integer, primary_key=True)
    foto_id          = db.Column(db.Integer, db.ForeignKey('foto.id'), nullable=False)
    jugador_nombre   = db.Column(db.String(150))  # nombre detectado
    numero_camiseta  = db.Column(db.String(10))   # número detectado
    confianza_cara   = db.Column(db.Float, default=0.0)
    confianza_numero = db.Column(db.Float, default=0.0)
    fuente           = db.Column(db.String(20), default='ia')  # 'ia' o 'manual'
    procesado_en     = db.Column(db.DateTime, server_default=db.func.now())
    foto             = db.relationship('Foto', backref='etiquetas', lazy=True)

class Compra(db.Model):
    __tablename__ = 'compra'
    id               = db.Column(db.Integer, primary_key=True)
    mp_preference_id = db.Column(db.String(250))
    mp_payment_id    = db.Column(db.String(100))
    email_cliente    = db.Column(db.String(150), nullable=False)
    nombre_cliente   = db.Column(db.String(150))
    whatsapp_cliente = db.Column(db.String(30))   # número con código país, sin +
    foto_ids         = db.Column(db.Text)
    monto_total      = db.Column(db.Float)
    tipo                = db.Column(db.String(30), default='individual')  # individual | pack_digital | pack_impresion
    fotos_impresion_ids = db.Column(db.Text)                              # JSON, solo para pack_impresion
    estado           = db.Column(db.String(50), default='pendiente')
    token_galeria    = db.Column(db.String(64), unique=True)  # link privado único
    email_enviado    = db.Column(db.Boolean, default=False)
    wa_enviado       = db.Column(db.Boolean, default=False)
    creada_en        = db.Column(db.DateTime, server_default=db.func.now())

class Consulta(db.Model):
    __tablename__ = 'consulta'
    id        = db.Column(db.Integer, primary_key=True)
    nombre    = db.Column(db.String(100))
    email     = db.Column(db.String(100))
    mensaje   = db.Column(db.Text)
    leida     = db.Column(db.Boolean, default=False)
    creada_en = db.Column(db.DateTime, server_default=db.func.now())

class ConfigPrecios(db.Model):
    """Configuración de precios parametrizable (una sola fila, id=1)."""
    __tablename__ = 'config_precios'
    id                    = db.Column(db.Integer, primary_key=True)
    escala_volumen        = db.Column(db.Text, default='[{"min":1,"precio":3000},{"min":2,"precio":2700},{"min":3,"precio":2500},{"min":4,"precio":2300},{"min":5,"precio":2000}]')
    pack_digital_precio   = db.Column(db.Float,   default=20000.0)
    pack_digital_activo   = db.Column(db.Boolean, default=True)
    pack_impresion_precio = db.Column(db.Float,   default=25000.0)
    pack_impresion_activo = db.Column(db.Boolean, default=True)
    upsell_trigger_qty    = db.Column(db.Integer, default=6)
    actualizado_en        = db.Column(db.DateTime, server_default=db.func.now())

with app.app_context():
    db.create_all()
    # migracion idempotente: agregar columna url_cover si falta
    try:
        db.session.execute(_sqltext('ALTER TABLE foto ADD COLUMN url_cover VARCHAR(500)'))
        db.session.commit()
    except Exception:
        db.session.rollback()
    try:
        db.session.execute(_sqltext('ALTER TABLE evento ADD COLUMN usar_portada BOOLEAN DEFAULT TRUE'))
        db.session.commit()
    except Exception:
        db.session.rollback()

# ── PRICING CENTRALIZADO (única fuente de verdad) ─────────────────────────────
def get_config():
    """Devuelve la fila de configuración, creándola con defaults si no existe."""
    cfg = ConfigPrecios.query.get(1)
    if not cfg:
        cfg = ConfigPrecios(id=1)
        db.session.add(cfg)
        db.session.commit()
    return cfg

def precio_unitario_volumen(cantidad, cfg=None):
    """Precio unitario según la escala de volumen configurada."""
    cfg = cfg or get_config()
    escala = sorted(json.loads(cfg.escala_volumen), key=lambda t: t['min'])
    precio = escala[0]['precio'] if escala else 3000
    for tramo in escala:
        if cantidad >= tramo['min']:
            precio = tramo['precio']
    return precio

def precio_escalera(n):
    """Escalera de precios por cantidad (TOTAL): 1=3000, 2=5500, 5=10000, 10=17500.
    Interpola entre los puntos y extrapola arriba de 10. Siempre monotona."""
    n = max(0, int(n))
    if n == 0:
        return 0
    pts = [(1, 3000), (2, 5500), (5, 10000), (10, 17500)]
    for i in range(len(pts) - 1):
        a, pa = pts[i]; b, pb = pts[i + 1]
        if a <= n <= b:
            return int(round(pa + (pb - pa) * (n - a) / (b - a)))
    return int(round(17500 + (n - 10) * 1500))


def calcular_total(foto_ids, tipo='individual', cfg=None):
    """Calcula (total, items_mp). tipo: individual | pack_digital | pack_impresion."""
    cfg = cfg or get_config()
    cantidad = len(foto_ids)
    if tipo == 'pack_digital':
        total = float(cfg.pack_digital_precio)
        return total, [{'title': 'Pack Jugador Digital', 'quantity': 1,
                        'unit_price': total, 'currency_id': 'ARS'}]
    if tipo == 'pack_impresion':
        total = float(cfg.pack_impresion_precio)
        return total, [{'title': 'Pack Jugador + 2 impresiones 13x18', 'quantity': 1,
                        'unit_price': total, 'currency_id': 'ARS'}]
    total = precio_escalera(cantidad)
    return total, [{'title': f'Nacho Lingua — {cantidad} foto(s)', 'quantity': 1,
                    'unit_price': float(total), 'currency_id': 'ARS'}]


def get_download_url(url_original):
    """
    Devuelve URL de descarga:
    - Si está en Wasabi → presigned URL de 30 días
    - Si está en Cloudinary u otro → URL directa
    """
    if not url_original:
        return url_original
    if 'wasabisys.com' in url_original or (WASABI_BUCKET and WASABI_BUCKET in url_original):
        try:
            # Sacar la KEY de forma robusta: el path es "/{bucket}/{key}".
            # (Antes se hacia split sin limite y si el bucket coincidia con el
            #  prefijo de la key, la key quedaba vacia -> link firmado 404.)
            ruta = urllib.parse.urlparse(url_original).path.lstrip('/')   # "{bucket}/{key}"
            if WASABI_BUCKET and ruta.startswith(WASABI_BUCKET + '/'):
                key = ruta[len(WASABI_BUCKET) + 1:]
            else:
                key = ruta.split('/', 1)[1] if '/' in ruta else ruta
            presigned = get_wasabi_presigned_url(key, expiry=3600*24*6)
            if presigned:
                return presigned
        except Exception as e:
            print(f'Error presigned URL: {e}')
    return url_original

# ════════════════════════════════════════════════════════════════════════════
# MARCA DE AGUA — Adaptada a versión Frontend (HTML5 Canvas)
# Núcleo único usado por TODOS los flujos de subida y re-procesamiento.
# ════════════════════════════════════════════════════════════════════════════
WATERMARK_VERSION = 'wm-v31-testwa2'

def _marca_core(imagen, texto='@Nacho Lingua',
                filas=5, escala_alto=0.7, sep_rel=0.15,
                min_reps=1.4, opacidad=190, angulo=0):
    """
    Marca de agua estilo fotografo profesional.

    - `filas` bandas horizontales que cubren TODO el alto de la foto.
    - En cada banda el texto se repite de forma CONTINUA hasta cubrir
      todo el ancho (se desborda por los bordes para que no queden huecos).
    - Las filas se alternan medio paso (patron "ladrillo"), look mas prolijo.
    - El tamano del texto sale del alto de cada fila, asi que se adapta solo
      a fotos verticales y horizontales. `min_reps` evita que en fotos
      angostas el texto quede tan grande que no llegue a repetirse.
    - Lleva un contorno oscuro sutil para que se lea sobre fondos claros
      y oscuros por igual.
    - `angulo=0` deja las filas horizontales; un valor (ej. 25) inclina todo
      el patron al estilo banco de imagenes.
    - Conserva la resolucion original de la foto intacta.
    """
    base = imagen.convert('RGBA')
    W, H = base.size
    altura_fila = H / filas

    # 1) Fuente. IMPORTANTE: priorizamos una fuente TTF incluida en el repo,
    #    porque el servidor (Railway) NO trae fuentes instaladas. Si no la
    #    encontrara, Pillow caería a una fuente bitmap diminuta de tamaño fijo
    #    y la marca saldría como rayitas chiquititas.
    _aqui = os.path.dirname(os.path.abspath(__file__))
    fuente_path = None
    for fp in [
        os.path.join(_aqui, 'DejaVuSans-Bold.ttf'),          # <- incluida en el repo
        os.path.join(_aqui, 'fonts', 'DejaVuSans-Bold.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
        'arialbd.ttf', 'arial.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf',
    ]:
        try:
            ImageFont.truetype(fp, 10)
            fuente_path = fp
            break
        except Exception:
            pass

    medidor = ImageDraw.Draw(Image.new('RGBA', (1, 1)))

    def _cargar(size):
        if fuente_path:
            return ImageFont.truetype(fuente_path, size)
        try:
            return ImageFont.load_default(size)   # Pillow >= 10.1 sí escala
        except TypeError:
            return ImageFont.load_default()

    def _medir(f):
        bb = medidor.textbbox((0, 0), texto, font=f)
        return bb[2] - bb[0], bb[3] - bb[1]

    # 2) Tamano base segun el alto de cada fila (adapta a la orientacion)
    fs = max(14, int(altura_fila * escala_alto))
    font = _cargar(fs)
    tw, th = _medir(font)

    # 3) Si el texto no entra al menos `min_reps` veces de ancho, achicarlo
    if fuente_path and tw > 0:
        paso = tw * (1 + sep_rel)
        if paso > W / min_reps:
            fs = max(14, int(fs * (W / min_reps) / paso))
            font = _cargar(fs)
            tw, th = _medir(font)

    paso_x = max(1, int(tw * (1 + sep_rel)))
    grosor = max(1, fs // 45)

    # 4) Capa transparente (mas grande si hay angulo, para cubrir tras rotar)
    if angulo:
        diag = int((W ** 2 + H ** 2) ** 0.5) + int(altura_fila) * 2
        CW, CH = diag, diag
    else:
        CW, CH = W, H

    capa = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    blanco = (255, 255, 255, opacidad)
    sombra = (0, 0, 0, int(opacidad * 0.55))

    n_filas = filas if not angulo else int(CH / altura_fila) + 2
    limite = (CW if angulo else W) + paso_x
    for i in range(n_filas + 1):
        cy = i * altura_fila + altura_fila / 2
        offset = (paso_x // 2) if (i % 2) else 0
        x = -paso_x + offset
        while x < limite:
            d.text((x, cy), texto, font=font, anchor="lm",
                   fill=blanco, stroke_width=grosor, stroke_fill=sombra)
            x += paso_x

    # 5) Rotar (si corresponde) y recortar al centro al tamano de la foto
    if angulo:
        capa = capa.rotate(angulo, resample=Image.BICUBIC, expand=False)
        left, top = (CW - W) // 2, (CH - H) // 2
        capa = capa.crop((left, top, left + W, top + H))

    return Image.alpha_composite(base, capa).convert('RGB')


# ── PREVIEWS LIVIANAS (para que entren muchas fotos en poco espacio) ──────────
# El ORIGINAL que descarga el cliente NO se toca. Esto solo achica la preview
# con marca de agua que se muestra en la galería (la que se sube a Cloudinary).
# 20.000 previews × ~450KB ≈ 9 GB  -> entran sobradas en 25 GB.
MAX_PREVIEW_PX    = 1600   # lado largo máximo de la preview (se ve nítida igual)
TARGET_PREVIEW_KB = 450    # peso objetivo por preview
CLEAN_COVER_PX    = 800    # lado largo de la portada limpia (chica, no robable)

def _reducir_para_preview(imagen):
    """Baja la resolución SOLO de la preview si supera MAX_PREVIEW_PX (nunca agranda)."""
    w, h = imagen.size
    lado = max(w, h)
    if lado > MAX_PREVIEW_PX:
        escala = MAX_PREVIEW_PX / float(lado)
        imagen = imagen.resize((max(1, int(w * escala)), max(1, int(h * escala))), Image.LANCZOS)
    return imagen

def _guardar_jpeg_liviano(img_final, target_kb=TARGET_PREVIEW_KB):
    """Guarda JPEG bajando la calidad hasta acercarse a `target_kb` (con piso de calidad)."""
    limite = target_kb * 1024
    q = 85
    buf = io.BytesIO()
    img_final.save(buf, 'JPEG', quality=q, optimize=True)
    while buf.tell() > limite and q > 45:
        q -= 7
        buf = io.BytesIO()
        img_final.save(buf, 'JPEG', quality=q, optimize=True)
    kb = buf.tell() // 1024
    buf.seek(0)
    return buf, q, kb


def _generar_cover_limpia(raw_bytes):
    """Portada SIN marca, en baja resolucion, subida a Cloudinary. Devuelve URL o None."""
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        w, h = img.size
        lado = max(w, h)
        if lado > CLEAN_COVER_PX:
            esc = CLEAN_COVER_PX / float(lado)
            img = img.resize((max(1, int(w * esc)), max(1, int(h * esc))), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=72, optimize=True)
        buf.seek(0)
        r = cloudinary.uploader.upload(buf, folder='nacholingua_cover', resource_type='image', invalidate=True)
        return r['secure_url']
    except Exception as e:
        print(f'[cover] no pude generar portada limpia: {e}')
        return None


def agregar_watermark(ruta_entrada, ruta_salida, texto='@Nacho Lingua'):
    """Uso en la ruta A (/subir-foto): lee de disco y guarda en disco."""
    try:
        final = _marca_core(_reducir_para_preview(Image.open(ruta_entrada)), texto)
        buf, q, kb = _guardar_jpeg_liviano(final)
        with open(ruta_salida, 'wb') as f:
            f.write(buf.getvalue())
        print(f'[watermark] OK preview {kb} KB (q={q}, max {MAX_PREVIEW_PX}px)')
        return True
    except Exception as e:
        print(f'[watermark] ERROR: {e}')
        return False


def agregar_watermark_5x(img_bytes, texto='@Nacho Lingua', **kwargs):
    """Uso en la ruta B (/registrar-foto) y /re-watermark: procesa directamente en RAM."""
    final = _marca_core(_reducir_para_preview(Image.open(img_bytes)), texto)
    out, q, kb = _guardar_jpeg_liviano(final)
    print(f'[watermark-5x] OK preview {kb} KB (q={q}, max {MAX_PREVIEW_PX}px)')
    return out

# ── ENVÍO POR WHATSAPP (Meta Cloud API) ───────────────────────────────────────
def normalizar_wa_ar(numero):
    """Normaliza un número argentino al formato que espera la API de WhatsApp:
    54 + 9 + área + número (sin 0 inicial, sin 15, sin símbolos).
    Devuelve los dígitos sin '+', o None si el número no parece válido."""
    if not numero:
        return None
    if phonenumbers is not None:
        try:
            p = phonenumbers.parse(numero, 'AR')
            if phonenumbers.is_valid_number(p):
                # E.164 devuelve '+549XXXXXXXXXX' para móviles AR; sacamos el '+'
                return phonenumbers.format_number(
                    p, phonenumbers.PhoneNumberFormat.E164).lstrip('+')
        except Exception:
            pass
    # Fallback sin la librería: limpieza básica + prefijo 549
    n = re.sub(r'\D', '', numero or '')
    if not n:
        return None
    if n.startswith('549'):
        return n
    if n.startswith('54'):
        return '549' + n[2:].lstrip('0')
    return '549' + n.lstrip('0')


def enviar_wa_cliente(compra):
    """Envía el link de galería al cliente por WhatsApp vía Meta Cloud API."""
    if not META_WA_ENABLED:
        print("WhatsApp Meta API no configurado")
        return False
    if not compra.whatsapp_cliente:
        print("Cliente no dejó número de WhatsApp")
        return False
    if not compra.token_galeria:
        print("Compra sin token de galería")
        return False

    nombre = compra.nombre_cliente or "cliente"
    link   = url_galeria(compra.token_galeria)

    # Payload para la Meta WhatsApp Cloud API
    # La plantilla "entrega_fotos" debe estar aprobada en Meta con estos parámetros:
    #   {{1}} = nombre del cliente
    #   {{2}} = link de la galería
    payload = {
        "messaging_product": "whatsapp",
        "to": compra.whatsapp_cliente,
        "type": "template",
        "template": {
            "name": META_WA_TEMPLATE,
            "language": {"code": "es_AR"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": nombre},
                        {"type": "text", "text": link}
                    ]
                }
            ]
        }
    }

    try:
        req = urllib.request.Request(
            f"https://graph.facebook.com/{META_GRAPH_VER}/{META_WA_PHONE_ID}/messages",
            data    = json.dumps(payload).encode('utf-8'),
            headers = {
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {META_WA_TOKEN}"
            },
            method = "POST"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            print(f"✓ WhatsApp enviado a {compra.whatsapp_cliente}: {body}")
            return True
    except Exception as e:
        print(f"✗ Error enviando WhatsApp: {e}")
        return False

def notificarme_venta(compra):
    """Me avisa a Nacho (CallMeBot gratuito) cuando alguien compra."""
    if not CMB_PHONE or not CMB_APIKEY:
        return
    try:
        ids    = json.loads(compra.foto_ids or '[]')
        link   = url_galeria(compra.token_galeria) if compra.token_galeria else ''
        msg    = (
            f"Nueva venta! {compra.nombre_cliente or compra.email_cliente} "
            f"compro {len(ids)} foto{'s' if len(ids)>1 else ''} "
            f"por ${compra.monto_total:,.0f} ARS. "
            f"WA: {compra.whatsapp_cliente or 'no dejó'}. "
            f"Galería: {link}"
        )
        url = (f"https://api.callmebot.com/whatsapp.php"
               f"?phone={CMB_PHONE}&text={urllib.parse.quote(msg)}&apikey={CMB_APIKEY}")
        urllib.request.urlopen(url, timeout=10)
    except Exception as e:
        print(f"CallMeBot error: {e}")

def entregar_compra(compra_id):
    """Envía email + WhatsApp al cliente en background."""
    with app.app_context():
        compra = Compra.query.get(compra_id)
        if not compra:
            return
        # Generar token de galería si no tiene
        if not compra.token_galeria:
            compra.token_galeria = generar_token()
            db.session.commit()

        # 1. Email
        if not compra.email_enviado:
            enviar_fotos_email(compra_id)

        # 2. WhatsApp al cliente
        if not compra.wa_enviado and compra.whatsapp_cliente:
            ok = enviar_wa_cliente(compra)
            if ok:
                compra.wa_enviado = True
                db.session.commit()

        # 3. Notificación a Nacho
        notificarme_venta(compra)

# ── GALERÍA PRIVADA ────────────────────────────────────────────────────────────
def enviar_fotos_email(compra_id):
    compra = Compra.query.get(compra_id)
    if not compra or compra.email_enviado: return False
    if not SMTP_USER or not SMTP_PASS: return False

    ids   = json.loads(compra.foto_ids or '[]')
    fotos = Foto.query.filter(Foto.id.in_(ids)).all()
    if not fotos: return False

    nombre = compra.nombre_cliente or compra.email_cliente.split('@')[0].capitalize()

    filas = ''
    for i, f in enumerate(fotos, 1):
        titulo = f.evento.titulo if f.evento else 'Evento deportivo'
        filas += f"""
        <tr><td style="padding:14px 0;border-bottom:1px solid #1a1a1a;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="44" style="text-align:center;vertical-align:middle;">
              <div style="width:36px;height:36px;background:#1a1a1a;border-radius:3px;
                          line-height:36px;text-align:center;font-size:12px;color:#D4A843;
                          font-weight:700;margin:0 auto;">#{i}</div>
            </td>
            <td style="padding-left:14px;vertical-align:middle;">
              <p style="margin:0;font-size:13px;color:#e0e0e0;font-weight:500;">{titulo}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#555;">Foto #{f.id} · Alta resolución · Sin marca de agua</p>
            </td>
            <td style="text-align:right;padding-left:10px;white-space:nowrap;">
              <a href="{get_download_url(f.url_original)}"
                 style="display:inline-block;padding:9px 18px;background:#D4A843;
                        color:#000;font-size:10px;font-weight:700;letter-spacing:2px;
                        text-decoration:none;text-transform:uppercase;">
                Descargar
              </a>
            </td>
          </tr></table>
        </td></tr>"""

    html = f"""<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06060A;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;padding:40px 0 36px;border-bottom:1px solid #1a1a1a;">
    <p style="margin:0 0 6px;font-size:10px;letter-spacing:5px;color:#444;text-transform:uppercase;">Nacho Lingua</p>
    <h1 style="margin:0;font-size:36px;color:#D4A843;letter-spacing:8px;font-family:Impact,sans-serif;">FOTOGRAFÍA</h1>
    <p style="margin:10px 0 0;font-size:10px;letter-spacing:3px;color:#333;text-transform:uppercase;">Córdoba · Argentina</p>
  </div>
  <div style="padding:36px 0 28px;">
    <h2 style="margin:0 0 14px;font-size:22px;color:#f2f2f2;font-weight:400;">¡Gracias por tu compra, {nombre}!</h2>
    <p style="margin:0;font-size:14px;color:#777;line-height:1.75;">
      Tus fotos están listas en alta resolución sin marca de agua. Hacé clic en <strong style="color:#D4A843">Descargar</strong> en cada una.
    </p>
  </div>
  <div style="background:#0c0c12;border:1px solid #1e1e1e;border-radius:4px;padding:0 20px 6px;">
    <p style="font-size:10px;letter-spacing:3px;color:#444;text-transform:uppercase;padding:16px 0 4px;margin:0;">
      {len(fotos)} foto{'s' if len(fotos)>1 else ''} adquirida{'s' if len(fotos)>1 else ''}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">{filas}</table>
  </div>
  <div style="padding:20px 0;text-align:right;">
    <p style="margin:0;font-size:10px;letter-spacing:2px;color:#444;text-transform:uppercase;">Total abonado</p>
    <p style="margin:4px 0 0;font-size:30px;color:#D4A843;font-family:Impact,sans-serif;letter-spacing:2px;">
      ${compra.monto_total:,.0f} <span style="font-size:13px;color:#555;font-family:Arial;">ARS</span>
    </p>
  </div>
  <div style="text-align:center;padding:24px 0 0;border-top:1px solid #111;">
    <p style="font-size:10px;color:#333;line-height:1.8;">
      Los links de descarga son permanentes.<br>
      © 2026 Nacho Lingua Fotografía · Córdoba, Argentina
    </p>
  </div>
</div></body></html>"""

    try:
        msg            = MIMEMultipart('alternative')
        msg['Subject'] = f"Tus fotos listas — Nacho Lingua ({len(fotos)} foto{'s' if len(fotos)>1 else ''})"
        msg['From']    = f'Nacho Lingua Fotografía <{SMTP_USER}>'
        msg['To']      = compra.email_cliente
        msg.attach(MIMEText(html, 'html'))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as srv:
            srv.ehlo(); srv.starttls()
            srv.login(SMTP_USER, SMTP_PASS)
            srv.sendmail(SMTP_USER, compra.email_cliente, msg.as_string())
        compra.email_enviado = True
        db.session.commit()
        print(f'✓ Email enviado a {compra.email_cliente}')
        return True
    except Exception as e:
        print(f'✗ Error email: {e}'); return False

# ── RUTAS ESTÁTICAS ───────────────────────────────────────────────────────────
@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/nacho_lingua.jpg')
def foto_fondo(): return send_file('nacho_lingua.jpg')

@app.route('/galeria/<token>')
def galeria_privada(token):
    compra = Compra.query.filter_by(token_galeria=token, estado='approved').first()
    if not compra:
        return """<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <title>Link inválido</title>
        <style>
            body{background:#06060A;color:#f2f2f2;font-family:sans-serif;
            display:flex;align-items:center;justify-content:center;
            min-height:100vh;text-align:center;}
            h1{color:#D4A843;font-size:28px;margin-bottom:12px;}
            p{color:#777;font-size:14px;line-height:1.7;}
            a{color:#D4A843;}
        </style></head>
        <body><div>
            <h1>Link inválido</h1>
            <p>Este link no existe o el pago no fue confirmado.<br>
            Si creés que es un error, respondé el email que recibiste.</p>
            <p><a href="/">← Volver al portfolio</a></p>
        </div></body></html>""", 404

    ids   = json.loads(compra.foto_ids or '[]')
    fotos = Foto.query.filter(Foto.id.in_(ids)).all()
    nombre = compra.nombre_cliente or 'Cliente'

    # get_download_url está definida a nivel de módulo

    fotos_html = ''
    for f in fotos:
        titulo    = f.evento.titulo if f.evento else 'Evento deportivo'
        dl_url    = get_download_url(f.url_original)
        fotos_html += f'''
        <div class="foto-card">
            <div class="foto-img-wrap">
                <img src="{f.url_preview}" alt="Foto" loading="lazy">
                <div class="foto-overlay">
                    <a href="{dl_url}" download target="_blank" class="btn-dl">
                        ↓ Descargar
                    </a>
                </div>
            </div>
            <div class="foto-info">
                <span>{titulo}</span>
                <a href="{dl_url}" download target="_blank" class="btn-dl-sm">↓ Alta resolución</a>
            </div>
        </div>'''

    urls_json = json.dumps([get_download_url(f.url_original) for f in fotos])

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Tus fotos — Nacho Lingua Fotografía</title>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        *,*::before,*::after{{margin:0;padding:0;box-sizing:border-box;}}
        :root{{--ink:#06060A;--ink2:#0c0c12;--ink3:#121218;--ink4:#1c1c24;--gold:#D4A843;--text:#f2f2f2;--sub:#888;}}
        body{{background:var(--ink);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;}}
        .header{{background:var(--ink2);border-bottom:1px solid var(--ink4);padding:20px 5%;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}}
        .brand{{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:5px;color:var(--gold);}}
        .back{{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--sub);text-decoration:none;transition:color .2s;}}
        .back:hover{{color:var(--gold);}}
        .hero{{padding:40px 5% 28px;border-bottom:1px solid var(--ink3);display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:20px;}}
        .hero-eyebrow{{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:8px;display:flex;align-items:center;gap:10px;}}
        .hero-eyebrow::before{{content:'';width:20px;height:1px;background:var(--gold);display:block;}}
        .hero-title{{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,5vw,46px);letter-spacing:3px;color:var(--text);margin-bottom:8px;}}
        .hero-sub{{font-size:13px;color:var(--sub);line-height:1.7;max-width:420px;}}
        .hero-stats{{display:flex;gap:28px;flex-shrink:0;}}
        .stat{{text-align:center;}}
        .stat-n{{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--gold);line-height:1;display:block;}}
        .stat-l{{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#555;display:block;margin-top:3px;}}
        .toolbar{{padding:14px 5%;background:var(--ink2);border-bottom:1px solid var(--ink4);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}}
        .toolbar-info{{font-size:12px;color:var(--sub);}}
        .btn-all{{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;background:var(--gold);color:#000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;cursor:pointer;border:none;font-family:'Inter',sans-serif;transition:background .2s;}}
        .btn-all:hover{{background:#e8bf6a;}}
        .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:3px;padding:3px 5%;}}
        .foto-card{{background:var(--ink3);overflow:hidden;}}
        .foto-img-wrap{{position:relative;aspect-ratio:4/3;overflow:hidden;}}
        .foto-img-wrap img{{width:100%;height:100%;object-fit:cover;transition:transform .5s,filter .3s;filter:brightness(.88);display:block;}}
        .foto-card:hover .foto-img-wrap img{{transform:scale(1.04);filter:brightness(.6);}}
        .foto-overlay{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;}}
        .foto-card:hover .foto-overlay{{opacity:1;}}
        .btn-dl{{display:inline-flex;align-items:center;gap:6px;padding:12px 22px;background:var(--gold);color:#000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;transform:translateY(6px);transition:transform .3s,background .2s;}}
        .foto-card:hover .btn-dl{{transform:translateY(0);}}
        .btn-dl:hover{{background:#e8bf6a;}}
        .foto-info{{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--ink4);}}
        .foto-info span{{font-size:11px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}}
        .btn-dl-sm{{font-size:11px;color:var(--gold);text-decoration:none;white-space:nowrap;flex-shrink:0;transition:opacity .2s;}}
        .btn-dl-sm:hover{{opacity:.8;}}
        footer{{margin-top:48px;padding:32px 5%;border-top:1px solid var(--ink3);text-align:center;}}
        footer p{{font-size:11px;color:#333;line-height:1.8;}}
        @media(max-width:600px){{.hero-stats{{display:none;}}.grid{{grid-template-columns:1fr 1fr;}}.foto-overlay{{display:none;}}}}
    </style>
</head>
<body>
<header class="header">
    <div class="brand">NL</div>
    <a href="/" class="back">← Volver al portfolio</a>
</header>
<div class="hero">
    <div>
        <div class="hero-eyebrow">Tu galería privada</div>
        <h1 class="hero-title">¡Hola, {nombre}!</h1>
        <p class="hero-sub">
            Tus fotos están listas en alta resolución, sin marca de agua.<br>
            El link es permanente — podés volver cuando quieras.
        </p>
    </div>
    <div class="hero-stats">
        <div class="stat">
            <span class="stat-n">{len(fotos)}</span>
            <span class="stat-l">Foto{"s" if len(fotos)>1 else ""}</span>
        </div>
        <div class="stat">
            <span class="stat-n" style="font-size:22px">${compra.monto_total:,.0f}</span>
            <span class="stat-l">ARS abonados</span>
        </div>
    </div>
</div>
<div class="toolbar">
    <span class="toolbar-info">Pasá el mouse sobre la foto para descargarla · En celular usá el botón debajo</span>
    <button class="btn-all" onclick="descargarTodas()">↓ Descargar todas</button>
</div>
<div class="grid">{fotos_html}</div>
<footer>
    <p>© 2026 Nacho Lingua Fotografía · Córdoba, Argentina<br>
    Imágenes de uso personal · Prohibida su reproducción sin autorización.</p>
</footer>
<script>
    const urls = {urls_json};
    function descargarTodas() {{
        const btn = document.querySelector('.btn-all');
        btn.disabled = true; btn.textContent = 'Descargando...';
        let i = 0;
        function next() {{
            if (i >= urls.length) {{ btn.textContent = '✓ ¡Listas!'; setTimeout(() => {{ btn.textContent = '↓ Descargar todas'; btn.disabled = false; }}, 3000); return; }}
            const a = document.createElement('a');
            a.href = urls[i]; a.download = 'nacho-lingua-foto-' + (i+1) + '.jpg'; a.target = '_blank';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            btn.textContent = 'Descargando ' + (i+1) + ' de ' + urls.length + '...';
            i++; setTimeout(next, 800);
        }}
        next();
    }}
</script>
</body></html>'''


# ── CATEGORÍAS ────────────────────────────────────────────────────────────────
@app.route('/categorias', methods=['GET'])
def get_categorias():
    cats = Categoria.query.filter_by(activa=True).order_by(Categoria.orden).all()
    return jsonify([{'id': c.id, 'nombre': c.nombre, 'icono': c.icono,
                     'orden': c.orden, 'slug': c.slug} for c in cats])

@app.route('/categorias', methods=['POST'])
def crear_categoria():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    d    = request.json
    slug = Categoria.slug_from(d.get('nombre',''))
    # Si ya existe ese slug, actualizarla
    cat  = Categoria.query.filter_by(slug=slug).first()
    if not cat:
        max_orden = db.session.query(db.func.max(Categoria.orden)).scalar() or 0
        cat = Categoria(nombre=d['nombre'], icono=d.get('icono','📷'),
                        slug=slug, orden=max_orden+1)
        db.session.add(cat)
    else:
        cat.activa = True
        cat.icono  = d.get('icono', cat.icono)
    db.session.commit()
    return jsonify({'id': cat.id, 'nombre': cat.nombre, 'icono': cat.icono,
                    'slug': cat.slug, 'orden': cat.orden})

@app.route('/categorias/<int:cid>', methods=['PATCH'])
def editar_categoria(cid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    cat = Categoria.query.get_or_404(cid)
    d   = request.json
    if 'nombre' in d: cat.nombre = d['nombre']; cat.slug = Categoria.slug_from(d['nombre'])
    if 'icono'  in d: cat.icono  = d['icono']
    if 'orden'  in d: cat.orden  = int(d['orden'])
    if 'activa' in d: cat.activa = bool(d['activa'])
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/categorias/<int:cid>', methods=['DELETE'])
def borrar_categoria(cid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    cat = Categoria.query.get_or_404(cid)
    cat.activa = False   # soft delete
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/categorias/reordenar', methods=['POST'])
def reordenar_categorias():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    orden = request.json.get('orden', [])   # lista de IDs en nuevo orden
    for i, cid in enumerate(orden):
        cat = Categoria.query.get(cid)
        if cat: cat.orden = i
    db.session.commit()
    return jsonify({'ok': True})

# ── EVENTOS ───────────────────────────────────────────────────────────────────
def serializar_evento(e):
    """Serializa un evento con sus subcarpetas de forma recursiva."""
    cover_url = None
    if e.cover_foto_id:
        cf = Foto.query.get(e.cover_foto_id)
        if cf: cover_url = cf.url_cover or cf.url_preview
    if not cover_url and e.fotos:
        cover_url = e.fotos[0].url_cover or e.fotos[0].url_preview
    if not cover_url and e.subcarpetas:
        # Buscar portada en subcarpetas recursivamente
        for sub in e.subcarpetas:
            if sub.fotos:
                cover_url = sub.fotos[0].url_cover or sub.fotos[0].url_preview
                break
    if getattr(e, 'usar_portada', True) is False:
        cover_url = None          # carpeta madre solo-titulo
    return {
        'id':               e.id,
        'titulo':           e.titulo,
        'deporte':          e.deporte,
        'fecha':            e.fecha,
        'descripcion':      e.descripcion,
        'cover_foto_id':    e.cover_foto_id,
        'usar_portada':     bool(getattr(e, 'usar_portada', True)),
        'cover_url':        cover_url,
        'parent_id':        e.parent_id,
        'total_fotos':      len(e.fotos),
        'total_subcarpetas': len(e.subcarpetas),
        'fotos': [{'id': f.id, 'url_preview': f.url_preview,
                   'url_original': f.url_original, 'precio': f.precio}
                  for f in e.fotos],
        'subcarpetas': [serializar_evento(s) for s in
                        sorted(e.subcarpetas, key=lambda x: x.id)]
    }

@app.route('/crear-evento', methods=['POST'])
def crear_evento():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    d         = request.json
    parent_id = d.get('parent_id') or None
    if parent_id:
        padre   = Evento.query.get(parent_id)
        deporte = padre.deporte if padre else d.get('deporte', '')
    else:
        deporte = d.get('deporte', '')
    ev = Evento(titulo=d.get('titulo',''), deporte=deporte,
                fecha=d.get('fecha',''), descripcion=d.get('descripcion',''),
                usar_portada=bool(d.get('usar_portada', True)),
                parent_id=parent_id)
    db.session.add(ev); db.session.commit()
    return jsonify({'id': ev.id, 'mensaje': 'Carpeta creada'})

@app.route('/obtener-eventos', methods=['GET'])
def obtener_eventos():
    # Solo raíces (sin padre) — las subcarpetas van anidadas dentro
    raices = Evento.query.filter_by(parent_id=None).order_by(Evento.id.desc()).all()
    return jsonify([serializar_evento(e) for e in raices])

@app.route('/editar-evento/<int:ev_id>', methods=['PATCH'])
def editar_evento(ev_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    ev = Evento.query.get_or_404(ev_id)
    d  = request.json
    if 'titulo'      in d: ev.titulo      = d['titulo']
    if 'deporte'     in d: ev.deporte     = d['deporte']
    if 'fecha'       in d: ev.fecha       = d['fecha']
    if 'descripcion' in d: ev.descripcion = d['descripcion']
    if 'usar_portada' in d: ev.usar_portada = bool(d['usar_portada'])
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/evento/<int:ev_id>/portada', methods=['PATCH'])
def set_portada(ev_id):
    """El admin elige qué foto es la portada del evento."""
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    ev = Evento.query.get_or_404(ev_id)
    data = request.json
    foto_id = data.get('foto_id')
    # Validar que la foto pertenece al evento
    if foto_id:
        foto = Foto.query.filter_by(id=foto_id, evento_id=ev_id).first()
        if not foto:
            return jsonify({'error': 'Foto no pertenece a este evento'}), 400
        ev.cover_foto_id = foto_id
    else:
        ev.cover_foto_id = None   # resetear a automático
    db.session.commit()
    # Devolver la URL original (sin watermark) de la nueva portada
    cover_foto = Foto.query.get(ev.cover_foto_id) if ev.cover_foto_id else (ev.fotos[0] if ev.fotos else None)
    return jsonify({'ok': True, 'cover_url': cover_foto.url_original if cover_foto else None})


@app.route('/evento/<int:ev_id>/subcarpeta', methods=['POST'])
def crear_subcarpeta(ev_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    padre = Evento.query.get_or_404(ev_id)
    d     = request.json
    sub   = Evento(
        titulo    = d.get('titulo', ''),
        deporte   = padre.deporte,
        fecha     = d.get('fecha', ''),
        descripcion = d.get('descripcion', ''),
        usar_portada = bool(d.get('usar_portada', True)),
        parent_id = ev_id
    )
    db.session.add(sub); db.session.commit()
    return jsonify({'id': sub.id, 'mensaje': 'Subcarpeta creada'})


@app.route('/foto/<int:foto_id>/precio', methods=['PATCH'])
def set_precio_foto(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get_or_404(foto_id)
    data = request.json
    nuevo_precio = data.get('precio')
    if nuevo_precio is None or float(nuevo_precio) < 0:
        return jsonify({'error': 'Precio inválido'}), 400
    foto.precio = float(nuevo_precio)
    db.session.commit()
    return jsonify({'ok': True, 'precio': foto.precio})

@app.route('/borrar-evento/<int:ev_id>', methods=['DELETE'])
def borrar_evento(ev_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    ev = Evento.query.get(ev_id)
    if not ev: return jsonify({'error': 'No encontrado'}), 404
    db.session.delete(ev); db.session.commit()
    return jsonify({'ok': True})

# ── FOTOS ─────────────────────────────────────────────────────────────────────
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    if 'foto' not in request.files: return jsonify({'error': 'Sin archivo'}), 400

    archivo   = request.files['foto']
    evento_id = request.form.get('evento_id')
    precio    = float(request.form.get('precio', 3000))
    filename  = f"{evento_id}_{archivo.filename}"

    ruta_orig    = os.path.join(CARPETA_TEMP, 'orig_'    + filename)
    ruta_preview = os.path.join(CARPETA_TEMP, 'preview_' + filename)
    archivo.save(ruta_orig)

    # ── PASO 1: Generar preview con watermark (rápido, ~2s) ──────────────────
    if not agregar_watermark(ruta_orig, ruta_preview):
        try: os.remove(ruta_orig)
        except: pass
        return jsonify({'error': 'Error al procesar imagen'}), 500

    # ── PASO 2: Subir preview a Cloudinary (rápido, ~2s) ─────────────────────
    try:
        r_prev      = cloudinary.uploader.upload(ruta_preview, folder=f'nacho_lingua/previews/evento_{evento_id}')
        url_preview = r_prev['secure_url']
    except Exception as e:
        for f in [ruta_orig, ruta_preview]:
            try: os.remove(f)
            except: pass
        return jsonify({'error': f'Error Cloudinary preview: {e}'}), 500

    # ── PASO 3: Guardar en BD con URL de Wasabi pendiente ────────────────────
    # El original se sube a Wasabi en background para no bloquear el worker
    key_orig     = f"nacho_lingua/originales/evento_{evento_id}/{filename}"
    url_original = f"wasabi_pending:{key_orig}"  # placeholder hasta que suba

    foto = Foto(url_preview=url_preview, url_original=url_original, precio=precio, evento_id=evento_id)
    db.session.add(foto); db.session.commit()
    foto_id_guardado = foto.id

    # ── PASO 4: Subir original a Wasabi en background (lento, no bloquea) ────
    def subir_wasabi_background(ruta, key, foto_id):
        with app.app_context():
            try:
                url = subir_a_wasabi(ruta, key)
                if url:
                    f = Foto.query.get(foto_id)
                    if f:
                        f.url_original = url
                        db.session.commit()
                        print(f'✓ Wasabi background OK: foto {foto_id}')
                else:
                    print(f'✗ Wasabi background falló: foto {foto_id}')
            except Exception as e:
                print(f'✗ Wasabi background error: {e}')
            finally:
                for ruta_tmp in [ruta, ruta_preview]:
                    try: os.remove(ruta_tmp)
                    except: pass

    t_wasabi = threading.Thread(
        target=subir_wasabi_background,
        args=(ruta_orig, key_orig, foto_id_guardado),
        daemon=True
    )
    t_wasabi.start()

    return jsonify({'ok': True, 'id': foto_id_guardado, 'url_preview': url_preview})

@app.route('/editar-precio/<int:foto_id>', methods=['PATCH'])
def editar_precio(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get_or_404(foto_id)
    foto.precio = float(request.json.get('precio', foto.precio))
    db.session.commit()
    return jsonify({'ok': True, 'precio': foto.precio})

@app.route('/borrar-foto/<int:foto_id>', methods=['DELETE'])
def borrar_foto(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get(foto_id)
    if not foto: return jsonify({'error': 'No encontrada'}), 404
    db.session.delete(foto); db.session.commit()
    return jsonify({'ok': True})

# ── COMPRAS Y LÓGICA DE PRECIOS POR VOLUMEN ───────────────────────────────────
@app.route('/crear-orden', methods=['POST'])
def crear_orden():
    d        = request.json
    foto_ids = d.get('foto_ids', [])
    email    = d.get('email', '').strip()
    nombre   = d.get('nombre', '').strip()
    if not foto_ids or not email: return jsonify({'error': 'Datos incompletos'}), 400

    fotos = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos: return jsonify({'error': 'Fotos no encontradas'}), 404

    # Cálculo de precio centralizado (escala de volumen / packs) — parametrizable
    tipo            = d.get('tipo', 'individual')
    fotos_impresion = d.get('fotos_impresion_ids', [])

    # El pack con impresiones exige exactamente 2 fotos a imprimir (req. 3.3)
    if tipo == 'pack_impresion' and len(fotos_impresion) != 2:
        return jsonify({'error': 'Debés elegir exactamente 2 fotos para imprimir'}), 400

    cfg = get_config()
    total, mp_items = calcular_total([f.id for f in fotos], tipo=tipo, cfg=cfg)
    base_url = request.host_url.rstrip('/')

    wa = normalizar_wa_ar(d.get('whatsapp', ''))
    compra = Compra(
        email_cliente    = email,
        nombre_cliente   = nombre,
        whatsapp_cliente = wa if wa else None,
        foto_ids         = json.dumps([f.id for f in fotos]),
        monto_total      = total,
        tipo             = tipo,
        fotos_impresion_ids = json.dumps(fotos_impresion) if fotos_impresion else None,
        estado           = 'pendiente',
        token_galeria    = generar_token()
    )
    db.session.add(compra); db.session.commit()

    if not MP_HABILITADO: return jsonify({'error': 'mp_no_configurado', 'compra_id': compra.id, 'total': total}), 503

    result = MP_SDK.preference().create({
        'items': mp_items,
        'payer': {'email': email, 'name': nombre},
        'back_urls': {'success': f'{base_url}/pago-exitoso?cid={compra.id}', 'failure': f'{base_url}/pago-fallido?cid={compra.id}', 'pending': f'{base_url}/pago-exitoso?cid={compra.id}'},
        'auto_return': 'approved',
        'notification_url': f'{base_url}/mp-webhook',
        'statement_descriptor': 'NACHO LINGUA',
        'external_reference': str(compra.id)
    })

    if result['status'] == 201:
        compra.mp_preference_id = result['response']['id']; db.session.commit()
        return jsonify({'init_point': result['response']['init_point'], 'compra_id': compra.id})
    return jsonify({'error': 'Error al crear preferencia MP'}), 500

def _verificar_firma_mp(req):
    """Valida la firma 'x-signature' de Mercado Pago. Solo se activa si está
    configurado MP_WEBHOOK_SECRET en el entorno; si no, devuelve True (no valida).
    OJO: esta validación no fue probada en vivo; tenela apagada hasta confirmarla."""
    secret = os.environ.get('MP_WEBHOOK_SECRET', '')
    if not secret:
        return True  # validación desactivada
    try:
        x_sig   = req.headers.get('x-signature', '')
        x_req   = req.headers.get('x-request-id', '')
        partes  = dict(p.split('=', 1) for p in x_sig.split(',') if '=' in p)
        ts, v1  = partes.get('ts', '').strip(), partes.get('v1', '').strip()
        data_id = (req.args.get('data.id', '') or '').lower()
        manifest = f'id:{data_id};request-id:{x_req};ts:{ts};'
        firma = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(firma, v1)
    except Exception as e:
        print(f'[mp-webhook] error validando firma: {e}')
        return False


@app.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    # Validación de firma (solo si configuraste MP_WEBHOOK_SECRET)
    if not _verificar_firma_mp(request):
        print('[mp-webhook] firma inválida, descarto la notificación')
        return jsonify({'status': 'invalid signature'}), 401

    d = request.json or {}
    if d.get('type') == 'payment' and MP_HABILITADO:
        pid = d.get('data', {}).get('id')
        if pid:
            try:
                r = MP_SDK.payment().get(pid)
            except Exception as e:
                print(f'[mp-webhook] error consultando pago {pid}: {e}')
                return jsonify({'status': 'ok'}), 200
            if r.get('status') == 200:
                pay = r['response']
                # Buscar la compra por external_reference (exacto) y, si no,
                # caer a preference_id como respaldo.
                ext    = pay.get('external_reference')
                compra = None
                if ext and str(ext).isdigit():
                    compra = Compra.query.get(int(ext))
                if not compra:
                    compra = Compra.query.filter_by(
                        mp_preference_id=pay.get('preference_id')).first()
                if compra:
                    compra.mp_payment_id = str(pid)
                    compra.estado        = pay.get('status', 'desconocido')
                    db.session.commit()
                    if compra.estado == 'approved' and (
                            not compra.email_enviado or not compra.wa_enviado):
                        threading.Thread(target=entregar_compra,
                                         args=(compra.id,), daemon=True).start()
    return jsonify({'status': 'ok'}), 200

@app.route('/pago-exitoso')
def pago_exitoso():
    # NO marcamos 'approved' ni entregamos acá: el cliente puede caer en esta
    # página con un pago PENDIENTE o sin haber pagado (probando la URL). La
    # única fuente de verdad es /mp-webhook, que confirma el estado real del
    # pago consultándolo contra la API de Mercado Pago.
    return send_from_directory('.', 'pago-exitoso.html')

@app.route('/pago-fallido')
def pago_fallido():
    return send_from_directory('.', 'pago-fallido.html')

# ── CONFIGURACIÓN DE PRECIOS (parametrización, req. 3.4) ──────────────────────
@app.route('/config-precios', methods=['GET'])
def obtener_config_precios():
    cfg = get_config()
    return jsonify({
        'escala_volumen':        json.loads(cfg.escala_volumen),
        'pack_digital_precio':   cfg.pack_digital_precio,
        'pack_digital_activo':   cfg.pack_digital_activo,
        'pack_impresion_precio': cfg.pack_impresion_precio,
        'pack_impresion_activo': cfg.pack_impresion_activo,
        'upsell_trigger_qty':    cfg.upsell_trigger_qty,
    })

@app.route('/config-precios', methods=['PATCH'])
def actualizar_config_precios():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    cfg = get_config()
    d   = request.json or {}
    if 'escala_volumen' in d:
        escala = d['escala_volumen']
        if not (isinstance(escala, list) and escala and
                all(isinstance(t, dict) and 'min' in t and 'precio' in t for t in escala)):
            return jsonify({'error': 'escala_volumen inválida'}), 400
        cfg.escala_volumen = json.dumps(escala)
    if 'pack_digital_precio'   in d: cfg.pack_digital_precio   = float(d['pack_digital_precio'])
    if 'pack_digital_activo'   in d: cfg.pack_digital_activo   = bool(d['pack_digital_activo'])
    if 'pack_impresion_precio' in d: cfg.pack_impresion_precio = float(d['pack_impresion_precio'])
    if 'pack_impresion_activo' in d: cfg.pack_impresion_activo = bool(d['pack_impresion_activo'])
    if 'upsell_trigger_qty'    in d: cfg.upsell_trigger_qty    = int(d['upsell_trigger_qty'])
    db.session.commit()
    return jsonify({'ok': True})

# ── RE-WATERMARK BATCH (actualizar marca en fotos existentes) ────────────────
@app.route('/version')
def version_check():
    return jsonify({'watermark': WATERMARK_VERSION})


@app.route('/admin/re-watermark', methods=['POST'])
def admin_re_watermark():
    """
    Re-procesa las fotos existentes con la nueva marca de agua.
    Body JSON opcional: {"evento_id": 5}  → solo ese evento
                        {}                → TODAS las fotos
    Devuelve resumen de cuántas se procesaron y cuántas fallaron.
    Si el original está pendiente en Wasabi o no se puede bajar, usa el
    preview actual como fuente (re-marca sobre la marca existente) para
    no saltear ninguna foto.
    """
    if not session.get('admin'):
        return jsonify({'error': 'No autorizado'}), 403

    import urllib.request
    data      = request.json or {}
    evento_id = data.get('evento_id')

    query = Foto.query
    if evento_id:
        query = query.filter_by(evento_id=int(evento_id))
    fotos = query.all()

    ok_count = 0; fail_count = 0; skipped = 0; fallback_count = 0; errores = []

    for foto in fotos:
        orig = foto.url_original or ''
        prev = foto.url_preview or ''
        original_ok = bool(orig) and 'wasabi_pending' not in orig

        # Fuentes en orden: primero el original limpio (si está disponible);
        # si está pendiente en Wasabi o no se puede bajar, caemos al preview
        # actual para NO saltear la foto (re-marca sobre la marca existente).
        candidatos = []
        if original_ok:
            candidatos.append(orig)
        if prev:
            candidatos.append(prev)

        if not candidatos:
            skipped += 1
            continue

        ultimo_error = None
        for src in candidatos:
            try:
                dl_url = get_download_url(src)
                with urllib.request.urlopen(dl_url, timeout=30) as resp:
                    img_bytes = io.BytesIO(resp.read())
                img_marcada = agregar_watermark_5x(img_bytes)
                import time as _t
                wm_public_id = f'nacholingua/foto_{foto.id}_wm_{int(_t.time())}'
                r_wm = cloudinary.uploader.upload(
                    img_marcada, public_id=wm_public_id, resource_type='image',
                    overwrite=True, invalidate=True,
                )
                foto.url_preview = r_wm['secure_url']
                db.session.commit()
                ok_count += 1
                if src == prev:
                    fallback_count += 1
                print(f'[re-watermark] OK foto {foto.id} (fuente: {"preview" if src == prev else "original"})')
                break
            except Exception as e:
                db.session.rollback()
                ultimo_error = e
                print(f'[re-watermark] intento fallo foto {foto.id}: {e}')
        else:
            fail_count += 1
            errores.append({'foto_id': foto.id, 'error': str(ultimo_error)[:120]})
            print(f'[re-watermark] FAIL foto {foto.id}: {ultimo_error}')

    return jsonify({
        'ok': ok_count, 'fallidas': fail_count,
        'saltadas': skipped, 'desde_preview': fallback_count,
        'total': len(fotos), 'errores': errores[:10],
    })


# ── MÉTRICAS DE VENTAS (req. 4) ───────────────────────────────────────────────
@app.route('/admin/test-wa', methods=['GET'])
def admin_test_wa():
    """Prueba de envio de WhatsApp a un numero arbitrario. Devuelve la respuesta cruda de Meta.
    Autoriza con sesion de admin O con ?key=<ADMIN_PASSWORD> para poder probar desde la barra del navegador."""
    _key = request.args.get('key', '')
    if not session.get('admin') and not (ADMIN_PASSWORD and _key == ADMIN_PASSWORD):
        return jsonify({'error': 'No autorizado'}), 403
    if not META_WA_ENABLED:
        return jsonify({'ok': False, 'error': 'WhatsApp no configurado: faltan META_WA_TOKEN o META_WA_PHONE_ID en Variables.'}), 400
    to = (request.args.get('to') or '').strip().replace('+', '').replace(' ', '').replace('-', '')
    if not to:
        return jsonify({'ok': False, 'error': 'Falta el numero. Usa /admin/test-wa?to=5493546515567'}), 400
    tipo = (request.args.get('tipo') or 'plantilla').lower()
    if tipo == 'hello':
        payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
                   "template": {"name": "hello_world", "language": {"code": "en_US"}}}
    else:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
                   "template": {"name": META_WA_TEMPLATE, "language": {"code": "es_AR"},
                                "components": [{"type": "body", "parameters": [
                                    {"type": "text", "text": "Guido"},
                                    {"type": "text", "text": "https://nacholingua.com/galeria/prueba"}
                                ]}]}}
    try:
        req = urllib.request.Request(
            f"https://graph.facebook.com/{META_GRAPH_VER}/{META_WA_PHONE_ID}/messages",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {META_WA_TOKEN}"},
            method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode('utf-8'))
        return jsonify({'ok': True, 'enviado_a': to, 'tipo': tipo, 'respuesta': body})
    except Exception as e:
        detail = str(e)
        try:
            if hasattr(e, 'read'):
                detail = e.read().decode('utf-8', 'replace')
        except Exception:
            pass
        return jsonify({'ok': False, 'enviado_a': to, 'tipo': tipo, 'error': detail}), 200


@app.route('/admin/metricas', methods=['GET'])
def admin_metricas():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    from collections import defaultdict
    pagadas = Compra.query.filter_by(estado='approved').all()
    total   = len(pagadas)
    por_tipo = {'individual': 0, 'pack_digital': 0, 'pack_impresion': 0}
    suma_total = 0.0
    for c in pagadas:
        t = c.tipo if c.tipo in por_tipo else 'individual'
        por_tipo[t] += 1
        suma_total  += (c.monto_total or 0)
    packs_vendidos = por_tipo['pack_digital'] + por_tipo['pack_impresion']
    aov = round(suma_total / total, 2) if total else 0
    por_mes = defaultdict(lambda: {'n': 0, 'suma': 0.0, 'packs': 0})
    for c in pagadas:
        if not c.creada_en: continue
        k = c.creada_en.strftime('%Y-%m')
        por_mes[k]['n']    += 1
        por_mes[k]['suma'] += (c.monto_total or 0)
        if c.tipo in ('pack_digital', 'pack_impresion'):
            por_mes[k]['packs'] += 1
    serie = [{'mes': k, 'compras': v['n'], 'packs': v['packs'],
              'aov': round(v['suma'] / v['n'], 2) if v['n'] else 0}
             for k, v in sorted(por_mes.items())]
    return jsonify({
        'total_compras':               total,
        'packs_vendidos':              packs_vendidos,
        'fotos_individuales_vendidas': por_tipo['individual'],
        'aov':                         aov,
        'por_tipo':                    por_tipo,
        'serie_mensual':               serie,
    })

# ── CONTACTO ──────────────────────────────────────────────────────────────────
@app.route('/contacto', methods=['POST'])
def contacto():
    d = request.json
    db.session.add(Consulta(nombre=d.get('nombre',''), email=d.get('email',''), mensaje=d.get('mensaje','')))
    db.session.commit()
    return jsonify({'ok': True})


# ══════════════════════════════════════════════════════════════════════════════
# MÓDULO IA — ETIQUETAS, ROSTER Y BÚSQUEDA
# ══════════════════════════════════════════════════════════════════════════════

# ── WEBHOOK: recibe resultados del microservicio IA ───────────────────────────
@app.route('/ia/resultados', methods=['POST'])
def ia_resultados():
    """
    El microservicio IA llama a este endpoint con los resultados del análisis.
    Autenticación: header X-IA-Secret debe coincidir con IA_SECRET en env vars.
    """
    secret = request.headers.get('X-IA-Secret', '')
    if secret != os.environ.get('IA_SECRET', 'ia-secret-nacho-2026'):
        return jsonify({'error': 'No autorizado'}), 403

    data    = request.json
    foto_id = data.get('foto_id')
    if not foto_id:
        return jsonify({'error': 'foto_id requerido'}), 400

    foto = Foto.query.get(foto_id)
    if not foto:
        return jsonify({'error': 'Foto no encontrada'}), 404

    # Borrar etiquetas anteriores de IA (no las manuales)
    FotoEtiqueta.query.filter_by(foto_id=foto_id, fuente='ia').delete()

    jugadores = data.get('jugadores', [])  # lista de jugadores detectados
    for j in jugadores:
        etiqueta = FotoEtiqueta(
            foto_id          = foto_id,
            jugador_nombre   = j.get('nombre'),
            numero_camiseta  = j.get('numero'),
            confianza_cara   = float(j.get('confianza_cara', 0)),
            confianza_numero = float(j.get('confianza_numero', 0)),
            fuente           = 'ia'
        )
        db.session.add(etiqueta)

    db.session.commit()
    print(f"✓ IA: {len(jugadores)} etiqueta(s) guardadas para foto #{foto_id}")
    return jsonify({'ok': True, 'etiquetas': len(jugadores)})

# ── ETIQUETA MANUAL (admin corrige o agrega) ──────────────────────────────────
@app.route('/foto/<int:foto_id>/etiqueta', methods=['POST'])
def agregar_etiqueta_manual(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get_or_404(foto_id)
    d    = request.json
    etiqueta = FotoEtiqueta(
        foto_id         = foto_id,
        jugador_nombre  = d.get('nombre', '').strip(),
        numero_camiseta = d.get('numero', '').strip(),
        confianza_cara  = 1.0,
        confianza_numero= 1.0,
        fuente          = 'manual'
    )
    db.session.add(etiqueta); db.session.commit()
    return jsonify({'ok': True, 'id': etiqueta.id})

@app.route('/foto/<int:foto_id>/etiqueta/<int:et_id>', methods=['DELETE'])
def borrar_etiqueta(foto_id, et_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    et = FotoEtiqueta.query.filter_by(id=et_id, foto_id=foto_id).first_or_404()
    db.session.delete(et); db.session.commit()
    return jsonify({'ok': True})

# ── BÚSQUEDA POR NOMBRE O NÚMERO ─────────────────────────────────────────────
@app.route('/buscar-jugador', methods=['GET'])
def buscar_jugador():
    q          = request.args.get('q', '').strip()
    evento_id  = request.args.get('evento_id', type=int)
    if not q or len(q) < 2:
        return jsonify({'fotos': []})

    query = FotoEtiqueta.query.join(Foto)
    if evento_id:
        query = query.filter(Foto.evento_id == evento_id)

    # Buscar por nombre o número
    query = query.filter(
        db.or_(
            FotoEtiqueta.jugador_nombre.ilike(f'%{q}%'),
            FotoEtiqueta.numero_camiseta == q
        )
    )

    etiquetas = query.all()
    fotos_vistas = set()
    resultado = []
    for et in etiquetas:
        if et.foto_id not in fotos_vistas:
            fotos_vistas.add(et.foto_id)
            resultado.append({
                'foto_id':     et.foto_id,
                'url_preview': et.foto.url_preview,
                'precio':      et.foto.precio,
                'evento_id':   et.foto.evento_id,
                'jugador':     et.jugador_nombre,
                'numero':      et.numero_camiseta,
                'fuente':      et.fuente,
            })
    return jsonify({'fotos': resultado, 'total': len(resultado)})

# ── ROSTER DE JUGADORES POR EVENTO ───────────────────────────────────────────
@app.route('/evento/<int:ev_id>/roster', methods=['GET'])
def get_roster(ev_id):
    roster = JugadorRoster.query.filter_by(evento_id=ev_id).order_by(JugadorRoster.numero).all()
    return jsonify([{
        'id': r.id, 'numero': r.numero, 'nombre': r.nombre, 'equipo': r.equipo
    } for r in roster])

@app.route('/evento/<int:ev_id>/roster', methods=['POST'])
def agregar_jugador(ev_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    d = request.json
    # Si ya existe ese número en ese evento, actualizar
    existente = JugadorRoster.query.filter_by(evento_id=ev_id, numero=d.get('numero','')).first()
    if existente:
        existente.nombre = d.get('nombre', '')
        existente.equipo = d.get('equipo', '')
    else:
        jugador = JugadorRoster(
            evento_id = ev_id,
            numero    = d.get('numero', '').strip(),
            nombre    = d.get('nombre', '').strip(),
            equipo    = d.get('equipo', '').strip()
        )
        db.session.add(jugador)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/evento/<int:ev_id>/roster/<int:jid>', methods=['DELETE'])
def borrar_jugador(ev_id, jid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    j = JugadorRoster.query.filter_by(id=jid, evento_id=ev_id).first_or_404()
    db.session.delete(j); db.session.commit()
    return jsonify({'ok': True})

@app.route('/evento/<int:ev_id>/roster/bulk', methods=['POST'])
def roster_bulk(ev_id):
    """Carga masiva: lista de {numero, nombre, equipo}"""
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    jugadores = request.json.get('jugadores', [])
    for j in jugadores:
        numero = str(j.get('numero', '')).strip()
        nombre = str(j.get('nombre', '')).strip()
        if not numero or not nombre: continue
        existente = JugadorRoster.query.filter_by(evento_id=ev_id, numero=numero).first()
        if existente:
            existente.nombre = nombre
            existente.equipo = j.get('equipo', '')
        else:
            db.session.add(JugadorRoster(evento_id=ev_id, numero=numero,
                                         nombre=nombre, equipo=j.get('equipo','')))
    db.session.commit()
    return jsonify({'ok': True, 'total': len(jugadores)})

# ── TRIGGER: encolar foto para procesamiento IA ───────────────────────────────
@app.route('/foto/<int:foto_id>/procesar-ia', methods=['POST'])
def encolar_foto_ia(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get_or_404(foto_id)
    ia_url = os.environ.get('IA_SERVICE_URL', '')
    if not ia_url:
        return jsonify({'error': 'Microservicio IA no configurado (IA_SERVICE_URL)'}), 503

    # Roster del evento para ayudar a la IA
    roster = JugadorRoster.query.filter_by(evento_id=foto.evento_id).all()
    roster_data = [{'numero': r.numero, 'nombre': r.nombre, 'equipo': r.equipo}
                   for r in roster]

    payload = {
        'foto_id':    foto_id,
        'url_imagen': foto.url_original,
        'evento_id':  foto.evento_id,
        'roster':     roster_data,
        'callback':   f"{os.environ.get('BASE_URL','')}/ia/resultados"
    }

    try:
        req = urllib.request.Request(
            f"{ia_url}/procesar",
            data    = json.dumps(payload).encode('utf-8'),
            headers = {
                'Content-Type':  'application/json',
                'X-IA-Secret':   os.environ.get('IA_SECRET', 'ia-secret-nacho-2026')
            },
            method = 'POST'
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read().decode())
            return jsonify({'ok': True, 'mensaje': 'Foto encolada para procesamiento'})
    except Exception as e:
        return jsonify({'error': f'No se pudo conectar con el microservicio: {e}'}), 503

@app.route('/evento/<int:ev_id>/procesar-ia-todo', methods=['POST'])
def procesar_evento_completo(ev_id):
    """Encola TODAS las fotos de un evento para procesamiento IA en background."""
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    ia_url = os.environ.get('IA_SERVICE_URL', '')
    if not ia_url:
        return jsonify({'error': 'Microservicio IA no configurado'}), 503

    ev    = Evento.query.get_or_404(ev_id)
    fotos = ev.fotos
    roster = JugadorRoster.query.filter_by(evento_id=ev_id).all()
    roster_data = [{'numero': r.numero, 'nombre': r.nombre, 'equipo': r.equipo}
                   for r in roster]

    def encolar_todas():
        with app.app_context():
            for foto in fotos:
                try:
                    payload = {
                        'foto_id':    foto.id,
                        'url_imagen': foto.url_original,
                        'evento_id':  ev_id,
                        'roster':     roster_data,
                        'callback':   f"{os.environ.get('BASE_URL','')}/ia/resultados"
                    }
                    req = urllib.request.Request(
                        f"{ia_url}/procesar",
                        data    = json.dumps(payload).encode(),
                        headers = {'Content-Type': 'application/json',
                                   'X-IA-Secret': os.environ.get('IA_SECRET','ia-secret-nacho-2026')},
                        method  = 'POST'
                    )
                    urllib.request.urlopen(req, timeout=10)
                except Exception as e:
                    print(f"Error encolando foto {foto.id}: {e}")
    
    threading.Thread(target=encolar_todas, daemon=True).start()
    return jsonify({'ok': True, 'total_fotos': len(fotos),
                    'mensaje': f'Procesando {len(fotos)} fotos en background'})

# ── ADMIN ─────────────────────────────────────────────────────────────────────
@app.route('/admin/stats', methods=['GET'])
def admin_stats():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    return jsonify({
        'total_fotos': Foto.query.count(), 'total_eventos': Evento.query.count(),
        'total_compras': Compra.query.filter_by(estado='approved').count(),
        'ingresos': float(db.session.query(db.func.sum(Compra.monto_total)).filter_by(estado='approved').scalar() or 0),
        'emails_pend': Compra.query.filter_by(estado='approved', email_enviado=False).count(),
        'mensajes_nue': Consulta.query.filter_by(leida=False).count()
    })

@app.route('/admin/compras', methods=['GET'])
def ver_compras():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    base = os.environ.get('BASE_URL', request.host_url.rstrip('/'))
    return jsonify([{
        'id':            c.id,
        'email':         c.email_cliente,
        'nombre':        c.nombre_cliente,
        'whatsapp':      c.whatsapp_cliente,
        'foto_ids':      json.loads(c.foto_ids or '[]'),
        'total':         c.monto_total,
        'estado':        c.estado,
        'email_enviado': c.email_enviado,
        'wa_enviado':    c.wa_enviado,
        'link_galeria':  f"{base}/galeria/{c.token_galeria}" if c.token_galeria else None,
        'fecha':         c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
    } for c in Compra.query.order_by(Compra.creada_en.desc()).all()])

@app.route('/admin/compras/<int:cid>/reenviar', methods=['POST'])
def reenviar_todo(cid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    compra = Compra.query.get_or_404(cid)
    compra.email_enviado = False
    compra.wa_enviado    = False
    db.session.commit()
    threading.Thread(target=entregar_compra, args=(cid,), daemon=True).start()
    return jsonify({'ok': True})

@app.route('/admin/consultas', methods=['GET'])
def ver_consultas():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    return jsonify([{
        'id': c.id, 'nombre': c.nombre, 'email': c.email, 'mensaje': c.mensaje, 'leida': c.leida,
        'fecha': c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
    } for c in Consulta.query.order_by(Consulta.creada_en.desc()).all()])

@app.route('/admin/consultas/<int:cid>/leer', methods=['PATCH'])
def marcar_leida(cid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    c = Consulta.query.get(cid)
    if c: c.leida = True; db.session.commit()
    return jsonify({'ok': True})

# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    d = request.json or {}
    if ADMIN_PASSWORD and d.get('password') == ADMIN_PASSWORD:
        session.permanent = True; session['admin'] = True; return jsonify({'success': True})
    return jsonify({'success': False}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth(): return jsonify({'isAdmin': session.get('admin', False)})

@app.route('/logout', methods=['POST'])
def logout(): session.pop('admin', None); return jsonify({'success': True})

@app.route('/test-wasabi')
def test_wasabi():
    import time
    resultados = {}

    # Test 1: Variables de entorno
    resultados['wasabi_enabled'] = WASABI_ENABLED
    resultados['bucket'] = WASABI_BUCKET
    resultados['endpoint'] = WASABI_ENDPOINT
    resultados['region'] = WASABI_REGION
    resultados['access_key_ok'] = bool(WASABI_ACCESS_KEY)

    # Test 2: Conexión a Wasabi
    try:
        t0 = time.time()
        client = get_wasabi_client()
        client.list_objects_v2(Bucket=WASABI_BUCKET, MaxKeys=1)
        resultados['conexion_wasabi'] = f'OK ({time.time()-t0:.1f}s)'
    except Exception as e:
        resultados['conexion_wasabi'] = f'ERROR: {str(e)}'

    # Test 3: Cloudinary
    try:
        t0 = time.time()
        import cloudinary.api
        cloudinary.api.ping()
        resultados['conexion_cloudinary'] = f'OK ({time.time()-t0:.1f}s)'
    except Exception as e:
        resultados['conexion_cloudinary'] = f'ERROR: {str(e)}'

    # Test 4: Escritura en disco
    try:
        ruta = os.path.join(CARPETA_TEMP, 'test_write.txt')
        with open(ruta, 'w') as f:
            f.write('test')
        os.remove(ruta)
        resultados['escritura_disco'] = 'OK'
    except Exception as e:
        resultados['escritura_disco'] = f'ERROR: {str(e)}'

    return jsonify(resultados)


@app.route('/cloudinary-signature', methods=['POST'])
def cloudinary_signature():
    """Genera una firma para upload directo desde el browser a Cloudinary"""
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    
    data      = request.json or {}
    evento_id = data.get('evento_id', 'general')
    folder    = f'nacho_lingua/previews/evento_{evento_id}'
    timestamp = int(_time.time())
    
    # Parámetros que se firman
    params_to_sign = f"folder={folder}&timestamp={timestamp}&upload_preset=ml_default"
    api_secret     = os.environ.get('CLOUD_API_SECRET', '')
    signature      = hashlib.sha256(f"{params_to_sign}{api_secret}".encode()).hexdigest()
    
    return jsonify({
        'signature':  signature,
        'timestamp':  timestamp,
        'folder':     folder,
        'api_key':    os.environ.get('CLOUD_API_KEY', ''),
        'cloud_name': os.environ.get('CLOUD_NAME', '')
    })

@app.route('/registrar-foto', methods=['POST'])
def registrar_foto():
    """Registra en BD una foto subida a Cloudinary desde el browser,
    aplicando marca de agua antes de guardar el preview."""
    if not session.get('admin'):
        return jsonify({'error': 'No autorizado'}), 403

    data      = request.json or {}
    url_clean = data.get('url_preview')
    evento_id = data.get('evento_id')
    precio    = float(data.get('precio', 3000))
    public_id = data.get('public_id', '')

    if not url_clean or not evento_id:
        return jsonify({'error': 'Faltan datos'}), 400

    # ── 1) Bajar el original limpio UNA sola vez (sirve para marca y Wasabi) ─
    import urllib.request, time as _t2
    raw = None
    try:
        with urllib.request.urlopen(url_clean) as resp:
            raw = resp.read()
    except Exception as e:
        print(f'[registrar-foto] no pude bajar el original: {e}')

    # ── 2) Marca de agua -> preview LIVIANA en Cloudinary ─────────────────
    url_preview = url_clean
    if raw is not None:
        try:
            img_marcada  = agregar_watermark_5x(io.BytesIO(raw))
            wm_public_id = (public_id + f'_wm_{int(_t2.time())}') if public_id else None
            r_wm = cloudinary.uploader.upload(
                img_marcada, folder='nacholingua', public_id=wm_public_id,
                resource_type='image', invalidate=True,
            )
            url_preview = r_wm['secure_url']
            print(f'[registrar-foto] watermark OK -> {url_preview[:70]}...')
        except Exception as e:
            print(f'[registrar-foto] watermark fallo, guardando sin marca: {e}')

    # ── 3) Original -> WASABI y se BORRA de Cloudinary (libera los 25 GB) ─────
    #     Si Wasabi falla o no esta configurado, el original queda en Cloudinary
    #     (igual que antes) para no perder la foto ni romper la compra.
    url_original = url_clean.replace('/upload/', '/upload/q_100/')
    if raw is not None and WASABI_ENABLED:
        try:
            base_id  = (public_id.split('/')[-1] if public_id else 'foto')
            key_orig = f"nacho_lingua/originales/evento_{evento_id}/{base_id}_{int(_t2.time())}.jpg"
            wasabi_url = subir_bytes_a_wasabi(raw, key_orig)
            if wasabi_url:
                url_original = wasabi_url
                if public_id:
                    try:
                        cloudinary.uploader.destroy(public_id, invalidate=True)
                        print(f'[registrar-foto] original borrado de Cloudinary: {public_id}')
                    except Exception as e:
                        print(f'[registrar-foto] no pude borrar de Cloudinary: {e}')
        except Exception as e:
            print(f'[registrar-foto] Wasabi fallo, dejo original en Cloudinary: {e}')

    # ── 4) Portada LIMPIA (sin marca, baja resolucion) para el showcase ──────
    url_cover = _generar_cover_limpia(raw) if raw is not None else None

    foto = Foto(
        url_preview  = url_preview,
        url_original = url_original,
        url_cover    = url_cover,
        precio       = precio,
        evento_id    = evento_id,
    )
    db.session.add(foto)
    db.session.commit()

    return jsonify({'ok': True, 'id': foto.id, 'url_preview': url_preview})

@app.route('/admin/migrar-wasabi', methods=['POST'])
def migrar_wasabi():
    """Mueve a Wasabi los originales que hoy estan en Cloudinary y los borra de
    Cloudinary (uso unico, para las fotos viejas). Solo admin."""
    if not session.get('admin'):
        return jsonify({'error': 'No autorizado'}), 403
    if not WASABI_ENABLED:
        return jsonify({'error': 'Wasabi no esta configurado (faltan WASABI_ACCESS_KEY / WASABI_SECRET_KEY)'}), 400

    import urllib.request, time as _t3
    movidas = fallidas = ya_wasabi = sin_original = 0

    for f in Foto.query.all():
        orig = f.url_original or ''
        if not orig or 'wasabi_pending' in orig:
            sin_original += 1; continue
        if 'wasabisys.com' in orig or (WASABI_BUCKET and WASABI_BUCKET in orig):
            ya_wasabi += 1; continue
        if 'res.cloudinary.com' not in orig and '/upload/' not in orig:
            continue
        try:
            with urllib.request.urlopen(orig) as resp:
                raw = resp.read()
            key  = f"nacho_lingua/originales/evento_{f.evento_id}/migrada_{f.id}_{int(_t3.time())}.jpg"
            wurl = subir_bytes_a_wasabi(raw, key)
            if not wurl:
                fallidas += 1; continue
            pid = _cloudinary_public_id_de_url(orig)
            if pid:
                try:
                    cloudinary.uploader.destroy(pid, invalidate=True)
                except Exception as e:
                    print(f'[migrar-wasabi] no pude borrar {pid}: {e}')
            f.url_original = wurl
            db.session.commit()
            movidas += 1
        except Exception as e:
            print(f'[migrar-wasabi] foto {f.id} fallo: {e}')
            fallidas += 1

    return jsonify({'ok': True, 'movidas': movidas, 'ya_en_wasabi': ya_wasabi,
                    'fallidas': fallidas, 'sin_original': sin_original})


@app.route('/admin/generar-covers', methods=['POST'])
def generar_covers():
    """Genera la portada limpia (sin marca) de las fotos que aun no la tienen."""
    if not session.get('admin'):
        return jsonify({'error': 'No autorizado'}), 403
    import urllib.request
    generadas = fallidas = ya = sin_original = 0
    errores = []
    for f in Foto.query.all():
        if getattr(f, 'url_cover', None):
            ya += 1; continue
        if not f.url_original:
            sin_original += 1; continue
        try:
            srcu = get_download_url(f.url_original)
            req  = urllib.request.Request(srcu, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            u = _generar_cover_limpia(raw)
            if u:
                f.url_cover = u; db.session.commit(); generadas += 1
            else:
                fallidas += 1
                if len(errores) < 5: errores.append(f'foto {f.id}: la generacion devolvio None')
        except urllib.error.HTTPError as e:
            db.session.rollback(); fallidas += 1
            cuerpo = ''
            try: cuerpo = e.read().decode('utf-8', 'ignore')[:350]
            except Exception: pass
            if len(errores) < 3:
                errores.append(f'foto {f.id}: HTTP {e.code} -> {cuerpo}')
        except Exception as e:
            db.session.rollback(); fallidas += 1
            if len(errores) < 3:
                errores.append(f'foto {f.id}: {type(e).__name__}: {str(e)[:200]}')
    return jsonify({'ok': True, 'generadas': generadas, 'ya_tenian': ya,
                    'fallidas': fallidas, 'sin_original': sin_original, 'errores': errores})


@app.route('/admin/diag-wasabi', methods=['GET'])
def diag_wasabi():
    """Diagnostico: intenta bajar el original de la primera foto y devuelve el detalle."""
    if not session.get('admin'):
        return jsonify({'error': 'No autorizado'}), 403
    import urllib.request
    f = Foto.query.first()
    if not f:
        return jsonify({'error': 'no hay fotos'})
    info = {'foto_id': f.id, 'url_original': f.url_original, 'bucket': WASABI_BUCKET,
            'region': WASABI_REGION, 'endpoint': WASABI_ENDPOINT, 'wasabi_enabled': WASABI_ENABLED}
    try:
        ruta = urllib.parse.urlparse(f.url_original or '').path.lstrip('/')
        if WASABI_BUCKET and ruta.startswith(WASABI_BUCKET + '/'):
            key = ruta[len(WASABI_BUCKET) + 1:]
        else:
            key = ruta.split('/', 1)[1] if '/' in ruta else ruta
        info['key'] = key
        presigned = get_wasabi_presigned_url(key)
        info['presigned_ok']   = bool(presigned)
        info['presigned_host'] = urllib.parse.urlparse(presigned).netloc if presigned else None
        try:
            req = urllib.request.Request(presigned, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                info['download_status'] = resp.status
                info['download_bytes']  = len(data)
        except urllib.error.HTTPError as e:
            cuerpo = ''
            try: cuerpo = e.read().decode('utf-8', 'ignore')[:450]
            except Exception: pass
            info['download_error'] = f'HTTP {e.code}'
            info['wasabi_dice']    = cuerpo
        except Exception as e:
            info['download_error'] = f'{type(e).__name__}: {str(e)[:250]}'
    except Exception as e:
        info['error'] = f'{type(e).__name__}: {str(e)[:250]}'
    return jsonify(info)


if __name__ == '__main__':
    app.run(debug=True, port=5000)