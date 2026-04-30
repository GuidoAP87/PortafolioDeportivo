import os
from datetime import timedelta
from flask import Flask, request, send_from_directory, jsonify, session, send_file
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
import cloudinary
import cloudinary.uploader

# ─── MERCADOPAGO ────────────────────────────────────────────────────────────────
try:
    import mercadopago
    _mp_token = os.environ.get('MP_ACCESS_TOKEN', '')
    MP_SDK = mercadopago.SDK(_mp_token) if _mp_token else None
    MP_HABILITADO = bool(_mp_token)
except ImportError:
    MP_SDK = None
    MP_HABILITADO = False

# ─── CLOUDINARY ─────────────────────────────────────────────────────────────────
cloudinary.config(
    cloud_name  = os.environ.get('CLOUD_NAME'),
    api_key     = os.environ.get('CLOUD_API_KEY'),
    api_secret  = os.environ.get('CLOUD_API_SECRET'),
    secure      = True
)

# ─── APP ─────────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='.', static_url_path='')

# ⚠ IMPORTANTE: Cambiar SECRET_KEY en producción con una variable de entorno
app.secret_key = os.environ.get('SECRET_KEY', 'NL-portfolio-2026-cambiar-urgente')

# ─── BASE DE DATOS ───────────────────────────────────────────────────────────────
database_url = os.environ.get('DATABASE_URL', 'sqlite:///datos.db')
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ─── SEGURIDAD ───────────────────────────────────────────────────────────────────
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

# ─── MODELOS ─────────────────────────────────────────────────────────────────────
class Album(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    titulo    = db.Column(db.String(100), nullable=False)
    categoria = db.Column(db.String(50), nullable=False)
    fotos     = db.relationship('Foto', backref='album', lazy=True, cascade="all, delete-orphan")

class Foto(db.Model):
    id       = db.Column(db.Integer, primary_key=True)
    url_foto = db.Column(db.String(500), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('album.id'), nullable=False)

class Consulta(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    nombre      = db.Column(db.String(100), nullable=False)
    email       = db.Column(db.String(100), nullable=False)
    telefono    = db.Column(db.String(30))
    tipo_evento = db.Column(db.String(50))
    fecha_evento= db.Column(db.String(50))
    mensaje     = db.Column(db.Text)
    leida       = db.Column(db.Boolean, default=False)
    creada_en   = db.Column(db.DateTime, server_default=db.func.now())

class Pago(db.Model):
    id               = db.Column(db.Integer, primary_key=True)
    mp_payment_id    = db.Column(db.String(100))
    mp_preference_id = db.Column(db.String(200))
    paquete          = db.Column(db.String(100))
    email_cliente    = db.Column(db.String(100))
    monto            = db.Column(db.Float)
    estado           = db.Column(db.String(50), default='pendiente')
    creado_en        = db.Column(db.DateTime, server_default=db.func.now())

with app.app_context():
    db.create_all()

# ─── PAQUETES ────────────────────────────────────────────────────────────────────
# ⚠ Ajustá los precios según tus tarifas reales
PAQUETES = {
    'basico': {
        'nombre':      'Pack Básico',
        'descripcion': '1 evento deportivo — 50 fotos editadas en alta resolución',
        'precio':      80000,
        'moneda':      'ARS'
    },
    'profesional': {
        'nombre':      'Pack Profesional',
        'descripcion': '1 evento — 150 fotos editadas + galería privada en línea',
        'precio':      150000,
        'moneda':      'ARS'
    },
    'premium': {
        'nombre':      'Pack Premium',
        'descripcion': '2 eventos — Fotos ilimitadas + galería privada + entrega en 24 hs',
        'precio':      280000,
        'moneda':      'ARS'
    }
}

# ─── MARCA DE AGUA ───────────────────────────────────────────────────────────────
def procesar_imagen(ruta_entrada, ruta_salida, texto="NACHO LINGUA"):
    try:
        base       = Image.open(ruta_entrada).convert("RGBA")
        txt_layer  = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw       = ImageDraw.Draw(txt_layer)
        fontsize   = int(base.width / 12)
        try:
            font = ImageFont.truetype("arial.ttf", size=fontsize)
        except:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), texto, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x, y = (base.width - w) / 2, (base.height - h) / 2
        draw.text((x, y), texto, font=font, fill=(255, 255, 255, 100))
        watermarked = Image.alpha_composite(base, txt_layer).convert("RGB")
        watermarked.save(ruta_salida, "JPEG", quality=85)
        return True
    except Exception as e:
        print(f"Error procesando imagen: {e}")
        return False

# ─── RUTAS ESTÁTICAS ─────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/nacho_lingua.jpg')
def foto_fondo():
    return send_file('nacho_lingua.jpg')

# ─── ÁLBUMES ─────────────────────────────────────────────────────────────────────
@app.route('/crear-album', methods=['POST'])
def crear_album():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    data  = request.json
    nuevo = Album(titulo=data.get('titulo'), categoria=data.get('categoria'))
    db.session.add(nuevo)
    db.session.commit()
    return jsonify({"id": nuevo.id, "mensaje": "Álbum creado"})

@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    if 'foto' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    archivo   = request.files['foto']
    album_id  = request.form.get('album_id')
    filename  = archivo.filename
    ruta_orig = os.path.join(CARPETA_TEMP, 'orig_' + filename)
    ruta_fin  = os.path.join(CARPETA_TEMP, 'final_' + filename)
    archivo.save(ruta_orig)
    if procesar_imagen(ruta_orig, ruta_fin):
        try:
            resp = cloudinary.uploader.upload(ruta_fin, folder=f"portafolio/album_{album_id}")
            url  = resp['secure_url']
            db.session.add(Foto(url_foto=url, album_id=album_id))
            db.session.commit()
            os.remove(ruta_orig)
            os.remove(ruta_fin)
            return jsonify({"mensaje": "Foto subida", "url": url})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "Error al procesar imagen"}), 500

@app.route('/obtener-datos', methods=['GET'])
def obtener_datos():
    albumes = Album.query.order_by(Album.id.desc()).all()
    return jsonify([{
        "id":       a.id,
        "titulo":   a.titulo,
        "categoria":a.categoria,
        "fotos":    [f.url_foto for f in a.fotos]
    } for a in albumes])

@app.route('/borrar-album/<int:album_id>', methods=['DELETE'])
def borrar_album(album_id):
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    album = Album.query.get(album_id)
    if not album:
        return jsonify({"error": "Álbum no encontrado"}), 404
    db.session.delete(album)
    db.session.commit()
    return jsonify({"mensaje": "Álbum eliminado"})

# ─── MERCADOPAGO ─────────────────────────────────────────────────────────────────
@app.route('/crear-preferencia', methods=['POST'])
def crear_preferencia():
    if not MP_HABILITADO:
        return jsonify({"error": "Pagos no configurados. Contactar por WhatsApp."}), 503

    data       = request.json
    paquete_id = data.get('paquete')
    email      = data.get('email', '')

    if paquete_id not in PAQUETES:
        return jsonify({"error": "Paquete inválido"}), 400

    paquete  = PAQUETES[paquete_id]
    base_url = request.host_url.rstrip('/')

    preference_data = {
        "items": [{
            "title":       f"Nacho Lingua Fotografía — {paquete['nombre']}",
            "description": paquete['descripcion'],
            "quantity":    1,
            "unit_price":  paquete['precio'],
            "currency_id": paquete['moneda']
        }],
        "payer": {"email": email} if email else {},
        "back_urls": {
            "success": f"{base_url}/pago-exitoso",
            "failure": f"{base_url}/pago-fallido",
            "pending": f"{base_url}/pago-pendiente"
        },
        "auto_return":         "approved",
        "notification_url":    f"{base_url}/mp-webhook",
        "statement_descriptor":"NACHO LINGUA FOTO",
        "external_reference":  paquete_id
    }

    result = MP_SDK.preference().create(preference_data)
    if result['status'] == 201:
        pref = result['response']
        db.session.add(Pago(
            mp_preference_id = pref['id'],
            paquete          = paquete['nombre'],
            email_cliente    = email,
            monto            = paquete['precio'],
            estado           = 'pendiente'
        ))
        db.session.commit()
        return jsonify({"init_point": pref['init_point'], "preference_id": pref['id']})
    else:
        return jsonify({"error": "Error al crear preferencia de pago"}), 500

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
                pago    = Pago.query.filter_by(mp_preference_id=pref_id).first()
                if pago:
                    pago.mp_payment_id = str(payment_id)
                    pago.estado        = payment.get('status', 'desconocido')
                    db.session.commit()
    return jsonify({"status": "ok"}), 200

@app.route('/pago-exitoso')
def pago_exitoso():
    return send_from_directory('.', 'pago-exitoso.html')

@app.route('/pago-fallido')
def pago_fallido():
    return send_from_directory('.', 'pago-fallido.html')

@app.route('/pago-pendiente')
def pago_pendiente():
    return send_from_directory('.', 'pago-exitoso.html')

# ─── CONTACTO ────────────────────────────────────────────────────────────────────
@app.route('/contacto', methods=['POST'])
def contacto():
    data = request.json
    db.session.add(Consulta(
        nombre      = data.get('nombre', ''),
        email       = data.get('email', ''),
        telefono    = data.get('telefono', ''),
        tipo_evento = data.get('tipo_evento', ''),
        fecha_evento= data.get('fecha_evento', ''),
        mensaje     = data.get('mensaje', '')
    ))
    db.session.commit()
    return jsonify({"mensaje": "¡Consulta recibida! Nacho te va a contactar pronto."})

# ─── PANEL ADMIN ─────────────────────────────────────────────────────────────────
@app.route('/admin/consultas', methods=['GET'])
def ver_consultas():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    consultas = Consulta.query.order_by(Consulta.creada_en.desc()).all()
    return jsonify([{
        "id":          c.id,
        "nombre":      c.nombre,
        "email":       c.email,
        "telefono":    c.telefono,
        "tipo_evento": c.tipo_evento,
        "fecha_evento":c.fecha_evento,
        "mensaje":     c.mensaje,
        "leida":       c.leida,
        "fecha":       c.creada_en.strftime('%d/%m/%Y %H:%M') if c.creada_en else ''
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

@app.route('/admin/pagos', methods=['GET'])
def ver_pagos():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    pagos = Pago.query.order_by(Pago.creado_en.desc()).all()
    return jsonify([{
        "id":      p.id,
        "paquete": p.paquete,
        "email":   p.email_cliente,
        "monto":   p.monto,
        "estado":  p.estado,
        "fecha":   p.creado_en.strftime('%d/%m/%Y %H:%M') if p.creado_en else ''
    } for p in pagos])

# ─── AUTH ─────────────────────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    # ⚠ Establecer ADMIN_PASSWORD como variable de entorno en producción
    password_correcta = os.environ.get('ADMIN_PASSWORD', 'NachoAdmin2026!')
    if data.get('password') == password_correcta:
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