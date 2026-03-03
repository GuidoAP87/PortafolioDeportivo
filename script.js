const API_URL = "https://portafoliodeportivo.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
    cargarAlbumes();
    const btnLogout = document.getElementById('btn-logout'); 
    if(btnLogout) btnLogout.addEventListener('click', logout);
});

async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p style="color:white; text-align:center">Cargando portafolio...</p>';

    try {
        const respuesta = await fetch(`${API_URL}/obtener-datos`);
        const albumes = await respuesta.json();

        grid.innerHTML = ''; 

        if (albumes.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>Aún no hay trabajos subidos.</p></div>';
            return;
        }

        albumes.forEach(album => {
            const card = document.createElement('div');
            card.className = 'album-card';
            
            const categoriaReal = album.categoria || "general";
            const categoriaLimpia = categoriaReal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            card.setAttribute('data-categoria', categoriaLimpia);
            
            // --- ACÁ AGREGAMOS EL BOTÓN DE BORRAR (Tachito Rojo) ---
            let htmlContent = `
                <div class="album-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <h3>${album.titulo}</h3>
                        <span class="badge">${categoriaReal}</span>
                    </div>
                    <button onclick="borrarAlbum(${album.id})" style="background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 14px; transition: 0.3s;" title="Eliminar Álbum">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="album-photos">
            `;

            if (album.fotos && album.fotos.length > 0) {
                album.fotos.forEach(fotoUrl => {
                    htmlContent += `
                        <img src="${fotoUrl}" 
                             class="photo-thumb" 
                             onclick="abrirVisor('${fotoUrl}')" 
                             alt="Foto">
                    `;
                });
            } else {
                htmlContent += `<p style="color:#666; font-size:0.8em">Carpeta vacía</p>`;
            }

            htmlContent += `
                </div>
                <form class="upload-form" onsubmit="subirFoto(event, ${album.id})">
                    <label class="upload-btn">
                        <i class="fa-solid fa-camera"></i> Añadir Fotos
                        <input type="file" name="foto" accept="image/*" onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                    </label>
                </form>
            `;

            card.innerHTML = htmlContent;
            grid.appendChild(card);
        });

        configurarFiltros();

    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo...';

    try {
        const res = await fetch(`${API_URL}/subir-foto`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' } 
        });

        if (res.ok) {
            cargarAlbumes();
        } else {
            alert("Error al subir.");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    } finally {
        btn.innerHTML = textoOriginal;
    }
}

// --- NUEVA FUNCIÓN: BORRAR ÁLBUM ---
async function borrarAlbum(albumId) {
    // 1. Mensaje de seguridad por si tocaste sin querer
    const seguro = confirm("⚠️ ¿Estás seguro de que querés borrar este álbum y TODAS sus fotos? Esta acción no se puede deshacer.");
    if (!seguro) return; // Si ponés cancelar, no hace nada

    try {
        // 2. Le mandamos la orden a Python (la ruta que creaste antes)
        const res = await fetch(`${API_URL}/borrar-album/${albumId}`, {
            method: 'DELETE',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (res.ok) {
            cargarAlbumes(); // 3. Recargamos la galería para que desaparezca
        } else {
            alert("Error al borrar (¿Estás seguro de que iniciaste sesión como administrador?)");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión al intentar borrar.");
    }
}

function abrirVisor(url) {
    const visor = document.getElementById('lightbox');
    const imgGrande = document.getElementById('img-ampliada');
    imgGrande.src = url;
    visor.style.display = "block";
}

function cerrarVisor() {
    document.getElementById('lightbox').style.display = "none";
}