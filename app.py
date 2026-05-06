"""
NACHO LINGUA FOTOGRAFÍA — Backend Flask 2026
Persistencia: PostgreSQL (Render) + Cloudinary (imágenes)
"""

import os, json, smtplib, io, threading, math
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import timedelta
from flask import (Flask, request, send_from_directory,
                   jsonify, session, send_file)
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
import cloudinary, cloudinary.uploader

# ── CLOUDINARY ────────────────────────────────────────────────────────────────
cloudinary.config(
    cloud_name = os.environ.get('CLOUD_NAME'),
    api_key    = os.environ.get('CLOUD_API_KEY'),
    api_secret = os.environ.get('CLOUD_API_SECRET'),
    secure     = True
)

# ── APP ───────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'nl-sports-2026-CAMBIAR-en-produccion')

# ── BASE DE DATOS ─────────────────────────────────────────────────────────────
# IMPORTANTE: En Render, añadir un PostgreSQL gratuito y copiar su DATABASE_URL
# como variable de entorno. Sin esto, SQLite se borra con cada reinicio.
database_url = os.environ.get('DATABASE_URL', 'sqlite:///datos.db')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI']        = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS']      = {
    'pool_pre_ping': True,      # reconnect automático
    'pool_recycle':  300,
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

# ── DEEPFACE IA ───────────────────────────────────────────────────────────────
try:
    from deepface import DeepFace
    import numpy as np
    FACES_ENABLED = True
    print('✓ DeepFace activo — detección de rostros habilitada')
except ImportError:
    FACES_ENABLED = False
    print('⚠ DeepFace no disponible')

FACE_MODEL    = 'Facenet'
FACE_DETECTOR = 'opencv'
FACE_UMBRAL   = 0.62

# ── MODELOS ───────────────────────────────────────────────────────────────────
class Evento(db.Model):
    __tablename__ = 'evento'
    id          = db.Column(db.Integer, primary_key=True)
    titulo      = db.Column(db.String(150), nullable=False)
    deporte     = db.Column(db.String(50),  nullable=False)
    fecha       = db.Column(db.String(50))
    descripcion = db.Column(db.String(300))
    creado_en   = db.Column(db.DateTime, server_default=db.func.now())
    fotos       = db.relationship('Foto', backref='evento', lazy=True,
                                  cascade='all, delete-orphan')
    personas    = db.relationship('PersonaCluster', backref='evento', lazy=True,
                                  cascade='all, delete-orphan')

class Foto(db.Model):
    __tablename__ = 'foto'
    id           = db.Column(db.Integer, primary_key=True)
    url_preview  = db.Column(db.String(500), nullable=False)
    url_original = db.Column(db.String(500), nullable=False)
    precio       = db.Column(db.Float, default=3500.0)
    evento_id    = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    subida_en    = db.Column(db.DateTime, server_default=db.func.now())
    rostros      = db.relationship('RostroDetectado', backref='foto', lazy=True,
                                   cascade='all, delete-orphan')

class PersonaCluster(db.Model):
    __tablename__ = 'persona_cluster'
    id            = db.Column(db.Integer, primary_key=True)
    evento_id     = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    nombre        = db.Column(db.String(100))
    embedding_ref = db.Column(db.Text)
    cara_url      = db.Column(db.String(500))
    total_fotos   = db.Column(db.Integer, default=0)
    rostros       = db.relationship('RostroDetectado', backref='persona', lazy=True)

class RostroDetectado(db.Model):
    __tablename__ = 'rostro_detectado'
    id         = db.Column(db.Integer, primary_key=True)
    foto_id    = db.Column(db.Integer, db.ForeignKey('foto.id'),            nullable=False)
    persona_id = db.Column(db.Integer, db.ForeignKey('persona_cluster.id'), nullable=False)
    embedding  = db.Column(db.Text)
    cara_url   = db.Column(db.String(500))
    confianza  = db.Column(db.Float, default=1.0)

class Compra(db.Model):
    __tablename__ = 'compra'
    id               = db.Column(db.Integer, primary_key=True)
    mp_preference_id = db.Column(db.String(250))
    mp_payment_id    = db.Column(db.String(100))
    email_cliente    = db.Column(db.String(150), nullable=False)
    nombre_cliente   = db.Column(db.String(150))
    foto_ids         = db.Column(db.Text)
    monto_total      = db.Column(db.Float)
    estado           = db.Column(db.String(50), default='pendiente')
    email_enviado    = db.Column(db.Boolean, default=False)
    creada_en        = db.Column(db.DateTime, server_default=db.func.now())

class Consulta(db.Model):
    __tablename__ = 'consulta'
    id        = db.Column(db.Integer, primary_key=True)
    nombre    = db.Column(db.String(100))
    email     = db.Column(db.String(100))
    mensaje   = db.Column(db.Text)
    leida     = db.Column(db.Boolean, default=False)
    creada_en = db.Column(db.DateTime, server_default=db.func.now())

with app.app_context():
    db.create_all()

# ── IA: COSINE SIMILARITY ─────────────────────────────────────────────────────
def cosine_sim(a, b):
    if not FACES_ENABLED:
        return 0.0
    a, b = np.array(a), np.array(b)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))

# ── IA: DETECCIÓN DE ROSTROS ──────────────────────────────────────────────────
def detectar_rostros(ruta_imagen, foto_id, evento_id):
    if not FACES_ENABLED:
        return
    try:
        resultados = DeepFace.represent(
            img_path         = ruta_imagen,
            model_name       = FACE_MODEL,
            detector_backend = FACE_DETECTOR,
            enforce_detection = False
        )
        if not resultados:
            return

        img_pil = Image.open(ruta_imagen).convert('RGB')
        iw, ih  = img_pil.size

        with app.app_context():
            for res in resultados:
                emb    = res.get('embedding', [])
                region = res.get('facial_area', {})
                if not emb or not region:
                    continue
                x = int(region.get('x', 0))
                y = int(region.get('y', 0))
                w = int(region.get('w', 0))
                h = int(region.get('h', 0))
                if w < 30 or h < 30:
                    continue

                # Recortar cara con margen
                m  = int(max(w, h) * 0.25)
                x1 = max(0,  x - m);  y1 = max(0,  y - m)
                x2 = min(iw, x+w+m);  y2 = min(ih, y+h+m)
                cara = img_pil.crop((x1, y1, x2, y2)).resize((200, 200), Image.LANCZOS)

                buf = io.BytesIO()
                cara.save(buf, format='JPEG', quality=85)
                buf.seek(0)
                cara_url = None
                try:
                    r = cloudinary.uploader.upload(
                        buf, folder=f'nacho_lingua/caras/evento_{evento_id}',
                        public_id=f'cara_{foto_id}_{x}_{y}'
                    )
                    cara_url = r['secure_url']
                except Exception:
                    pass

                # Buscar cluster existente
                clusters  = PersonaCluster.query.filter_by(evento_id=evento_id).all()
                asignada  = None
                mejor_sim = 0.0
                for c in clusters:
                    try:
                        sim = cosine_sim(emb, json.loads(c.embedding_ref))
                        if sim > mejor_sim:
                            mejor_sim = sim; asignada = c
                    except Exception:
                        continue

                if asignada and mejor_sim >= FACE_UMBRAL:
                    try:
                        emb_ref = np.array(json.loads(asignada.embedding_ref))
                        n = asignada.total_fotos
                        asignada.embedding_ref = json.dumps(
                            ((emb_ref * n + np.array(emb)) / (n + 1)).tolist()
                        )
                    except Exception:
                        pass
                    asignada.total_fotos += 1
                else:
                    asignada = PersonaCluster(
                        evento_id     = evento_id,
                        embedding_ref = json.dumps(emb),
                        cara_url      = cara_url,
                        total_fotos   = 1
                    )
                    db.session.add(asignada)
                    db.session.flush()

                db.session.add(RostroDetectado(
                    foto_id    = foto_id,
                    persona_id = asignada.id,
                    embedding  = json.dumps(emb),
                    cara_url   = cara_url,
                    confianza  = float(mejor_sim)
                ))
            db.session.commit()
            print(f'✓ Rostros procesados: foto #{foto_id}')
    except Exception as e:
        print(f'⚠ Error IA foto #{foto_id}: {e}')

# ── MARCA DE AGUA ─────────────────────────────────────────────────────────────
def agregar_watermark(ruta_entrada, ruta_salida, texto='© NACHO LINGUA'):
    try:
        base      = Image.open(ruta_entrada).convert('RGBA')
        overlay   = Image.new('RGBA', base.size, (255, 255, 255, 0))
        draw      = ImageDraw.Draw(overlay)
        fontsize  = int(base.width / 14)
        try:    font = ImageFont.truetype('arial.ttf', size=fontsize)
        except: font = ImageFont.load_default()
        angulo = -25
        for y0 in range(-base.height, base.height * 2, int(fontsize * 4.5)):
            for x0 in range(-base.width, base.width * 2, int(base.width / 2.5)):
                x = x0 + y0 * math.tan(math.radians(-angulo))
                draw.text((x, y0), texto, font=font, fill=(255, 255, 255, 55))
        Image.alpha_composite(base, overlay).convert('RGB').save(
            ruta_salida, 'JPEG', quality=82
        )
        return True
    except Exception as e:
        print(f'Error watermark: {e}'); return False

# ── EMAIL ─────────────────────────────────────────────────────────────────────
def enviar_fotos_email(compra_id):
    compra = Compra.query.get(compra_id)
    if not compra or compra.email_enviado: return False
    if not SMTP_USER or not SMTP_PASS:
        print('SMTP no configurado'); return False

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
              <a href="{f.url_original}"
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

# ── EVENTOS ───────────────────────────────────────────────────────────────────
@app.route('/crear-evento', methods=['POST'])
def crear_evento():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    d  = request.json
    ev = Evento(titulo=d.get('titulo',''), deporte=d.get('deporte',''),
                fecha=d.get('fecha',''), descripcion=d.get('descripcion',''))
    db.session.add(ev); db.session.commit()
    return jsonify({'id': ev.id, 'mensaje': 'Evento creado'})

@app.route('/obtener-eventos', methods=['GET'])
def obtener_eventos():
    eventos = Evento.query.order_by(Evento.id.desc()).all()
    return jsonify([{
        'id': e.id, 'titulo': e.titulo, 'deporte': e.deporte,
        'fecha': e.fecha, 'descripcion': e.descripcion,
        'total_fotos': len(e.fotos),
        'fotos': [{'id': f.id, 'url_preview': f.url_preview, 'precio': f.precio}
                  for f in e.fotos]
    } for e in eventos])

@app.route('/editar-evento/<int:ev_id>', methods=['PATCH'])
def editar_evento(ev_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    ev = Evento.query.get_or_404(ev_id)
    d  = request.json
    if 'titulo'      in d: ev.titulo      = d['titulo']
    if 'deporte'     in d: ev.deporte     = d['deporte']
    if 'fecha'       in d: ev.fecha       = d['fecha']
    if 'descripcion' in d: ev.descripcion = d['descripcion']
    db.session.commit()
    return jsonify({'ok': True})

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
    precio    = float(request.form.get('precio', 3500))
    filename  = f"{evento_id}_{archivo.filename}"

    ruta_orig    = os.path.join(CARPETA_TEMP, 'orig_'    + filename)
    ruta_preview = os.path.join(CARPETA_TEMP, 'preview_' + filename)
    archivo.save(ruta_orig)

    # Original en Cloudinary (sin marca de agua)
    try:
        r_orig       = cloudinary.uploader.upload(
            ruta_orig, folder=f'nacho_lingua/originales/evento_{evento_id}',
            quality='auto:best'
        )
        url_original = r_orig['secure_url']
    except Exception as e:
        try: os.remove(ruta_orig)
        except: pass
        return jsonify({'error': f'Error Cloudinary original: {e}'}), 500

    # Preview con marca de agua
    if not agregar_watermark(ruta_orig, ruta_preview):
        try: os.remove(ruta_orig)
        except: pass
        return jsonify({'error': 'Error al procesar imagen'}), 500

    try:
        r_prev      = cloudinary.uploader.upload(
            ruta_preview, folder=f'nacho_lingua/previews/evento_{evento_id}'
        )
        url_preview = r_prev['secure_url']
    except Exception as e:
        for f in [ruta_orig, ruta_preview]:
            try: os.remove(f)
            except: pass
        return jsonify({'error': f'Error Cloudinary preview: {e}'}), 500

    foto = Foto(url_preview=url_preview, url_original=url_original,
                precio=precio, evento_id=evento_id)
    db.session.add(foto); db.session.commit()

    # IA de rostros en background
    if FACES_ENABLED:
        t = threading.Thread(
            target=detectar_rostros,
            args=(ruta_orig, foto.id, int(evento_id)),
            daemon=True
        )
        t.start()
    else:
        for f in [ruta_orig, ruta_preview]:
            try: os.remove(f)
            except: pass

    return jsonify({
        'ok': True, 'id': foto.id,
        'url_preview': url_preview,
        'ia_procesando': FACES_ENABLED
    })

@app.route('/editar-precio/<int:foto_id>', methods=['PATCH'])
def editar_precio(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get_or_404(foto_id)
    data = request.json
    foto.precio = float(data.get('precio', foto.precio))
    db.session.commit()
    return jsonify({'ok': True, 'precio': foto.precio})

@app.route('/borrar-foto/<int:foto_id>', methods=['DELETE'])
def borrar_foto(foto_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    foto = Foto.query.get(foto_id)
    if not foto: return jsonify({'error': 'No encontrada'}), 404
    db.session.delete(foto); db.session.commit()
    return jsonify({'ok': True})

# ── PERSONAS / CLUSTERS ────────────────────────────────────────────────────────
@app.route('/evento/<int:evento_id>/personas', methods=['GET'])
def obtener_personas(evento_id):
    personas = PersonaCluster.query.filter_by(evento_id=evento_id)\
                                   .order_by(PersonaCluster.total_fotos.desc()).all()
    resultado = []
    for p in personas:
        fids = list({r.foto_id for r in p.rostros})
        if not fids: continue
        resultado.append({
            'id': p.id, 'nombre': p.nombre or f'Persona #{p.id}',
            'cara_url': p.cara_url, 'total_fotos': p.total_fotos, 'foto_ids': fids
        })
    return jsonify({'personas': resultado, 'ia_habilitada': FACES_ENABLED,
                    'total_personas': len(resultado)})

@app.route('/persona/<int:pid>/nombre', methods=['PATCH'])
def etiquetar_persona(pid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    p = PersonaCluster.query.get_or_404(pid)
    p.nombre = request.json.get('nombre', '').strip()
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/persona/<int:pid>', methods=['DELETE'])
def borrar_persona(pid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    p = PersonaCluster.query.get_or_404(pid)
    db.session.delete(p); db.session.commit()
    return jsonify({'ok': True})

@app.route('/evento/<int:evento_id>/reprocesar-rostros', methods=['POST'])
def reprocesar_rostros(evento_id):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    if not FACES_ENABLED:        return jsonify({'error': 'IA no disponible'}), 503
    ev = Evento.query.get_or_404(evento_id)
    PersonaCluster.query.filter_by(evento_id=evento_id).delete()
    db.session.commit()
    fotos = Foto.query.filter_by(evento_id=evento_id).all()

    def procesar_batch():
        import urllib.request, tempfile
        for f in fotos:
            try:
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    urllib.request.urlretrieve(f.url_original, tmp.name)
                    detectar_rostros(tmp.name, f.id, evento_id)
                os.remove(tmp.name)
            except Exception as e:
                print(f'Error reprocesando foto #{f.id}: {e}')

    threading.Thread(target=procesar_batch, daemon=True).start()
    return jsonify({'ok': True, 'mensaje': f'Reprocesando {len(fotos)} fotos en background'})

# ── COMPRAS ───────────────────────────────────────────────────────────────────
@app.route('/crear-orden', methods=['POST'])
def crear_orden():
    d        = request.json
    foto_ids = d.get('foto_ids', [])
    email    = d.get('email', '').strip()
    nombre   = d.get('nombre', '').strip()
    if not foto_ids or not email:
        return jsonify({'error': 'Datos incompletos'}), 400

    fotos = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos: return jsonify({'error': 'Fotos no encontradas'}), 404

    total    = sum(f.precio for f in fotos)
    base_url = request.host_url.rstrip('/')

    compra = Compra(email_cliente=email, nombre_cliente=nombre,
                    foto_ids=json.dumps([f.id for f in fotos]),
                    monto_total=total, estado='pendiente')
    db.session.add(compra); db.session.commit()

    if not MP_HABILITADO:
        return jsonify({'error': 'mp_no_configurado',
                        'compra_id': compra.id, 'total': total}), 503

    result = MP_SDK.preference().create({
        'items': [{'title': f'Nacho Lingua — Foto #{f.id}',
                   'description': f.evento.titulo if f.evento else 'Foto deportiva',
                   'quantity': 1, 'unit_price': f.precio,
                   'currency_id': 'ARS'} for f in fotos],
        'payer': {'email': email, 'name': nombre},
        'back_urls': {
            'success': f'{base_url}/pago-exitoso?cid={compra.id}',
            'failure': f'{base_url}/pago-fallido?cid={compra.id}',
            'pending': f'{base_url}/pago-exitoso?cid={compra.id}'
        },
        'auto_return': 'approved',
        'notification_url': f'{base_url}/mp-webhook',
        'statement_descriptor': 'NACHO LINGUA',
        'external_reference': str(compra.id)
    })

    if result['status'] == 201:
        pref = result['response']
        compra.mp_preference_id = pref['id']; db.session.commit()
        return jsonify({'init_point': pref['init_point'], 'compra_id': compra.id})
    return jsonify({'error': 'Error al crear preferencia MP'}), 500

@app.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    d = request.json
    if d and d.get('type') == 'payment' and MP_HABILITADO:
        pid = d.get('data', {}).get('id')
        if pid:
            r = MP_SDK.payment().get(pid)
            if r['status'] == 200:
                pay    = r['response']
                compra = Compra.query.filter_by(mp_preference_id=pay.get('preference_id')).first()
                if compra:
                    compra.mp_payment_id = str(pid)
                    compra.estado        = pay.get('status', 'desconocido')
                    db.session.commit()
                    if compra.estado == 'approved':
                        enviar_fotos_email(compra.id)
    return jsonify({'status': 'ok'}), 200

@app.route('/pago-exitoso')
def pago_exitoso():
    cid    = request.args.get('cid')
    compra = Compra.query.get(cid) if cid else None
    if compra and not compra.email_enviado:
        compra.estado = 'approved'; db.session.commit()
        enviar_fotos_email(compra.id)
    return send_from_directory('.', 'pago-exitoso.html')

@app.route('/pago-fallido')
def pago_fallido():
    return send_from_directory('.', 'pago-fallido.html')

# ── CONTACTO ──────────────────────────────────────────────────────────────────
@app.route('/contacto', methods=['POST'])
def contacto():
    d = request.json
    db.session.add(Consulta(nombre=d.get('nombre',''),
                             email=d.get('email',''),
                             mensaje=d.get('mensaje','')))
    db.session.commit()
    return jsonify({'ok': True})

# ── ADMIN ─────────────────────────────────────────────────────────────────────
@app.route('/admin/stats', methods=['GET'])
def admin_stats():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    total_fotos   = Foto.query.count()
    total_eventos = Evento.query.count()
    total_compras = Compra.query.filter_by(estado='approved').count()
    ingresos      = db.session.query(db.func.sum(Compra.monto_total))\
                              .filter_by(estado='approved').scalar() or 0
    pendientes    = Compra.query.filter_by(estado='approved', email_enviado=False).count()
    mensajes      = Consulta.query.filter_by(leida=False).count()
    return jsonify({
        'total_fotos':   total_fotos,
        'total_eventos': total_eventos,
        'total_compras': total_compras,
        'ingresos':      float(ingresos),
        'emails_pend':   pendientes,
        'mensajes_nue':  mensajes
    })

@app.route('/admin/compras', methods=['GET'])
def ver_compras():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    compras = Compra.query.order_by(Compra.creada_en.desc()).all()
    return jsonify([{
        'id': c.id, 'email': c.email_cliente, 'nombre': c.nombre_cliente,
        'foto_ids': json.loads(c.foto_ids or '[]'),
        'total': c.monto_total, 'estado': c.estado,
        'email_enviado': c.email_enviado,
        'fecha': c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
    } for c in compras])

@app.route('/admin/compras/<int:cid>/reenviar-email', methods=['POST'])
def reenviar_email(cid):
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    compra = Compra.query.get_or_404(cid)
    compra.email_enviado = False; db.session.commit()
    return jsonify({'ok': enviar_fotos_email(cid)})

@app.route('/admin/consultas', methods=['GET'])
def ver_consultas():
    if not session.get('admin'): return jsonify({'error': 'No autorizado'}), 403
    return jsonify([{
        'id': c.id, 'nombre': c.nombre, 'email': c.email,
        'mensaje': c.mensaje, 'leida': c.leida,
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
    d  = request.json
    pw = os.environ.get('ADMIN_PASSWORD', 'NachoAdmin2026!')
    if d.get('password') == pw:
        session.permanent = True; session['admin'] = True
        return jsonify({'success': True})
    return jsonify({'success': False}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth():
    return jsonify({'isAdmin': session.get('admin', False)})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None); return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)