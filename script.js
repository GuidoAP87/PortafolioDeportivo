const API_URL = "https://portafoliodeportivo.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
    cargarAlbumes();

    // Configurar botón de logout si existe
    const btnLogout = document.getElementById('btn-logout'); // Si agregas uno en el futuro
    if(btnLogout) btnLogout.addEventListener('click', logout);
});

// 1. CARGAR ÁLBUMES DE LA BASE DE DATOS
async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p style="color:white; text-align:center">Cargando portafolio...</p>';

    try {
        const respuesta = await fetch(`${API_URL}/obtener-datos`);
        const albumes = await respuesta.json();

        grid.innerHTML = ''; // Limpiar mensaje de carga

        if (albumes.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>Aún no hay trabajos subidos.</p></div>';
            return;
        }

        albumes.forEach(album => {
            const card = document.createElement('div');
            card.className = 'album-card';
            
            // Título y Categoría
            let htmlContent = `
                <div class="album-header">
                    <h3>${album.titulo}</h3>
                    <span class="badge">${album.categoria}</span>
                </div>
                <div class="album-photos">
            `;

            // Las Fotos (Miniaturas clickeables)
            if (album.fotos && album.fotos.length > 0) {
                album.fotos.forEach(fotoUrl => {
                    // Aquí usamos la URL de Cloudinary que YA tiene marca de agua
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

            // Botón de subir fotos (Solo visible si estás logueado - lógica simple)
            // Para simplificar, lo dejamos visible pero protegido por backend
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

    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
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

    // Feedback visual de "Subiendo..."
    const btn = form.querySelector('.upload-btn');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo...';

    try {
        const res = await fetch(`${API_URL}/subir-foto`, {
            method: 'POST',
            body: formData,
            // Importante: Incluir credenciales para que sepa que eres Admin
            headers: { 'X-Requested-With': 'XMLHttpRequest' } 
        });

        if (res.ok) {
            // Recargar para ver la foto nueva
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

// 3. VISOR DE PANTALLA COMPLETA (LIGHTBOX)
function abrirVisor(url) {
    const visor = document.getElementById('lightbox');
    const imgGrande = document.getElementById('img-ampliada');
    
    imgGrande.src = url;
    visor.style.display = "block";
}

function cerrarVisor() {
    document.getElementById('lightbox').style.display = "none";
}