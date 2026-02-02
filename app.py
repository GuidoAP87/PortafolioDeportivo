import os
from flask import Flask, request, send_from_directory, jsonify
from PIL import Image, ImageDraw, ImageFont

app = Flask(__name__)

# CONFIGURACIÓN DE CARPETAS
CARPETA_ORIGINALES = 'seguridad/originales' # Nadie entra aquí
CARPETA_PUBLICAS = 'maradona/watermarked'   # Estas se ven en la web

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PUBLICAS, exist_ok=True)

def aplicar_marca_agua(input_path, output_path, texto="NACHO LINGUA"):
    """
    Toma una imagen, le pone una marca de agua semitransparente y la guarda.
    """
    base = Image.open(input_path).convert("RGBA")
    
    # Crear una capa transparente para el texto
    txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    # Configurar fuente (usamos una por defecto si no hay ttf)
    # Para hacerlo pro, descarga una fuente .ttf y pon su ruta aquí
    try:
        font = ImageFont.truetype("arial.ttf", size=int(base.width / 10))
    except:
        font = ImageFont.load_default()

    # Calcular posición (Centro)
    # Nota: textbbox es la forma moderna de obtener tamaño en Pillow
    bbox = draw.textbbox((0, 0), texto, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (base.width - text_width) / 2
    y = (base.height - text_height) / 2

    # Escribir el texto (Blanco con transparencia 128/255)
    draw.text((x, y), texto, font=font, fill=(255, 255, 255, 128))

    # Fusionar y guardar como JPG
    watermarked = Image.alpha_composite(base, txt_layer)
    watermarked = watermarked.convert("RGB") # JPG no soporta transparencia
    watermarked.save(output_path, "JPEG", quality=85)

# --- RUTAS DEL SISTEMA ---

@app.route('/subir-foto', methods=['POST'])
def subir_foto():
    if 'foto' not in request.files:
        return jsonify({"error": "No hay archivo"}), 400
    
    archivo = request.files['foto']
    nombre = archivo.filename
    
    # 1. Guardar ORIGINAL (Limpia)
    ruta_original = os.path.join(CARPETA_ORIGINALES, nombre)
    archivo.save(ruta_original)
    
    # 2. Generar COPIA (Marca de agua)
    ruta_publica = os.path.join(CARPETA_PUBLICAS, nombre)
    aplicar_marca_agua(ruta_original, ruta_publica)
    
    return jsonify({"mensaje": "Foto procesada", "url_publica": ruta_publica})

# Ruta para ver las fotos en la web (Marca de agua)
@app.route('/galeria/<filename>')
def ver_foto(filename):
    return send_from_directory(CARPETA_PUBLICAS, filename)

# Ruta "PREMIUM": Solo se accede si pagaron (Simulado)
@app.route('/descargar-compra/<filename>')
def descargar_original(filename):
    # AQUÍ IRÍA LA LÓGICA DE VERIFICAR PAGO
    # if usuario_pago == True:
    return send_from_directory(CARPETA_ORIGINALES, filename, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, port=5000)