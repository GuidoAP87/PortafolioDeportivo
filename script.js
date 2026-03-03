const API_URL = "https://portafoliodeportivo.onrender.com"; 
let albumesData = []; // Guardamos los datos acá para que la página sea ultra rápida

document.addEventListener('DOMContentLoaded', () => {
    cargarAlbumes();
    
    const btnLogout = document.getElementById('btn-logout'); 
    if(btnLogout) btnLogout.addEventListener('click', logout);

    const btnAddAlbum = document.getElementById('btn-add-album');
    if(btnAddAlbum) btnAddAlbum.addEventListener('click', crearAlbum);
});

async function crearAlbum() {
    const titulo = prompt("Ingresa el título del nuevo álbum (Ej: Final Talleres vs Belgrano):");
    if (!titulo) return;

    const categoria = prompt("Ingresa la categoría (escribe: futbol, basquet, o social):");
    if (!categoria) return;

    try {
        const res = await fetch(`${API_URL}/crear-album`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ titulo: titulo, categoria: categoria.toLowerCase().trim() })
        });

        if (res.ok) {
            cargarAlbumes();
        } else {
            alert("Acceso denegado. ¿Iniciaste sesión?");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
}

async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p style="color:white; text-align:center">Cargando portafolio...</p>';

    try {
        const respuesta = await fetch(`${API_URL}/obtener-datos`);
        albumesData = await respuesta.json(); 
        renderizarCarpetas(); // Mostramos el menú principal de álbumes
    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
}

// --- FASE 1: DIBUJAR LAS "CARPETAS" (PORTADAS) ---
function renderizarCarpetas() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = ''; 

    // Mostramos los filtros
    document.getElementById('category-filters').style.display = 'flex';

    if (albumesData.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>Aún no hay trabajos subidos.</p></div>';
        return;
    }

    albumesData.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card';
        card.style.cursor = 'pointer'; // Manito al pasar por encima
        card.onclick = () => verAlbumDetalle(album.id); // Al tocar, abre el álbum
        
        const categoriaReal = album.categoria || "general";
        const categoriaLimpia = categoriaReal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        card.setAttribute('data-categoria', categoriaLimpia);
        
        // La primera foto es la portada. Si no hay, fondo gris.
        const portadaUrl = (album.fotos && album.fotos.length > 0) ? album.fotos[0] : 'https://via.placeholder.com/400x300/222/555?text=Carpeta+Vacia';
        const cantidad = album.fotos ? album.fotos.length : 0;

        card.innerHTML = `
            <div style="position: relative;">
                <img src="${portadaUrl}" style="width: 100%; height: 250px; object-fit: cover; display: block;" alt="Portada">
                <span class="badge" style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8);">${categoriaReal}</span>
            </div>
            <div style="padding: 20px; background: #111; text-align: center;">
                <h3 style="margin: 0; font-size: 1.3em; font-family: 'Playfair Display', serif;">${album.titulo}</h3>
                <p style="color: #888; margin: 5px 0 0 0; font-size: 0.9em;">${cantidad} fotos</p>
            </div>
        `;
        grid.appendChild(card);
    });

    configurarFiltros();
}

// --- FASE 2: VISTA INMERSIVA DE UN ÁLBUM COMPLETO ---
function verAlbumDetalle(albumId) {
    const album = albumesData.find(a => a.id === albumId);
    if(!album) return;

    const grid = document.getElementById('gallery-grid');
    
    // Escondemos los filtros porque estamos dentro del álbum
    document.getElementById('category-filters').style.display = 'none';

    // Armamos la pantalla completa del álbum
    let htmlContent = `
        <div style="grid-column: 1 / -1; margin-bottom: 30px;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <button onclick="renderizarCarpetas()" style="background: transparent; color: #d4af37; border: 1px solid #d4af37; padding: 10px 20px; border-radius: 4px; cursor: pointer; transition: 0.3s;">
                        <i class="fa-solid fa-arrow-left"></i> Volver a Galerías
                    </button>
                    <h2 style="margin: 0; font-family: 'Playfair Display', serif; font-size: 2.5em; color: white;">${album.titulo}</h2>
                </div>
                
                <button onclick="borrarAlbum(${album.id})" style="background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 20px;" title="Eliminar Álbum Completo">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>

            <form class="upload-form" onsubmit="subirFoto(event, ${album.id})" style="margin-bottom: 30px;">
                <label class="upload-btn" style="display: inline-block; padding: 12px 25px; background: #222; border: 1px dashed #d4af37; color: #d4af37; cursor: pointer; border-radius: 4px; transition: 0.3s;">
                    <i class="fa-solid fa-cloud-arrow-up"></i> Añadir fotos a este álbum
                    <input type="file" name="foto" accept="image/*" onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
    `;

    if (album.fotos && album.fotos.length > 0) {
        album.fotos.forEach(fotoUrl => {
            htmlContent += `
                <div style="overflow: hidden; border-radius: 8px; cursor: pointer;">
                    <img src="${fotoUrl}" 
                         style="width: 100%; height: 300px; object-fit: cover; transition: transform 0.3s ease;" 
                         onmouseover="this.style.transform='scale(1.05)'" 
                         onmouseout="this.style.transform='scale(1)'"
                         onclick="abrirVisor('${fotoUrl}')" 
                         alt="Foto Portafolio">
                </div>
            `;
        });
    } else {
        htmlContent += `<p style="color:#666;">Aún no hay fotos en este álbum.</p>`;
    }

    htmlContent += `
            </div>
        </div>
    `;

    grid.innerHTML = htmlContent;
}

function configurarFiltros() {
    const botones = document.querySelectorAll('.filter-btn');
    const tarjetas = document.querySelectorAll('.album-card');

    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');

            const filtroElegido = boton.getAttribute('data-filter');

            tarjetas.forEach(tarjeta => {
                const categoriaTarjeta = tarjeta.getAttribute('data-categoria');
                if (filtroElegido === 'all' || filtroElegido === categoriaTarjeta) {
                    tarjeta.style.display = 'block'; 
                } else {
                    tarjeta.style.display = 'none';  
                }
            });
        });
    });
}

async function subirFoto(event, albumId) {
    event.preventDefault();
    const form = event.target;
    const inputFile = form.querySelector('input[type="file"]');
    
    if (!inputFile.files[0]) return;

    const formData = new FormData();
    formData.append('foto', inputFile.files[0]);
    formData.append('album_id', albumId);

    const btn = form.querySelector('.upload-btn');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo a la nube...';

    try {
        const res = await fetch(`${API_URL}/subir-foto`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' } 
        });

        if (res.ok) {
            // Recargamos los datos invisibles...
            const respuesta = await fetch(`${API_URL}/obtener-datos`);
            albumesData = await respuesta.json();
            // ... y refrescamos solo este álbum (¡sin volver al inicio!)
            verAlbumDetalle(albumId);
        } else {
            alert("Error al subir.");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    } finally {
        if(btn) btn.innerHTML = textoOriginal;
    }
}

async function borrarAlbum(albumId) {
    const seguro = confirm("⚠️ ¿Estás seguro de que querés borrar este álbum y TODAS sus fotos?");
    if (!seguro) return; 

    try {
        const res = await fetch(`${API_URL}/borrar-album/${albumId}`, {
            method: 'DELETE',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (res.ok) {
            cargarAlbumes(); // Volvemos al inicio general
        } else {
            alert("Error al borrar (¿Iniciaste sesión?)");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
}

function abrirVisor(url) {
    const visor = document.getElementById('lightbox');
    const imgGrande = document.getElementById('img-ampliada');
    imgGrande.src = url;
    visor.style.display = "flex";
    visor.style.justifyContent = "center";
    visor.style.alignItems = "center";
}

function cerrarVisor() {
    document.getElementById('lightbox').style.display = "none";
}

function logout() {
    fetch(`${API_URL}/logout`, { method: 'POST' })
        .then(() => {
            alert("Sesión cerrada");
            window.location.reload();
        });
}