/* ═══════════════════════════════════════════════════════════════
   NACHO LINGUA FOTOGRAFÍA — SPORTS PHOTO MARKETPLACE 2026
   ═══════════════════════════════════════════════════════════════ */

// ⚠ 1. Bloqueo de descarga por clic derecho
document.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'IMG' || e.target.closest('.photo-item')) {
        e.preventDefault();
        toast('La descarga está protegida por derechos de autor', 'info', 2000);
    }
});

// ⚠ 2. Bloqueo de tecla Imprimir Pantalla
document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText(''); 
        toast('Captura de pantalla no permitida', 'error', 3000);
    }
});

// ⚠ 3. Difuminar fotos al perder foco (anti-recortes)
document.addEventListener('visibilitychange', () => {
    const grid = document.querySelector('.photos-grid');
    const lb   = document.querySelector('.lb-img');
    if (document.hidden) {
        if (grid) grid.style.filter = 'blur(20px)';
        if (lb)   lb.style.filter   = 'blur(20px)';
    } else {
        if (grid) grid.style.filter = 'none';
        if (lb)   lb.style.filter   = 'none';
    }
});

// ⚠ CONFIGURACIÓN
const WA_NUMBER   = '5493510000000';   
const PRECIO_BASE = 3000; // Solo de referencia para subir fotos             

// ─── LÓGICA DE PRECIOS POR VOLUMEN ───────────────────────────────────────────
function getPrecioUnitario(cantidad) {
    if (cantidad === 1) return 3000;
    if (cantidad === 2) return 2700;
    if (cantidad === 3) return 2500;
    if (cantidad === 4) return 2300;
    if (cantidad >= 5)  return 2000; // <-- Cambiar a 5000 acá si realmente era el valor deseado
    return 3000;
}

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let eventosData     = [];
let eventoActual    = null;
let carrito         = new Map();
let isAdmin         = false;
let lbFotos         = [];
let lbIdx           = 0;
let personasData    = [];
let personaFiltrada = null;
let adminClicks     = 0;
let adminClickTimer = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    cargarCarrito();
    await Promise.all([verificarSesion(), cargarEventos()]);

    initNavScroll();
    initReveal();
    initNavLinks();
    initStatsCounter();
    initBackToTop();
    initLightboxKB();
    initAdminTriggers();

    document.getElementById('btn-admin-panel')?.addEventListener('click', abrirAdminPanel);
    document.getElementById('btn-add-evento')?.addEventListener('click', crearEvento);
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    ['checkout-modal','admin-modal','login-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'checkout-modal') cerrarCheckout();
                if (id === 'admin-modal')    cerrarAdminPanel();
                if (id === 'login-modal')    cerrarLoginModal();
            }
        });
    });

    const wa = document.getElementById('whatsapp-btn');
    if (wa) wa.href = `https://wa.me/${WA_NUMBER}`;

    setTimeout(() => document.getElementById('loading-screen')?.classList.add('hidden'), 1300);
});

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

function initNavScroll() {
    window.addEventListener('scroll', () => {
        document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 80);
        
        const evHeader = document.querySelector('.event-view-header');
        if (evHeader && document.getElementById('event-view').style.display === 'block') {
            if (window.scrollY > 120) {
                evHeader.classList.add('shrunk');
            } else {
                evHeader.classList.remove('shrunk');
            }
        }
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

function initReveal() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

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

function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 500), { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function cargarEventos() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    try {
        const [rEv, rCat] = await Promise.all([
            fetch('/obtener-eventos'),
            fetch('/categorias')
        ]);
        eventosData    = await rEv.json();
        const cats     = await rCat.json();

        // Construir menú dinámico de categorías
        const cont = document.querySelector('.sport-filters');
        if (cont) {
            let html = `<button class="sport-btn active" data-filter="all">
                <span class="sport-btn-icon">🏆</span>
                <span class="sport-btn-label">Todos</span>
            </button>`;
            cats.forEach(cat => {
                html += `<button class="sport-btn" data-filter="${cat.slug}" data-cat-id="${cat.id}">
                    <span class="sport-btn-icon">${cat.icono}</span>
                    <span class="sport-btn-label">${cat.nombre}</span>
                </button>`;
            });
            if (isAdmin) {
                html += `<button class="sport-btn sport-btn-add" onclick="adminCategorias()">
                    <span class="sport-btn-icon">⚙️</span>
                    <span class="sport-btn-label">Gestionar</span>
                </button>`;
            }
            cont.innerHTML = html;
        }

        renderEventos();
        configurarFiltros();
    } catch {
        grid.innerHTML = '<div class="empty-state"><p>No se pudo cargar la galería. Recargá la página.</p></div>';
    }
}

// ─── HELPERS DE ÁRBOL ────────────────────────────────────────────────────────
function buscarEvento(id, lista) {
    for (const ev of lista) {
        if (ev.id === id) return ev;
        if (ev.subcarpetas?.length) {
            const found = buscarEvento(id, ev.subcarpetas);
            if (found) return found;
        }
    }
    return null;
}

function breadcrumbEvento(id, lista, ruta = []) {
    for (const ev of lista) {
        const nueva = [...ruta, ev];
        if (ev.id === id) return nueva;
        if (ev.subcarpetas?.length) {
            const found = breadcrumbEvento(id, ev.subcarpetas, nueva);
            if (found) return found;
        }
    }
    return null;
}

function renderEventoCard(ev, i) {
    const cover  = ev.cover_url || ev.fotos?.[0]?.url_preview || 'https://placehold.co/800x600/0c0c12/1c1c24?text=Sin+fotos';
    const count  = ev.total_fotos ?? ev.fotos?.length ?? 0;
    const delay  = Math.min(i * 0.07, 0.5);
    const hasSub = (ev.total_subcarpetas ?? ev.subcarpetas?.length ?? 0) > 0;
    const subCount = ev.total_subcarpetas ?? ev.subcarpetas?.length ?? 0;

    return `
    <div class="event-card${hasSub ? ' event-card-folder' : ''} reveal"
         style="transition-delay:${delay}s"
         onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
        <img class="event-card-img" src="${cover}" alt="${ev.titulo}" loading="lazy">
        <div class="event-card-overlay">
            <div class="event-card-sport">${ev.deporte}</div>
            <div class="event-card-title">${ev.titulo}</div>
            <div class="event-card-meta">
                ${ev.fecha ? `<span><i class="fa-regular fa-calendar" style="margin-right:5px"></i>${ev.fecha}</span>` : ''}
                ${hasSub
                    ? `<span><i class="fa-solid fa-folder" style="margin-right:5px;color:var(--gold)"></i>${subCount} subcarpeta${subCount!==1?'s':''}</span>`
                    : `<span class="event-card-count">${count} foto${count!==1?'s':''}</span>`}
            </div>
        </div>
        ${hasSub ? '<div class="event-card-folder-badge"><i class="fa-solid fa-folder-open"></i></div>' : ''}
        <div class="event-card-enter">
            <div class="event-card-enter-btn">${hasSub ? 'Abrir carpeta →' : 'Explorar galería →'}</div>
        </div>
    </div>`;
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

    grid.innerHTML = data.map((ev, i) => renderEventoCard(ev, i)).join('');

    initReveal();
    configurarFiltros();
}

async function cargarCategorias() {
    try {
        const res  = await fetch('/categorias');
        const cats = await res.json();
        const cont = document.querySelector('.sport-filters');
        if (!cont) return;

        let html = `<button class="sport-btn active" data-filter="all">
            <span class="sport-btn-icon">🏆</span>
            <span class="sport-btn-label">Todos</span>
        </button>`;

        cats.forEach(cat => {
            html += `<button class="sport-btn" data-filter="${cat.slug}" data-cat-id="${cat.id}">
                <span class="sport-btn-icon">${cat.icono}</span>
                <span class="sport-btn-label">${cat.nombre}</span>
            </button>`;
        });

        if (isAdmin) {
            html += `<button class="sport-btn sport-btn-add" onclick="adminCategorias()" title="Gestionar categorías">
                <span class="sport-btn-icon">⚙️</span>
                <span class="sport-btn-label">Gestionar</span>
            </button>`;
        }

        cont.innerHTML = html;
        configurarFiltros();
    } catch(e) {
        console.error('Error cargando categorías:', e);
        configurarFiltros();
    }
}

function configurarFiltros() {
    document.querySelectorAll('.sport-btn:not(.sport-btn-add)').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderEventos(btn.dataset.filter);
        };
    });
}

async function adminCategorias() {map(cat => `
        <div class="cat-admin-row" data-id="${cat.id}" style="
            display:flex;align-items:center;gap:10px;padding:8px 0;
            border-bottom:1px solid var(--ink-4);">
            <input class="cat-icono-input swal2-input" value="${cat.icono}"
                style="width:52px;padding:4px 8px;text-align:center;font-size:18px;
                       background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       font-family:Inter,sans-serif;margin:0">
            <input class="cat-nombre-input swal2-input" value="${cat.nombre}"
                style="flex:1;padding:4px 10px;background:var(--ink-4);color:var(--text);
                       border:1px solid var(--ink-5);font-family:Inter,sans-serif;margin:0">
            <button onclick="borrarCat(${cat.id},this)"
                style="background:none;border:1px solid rgba(232,64,64,0.4);color:var(--red);
                       width:28px;height:28px;cursor:pointer;border-radius:50%;font-size:11px;
                       display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>`).join('');

    const { value: ok } = await Swal.fire({
        title: 'Gestionar categorías',
        background: 'var(--ink-2)', color: 'var(--text)',
        width: 520,
        html: `
            <div id="cat-lista" style="margin-bottom:16px;max-height:300px;overflow-y:auto">${listaHtml}</div>
            <div style="display:flex;gap:8px;align-items:center">
                <input id="new-cat-icono" class="swal2-input" placeholder="🎯"
                    style="width:52px;text-align:center;font-size:18px;
                           background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                           padding:6px 8px;margin:0;font-family:Inter,sans-serif">
                <input id="new-cat-nombre" class="swal2-input" placeholder="Nueva categoría"
                    style="flex:1;background:var(--ink-4);color:var(--text);
                           border:1px solid var(--ink-5);padding:6px 10px;margin:0;font-family:Inter,sans-serif">
                <button onclick="agregarCatInline()"
                    style="padding:6px 14px;background:var(--gold);color:#000;border:none;
                           font-weight:700;font-size:11px;letter-spacing:1px;cursor:pointer;
                           text-transform:uppercase;white-space:nowrap;flex-shrink:0">
                    + Agregar
                </button>
            </div>`,
        confirmButtonText: 'Guardar cambios',
        confirmButtonColor: '#D4A843',
        showCancelButton: true, cancelButtonText: 'Cancelar', cancelButtonColor: '#555',
        preConfirm: async () => {
            const rows = document.querySelectorAll('.cat-admin-row[data-id]');
            for (const row of rows) {
                const id     = parseInt(row.dataset.id);
                const icono  = row.querySelector('.cat-icono-input').value.trim();
                const nombre = row.querySelector('.cat-nombre-input').value.trim();
                if (nombre) {
                    await fetch(`/categorias/${id}`, {
                        method:'PATCH', credentials:'include',
                        headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({nombre, icono})
                    });
                }
            }
            return true;
        }
    });

    if (ok) { await cargarCategorias(); toast('Categorías actualizadas', 'success'); }
}

async function agregarCatInline() {
    const icono  = document.getElementById('new-cat-icono')?.value.trim() || '📷';
    const nombre = document.getElementById('new-cat-nombre')?.value.trim();
    if (!nombre) return;
    const res = await fetch('/categorias', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({nombre, icono})
    });
    const cat = await res.json();
    const row = document.createElement('div');
    row.className = 'cat-admin-row';
    row.dataset.id = cat.id;
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--ink-4);';
    row.innerHTML = `
        <input class="cat-icono-input swal2-input" value="${cat.icono}"
            style="width:52px;padding:4px 8px;text-align:center;font-size:18px;
                   background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                   font-family:Inter,sans-serif;margin:0">
        <input class="cat-nombre-input swal2-input" value="${cat.nombre}"
            style="flex:1;padding:4px 10px;background:var(--ink-4);color:var(--text);
                   border:1px solid var(--ink-5);font-family:Inter,sans-serif;margin:0">
        <button onclick="borrarCat(${cat.id},this)"
            style="background:none;border:1px solid rgba(232,64,64,0.4);color:var(--red);
                   width:28px;height:28px;cursor:pointer;border-radius:50%;font-size:11px;
                   display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fa-solid fa-xmark"></i>
        </button>`;
    document.getElementById('cat-lista')?.appendChild(row);
    document.getElementById('new-cat-nombre').value = '';
    document.getElementById('new-cat-icono').value  = '';
}

async function borrarCat(id, btn) {
    await fetch(`/categorias/${id}`, {method:'DELETE', credentials:'include'});
    btn.closest('.cat-admin-row')?.remove();
}

function abrirEvento(eventoId) {
    const ev = buscarEvento(eventoId, eventosData);
    if (!ev) return;

    // Si tiene subcarpetas, mostrar navegación de subcarpetas
    if ((ev.total_subcarpetas ?? ev.subcarpetas?.length ?? 0) > 0) {
        mostrarSubcarpetas(ev);
        return;
    }

    eventoActual    = ev;
    lbFotos         = ev.fotos || [];
    personaFiltrada = null;
    personasData    = [];

    document.getElementById('portfolio').style.display = 'none';
    document.getElementById('about').style.display     = 'none';

    const view = document.getElementById('event-view');
    view.style.display = 'block';
    view.innerHTML     = renderVistaEvento(ev);

    initDragDrop(ev.id);
    if (ev.fotos?.length > 0) cargarPersonas(ev.id);

    const offset = document.getElementById('event-view').offsetTop - 68;
    window.scrollTo({ top: offset, behavior: 'smooth' });
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
            <button onclick="crearSubcarpeta(${ev.id})"
                style="height:68px;padding:0 16px;border:1px solid var(--gold-dim);color:var(--gold);
                       font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;
                       transition:0.3s;background:none;font-family:Inter,sans-serif;
                       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;"
                onmouseover="this.style.background='rgba(212,168,67,0.08)'"
                onmouseout="this.style.background='none'">
                <i class="fa-solid fa-folder-plus"></i>
                <span>Subcarpeta</span>
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
            <div class="photo-item${sel?' selected':''}" id="photo-${f.id}" onclick="abrirLightbox(${idx})" style="cursor: pointer;">
                <img src="${f.url_preview}" alt="Foto deportiva" loading="lazy"
                     title="Clic para ampliar">
                <div class="photo-item-overlay">
                    <div class="photo-select-icon" onclick="event.stopPropagation(); toggleFoto(${f.id})" title="Agregar/quitar del carrito">
                        <i class="fa-solid ${sel?'fa-check':'fa-cart-shopping'}"></i>
                    </div>
                </div>
                <div class="photo-check-badge"><i class="fa-solid fa-check"></i></div>
                ${isAdmin ? `
                <button onclick="event.stopPropagation();borrarFoto(${f.id})"
                    title="Eliminar foto"
                    style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);
                           border:none;color:var(--red);width:28px;height:28px;border-radius:50%;
                           font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:auto;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button onclick="event.stopPropagation();elegirPortada(${ev.id},${f.id},this)"
                    title="${ev.cover_foto_id===f.id ? 'Portada actual' : 'Usar como portada'}"
                    id="cover-btn-${f.id}"
                    style="position:absolute;top:8px;left:44px;
                           background:${ev.cover_foto_id===f.id ? 'var(--gold)' : 'rgba(0,0,0,0.75)'};
                           border:none;color:${ev.cover_foto_id===f.id ? '#000' : 'var(--gold)'};
                           width:28px;height:28px;border-radius:50%;
                           font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:auto;">
                    <i class="fa-solid fa-image"></i>
                </button>
                <button onclick="event.stopPropagation();editarPrecioFoto(${f.id},${f.precio||PRECIO_BASE})"
                    title="Editar precio de esta foto"
                    style="position:absolute;top:44px;left:8px;
                           background:rgba(0,0,0,0.75);
                           border:none;color:#aaa;
                           width:28px;height:28px;border-radius:50%;
                           font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:auto;">
                    <i class="fa-solid fa-tag"></i>
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
                    <div class="price-badge" style="font-size:20px; color:var(--gold);">Promos en Carrito</div>
                    <div style="font-size:11px; color:var(--text-dim); margin-top:4px; text-align:right;">
                        1x $3.000 | 2x $2.700 c/u | +3 desde $2.500 c/u
                    </div>
                </div>
            </div>
            <div class="selection-info">
                <i class="fa-solid fa-circle-info"></i>
                <span>
                    <strong>Clic en la foto</strong> para ampliarla · 
                    <strong>Clic en el carrito</strong> <i class="fa-solid fa-cart-plus" style="margin:0 2px"></i> para seleccionarla · 
                    Podés elegir varias y aprovechar el descuento por cantidad
                </span>
            </div>
        </div>
        ${adminBar}
        <div id="faces-panel-wrap"></div>
        <div class="photos-grid">${fotosHTML}</div>`;
}

function mostrarSubcarpetas(ev) {
    const ruta = breadcrumbEvento(ev.id, eventosData) || [ev];
    document.getElementById('portfolio').style.display = 'none';
    document.getElementById('about').style.display     = 'none';
    const view = document.getElementById('event-view');
    view.style.display = 'block';

    const breadcrumbHTML = ruta.map((item, idx) => {
        if (idx === ruta.length - 1)
            return `<span style="color:var(--text)">${item.titulo}</span>`;
        return `<button onclick="abrirEvento(${item.id})"
            style="background:none;border:none;color:var(--gold);cursor:pointer;
                   font-size:inherit;font-family:inherit;padding:0;">${item.titulo}</button>
            <span style="color:var(--text-dim);margin:0 6px">/</span>`;
    }).join('');

    const subCardsHTML = (ev.subcarpetas || []).map((sub, i) => renderEventoCard(sub, i)).join('');

    const adminBtns = isAdmin ? `
        <button onclick="crearSubcarpeta(${ev.id})"
            style="display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;
                   font-size:10px;letter-spacing:2px;text-transform:uppercase;
                   color:var(--gold);border:1px solid var(--gold-dim);background:none;
                   cursor:pointer;font-family:Inter,sans-serif;transition:0.3s;"
            onmouseover="this.style.background='rgba(212,168,67,0.1)'"
            onmouseout="this.style.background='none'">
            <i class="fa-solid fa-folder-plus"></i> Nueva subcarpeta
        </button>` : '';

    view.innerHTML = `
        <div class="event-view-header">
            <div class="event-view-nav">
                <button class="back-btn" onclick="${ev.parent_id ? 'abrirEvento('+ev.parent_id+')' : 'cerrarEvento()'}">
                    <i class="fa-solid fa-arrow-left-long"></i>
                    ${ev.parent_id ? 'Volver' : 'Todas las galerías'}
                </button>
                <span class="event-view-sport-tag">${ev.deporte}</span>
                <div>
                    <div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;
                                display:flex;align-items:center;flex-wrap:wrap;gap:2px;">
                        ${breadcrumbHTML}
                    </div>
                </div>
                ${adminBtns}
            </div>
            <div class="selection-info">
                <i class="fa-solid fa-folder-open"></i>
                <span>
                    <strong>${(ev.subcarpetas||[]).length}</strong>
                    subcarpeta${(ev.subcarpetas||[]).length!==1?'s':''} en esta carpeta
                </span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:2px;padding:0 8% 40px;">
            ${subCardsHTML}
        </div>`;

    initReveal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function crearSubcarpeta(parentId) {
    const { value: vals } = await Swal.fire({
        title: 'Nueva subcarpeta',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <input id="sub-titulo" class="swal2-input" placeholder="Nombre (ej: Talleres, Primera División...)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="sub-fecha" type="date" class="swal2-input"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;font-family:Inter,sans-serif;">`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear subcarpeta', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo = document.getElementById('sub-titulo').value.trim();
            if (!titulo) { Swal.showValidationMessage('El nombre es requerido'); return false; }
            return { titulo, parent_id: parentId, fecha: document.getElementById('sub-fecha').value };
        }
    });
    if (!vals) return;

    const res = await fetch('/crear-evento', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarEventos();
        const padre = buscarEvento(parentId, eventosData);
        if (padre) mostrarSubcarpetas(padre);
        toast('¡Subcarpeta creada!', 'success');
    } else {
        toast('Error al crear la subcarpeta', 'error');
    }
}

function cerrarEvento() {
    eventoActual = null; personaFiltrada = null; personasData = [];
    document.getElementById('event-view').style.display = 'none';
    document.getElementById('portfolio').style.removeProperty('display');
    document.getElementById('about').style.removeProperty('display');
    window.scrollTo({ top: document.getElementById('portfolio').offsetTop - 68, behavior: 'smooth' });
}

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
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        input.files = dt.files;
        document.getElementById(`upload-form-${eventoId}`)?.dispatchEvent(new Event('submit'));
    });
}

function guardarCarrito() {
    localStorage.setItem('nl_carrito', JSON.stringify([...carrito.entries()]));
}

function cargarCarrito() {
    const guardado = localStorage.getItem('nl_carrito');
    if (guardado) {
        try {
            carrito = new Map(JSON.parse(guardado));
            actualizarCarritoBar();
        } catch (e) {
            console.error('Error al cargar carrito', e);
            carrito = new Map();
        }
    }
}

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
    guardarCarrito();
}

function limpiarCarrito() {
    carrito.clear();
    document.querySelectorAll('.photo-item.selected').forEach(el => {
        el.classList.remove('selected');
        const icon = el.querySelector('.photo-select-icon i');
        if (icon) icon.className = 'fa-solid fa-cart-shopping';
    });
    actualizarCarritoBar();
    guardarCarrito(); 
    toast('Selección vaciada', 'info', 1800);
}

function actualizarCarritoBar() {
    const count = carrito.size;
    const unitario = count > 0 ? getPrecioUnitario(count) : 0;
    const total = count * unitario;
    
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = `$${total.toLocaleString('es-AR')} ARS`;
    bar.classList.toggle('visible', count > 0);

    if (document.getElementById('lightbox')?.classList.contains('open')) {
        actualizarLbBtn();
    }
}

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
        const evActualizado = eventosData.find(e => e.id === eventoId);
        if (evActualizado) { eventoActual = evActualizado; document.getElementById('event-view').innerHTML = renderVistaEvento(evActualizado); initDragDrop(eventoId); }
        toast('Evento actualizado', 'success');
    } else { toast('Error al guardar', 'error'); }
}

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
        let modificado = false;
        for (const [fotoId, item] of carrito.entries()) {
            if (item.evento.id === id) {
                carrito.delete(fotoId);
                modificado = true;
            }
        }
        if (modificado) {
            actualizarCarritoBar();
            guardarCarrito();
        }

        cerrarEvento();
        await cargarEventos();
        toast('Evento eliminado', 'info');
    } else {
        toast('Error al borrar el evento', 'error');
    }
}

// ─── PRECIO MANUAL POR FOTO ───────────────────────────────────────────────────
async function editarPrecioFoto(fotoId, precioActual) {
    const { value: nuevoPrecio } = await Swal.fire({
        title: 'Precio de esta foto',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
                Precio predeterminado: <strong style="color:var(--gold)">$${PRECIO_BASE.toLocaleString('es-AR')}</strong><br>
                Dejá en blanco para volver al precio predeterminado.
            </p>
            <input id="precio-input" class="swal2-input" type="number" min="0"
                value="${precioActual !== PRECIO_BASE ? precioActual : ''}"
                placeholder="Precio en ARS"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       font-family:Inter,sans-serif;font-size:16px;text-align:center;width:80%">`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar precio',
        confirmButtonColor: '#D4A843',
        cancelButtonText: 'Cancelar',
        cancelButtonColor: '#555',
        preConfirm: () => {
            const val = document.getElementById('precio-input').value;
            return val === '' ? PRECIO_BASE : parseFloat(val);
        }
    });

    if (nuevoPrecio === undefined) return;

    const res  = await fetch(`/foto/${fotoId}/precio`, {
        method: 'PATCH', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({precio: nuevoPrecio})
    });
    const data = await res.json();
    if (data.ok) {
        // Actualizar precio en eventosData
        for (const ev of eventosData) {
            const foto = (ev.fotos || []).find(f => f.id === fotoId);
            if (foto) { foto.precio = nuevoPrecio; break; }
        }
        // Actualizar carrito si la foto está en él
        if (carrito.has(fotoId)) {
            const item = carrito.get(fotoId);
            item.foto.precio = nuevoPrecio;
        }
        const msg = nuevoPrecio === PRECIO_BASE
            ? 'Precio reseteado al predeterminado'
            : `Precio actualizado: $${nuevoPrecio.toLocaleString('es-AR')}`;
        toast(msg, 'success', 2500);
    } else {
        toast('Error al actualizar el precio', 'error');
    }
}

// ─── QUITAR DEL CARRITO DESDE CHECKOUT ────────────────────────────────────────
function quitarDelCarritoCheckout(fotoId) {
    carrito.delete(fotoId);
    guardarCarrito();
    actualizarCarritoBar();
    // Re-renderizar el checkout
    if (window._renderCheckoutItems) window._renderCheckoutItems();
    // Actualizar el estado visual de la foto en la galería
    const card = document.getElementById(`foto-card-${fotoId}`);
    if (card) card.classList.remove('selected');
}

// ─── ELEGIR PORTADA ───────────────────────────────────────────────────────────
async function elegirPortada(eventoId, fotoId, btn) {
    const ev = eventosData.find(e => e.id === eventoId);
    if (!ev) return;

    // Si ya es la portada, resetear a automático
    const esPortadaActual = ev.cover_foto_id === fotoId;
    const accion = esPortadaActual ? null : fotoId;

    const res  = await fetch(`/evento/${eventoId}/portada`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foto_id: accion })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Error al cambiar portada', 'error'); return; }

    // Actualizar estado local
    ev.cover_foto_id = accion;
    ev.cover_url     = data.cover_url;

    // Actualizar todos los botones de portada visualmente
    document.querySelectorAll('.photo-item [id^="cover-btn-"]').forEach(b => {
        const id = parseInt(b.id.replace('cover-btn-', ''));
        const esNueva = id === accion;
        b.style.background = esNueva ? 'var(--gold)' : 'rgba(0,0,0,0.75)';
        b.style.color      = esNueva ? '#000' : 'var(--gold)';
        b.title            = esNueva ? 'Portada actual' : 'Usar como portada';
    });

    toast(accion ? '✓ Portada actualizada' : 'Portada reseteada a automático', 'success', 2000);
}

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
        if (carrito.has(id)) { 
            carrito.delete(id); 
            actualizarCarritoBar(); 
            guardarCarrito(); 
        }
        if (eventoActual) {
            eventoActual.fotos = eventoActual.fotos.filter(f => f.id !== id);
            lbFotos = eventoActual.fotos;
        }
        toast('Foto eliminada', 'info');
    }
}

function abrirCheckout() {
    if (!carrito.size) return;
    
    // Acá aplicamos el precio dinámico al momento de abrir el modal de pago
    const count = carrito.size;
    const unitario = getPrecioUnitario(count);
    const total = count * unitario;
    
    const items = [...carrito.values()];

    const renderCheckoutItems = () => {
        const items2    = [...carrito.values()];
        const count2    = items2.length;
        const unitario2 = getPrecioUnitario(count2);
        const total2    = items2.reduce((s, {foto}) => s + (foto.precio || unitario2), 0);

        document.getElementById('checkout-resumen').innerHTML = items2.map(({foto,evento}) => {
            const precio_foto = foto.precio || unitario2;
            return `
            <div class="checkout-summary-row" id="checkout-row-${foto.id}">
                <div class="row-thumb">
                    <img src="${foto.url_preview}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:3px;opacity:0.8">
                </div>
                <div class="row-title">
                    <div style="color:var(--text);font-size:13px">${evento.titulo}</div>
                    <div style="color:var(--text-dim);font-size:11px;margin-top:2px">Foto #${foto.id} · Alta resolución</div>
                </div>
                <div class="row-price">$${precio_foto.toLocaleString('es-AR')}</div>
                <button onclick="quitarDelCarritoCheckout(${foto.id})"
                    title="Quitar del carrito"
                    style="background:none;border:none;color:var(--red);cursor:pointer;
                           font-size:14px;padding:4px;flex-shrink:0;opacity:0.7;transition:opacity 0.2s;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;
        }).join('');

        document.getElementById('checkout-total-amount').textContent = `$${total2.toLocaleString('es-AR')} ARS`;

        if (count2 === 0) { cerrarCheckout(); }
    };

    renderCheckoutItems();
    window._renderCheckoutItems = renderCheckoutItems;

    // total ya actualizado por renderCheckoutItems

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
    const nombre    = document.getElementById('co-nombre')?.value.trim();
    const email     = document.getElementById('co-email')?.value.trim();
    const whatsapp  = document.getElementById('co-whatsapp')?.value.trim()
                        .replace(/[\s+\-().]/g, '');
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
            body: JSON.stringify({ foto_ids, email, nombre, whatsapp })
        });
        const data = await res.json();

        if (res.ok && data.init_point) {
            window.location.href = data.init_point;
            return;
        }

        if (data.error === 'mp_no_configurado' || res.status === 503) {
            cerrarCheckout();
            const count = carrito.size;
            const unitario = getPrecioUnitario(count);
            const total = count * unitario;
            const msg   = encodeURIComponent(
                `Hola Nacho! Quiero comprar ${count} foto${count>1?'s':''}.\n` +
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
    const unitario = getPrecioUnitario(count);
    const total  = count * unitario;
    
    const msg    = encodeURIComponent(
        `Hola Nacho! Quiero comprar ${count} foto${count>1?'s':''}.\n` +
        `Total: $${total.toLocaleString('es-AR')} ARS\n` +
        (email  ? `Email: ${email}\n` : '') +
        (nombre ? `Nombre: ${nombre}\n` : '') +
        `¿Cómo te puedo pagar?`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
}

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
                        <span class="badge ${emailCls}">${p.email_enviado?'✓ Email':'Sin email'}</span>
                        ${p.whatsapp ? `<span class="badge ${p.wa_enviado?'badge-approved':'badge-pendiente'}">${p.wa_enviado?'✓ WhatsApp':'WA pendiente'}</span>` : ''}
                        <br><small style="color:var(--text-dim);font-size:10px">${p.email}${p.whatsapp ? ' · 📱 +' + p.whatsapp : ''}</small>
                        ${p.link_galeria ? `<br><small><a href="${p.link_galeria}" target="_blank" style="color:var(--gold);font-size:10px;word-break:break-all">🔗 ${p.link_galeria}</a></small>` : ''}
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
                    ${p.estado==='approved' ? `
                    <button class="admin-action-btn primary" onclick="reenviarTodo(${p.id})">
                        <i class="fa-solid fa-paper-plane"></i> Reenviar email + WhatsApp
                    </button>` : ''}
                    ${p.link_galeria ? `
                    <button class="admin-action-btn" onclick="navigator.clipboard.writeText('${p.link_galeria}').then(()=>toast('Link copiado','success',1800))">
                        <i class="fa-solid fa-copy"></i> Copiar link galería
                    </button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch { c.innerHTML = '<p class="admin-loading" style="color:var(--red)">Error al cargar.</p>'; }
}

async function reenviarTodo(id) {
    const btn = event.target.closest('.admin-action-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
    const res  = await fetch(`/admin/compras/${id}/reenviar`, { method:'POST', credentials:'include' });
    const data = await res.json();
    toast(data.ok ? '✓ Email y WhatsApp reenviados' : 'Error al reenviar', data.ok ? 'success' : 'error');
    if (data.ok) setTimeout(cargarCompras, 1500);
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
    const badge = document.getElementById('badge-consultas');
    if (badge) {
        const n = parseInt(badge.textContent) - 1;
        badge.textContent = n > 0 ? n : '!';
        badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
    toast('Marcada como leída', 'info', 1500);
}

async function logout() {
    await fetch('/logout', { method:'POST', credentials:'include' });
    isAdmin = false; toggleAdminUI(false); cerrarAdminPanel();
    toast('Sesión cerrada', 'info');
}

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO IA — BÚSQUEDA Y ROSTER
// ════════════════════════════════════════════════════════════════════════════

// ── BÚSQUEDA POR JUGADOR ─────────────────────────────────────────────────────
let busquedaTimeout = null;

function iniciarBusquedaJugador() {
    const input = document.getElementById('search-jugador-input');
    if (!input) return;
    input.addEventListener('input', () => {
        clearTimeout(busquedaTimeout);
        const q = input.value.trim();
        if (q.length < 2) {
            document.getElementById('search-resultados')?.classList.remove('visible');
            return;
        }
        busquedaTimeout = setTimeout(() => buscarJugador(q), 350);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            document.getElementById('search-resultados')?.classList.remove('visible');
        }
    });
}

async function buscarJugador(q) {
    const ev_id   = eventoActual?.id || '';
    const url     = `/buscar-jugador?q=${encodeURIComponent(q)}${ev_id ? '&evento_id='+ev_id : ''}`;
    const res     = await fetch(url);
    const data    = await res.json();
    const cont    = document.getElementById('search-resultados');
    if (!cont) return;

    if (!data.fotos?.length) {
        cont.innerHTML = `<div class="search-empty">Sin resultados para "<strong>${q}</strong>"</div>`;
        cont.classList.add('visible');
        return;
    }

    cont.innerHTML = data.fotos.slice(0, 12).map(f => `
        <div class="search-result-item" onclick="verFotoDesdeSearch(${f.foto_id}, ${f.evento_id})">
            <img src="${f.url_preview}" alt="" loading="lazy">
            <div class="search-result-info">
                <div class="search-result-nombre">${f.jugador || 'Jugador detectado'}</div>
                <div class="search-result-meta">
                    ${f.numero ? `<span class="search-tag-num">#${f.numero}</span>` : ''}
                    <span class="search-tag-src ${f.fuente === 'manual' ? 'manual' : 'ia'}">
                        ${f.fuente === 'manual' ? '✏ Manual' : '🤖 IA'}
                    </span>
                </div>
                <div class="search-result-precio">$${Number(f.precio||3000).toLocaleString('es-AR')} ARS</div>
            </div>
            <button onclick="event.stopPropagation();agregarAlCarritoDesdeSearch(${f.foto_id}, ${f.evento_id})"
                style="background:var(--gold);border:none;color:#000;font-size:10px;font-weight:700;
                       letter-spacing:1px;text-transform:uppercase;padding:6px 12px;cursor:pointer;
                       white-space:nowrap;font-family:Inter,sans-serif;flex-shrink:0">
                + Carrito
            </button>
        </div>`).join('');
    cont.classList.add('visible');
}

function verFotoDesdeSearch(foto_id, evento_id) {
    const ev = buscarEvento(evento_id, eventosData);
    if (ev) {
        abrirEvento(evento_id);
        // Scroll a la foto específica
        setTimeout(() => {
            const el = document.getElementById(`foto-card-${foto_id}`);
            if (el) el.scrollIntoView({behavior:'smooth', block:'center'});
        }, 600);
    }
    document.getElementById('search-resultados')?.classList.remove('visible');
}

function agregarAlCarritoDesdeSearch(foto_id, evento_id) {
    const ev   = buscarEvento(evento_id, eventosData);
    const foto = ev?.fotos?.find(f => f.id === foto_id);
    if (!ev || !foto) return;
    if (carrito.has(foto_id)) {
        toast('Ya está en el carrito', 'info', 1500);
        return;
    }
    carrito.set(foto_id, {foto, evento: ev});
    guardarCarrito();
    actualizarCarritoBar();
    toast('✓ Agregada al carrito', 'success', 1500);
}

// ── PANEL DE ROSTER ──────────────────────────────────────────────────────────
async function abrirRoster(eventoId) {
    const res    = await fetch(`/evento/${eventoId}/roster`);
    const roster = await res.json();

    const listaHtml = roster.length
        ? roster.map(j => `
            <div class="roster-row" data-id="${j.id}" style="
                display:flex;align-items:center;gap:8px;padding:7px 0;
                border-bottom:1px solid var(--ink-4);">
                <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;
                             color:var(--gold);width:36px;text-align:center;flex-shrink:0">
                    ${j.numero || '—'}
                </span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;color:var(--text)">${j.nombre}</div>
                    ${j.equipo ? `<div style="font-size:10px;color:var(--text-dim)">${j.equipo}</div>` : ''}
                </div>
                <button onclick="borrarJugadorRoster(${eventoId},${j.id},this)"
                    style="background:none;border:none;color:var(--red);cursor:pointer;
                           font-size:13px;opacity:0.7;flex-shrink:0"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`).join('')
        : '<div style="color:var(--text-dim);font-size:13px;padding:12px 0;text-align:center">Sin jugadores aún</div>';

    await Swal.fire({
        title: `Roster del evento`,
        background: 'var(--ink-2)', color: 'var(--text)',
        width: 540,
        html: `
            <p style="font-size:12px;color:var(--text-dim);margin-bottom:14px">
                El roster ayuda a la IA a identificar jugadores por número de camiseta.
            </p>
            <div id="roster-lista" style="max-height:280px;overflow-y:auto;margin-bottom:16px">
                ${listaHtml}
            </div>
            <div style="background:var(--ink-3);padding:14px;border-radius:4px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;
                            color:var(--gold);margin-bottom:10px">Agregar jugador</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <input id="r-num" class="swal2-input" placeholder="N°" type="number" min="1" max="99"
                        style="width:64px;padding:6px 8px;text-align:center;font-size:16px;
                               background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                               font-family:'Bebas Neue',sans-serif;margin:0;letter-spacing:1px">
                    <input id="r-nombre" class="swal2-input" placeholder="Nombre del jugador"
                        style="flex:1;min-width:140px;padding:6px 10px;background:var(--ink-4);
                               color:var(--text);border:1px solid var(--ink-5);font-family:Inter,sans-serif;
                               font-size:13px;margin:0">
                    <input id="r-equipo" class="swal2-input" placeholder="Equipo (opcional)"
                        style="flex:1;min-width:120px;padding:6px 10px;background:var(--ink-4);
                               color:var(--text);border:1px solid var(--ink-5);font-family:Inter,sans-serif;
                               font-size:13px;margin:0">
                    <button onclick="agregarJugadorRosterInline(${eventoId})"
                        style="padding:6px 16px;background:var(--gold);color:#000;border:none;
                               font-weight:700;font-size:11px;letter-spacing:1px;cursor:pointer;
                               text-transform:uppercase;white-space:nowrap;font-family:Inter,sans-serif">
                        + Agregar
                    </button>
                </div>
            </div>
            <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button onclick="procesarEventoIA(${eventoId})"
                    style="padding:8px 18px;background:rgba(212,168,67,0.12);color:var(--gold);
                           border:1px solid var(--gold-dim);font-size:11px;font-weight:700;
                           letter-spacing:1px;cursor:pointer;text-transform:uppercase;
                           font-family:Inter,sans-serif">
                    🤖 Procesar todas las fotos con IA
                </button>
            </div>`,
        showConfirmButton: false,
        showCloseButton:   true,
    });
}

async function agregarJugadorRosterInline(eventoId) {
    const numero = document.getElementById('r-num')?.value.trim();
    const nombre = document.getElementById('r-nombre')?.value.trim();
    const equipo = document.getElementById('r-equipo')?.value.trim();
    if (!numero || !nombre) { toast('Completá número y nombre', 'error'); return; }

    const res = await fetch(`/evento/${eventoId}/roster`, {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({numero, nombre, equipo})
    });
    const data = await res.json();
    if (data.ok) {
        // Agregar fila en el modal
        const row = document.createElement('div');
        row.dataset.id = Date.now();
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--ink-4);';
        row.innerHTML = `
            <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--gold);width:36px;text-align:center;flex-shrink:0">${numero}</span>
            <div style="flex:1"><div style="font-size:13px;color:var(--text)">${nombre}</div>${equipo?`<div style="font-size:10px;color:var(--text-dim)">${equipo}</div>`:''}</div>
            <button onclick="borrarJugadorRoster(${eventoId},null,this)" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;opacity:0.7">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        const lista = document.getElementById('roster-lista');
        // Quitar el mensaje "Sin jugadores"
        const vacio = lista?.querySelector('div[style*="text-align:center"]');
        if (vacio) vacio.remove();
        lista?.appendChild(row);
        document.getElementById('r-num').value    = '';
        document.getElementById('r-nombre').value = '';
        document.getElementById('r-equipo').value = '';
        toast('✓ Jugador agregado', 'success', 1500);
    }
}

async function borrarJugadorRoster(eventoId, jugadorId, btn) {
    if (!jugadorId) { btn.closest('div')?.remove(); return; }
    await fetch(`/evento/${eventoId}/roster/${jugadorId}`, {method:'DELETE', credentials:'include'});
    btn.closest('div[data-id]')?.remove();
}

async function procesarEventoIA(eventoId) {
    const res  = await fetch(`/evento/${eventoId}/procesar-ia-todo`, {method:'POST', credentials:'include'});
    const data = await res.json();
    if (data.ok) {
        toast(`🤖 Procesando ${data.total_fotos} fotos en background... Las etiquetas aparecerán solas`, 'success', 4000);
    } else {
        toast(data.error || 'Error al conectar con el microservicio IA', 'error');
    }
}