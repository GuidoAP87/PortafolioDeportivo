/* ═══════════════════════════════════════════════════════════════
   NACHO LINGUA FOTOGRAFÍA — SCRIPT PROFESIONAL 2026
   ═══════════════════════════════════════════════════════════════
   
   ACCESO ADMIN:
   ─ Hacé clic 3 veces seguidas sobre el punto "·" en el footer
   ─ O presioná Ctrl + Shift + A en cualquier momento
   ─ O ingresá directamente a /login
   ═══════════════════════════════════════════════════════════════ */

// ⚠ Cambiá por tu número de WhatsApp real (formato: 5493511234567)
const WA_NUMBER = '5493510000000';

let albumesData  = [];
let isAdmin      = false;
let lightboxFotos= [];
let lightboxIdx  = 0;
let adminClickCount = 0;
let adminClickTimer = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([verificarSesion(), cargarAlbumes()]);

    initScrollBehavior();
    initRevealAnimations();
    initNavActiveLinks();
    initStatsCounter();
    initBackToTop();
    initLightboxKeyboard();
    initAdminTriggers();

    document.getElementById('btn-add-album')   ?.addEventListener('click', crearAlbum);
    document.getElementById('btn-logout')       ?.addEventListener('click', logout);
    document.getElementById('btn-admin-panel')  ?.addEventListener('click', abrirAdminPanel);
    document.getElementById('contact-form')     ?.addEventListener('submit', enviarConsulta);

    // Cerrar modals al hacer clic en el fondo
    document.getElementById('admin-modal') ?.addEventListener('click', e => { if(e.target.id==='admin-modal') cerrarAdminPanel(); });
    document.getElementById('login-modal') ?.addEventListener('click', e => { if(e.target.id==='login-modal') cerrarLoginModal(); });

    // Actualizar link de WhatsApp flotante
    const waBtn = document.getElementById('whatsapp-btn');
    if (waBtn) waBtn.href = `https://wa.me/${WA_NUMBER}`;

    setTimeout(() => document.getElementById('loading-screen')?.classList.add('hidden'), 1300);
});

// ─── TRIGGERS DE ACCESO ADMIN ────────────────────────────────────────────────
// Tres formas de abrir el login:
// 1. Clic triple en el "·" del footer
// 2. Ctrl + Shift + A
// 3. Ruta /login (mantiene compatibilidad)
function initAdminTriggers() {
    // Clic triple en el trigger del footer
    const trigger = document.getElementById('admin-trigger');
    if (trigger) {
        trigger.addEventListener('click', () => {
            adminClickCount++;
            clearTimeout(adminClickTimer);
            if (adminClickCount >= 3) {
                adminClickCount = 0;
                if (!isAdmin) abrirLoginModal();
                else abrirAdminPanel();
            }
            adminClickTimer = setTimeout(() => { adminClickCount = 0; }, 1200);
        });
    }

    // Ctrl + Shift + A
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            if (!isAdmin) abrirLoginModal();
            else abrirAdminPanel();
        }
    });
}

// ─── MODAL DE LOGIN ───────────────────────────────────────────────────────────
function abrirLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('admin-password').value = '';
    setTimeout(() => document.getElementById('admin-password')?.focus(), 200);
}

function cerrarLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 350);
    document.body.style.overflow = '';
}

function togglePasswordVis() {
    const input = document.getElementById('admin-password');
    const icon  = document.getElementById('toggle-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
    input.focus();
}

async function ejecutarLogin() {
    const pass  = document.getElementById('admin-password')?.value;
    const btn   = document.getElementById('login-submit-btn');
    const errEl = document.getElementById('login-error');
    if (!pass) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    errEl.style.display = 'none';

    try {
        const res  = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass }),
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            isAdmin = true;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Acceso concedido';
            toggleAdminUI(true);
            setTimeout(() => {
                cerrarLoginModal();
                btn.disabled = false;
                btn.innerHTML = 'Ingresar';
                // Auto-abre el panel admin
                setTimeout(abrirAdminPanel, 400);
            }, 700);
        } else {
            errEl.style.display = 'flex';
            btn.disabled = false;
            btn.innerHTML = 'Ingresar';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            // Sacude el modal
            document.querySelector('.login-modal-box')?.classList.add('shake');
            setTimeout(() => document.querySelector('.login-modal-box')?.classList.remove('shake'), 500);
        }
    } catch {
        errEl.style.display = 'flex';
        errEl.querySelector('span') && (errEl.querySelector('span').textContent = ' Error de conexión. Verificá que el servidor esté corriendo.');
        btn.disabled = false;
        btn.innerHTML = 'Ingresar';
    }
}

// ─── SESIÓN ───────────────────────────────────────────────────────────────────
async function verificarSesion() {
    try {
        const res  = await fetch('/check-auth', { credentials: 'include' });
        const data = await res.json();
        isAdmin    = data.isAdmin;
        toggleAdminUI(isAdmin);
    } catch {
        isAdmin = false;
    }
}

function toggleAdminUI(admin) {
    ['btn-add-album','btn-logout','btn-admin-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = admin ? 'inline-flex' : 'none';
    });
}

// ─── SCROLL ───────────────────────────────────────────────────────────────────
function initScrollBehavior() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar?.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
}

function initNavActiveLinks() {
    const sections = document.querySelectorAll('section[id], header[id]');
    const links    = document.querySelectorAll('.nav-links a[href^="#"]');
    const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
            }
        });
    }, { threshold: 0.4 });
    sections.forEach(s => obs.observe(s));
}

// ─── REVEAL ANIMATIONS ────────────────────────────────────────────────────────
function initRevealAnimations() {
    const els = document.querySelectorAll('.reveal:not(.visible)');
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    els.forEach(el => obs.observe(el));
}

// ─── STATS COUNTER ────────────────────────────────────────────────────────────
function initStatsCounter() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el     = entry.target;
            const target = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            let current  = 0;
            const step   = Math.ceil(target / 55);
            const timer  = setInterval(() => {
                current += step;
                if (current >= target) { current = target; clearInterval(timer); }
                el.textContent = current.toLocaleString('es-AR') + suffix;
            }, 22);
            obs.unobserve(el);
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-target]').forEach(c => obs.observe(c));
}

// ─── BACK TO TOP ─────────────────────────────────────────────────────────────
function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 400), { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ─── ÁLBUMES ─────────────────────────────────────────────────────────────────
async function cargarAlbumes() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state"><p>Cargando portfolio...</p></div>';
    try {
        const res   = await fetch('/obtener-datos');
        albumesData = await res.json();
        renderizarCarpetas();
    } catch {
        grid.innerHTML = '<div class="empty-state"><p>No se pudo cargar la galería.</p></div>';
    }
}

function renderizarCarpetas() {
    const grid = document.getElementById('gallery-grid');
    const filtersEl = document.getElementById('category-filters');
    grid.innerHTML = '';
    if (filtersEl) filtersEl.style.display = 'flex';

    if (!albumesData.length) {
        grid.innerHTML = '<div class="empty-state"><p>Próximamente nuevos trabajos.</p></div>';
        return;
    }

    albumesData.forEach((album, i) => {
        const cat   = (album.categoria || 'general').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        const cover = album.fotos?.length ? album.fotos[0] : 'https://placehold.co/600x400/111/333?text=Sin+fotos';
        const count = album.fotos?.length ?? 0;

        const card = document.createElement('div');
        card.className = 'album-card reveal';
        card.style.transitionDelay = `${Math.min(i * 0.07, 0.5)}s`;
        card.setAttribute('data-categoria', cat);
        card.onclick = () => verAlbumDetalle(album.id);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.onkeydown = e => { if (e.key === 'Enter') verAlbumDetalle(album.id); };

        card.innerHTML = `
            <div class="album-card-cover">
                <img src="${cover}" alt="${album.titulo}" loading="lazy">
                <div class="album-card-overlay"><span>Ver galería →</span></div>
                <div class="album-badge">${album.categoria}</div>
            </div>
            <div class="album-card-info">
                <h3>${album.titulo}</h3>
                <p>${count} foto${count !== 1 ? 's' : ''}</p>
            </div>`;

        grid.appendChild(card);
    });

    initRevealAnimations();
    configurarFiltros();
}

// ─── DETALLE ÁLBUM ────────────────────────────────────────────────────────────
function verAlbumDetalle(albumId) {
    const album = albumesData.find(a => a.id === albumId);
    if (!album) return;

    const grid = document.getElementById('gallery-grid');
    document.getElementById('category-filters').style.display = 'none';

    const adminControls = isAdmin ? `
        <div style="display:flex;gap:10px;align-items:center;">
            <form class="upload-drop-zone" id="upload-form-${album.id}" onsubmit="subirFoto(event,${album.id})">
                <label style="cursor:pointer;display:flex;align-items:center;gap:10px;">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size:20px;color:var(--gold)"></i>
                    <div>
                        <span id="upload-label-${album.id}" style="font-size:13px;color:var(--gold);">Subir fotos</span>
                        <small style="display:block;font-size:11px;color:var(--text-dim);">Podés seleccionar múltiples</small>
                    </div>
                    <input type="file" name="foto" accept="image/*" multiple
                        onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>
            <button onclick="borrarAlbum(${album.id})"
                style="background:transparent;border:1px solid #333;color:#e05252;padding:8px 14px;
                       font-size:11px;cursor:pointer;letter-spacing:1px;transition:0.3s;"
                onmouseover="this.style.background='rgba(224,82,82,0.1)'"
                onmouseout="this.style.background='transparent'">
                <i class="fa-solid fa-trash"></i> Borrar álbum
            </button>
        </div>
        <div class="upload-progress" id="upload-progress-${album.id}">
            <div class="upload-progress-bar" id="upload-bar-${album.id}"></div>
        </div>` : '';

    const fotos = album.fotos || [];
    const fotosHTML = fotos.length
        ? fotos.map((url, idx) => `
            <div class="album-detail-photo" onclick="abrirVisor(${idx},[${fotos.map(f=>`'${f}'`).join(',')}])">
                <img src="${url}" alt="Foto ${idx+1}" loading="lazy">
            </div>`).join('')
        : `<p style="color:var(--text-dim);padding:40px 0;text-align:center;font-style:italic;grid-column:1/-1">
               Aún no hay fotos en este álbum.
           </p>`;

    grid.innerHTML = `
        <div style="grid-column:1/-1">
            <div class="album-detail-header">
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <button onclick="renderizarCarpetas()"
                        style="background:transparent;border:1px solid var(--gold-dim);color:var(--gold);
                               padding:9px 18px;font-size:11px;letter-spacing:2px;cursor:pointer;
                               text-transform:uppercase;transition:0.3s;font-family:inherit;"
                        onmouseover="this.style.background='rgba(198,168,124,0.08)'"
                        onmouseout="this.style.background='transparent'">
                        <i class="fa-solid fa-arrow-left"></i> Volver
                    </button>
                    <h2 style="font-family:'Playfair Display',serif;font-size:clamp(20px,3vw,32px);font-weight:400;">${album.titulo}</h2>
                    <span style="font-size:12px;color:var(--text-muted);">${fotos.length} foto${fotos.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
            ${adminControls}
            <div class="album-detail-grid">${fotosHTML}</div>
        </div>`;

    window.scrollTo({ top: document.getElementById('portfolio').offsetTop - 80, behavior: 'smooth' });
}

// ─── FILTROS ─────────────────────────────────────────────────────────────────
function configurarFiltros() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filtro = btn.dataset.filter;
            document.querySelectorAll('.album-card').forEach(card => {
                const show = filtro === 'all' || filtro === card.dataset.categoria;
                card.style.display = show ? '' : 'none';
                if (show) { card.classList.remove('visible'); setTimeout(() => card.classList.add('visible'), 20); }
            });
        };
    });
}

// ─── CREAR ÁLBUM ─────────────────────────────────────────────────────────────
async function crearAlbum() {
    const { value: vals } = await Swal.fire({
        title: 'Nuevo Álbum',
        background: '#111', color: '#f0f0f0',
        html: `
            <input id="a-titulo" class="swal2-input" placeholder="Nombre del álbum (ej: Final Talleres 2026)"
                style="background:#1a1a1a;color:#fff;border:1px solid #333;width:85%;margin-bottom:10px;">
            <select id="a-cat" style="background:#1a1a1a;color:#fff;border:1px solid #333;
                width:85%;padding:12px;margin:0 auto;display:block;border-radius:3px;font-size:14px;">
                <option value="" disabled selected>Seleccioná una categoría...</option>
                <option value="futbol">⚽ Fútbol</option>
                <option value="basquet">🏀 Básquet</option>
                <option value="social">🎉 Social</option>
                <option value="otro">📷 Otro</option>
            </select>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear álbum', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#c6a87c', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo = document.getElementById('a-titulo').value.trim();
            const cat    = document.getElementById('a-cat').value;
            if (!titulo || !cat) { Swal.showValidationMessage('Completá ambos campos'); return false; }
            return { titulo, categoria: cat };
        }
    });

    if (!vals) return;
    const res = await fetch('/crear-album', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarAlbumes();
        Swal.fire({ icon:'success', title:'¡Álbum creado!', timer:1800,
            showConfirmButton:false, background:'#111', color:'#fff' });
    } else {
        Swal.fire({ icon:'error', title:'Error', text:'No se pudo crear. ¿Estás logueado?',
            background:'#111', color:'#fff', confirmButtonColor:'#c6a87c' });
    }
}

// ─── COMPRIMIR + MARCA DE AGUA (CLIENTE) ─────────────────────────────────────
function comprimirImagen(file, maxWidth = 1920, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // Marca de agua en mosaico diagonal
                const pCanvas = document.createElement('canvas');
                const pCtx    = pCanvas.getContext('2d');
                const fs      = Math.floor(w / 20);
                pCtx.font     = `bold ${fs}px Arial`;
                const texto   = 'NACHO LINGUA FOTOGRAFÍA ';
                const tw      = pCtx.measureText(texto).width;
                pCanvas.width = tw + fs*2; pCanvas.height = fs*5;
                pCtx.font     = `bold ${fs}px Arial`;
                pCtx.textAlign = 'center'; pCtx.textBaseline = 'middle';
                pCtx.fillStyle = 'rgba(255,255,255,0.85)';
                pCtx.shadowColor = 'rgba(0,0,0,0.9)'; pCtx.shadowBlur = 4;
                pCtx.fillText(texto, pCanvas.width/2, pCanvas.height/2);

                ctx.save();
                ctx.translate(w/2, h/2); ctx.rotate(-Math.PI/8); ctx.translate(-w, -h);
                ctx.fillStyle = ctx.createPattern(pCanvas, 'repeat');
                ctx.fillRect(0, 0, w*2, h*2);
                ctx.restore();

                canvas.toBlob(blob => resolve(new File([blob], file.name, { type:'image/jpeg', lastModified:Date.now() })), 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
    });
}

// ─── SUBIR FOTOS ─────────────────────────────────────────────────────────────
async function subirFoto(event, albumId) {
    event.preventDefault();
    const input = event.target.querySelector('input[type="file"]');
    if (!input?.files.length) return;

    const files  = Array.from(input.files);
    const progWrap = document.getElementById(`upload-progress-${albumId}`);
    const progBar  = document.getElementById(`upload-bar-${albumId}`);
    const label    = document.getElementById(`upload-label-${albumId}`);

    if (progWrap) progWrap.style.display = 'block';
    let exitosas = 0;

    for (let i = 0; i < files.length; i++) {
        if (label) label.textContent = `Optimizando ${i+1}/${files.length}...`;
        try {
            const compressed = await comprimirImagen(files[i]);
            if (label) label.textContent = `Subiendo ${i+1}/${files.length}...`;
            if (progBar) progBar.style.width = `${((i+0.5)/files.length)*100}%`;

            const fd = new FormData();
            fd.append('foto', compressed);
            fd.append('album_id', albumId);
            const res = await fetch('/subir-foto', { method:'POST', body:fd, credentials:'include' });
            if (res.ok) exitosas++;
            if (progBar) progBar.style.width = `${((i+1)/files.length)*100}%`;
        } catch (err) { console.error(err); }
    }

    setTimeout(() => { if (progWrap) progWrap.style.display = 'none'; if (progBar) progBar.style.width = '0'; }, 800);
    event.target.reset();
    if (label) label.textContent = 'Subir fotos';

    if (exitosas > 0) {
        const res   = await fetch('/obtener-datos');
        albumesData = await res.json();
        verAlbumDetalle(albumId);
        Swal.fire({
            icon:'success',
            title: exitosas === files.length ? `¡${exitosas} foto${exitosas>1?'s':''} subida${exitosas>1?'s':''}!` : `${exitosas} de ${files.length} subidas`,
            timer:2500, showConfirmButton:false, background:'#111', color:'#fff'
        });
    } else {
        Swal.fire({ icon:'error', title:'Error al subir', text:'Verificá la conexión e intentá de nuevo.',
            background:'#111', color:'#fff', confirmButtonColor:'#c6a87c' });
    }
}

// ─── BORRAR ÁLBUM ─────────────────────────────────────────────────────────────
async function borrarAlbum(albumId) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Borrar álbum?',
        html: '<p style="color:#999;font-size:14px;">Esta acción eliminará el álbum y <strong style="color:#e05252">todas sus fotos</strong> permanentemente.</p>',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Sí, borrar todo', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e05252', cancelButtonColor: '#555',
        background: '#111', color: '#fff'
    });
    if (!isConfirmed) return;

    const res = await fetch(`/borrar-album/${albumId}`, { method:'DELETE', credentials:'include' });
    if (res.ok) {
        Swal.fire({ icon:'success', title:'Álbum eliminado', timer:1500, showConfirmButton:false, background:'#111', color:'#fff' });
        cargarAlbumes();
    } else {
        Swal.fire({ icon:'error', title:'Error al borrar', background:'#111', color:'#fff' });
    }
}

// ─── LIGHTBOX ────────────────────────────────────────────────────────────────
function abrirVisor(idx, fotos) {
    lightboxFotos = Array.isArray(fotos) ? fotos : [fotos];
    lightboxIdx   = typeof idx === 'number' ? idx : 0;
    mostrarFotoActual();
    const lb = document.getElementById('lightbox');
    lb.style.display = 'flex';
    requestAnimationFrame(() => lb.classList.add('open'));
    document.body.style.overflow = 'hidden';
}

function mostrarFotoActual() {
    document.getElementById('img-ampliada').src = lightboxFotos[lightboxIdx];
    const counter = document.getElementById('lightbox-counter');
    if (counter) counter.textContent = lightboxFotos.length > 1 ? `${lightboxIdx+1} / ${lightboxFotos.length}` : '';
    const showNav = lightboxFotos.length > 1;
    document.getElementById('lb-prev').style.opacity = showNav ? '1' : '0';
    document.getElementById('lb-next').style.opacity = showNav ? '1' : '0';
}

function cerrarVisor() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open');
    setTimeout(() => { lb.style.display = 'none'; }, 300);
    document.body.style.overflow = '';
}

function lightboxPrev() { lightboxIdx = (lightboxIdx-1+lightboxFotos.length) % lightboxFotos.length; mostrarFotoActual(); }
function lightboxNext() { lightboxIdx = (lightboxIdx+1) % lightboxFotos.length; mostrarFotoActual(); }

function initLightboxKeyboard() {
    document.addEventListener('keydown', e => {
        if (!document.getElementById('lightbox').classList.contains('open')) return;
        if (e.key === 'Escape')     cerrarVisor();
        if (e.key === 'ArrowLeft')  lightboxPrev();
        if (e.key === 'ArrowRight') lightboxNext();
    });
}

// ─── PAQUETES / MERCADOPAGO ───────────────────────────────────────────────────
async function contratarPaquete(paqueteId, nombrePaquete) {
    const { value: email } = await Swal.fire({
        title: nombrePaquete,
        html: `<p style="color:#999;margin-bottom:16px;font-size:13px;">
                  Ingresá tu email para coordinar la sesión y recibir la confirmación de pago.
               </p>`,
        input: 'email', inputPlaceholder: 'tu@email.com',
        inputAttributes: { autocomplete: 'email' },
        background: '#111', color: '#fff',
        confirmButtonText: 'Ir al pago →', cancelButtonText: 'Cancelar',
        showCancelButton: true,
        confirmButtonColor: '#c6a87c', cancelButtonColor: '#555',
        inputValidator: v => (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? 'Ingresá un email válido' : null
    });
    if (!email) return;

    Swal.fire({ title:'Preparando pago...', background:'#111', color:'#fff', allowOutsideClick:false,
        didOpen: () => Swal.showLoading() });

    try {
        const res  = await fetch('/crear-preferencia', {
            method:'POST', credentials:'include',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ paquete: paqueteId, email })
        });
        const data = await res.json();
        if (res.ok && data.init_point) {
            Swal.close();
            window.location.href = data.init_point;
        } else { throw new Error(data.error || 'Sin init_point'); }
    } catch {
        const msg = encodeURIComponent(`Hola Nacho! Quiero contratar el *${nombrePaquete}*.\nMi email: ${email}\n¿Me podés ayudar con el pago?`);
        Swal.fire({
            icon:'info', title:'Contactar por WhatsApp',
            html:`<p style="color:#999;font-size:14px;">El sistema de pago online está siendo configurado. Podés coordinar directamente con Nacho por WhatsApp.</p>`,
            background:'#111', color:'#fff',
            confirmButtonText:'<i class="fa-brands fa-whatsapp"></i>&nbsp; Ir a WhatsApp',
            cancelButtonText:'Cerrar', showCancelButton:true,
            confirmButtonColor:'#25D366', cancelButtonColor:'#555'
        }).then(r => { if (r.isConfirmed) window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank'); });
    }
}

// ─── FORMULARIO CONTACTO ─────────────────────────────────────────────────────
async function enviarConsulta(event) {
    event.preventDefault();
    const form = event.target;
    const btn  = form.querySelector('.form-submit-btn');
    const data = {
        nombre:       form.nombre?.value.trim(),
        email:        form.email?.value.trim(),
        telefono:     form.telefono?.value.trim(),
        tipo_evento:  form.tipo_evento?.value,
        fecha_evento: form.fecha_evento?.value,
        mensaje:      form.mensaje?.value.trim()
    };
    if (!data.nombre || !data.email) {
        Swal.fire({ icon:'warning', title:'Campos requeridos', text:'Por favor completá nombre y email.',
            background:'#111', color:'#fff', confirmButtonColor:'#c6a87c' });
        return;
    }
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
        const res = await fetch('/contacto', {
            method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(data)
        });
        if (res.ok) {
            form.reset();
            Swal.fire({ icon:'success', title:'¡Mensaje enviado!',
                text:'Nacho te va a responder a la brevedad.', background:'#111', color:'#fff',
                confirmButtonColor:'#c6a87c', timer:3500, showConfirmButton:false });
        } else { throw new Error(); }
    } catch {
        Swal.fire({ icon:'error', title:'Error al enviar',
            html:`<p style="font-size:14px;color:#999;">No se pudo enviar. <a href="https://wa.me/${WA_NUMBER}" target="_blank" style="color:var(--gold)">Escribinos por WhatsApp</a></p>`,
            background:'#111', color:'#fff', confirmButtonColor:'#c6a87c' });
    } finally {
        btn.disabled = false; btn.textContent = 'Enviar consulta';
    }
}

// ─── PANEL ADMIN ─────────────────────────────────────────────────────────────
async function abrirAdminPanel() {
    const modal = document.getElementById('admin-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';
    await Promise.all([cargarConsultas(), cargarPagos()]);
}

function cerrarAdminPanel() {
    const modal = document.getElementById('admin-modal');
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 350);
    document.body.style.overflow = '';
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
}

async function cargarConsultas() {
    const container = document.getElementById('tab-consultas');
    if (!container) return;
    container.innerHTML = '<p class="admin-loading">Cargando consultas...</p>';
    try {
        const res   = await fetch('/admin/consultas', { credentials:'include' });
        const lista = await res.json();
        const nuevas = lista.filter(c => !c.leida).length;
        const badge  = document.getElementById('badge-consultas');
        if (badge) { badge.textContent = nuevas; badge.style.display = nuevas > 0 ? 'inline-flex' : 'none'; }

        container.innerHTML = lista.length ? lista.map(c => `
            <div class="admin-item" id="consulta-${c.id}">
                <div class="item-header">
                    <div>
                        <strong>${c.nombre}</strong>
                        ${!c.leida ? '<span class="item-badge badge-no-leida">Nueva</span>' : ''}
                        <br><span style="font-size:12px;color:#888">${c.email}${c.telefono ? ` · ${c.telefono}` : ''}</span>
                    </div>
                    <span class="item-date">${c.fecha}</span>
                </div>
                <div class="item-body">
                    ${c.tipo_evento ? `<em style="color:var(--gold);font-size:12px;">${c.tipo_evento}${c.fecha_evento ? ` · ${c.fecha_evento}` : ''}</em><br><br>` : ''}
                    ${c.mensaje || '<em style="color:#555">Sin mensaje</em>'}
                </div>
                ${!c.leida ? `<div style="margin-top:10px;text-align:right;">
                    <button class="mark-read-btn" onclick="marcarLeida(${c.id})">
                        <i class="fa-solid fa-check"></i> Marcar como leída
                    </button></div>` : ''}
            </div>`).join('')
            : '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Sin consultas aún.</p>';
    } catch {
        container.innerHTML = '<p style="color:var(--red);">Error al cargar consultas.</p>';
    }
}

async function marcarLeida(id) {
    await fetch(`/admin/consultas/${id}/leer`, { method:'PATCH', credentials:'include' });
    document.getElementById(`consulta-${id}`)?.querySelector('.item-badge')?.remove();
    document.getElementById(`consulta-${id}`)?.querySelector('div[style*="text-align:right"]')?.remove();
    const badge = document.getElementById('badge-consultas');
    if (badge) {
        const n = parseInt(badge.textContent) - 1;
        badge.textContent = n; badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
}

async function cargarPagos() {
    const container = document.getElementById('tab-pagos');
    if (!container) return;
    container.innerHTML = '<p class="admin-loading">Cargando pagos...</p>';
    try {
        const res   = await fetch('/admin/pagos', { credentials:'include' });
        const lista = await res.json();
        container.innerHTML = lista.length ? lista.map(p => {
            const cls = p.estado==='approved' ? 'badge-approved' : p.estado==='rejected' ? 'badge-rejected' : 'badge-pendiente';
            return `<div class="admin-item">
                <div class="item-header">
                    <strong>${p.paquete} <span class="item-badge ${cls}">${p.estado}</span></strong>
                    <span class="item-date">${p.fecha}</span>
                </div>
                <div class="item-body">${p.email} &nbsp;·&nbsp; <strong style="color:var(--gold)">$${Number(p.monto).toLocaleString('es-AR')}</strong> ARS</div>
            </div>`;
        }).join('')
        : '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Sin pagos registrados.</p>';
    } catch {
        container.innerHTML = '<p style="color:var(--red);">Error al cargar pagos.</p>';
    }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
    await fetch('/logout', { method:'POST', credentials:'include' });
    isAdmin = false;
    toggleAdminUI(false);
    cerrarAdminPanel();
    Swal.fire({ icon:'success', title:'Sesión cerrada', timer:1500, showConfirmButton:false, background:'#111', color:'#fff' });
}