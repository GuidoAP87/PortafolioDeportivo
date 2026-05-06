/* ═══════════════════════════════════════════════════════════════
   NACHO LINGUA FOTOGRAFÍA — SPORTS PHOTO MARKETPLACE 2026
   ═══════════════════════════════════════════════════════════════
   ACCESO ADMIN:
   • Clic 3 veces en el "·" del footer
   • O Ctrl + Shift + A
   ═══════════════════════════════════════════════════════════════ */

// ⚠ CONFIGURACIÓN — cambiar antes de publicar
const WA_NUMBER   = '5493510000000';   // Tu número real de WhatsApp
const PRECIO_BASE = 3500;              // Precio base por foto en ARS

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let eventosData     = [];
let eventoActual    = null;
let carrito         = new Map();   // fotoId → { foto, evento }
let isAdmin         = false;
let lbFotos         = [];
let lbIdx           = 0;
let personasData    = [];
let personaFiltrada = null;
let adminClicks     = 0;
let adminClickTimer = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([verificarSesion(), cargarEventos()]);

    initNavScroll();
    initReveal();
    initNavLinks();
    initStatsCounter();
    initBackToTop();
    initLightboxKB();
    initAdminTriggers();

    // Botones nav
    document.getElementById('btn-admin-panel')?.addEventListener('click', abrirAdminPanel);
    document.getElementById('btn-add-evento')?.addEventListener('click', crearEvento);
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Cerrar modals al clic en el fondo oscuro
    ['checkout-modal','admin-modal','login-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'checkout-modal') cerrarCheckout();
                if (id === 'admin-modal')    cerrarAdminPanel();
                if (id === 'login-modal')    cerrarLoginModal();
            }
        });
    });

    // WhatsApp flotante
    const wa = document.getElementById('whatsapp-btn');
    if (wa) wa.href = `https://wa.me/${WA_NUMBER}`;

    setTimeout(() => document.getElementById('loading-screen')?.classList.add('hidden'), 1300);
});

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const el    = document.createElement('div');
    el.className   = `toast ${type}`;
    el.innerHTML   = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// ─── ADMIN TRIGGERS ───────────────────────────────────────────────────────────
function initAdminTriggers() {
    document.getElementById('admin-trigger')?.addEventListener('click', () => {
        adminClicks++;
        clearTimeout(adminClickTimer);
        if (adminClicks >= 3) { adminClicks = 0; isAdmin ? abrirAdminPanel() : abrirLoginModal(); }
        adminClickTimer = setTimeout(() => { adminClicks = 0; }, 1400);
    });
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); isAdmin ? abrirAdminPanel() : abrirLoginModal(); }
    });
}

// ─── SESIÓN ───────────────────────────────────────────────────────────────────
async function verificarSesion() {
    try {
        const d = await (await fetch('/check-auth', { credentials: 'include' })).json();
        isAdmin = d.isAdmin;
        toggleAdminUI(isAdmin);
    } catch { isAdmin = false; }
}

function toggleAdminUI(admin) {
    ['btn-admin-panel','btn-add-evento','btn-logout'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = admin ? 'flex' : 'none';
    });
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function initNavScroll() {
    window.addEventListener('scroll', () => {
        document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 80);
    }, { passive: true });
}

function initNavLinks() {
    ['hero','portfolio','about'].forEach(id => {
        const el    = document.getElementById(id);
        const links = document.querySelectorAll('.nav-link[href^="#"]');
        if (!el) return;
        new IntersectionObserver(entries => {
            if (entries[0].isIntersecting)
                links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
        }, { threshold: 0.35 }).observe(el);
    });
}

// ─── REVEAL ───────────────────────────────────────────────────────────────────
function initReveal() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ─── STATS COUNTER ────────────────────────────────────────────────────────────
function initStatsCounter() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const el = e.target;
            el.closest('.stat-item')?.classList.add('visible');
            const target = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            let cur = 0;
            const step  = Math.ceil(target / 55);
            const timer = setInterval(() => {
                cur += step; if (cur >= target) { cur = target; clearInterval(timer); }
                el.textContent = cur.toLocaleString('es-AR') + suffix;
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
    window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 500), { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ─── EVENTOS ─────────────────────────────────────────────────────────────────
async function cargarEventos() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    try {
        const r     = await fetch('/obtener-eventos');
        eventosData = await r.json();
        renderEventos();
    } catch {
        grid.innerHTML = '<div class="empty-state"><p>No se pudo cargar la galería. Recargá la página.</p></div>';
    }
}

function renderEventos(filtro = 'all') {
    const grid = document.getElementById('gallery-grid');
    const data = filtro === 'all'
        ? eventosData
        : eventosData.filter(e =>
            e.deporte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') === filtro);

    if (!data.length) {
        grid.innerHTML = '<div class="empty-state"><p>No hay eventos en esta categoría aún.</p></div>';
        return;
    }

    grid.innerHTML = data.map((ev, i) => {
        const cover = ev.fotos?.[0]?.url_preview || 'https://placehold.co/800x600/0c0c12/1c1c24?text=Sin+fotos';
        const count = ev.fotos?.length ?? 0;
        return `
        <div class="event-card reveal" style="transition-delay:${Math.min(i*0.07,0.5)}s"
             onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
            <img class="event-card-img" src="${cover}" alt="${ev.titulo}" loading="lazy">
            <div class="event-card-overlay">
                <div class="event-card-sport">${ev.deporte}</div>
                <div class="event-card-title">${ev.titulo}</div>
                <div class="event-card-meta">
                    ${ev.fecha ? `<span><i class="fa-regular fa-calendar" style="margin-right:5px"></i>${ev.fecha}</span>` : ''}
                    <span class="event-card-count">${count} foto${count!==1?'s':''}</span>
                </div>
            </div>
            <div class="event-card-enter"><div class="event-card-enter-btn">Explorar galería →</div></div>
        </div>`;
    }).join('');

    initReveal();
    configurarFiltros();
}

function configurarFiltros() {
    document.querySelectorAll('.sport-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderEventos(btn.dataset.filter);
        };
    });
}

// ─── ABRIR EVENTO ─────────────────────────────────────────────────────────────
function abrirEvento(eventoId) {
    const ev = eventosData.find(e => e.id === eventoId);
    if (!ev) return;
    eventoActual    = ev;
    lbFotos         = ev.fotos || [];
    personaFiltrada = null;
    personasData    = [];

    // Ocultar secciones
    document.getElementById('portfolio').style.display = 'none';
    document.getElementById('about').style.display     = 'none';

    const view = document.getElementById('event-view');
    view.style.display = 'block';
    view.innerHTML     = renderVistaEvento(ev);

    // Drag & drop
    initDragDrop(ev.id);

    // Cargar personas IA (async)
    if (ev.fotos?.length > 0) cargarPersonas(ev.id);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    actualizarCarritoBar();
}

function renderVistaEvento(ev) {
    const fotos = ev.fotos || [];

    const adminBar = isAdmin ? `
        <div class="admin-upload-bar">
            <form class="upload-zone" id="upload-form-${ev.id}" onsubmit="subirFotos(event,${ev.id})">
                <label style="cursor:pointer;display:flex;align-items:center;gap:14px;width:100%">
                    <span class="upload-zone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>
                    <span>
                        <div class="upload-zone-text" id="upload-label-${ev.id}">Subir fotos al evento</div>
                        <div class="upload-zone-sub">Podés arrastrar archivos aquí · Se suben con marca de agua automáticamente</div>
                    </span>
                    <input type="file" id="file-input-${ev.id}" name="foto" accept="image/*" multiple
                        onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>
            <button onclick="editarEvento(${ev.id})"
                style="height:68px;padding:0 16px;border:1px solid var(--ink-5);color:var(--text-dim);
                       font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;
                       transition:0.3s;background:none;font-family:Inter,sans-serif;
                       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;"
                onmouseover="this.style.color='var(--gold)';this.style.borderColor='var(--gold-dim)'"
                onmouseout="this.style.color='var(--text-dim)';this.style.borderColor='var(--ink-5)'">
                <i class="fa-solid fa-pen-to-square"></i>
                <span>Editar</span>
            </button>
            <button onclick="borrarEvento(${ev.id})"
                style="height:68px;padding:0 16px;border:1px solid rgba(232,64,64,0.3);color:var(--red);
                       font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;
                       transition:0.3s;background:none;font-family:Inter,sans-serif;
                       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;"
                onmouseover="this.style.background='rgba(232,64,64,0.07)'"
                onmouseout="this.style.background='none'">
                <i class="fa-solid fa-trash"></i>
                <span>Borrar</span>
            </button>
        </div>
        <div class="upload-progress-wrap" id="uprogress-${ev.id}">
            <div class="upload-progress-bar" id="upbar-${ev.id}"></div>
        </div>
        <div class="upload-progress-text" id="uptext-${ev.id}"></div>` : '';

    const fotosHTML = fotos.length
        ? fotos.map((f, idx) => {
            const sel = carrito.has(f.id);
            return `
            <div class="photo-item${sel?' selected':''}" id="photo-${f.id}"
                 onclick="toggleFoto(${f.id})"
                 ondblclick="event.stopPropagation();abrirLightbox(${idx})"
                 title="Clic para seleccionar · Doble clic para ampliar">
                <img src="${f.url_preview}" alt="Foto deportiva" loading="lazy">
                <div class="photo-item-overlay">
                    <div class="photo-select-icon">
                        <i class="fa-solid ${sel?'fa-check':'fa-cart-shopping'}"></i>
                    </div>
                    <div class="photo-price">$${Number(f.precio).toLocaleString('es-AR')} ARS</div>
                </div>
                <div class="photo-check-badge"><i class="fa-solid fa-check"></i></div>
                ${isAdmin ? `
                <button onclick="event.stopPropagation();borrarFoto(${f.id})"
                    title="Eliminar foto"
                    style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);
                           border:none;color:var(--red);width:28px;height:28px;border-radius:50%;
                           font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-xmark"></i>
                </button>` : ''}
            </div>`;
          }).join('')
        : `<div class="empty-state" style="grid-column:1/-1">
               <i class="fa-solid fa-camera-slash" style="font-size:28px;margin-bottom:12px;color:var(--text-dim)"></i>
               <p>Aún no hay fotos en este evento.</p>
           </div>`;

    return `
        <div class="event-view-header">
            <div class="event-view-nav">
                <button class="back-btn" onclick="cerrarEvento()">
                    <i class="fa-solid fa-arrow-left-long"></i> Todas las galerías
                </button>
                <span class="event-view-sport-tag">${ev.deporte}</span>
                <div>
                    <div class="event-view-title">${ev.titulo}</div>
                    ${ev.fecha ? `<div class="event-view-date">
                        <i class="fa-regular fa-calendar" style="color:var(--gold);margin-right:6px"></i>${ev.fecha}
                    </div>` : ''}
                </div>
                <div class="price-info">
                    <div class="price-badge">$${PRECIO_BASE.toLocaleString('es-AR')} <span>ARS / foto</span></div>
                </div>
            </div>
            <div class="selection-info">
                <i class="fa-solid fa-circle-info"></i>
                <span>
                    <strong>Clic</strong> para seleccionar ·
                    <strong>Doble clic</strong> para ampliar ·
                    <strong>Esc</strong> para cerrar visor ·
                    Podés seleccionar varias y comprar juntas
                </span>
            </div>
        </div>
        ${adminBar}
        <div id="faces-panel-wrap"></div>
        <div class="photos-grid">${fotosHTML}</div>`;
}

function cerrarEvento() {
    eventoActual = null; personaFiltrada = null; personasData = [];
    document.getElementById('event-view').style.display = 'none';
    document.getElementById('portfolio').style.removeProperty('display');
    document.getElementById('about').style.removeProperty('display');
    window.scrollTo({ top: document.getElementById('portfolio').offsetTop - 68, behavior: 'smooth' });
}

// ─── DRAG & DROP UPLOAD ───────────────────────────────────────────────────────
function initDragDrop(eventoId) {
    if (!isAdmin) return;
    const zone = document.querySelector('.upload-zone');
    if (!zone) return;

    ['dragenter','dragover'].forEach(ev => {
        zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave','drop'].forEach(ev => {
        zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', e => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        const input = document.getElementById(`file-input-${eventoId}`);
        if (!input) return;
        // Crear DataTransfer para asignar al input
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        input.files = dt.files;
        document.getElementById(`upload-form-${eventoId}`)?.dispatchEvent(new Event('submit'));
    });
}

// ─── SELECCIÓN DE FOTOS ────────────────────────────────────────────────────────
function toggleFoto(fotoId) {
    if (!eventoActual) return;
    const foto = eventoActual.fotos.find(f => f.id === fotoId);
    if (!foto) return;

    const el   = document.getElementById(`photo-${fotoId}`);
    const icon = el?.querySelector('.photo-select-icon i');

    if (carrito.has(fotoId)) {
        carrito.delete(fotoId);
        el?.classList.remove('selected');
        if (icon) icon.className = 'fa-solid fa-cart-shopping';
        toast(`Foto eliminada del carrito`, 'info', 1500);
    } else {
        carrito.set(fotoId, { foto, evento: eventoActual });
        el?.classList.add('selected');
        if (icon) icon.className = 'fa-solid fa-check';
        el?.animate([
            { transform: 'scale(0.97)' },
            { transform: 'scale(1.02)' },
            { transform: 'scale(1)' }
        ], { duration: 240, easing: 'ease' });
        toast(`Foto agregada al carrito · ${carrito.size} en total`, 'success', 1500);
    }
    actualizarCarritoBar();
}

function limpiarCarrito() {
    carrito.clear();
    document.querySelectorAll('.photo-item.selected').forEach(el => {
        el.classList.remove('selected');
        const icon = el.querySelector('.photo-select-icon i');
        if (icon) icon.className = 'fa-solid fa-cart-shopping';
    });
    actualizarCarritoBar();
    toast('Selección vaciada', 'info', 1800);
}

function actualizarCarritoBar() {
    const count = carrito.size;
    const total = [...carrito.values()].reduce((s, {foto}) => s + foto.precio, 0);
    const bar   = document.getElementById('cart-bar');
    if (!bar) return;
    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = `$${total.toLocaleString('es-AR')} ARS`;
    bar.classList.toggle('visible', count > 0);

    // Actualizar LB si está abierto
    if (document.getElementById('lightbox')?.classList.contains('open')) {
        actualizarLbBtn();
    }
}

// ─── LIGHTBOX ────────────────────────────────────────────────────────────────
function abrirLightbox(idx) {
    lbIdx = idx;
    const lb = document.getElementById('lightbox');
    lb.style.display = 'flex';
    requestAnimationFrame(() => lb.classList.add('open'));
    document.body.style.overflow = 'hidden';
    mostrarLbFoto();
}

function mostrarLbFoto() {
    const foto = lbFotos[lbIdx];
    if (!foto) return;
    document.getElementById('lb-img').src = foto.url_preview;
    document.getElementById('lb-counter').textContent = lbFotos.length > 1 ? `${lbIdx+1} / ${lbFotos.length}` : '';
    actualizarLbBtn();
    const showNav = lbFotos.length > 1;
    document.getElementById('lb-prev').style.opacity = showNav ? '1' : '0';
    document.getElementById('lb-next').style.opacity = showNav ? '1' : '0';
}

function actualizarLbBtn() {
    const foto  = lbFotos[lbIdx];
    const lbBtn = document.getElementById('lb-cart-btn');
    if (!lbBtn || !foto) return;
    const inCart = carrito.has(foto.id);
    lbBtn.innerHTML   = inCart
        ? '<i class="fa-solid fa-check"></i> En el carrito'
        : '<i class="fa-solid fa-cart-shopping"></i> Agregar al carrito';
    lbBtn.className   = `lb-cart-btn${inCart?' in-cart':''}`;
}

function cerrarLightbox() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open');
    setTimeout(() => { lb.style.display = 'none'; }, 280);
    document.body.style.overflow = '';
}

function lbPrev() { lbIdx = (lbIdx-1+lbFotos.length)%lbFotos.length; mostrarLbFoto(); }
function lbNext() { lbIdx = (lbIdx+1)%lbFotos.length; mostrarLbFoto(); }

function lbToggleCart() {
    const foto = lbFotos[lbIdx];
    if (foto) { toggleFoto(foto.id); actualizarLbBtn(); }
}

function initLightboxKB() {
    document.addEventListener('keydown', e => {
        if (!document.getElementById('lightbox')?.classList.contains('open')) return;
        if (e.key === 'Escape')     cerrarLightbox();
        if (e.key === 'ArrowLeft')  lbPrev();
        if (e.key === 'ArrowRight') lbNext();
    });
}

// ─── FACE FILTER ─────────────────────────────────────────────────────────────
async function cargarPersonas(eventoId) {
    const wrap = document.getElementById('faces-panel-wrap');
    if (!wrap) return;
    try {
        const d = await (await fetch(`/evento/${eventoId}/personas`)).json();
        personasData = d.personas || [];
        renderPersonasPanel(d, wrap);
    } catch { wrap.innerHTML = ''; }
}

function renderPersonasPanel(data, wrap) {
    const { personas, ia_habilitada, total_personas } = data;

    if (!ia_habilitada) { wrap.innerHTML = ''; return; }

    if (!personas?.length) {
        wrap.innerHTML = `
            <div class="faces-panel">
                <div class="faces-panel-header">
                    <span class="faces-panel-title"><i class="fa-solid fa-face-smile"></i> Filtrar por persona</span>
                    <span class="faces-ia-badge processing">
                        <i class="fa-solid fa-spinner fa-spin"></i> IA procesando...
                    </span>
                    ${isAdmin ? `<button class="reprocess-btn" onclick="reprocesarIA()">
                        <i class="fa-solid fa-rotate"></i> Reprocesar
                    </button>` : ''}
                </div>
                <div class="faces-empty"><i class="fa-solid fa-circle-info"></i> Las fotos se están analizando. Recargá en unos segundos.</div>
            </div>`;
        return;
    }

    const chips = personas.map(p => {
        const imgHTML = p.cara_url
            ? `<img src="${p.cara_url}" alt="${p.nombre}" loading="lazy">`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text-dim)"><i class="fa-solid fa-user"></i></div>`;
        const adminBtns = isAdmin ? `
            <div class="face-chip-admin-btns">
                <button class="face-chip-admin-btn"
                    onclick="event.stopPropagation();etiquetarPersona(${p.id},'${p.nombre}')"
                    title="Poner nombre"><i class="fa-solid fa-tag"></i></button>
                <button class="face-chip-admin-btn del"
                    onclick="event.stopPropagation();borrarPersonaCluster(${p.id})"
                    title="Eliminar"><i class="fa-solid fa-xmark"></i></button>
            </div>` : '';
        return `
        <div class="face-chip" id="face-chip-${p.id}"
             onclick="filtrarPorPersona(${p.id})"
             title="${p.nombre} · ${p.total_fotos} foto${p.total_fotos!==1?'s':''}">
            <div class="face-chip-avatar">
                ${imgHTML}
                <div class="face-chip-check"><i class="fa-solid fa-check"></i></div>
            </div>
            <span class="face-chip-count">${p.total_fotos}</span>
            ${adminBtns}
            <span class="face-chip-label">${p.nombre}</span>
        </div>`;
    }).join('');

    wrap.innerHTML = `
        <div class="faces-panel">
            <div class="faces-panel-header">
                <span class="faces-panel-title">
                    <i class="fa-solid fa-face-viewfinder"></i> Filtrar por persona
                </span>
                <span class="faces-ia-badge">
                    <i class="fa-solid fa-brain"></i> IA activa · ${total_personas} persona${total_personas!==1?'s':''} detectada${total_personas!==1?'s':''}
                </span>
                ${isAdmin ? `<button class="reprocess-btn" onclick="reprocesarIA()">
                    <i class="fa-solid fa-rotate"></i> Reprocesar IA
                </button>` : ''}
            </div>
            <div class="faces-scroll">
                <div class="face-chip-all active" id="face-chip-all" onclick="limpiarFiltroPersona()">
                    <div class="face-chip-all-circle"><i class="fa-solid fa-users"></i></div>
                    <span class="face-chip-all-label">Todos</span>
                </div>
                ${chips}
            </div>
        </div>
        <div class="face-filter-results" id="face-filter-results" style="display:none">
            Mostrando <span id="face-filter-count">0</span> fotos de esta persona
        </div>`;
}

function filtrarPorPersona(personaId) {
    if (personaFiltrada === personaId) { limpiarFiltroPersona(); return; }
    personaFiltrada = personaId;
    const persona   = personasData.find(p => p.id === personaId);
    if (!persona) return;
    const fotoIds   = new Set(persona.foto_ids);
    let coinciden   = 0;
    document.querySelectorAll('.photo-item').forEach(el => {
        const id = parseInt(el.id?.replace('photo-',''));
        if (fotoIds.has(id)) { el.classList.add('face-match'); el.classList.remove('face-dimmed'); coinciden++; }
        else                 { el.classList.add('face-dimmed'); el.classList.remove('face-match'); }
    });
    document.querySelectorAll('.face-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('face-chip-all')?.classList.remove('active');
    document.getElementById(`face-chip-${personaId}`)?.classList.add('active');
    const res = document.getElementById('face-filter-results');
    if (res) { res.style.display = 'block'; res.querySelector('#face-filter-count').textContent = coinciden; }
    document.querySelector('.photos-grid')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function limpiarFiltroPersona() {
    personaFiltrada = null;
    document.querySelectorAll('.photo-item').forEach(el => el.classList.remove('face-match','face-dimmed'));
    document.querySelectorAll('.face-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('face-chip-all')?.classList.add('active');
    const res = document.getElementById('face-filter-results');
    if (res) res.style.display = 'none';
}

async function etiquetarPersona(personaId, nombreActual) {
    const { value: nombre } = await Swal.fire({
        title: 'Nombre de la persona',
        input: 'text', inputValue: nombreActual.startsWith('Persona #') ? '' : nombreActual,
        inputPlaceholder: 'Ej: Juan García / N° 10',
        background: 'var(--ink-2)', color: 'var(--text)',
        confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        showCancelButton: true, confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
    });
    if (nombre === undefined) return;
    const res = await fetch(`/persona/${personaId}/nombre`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre || `Persona #${personaId}` })
    });
    if (res.ok) {
        const chip = document.getElementById(`face-chip-${personaId}`);
        if (chip) chip.querySelector('.face-chip-label').textContent = nombre || `Persona #${personaId}`;
        const p = personasData.find(p => p.id === personaId);
        if (p) p.nombre = nombre || `Persona #${personaId}`;
        toast('Nombre guardado', 'success');
    }
}

async function borrarPersonaCluster(personaId) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar este perfil?',
        html: '<p style="color:#999;font-size:14px">Se elimina el agrupamiento. Las fotos no se borran.</p>',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e84040', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;
    await fetch(`/persona/${personaId}`, { method: 'DELETE', credentials: 'include' });
    limpiarFiltroPersona();
    if (eventoActual) cargarPersonas(eventoActual.id);
    toast('Perfil eliminado', 'info');
}

async function reprocesarIA() {
    if (!eventoActual) return;
    const { isConfirmed } = await Swal.fire({
        title: 'Reprocesar con IA',
        html: `<p style="color:#999;font-size:14px;line-height:1.7">Se analizarán <strong>${eventoActual.fotos.length} fotos</strong> y se resetearán los perfiles actuales.</p>`,
        icon: 'info', showCancelButton: true,
        confirmButtonText: 'Sí, reprocesar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;
    const res = await fetch(`/evento/${eventoActual.id}/reprocesar-rostros`, { method:'POST', credentials:'include' });
    const d   = await res.json();
    if (res.ok) {
        toast(d.mensaje, 'success', 3000);
        setTimeout(() => cargarPersonas(eventoActual.id), 5000);
    } else {
        toast(d.error || 'Error al reprocesar', 'error');
    }
}

// ─── CREAR EVENTO ─────────────────────────────────────────────────────────────
async function crearEvento() {
    const { value: vals } = await Swal.fire({
        title: 'Nuevo Evento',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <input id="ev-titulo" class="swal2-input" placeholder="Título (ej: Talleres vs Belgrano — Fecha 15)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <select id="ev-deporte"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;padding:13px;margin:0 auto 10px;display:block;font-size:14px;font-family:Inter,sans-serif;">
                <option value="" disabled selected>Deporte...</option>
                <option value="Fútbol">⚽ Fútbol</option>
                <option value="Básquet">🏀 Básquet</option>
                <option value="Otro">📷 Otro</option>
            </select>
            <input id="ev-fecha" type="date" class="swal2-input"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="ev-desc" class="swal2-input" placeholder="Descripción breve (opcional)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;font-family:Inter,sans-serif;">`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear evento', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo  = document.getElementById('ev-titulo').value.trim();
            const deporte = document.getElementById('ev-deporte').value;
            if (!titulo || !deporte) { Swal.showValidationMessage('Título y deporte son requeridos'); return false; }
            return { titulo, deporte,
                     fecha: document.getElementById('ev-fecha').value,
                     descripcion: document.getElementById('ev-desc').value.trim() };
        }
    });
    if (!vals) return;

    const res = await fetch('/crear-evento', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarEventos();
        toast('¡Evento creado correctamente!', 'success');
    } else {
        toast('Error al crear el evento', 'error');
    }
}

// ─── EDITAR EVENTO ────────────────────────────────────────────────────────────
async function editarEvento(eventoId) {
    const ev = eventosData.find(e => e.id === eventoId);
    if (!ev) return;
    const { value: vals } = await Swal.fire({
        title: 'Editar Evento',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <input id="ev-titulo-e" class="swal2-input" value="${ev.titulo}" placeholder="Título"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="ev-fecha-e" type="date" value="${ev.fecha||''}" class="swal2-input"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="ev-desc-e" class="swal2-input" value="${ev.descripcion||''}" placeholder="Descripción"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;font-family:Inter,sans-serif;">`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => ({
            titulo:      document.getElementById('ev-titulo-e').value.trim(),
            fecha:       document.getElementById('ev-fecha-e').value,
            descripcion: document.getElementById('ev-desc-e').value.trim()
        })
    });
    if (!vals) return;
    const res = await fetch(`/editar-evento/${eventoId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarEventos();
        // Reabrir con datos frescos
        const evActualizado = eventosData.find(e => e.id === eventoId);
        if (evActualizado) { eventoActual = evActualizado; document.getElementById('event-view').innerHTML = renderVistaEvento(evActualizado); initDragDrop(eventoId); }
        toast('Evento actualizado', 'success');
    } else { toast('Error al guardar', 'error'); }
}

// ─── SUBIR FOTOS ─────────────────────────────────────────────────────────────
async function subirFotos(event, eventoId) {
    event.preventDefault();
    const input = event.target.querySelector('input[type="file"]');
    if (!input?.files.length) return;

    const files     = Array.from(input.files);
    const progWrap  = document.getElementById(`uprogress-${eventoId}`);
    const progBar   = document.getElementById(`upbar-${eventoId}`);
    const progText  = document.getElementById(`uptext-${eventoId}`);
    const label     = document.getElementById(`upload-label-${eventoId}`);

    if (progWrap) progWrap.style.display = 'block';
    if (progText) { progText.style.display = 'block'; progText.textContent = `Preparando ${files.length} foto${files.length>1?'s':''}...`; }

    let exitosas = 0, errores = 0;

    for (let i = 0; i < files.length; i++) {
        const labelStr = `Subiendo ${i+1} de ${files.length} — ${files[i].name.substring(0,30)}`;
        if (label)    label.textContent = labelStr;
        if (progText) progText.textContent = labelStr;
        if (progBar)  progBar.style.width = `${(i/files.length)*100}%`;

        const fd = new FormData();
        fd.append('foto',      files[i]);
        fd.append('evento_id', eventoId);
        fd.append('precio',    PRECIO_BASE);

        try {
            const res = await fetch('/subir-foto', { method:'POST', body:fd, credentials:'include' });
            if (res.ok) exitosas++;
            else errores++;
        } catch { errores++; }

        if (progBar) progBar.style.width = `${((i+1)/files.length)*100}%`;
    }

    setTimeout(() => {
        if (progWrap) progWrap.style.display = 'none';
        if (progText) progText.style.display = 'none';
        if (progBar)  progBar.style.width = '0';
    }, 800);

    if (label) label.textContent = 'Subir fotos al evento';
    event.target.reset();

    if (exitosas > 0) {
        await cargarEventos();
        abrirEvento(eventoId);
        toast(
            exitosas === files.length
                ? `✓ ${exitosas} foto${exitosas>1?'s':''} subida${exitosas>1?'s':''}!`
                : `${exitosas} subidas, ${errores} fallaron`,
            exitosas === files.length ? 'success' : 'info',
            3000
        );
    } else {
        toast('No se pudo subir ninguna foto. Verificá la conexión.', 'error', 4000);
    }
}

// ─── BORRAR EVENTO ────────────────────────────────────────────────────────────
async function borrarEvento(id) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Borrar este evento?',
        html: '<p style="color:#999;font-size:14px">Se eliminarán el evento y <strong style="color:var(--red)">todas sus fotos</strong>. No se puede deshacer.</p>',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Sí, borrar todo', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e84040', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;
    const res = await fetch(`/borrar-evento/${id}`, { method:'DELETE', credentials:'include' });
    if (res.ok) {
        cerrarEvento();
        await cargarEventos();
        toast('Evento eliminado', 'info');
    } else {
        toast('Error al borrar el evento', 'error');
    }
}

// ─── BORRAR FOTO ──────────────────────────────────────────────────────────────
async function borrarFoto(id) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar esta foto?', icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e84040', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;
    const res = await fetch(`/borrar-foto/${id}`, { method:'DELETE', credentials:'include' });
    if (res.ok) {
        document.getElementById(`photo-${id}`)?.remove();
        if (carrito.has(id)) { carrito.delete(id); actualizarCarritoBar(); }
        if (eventoActual) {
            eventoActual.fotos = eventoActual.fotos.filter(f => f.id !== id);
            lbFotos = eventoActual.fotos;
        }
        toast('Foto eliminada', 'info');
    }
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
function abrirCheckout() {
    if (!carrito.size) return;
    const items = [...carrito.values()];
    const total = items.reduce((s,{foto}) => s + foto.precio, 0);

    document.getElementById('checkout-resumen').innerHTML = items.map(({foto,evento}) => `
        <div class="checkout-summary-row">
            <div class="row-title">
                <div style="color:var(--text);font-size:13px">${evento.titulo}</div>
                <div style="color:var(--text-dim);font-size:11px;margin-top:2px">Foto #${foto.id} · Alta resolución</div>
            </div>
            <div class="row-price">$${Number(foto.precio).toLocaleString('es-AR')}</div>
        </div>`).join('');

    document.getElementById('checkout-total-amount').textContent = `$${total.toLocaleString('es-AR')} ARS`;

    const modal = document.getElementById('checkout-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('co-nombre')?.focus(), 300);
}

function cerrarCheckout() {
    const m = document.getElementById('checkout-modal');
    m.classList.remove('open');
    setTimeout(() => { m.style.display = 'none'; }, 300);
    document.body.style.overflow = '';
}

async function procesarPago() {
    const nombre = document.getElementById('co-nombre')?.value.trim();
    const email  = document.getElementById('co-email')?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('co-email')?.focus();
        document.querySelector('.checkout-box')?.classList.add('shake');
        setTimeout(() => document.querySelector('.checkout-box')?.classList.remove('shake'), 500);
        toast('Por favor ingresá un email válido', 'error');
        return;
    }

    const foto_ids = [...carrito.keys()];
    const btn      = document.getElementById('checkout-pay-btn');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        const res  = await fetch('/crear-orden', {
            method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ foto_ids, email, nombre })
        });
        const data = await res.json();

        if (res.ok && data.init_point) {
            window.location.href = data.init_point;
            return;
        }

        if (data.error === 'mp_no_configurado' || res.status === 503) {
            cerrarCheckout();
            const total = [...carrito.values()].reduce((s,{foto}) => s+foto.precio, 0);
            const msg   = encodeURIComponent(
                `Hola Nacho! Quiero comprar ${foto_ids.length} foto${foto_ids.length>1?'s':''}.\n` +
                `Total: $${total.toLocaleString('es-AR')} ARS\n` +
                `Email para recibir las fotos: ${email}\n` +
                `¿Cómo te puedo pagar?`
            );
            const { isConfirmed } = await Swal.fire({
                icon:'info', title:'Coordinar por WhatsApp',
                html:`<p style="color:#999;font-size:14px;line-height:1.8">
                    El pago online se está configurando.<br>
                    Podés coordinar directamente con Nacho por WhatsApp.
                </p>`,
                background:'var(--ink-2)', color:'var(--text)',
                confirmButtonText:'<i class="fa-brands fa-whatsapp"></i>&nbsp; Abrir WhatsApp',
                cancelButtonText:'Cerrar', showCancelButton:true,
                confirmButtonColor:'#25D366', cancelButtonColor:'#333'
            });
            if (isConfirmed) window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
        } else {
            throw new Error(data.error);
        }
    } catch {
        toast('Error al procesar el pago. Intentá de nuevo.', 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Pagar con MercadoPago';
    }
}

function coordinarWA() {
    const nombre = document.getElementById('co-nombre')?.value.trim() || '';
    const email  = document.getElementById('co-email')?.value.trim() || '';
    const count  = carrito.size;
    const total  = [...carrito.values()].reduce((s,{foto}) => s+foto.precio, 0);
    const msg    = encodeURIComponent(
        `Hola Nacho! Quiero comprar ${count} foto${count>1?'s':''}.\n` +
        `Total: $${total.toLocaleString('es-AR')} ARS\n` +
        (email  ? `Email: ${email}\n` : '') +
        (nombre ? `Nombre: ${nombre}\n` : '') +
        `¿Cómo te puedo pagar?`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function abrirLoginModal() {
    const m = document.getElementById('login-modal');
    m.style.display = 'flex';
    requestAnimationFrame(() => m.classList.add('open'));
    document.body.style.overflow = 'hidden';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('admin-password').value = '';
    setTimeout(() => document.getElementById('admin-password')?.focus(), 200);
}

function cerrarLoginModal() {
    const m = document.getElementById('login-modal');
    m.classList.remove('open');
    setTimeout(() => { m.style.display = 'none'; }, 320);
    document.body.style.overflow = '';
}

function togglePasswordVis() {
    const inp  = document.getElementById('admin-password');
    const icon = document.getElementById('toggle-icon');
    inp.type     = inp.type === 'password' ? 'text' : 'password';
    icon.className = inp.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    inp.focus();
}

async function ejecutarLogin() {
    const pass  = document.getElementById('admin-password')?.value;
    const btn   = document.getElementById('login-submit-btn');
    const errEl = document.getElementById('login-error');
    if (!pass) return;

    btn.disabled  = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    errEl.style.display = 'none';

    try {
        const res  = await fetch('/login', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ password: pass }), credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            isAdmin = true; toggleAdminUI(true);
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Acceso concedido';
            setTimeout(() => {
                cerrarLoginModal();
                btn.disabled = false; btn.innerHTML = 'Ingresar';
                toast('¡Sesión iniciada!', 'success');
                setTimeout(abrirAdminPanel, 400);
            }, 700);
        } else {
            errEl.style.display = 'flex';
            btn.disabled = false; btn.innerHTML = 'Ingresar';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            document.querySelector('.login-box')?.classList.add('shake');
            setTimeout(() => document.querySelector('.login-box')?.classList.remove('shake'), 500);
        }
    } catch {
        errEl.style.display = 'flex';
        btn.disabled = false; btn.innerHTML = 'Ingresar';
    }
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
async function abrirAdminPanel() {
    const m = document.getElementById('admin-modal');
    m.style.display = 'flex';
    requestAnimationFrame(() => m.classList.add('open'));
    document.body.style.overflow = 'hidden';
    await Promise.all([cargarAdminStats(), cargarCompras(), cargarConsultas()]);
}

function cerrarAdminPanel() {
    const m = document.getElementById('admin-modal');
    m.classList.remove('open');
    setTimeout(() => { m.style.display = 'none'; }, 300);
    document.body.style.overflow = '';
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
}

async function cargarAdminStats() {
    try {
        const d = await (await fetch('/admin/stats', { credentials:'include' })).json();
        document.getElementById('as-eventos').textContent  = d.total_eventos ?? '—';
        document.getElementById('as-fotos').textContent    = d.total_fotos   ?? '—';
        document.getElementById('as-compras').textContent  = d.total_compras ?? '—';
        document.getElementById('as-ingresos').textContent = d.ingresos
            ? `$${Number(d.ingresos).toLocaleString('es-AR')}`
            : '$0';
        // Badges
        if (d.emails_pend > 0) {
            const b = document.getElementById('badge-compras');
            if (b) { b.textContent = d.emails_pend; b.style.display = 'inline-flex'; }
        }
        if (d.mensajes_nue > 0) {
            const b = document.getElementById('badge-consultas');
            if (b) { b.textContent = d.mensajes_nue; b.style.display = 'inline-flex'; }
        }
    } catch {}
}

async function cargarCompras() {
    const c = document.getElementById('tab-compras');
    if (!c) return;
    c.innerHTML = '<p class="admin-loading">Cargando compras...</p>';
    try {
        const lista = await (await fetch('/admin/compras', { credentials:'include' })).json();
        if (!lista.length) { c.innerHTML = '<p class="admin-loading">Sin compras registradas.</p>'; return; }
        c.innerHTML = lista.map(p => {
            const cls      = p.estado==='approved'?'badge-approved':p.estado==='rejected'?'badge-rejected':'badge-pendiente';
            const emailCls = p.email_enviado ? 'badge-approved' : 'badge-pendiente';
            return `
            <div class="admin-item" id="compra-${p.id}">
                <div class="admin-item-hdr">
                    <div>
                        <strong>${p.nombre||p.email}</strong>
                        <span class="badge ${cls}">${p.estado}</span>
                        <span class="badge ${emailCls}">${p.email_enviado?'✓ Email enviado':'Sin email'}</span>
                        <br><small style="color:var(--text-dim)">${p.email}</small>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div class="admin-item-date">${p.fecha}</div>
                        <strong style="color:var(--gold);font-size:15px">$${Number(p.total).toLocaleString('es-AR')}</strong>
                    </div>
                </div>
                <div class="admin-item-body">
                    ${p.foto_ids.length} foto${p.foto_ids.length>1?'s':''} · IDs: [${p.foto_ids.join(', ')}]
                </div>
                <div class="admin-item-actions">
                    ${p.estado==='approved'&&!p.email_enviado ? `
                    <button class="admin-action-btn primary" onclick="reenviarEmail(${p.id})">
                        <i class="fa-solid fa-paper-plane"></i> Enviar fotos por email
                    </button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch { c.innerHTML = '<p class="admin-loading" style="color:var(--red)">Error al cargar.</p>'; }
}

async function reenviarEmail(id) {
    const btn = event.target.closest('.admin-action-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
    const res  = await fetch(`/admin/compras/${id}/reenviar-email`, { method:'POST', credentials:'include' });
    const data = await res.json();
    toast(data.ok ? '✓ Email enviado correctamente' : 'Error al reenviar el email', data.ok ? 'success' : 'error');
    if (data.ok) cargarCompras();
}

async function cargarConsultas() {
    const c = document.getElementById('tab-consultas');
    if (!c) return;
    c.innerHTML = '<p class="admin-loading">Cargando consultas...</p>';
    try {
        const lista = await (await fetch('/admin/consultas', { credentials:'include' })).json();
        if (!lista.length) { c.innerHTML = '<p class="admin-loading">Sin consultas.</p>'; return; }
        c.innerHTML = lista.map(m => `
            <div class="admin-item" id="msg-${m.id}">
                <div class="admin-item-hdr">
                    <div>
                        <strong>${m.nombre}</strong>
                        ${!m.leida?'<span class="badge badge-new">Nueva</span>':''}
                        <br><small style="color:var(--text-dim)">${m.email}</small>
                    </div>
                    <span class="admin-item-date">${m.fecha}</span>
                </div>
                <div class="admin-item-body">${m.mensaje||'<em>Sin mensaje</em>'}</div>
                ${!m.leida ? `
                <div class="admin-item-actions">
                    <button class="admin-action-btn" onclick="marcarLeida(${m.id})">
                        <i class="fa-solid fa-check"></i> Marcar como leída
                    </button>
                </div>` : ''}
            </div>`).join('');
    } catch { c.innerHTML = '<p class="admin-loading" style="color:var(--red)">Error al cargar.</p>'; }
}

async function marcarLeida(id) {
    await fetch(`/admin/consultas/${id}/leer`, { method:'PATCH', credentials:'include' });
    document.getElementById(`msg-${id}`)?.querySelector('.badge-new')?.remove();
    document.getElementById(`msg-${id}`)?.querySelector('.admin-item-actions')?.remove();
    // Actualizar badge
    const badge = document.getElementById('badge-consultas');
    if (badge) {
        const n = parseInt(badge.textContent) - 1;
        badge.textContent = n > 0 ? n : '!';
        badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
    toast('Marcada como leída', 'info', 1500);
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
    await fetch('/logout', { method:'POST', credentials:'include' });
    isAdmin = false; toggleAdminUI(false); cerrarAdminPanel();
    toast('Sesión cerrada', 'info');
}