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
const WA_NUMBER   = '5493546515567';   
const PRECIO_BASE = 3200;

// ─── LÓGICA DE PRECIOS POR VOLUMEN ───────────────────────────────────────────
let NL_CONFIG = null;  // se carga desde /config-precios (parametrizable)

function precioEscalera(n) {
    // Escalera por cantidad (TOTAL): 1=3200, 2=5500, 3=7500, 5=10000.
    // De la 6ta foto en adelante, cada foto suma $2000. Interpola y es monótona creciente.
    n = Math.max(0, Math.floor(n));
    if (n === 0) return 0;
    const pts = [[1,3200],[2,5500],[3,7500],[5,10000]];
    for (let i = 0; i < pts.length - 1; i++) {
        const [a, pa] = pts[i], [b, pb] = pts[i+1];
        if (n >= a && n <= b) return Math.round(pa + (pb - pa) * (n - a) / (b - a));
    }
    return Math.round(10000 + (n - 5) * 2000);
}

function getPrecioUnitario(cantidad) {
    return cantidad > 0 ? Math.round(precioEscalera(cantidad) / cantidad) : 0;
}

async function cargarConfigPrecios() {
    try {
        const r = await fetch('/config-precios');
        if (r.ok) NL_CONFIG = await r.json();
    } catch (e) { console.warn('No se pudo cargar config de precios', e); }
}

/**
 * Calcula el precio de cada foto en el carrito correctamente:
 * - Si tiene precio personalizado (distinto al base): usa ese precio fijo
 * - Si tiene precio base: aplica descuento por volumen según cuántas fotos SIN precio custom hay
 */
function calcularPreciosCarrito() {
    // Escalera por cantidad: el total depende de CUÁNTAS fotos, no del precio individual.
    const items = [...carrito.values()];
    const n = items.length;
    const unit = n > 0 ? Math.round(precioEscalera(n) / n) : 0;
    return items.map(({foto, evento}) => ({ foto, evento, precio: unit }));
}

function calcularTotalCarrito() {
    return precioEscalera(carrito.size);
}

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let eventosData     = [];
let eventoActual    = null;
let carrito         = new Map();
let isAdmin         = false;
let lbFotos         = [];
let scrollMem       = {};       // memoria de scroll por vista (home / evento) - restaura al volver
let vistaKey        = 'home';   // clave de la vista actual
let lbIdx           = 0;
let adminClicks     = 0;
let adminClickTimer = null;
let nlTipoCompra     = 'individual';  // individual | pack_digital | pack_impresion
let nlFotosImpresion = [];            // ids elegidos para imprimir (pack_impresion)
let nlUpsellMostrado = false;         // evita repetir el modal de upsell

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    cargarCarrito();
    await Promise.all([verificarSesion(), cargarEventos(), cargarConfigPrecios()]);

    initNavScroll();
    initHeroParallax();
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
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:var(--text-dim);margin-bottom:12px"></i><p>No se pudieron cargar las galerías.</p></div>';
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
    const sinPortada = ev.usar_portada === false;
    const count    = ev.total_fotos ?? ev.fotos?.length ?? 0;
    const delay    = Math.min(i * 0.06, 0.45);
    const subCount = ev.total_subcarpetas ?? ev.subcarpetas?.length ?? 0;
    const hasSub   = subCount > 0;
    const feat     = i === 0 ? ' feature' : '';
    const fold     = hasSub ? ' folder' : '';
    const cover    = sinPortada ? '' : (ev.cover_url || ev.fotos?.[0]?.url_preview || '');

    // Carpeta SOLO-TITULO (madre sin portada): tarjeta vistosa, sin imagen
    if (sinPortada) {
        return `
        <div class="folder-bar" style="grid-column:1/-1" onclick="abrirEvento(${ev.id})"
             role="button" tabindex="0" onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
            <i class="fa-solid fa-folder-open folder-bar-ico"></i>
            <h3 class="folder-bar-title">${ev.titulo}</h3>
            <span class="folder-bar-meta">${hasSub ? `${subCount} carpeta${subCount!==1?'s':''}` : `${count} foto${count!==1?'s':''}`}</span>
            <i class="fa-solid fa-chevron-right folder-bar-arrow"></i>
        </div>`;
    }

    const coverHtml = cover
        ? `<img class="ec-img" src="${cover}" alt="${ev.titulo}" loading="lazy">`
        : `<div class="ec-img ec-img-empty"><i class="fa-solid fa-camera"></i></div>`;

    const badge = hasSub
        ? `<span class="ec-count"><i class="fa-solid fa-folder"></i>${subCount}</span>`
        : `<span class="ec-count"><i class="fa-solid fa-camera"></i>${count}</span>`;

    const meta = hasSub
        ? `<span><i class="fa-solid fa-folder"></i>${subCount} subcarpeta${subCount!==1?'s':''}</span>`
        : (ev.fecha
            ? `<span><i class="fa-regular fa-calendar"></i>${ev.fecha}</span>`
            : `<span><i class="fa-solid fa-camera"></i>${count} foto${count!==1?'s':''}</span>`);

    return `
    <article class="event-card${feat}${fold} reveal"
         style="transition-delay:${delay}s"
         onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
        <span class="ec-line"></span>
        ${coverHtml}
        <div class="ec-top">
            <span class="ec-sport"><i class="fa-solid fa-circle" style="font-size:5px"></i>${ev.deporte}</span>
            ${badge}
        </div>
        ${hasSub ? '<div class="ec-folder-badge"><i class="fa-solid fa-folder-open"></i></div>' : ''}
        <div class="ec-overlay">
            <h3 class="ec-title">${ev.titulo}</h3>
            <div class="ec-meta">${meta}</div>
            <span class="ec-enter">${hasSub ? 'Abrir carpeta' : 'Explorar galería'} <span class="arw">→</span></span>
        </div>
    </article>`;
}

function renderEventoBarra(ev) {
    var subCount = (ev.total_subcarpetas != null) ? ev.total_subcarpetas : (ev.subcarpetas ? ev.subcarpetas.length : 0);
    var count    = (ev.total_fotos != null) ? ev.total_fotos : (ev.fotos ? ev.fotos.length : 0);
    var hasSub   = subCount > 0;
    return '' +
    '<div class="folder-bar" onclick="abrirEvento(' + ev.id + ')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')abrirEvento(' + ev.id + ')">' +
        '<i class="fa-solid ' + (hasSub ? 'fa-folder-open' : 'fa-images') + ' folder-bar-ico"></i>' +
        '<h3 class="folder-bar-title">' + ev.titulo + '</h3>' +
        '<span class="folder-bar-meta">' + (hasSub ? subCount + ' carpeta' + (subCount!==1?'s':'') : count + ' foto' + (count!==1?'s':'')) + '</span>' +
        '<i class="fa-solid fa-chevron-right folder-bar-arrow"></i>' +
    '</div>';
}

function renderEventos(filtro = 'all') {
    const grid = document.getElementById('gallery-grid');
    const data = filtro === 'all'
        ? eventosData
        : eventosData.filter(e =>
            e.deporte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') === filtro);

    // Barras de carpeta en su propio contenedor (fuera del grid de fotos -> quedan finitas)
    let foldersCont = document.getElementById('gallery-folders');
    if (!foldersCont && grid) {
        foldersCont = document.createElement('div');
        foldersCont.id = 'gallery-folders';
        grid.parentNode.insertBefore(foldersCont, grid);
    }

    if (grid) grid.innerHTML = '';  // todo se muestra como barra finita; el grid de cards queda sin usar

    if (!data.length) {
        if (foldersCont) foldersCont.innerHTML = '<div class="empty-state"><p>No hay eventos en esta categoría aún.</p></div>';
        return;
    }

    if (foldersCont) foldersCont.innerHTML = data.map(renderEventoEntrada).join('');

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

async function adminCategorias() {
    const res  = await fetch('/categorias');
    const cats = await res.json();

    const listaHtml = cats.map(cat => `
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

function _coverDe(ev) {
    // Imagen para miniatura o portada (no depende del toggle)
    return ev.cover_url || (ev.fotos && ev.fotos[0] && ev.fotos[0].url_preview) || '';
}

function _scrollVista(key) {
    // Restaura la posición guardada de esa vista; si no hay, va al inicio de la galería
    const guardado = scrollMem[key];
    if (guardado != null) { window.scrollTo({ top: guardado }); return; }
    const vw = document.getElementById('event-view');
    window.scrollTo({ top: vw ? vw.offsetTop - 68 : 0 });
}

// Una carpeta se dibuja como PORTADA grande (usar_portada === true) o como BARRA con miniatura
function renderEventoEntrada(ev) {
    const subCount = ev.total_subcarpetas ?? (ev.subcarpetas ? ev.subcarpetas.length : 0);
    const count    = ev.total_fotos ?? (ev.fotos ? ev.fotos.length : 0);
    const hasSub   = subCount > 0;
    const cover    = _coverDe(ev);
    const meta     = hasSub ? (subCount + ' carpeta' + (subCount !== 1 ? 's' : ''))
                            : (count + ' foto' + (count !== 1 ? 's' : ''));

    // PORTADA GRANDE
    if (ev.usar_portada === true) {
        const img = cover
            ? `<img src="${cover}" alt="${ev.titulo}" loading="lazy" style="width:100%;height:auto;display:block;">`
            : `<div style="width:100%;height:230px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#19150c,#0f0d08);color:#D4A843;font-size:46px;"><i class="fa-solid ${hasSub ? 'fa-folder-open' : 'fa-camera'}"></i></div>`;
        return `
        <div class="evento-portada" onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})"
             style="position:relative;cursor:pointer;border:1px solid rgba(212,168,67,0.25);border-radius:4px;overflow:hidden;margin-bottom:10px;background:#0f0d08;">
            ${img}
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.18) 55%,transparent 100%);"></div>
            <div style="position:absolute;left:0;right:0;bottom:0;padding:18px 20px;">
                <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#D4A843;display:block;margin-bottom:4px;">${ev.deporte || ''}</span>
                <h3 style="margin:0;font-size:24px;line-height:1.05;color:#fff;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${ev.titulo}</h3>
                <span style="font-size:12px;color:#cbb88f;display:block;margin-top:5px;"><i class="fa-solid ${hasSub ? 'fa-folder' : 'fa-camera'}" style="margin-right:6px;"></i>${meta}</span>
            </div>
            <span style="position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`;
    }

    // BARRA CON MINIATURA
    const thumb = cover
        ? `<img src="${cover}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:6px;object-fit:cover;flex:0 0 auto;">`
        : `<i class="fa-solid ${hasSub ? 'fa-folder-open' : 'fa-images'} folder-bar-ico"></i>`;
    return `
    <div class="folder-bar" onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
        ${thumb}
        <h3 class="folder-bar-title">${ev.titulo}</h3>
        <span class="folder-bar-meta">${meta}</span>
        <i class="fa-solid fa-chevron-right folder-bar-arrow"></i>
    </div>`;
}

function abrirEvento(eventoId) {
    const ev = buscarEvento(eventoId, eventosData);
    if (!ev) return;

    // Guardar la posición de scroll de la vista que dejamos
    scrollMem[vistaKey] = window.scrollY;

    if ((ev.total_subcarpetas ?? ev.subcarpetas?.length ?? 0) > 0) {
        mostrarSubcarpetas(ev);
    } else {
        eventoActual = ev;
        lbFotos      = ev.fotos || [];

        document.getElementById('portfolio').style.display = 'none';
        document.getElementById('about').style.display     = 'none';
        var _ph = document.getElementById('packs-home'); if (_ph) _ph.style.display = 'none';

        const view = document.getElementById('event-view');
        view.style.display = 'block';
        view.innerHTML     = renderVistaEvento(ev);
        view.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));

        initDragDrop(ev.id);
        actualizarCarritoBar();
    }

    vistaKey = 'ev' + eventoId;
    _scrollVista(vistaKey);
}

function renderVistaEvento(ev) {
    const fotos = ev.fotos || [];

    // Breadcrumb + botón "Volver" al nivel anterior (no al inicio)
    const ruta = breadcrumbEvento(ev.id, eventosData) || [ev];
    const breadcrumbHTML = ruta.map((item, idx) => {
        if (idx === ruta.length - 1)
            return `<span style="color:var(--text)">${item.titulo}</span>`;
        return `<button onclick="abrirEvento(${item.id})" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:inherit;font-family:inherit;padding:0;">${item.titulo}</button><span style="color:var(--text-dim);margin:0 6px">/</span>`;
    }).join('');

    const adminBar = isAdmin ? `
        <div class="admin-upload-bar">
            <form class="upload-zone" id="upload-form-${ev.id}" onsubmit="subirFotos(event,${ev.id})">
                <label style="cursor:pointer;display:flex;align-items:center;gap:14px;width:100%">
                    <span class="upload-zone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>
                    <span>
                        <div class="upload-zone-text" id="upload-label-${ev.id}">Subir fotos al evento</div>
                        <div class="upload-zone-sub">Arrastrá fotos o una carpeta entera · Se suben con marca de agua automáticamente</div>
                    </span>
                    <input type="file" id="file-input-${ev.id}" name="foto" accept="image/*" multiple
                        onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>
            <input type="file" id="folder-input-${ev.id}" webkitdirectory directory multiple hidden
                onchange="subirCarpeta(event, ${ev.id})">
            <button type="button" onclick="document.getElementById('folder-input-${ev.id}').click()"
                style="height:68px;padding:0 16px;border:1px solid var(--gold-dim);color:var(--gold);
                       font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;
                       transition:0.3s;background:none;font-family:Inter,sans-serif;
                       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;"
                onmouseover="this.style.background='rgba(212,168,67,0.08)'"
                onmouseout="this.style.background='none'">
                <i class="fa-solid fa-folder-arrow-up"></i>
                <span>Carpeta</span>
            </button>
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
                <button onclick="event.stopPropagation();editarPrecioFoto(${f.id},${f.precio||PRECIO_BASE},${!!f.precio_custom})"
                    title="${f.precio_custom ? 'Precio especial: $'+f.precio.toLocaleString('es-AR') : 'Editar precio'}"
                    style="position:absolute;top:44px;left:8px;
                           background:${f.precio_custom ? 'var(--gold)' : 'rgba(0,0,0,0.75)'};
                           border:none;color:${f.precio_custom ? '#000' : '#aaa'};
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
                <button class="back-btn" onclick="${ev.parent_id ? 'abrirEvento('+ev.parent_id+')' : 'cerrarEvento()'}">
                    <i class="fa-solid fa-arrow-left-long"></i> ${ev.parent_id ? 'Volver' : 'Todas las galerías'}
                </button>
                <span class="event-view-sport-tag">${ev.deporte}</span>
                <div>
                    <div style="font-size:11px;color:var(--text-dim);margin-bottom:5px;display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${breadcrumbHTML}</div>
                    <div class="event-view-title">${ev.titulo}</div>
                    ${ev.fecha ? `<div class="event-view-date">
                        <i class="fa-regular fa-calendar" style="color:var(--gold);margin-right:6px"></i>${ev.fecha}
                    </div>` : ''}
                </div>
                <div class="price-info">
                    <div class="price-badge" style="font-size:20px; color:var(--gold);">Promos en Carrito</div>
                    <div style="font-size:11px; color:var(--text-dim); margin-top:4px; text-align:right;">
                        1x $3.200 | 2x $2.750 c/u | +3 desde $2.500 c/u
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
        
        <div class="photos-grid">${fotosHTML}</div>`;
}

function mostrarSubcarpetas(ev) {
    const ruta = breadcrumbEvento(ev.id, eventosData) || [ev];
    document.getElementById('portfolio').style.display = 'none';
    document.getElementById('about').style.display     = 'none';
    var _ph = document.getElementById('packs-home'); if (_ph) _ph.style.display = 'none';
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

    // Render robusto de subcarpetas: tarjetas SIEMPRE visibles (sin depender de 'reveal')
    const subs = ev.subcarpetas || [];
    const subCardsHTML = subs.length
        ? subs.map(renderEventoEntrada).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:54px 20px;border:1px dashed var(--ink-5);color:var(--text-dim);">
                <i class="fa-solid fa-folder-open" style="font-size:34px;color:var(--gold-dim);margin-bottom:14px;display:block;"></i>
                <p style="margin:0;font-size:14px;">Esta carpeta todavía no tiene subcarpetas.<br>Creá una con el botón <strong style="color:var(--gold)">"Nueva subcarpeta"</strong> de arriba.</p>
           </div>`;

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
        <div style="display:flex;flex-direction:column;gap:8px;padding:0 8% 40px;max-width:880px;margin:0 auto;">
            ${subCardsHTML}
        </div>`;

    // Mostrar las tarjetas SÍ o SÍ (el observer de 'reveal' a veces no dispara al entrar)
    view.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    initReveal();
    // (el scroll lo centraliza abrirEvento)
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
                       width:88%;font-family:Inter,sans-serif;">
            <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;font-size:12.5px;color:#bbb;cursor:pointer;">
                <input type="checkbox" id="sub-portada" style="width:auto;accent-color:#D4A843;transform:scale(1.15);">
                Destacar con portada grande <span style="color:#777;">(si no, se ve como miniatura)</span>
            </label>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear subcarpeta', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo = document.getElementById('sub-titulo').value.trim();
            if (!titulo) { Swal.showValidationMessage('El nombre es requerido'); return false; }
            return { titulo, parent_id: parentId, fecha: document.getElementById('sub-fecha').value, usar_portada: document.getElementById('sub-portada').checked };
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
    eventoActual = null;
    document.getElementById('event-view').style.display = 'none';
    document.getElementById('portfolio').style.removeProperty('display');
    document.getElementById('about').style.removeProperty('display');
    var _ph2 = document.getElementById('packs-home'); if (_ph2) _ph2.style.removeProperty('display');
    // Volver al inicio: restaurar la posición que tenía en la lista de galerías
    vistaKey = 'home';
    const homeY = scrollMem['home'];
    if (homeY != null) window.scrollTo({ top: homeY });
    else window.scrollTo({ top: document.getElementById('portfolio').offsetTop - 68 });
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
    zone.addEventListener('drop', async e => {
        e.preventDefault();
        const input = document.getElementById(`file-input-${eventoId}`);
        if (!input) return;
        // webkitGetAsEntry hay que llamarlo sincrónico, durante el drop
        const items   = e.dataTransfer.items;
        const entries = items ? Array.from(items).map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean) : [];
        let files;
        if (entries.some(en => en && en.isDirectory)) {
            toast('Leyendo la carpeta…', 'info', 1500);
            files = await leerImagenesDeEntries(entries);   // recorre carpetas y subcarpetas
        } else {
            files = Array.from(e.dataTransfer.files);
        }
        files = files.filter(f => f.type && f.type.startsWith('image/'));
        if (!files.length) { toast('No encontré imágenes en lo que soltaste', 'info'); return; }
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        input.files = dt.files;
        document.getElementById(`upload-form-${eventoId}`)?.dispatchEvent(new Event('submit'));
    });
}

// Recorre entries (archivos y carpetas, recursivo) y junta los File de imagen
function leerImagenesDeEntries(entries) {
    const out = [];
    const fileOf = entry => new Promise(res => entry.file(f => res(f), () => res(null)));
    const readDir = reader => new Promise(res => {
        const acc = [];
        const next = () => reader.readEntries(batch => {
            if (!batch.length) return res(acc);
            acc.push(...batch); next();
        }, () => res(acc));
        next();
    });
    const walk = async entry => {
        if (!entry) return;
        if (entry.isFile) {
            const f = await fileOf(entry);
            if (f && f.type && f.type.startsWith('image/')) out.push(f);
        } else if (entry.isDirectory) {
            const kids = await readDir(entry.createReader());
            for (const k of kids) await walk(k);
        }
    };
    return (async () => { for (const en of entries) await walk(en); return out; })();
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
    const bar   = document.getElementById('cart-bar');
    if (!bar) return;

    if (count === 0) {
        bar.classList.remove('visible');
        return;
    }

    const total = calcularTotalCarrito();
    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = `$${total.toLocaleString('es-AR')} ARS`;
    bar.classList.add('visible');

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

async function crearEvento() {
    // 1. Obtener las categorías dinámicamente de la base de datos
    let optionsHtml = '<option value="" disabled selected>Categoría...</option>';
    try {
        const res = await fetch('/categorias');
        if (res.ok) {
            const cats = await res.json();
            cats.forEach(c => {
                optionsHtml += `<option value="${c.nombre}">${c.nombre}</option>`;
            });
        }
    } catch (e) {
        console.error('Error al cargar categorías para el select', e);
    }

    // 2. Mostrar el modal con las opciones actualizadas
    const { value: vals } = await Swal.fire({
        title: 'Nuevo Evento',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <input id="ev-titulo" class="swal2-input" placeholder="Título (ej: Cosquín Rock 2026)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <select id="ev-deporte"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;padding:13px;margin:0 auto 10px;display:block;font-size:14px;font-family:Inter,sans-serif;">
                ${optionsHtml}
            </select>
            <input id="ev-fecha" type="date" class="swal2-input"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="ev-desc" class="swal2-input" placeholder="Descripción breve (opcional)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;font-family:Inter,sans-serif;">
            <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;font-size:12.5px;color:#bbb;cursor:pointer;">
                <input type="checkbox" id="ev-portada" style="width:auto;accent-color:#D4A843;transform:scale(1.15);">
                Destacar con portada grande <span style="color:#777;">(si no, se ve como miniatura)</span>
            </label>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear evento', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo  = document.getElementById('ev-titulo').value.trim();
            const deporte = document.getElementById('ev-deporte').value;
            if (!titulo || !deporte) { Swal.showValidationMessage('Título y categoría son requeridos'); return false; }
            return { titulo, deporte,
                     fecha: document.getElementById('ev-fecha').value,
                     descripcion: document.getElementById('ev-desc').value.trim(),
                     usar_portada: document.getElementById('ev-portada').checked };
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
    const ev = buscarEvento(eventoId, eventosData);
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
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);width:88%;font-family:Inter,sans-serif;">
            <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;font-size:12.5px;color:#bbb;cursor:pointer;">
                <input type="checkbox" id="ev-portada-e" ${ev.usar_portada ? 'checked' : ''} style="width:auto;accent-color:#D4A843;transform:scale(1.15);">
                Destacar con portada grande <span style="color:#777;">(si no, se ve como miniatura)</span>
            </label>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => ({
            titulo:      document.getElementById('ev-titulo-e').value.trim(),
            fecha:       document.getElementById('ev-fecha-e').value,
            descripcion: document.getElementById('ev-desc-e').value.trim(),
            usar_portada: document.getElementById('ev-portada-e').checked
        })
    });
    if (!vals) return;
    const res = await fetch(`/editar-evento/${eventoId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarEventos();
        const evActualizado = buscarEvento(eventoId, eventosData);
        if (evActualizado) { eventoActual = evActualizado; document.getElementById('event-view').innerHTML = renderVistaEvento(evActualizado); initDragDrop(eventoId); }
        toast('Evento actualizado', 'success');
    } else { toast('Error al guardar', 'error'); }
}

function subirCarpeta(event, eventoId) {
    const imgs = Array.from(event.target.files || []).filter(f => f.type && f.type.startsWith('image/'));
    if (!imgs.length) { toast('Esa carpeta no tiene imágenes', 'info'); return; }
    const main = document.getElementById(`file-input-${eventoId}`);
    const dt = new DataTransfer();
    imgs.forEach(f => dt.items.add(f));
    main.files = dt.files;
    document.getElementById(`upload-form-${eventoId}`)?.dispatchEvent(new Event('submit'));
    event.target.value = '';
}

// ── Compresión en el navegador: evita el límite de 10MB de Cloudinary ──
function _cargarImagen(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i);};i.onerror=e=>{URL.revokeObjectURL(u);rej(e);};i.src=u;});}
function _aBlobJPEG(img,maxDim,q){return new Promise(res=>{let w=img.naturalWidth,h=img.naturalHeight;if(Math.max(w,h)>maxDim){const r=maxDim/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r);}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(res,'image/jpeg',q);});}
async function prepararParaSubir(file,maxBytes=9.5*1024*1024){
    if(!file.type||!file.type.startsWith('image/')||file.size<=maxBytes) return file;
    let img; try{img=await _cargarImagen(file);}catch(e){return file;}
    let maxDim=5000,q=0.92,blob=await _aBlobJPEG(img,maxDim,q);
    while(blob&&blob.size>maxBytes&&(q>0.6||maxDim>2200)){ if(q>0.7)q-=0.07; else maxDim=Math.round(maxDim*0.85); blob=await _aBlobJPEG(img,maxDim,q); }
    if(!blob) return file;
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
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

    // Obtener firma de Cloudinary una sola vez para todas las fotos
    let sigData;
    try {
        const sigRes = await fetch('/cloudinary-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evento_id: eventoId }),
            credentials: 'include'
        });
        sigData = await sigRes.json();
    } catch(e) {
        toast('Error al iniciar subida. Verificá la conexión.', 'error', 4000);
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const labelStr = `Subiendo ${i+1} de ${files.length} — ${files[i].name.substring(0,30)}`;
        if (label)    label.textContent = labelStr;
        if (progText) progText.textContent = labelStr;
        if (progBar)  progBar.style.width = `${(i/files.length)*100}%`;

        try {
            // 1. Subir directo a Cloudinary desde el browser (sin pasar por Railway)
            const fd = new FormData();
            let archivo = files[i];
            try { archivo = await prepararParaSubir(files[i]); } catch(e) {}
            fd.append('file',         archivo);
            fd.append('api_key',      sigData.api_key);
            fd.append('timestamp',    sigData.timestamp);
            fd.append('signature',    sigData.signature);
            fd.append('folder',       sigData.folder);
            fd.append('upload_preset','ml_default');

            const cloudRes = await fetch(
                `https://api.cloudinary.com/v1_1/${sigData.cloud_name}/image/upload`,
                { method: 'POST', body: fd }
            );
            const cloudData = await cloudRes.json();

            if (!cloudData.secure_url) { errores++; continue; }

            // 2. Registrar en BD (solo envía la URL, no la foto)
            const regRes = await fetch('/registrar-foto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url_preview: cloudData.secure_url,
                    evento_id:   eventoId,
                    precio:      PRECIO_BASE,
                    public_id:   cloudData.public_id
                }),
                credentials: 'include'
            });
            if (regRes.ok) exitosas++;
            else errores++;

        } catch(e) { errores++; }

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
async function editarPrecioFoto(fotoId, precioActual, isCustom = false) {
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
        const esCustom = nuevoPrecio !== PRECIO_BASE;
        // Actualizar precio en eventosData
        for (const ev of eventosData) {
            const foto = (ev.fotos || []).find(f => f.id === fotoId);
            if (foto) {
                foto.precio        = nuevoPrecio;
                foto.precio_custom = esCustom;
                break;
            }
        }
        // Actualizar carrito si la foto está en él
        if (carrito.has(fotoId)) {
            const item = carrito.get(fotoId);
            item.foto.precio        = nuevoPrecio;
            item.foto.precio_custom = esCustom;
        }
        const msg = !esCustom
            ? 'Precio reseteado al predeterminado'
            : `Precio especial: $${nuevoPrecio.toLocaleString('es-AR')}`;
        toast(msg, 'success', 2500);
        actualizarCarritoBar();
        if (window._renderCheckoutItems) window._renderCheckoutItems();
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
    const ev = buscarEvento(eventoId, eventosData);
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

function abrirCheckout(tipo = 'individual') {
    if (!carrito.size) return;
    nlTipoCompra = tipo;
    if (tipo === 'individual') nlFotosImpresion = [];
    
    // Acá aplicamos el precio dinámico al momento de abrir el modal de pago
    const count = carrito.size;
    const unitario = getPrecioUnitario(count);
    const total = count * unitario;
    
    const items = [...carrito.values()];

    const renderCheckoutItems = () => {
        const itemsConPrecio = calcularPreciosCarrito();
        const total2         = itemsConPrecio.reduce((s, {precio}) => s + precio, 0);
        const count2         = itemsConPrecio.length;
        const precioNormal   = getPrecioUnitario(itemsConPrecio.filter(i => !i.foto.precio_custom).length);

        document.getElementById('checkout-resumen').innerHTML = itemsConPrecio.map(({foto, evento, precio}) => {
            const esCustom = foto.precio_custom === true;
            return `
            <div class="checkout-summary-row" id="checkout-row-${foto.id}">
                <div class="row-thumb">
                    <img src="${foto.url_preview}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:3px;opacity:0.8">
                </div>
                <div class="row-title">
                    <div style="color:var(--text);font-size:13px">${evento.titulo}</div>
                    <div style="color:var(--text-dim);font-size:11px;margin-top:2px">
                        Foto #${foto.id} · Alta resolución
                        ${esCustom ? '<span style="color:var(--gold);margin-left:6px">★ Precio especial</span>' : ''}
                    </div>
                </div>
                <div class="row-price">$${precio.toLocaleString('es-AR')}</div>
                <button onclick="quitarDelCarritoCheckout(${foto.id})"
                    title="Quitar del carrito"
                    style="background:none;border:none;color:var(--red);cursor:pointer;
                           font-size:14px;padding:4px;flex-shrink:0;opacity:0.7;transition:opacity 0.2s;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;
        }).join('');

        if (nlTipoCompra !== 'individual' && NL_CONFIG) {
            const pp = nlTipoCompra === 'pack_impresion' ? NL_CONFIG.pack_impresion_precio : NL_CONFIG.pack_digital_precio;
            document.getElementById('checkout-total-amount').textContent = `$${pp.toLocaleString('es-AR')} ARS`;
        } else {
            document.getElementById('checkout-total-amount').textContent = `$${total2.toLocaleString('es-AR')} ARS`;
        }
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
    nlTipoCompra = 'individual';
    nlFotosImpresion = [];
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

    const itemsConPrecio = calcularPreciosCarrito();
    const foto_ids       = itemsConPrecio.map(({foto}) => foto.id);
    const precios_custom = {};
    itemsConPrecio.forEach(({foto, precio}) => {
        if (foto.precio_custom) precios_custom[foto.id] = precio;
    });
    const btn      = document.getElementById('checkout-pay-btn');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        const res  = await fetch('/crear-orden', {
            method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ foto_ids, email, nombre, whatsapp, precios_custom, tipo: nlTipoCompra, fotos_impresion_ids: nlFotosImpresion })
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
                `Fotos:${_detalleFotosCarrito()}\n` +
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

// Lista las fotos del carrito agrupadas por evento, para el mensaje a Nacho
function _detalleFotosCarrito(){
    const m=new Map();
    for(const it of carrito.values()){ const t=(it.evento&&it.evento.titulo)?it.evento.titulo:'Galería'; if(!m.has(t))m.set(t,[]); m.get(t).push('#'+it.foto.id); }
    let txt=''; for(const [t,ids] of m) txt+=`\n- ${t}: ${ids.join(', ')}`; return txt;
}

async function coordinarWA() {
    const nombre   = document.getElementById('co-nombre')?.value.trim() || '';
    const email    = document.getElementById('co-email')?.value.trim() || '';
    const whatsapp = (document.getElementById('co-whatsapp')?.value.trim() || '').replace(/[\s+\-().]/g, '');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('co-email')?.focus();
        document.querySelector('.checkout-box')?.classList.add('shake');
        setTimeout(() => document.querySelector('.checkout-box')?.classList.remove('shake'), 500);
        toast('Ingresá un email válido para recibir las fotos', 'error'); return;
    }
    const items = calcularPreciosCarrito();
    const foto_ids = items.map(({foto}) => foto.id);
    const precios_custom = {};
    items.forEach(({foto, precio}) => { if (foto.precio_custom) precios_custom[foto.id] = precio; });
    const count = carrito.size, unitario = getPrecioUnitario(count), total = count * unitario;
    const msg = encodeURIComponent(
        `Hola Nacho! Quiero comprar ${count} foto${count>1?'s':''}.\n` +
        `Fotos:${_detalleFotosCarrito()}\n` +
        `Total: $${total.toLocaleString('es-AR')} ARS\n` +
        `Email: ${email}\n` + (nombre ? `Nombre: ${nombre}\n` : '') + `¿Cómo te puedo pagar?`
    );
    try {
        await fetch('/coordinar-pedido', { method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ foto_ids, email, nombre, whatsapp, precios_custom, tipo: nlTipoCompra, fotos_impresion_ids: nlFotosImpresion }) });
    } catch(e) {}
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
    cerrarCheckout();
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
    _asegurarTabCoordinados();
    _asegurarBarraFiltros();
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

let _comprasCache = [];
// Render de una compra/pedido. esCoordinar=true → botón "Confirmar pago y enviar"
function _itemCompraHTML(p, esCoordinar) {
    const cls = p.estado==='approved'?'badge-approved':p.estado==='rejected'?'badge-rejected':'badge-pendiente';
    const estadoTxt = esCoordinar ? 'a coordinar' : p.estado;
    const emailCls = p.email_enviado ? 'badge-approved' : 'badge-pendiente';
    const copiar = p.link_galeria ? `<button class="admin-action-btn" onclick="navigator.clipboard.writeText('${p.link_galeria}').then(()=>toast('Link copiado','success',1800))"><i class="fa-solid fa-copy"></i> Copiar link galería</button>` : '';
    const accion = esCoordinar
        ? `<button class="admin-action-btn primary" onclick="confirmarPago(${p.id})"><i class="fa-solid fa-circle-check"></i> Confirmar pago y enviar</button>`
        : (p.estado==='approved' ? `<button class="admin-action-btn primary" onclick="reenviarTodo(${p.id})"><i class="fa-solid fa-paper-plane"></i> Reenviar email + WhatsApp</button>` : '');
    return `
            <div class="admin-item" id="compra-${p.id}">
                <div class="admin-item-hdr">
                    <div>
                        <strong>${p.nombre||p.email}</strong>
                        <span class="badge ${cls}">${estadoTxt}</span>
                        <span class="badge ${emailCls}">${p.email_enviado?'✓ Email':'Sin email'}</span>
                        ${p.whatsapp ? `<span class="badge ${p.wa_enviado?'badge-approved':'badge-pendiente'}">${p.wa_enviado?'✓ WhatsApp':'WA pendiente'}</span>` : ''}
                        <br><small style="color:var(--text-dim);font-size:10px">${p.email}${p.whatsapp ? ' · 📱 +' + p.whatsapp : ''}</small>
                        ${(p.eventos&&p.eventos.length) ? `<br><small style="color:var(--text-dim);font-size:10px">📁 ${p.eventos.map(e=>e.titulo).join(' · ')}</small>` : ''}
                        ${p.link_galeria ? `<br><small><a href="${p.link_galeria}" target="_blank" style="color:var(--gold);font-size:10px;word-break:break-all">🔗 ${p.link_galeria}</a></small>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div class="admin-item-date">${p.fecha}</div>
                        <strong style="color:var(--gold);font-size:15px">$${Number(p.total).toLocaleString('es-AR')}</strong>
                    </div>
                </div>
                <div class="admin-item-body">${p.foto_ids.length} foto${p.foto_ids.length>1?'s':''} · IDs: [${p.foto_ids.join(', ')}]</div>
                <div class="admin-item-actions">${accion}${copiar}</div>
            </div>`;
}
// Crea la pestaña "Coordinados" clonando la de Compras (no toca el index.html)
function _asegurarTabCoordinados() {
    if (document.querySelector('.admin-tab[data-tab="coordinados"]')) return;
    const tabC = document.querySelector('.admin-tab[data-tab="compras"]');
    const contC = document.getElementById('tab-compras');
    if (!tabC || !contC) return;
    const tab = tabC.cloneNode(true);
    tab.classList.remove('active');
    tab.setAttribute('data-tab', 'coordinados');
    tab.setAttribute('onclick', "switchAdminTab('coordinados')");
    const ic = tab.querySelector('i'); if (ic) ic.className = 'fa-brands fa-whatsapp';
    const bg = tab.querySelector('[id^="badge-"]'); if (bg) { bg.id = 'badge-coordinados'; bg.textContent = ''; bg.style.display = 'none'; }
    tab.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Coordinados '; });
    tabC.insertAdjacentElement('afterend', tab);
    const cont = document.createElement('div');
    cont.className = contC.className.replace(/\bactive\b/, '').trim();
    cont.id = 'tab-coordinados';
    cont.innerHTML = '<p class="admin-loading">Cargando pedidos...</p>';
    contC.insertAdjacentElement('afterend', cont);
}
// Inyecta la barra de filtros arriba de las pestañas (no toca el index.html)
function _asegurarBarraFiltros() {
    if (document.getElementById('admin-filtros')) return;
    const tab = document.querySelector('.admin-tab[data-tab="compras"]');
    const barraTabs = tab ? tab.parentElement : null;
    if (!barraTabs) return;
    const est = 'background:#1a1812;border:1px solid #3a3527;color:#e8e3d6;padding:7px 10px;border-radius:6px;font-size:13px;outline:none';
    const cont = document.createElement('div');
    cont.id = 'admin-filtros';
    cont.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 0;margin-bottom:4px';
    cont.innerHTML =
        '<input id="filtro-q" type="text" placeholder="Buscar cliente o email..." oninput="_aplicarFiltros()" style="'+est+';flex:1;min-width:150px">' +
        '<select id="filtro-evento" onchange="_aplicarFiltros()" style="'+est+';min-width:150px"><option value="">Todos los eventos</option></select>' +
        '<input id="filtro-desde" type="date" onchange="_aplicarFiltros()" title="Desde" style="'+est+'">' +
        '<input id="filtro-hasta" type="date" onchange="_aplicarFiltros()" title="Hasta" style="'+est+'">' +
        '<button onclick="_limpiarFiltros()" style="background:transparent;border:1px solid #3a3527;color:#b9b09a;padding:7px 12px;border-radius:6px;font-size:13px;cursor:pointer">Limpiar</button>';
    barraTabs.insertAdjacentElement('beforebegin', cont);
}
// Aplica los filtros sobre la cache y re-pinta Compras + Coordinados
function _aplicarFiltros() {
    const q = (document.getElementById('filtro-q')?.value || '').toLowerCase().trim();
    const ev = document.getElementById('filtro-evento')?.value || '';
    const desde = document.getElementById('filtro-desde')?.value || '';
    const hasta = document.getElementById('filtro-hasta')?.value || '';
    const pasa = (c) => {
        if (q && !(((c.nombre||'')+' '+(c.email||'')).toLowerCase().includes(q))) return false;
        if (ev && !(c.eventos||[]).some(e => String(e.id) === ev)) return false;
        if (desde && c.fecha_iso && c.fecha_iso < desde) return false;
        if (hasta && c.fecha_iso && c.fecha_iso > hasta) return false;
        return true;
    };
    const lista = _comprasCache.filter(pasa);
    const conf = lista.filter(p => p.estado !== 'coordinar');
    const coord = lista.filter(p => p.estado === 'coordinar');
    const elC = document.getElementById('tab-compras');
    const elW = document.getElementById('tab-coordinados');
    if (elC) elC.innerHTML = conf.length ? conf.map(p=>_itemCompraHTML(p,false)).join('') : '<p class="admin-loading">Sin resultados.</p>';
    if (elW) elW.innerHTML = coord.length ? coord.map(p=>_itemCompraHTML(p,true)).join('') : '<p class="admin-loading">Sin pedidos a coordinar.</p>';
    const bw = document.getElementById('badge-coordinados');
    if (bw) { const n = _comprasCache.filter(p=>p.estado==='coordinar').length; if (n){bw.textContent=n;bw.style.display='inline-flex';} else bw.style.display='none'; }
}
function _limpiarFiltros() {
    ['filtro-q','filtro-desde','filtro-hasta'].forEach(id => { const el=document.getElementById(id); if (el) el.value=''; });
    const sel=document.getElementById('filtro-evento'); if (sel) sel.value='';
    _aplicarFiltros();
}

async function cargarCompras() {
    const elC = document.getElementById('tab-compras');
    if (!elC) return;
    elC.innerHTML = '<p class="admin-loading">Cargando compras...</p>';
    try {
        _comprasCache = await (await fetch('/admin/compras', { credentials:'include' })).json();
        const sel = document.getElementById('filtro-evento');
        if (sel) {
            const vistos = new Map();
            _comprasCache.forEach(c => (c.eventos||[]).forEach(e => vistos.set(String(e.id), e.titulo)));
            const actual = sel.value;
            sel.innerHTML = '<option value="">Todos los eventos</option>' +
                [...vistos.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,t]) => `<option value="${id}">${t}</option>`).join('');
            sel.value = actual;
        }
        _aplicarFiltros();
    } catch { elC.innerHTML = '<p class="admin-loading" style="color:var(--red)">Error al cargar.</p>'; }
}

async function reenviarTodo(id) {
    const btn = event.target.closest('.admin-action-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
    const res  = await fetch(`/admin/compras/${id}/reenviar`, { method:'POST', credentials:'include' });
    const data = await res.json();
    toast(data.ok ? '✓ Email y WhatsApp reenviados' : 'Error al reenviar', data.ok ? 'success' : 'error');
    if (data.ok) setTimeout(cargarCompras, 1500);
}

async function confirmarPago(id) {
    const btn = (typeof event !== 'undefined' && event && event.target) ? event.target.closest('.admin-action-btn') : null;
    const r = await Swal.fire({ icon:'question', title:'¿Confirmar el pago?', text:'Se le enviarán las fotos al cliente por email y WhatsApp.',
        showCancelButton:true, confirmButtonText:'Sí, enviar fotos', cancelButtonText:'Cancelar',
        background:'var(--ink-2)', color:'var(--text)', confirmButtonColor:'#25D366', cancelButtonColor:'#333' });
    if (!r.isConfirmed) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
    try {
        const res = await fetch(`/admin/compras/${id}/confirmar`, { method:'POST', credentials:'include' });
        const data = await res.json();
        toast(data.ok ? '✓ Pago confirmado, fotos enviadas' : 'Error al confirmar', data.ok ? 'success' : 'error');
        if (data.ok) setTimeout(cargarCompras, 1500);
    } catch {
        toast('Error al confirmar el pago', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirmar pago y enviar'; }
    }
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
                <div class="search-result-precio">$${Number(f.precio||3200).toLocaleString('es-AR')} ARS</div>
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


// ═══════════════════════════════════════════════════════════════════════════
//  MÓDULO PACK JUGADOR (cara al cliente)
// ═══════════════════════════════════════════════════════════════════════════

// CTA destacado en la galería (req 3.2): "opción recomendada"
function packWhatsApp(tipo) {
    const msg = tipo === 'impresion'
        ? 'Hola Nacho! Quiero el Pack Jugador + 2 impresiones 13x18 ($30.000). ¿Cómo coordino la compra?'
        : 'Hola Nacho! Quiero el Pack Jugador ($25.000). ¿Cómo coordino la compra?';
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

function renderPackCTA(ev) {
    const fotos = (ev.fotos || []);
    if (!fotos.length) return '';                 // sin fotos no tiene sentido
    if (NL_CONFIG && !NL_CONFIG.pack_digital_activo && !NL_CONFIG.pack_impresion_activo) return '';

    const pDig = NL_CONFIG ? NL_CONFIG.pack_digital_precio   : 20000;
    const pImp = NL_CONFIG ? NL_CONFIG.pack_impresion_precio : 25000;
    const digActivo = !NL_CONFIG || NL_CONFIG.pack_digital_activo;
    const impActivo = !NL_CONFIG || NL_CONFIG.pack_impresion_activo;

    const btnDig = digActivo ? `
        <button onclick="comprarConPack('pack_digital')" style="flex:1; display:flex; align-items:center; justify-content:space-between; padding:12px 20px; background:rgba(212,168,67,0.1); border:1px solid var(--gold-dim); border-radius:6px; color:var(--text); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.background='rgba(212,168,67,0.2)'" onmouseout="this.style.background='rgba(212,168,67,0.1)'">
            <div style="display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-layer-group" style="color:var(--gold); font-size:16px;"></i>
                <span style="font-size:13px; font-weight:600; letter-spacing:0.5px;">Pack Jugador</span>
            </div>
            <strong style="color:var(--gold); font-size:16px;">$${pDig.toLocaleString('es-AR')}</strong>
        </button>` : '';

    const btnImp = impActivo ? `
        <button onclick="comprarConPack('pack_impresion')" style="flex:1; display:flex; align-items:center; justify-content:space-between; padding:12px 20px; background:rgba(212,168,67,0.1); border:1px solid var(--gold-dim); border-radius:6px; color:var(--text); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.background='rgba(212,168,67,0.2)'" onmouseout="this.style.background='rgba(212,168,67,0.1)'">
            <div style="display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-print" style="color:var(--gold); font-size:16px;"></i>
                <span style="font-size:13px; font-weight:600; letter-spacing:0.5px;">Pack Jugador + 2 impres. 13x18</span>
            </div>
            <strong style="color:var(--gold); font-size:16px;">$${pImp.toLocaleString('es-AR')}</strong>
        </button>` : '';

    return `
    <div class="pack-cta-wrap" style="margin:0 8% 18px; display:flex; gap:14px; flex-wrap:wrap;">
        ${btnDig}
        ${btnImp}
    </div>`;
}

// Compra agrupada: usa las fotos que ya están en el carrito como contenido del pack
function comprarConPack(tipo) {
    if (!carrito.size) {
        toast('Primero marcá las fotos de tu hijo/a con el ícono del carrito', 'info', 2600);
        return;
    }
    if (tipo === 'pack_impresion') { abrirSelectorImpresiones(); return; }
    nlFotosImpresion = [];
    abrirCheckout('pack_digital');
    aplicarBannerPackCheckout();
}

// Banner informativo arriba del resumen del checkout cuando es un pack
function aplicarBannerPackCheckout() {
    const resumen = document.getElementById('checkout-resumen');
    if (!resumen || resumen.querySelector('.pack-checkout-banner')) return;
    const nombre = nlTipoCompra === 'pack_impresion'
        ? 'Pack Jugador + 2 impresiones 13x18'
        : 'Pack Jugador Digital';
    const extra = nlTipoCompra === 'pack_impresion'
        ? `<div style="color:var(--text-dim);font-size:11px;margin-top:4px;">Imprimís 2 fotos a elección · el resto en digital</div>` : '';
    const banner = document.createElement('div');
    banner.className = 'pack-checkout-banner';
    banner.style = 'padding:12px 14px;margin-bottom:12px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(212,168,67,0.08);';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;color:var(--gold);font-weight:600;font-size:14px;">
            <i class="fa-solid fa-layer-group"></i> ${nombre}
        </div>
        <div style="color:var(--text-dim);font-size:12px;margin-top:4px;">
            ${carrito.size} foto${carrito.size>1?'s':''} incluida${carrito.size>1?'s':''} en el pack
        </div>${extra}`;
    resumen.prepend(banner);
}

// Selector obligatorio de 2 fotos para imprimir (req 3.3)
async function abrirSelectorImpresiones() {
    if (carrito.size < 2) {
        toast('Para este pack necesitás al menos 2 fotos en el carrito', 'info', 2800);
        return;
    }
    const items = [...carrito.values()];
    const grid = items.map(({foto}) => `
        <div class="imp-pick" data-id="${foto.id}" onclick="toggleImpresion(${foto.id}, this)"
             style="position:relative;cursor:pointer;border:2px solid transparent;border-radius:6px;overflow:hidden;">
            <img src="${foto.url_preview}" style="width:100%;height:90px;object-fit:cover;display:block;opacity:0.85;">
            <div class="imp-check" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
                 background:var(--gold);color:#000;display:none;align-items:center;justify-content:center;font-size:11px;">
                <i class="fa-solid fa-check"></i>
            </div>
        </div>`).join('');

    nlFotosImpresion = [];
    await Swal.fire({
        title: 'Elegí 2 fotos para imprimir',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `<p style="color:#999;font-size:13px;margin-bottom:12px;">Las 2 que marques se imprimen en 13x18. El resto va en digital.</p>
               <div id="imp-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:300px;overflow:auto;">${grid}</div>`,
        showCancelButton: true,
        confirmButtonText: 'Continuar al pago',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            if (nlFotosImpresion.length !== 2) {
                Swal.showValidationMessage('Tenés que elegir exactamente 2 fotos');
                return false;
            }
            return true;
        }
    }).then(res => {
        if (res.isConfirmed) {
            abrirCheckout('pack_impresion');
            aplicarBannerPackCheckout();
        } else {
            nlFotosImpresion = [];
        }
    });
}

function toggleImpresion(fotoId, el) {
    const check = el.querySelector('.imp-check');
    const i = nlFotosImpresion.indexOf(fotoId);
    if (i >= 0) {
        nlFotosImpresion.splice(i, 1);
        el.style.borderColor = 'transparent';
        if (check) check.style.display = 'none';
    } else {
        if (nlFotosImpresion.length >= 2) {
            toast('Solo 2 fotos para imprimir', 'info', 1500);
            return;
        }
        nlFotosImpresion.push(fotoId);
        el.style.borderColor = 'var(--gold)';
        if (check) check.style.display = 'flex';
    }
}

// Upsell dinámico (req 3.2): sugerir el pack cuando se acerca al precio
async function chequearUpsell() {
    if (!NL_CONFIG || !NL_CONFIG.pack_digital_activo) return;
    const n = carrito.size;
    if (n === 0) { nlUpsellMostrado = false; return; }
    if (nlUpsellMostrado) return;
    if (n < (NL_CONFIG.upsell_trigger_qty || 6)) return;

    const totalActual = calcularTotalCarrito();
    const pack = NL_CONFIG.pack_digital_precio;
    if (totalActual < pack) return;   // solo si ya conviene el pack

    nlUpsellMostrado = true;
    const { isConfirmed } = await Swal.fire({
        icon: 'info',
        title: '¡Estás a un paso del Pack!',
        html: `<p style="color:#999;font-size:14px;line-height:1.7;">
                 Llevás <strong style="color:#fff">${n} fotos</strong> por
                 <strong style="color:#fff">$${totalActual.toLocaleString('es-AR')}</strong>.<br>
                 Con el <strong style="color:var(--gold)">Pack Jugador</strong> te llevás
                 <strong style="color:#fff">TODAS las que elijas</strong> por
                 <strong style="color:var(--gold)">$${pack.toLocaleString('es-AR')}</strong>.
               </p>`,
        background: 'var(--ink-2)', color: 'var(--text)',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-layer-group"></i>&nbsp; Quiero el Pack',
        cancelButtonText: 'Seguir eligiendo',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#333'
    });
    if (isConfirmed) { abrirCheckout('pack_digital'); aplicarBannerPackCheckout(); }
}

// Enganche del upsell: envolver actualizarCarritoBar sin tocar el original
const _nl_actualizarCarritoBar = actualizarCarritoBar;
actualizarCarritoBar = function () {
    _nl_actualizarCarritoBar();
    chequearUpsell();
};

// ── Re-aplicar marca de agua a todas las fotos existentes (panel admin) ──────
async function reAplicarWatermark() {
    const btn = document.getElementById('btn-rewatermark');
    const { isConfirmed } = await Swal.fire({
        title: '¿Re-aplicar marca de agua?', icon: 'warning',
        html: '<p style="color:#999;font-size:14px;line-height:1.6;">Se re-procesan <b>TODAS</b> las fotos con la marca actual. Puede tardar varios segundos.</p>',
        showCancelButton: true,
        confirmButtonText: 'Sí, aplicar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;

    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...'; }

    try {
        const res = await fetch('/admin/re-watermark', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error del servidor');
        await Swal.fire({
            icon: data.fallidas > 0 ? 'info' : 'success',
            title: 'Marca de agua aplicada',
            html: `<div style="color:#999;font-size:14px;line-height:1.8;">
                     <b style="color:#D4A843">${data.ok}</b> fotos re-procesadas<br>
                     ${data.fallidas ? `<b style="color:#e57">${data.fallidas}</b> fallaron<br>` : ''}
                     ${data.saltadas ? `<b>${data.saltadas}</b> saltadas<br>` : ''}
                     <span style="color:#666">Total: ${data.total}</span></div>`,
            background: 'var(--ink-2)', color: 'var(--text)',
            confirmButtonText: 'Recargar', confirmButtonColor: '#D4A843'
        });
        location.reload();
    } catch (e) {
        await Swal.fire({
            icon: 'error', title: 'Error', text: e.message || 'No se pudo completar',
            background: 'var(--ink-2)', color: 'var(--text)', confirmButtonColor: '#D4A843'
        });
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = orig; }
    }
}

/* ─── REDISEÑO: barra de progreso de scroll + menú mobile ────────────────────── */
(function () {
    const prog = document.getElementById('scroll-progress');
    if (prog) {
        const upd = () => {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            prog.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%';
        };
        window.addEventListener('scroll', upd, { passive: true });
        window.addEventListener('resize', upd);
        upd();
    }
    const burger = document.getElementById('nav-burger');
    const ov     = document.getElementById('mobile-overlay');
    const cerrar = () => document.body.classList.remove('menu-open');
    if (burger) burger.addEventListener('click', () => document.body.classList.toggle('menu-open'));
    if (ov)     ov.addEventListener('click', cerrar);
    document.querySelectorAll('#mobile-menu a').forEach(a => a.addEventListener('click', cerrar));
    window.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
})();

function initHeroParallax() {
    const heroBg = document.getElementById('hero-bg');
    if (!heroBg) return;
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        // Solo calcular el parallax si el hero está visible (mejora rendimiento)
        if (scrolled <= window.innerHeight) {
            heroBg.style.transform = `translateY(${scrolled * 0.4}px)`;
        }
    }, { passive: true });
}