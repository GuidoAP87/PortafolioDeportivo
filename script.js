const API_URL = "https://portafoliodeportivo.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
    cargarAlbumes();

    // Configurar botón de logout si existe
    const btnLogout = document.getElementById('btn-logout'); 
    if(btnLogout) btnLogout.addEventListener('click', logout);
});

// 1. CARGAR ÁLBUMES
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
            
            // --- TRUCO PRO: Etiquetamos la tarjeta con su categoría ---
            // Le quitamos las mayúsculas y las tildes para que coincida perfecto con el botón
            const categoriaLimpia = album.categoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            card.setAttribute('data-categoria', categoriaLimpia);
            
            let htmlContent = `
                <div class="album-header">
                    <h3>${album.titulo}</h3>
                    <span class="badge">${album.categoria}</span>
                </div>
                <div class="album-photos">
            `;

            if (album.fotos && album.fotos.length > 0) {
                album.fotos.forEach(fotoUrl => {
                    htmlContent += `
                        <img src="${fotoUrl}" 
                             class="photo-thumb" 
                             onclick="abrirVisor('${fotoUrl}')" 
                             alt="Foto de ${album.titulo}">
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

        // --- ENCENDEMOS LOS FILTROS UNA VEZ QUE CARGARON LAS FOTOS ---
        configurarFiltros();

    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
}

// --- LA MAGIA DE LOS FILTROS ---
function configurarFiltros() {
    const botones = document.querySelectorAll('.filter-btn');
    const tarjetas = document.querySelectorAll('.album-card');

    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            // 1. Efecto visual: Resaltamos el botón que acabas de tocar
            botones.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');

            // 2. Leemos qué filtro elegiste (ej: 'futbol', 'social', 'all')
            const filtroElegido = boton.getAttribute('data-filter');

            // 3. Mostramos u ocultamos cada álbum según corresponda
            tarjetas.forEach(tarjeta => {
                const categoriaTarjeta = tarjeta.getAttribute('data-categoria');
                
                if (filtroElegido === 'all' || filtroElegido === categoriaTarjeta) {
                    tarjeta.style.display = 'block'; // Lo mostramos
                } else {
                    tarjeta.style.display = 'none';  // Lo escondemos
                }
            });
        });
    });
}

// 2. SUBIR FOTO AL ÁLBUM
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
            alert("Error al subir (¿Quizás no iniciaste sesión?)");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    } finally {
        btn.innerHTML = textoOriginal;
    }
}

// 3. VISOR DE PANTALLA COMPLETA
function abrirVisor(url) {
    const visor = document.getElementById('lightbox');
    const imgGrande = document.getElementById('img-ampliada');
    
    imgGrande.src = url;
    visor.style.display = "block";
}

function cerrarVisor() {
    document.getElementById('lightbox').style.display = "none";
}