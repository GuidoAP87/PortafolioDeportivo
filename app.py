import os
import sqlite3
from datetime import timedelta
from flask import Flask, request, send_from_directory, jsonify, session
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix # <--- SOLUCIÓN AL PROBLEMA

# --- CONFIGURACIÓN DE LA APP ---
app = Flask(__name__, static_folder='.', static_url_path='')

# 1. CLAVE SECRETA (No la cambies)
app.secret_key = 'maradona10'

# 2. PROXY FIX (CRÍTICO PARA RENDER)
# Esto le dice a Flask: "Confía en que Render está manejando el HTTPS"
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# 3. CONFIGURACIÓN DE COOKIES BLINDADA
app.config.update(
    SESSION_COOKIE_SECURE=True,       # Solo viaja por HTTPS (Render)
    SESSION_COOKIE_HTTPONLY=True,     # JavaScript no puede robarla
    SESSION_COOKIE_SAMESITE='Lax',    # 'Lax' es más compatible que 'None'
    PERMANENT_SESSION_LIFETIME=timedelta(days=7) # Dura 7 días
)

CORS(app, supports_credentials=True)

# --- CONFIGURACIÓN DE CARPETAS ---
CARPETA_ORIGINALES = 'seguridad/originales'
CARPETA_PUBLICAS = 'maradona/watermarked'
DB_NAME = 'datos.db'

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PUBLICAS, exist_ok=True)

# --- RUTA PRINCIPAL ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# --- BASE DE DATOS ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS albumes 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, categoria TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS fotos 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER, filename TEXT)''')
    conn.commit()
    conn.close()

init_db()

def conectar_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

# --- LÓGICA DE MARCA DE AGUA ---
def aplicar_marca_agua(input_path, output_path, texto="NACHO LINGUA"):
    try:
        base = Image.open(input_path).convert("RGBA")
        txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt_layer)
        
        try:
            font = ImageFont.truetype("arial.ttf", size=int(base.width / 12))
        except:
            font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), texto, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (base.width - text_width) / 2
        y = (base.height - text_height) / 2

        draw.text((x, y), texto, font=font, fill=(255, 255, 255, 100))

        watermarked = Image.alpha_composite(base, txt_layer)
        watermarked = watermarked.convert("RGB")
        watermarked.save(output_path, "JPEG", quality=85)
    except Exception as e:
        print(f"Error procesando imagen: {e}")

# --- RUTAS DE LA API ---

@app.route('/crear-album', methods=['POST'])
def crear_album():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403

    data = request.json
    titulo = data.get('titulo')
    categoria = data.get('categoria')
    
    conn = conectar_db()
    c = conn.cursor()
    c.execute("INSERT INTO albumes (titulo, categoria) VALUES (?, ?)", (titulo, categoria))
    conn.commit()
    nuevo_id = c.lastrowid
    conn.close()
    
    return jsonify({"id": nuevo_id, "mensaje": "Álbum creado"})

@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403

    if 'foto' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    
    archivo = request.files['foto']
    album_id = request.form.get('album_id')
    
    if not album_id:
        return jsonify({"error": "Falta el ID del álbum"}), 400

    nombre = archivo.filename
    ruta_original = os.path.join(CARPETA_ORIGINALES, nombre)
    archivo.save(ruta_original)
    
    ruta_publica = os.path.join(CARPETA_PUBLICAS, nombre)
    aplicar_marca_agua(ruta_original, ruta_publica)
    
    conn = conectar_db()
    c = conn.cursor()
    c.execute("INSERT INTO fotos (album_id, filename) VALUES (?, ?)", (album_id, nombre))
    conn.commit()
    conn.close()
    
    url_publica = f"/galeria/{nombre}"
    return jsonify({"mensaje": "Foto procesada", "url": url_publica})

@app.route('/obtener-datos', methods=['GET'])
def obtener_datos():
    conn = conectar_db()
    c = conn.cursor()
    c.execute("SELECT * FROM albumes ORDER BY id DESC")
    albumes_raw = c.fetchall()
    
    lista_albumes = []
    for album in albumes_raw:
        c.execute("SELECT filename FROM fotos WHERE album_id = ?", (album['id'],))
        fotos_raw = c.fetchall()
        fotos = [f"/galeria/{f['filename']}" for f in fotos_raw]
        lista_albumes.append({
            "id": album['id'],
            "titulo": album['titulo'],
            "categoria": album['categoria'],
            "fotos": fotos
        })
    conn.close()
    return jsonify(lista_albumes)

@app.route('/galeria/<filename>')
def ver_foto(filename):
    return send_from_directory(CARPETA_PUBLICAS, filename)

# --- SISTEMA DE LOGIN ---

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    password = data.get('password')
    
    if password == "maradona10": 
        session.permanent = True  # Mantiene la sesión viva
        session['admin'] = True
        return jsonify({"success": True, "mensaje": "Bienvenido Nacho"})
    else:
        return jsonify({"success": False, "error": "Contraseña incorrecta"}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth():
    # Depuración: imprime en los logs de Render quién está entrando
    es_admin = session.get('admin', False)
    print(f"Verificando Auth: {es_admin}") 
    return jsonify({"isAdmin": es_admin})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)