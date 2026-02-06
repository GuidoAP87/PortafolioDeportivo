import os
from datetime import timedelta
from flask import Flask, request, send_from_directory, jsonify, session
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
import cloudinary
import cloudinary.uploader

# --- CONFIGURACIÓN DE CLOUDINARY ---
cloudinary.config(
    cloud_name = os.environ.get('CLOUD_NAME'),
    api_key = os.environ.get('CLOUD_API_KEY'),
    api_secret = os.environ.get('CLOUD_API_SECRET'),
    secure = True
)

# --- CONFIGURACIÓN DE LA APP ---
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'maradona10'

# BASE DE DATOS
database_url = os.environ.get('DATABASE_URL', 'sqlite:///datos.db')
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# SEGURIDAD (Proxy & Cookies)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(days=7)
)

CORS(app, supports_credentials=True)

# --- CARPETAS TEMPORALES (Solo para procesar, luego se borran) ---
CARPETA_TEMP = 'temp_uploads'
os.makedirs(CARPETA_TEMP, exist_ok=True)

# --- MODELOS DE DATOS ---
class Album(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(100), nullable=False)
    categoria = db.Column(db.String(50), nullable=False)
    fotos = db.relationship('Foto', backref='album', lazy=True, cascade="all, delete-orphan")

class Foto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # AHORA guardamos la URL completa de Cloudinary, no solo el nombre
    url_foto = db.Column(db.String(500), nullable=False) 
    album_id = db.Column(db.Integer, db.ForeignKey('album.id'), nullable=False)

with app.app_context():
    db.create_all()

# --- LÓGICA DE MARCA DE AGUA ---
def procesar_imagen(ruta_entrada, ruta_salida, texto="NACHO LINGUA"):
    try:
        base = Image.open(ruta_entrada).convert("RGBA")
        txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt_layer)
        
        # Tamaño de fuente dinámico
        fontsize = int(base.width / 12)
        try:
            font = ImageFont.truetype("arial.ttf", size=fontsize)
        except:
            font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), texto, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x, y = (base.width - w) / 2, (base.height - h) / 2
        
        # Color blanco semi-transparente
        draw.text((x, y), texto, font=font, fill=(255, 255, 255, 100))
        
        watermarked = Image.alpha_composite(base, txt_layer).convert("RGB")
        watermarked.save(ruta_salida, "JPEG", quality=85)
        return True
    except Exception as e:
        print(f"Error procesando imagen: {e}")
        return False

# --- RUTAS DE LA API ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/crear-album', methods=['POST'])
def crear_album():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403

    data = request.json
    nuevo_album = Album(titulo=data.get('titulo'), categoria=data.get('categoria'))
    db.session.add(nuevo_album)
    db.session.commit()
    return jsonify({"id": nuevo_album.id, "mensaje": "Álbum creado"})

@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403

    if 'foto' not in request.files: return jsonify({"error": "No archivo"}), 400
    archivo = request.files['foto']
    album_id = request.form.get('album_id')

    # 1. Guardar temporalmente en el servidor
    filename = archivo.filename
    ruta_temp_original = os.path.join(CARPETA_TEMP, 'orig_' + filename)
    ruta_temp_final = os.path.join(CARPETA_TEMP, 'final_' + filename)
    archivo.save(ruta_temp_original)

    # 2. Aplicar marca de agua
    exito = procesar_imagen(ruta_temp_original, ruta_temp_final)
    
    if exito:
        # 3. SUBIR A CLOUDINARY (La Bóveda)
        try:
            # Subimos la foto ya marcada
            respuesta_cloud = cloudinary.uploader.upload(
                ruta_temp_final, 
                folder=f"portafolio/album_{album_id}"
            )
            url_segura = respuesta_cloud['secure_url']

            # 4. Guardar el LINK en la base de datos
            nueva_foto = Foto(url_foto=url_segura, album_id=album_id)
            db.session.add(nueva_foto)
            db.session.commit()

            # 5. Borrar archivos temporales (Limpieza)
            os.remove(ruta_temp_original)
            os.remove(ruta_temp_final)

            return jsonify({"mensaje": "Foto subida a la nube", "url": url_segura})

        except Exception as e:
            return jsonify({"error": f"Fallo al subir a Cloudinary: {str(e)}"}), 500
    else:
        return jsonify({"error": "Fallo al procesar imagen"}), 500

@app.route('/obtener-datos', methods=['GET'])
def obtener_datos():
    todos_los_albumes = Album.query.order_by(Album.id.desc()).all()
    lista_respuesta = []
    
    for album in todos_los_albumes:
        lista_respuesta.append({
            "id": album.id,
            "titulo": album.titulo,
            "categoria": album.categoria,
            # Ahora 'f.url_foto' ya es el link completo de internet
            "fotos": [f.url_foto for f in album.fotos] 
        })
        
    return jsonify(lista_respuesta)

# --- LOGIN ---
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    if data.get('password') == "maradona10": 
        session.permanent = True
        session['admin'] = True
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