import os
import sqlite3
from flask import Flask, request, send_from_directory, jsonify
from flask_cors import CORS # Importante para evitar errores de conexión
from PIL import Image, ImageDraw, ImageFont
# ... tus imports actuales ...
from flask import session # AGREGAR ESTO

app = Flask(__name__)
app.secret_key = 'tu_secreto_super_seguro' # NECESARIO PARA LAS SESIONES
CORS(app, supports_credentials=True) # IMPORTANTE: Permite cookies de sesión
app = Flask(__name__)
CORS(app) # Permite que el navegador confíe en el servidor local

# --- CONFIGURACIÓN ---
CARPETA_ORIGINALES = 'seguridad/originales'
CARPETA_PUBLICAS = 'maradona/watermarked'
DB_NAME = 'datos.db'

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PUBLICAS, exist_ok=True)

# --- BASE DE DATOS ---
def init_db():
    """Crea las tablas si no existen"""
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Tabla Álbumes
    c.execute('''CREATE TABLE IF NOT EXISTS albumes 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, categoria TEXT)''')
    # Tabla Fotos
    c.execute('''CREATE TABLE IF NOT EXISTS fotos 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER, filename TEXT)''')
    conn.commit()
    conn.close()

# Iniciamos la DB al arrancar el programa
init_db()

def conectar_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row # Para acceder a los datos por nombre
    return conn

# --- LÓGICA DE MARCA DE AGUA (Igual que antes) ---
def aplicar_marca_agua(input_path, output_path, texto="NACHO LINGUA"):
    try:
        base = Image.open(input_path).convert("RGBA")
        txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt_layer)
        
        # Intentamos cargar una fuente del sistema, sino la default
        try:
            font = ImageFont.truetype("arial.ttf", size=int(base.width / 12))
        except:
            font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), texto, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (base.width - text_width) / 2
        y = (base.height - text_height) / 2

        draw.text((x, y), texto, font=font, fill=(255, 255, 255, 100)) # Transparencia

        watermarked = Image.alpha_composite(base, txt_layer)
        watermarked = watermarked.convert("RGB")
        watermarked.save(output_path, "JPEG", quality=85)
    except Exception as e:
        print(f"Error procesando imagen: {e}")

# --- RUTAS (API) ---

# 1. Crear un Nuevo Álbum
@app.route('/crear-album', methods=['POST'])
def crear_album():
    data = request.json
    titulo = data.get('titulo')
    categoria = data.get('categoria')
    
    conn = conectar_db()
    c = conn.cursor()
    c.execute("INSERT INTO albumes (titulo, categoria) VALUES (?, ?)", (titulo, categoria))
    conn.commit()
    nuevo_id = c.lastrowid # Python nos dice qué ID le asignó la base de datos
    conn.close()
    
    return jsonify({"id": nuevo_id, "mensaje": "Álbum creado"})

# 2. Subir Foto a un Álbum específico
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if 'foto' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    
    archivo = request.files['foto']
    album_id = request.form.get('album_id') # Ahora recibimos el ID del álbum
    
    if not album_id:
        return jsonify({"error": "Falta el ID del álbum"}), 400

    nombre = archivo.filename
    
    # Guardar en disco
    ruta_original = os.path.join(CARPETA_ORIGINALES, nombre)
    archivo.save(ruta_original)
    
    ruta_publica = os.path.join(CARPETA_PUBLICAS, nombre)
    aplicar_marca_agua(ruta_original, ruta_publica)
    
    # Guardar en Base de Datos
    conn = conectar_db()
    c = conn.cursor()
    c.execute("INSERT INTO fotos (album_id, filename) VALUES (?, ?)", (album_id, nombre))
    conn.commit()
    conn.close()
    
    # Devolvemos la URL para que el Frontend la muestre
    url_publica = f"http://localhost:5000/galeria/{nombre}"
    return jsonify({"mensaje": "Foto procesada", "url": url_publica})

# 3. Obtener TODO (Para recargar la página y no perder nada)
@app.route('/obtener-datos', methods=['GET'])
def obtener_datos():
    conn = conectar_db()
    c = conn.cursor()
    
    # Traemos todos los álbumes
    c.execute("SELECT * FROM albumes ORDER BY id DESC")
    albumes_raw = c.fetchall()
    
    lista_albumes = []
    
    for album in albumes_raw:
        # Para cada álbum, buscamos sus fotos
        c.execute("SELECT filename FROM fotos WHERE album_id = ?", (album['id'],))
        fotos_raw = c.fetchall()
        fotos = [f"http://localhost:5000/galeria/{f['filename']}" for f in fotos_raw]
        
        lista_albumes.append({
            "id": album['id'],
            "titulo": album['titulo'],
            "categoria": album['categoria'],
            "fotos": fotos
        })
        
    conn.close()
    return jsonify(lista_albumes)

# Rutas de Archivos Estáticos
@app.route('/galeria/<filename>')
def ver_foto(filename):
    return send_from_directory(CARPETA_PUBLICAS, filename)

# --- SISTEMA DE LOGIN ---

# 1. Iniciar Sesión
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    password = data.get('password')
    
    # AQUÍ CONFIGURAS TU CONTRASEÑA DE ADMIN
    if password == "maradona10": 
        session['admin'] = True
        return jsonify({"success": True, "mensaje": "Bienvenido Nacho"})
    else:
        return jsonify({"success": False, "error": "Contraseña incorrecta"}), 401

# 2. Verificar si estoy logueado (Para el Frontend)
@app.route('/check-auth', methods=['GET'])
def check_auth():
    es_admin = session.get('admin', False)
    return jsonify({"isAdmin": es_admin})

# 3. Cerrar Sesión
@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin', None)
    return jsonify({"success": True})

# --- PROTECCIÓN DE RUTAS (Modificar las existentes) ---

# Modifica tu función 'crear_album' agregando esto al principio:
@app.route('/crear-album', methods=['POST'])
def crear_album():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    # ... resto del código ...

# Modifica tu función 'subir_foto' agregando esto al principio:
@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if not session.get('admin'):
        return jsonify({"error": "No autorizado"}), 403
    # ... resto del código ...

if __name__ == '__main__':
    app.run(debug=True, port=5000)