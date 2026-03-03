const API_URL = "https://portafoliodeportivo.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
    cargarAlbumes();

    // Configurar botón de logout si existe
    const btnLogout = document.getElementById('btn-logout'); 
    if(btnLogout) btnLogout.addEventListener('click', logout);
});

// 1. CARGAR ÁLBUMES Y COLLAGE
async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p style="color:white; text-align:center">Cargando portafolio...</p>';

    try {
        const respuesta = await fetch(`${API_URL}/obtener-datos`);
        const albumes = await respuesta.json();

        grid.innerHTML = ''; 
        let todasLasFotos = []; // Aquí guardaremos tus fotos para el fondo

        if (albumes.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>Aún no hay trabajos subidos.</p></div>';
            crearCollage([]); // Llamamos al collage aunque esté vacío
            return;
        }

        albumes.forEach(album => {
            const card = document.createElement('div');
            card.className = 'album-card';
            
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
                    todasLasFotos.push(fotoUrl); // Guardamos la foto para usarla en la portada
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

        // Activamos los filtros y armamos tu fondo personalizado
        configurarFiltros();
        crearCollage(todasLasFotos); 

    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
}

// --- NUEVA FUNCIÓN: EL COLLAGE DINÁMICO ---
function crearCollage(fotos) {
    const collage = document.getElementById('hero-collage');
    collage.innerHTML = ''; // Limpiamos por si acaso

    let fotosParaFondo = [...fotos]; // Copiamos tu galería

    // Si aún tienes pocas fotos, rellenamos con unas imágenes por defecto para que no quede negro
    if (fotosParaFondo.length < 10) {
        const fotosRelleno = [
            "https://images.unsplash.com/photo-1518605368461-1ee7e53f5eb5?q=80&w=500&auto=format&fit=crop", // fútbol
            "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=500&auto=format&fit=crop", // rock
            "https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=500&auto=format&fit=crop", // basket
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=500&auto=format&fit=crop", // música
            "https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=500&auto=format&fit=crop", // estadio
        ];
        // Mezclamos las tuyas con el relleno
        fotosParaFondo = [...fotosParaFondo, ...fotosRelleno, ...fotosRelleno]; 
    }

    // Agarramos las primeras 15 fotos y las pegamos en el fondo
    fotosParaFondo.slice(0, 15).forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        collage.appendChild(img);
    });
}

// --- FILTROS ---
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