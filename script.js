/* =========================================
   VARIABLES GLOBALES Y CONFIGURACIÓN
   ========================================= */
const btnAdd = document.getElementById('btn-add-album');
const galleryGrid = document.getElementById('gallery-grid');
const navbar = document.getElementById('navbar');
const collageContainer = document.getElementById('hero-collage');

// --- CORRECCIÓN CRÍTICA ---
// Dejamos esto VACÍO para que funcione en Render (La Nube)
// El navegador usará automáticamente la dirección de tu web.
const API_URL = ''; 

// Variable para saber si el usuario es el dueño (Admin)
let ES_ADMIN = false;

/* =========================================
   1. INICIALIZACIÓN DE LA PÁGINA
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Primero verificamos quién está visitando la página
    await verificarSesion();

    // 2. Cargamos el contenido visual
    cargarCollage(); 
    
    // 3. Cargamos los datos reales desde la base de datos
    await cargarAlbumesDesdeBD(); 
});

/* =========================================
   2. SISTEMA DE SEGURIDAD Y SESIÓN
   ========================================= */
async function verificarSesion() {
    try {
        // 'credentials: include' es vital para enviar la cookie de sesión
        const res = await fetch(`${API_URL}/check-auth`, { credentials: 'include' });
        const data = await res.json();
        ES_ADMIN = data.isAdmin;

        // GESTIÓN DE LA INTERFAZ (UI) SEGÚN EL ROL
        if (ES_ADMIN) {
            console.log("Modo ADMIN activo");
            // Mostrar botón de crear álbum
            if(btnAdd) btnAdd.style.display = 'block';
            // Agregar botón de Salir en el menú
            agregarBotonLogout();
        } else {
            console.log("Modo VISITANTE activo");
            // Ocultar botón de crear álbum
            if(btnAdd) btnAdd.style.display = 'none';
        }
    } catch (error) {
        console.error("Error verificando sesión (Backend desconectado?)", error);
        if(btnAdd) btnAdd.style.display = 'none';
    }
}

function agregarBotonLogout() {
    const navLinks = document.querySelector('.nav-links');
    // Evitamos duplicar el botón si ya existe
    if (document.getElementById('btn-logout')) return;

    const li = document.createElement('li');
    li.innerHTML = '<a href="#" id="btn-logout" style="color:#ff6b6b; font-weight:bold;">SALIR</a>';
    li.addEventListener('click', cerrarSesion);
    navLinks.appendChild(li);
}

async function cerrarSesion(e) {
    if(e) e.preventDefault();
    try {
        await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' });
        location.reload(); // Recargamos para volver a modo visitante
    } catch (error) {
        console.error("Error al cerrar sesión", error);
    }
}

/* =========================================
   3. GESTIÓN DE DATOS (ÁLBUMES)
   ========================================= */
async function cargarAlbumesDesdeBD() {
    try {
        const response = await fetch(`${API_URL}/obtener-datos`);
        const albumes = await response.json();
        
        // Limpiamos el mensaje de "vacío" si hay álbumes
        if (albumes.length > 0) {
            const emptyState = document.querySelector('.empty-state');
            if (emptyState) emptyState.remove();
        }

        // Dibujamos cada álbum recuperado (Inverso para que los nuevos salgan primero)
        albumes.forEach(album => {
            renderizarAlbum(album.id, album.titulo, album.categoria, album.fotos);
        });
    } catch (error) {
        console.error("Error conectando con la base de datos:", error);
    }
}

// CREAR NUEVO ÁLBUM (Solo funcionará si el botón es visible)
if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
        const nombre = prompt("Título del nuevo trabajo:");
        if (!nombre) return;

        let categoria = prompt("Categoría (futbol, basquet, social):") || 'social';
        categoria = categoria.toLowerCase();

        try {
            const response = await fetch(`${API_URL}/crear-album`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo: nombre, categoria: categoria }),
                credentials: 'include' // Necesario para validar que eres admin
            });
            
            const data = await response.json();
            
            if (data.id) {
                const emptyState = document.querySelector('.empty-state');
                if (emptyState) emptyState.remove();
                
                // Renderizamos el álbum vacío
                renderizarAlbum(data.id, nombre, categoria, []);
            } else {
                alert("Error: " + (data.error || "No autorizado"));
            }
        } catch (error) {
            alert("Error de conexión con el servidor.");
        }
    });
}

/* =========================================
   4. RENDERIZADO (DIBUJAR EN PANTALLA)
   ========================================= */
function renderizarAlbum(id, titulo, categoria, fotosPreexistentes) {
    const card = document.createElement('div');
    card.classList.add('album-card');
    card.dataset.category = categoria;

    // LÓGICA CONDICIONAL: ¿Mostramos el botón de subir fotos?
    // Solo si ES_ADMIN es verdadero
    let htmlSubida = '';
    if (ES_ADMIN) {
        htmlSubida = `
        <label class="add-photo-label">
            <i class="fa-solid fa-camera"></i> Añadir Fotos
            <input type="file" multiple accept="image/*" style="display:none" onchange="subirFotos(this, '${id}')">
        </label>
        `;
    }

    card.innerHTML = `
        <div class="album-header">
            <span class="album-title">${titulo}</span>
            <span class="album-category">${categoria.toUpperCase()}</span>
        </div>
        
        <div class="album-photos" id="photos-${id}">
            </div>

        ${htmlSubida} `;

    // Si hay fotos guardadas, las mostramos
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
   5. SUBIR FOTOS (CONECTADO A BD)
   ========================================= */
window.subirFotos = async function(input, idAlbum) {
    const contenedorFotos = document.getElementById(`photos-${idAlbum}`);
    
    if (input.files && input.files.length > 0) {
        for (const file of Array.from(input.files)) {
            const formData = new FormData();
            formData.append('foto', file);
            formData.append('album_id', idAlbum);

            try {
                const response = await fetch(`${API_URL}/subir-foto`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'include' // Importante para permiso de admin
                });
                
                const data = await response.json();
                
                if (data.url) {
                    const img = document.createElement('img');
                    img.src = data.url;
                    img.classList.add('photo-thumb');
                    img.style.animation = "fadeIn 0.5s";
                    contenedorFotos.appendChild(img);
                } else {
                    alert("Error al subir: " + (data.error || "Desconocido"));
                }

            } catch (error) {
                console.error("Error subiendo foto:", error);
            }
        }
    }
}

/* =========================================
   6. EXTRAS (COLLAGE, SCROLL, FILTROS)
   ========================================= */
function cargarCollage() {
    if (!collageContainer) return;
    const rutaCarpeta = 'maradona/';  
    const nombreBase = 'maradona';    
    const extension = '.jpg';         
    
    // Intentamos cargar 26 fotos
    for (let i = 1; i <= 26; i++) {
        const img = document.createElement('img');
        img.src = `${rutaCarpeta}${nombreBase}${i}${extension}`;
        img.alt = "Fondo";
        // Si falla la carga, ocultamos la imagen rota
        img.onerror = function() { this.style.display = 'none'; };
        collageContainer.appendChild(img);
    }
}

// Efecto Navbar Scroll
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
});

// Lógica de Filtros (Fútbol, Básquet, Social)
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filtro = btn.dataset.filter;
        const albumes = document.querySelectorAll('.album-card');

        albumes.forEach(album => {
            if (filtro === 'all' || album.dataset.category === filtro) {
                album.style.display = 'block';
            } else {
                album.style.display = 'none';
            }
        });
    });
});