/* =========================================
   VARIABLES GLOBALES
   ========================================= */
const btnAdd = document.getElementById('btn-add-album');
const galleryGrid = document.getElementById('gallery-grid');
const navbar = document.getElementById('navbar');
const collageContainer = document.getElementById('hero-collage');
const API_URL = 'http://localhost:5000'; // Dirección de tu Backend

/* =========================================
   1. AL CARGAR LA PÁGINA: RECUPERAR DATOS
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    cargarCollage(); // Carga las fotos de Maradona
    await cargarAlbumesDesdeBD(); // Carga tus álbumes guardados
});

async function cargarAlbumesDesdeBD() {
    try {
        const response = await fetch(`${API_URL}/obtener-datos`);
        const albumes = await response.json();
        
        // Limpiamos el mensaje de "vacío" si hay álbumes
        if (albumes.length > 0) {
            const emptyState = document.querySelector('.empty-state');
            if (emptyState) emptyState.remove();
        }

        // Dibujamos cada álbum recuperado
        albumes.forEach(album => {
            renderizarAlbum(album.id, album.titulo, album.categoria, album.fotos);
        });
    } catch (error) {
        console.error("Error conectando con la base de datos:", error);
    }
}

/* =========================================
   2. CREAR NUEVO ÁLBUM (GUARDAR EN BD)
   ========================================= */
if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
        const nombre = prompt("Título del nuevo trabajo:");
        if (!nombre) return;

        let categoria = prompt("Categoría (futbol, basquet, social):") || 'social';
        categoria = categoria.toLowerCase();

        // 1. Enviamos a Python para guardar
        try {
            const response = await fetch(`${API_URL}/crear-album`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo: nombre, categoria: categoria })
            });
            
            const data = await response.json();
            
            // 2. Si Python dice OK, dibujamos la tarjeta
            if (data.id) {
                const emptyState = document.querySelector('.empty-state');
                if (emptyState) emptyState.remove();
                
                // Renderizamos (sin fotos al principio)
                renderizarAlbum(data.id, nombre, categoria, []);
            }
        } catch (error) {
            alert("Error: Asegúrate de que 'python app.py' esté corriendo.");
        }
    });
}

/* =========================================
   3. FUNCIÓN PARA DIBUJAR TARJETAS (RENDER)
   ========================================= */
function renderizarAlbum(id, titulo, categoria, fotosPreexistentes) {
    const card = document.createElement('div');
    card.classList.add('album-card');
    card.dataset.category = categoria;

    card.innerHTML = `
        <div class="album-header">
            <span class="album-title">${titulo}</span>
            <span class="album-category">${categoria.toUpperCase()}</span>
        </div>
        
        <div class="album-photos" id="photos-${id}">
            </div>

        <label class="add-photo-label">
            <i class="fa-solid fa-camera"></i> Añadir Fotos
            <input type="file" multiple accept="image/*" style="display:none" onchange="subirFotos(this, '${id}')">
        </label>
    `;

    // Si recuperamos fotos de la base de datos, las mostramos
    if (fotosPreexistentes && fotosPreexistentes.length > 0) {
        const contenedor = card.querySelector(`#photos-${id}`);
        fotosPreexistentes.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.classList.add('photo-thumb');
            contenedor.appendChild(img);
        });
    }

    galleryGrid.prepend(card);
}

/* =========================================
   4. SUBIR FOTOS (CONECTADO A BD)
   ========================================= */
window.subirFotos = async function(input, idAlbum) {
    const contenedorFotos = document.getElementById(`photos-${idAlbum}`);
    
    if (input.files && input.files.length > 0) {
        for (const file of Array.from(input.files)) {
            const formData = new FormData();
            formData.append('foto', file);
            formData.append('album_id', idAlbum); // Le decimos a qué álbum pertenece

            try {
                const response = await fetch(`${API_URL}/subir-foto`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                // Mostrar la foto devuelta por el servidor
                const img = document.createElement('img');
                img.src = data.url;
                img.classList.add('photo-thumb');
                img.style.animation = "fadeIn 0.5s";
                contenedorFotos.appendChild(img);

            } catch (error) {
                console.error("Error subiendo foto:", error);
            }
        }
    }
}

/* =========================================
   5. EXTRAS (Collage y Scroll)
   ========================================= */
function cargarCollage() {
    if (!collageContainer) return;
    const rutaCarpeta = 'maradona/';  
    const nombreBase = 'maradona';    
    const extension = '.jpg';         
    
    for (let i = 1; i <= 26; i++) {
        const img = document.createElement('img');
        img.src = `${rutaCarpeta}${nombreBase}${i}${extension}`;
        img.onerror = function() { this.style.display = 'none'; };
        collageContainer.appendChild(img);
    }
}

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
});

// Filtros
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filtro = btn.dataset.filter;
        document.querySelectorAll('.album-card').forEach(album => {
            if (filtro === 'all' || album.dataset.category === filtro) {
                album.style.display = 'block';
            } else {
                album.style.display = 'none';
            }
        });
    });
});