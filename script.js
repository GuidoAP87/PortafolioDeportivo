/* =========================================
   VARIABLES GLOBALES Y REFERENCIAS
   ========================================= */
const btnAdd = document.getElementById('btn-add-album');
const galleryGrid = document.getElementById('gallery-grid');
const navbar = document.getElementById('navbar');
const collageContainer = document.getElementById('hero-collage');

/* =========================================
   1. LÓGICA DE LA PORTADA (COLLAGE DINÁMICO)
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    if (!collageContainer) return; // Protección por si no existe el elemento

    // Configuración de la carpeta de imágenes
    const rutaCarpeta = 'maradona/';  
    const nombreBase = 'maradona';    
    const extension = '.jpg';         
    const cantidadFotos = 26;         

    // Bucle para crear las 26 imágenes
    for (let i = 1; i <= cantidadFotos; i++) {
        const img = document.createElement('img');
        
        // Construye la ruta: maradona/maradona1.jpg, maradona/maradona2.jpg...
        img.src = `${rutaCarpeta}${nombreBase}${i}${extension}`;
        img.alt = `Fondo Portada ${i}`;
        
        // Si hay algún error (falta una foto), la ocultamos para no romper el diseño
        img.onerror = function() {
            this.style.display = 'none';
        };

        collageContainer.appendChild(img);
    }
});

/* =========================================
   2. EFECTO NAVBAR (SCROLL)
   ========================================= */
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

/* =========================================
   3. CREACIÓN DE ÁLBUMES (TARJETAS)
   ========================================= */
if (btnAdd) {
    btnAdd.addEventListener('click', () => {
        const nombre = prompt("Título del nuevo trabajo (ej: Boda en las Sierras):");
        if (!nombre) return;

        let categoria = prompt("Categoría (futbol, basquet, o social):") || 'social';
        categoria = categoria.toLowerCase();

        // Eliminar mensaje de "No hay galerías" si existe
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        crearTarjetaAlbum(nombre, categoria);
    });
}

function crearTarjetaAlbum(titulo, categoria) {
    const idUnico = Date.now(); // Genera un ID único basado en la hora actual
    
    const card = document.createElement('div');
    card.classList.add('album-card');
    card.dataset.category = categoria; // Importante para los filtros

    // Estructura HTML de la tarjeta
    card.innerHTML = `
        <div class="album-header">
            <span class="album-title">${titulo}</span>
            <span class="album-category">${categoria.toUpperCase()}</span>
        </div>
        
        <div class="album-photos" id="photos-${idUnico}"></div>

        <label class="add-photo-label">
            <i class="fa-solid fa-camera"></i> Añadir Fotos
            <input type="file" multiple accept="image/*" style="display:none" onchange="procesarFotos(this, '${idUnico}')">
        </label>
    `;

    // Insertamos la tarjeta al principio de la grilla
    galleryGrid.prepend(card);
}

/* =========================================
   4. PROCESAR FOTOS (CONEXIÓN CON PYTHON)
   ========================================= */
// Esta función ahora es ASYNC porque espera respuesta del servidor
window.procesarFotos = async function(input, idAlbum) {
    const contenedorFotos = document.getElementById(`photos-${idAlbum}`);
    
    if (input.files && input.files.length > 0) {
        
        // Recorremos cada foto seleccionada
        for (const file of Array.from(input.files)) {
            
            // 1. Preparamos el envío de datos
            const formData = new FormData();
            formData.append('foto', file); // 'foto' debe coincidir con lo que espera app.py

            try {
                // 2. Enviamos la foto al servidor Python (Flask)
                // Asegúrate de que app.py esté corriendo en el puerto 5000
                const response = await fetch('http://localhost:5000/subir-foto', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Error del servidor: ${response.status}`);
                }

                // 3. Recibimos la respuesta con la URL de la foto marcada
                const data = await response.json();
                
                // data.url_publica viene del backend (ej: maradona/watermarked/foto.jpg)
                // Construimos la URL completa para mostrarla
                const urlImagenFinal = 'http://localhost:5000/galeria/' + file.name;

                // 4. Creamos la imagen en el DOM
                const img = document.createElement('img');
                img.src = urlImagenFinal; // Usamos la URL del servidor
                img.classList.add('photo-thumb');
                
                // Añadimos un pequeño efecto de carga
                img.onload = () => {
                    img.style.animation = "fadeIn 0.5s";
                };

                contenedorFotos.appendChild(img);

            } catch (error) {
                console.error("Error al subir foto:", error);
                alert("⚠️ Error: No se pudo conectar con el servidor Python.\nAsegúrate de ejecutar 'python app.py' en la terminal.");
            }
        }
    }
}

/* =========================================
   5. FILTROS DE CATEGORÍA
   ========================================= */
const botonesFiltro = document.querySelectorAll('.filter-btn');

botonesFiltro.forEach(btn => {
    btn.addEventListener('click', () => {
        // Gestión de la clase 'active'
        botonesFiltro.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Lógica de filtrado
        const filtro = btn.dataset.filter;
        const albumes = document.querySelectorAll('.album-card');

        albumes.forEach(album => {
            if (filtro === 'all') {
                album.style.display = 'block';
            } else {
                // Compara la categoría del botón con el data-category de la tarjeta
                if (album.dataset.category === filtro) {
                    album.style.display = 'block';
                } else {
                    album.style.display = 'none';
                }
            }
        });
    });
});