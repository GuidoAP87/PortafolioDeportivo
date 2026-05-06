import os, json, smtplib, io, threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import timedelta
from flask import Flask, request, send_from_directory, jsonify, session, send_file
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
import numpy as np
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
app.secret_key = os.environ.get('SECRET_KEY', 'nl-sports-2026-cambiar-en-prod')

database_url = os.environ.get('DATABASE_URL', 'sqlite:///datos.db')
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI']        = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config.update(
    SESSION_COOKIE_SECURE   = True,
    SESSION_COOKIE_HTTPONLY = True,
    SESSION_COOKIE_SAMESITE = 'Lax',
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
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
    MP_SDK = None; MP_HABILITADO = False

# ── SMTP ──────────────────────────────────────────────────────────────────────
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')

# ── DEEPFACE (IA de rostros) ──────────────────────────────────────────────────
try:
    from deepface import DeepFace
    FACES_ENABLED = True
    print("✓ DeepFace habilitado — detección de rostros activa")
except ImportError:
    FACES_ENABLED = False
    print("⚠ DeepFace no disponible — instalar con: pip install deepface tf-keras")

FACE_MODEL      = "Facenet"       # Modelo de embeddings (rápido y preciso)
FACE_DETECTOR   = "opencv"        # Backend de detección (más rápido)
SIMILARITY_UMBRAL = 0.62          # Umbral coseno: valores más altos = más estricto

# ── MODELOS ───────────────────────────────────────────────────────────────────
class Evento(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    titulo      = db.Column(db.String(150), nullable=False)
    deporte     = db.Column(db.String(50),  nullable=False)
    fecha       = db.Column(db.String(50))
    descripcion = db.Column(db.String(300))
    fotos       = db.relationship('Foto', backref='evento', lazy=True,
                                  cascade="all, delete-orphan")
    personas    = db.relationship('PersonaCluster', backref='evento', lazy=True,
                                  cascade="all, delete-orphan")

class Foto(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    url_preview  = db.Column(db.String(500), nullable=False)
    url_original = db.Column(db.String(500), nullable=False)
    precio       = db.Column(db.Float, default=3500.0)
    evento_id    = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    rostros      = db.relationship('RostroDetectado', backref='foto', lazy=True,
                                   cascade="all, delete-orphan")

class PersonaCluster(db.Model):
    """Representa a una persona detectada en un evento."""
    id               = db.Column(db.Integer, primary_key=True)
    evento_id        = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)
    nombre           = db.Column(db.String(100))               # Etiqueta opcional
    embedding_ref    = db.Column(db.Text)                       # JSON: embedding representativo
    cara_url         = db.Column(db.String(500))                # Cloudinary: crop de cara
    total_fotos      = db.Column(db.Integer, default=0)
    rostros          = db.relationship('RostroDetectado', backref='persona', lazy=True)

class RostroDetectado(db.Model):
    """Un rostro detectado en una foto, asociado a una PersonaCluster."""
    id          = db.Column(db.Integer, primary_key=True)
    foto_id     = db.Column(db.Integer, db.ForeignKey('foto.id'), nullable=False)
    persona_id  = db.Column(db.Integer, db.ForeignKey('persona_cluster.id'), nullable=False)
    embedding   = db.Column(db.Text)                            # JSON: embedding del rostro
    cara_url    = db.Column(db.String(500))                     # Crop de esta cara específica
    confianza   = db.Column(db.Float, default=1.0)              # Score de similitud

class Compra(db.Model):
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
    id        = db.Column(db.Integer, primary_key=True)
    nombre    = db.Column(db.String(100))
    email     = db.Column(db.String(100))
    mensaje   = db.Column(db.Text)
    leida     = db.Column(db.Boolean, default=False)
    creada_en = db.Column(db.DateTime, server_default=db.func.now())

with app.app_context():
    db.create_all()

# ── UTILIDADES DE IA ──────────────────────────────────────────────────────────
def cosine_similarity(a, b):
    """Similitud coseno entre dos vectores numpy."""
    a, b = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(a), np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))

def detectar_y_asignar_rostros(ruta_imagen, foto_id, evento_id):
    """
    Detecta rostros en la imagen, extrae embeddings y los asigna
    a PersonaClusters del evento. Se ejecuta en un hilo separado.
    """
    if not FACES_ENABLED:
        return

    try:
        # 1. Detectar rostros y obtener embeddings
        resultados = DeepFace.represent(
            img_path    = ruta_imagen,
            model_name  = FACE_MODEL,
            detector_backend = FACE_DETECTOR,
            enforce_detection = False
        )
        if not resultados:
            return

        imagen_pil = Image.open(ruta_imagen).convert("RGB")
        img_w, img_h = imagen_pil.size

        with app.app_context():
            for resultado in resultados:
                embedding = resultado.get('embedding', [])
                region    = resultado.get('facial_area', {})

                if not embedding or not region:
                    continue

                # Coordenadas del bounding box
                x = int(region.get('x', 0))
                y = int(region.get('y', 0))
                w = int(region.get('w', 0))
                h = int(region.get('h', 0))

                # Ignorar caras muy pequeñas (ruido)
                if w < 30 or h < 30:
                    continue

                # 2. Recortar la cara con margen
                margen = int(max(w, h) * 0.25)
                x1 = max(0,     x - margen)
                y1 = max(0,     y - margen)
                x2 = min(img_w, x + w + margen)
                y2 = min(img_h, y + h + margen)
                cara_crop = imagen_pil.crop((x1, y1, x2, y2))
                cara_crop = cara_crop.resize((200, 200), Image.LANCZOS)

                # 3. Subir crop a Cloudinary
                buf = io.BytesIO()
                cara_crop.save(buf, format='JPEG', quality=85)
                buf.seek(0)
                try:
                    resp_cara = cloudinary.uploader.upload(
                        buf,
                        folder = f"nacho_lingua/caras/evento_{evento_id}",
                        public_id = f"cara_{foto_id}_{x}_{y}"
                    )
                    cara_url = resp_cara['secure_url']
                except Exception as e:
                    print(f"Error subiendo cara: {e}")
                    cara_url = None

                # 4. Buscar cluster existente con cara similar
                clusters = PersonaCluster.query.filter_by(evento_id=evento_id).all()
                persona_asignada = None
                mejor_similitud  = 0.0

                for cluster in clusters:
                    try:
                        emb_ref = json.loads(cluster.embedding_ref)
                        sim = cosine_similarity(embedding, emb_ref)
                        if sim > mejor_similitud:
                            mejor_similitud = sim
                            persona_asignada = cluster
                    except Exception:
                        continue

                # 5. Asignar a cluster existente o crear uno nuevo
                if persona_asignada and mejor_similitud >= SIMILARITY_UMBRAL:
                    # Actualizar embedding representativo (promedio ponderado)
                    try:
                        emb_ref = np.array(json.loads(persona_asignada.embedding_ref))
                        n = persona_asignada.total_fotos
                        nuevo_emb = ((emb_ref * n) + np.array(embedding)) / (n + 1)
                        persona_asignada.embedding_ref = json.dumps(nuevo_emb.tolist())
                    except Exception:
                        pass
                    persona_asignada.total_fotos += 1
                else:
                    # Nuevo cluster = nueva persona detectada
                    persona_asignada = PersonaCluster(
                        evento_id     = evento_id,
                        embedding_ref = json.dumps(embedding),
                        cara_url      = cara_url,
                        total_fotos   = 1
                    )
                    db.session.add(persona_asignada)
                    db.session.flush()

                # 6. Guardar el rostro detectado
                rostro = RostroDetectado(
                    foto_id    = foto_id,
                    persona_id = persona_asignada.id,
                    embedding  = json.dumps(embedding),
                    cara_url   = cara_url,
                    confianza  = float(mejor_similitud) if persona_asignada else 1.0
                )
                db.session.add(rostro)

            db.session.commit()
            print(f"✓ Rostros procesados para foto #{foto_id}")

    except Exception as e:
        print(f"⚠ Error en detección de rostros foto #{foto_id}: {e}")

# ── MARCA DE AGUA ─────────────────────────────────────────────────────────────
def agregar_marca_de_agua(ruta_entrada, ruta_salida, texto="© NACHO LINGUA"):
    try:
        import math
        base      = Image.open(ruta_entrada).convert("RGBA")
        txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw      = ImageDraw.Draw(txt_layer)
        fontsize  = int(base.width / 14)
        try:   font = ImageFont.truetype("arial.ttf", size=fontsize)
        except: font = ImageFont.load_default()
        angulo = -25
        for y_s in range(-base.height, base.height * 2, int(fontsize * 4.5)):
            for x_s in range(-base.width, base.width * 2, int(base.width / 2.5)):
                x = x_s + y_s * math.tan(math.radians(-angulo))
                draw.text((x, y_s), texto, font=font, fill=(255, 255, 255, 55))
        Image.alpha_composite(base, txt_layer).convert("RGB").save(ruta_salida, "JPEG", quality=82)
        return True
    except Exception as e:
        print(f"Error marca de agua: {e}"); return False

# ── EMAIL DE ENTREGA ──────────────────────────────────────────────────────────
def enviar_fotos_email(compra_id):
    compra = Compra.query.get(compra_id)
    if not compra or compra.email_enviado: return False
    if not SMTP_USER or not SMTP_PASS:     return False

    foto_ids = json.loads(compra.foto_ids or '[]')
    fotos    = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos: return False

    nombre_display = compra.nombre_cliente or compra.email_cliente.split('@')[0].capitalize()
    filas = ""
    for i, f in enumerate(fotos, 1):
        titulo = f.evento.titulo if f.evento else "Evento deportivo"
        filas += f"""
        <tr><td style="padding:14px 0;border-bottom:1px solid #1a1a1a;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:52px;text-align:center;vertical-align:middle;">
              <div style="width:40px;height:40px;background:#1a1a1a;border-radius:3px;
                          line-height:40px;text-align:center;font-size:13px;color:#D4A843;
                          font-weight:700;margin:0 auto;">#{i}</div>
            </td>
            <td style="padding-left:14px;vertical-align:middle;">
              <p style="margin:0;font-size:13px;color:#e0e0e0;font-weight:500;">{titulo}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#555;">Foto #{f.id} · Alta resolución</p>
            </td>
            <td style="text-align:right;vertical-align:middle;padding-left:10px;">
              <a href="{f.url_original}"
                 style="display:inline-block;padding:10px 20px;background:#D4A843;
                        color:#000;font-size:10px;font-weight:700;letter-spacing:2px;
                        text-decoration:none;border-radius:2px;text-transform:uppercase;">
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
      <h1 style="margin:0;font-family:Impact,sans-serif;font-size:36px;color:#D4A843;letter-spacing:8px;">FOTOGRAFÍA</h1>
    </div>
    <div style="padding:36px 0 28px;">
      <h2 style="margin:0 0 14px;font-size:22px;color:#f2f2f2;font-weight:400;">¡Gracias, {nombre_display}!</h2>
      <p style="margin:0;font-size:14px;color:#777;line-height:1.75;">
        Tus fotos están listas en alta resolución, sin marca de agua.
      </p>
    </div>
    <div style="background:#0c0c12;border:1px solid #1e1e1e;border-radius:4px;padding:8px 20px 4px;">
      <p style="font-size:10px;letter-spacing:3px;color:#444;text-transform:uppercase;padding:14px 0 4px;margin:0;">
        {len(fotos)} foto{'s' if len(fotos)>1 else ''} adquirida{'s' if len(fotos)>1 else ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">{filas}</table>
    </div>
    <div style="padding:24px 0;text-align:right;">
      <span style="font-family:Impact,sans-serif;font-size:32px;color:#D4A843;letter-spacing:2px;">
        ${compra.monto_total:,.0f} <span style="font-size:14px;color:#555;font-family:Arial;">ARS</span>
      </span>
    </div>
    <div style="text-align:center;padding:28px 0 0;border-top:1px solid #111;">
      <p style="font-size:10px;color:#333;letter-spacing:1px;line-height:1.8;">
        © 2026 Nacho Lingua Fotografía · Córdoba, Argentina<br>
        Prohibida su reproducción sin autorización.
      </p>
    </div>
  </div>
</body></html>"""

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Tus fotos listas — Nacho Lingua ({len(fotos)} foto{'s' if len(fotos)>1 else ''})"
        msg['From']    = f"Nacho Lingua Fotografía <{SMTP_USER}>"
        msg['To']      = compra.email_cliente
        msg.attach(MIMEText(html, 'html'))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as srv:
            srv.ehlo(); srv.starttls(); srv.login(SMTP_USER, SMTP_PASS)
            srv.sendmail(SMTP_USER, compra.email_cliente, msg.as_string())
        compra.email_enviado = True
        db.session.commit()
        print(f"✓ Email enviado a {compra.email_cliente}")
        return True
    except Exception as e:
        print(f"✗ Error email: {e}"); return False

# ── RUTAS ESTÁTICAS ───────────────────────────────────────────────────────────
@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/nacho_lingua.jpg')
def foto_fondo(): return send_file('nacho_lingua.jpg')

# ── EVENTOS ───────────────────────────────────────────────────────────────────
@app.route('/crear-evento', methods=['POST'])
def crear_evento():
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    data = request.json
    ev = Evento(titulo=data.get('titulo',''), deporte=data.get('deporte',''),
                fecha=data.get('fecha',''), descripcion=data.get('descripcion',''))
    db.session.add(ev); db.session.commit()
    return jsonify({"id": ev.id, "mensaje": "Evento creado"})

@app.route('/obtener-eventos', methods=['GET'])
def obtener_eventos():
    eventos = Evento.query.order_by(Evento.id.desc()).all()
    return jsonify([{
        "id": e.id, "titulo": e.titulo, "deporte": e.deporte,
        "fecha": e.fecha, "descripcion": e.descripcion,
        "fotos": [{"id": f.id, "url_preview": f.url_preview, "precio": f.precio}
                  for f in e.fotos]
    } for e in eventos])

@app.route('/borrar-evento/<int:ev_id>', methods=['DELETE'])
def borrar_evento(ev_id):
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    ev = Evento.query.get(ev_id)
    if not ev: return jsonify({"error": "No encontrado"}), 404
    db.session.delete(ev); db.session.commit()
    return jsonify({"mensaje": "Evento eliminado"})

# ── FOTOS ─────────────────────────────────────────────────────────────────────
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    if 'foto' not in request.files: return jsonify({"error": "Sin archivo"}), 400

    archivo   = request.files['foto']
    evento_id = request.form.get('evento_id')
    precio    = float(request.form.get('precio', 3500))
    filename  = archivo.filename
    ruta_orig    = os.path.join(CARPETA_TEMP, 'orig_'    + filename)
    ruta_preview = os.path.join(CARPETA_TEMP, 'preview_' + filename)
    archivo.save(ruta_orig)

    # Subir original a Cloudinary
    try:
        resp_orig    = cloudinary.uploader.upload(ruta_orig,
            folder=f"nacho_lingua/originales/evento_{evento_id}", quality="auto:best")
        url_original = resp_orig['secure_url']
    except Exception as e:
        return jsonify({"error": f"Error subiendo original: {str(e)}"}), 500

    # Preview con marca de agua
    if not agregar_marca_de_agua(ruta_orig, ruta_preview):
        return jsonify({"error": "Error procesando imagen"}), 500
    try:
        resp_prev  = cloudinary.uploader.upload(ruta_preview,
            folder=f"nacho_lingua/previews/evento_{evento_id}")
        url_preview = resp_prev['secure_url']
    except Exception as e:
        return jsonify({"error": f"Error subiendo preview: {str(e)}"}), 500

    foto = Foto(url_preview=url_preview, url_original=url_original,
                precio=precio, evento_id=evento_id)
    db.session.add(foto); db.session.commit()

    # ── Detección de rostros en hilo separado (no bloquea la respuesta) ──
    if FACES_ENABLED:
        ruta_para_ia = ruta_orig  # guardamos referencia antes de limpiar
        hilo = threading.Thread(
            target=detectar_y_asignar_rostros,
            args=(ruta_para_ia, foto.id, int(evento_id)),
            daemon=True
        )
        hilo.start()
    else:
        # Limpiar temp inmediatamente si IA no está activa
        for f in [ruta_orig, ruta_preview]:
            try: os.remove(f)
            except: pass

    return jsonify({"mensaje": "Foto subida", "id": foto.id,
                    "url_preview": url_preview, "ia_procesando": FACES_ENABLED})

@app.route('/borrar-foto/<int:foto_id>', methods=['DELETE'])
def borrar_foto(foto_id):
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    foto = Foto.query.get(foto_id)
    if not foto: return jsonify({"error": "No encontrada"}), 404
    db.session.delete(foto); db.session.commit()
    return jsonify({"mensaje": "Foto eliminada"})

# ── PERSONAS / ROSTROS ────────────────────────────────────────────────────────
@app.route('/evento/<int:evento_id>/personas', methods=['GET'])
def obtener_personas(evento_id):
    """Devuelve los clusters de personas detectadas en un evento."""
    personas = PersonaCluster.query.filter_by(evento_id=evento_id)\
                                   .order_by(PersonaCluster.total_fotos.desc()).all()
    resultado = []
    for p in personas:
        foto_ids = [r.foto_id for r in p.rostros]
        if not foto_ids: continue
        resultado.append({
            "id":          p.id,
            "nombre":      p.nombre or f"Persona #{p.id}",
            "cara_url":    p.cara_url,
            "total_fotos": p.total_fotos,
            "foto_ids":    list(set(foto_ids))
        })
    return jsonify({
        "personas":       resultado,
        "ia_habilitada":  FACES_ENABLED,
        "total_personas": len(resultado)
    })

@app.route('/persona/<int:persona_id>/nombre', methods=['PATCH'])
def etiquetar_persona(persona_id):
    """Permite al admin poner nombre a una persona detectada."""
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    persona = PersonaCluster.query.get(persona_id)
    if not persona: return jsonify({"error": "No encontrada"}), 404
    data = request.json
    persona.nombre = data.get('nombre', '').strip()
    db.session.commit()
    return jsonify({"ok": True, "nombre": persona.nombre})

@app.route('/persona/<int:persona_id>', methods=['DELETE'])
def borrar_persona(persona_id):
    """Borra un cluster de persona (y sus rostros asociados)."""
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    persona = PersonaCluster.query.get(persona_id)
    if not persona: return jsonify({"error": "No encontrada"}), 404
    db.session.delete(persona); db.session.commit()
    return jsonify({"ok": True})

@app.route('/evento/<int:evento_id>/reprocesar-rostros', methods=['POST'])
def reprocesar_rostros(evento_id):
    """Re-procesa IA para todas las fotos del evento (admin)."""
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    if not FACES_ENABLED:        return jsonify({"error": "IA no disponible"}), 503

    ev = Evento.query.get(evento_id)
    if not ev: return jsonify({"error": "Evento no encontrado"}), 404

    # Borrar clusters anteriores del evento
    PersonaCluster.query.filter_by(evento_id=evento_id).delete()
    db.session.commit()

    fotos = Foto.query.filter_by(evento_id=evento_id).all()

    def procesar_batch():
        for foto in fotos:
            # Descargar original desde Cloudinary para procesarlo
            import urllib.request, tempfile
            try:
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    urllib.request.urlretrieve(foto.url_original, tmp.name)
                    detectar_y_asignar_rostros(tmp.name, foto.id, evento_id)
                os.remove(tmp.name)
            except Exception as e:
                print(f"Error reprocesando foto #{foto.id}: {e}")

    hilo = threading.Thread(target=procesar_batch, daemon=True)
    hilo.start()
    return jsonify({"ok": True, "mensaje": f"Reprocesando {len(fotos)} fotos en segundo plano"})

# ── COMPRAS / MERCADOPAGO ─────────────────────────────────────────────────────
@app.route('/crear-orden', methods=['POST'])
def crear_orden():
    data     = request.json
    foto_ids = data.get('foto_ids', [])
    email    = data.get('email', '').strip()
    nombre   = data.get('nombre', '').strip()
    if not foto_ids or not email: return jsonify({"error": "Datos incompletos"}), 400

    fotos = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos: return jsonify({"error": "Fotos no encontradas"}), 404

    total    = sum(f.precio for f in fotos)
    base_url = request.host_url.rstrip('/')

    compra = Compra(email_cliente=email, nombre_cliente=nombre,
                    foto_ids=json.dumps([f.id for f in fotos]),
                    monto_total=total, estado='pendiente')
    db.session.add(compra); db.session.commit()

    if not MP_HABILITADO:
        return jsonify({"error": "mp_no_configurado", "compra_id": compra.id, "total": total}), 503

    items = [{"title": f"Nacho Lingua — Foto #{f.id}", "quantity": 1,
              "unit_price": f.precio, "currency_id": "ARS"} for f in fotos]
    pref_data = {
        "items": items,
        "payer": {"email": email, "name": nombre},
        "back_urls": {
            "success": f"{base_url}/pago-exitoso?cid={compra.id}",
            "failure": f"{base_url}/pago-fallido?cid={compra.id}",
            "pending": f"{base_url}/pago-exitoso?cid={compra.id}"
        },
        "auto_return": "approved",
        "notification_url": f"{base_url}/mp-webhook",
        "statement_descriptor": "NACHO LINGUA FOTO",
        "external_reference": str(compra.id)
    }
    result = MP_SDK.preference().create(pref_data)
    if result['status'] == 201:
        pref = result['response']
        compra.mp_preference_id = pref['id']; db.session.commit()
        return jsonify({"init_point": pref['init_point'], "compra_id": compra.id})
    return jsonify({"error": "Error MP"}), 500

@app.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    data = request.json
    if data and data.get('type') == 'payment' and MP_HABILITADO:
        pid = data.get('data', {}).get('id')
        if pid:
            result = MP_SDK.payment().get(pid)
            if result['status'] == 200:
                payment = result['response']
                compra  = Compra.query.filter_by(mp_preference_id=payment.get('preference_id')).first()
                if compra:
                    compra.mp_payment_id = str(pid)
                    compra.estado        = payment.get('status', 'desconocido')
                    db.session.commit()
                    if compra.estado == 'approved': enviar_fotos_email(compra.id)
    return jsonify({"status": "ok"}), 200

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
    db.session.add(Consulta(nombre=d.get('nombre',''), email=d.get('email',''), mensaje=d.get('mensaje','')))
    db.session.commit()
    return jsonify({"ok": True})

# ── ADMIN ─────────────────────────────────────────────────────────────────────
@app.route('/admin/compras', methods=['GET'])
def ver_compras():
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    compras = Compra.query.order_by(Compra.creada_en.desc()).all()
    return jsonify([{"id": c.id, "email": c.email_cliente, "nombre": c.nombre_cliente,
                     "foto_ids": json.loads(c.foto_ids or '[]'), "total": c.monto_total,
                     "estado": c.estado, "email_enviado": c.email_enviado,
                     "fecha": c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''}
                    for c in compras])

@app.route('/admin/compras/<int:cid>/reenviar-email', methods=['POST'])
def reenviar_email(cid):
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    compra = Compra.query.get(cid)
    if not compra: return jsonify({"error": "No encontrada"}), 404
    compra.email_enviado = False; db.session.commit()
    return jsonify({"ok": enviar_fotos_email(cid)})

@app.route('/admin/consultas', methods=['GET'])
def ver_consultas():
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    return jsonify([{"id": c.id, "nombre": c.nombre, "email": c.email, "mensaje": c.mensaje,
                     "leida": c.leida, "fecha": c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''}
                    for c in Consulta.query.order_by(Consulta.creada_en.desc()).all()])

@app.route('/admin/consultas/<int:cid>/leer', methods=['PATCH'])
def marcar_leida(cid):
    if not session.get('admin'): return jsonify({"error": "No autorizado"}), 403
    c = Consulta.query.get(cid)
    if c: c.leida = True; db.session.commit()
    return jsonify({"ok": True})

# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    if data.get('password') == os.environ.get('ADMIN_PASSWORD', 'NachoAdmin2026!'):
        session.permanent = True; session['admin'] = True
        return jsonify({"success": True})
    return jsonify({"success": False}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth():
    return jsonify({"isAdmin": session.get('admin', False)})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None); return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)