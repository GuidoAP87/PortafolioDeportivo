import os, json, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import timedelta
from flask import Flask, request, send_from_directory, jsonify, session, send_file
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
    MP_SDK        = None
    MP_HABILITADO = False

# ── SMTP ──────────────────────────────────────────────────────────────────────
# Configurar en Render como variables de entorno:
#   SMTP_HOST  → smtp.gmail.com
#   SMTP_PORT  → 587
#   SMTP_USER  → tu-email@gmail.com
#   SMTP_PASS  → contraseña de aplicación de Google
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')

# ── MODELOS ───────────────────────────────────────────────────────────────────
class Evento(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    titulo      = db.Column(db.String(150), nullable=False)
    deporte     = db.Column(db.String(50),  nullable=False)
    fecha       = db.Column(db.String(50))
    descripcion = db.Column(db.String(300))
    fotos       = db.relationship('Foto', backref='evento', lazy=True,
                                  cascade="all, delete-orphan")

class Foto(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    url_preview  = db.Column(db.String(500), nullable=False)   # con marca de agua
    url_original = db.Column(db.String(500), nullable=False)   # sin marca de agua
    precio       = db.Column(db.Float, default=3500.0)          # ARS
    evento_id    = db.Column(db.Integer, db.ForeignKey('evento.id'), nullable=False)

class Compra(db.Model):
    id               = db.Column(db.Integer, primary_key=True)
    mp_preference_id = db.Column(db.String(250))
    mp_payment_id    = db.Column(db.String(100))
    email_cliente    = db.Column(db.String(150), nullable=False)
    nombre_cliente   = db.Column(db.String(150))
    foto_ids         = db.Column(db.Text)        # JSON: [1, 4, 7]
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

# ── MARCA DE AGUA ─────────────────────────────────────────────────────────────
def agregar_marca_de_agua(ruta_entrada, ruta_salida, texto="© NACHO LINGUA"):
    try:
        import math
        base      = Image.open(ruta_entrada).convert("RGBA")
        txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw      = ImageDraw.Draw(txt_layer)
        fontsize  = int(base.width / 14)
        try:
            font = ImageFont.truetype("arial.ttf", size=fontsize)
        except Exception:
            font = ImageFont.load_default()
        angulo = -25
        for y_start in range(-base.height, base.height * 2, int(fontsize * 4.5)):
            for x_start in range(-base.width, base.width * 2, int(base.width / 2.5)):
                x = x_start + y_start * math.tan(math.radians(-angulo))
                draw.text((x, y_start), texto, font=font, fill=(255, 255, 255, 55))
        watermarked = Image.alpha_composite(base, txt_layer).convert("RGB")
        watermarked.save(ruta_salida, "JPEG", quality=82)
        return True
    except Exception as e:
        print(f"Error marca de agua: {e}")
        return False

# ── EMAIL DE ENTREGA ──────────────────────────────────────────────────────────
def enviar_fotos_email(compra_id):
    compra = Compra.query.get(compra_id)
    if not compra or compra.email_enviado:
        return False
    if not SMTP_USER or not SMTP_PASS:
        print("SMTP no configurado — no se envió email.")
        return False

    foto_ids = json.loads(compra.foto_ids or '[]')
    fotos    = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos:
        return False

    nombre_display = compra.nombre_cliente or compra.email_cliente.split('@')[0].capitalize()

    filas_fotos = ""
    for i, f in enumerate(fotos, 1):
        evento_titulo = f.evento.titulo if f.evento else "Evento deportivo"
        filas_fotos += f"""
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #1a1a1a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:52px;vertical-align:middle;text-align:center;">
                  <div style="width:40px;height:40px;background:#1a1a1a;border-radius:3px;
                              line-height:40px;text-align:center;font-size:13px;color:#c6a87c;
                              font-weight:700;margin:0 auto;">#{i}</div>
                </td>
                <td style="padding-left:14px;vertical-align:middle;">
                  <p style="margin:0;font-size:13px;color:#e0e0e0;font-weight:500;">{evento_titulo}</p>
                  <p style="margin:3px 0 0;font-size:11px;color:#555;">Foto #{f.id} &nbsp;·&nbsp; Alta resolución</p>
                </td>
                <td style="text-align:right;vertical-align:middle;padding-left:10px;">
                  <a href="{f.url_original}"
                     style="display:inline-block;padding:10px 20px;background:#D4A843;
                            color:#000;font-size:10px;font-weight:700;letter-spacing:2px;
                            text-decoration:none;border-radius:2px;text-transform:uppercase;
                            white-space:nowrap;">
                    Descargar
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>"""

    html_body = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06060A;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">

    <div style="text-align:center;padding:40px 0 36px;border-bottom:1px solid #1a1a1a;">
      <p style="margin:0 0 6px;font-size:10px;letter-spacing:5px;color:#444;text-transform:uppercase;">Nacho Lingua</p>
      <h1 style="margin:0;font-family:Impact,sans-serif;font-size:36px;color:#D4A843;
                 font-weight:400;letter-spacing:8px;">FOTOGRAFÍA</h1>
      <p style="margin:12px 0 0;font-size:10px;letter-spacing:3px;color:#333;text-transform:uppercase;">
        Córdoba · Argentina
      </p>
    </div>

    <div style="padding:36px 0 28px;">
      <h2 style="margin:0 0 14px;font-size:22px;color:#f2f2f2;font-weight:400;">
        ¡Gracias por tu compra, {nombre_display}!
      </h2>
      <p style="margin:0;font-size:14px;color:#777;line-height:1.75;">
        Tus fotos están listas para descargar en alta resolución, completamente sin marca de agua.
        Hacé clic en cada botón de <strong style="color:#D4A843">Descargar</strong> para guardarlas.
      </p>
    </div>

    <div style="background:#0c0c12;border:1px solid #1e1e1e;border-radius:4px;padding:8px 20px 4px;">
      <p style="font-size:10px;letter-spacing:3px;color:#444;text-transform:uppercase;
                padding:14px 0 4px;margin:0;">
        {len(fotos)} foto{'s' if len(fotos)>1 else ''} adquirida{'s' if len(fotos)>1 else ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        {filas_fotos}
      </table>
    </div>

    <div style="padding:28px 0;border-bottom:1px solid #111;">
      <p style="margin:0;font-size:12px;color:#444;line-height:1.7;">
        Los links de descarga son permanentes. Si tenés cualquier problema para descargar tus fotos,
        respondé este email o escribinos por WhatsApp y lo resolvemos de inmediato.
      </p>
    </div>

    <div style="padding:24px 0;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#444;">Total abonado</span>
      <span style="font-family:Impact,sans-serif;font-size:32px;color:#D4A843;letter-spacing:2px;">
        ${compra.monto_total:,.0f} <span style="font-size:14px;color:#555;font-family:Arial,sans-serif;">ARS</span>
      </span>
    </div>

    <div style="text-align:center;padding:28px 0 0;border-top:1px solid #111;">
      <p style="margin:0;font-size:10px;color:#333;letter-spacing:1px;line-height:1.8;">
        © 2026 Nacho Lingua Fotografía · Córdoba, Argentina<br>
        Todas las imágenes son propiedad intelectual del autor.<br>
        Prohibida su reproducción y distribución sin autorización.
      </p>
    </div>

  </div>
</body>
</html>"""

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Tus fotos listas — Nacho Lingua Fotografía ({len(fotos)} foto{'s' if len(fotos)>1 else ''})"
        msg['From']    = f"Nacho Lingua Fotografía <{SMTP_USER}>"
        msg['To']      = compra.email_cliente
        msg.attach(MIMEText(html_body, 'html'))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(SMTP_USER, SMTP_PASS)
            srv.sendmail(SMTP_USER, compra.email_cliente, msg.as_string())
        compra.email_enviado = True
        db.session.commit()
        print(f"✓ Email enviado a {compra.email_cliente}")
        return True
    except Exception as e:
        print(f"✗ Error enviando email: {e}")
        return False

# ── RUTAS ESTÁTICAS ───────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/nacho_lingua.jpg')
def foto_fondo():
    return send_file('nacho_lingua.jpg')

# ── EVENTOS ───────────────────────────────────────────────────────────────────
@app.route('/crear-evento', methods=['POST'])
def crear_evento():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    data = request.json
    ev = Evento(
        titulo      = data.get('titulo', ''),
        deporte     = data.get('deporte', ''),
        fecha       = data.get('fecha', ''),
        descripcion = data.get('descripcion', '')
    )
    db.session.add(ev)
    db.session.commit()
    return jsonify({"id": ev.id, "mensaje": "Evento creado"})

@app.route('/obtener-eventos', methods=['GET'])
def obtener_eventos():
    eventos = Evento.query.order_by(Evento.id.desc()).all()
    return jsonify([{
        "id":          e.id,
        "titulo":      e.titulo,
        "deporte":     e.deporte,
        "fecha":       e.fecha,
        "descripcion": e.descripcion,
        "fotos": [{
            "id":          f.id,
            "url_preview": f.url_preview,
            "precio":      f.precio
        } for f in e.fotos]
    } for e in eventos])

@app.route('/borrar-evento/<int:ev_id>', methods=['DELETE'])
def borrar_evento(ev_id):
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    ev = Evento.query.get(ev_id)
    if not ev:
        return jsonify({"error": "No encontrado"}), 404
    db.session.delete(ev)
    db.session.commit()
    return jsonify({"mensaje": "Evento eliminado"})

# ── FOTOS ─────────────────────────────────────────────────────────────────────
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    if 'foto' not in request.files:
        return jsonify({"error": "Sin archivo"}), 400

    archivo   = request.files['foto']
    evento_id = request.form.get('evento_id')
    precio    = float(request.form.get('precio', 3500))
    filename  = archivo.filename

    ruta_orig    = os.path.join(CARPETA_TEMP, 'orig_'    + filename)
    ruta_preview = os.path.join(CARPETA_TEMP, 'preview_' + filename)
    archivo.save(ruta_orig)

    # Subir original (sin marca de agua) a Cloudinary — carpeta privada
    try:
        resp_orig    = cloudinary.uploader.upload(
            ruta_orig,
            folder   = f"nacho_lingua/originales/evento_{evento_id}",
            quality  = "auto:best"
        )
        url_original = resp_orig['secure_url']
    except Exception as e:
        return jsonify({"error": f"Error subiendo original: {str(e)}"}), 500

    # Crear preview con marca de agua
    if not agregar_marca_de_agua(ruta_orig, ruta_preview):
        return jsonify({"error": "Error procesando imagen"}), 500

    try:
        resp_prev   = cloudinary.uploader.upload(
            ruta_preview,
            folder  = f"nacho_lingua/previews/evento_{evento_id}"
        )
        url_preview = resp_prev['secure_url']
    except Exception as e:
        return jsonify({"error": f"Error subiendo preview: {str(e)}"}), 500

    foto = Foto(
        url_preview  = url_preview,
        url_original = url_original,
        precio       = precio,
        evento_id    = evento_id
    )
    db.session.add(foto)
    db.session.commit()

    for f in [ruta_orig, ruta_preview]:
        try: os.remove(f)
        except: pass

    return jsonify({"mensaje": "Foto subida", "id": foto.id, "url_preview": url_preview})

@app.route('/borrar-foto/<int:foto_id>', methods=['DELETE'])
def borrar_foto(foto_id):
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    foto = Foto.query.get(foto_id)
    if not foto:
        return jsonify({"error": "No encontrada"}), 404
    db.session.delete(foto)
    db.session.commit()
    return jsonify({"mensaje": "Foto eliminada"})

# ── COMPRAS / MERCADOPAGO ─────────────────────────────────────────────────────
@app.route('/crear-orden', methods=['POST'])
def crear_orden():
    data     = request.json
    foto_ids = data.get('foto_ids', [])
    email    = data.get('email', '').strip()
    nombre   = data.get('nombre', '').strip()

    if not foto_ids or not email:
        return jsonify({"error": "Datos incompletos"}), 400

    fotos = Foto.query.filter(Foto.id.in_(foto_ids)).all()
    if not fotos:
        return jsonify({"error": "Fotos no encontradas"}), 404

    total    = sum(f.precio for f in fotos)
    base_url = request.host_url.rstrip('/')

    compra = Compra(
        email_cliente  = email,
        nombre_cliente = nombre,
        foto_ids       = json.dumps([f.id for f in fotos]),
        monto_total    = total,
        estado         = 'pendiente'
    )
    db.session.add(compra)
    db.session.commit()

    if not MP_HABILITADO:
        return jsonify({
            "error":     "mp_no_configurado",
            "compra_id": compra.id,
            "total":     total
        }), 503

    items = [{
        "title":       f"Nacho Lingua — Foto #{f.id} ({f.evento.titulo if f.evento else 'Deporte'})",
        "description": "Fotografía deportiva alta resolución sin marca de agua",
        "quantity":    1,
        "unit_price":  f.precio,
        "currency_id": "ARS"
    } for f in fotos]

    preference_data = {
        "items": items,
        "payer": {"email": email, "name": nombre},
        "back_urls": {
            "success": f"{base_url}/pago-exitoso?cid={compra.id}",
            "failure": f"{base_url}/pago-fallido?cid={compra.id}",
            "pending": f"{base_url}/pago-exitoso?cid={compra.id}"
        },
        "auto_return":         "approved",
        "notification_url":    f"{base_url}/mp-webhook",
        "statement_descriptor": "NACHO LINGUA FOTO",
        "external_reference":  str(compra.id)
    }

    result = MP_SDK.preference().create(preference_data)
    if result['status'] == 201:
        pref                    = result['response']
        compra.mp_preference_id = pref['id']
        db.session.commit()
        return jsonify({"init_point": pref['init_point'], "compra_id": compra.id})
    else:
        return jsonify({"error": "Error al crear preferencia MP"}), 500

@app.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    data = request.json
    if data and data.get('type') == 'payment' and MP_HABILITADO:
        payment_id = data.get('data', {}).get('id')
        if payment_id:
            result = MP_SDK.payment().get(payment_id)
            if result['status'] == 200:
                payment = result['response']
                pref_id = payment.get('preference_id')
                compra  = Compra.query.filter_by(mp_preference_id=pref_id).first()
                if compra:
                    compra.mp_payment_id = str(payment_id)
                    compra.estado        = payment.get('status', 'desconocido')
                    db.session.commit()
                    if compra.estado == 'approved':
                        enviar_fotos_email(compra.id)
    return jsonify({"status": "ok"}), 200

# ── PÁGINAS DE RETORNO DE PAGO ────────────────────────────────────────────────
@app.route('/pago-exitoso')
def pago_exitoso():
    cid    = request.args.get('cid')
    compra = Compra.query.get(cid) if cid else None
    if compra and not compra.email_enviado:
        compra.estado = 'approved'
        db.session.commit()
        enviar_fotos_email(compra.id)
    return send_from_directory('.', 'pago-exitoso.html')

@app.route('/pago-fallido')
def pago_fallido():
    return send_from_directory('.', 'pago-fallido.html')

# ── CONTACTO ──────────────────────────────────────────────────────────────────
@app.route('/contacto', methods=['POST'])
def contacto():
    d = request.json
    db.session.add(Consulta(
        nombre  = d.get('nombre', ''),
        email   = d.get('email', ''),
        mensaje = d.get('mensaje', '')
    ))
    db.session.commit()
    return jsonify({"ok": True})

# ── ADMIN ─────────────────────────────────────────────────────────────────────
@app.route('/admin/compras', methods=['GET'])
def ver_compras():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    compras = Compra.query.order_by(Compra.creada_en.desc()).all()
    return jsonify([{
        "id":            c.id,
        "email":         c.email_cliente,
        "nombre":        c.nombre_cliente,
        "foto_ids":      json.loads(c.foto_ids or '[]'),
        "total":         c.monto_total,
        "estado":        c.estado,
        "email_enviado": c.email_enviado,
        "fecha":         c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
    } for c in compras])

@app.route('/admin/compras/<int:cid>/reenviar-email', methods=['POST'])
def reenviar_email(cid):
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    compra = Compra.query.get(cid)
    if not compra:
        return jsonify({"error": "No encontrada"}), 404
    compra.email_enviado = False
    db.session.commit()
    ok = enviar_fotos_email(cid)
    return jsonify({"ok": ok})

@app.route('/admin/consultas', methods=['GET'])
def ver_consultas():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    consultas = Consulta.query.order_by(Consulta.creada_en.desc()).all()
    return jsonify([{
        "id":       c.id,
        "nombre":   c.nombre,
        "email":    c.email,
        "mensaje":  c.mensaje,
        "leida":    c.leida,
        "fecha":    c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
    } for c in consultas])

@app.route('/admin/consultas/<int:cid>/leer', methods=['PATCH'])
def marcar_leida(cid):
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    c = Consulta.query.get(cid)
    if c:
        c.leida = True
        db.session.commit()
    return jsonify({"ok": True})

# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    pw   = os.environ.get('ADMIN_PASSWORD', 'NachoAdmin2026!')
    if data.get('password') == pw:
        session.permanent = True
        session['admin']  = True
        return jsonify({"success": True})
    return jsonify({"success": False}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth():
    return jsonify({"isAdmin": session.get('admin', False)})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)