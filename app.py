import os
import sqlite3
from flask import Flask, request, send_from_directory, jsonify, session
from flask_cors import CORS
from datetime import timedelta
from PIL import Image, ImageDraw, ImageFont

# --- CONFIGURACIÓN DE LA APP ---
app = Flask(__name__, static_folder='.', static_url_path='')

app.secret_key = 'maradona10' 

# CONFIGURACIÓN DE SESIÓN (SOLUCIÓN AL PROBLEMA)
app.permanent_session_lifetime = timedelta(days=7) # La sesión durará 7 días
app.config['SESSION_COOKIE_SECURE'] = True         # Obligatorio para Render (HTTPS)
app.config['SESSION_COOKIE_SAMESITE'] = 'None'     # Evita que el navegador bloquee la cookie

CORS(app, supports_credentials=True)

# --- CONFIGURACIÓN DE CARPETAS ---
CARPETA_ORIGINALES = 'seguridad/originales'
CARPETA_PUBLICAS = 'maradona/watermarked'
DB_NAME = 'datos.db'

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PUBLICAS, exist_ok=True)

# --- RUTA PRINCIPAL (CRÍTICA PARA RENDER) ---
@app.route('/')
def index():
    # Cuando entres a la web, muestra el archivo index.html
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

# 1. Crear Álbum (CON SEGURIDAD)
@app.route('/crear-album', methods=['POST'])
def crear_album():
    # Verificación de seguridad: ¿Es admin?
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

# 2. Subir Foto (CON SEGURIDAD)
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    # Verificación de seguridad: ¿Es admin?
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403

    if 'foto' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    
    archivo = request.files['foto']
    album_id = request.form.get('album_id')
    
    if not album_id:
        return jsonify({"error": "Falta el ID del álbum"}), 400

    nombre = archivo.filename
    
    # Guardar original y generar marca de agua
    ruta_original = os.path.join(CARPETA_ORIGINALES, nombre)
    archivo.save(ruta_original)
    
    ruta_publica = os.path.join(CARPETA_PUBLICAS, nombre)
    aplicar_marca_agua(ruta_original, ruta_publica)
    
    # Guardar en BD
    conn = conectar_db()
    c = conn.cursor()
    c.execute("INSERT INTO fotos (album_id, filename) VALUES (?, ?)", (album_id, nombre))
    conn.commit()
    conn.close()
    
    # Usamos ruta relativa para que funcione en Render y Localhost
    url_publica = f"/galeria/{nombre}"
    return jsonify({"mensaje": "Foto procesada", "url": url_publica})

# 3. Obtener Datos
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
        # Ruta relativa
        fotos = [f"/galeria/{f['filename']}" for f in fotos_raw]
        
        lista_albumes.append({
            "id": album['id'],
            "titulo": album['titulo'],
            "categoria": album['categoria'],
            "fotos": fotos
        })
        
    conn.close()
    return jsonify(lista_albumes)

# 4. Servir imágenes
@app.route('/galeria/<filename>')
def ver_foto(filename):
    return send_from_directory(CARPETA_PUBLICAS, filename)

# --- SISTEMA DE LOGIN ---

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    password = data.get('password')
    
    if password == "maradona10": 
        session.permanent = True  # <--- AGREGAR ESTO: Activa los 7 días
        session['admin'] = True
        return jsonify({"success": True, "mensaje": "Bienvenido Nacho"})
    else:
        return jsonify({"success": False, "error": "Contraseña incorrecta"}), 401

@app.route('/check-auth', methods=['GET'])
def check_auth():
    es_admin = session.get('admin', False)
    return jsonify({"isAdmin": es_admin})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)