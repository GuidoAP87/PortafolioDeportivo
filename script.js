const API_URL = "https://portafoliodeportivo.onrender.com"; 
let albumesData = []; 
let isAdmin = false; // NUEVA VARIABLE: Guarda el estado de tu sesión

document.addEventListener('DOMContentLoaded', async () => {
    await verificarSesion(); // 1. Primero averiguamos si sos el dueño
    cargarAlbumes();         // 2. Luego cargamos las galerías
    
    const btnLogout = document.getElementById('btn-logout'); 
    if(btnLogout) btnLogout.addEventListener('click', logout);

    const btnAddAlbum = document.getElementById('btn-add-album');
    if(btnAddAlbum) btnAddAlbum.addEventListener('click', crearAlbum);
});

// --- NUEVO MOTOR DE SEGURIDAD VISUAL ---
async function verificarSesion() {
    try {
        const res = await fetch(`${API_URL}/check-auth`);
        const data = await res.json();
        isAdmin = data.isAdmin;

        // Si es administrador (o sea, vos), encendemos el botón del menú
        const btnAddAlbum = document.getElementById('btn-add-album');
        if (isAdmin && btnAddAlbum) {
            btnAddAlbum.style.display = 'inline-block';
        }
    } catch (e) {
        console.error("Error verificando sesión", e);
        isAdmin = false;
    }
}

// --- NUEVO SISTEMA PARA CREAR ÁLBUMES (MODAL PROFESIONAL SWEETALERT2) ---
async function crearAlbum() {
    const { value: formValues } = await Swal.fire({
        title: 'Crear Nuevo Álbum',
        background: '#111', // Fondo oscuro para que combine
        color: '#fff',      // Texto blanco
        html: `
            <input id="album-titulo" class="swal2-input" placeholder="Título (Ej: Final Talleres vs Belgrano)" style="background: #222; color: white; border: 1px solid #333; margin-bottom: 15px; width: 80%;">
            <select id="album-categoria" class="swal2-select" style="background: #222; color: white; border: 1px solid #333; width: 80%; padding: 15px; font-size: 1em; margin: 0 auto; display: block; border-radius: 4px;">
                <option value="" disabled selected>Selecciona una categoría...</option>
                <option value="futbol">Fútbol</option>
                <option value="basquet">Básquet</option>
                <option value="social">Social</option>
            </select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Crear Álbum',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d4af37', // Tu color dorado
        cancelButtonColor: '#ff4444',
        preConfirm: () => {
            const titulo = document.getElementById('album-titulo').value.trim();
            const categoria = document.getElementById('album-categoria').value;
            if (!titulo || !categoria) {
                Swal.showValidationMessage('Por favor completa ambos campos');
                return false;
            }
            return { titulo: titulo, categoria: categoria };
        }
    });

    if (formValues) {
        try {
            const res = await fetch(`${API_URL}/crear-album`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ titulo: formValues.titulo, categoria: formValues.categoria })
            });

            if (res.ok) {
                cargarAlbumes();
                // Cartelito de éxito lindo
                Swal.fire({
                    title: '¡Listo!',
                    text: 'Álbum creado exitosamente',
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#d4af37',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    title: 'Error',
                    text: 'Acceso denegado. ¿Iniciaste sesión?',
                    icon: 'error',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#d4af37'
                });
            }
        } catch (e) {
            console.error(e);
            Swal.fire({
                title: 'Error de conexión',
                text: 'No se pudo contactar al servidor',
                icon: 'error',
                background: '#111',
                color: '#fff',
                confirmButtonColor: '#d4af37'
            });
        }
    }
}

async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<p style="color:white; text-align:center">Cargando portafolio...</p>';

    try {
        const respuesta = await fetch(`${API_URL}/obtener-datos`);
        albumesData = await respuesta.json(); 
        renderizarCarpetas(); 
    } catch (error) {
        console.error("Error:", error);
        grid.innerHTML = '<p style="color:red; text-align:center">Error al cargar la galería.</p>';
    }
}

function renderizarCarpetas() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = ''; 

    document.getElementById('category-filters').style.display = 'flex';

    if (albumesData.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>Aún no hay trabajos subidos.</p></div>';
        return;
    }

    albumesData.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card';
        card.style.cursor = 'pointer'; 
        card.onclick = () => verAlbumDetalle(album.id); 
        
        const categoriaReal = album.categoria || "general";
        const categoriaLimpia = categoriaReal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        card.setAttribute('data-categoria', categoriaLimpia);
        
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

function verAlbumDetalle(albumId) {
    const album = albumesData.find(a => a.id === albumId);
    if(!album) return;

    const grid = document.getElementById('gallery-grid');
    document.getElementById('category-filters').style.display = 'none';

    // Ocultamos los botones sensibles a los usuarios normales
    let botonesAdminHeader = '';
    let botonSubirFotos = '';

    if (isAdmin) {
        botonesAdminHeader = `
            <button onclick="borrarAlbum(${album.id})" style="background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 20px;" title="Eliminar Álbum Completo">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        
        botonSubirFotos = `
            <form class="upload-form" onsubmit="subirFoto(event, ${album.id})" style="margin-bottom: 30px;">
                <label class="upload-btn" style="display: inline-block; padding: 12px 25px; background: #222; border: 1px dashed #d4af37; color: #d4af37; cursor: pointer; border-radius: 4px; transition: 0.3s;">
                    <i class="fa-solid fa-bolt"></i> Añadir fotos (Subida Rápida)
                    <input type="file" name="foto" accept="image/*" multiple onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>
        `;
    }

    let htmlContent = `
        <div style="grid-column: 1 / -1; margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <button onclick="renderizarCarpetas()" style="background: transparent; color: #d4af37; border: 1px solid #d4af37; padding: 10px 20px; border-radius: 4px; cursor: pointer; transition: 0.3s;">
                        <i class="fa-solid fa-arrow-left"></i> Volver a Galerías
                    </button>
                    <h2 style="margin: 0; font-family: 'Playfair Display', serif; font-size: 2.5em; color: white;">${album.titulo}</h2>
                </div>
                
                ${botonesAdminHeader}
            </div>

            ${botonSubirFotos}

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

// --- NUEVO MOTOR DE COMPRESIÓN CON MARCA DE AGUA ---
function comprimirImagen(file, maxWidth = 1920, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // 1. Dibujamos la foto original
                ctx.drawImage(img, 0, 0, width, height);

                // --- 2. INICIO MARCA DE AGUA PROFESIONAL ---
                ctx.save();
                // Movemos el "pincel" al centro exacto de la foto
                ctx.translate(width / 2, height / 2);
                // Inclinamos el texto en diagonal (-30 grados)
                ctx.rotate(-Math.PI / 6); 

                // Tamaño dinámico: el texto crece si la foto es más grande
                const fontSize = Math.floor(width / 12);
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Color blanco con 40% de opacidad (semi-transparente)
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";

                // Sombra negra (el truco para que se lea en fondos blancos)
                ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 3;

                // Escribimos el nombre principal
                ctx.fillText("NACHO LINGUA", 0, 0);

                // (Opcional) Escribimos "FOTOGRAFÍA" más chiquito abajo
                ctx.font = `bold ${fontSize / 2.5}px Arial`;
                ctx.fillText("FOTOGRAFÍA", 0, fontSize);

                ctx.restore();
                // --- FIN MARCA DE AGUA ---

                // 3. Convertimos el resultado a JPG liviano
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(newFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
    });
}

async function subirFoto(event, albumId) {
    event.preventDefault();
    const form = event.target;
    const inputFile = form.querySelector('input[type="file"]');
    
    const cantidadFotos = inputFile.files.length;
    if (cantidadFotos === 0) return;

    const btn = form.querySelector('.upload-btn');
    const textoOriginal = btn.innerHTML;
    
    let subidasExitosas = 0;

    try {
        for (let i = 0; i < cantidadFotos; i++) {
            btn.innerHTML = `<i class="fa-solid fa-compress"></i> Optimizando foto ${i + 1}...`;
            const archivoComprimido = await comprimirImagen(inputFile.files[i]);

            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Subiendo foto ${i + 1} de ${cantidadFotos}...`;
            
            const formData = new FormData();
            formData.append('foto', archivoComprimido); 
            formData.append('album_id', albumId);

            const res = await fetch(`${API_URL}/subir-foto`, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' } 
            });

            if (res.ok) {
                subidasExitosas++;
            } else {
                console.error("Error subiendo una de las fotos");
            }
        }

        if (subidasExitosas > 0) {
            const respuesta = await fetch(`${API_URL}/obtener-datos`);
            albumesData = await respuesta.json();
            verAlbumDetalle(albumId);
        } else {
            alert("Error al subir las fotos.");
        }

    } catch (e) {
        console.error(e);
        alert("Error de conexión durante la subida.");
    } finally {
        if(btn) btn.innerHTML = textoOriginal;
        form.reset(); 
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
            cargarAlbumes(); 
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