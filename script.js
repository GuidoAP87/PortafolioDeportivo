/* ═══════════════════════════════════════════════════════════════
   NACHO LINGUA FOTOGRAFÍA — SPORTS PHOTO MARKETPLACE 2026
   ═══════════════════════════════════════════════════════════════
   ACCESO ADMIN:
   • Clic 3 veces sobre el "·" en el footer
   • O presioná Ctrl + Shift + A en cualquier momento
   ═══════════════════════════════════════════════════════════════ */

// ⚠ CONFIGURACIÓN — cambiá antes de publicar
const WA_NUMBER   = '5493510000000';   // Tu número de WhatsApp real
const PRECIO_BASE = 3500;              // Precio por foto en ARS

// ─── ESTADO GLOBAL ───────────────────────────────────────────────────────────
let eventosData     = [];
let eventoActual    = null;
let carrito         = new Map();   // fotoId → { foto, evento }
let isAdmin         = false;
let lbFotos         = [];
let lbIdx           = 0;
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

    document.getElementById('btn-admin-panel')?.addEventListener('click', abrirAdminPanel);
    document.getElementById('btn-add-evento')?.addEventListener('click', crearEvento);
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Cerrar modals al clic en el fondo
    ['checkout-modal', 'admin-modal', 'login-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'checkout-modal') cerrarCheckout();
                if (id === 'admin-modal')    cerrarAdminPanel();
                if (id === 'login-modal')    cerrarLoginModal();
            }
        });
    });

    // Actualizar link WhatsApp flotante
    const waBtn = document.getElementById('whatsapp-btn');
    if (waBtn) waBtn.href = `https://wa.me/${WA_NUMBER}`;

    setTimeout(() => document.getElementById('loading-screen')?.classList.add('hidden'), 1300);
});

// ─── ADMIN TRIGGERS ───────────────────────────────────────────────────────────
function initAdminTriggers() {
    // Clic triple en el "·" del footer
    document.getElementById('admin-trigger')?.addEventListener('click', () => {
        adminClicks++;
        clearTimeout(adminClickTimer);
        if (adminClicks >= 3) {
            adminClicks = 0;
            isAdmin ? abrirAdminPanel() : abrirLoginModal();
        }
        adminClickTimer = setTimeout(() => { adminClicks = 0; }, 1400);
    });
    // Ctrl + Shift + A
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            isAdmin ? abrirAdminPanel() : abrirLoginModal();
        }
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
    ['btn-admin-panel', 'btn-add-evento', 'btn-logout'].forEach(id => {
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
    const ids   = ['hero', 'portfolio', 'about'];
    const links = document.querySelectorAll('.nav-link[href^="#"]');
    ids.forEach(id => {
        const el = document.getElementById(id);
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
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function initStatsCounter() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const el     = e.target;
            el.closest('.stat-item')?.classList.add('visible');
            const target = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            let cur = 0;
            const step  = Math.ceil(target / 55);
            const timer = setInterval(() => {
                cur += step;
                if (cur >= target) { cur = target; clearInterval(timer); }
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
    window.addEventListener('scroll', () =>
        btn.classList.toggle('visible', window.scrollY > 500), { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ─── EVENTOS: CARGA ───────────────────────────────────────────────────────────
async function cargarEventos() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state">Cargando galerías...</div>';
    try {
        eventosData = await (await fetch('/obtener-eventos')).json();
        renderEventos();
    } catch {
        grid.innerHTML = '<div class="empty-state">Error al cargar las galerías.</div>';
    }
}

function renderEventos(filtro = 'all') {
    const grid = document.getElementById('gallery-grid');
    const data = filtro === 'all'
        ? eventosData
        : eventosData.filter(e =>
            e.deporte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === filtro
          );

    if (!data.length) {
        grid.innerHTML = '<div class="empty-state">No hay eventos en esta categoría aún.</div>';
        return;
    }

    grid.innerHTML = data.map((ev, i) => {
        const cover = ev.fotos?.[0]?.url_preview
            || 'https://placehold.co/800x600/0c0c12/1c1c24?text=Sin+fotos';
        const count = ev.fotos?.length ?? 0;
        const delay = Math.min(i * 0.07, 0.5);
        return `
        <div class="event-card reveal" style="transition-delay:${delay}s"
             onclick="abrirEvento(${ev.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')abrirEvento(${ev.id})">
            <img class="event-card-img" src="${cover}" alt="${ev.titulo}" loading="lazy">
            <div class="event-card-overlay">
                <div class="event-card-sport">${ev.deporte}</div>
                <div class="event-card-title">${ev.titulo}</div>
                <div class="event-card-meta">
                    ${ev.fecha ? `<span><i class="fa-regular fa-calendar" style="margin-right:5px"></i>${ev.fecha}</span>` : ''}
                    <span class="event-card-count">${count} foto${count !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="event-card-enter">
                <div class="event-card-enter-btn">Explorar galería →</div>
            </div>
        </div>`;
    }).join('');

    initReveal();
    configurarFiltros();
}

// ─── FILTROS ─────────────────────────────────────────────────────────────────
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
    eventoActual = ev;
    lbFotos      = ev.fotos || [];

    document.getElementById('portfolio').style.display  = 'none';
    document.getElementById('about').style.display      = 'none';
    const view = document.getElementById('event-view');
    view.style.display = 'block';

    // Admin: zona de subida
    const adminUpload = isAdmin ? `
        <div class="admin-upload-bar">
            <form class="upload-zone" id="upload-form-${ev.id}" onsubmit="subirFotos(event,${ev.id})">
                <label style="cursor:pointer;display:flex;align-items:center;gap:14px;width:100%">
                    <span class="upload-zone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>
                    <span>
                        <div class="upload-zone-text" id="upload-label-${ev.id}">Subir fotos al evento</div>
                        <div class="upload-zone-sub">Múltiples archivos · Sube el original + preview con marca de agua automáticamente</div>
                    </span>
                    <input type="file" name="foto" accept="image/*" multiple
                        onchange="this.form.dispatchEvent(new Event('submit'))" hidden>
                </label>
            </form>
            <button onclick="borrarEvento(${ev.id})"
                style="height:68px;padding:0 20px;border:1px solid rgba(232,64,64,0.3);
                       color:var(--red);font-size:11px;letter-spacing:1px;cursor:pointer;
                       text-transform:uppercase;transition:0.3s;white-space:nowrap;background:none;
                       font-family:Inter,sans-serif;"
                onmouseover="this.style.background='rgba(232,64,64,0.07)'"
                onmouseout="this.style.background='none'">
                <i class="fa-solid fa-trash" style="display:block;margin-bottom:4px;font-size:14px"></i>
                Borrar evento
            </button>
        </div>
        <div class="upload-progress-wrap" id="uprogress-${ev.id}">
            <div class="upload-progress-bar" id="upbar-${ev.id}"></div>
        </div>` : '';

    // Grid de fotos
    const fotosHTML = lbFotos.length
        ? lbFotos.map((f, idx) => {
            const sel = carrito.has(f.id);
            return `
            <div class="photo-item${sel ? ' selected' : ''}" id="photo-${f.id}"
                 onclick="toggleFoto(${f.id})"
                 ondblclick="abrirLightbox(${idx})"
                 title="Clic para seleccionar · Doble clic para ampliar">
                <img src="${f.url_preview}" alt="Fotografía deportiva" loading="lazy">
                <div class="photo-item-overlay">
                    <div class="photo-select-icon">
                        <i class="fa-solid ${sel ? 'fa-check' : 'fa-cart-shopping'}"></i>
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
               Aún no hay fotos en este evento.
           </div>`;

    view.innerHTML = `
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
                    <div class="price-badge">
                        $${PRECIO_BASE.toLocaleString('es-AR')} <span>ARS / foto</span>
                    </div>
                </div>
            </div>
            <div class="selection-info">
                <i class="fa-solid fa-circle-info"></i>
                <span>
                    <strong>Clic</strong> en una foto para seleccionarla ·
                    <strong>Doble clic</strong> para ampliarla ·
                    Seleccioná las que querés y comprá todas juntas
                </span>
            </div>
        </div>
        ${adminUpload}
        <div class="photos-grid">${fotosHTML}</div>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    actualizarCarritoBar();
}

function cerrarEvento() {
    eventoActual = null;
    document.getElementById('event-view').style.display = 'none';
    document.getElementById('portfolio').style.removeProperty('display');
    document.getElementById('about').style.removeProperty('display');
    window.scrollTo({ top: document.getElementById('portfolio').offsetTop - 68, behavior: 'smooth' });
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
    } else {
        carrito.set(fotoId, { foto, evento: eventoActual });
        el?.classList.add('selected');
        if (icon) icon.className = 'fa-solid fa-check';
        el?.animate([
            { transform: 'scale(0.97)' },
            { transform: 'scale(1.02)' },
            { transform: 'scale(1)' }
        ], { duration: 240, easing: 'ease' });
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
}

// ─── CARRITO BAR ──────────────────────────────────────────────────────────────
function actualizarCarritoBar() {
    const count = carrito.size;
    const total = [...carrito.values()].reduce((s, { foto }) => s + foto.precio, 0);
    const bar   = document.getElementById('cart-bar');
    if (!bar) return;

    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = `$${total.toLocaleString('es-AR')} ARS`;
    bar.classList.toggle('visible', count > 0);

    // Actualizar botón del lightbox si está abierto
    if (document.getElementById('lightbox')?.classList.contains('open')) {
        const fid   = lbFotos[lbIdx]?.id;
        const lbBtn = document.getElementById('lb-cart-btn');
        if (lbBtn && fid !== undefined) {
            const inCart    = carrito.has(fid);
            lbBtn.textContent = inCart ? '✓ En el carrito' : '+ Agregar al carrito';
            lbBtn.className   = `lb-cart-btn${inCart ? ' in-cart' : ''}`;
        }
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
    const counter = document.getElementById('lb-counter');
    if (counter) counter.textContent = lbFotos.length > 1 ? `${lbIdx + 1} / ${lbFotos.length}` : '';
    const inCart  = carrito.has(foto.id);
    const lbBtn   = document.getElementById('lb-cart-btn');
    if (lbBtn) {
        lbBtn.textContent = inCart ? '✓ En el carrito' : '+ Agregar al carrito';
        lbBtn.className   = `lb-cart-btn${inCart ? ' in-cart' : ''}`;
    }
    const showNav = lbFotos.length > 1;
    document.getElementById('lb-prev').style.opacity = showNav ? '1' : '0';
    document.getElementById('lb-next').style.opacity = showNav ? '1' : '0';
}
function cerrarLightbox() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open');
    setTimeout(() => { lb.style.display = 'none'; }, 280);
    document.body.style.overflow = '';
}
function lbPrev() { lbIdx = (lbIdx - 1 + lbFotos.length) % lbFotos.length; mostrarLbFoto(); }
function lbNext() { lbIdx = (lbIdx + 1) % lbFotos.length; mostrarLbFoto(); }
function lbToggleCart() {
    const foto = lbFotos[lbIdx];
    if (foto) { toggleFoto(foto.id); mostrarLbFoto(); }
}
function initLightboxKB() {
    document.addEventListener('keydown', e => {
        if (!document.getElementById('lightbox')?.classList.contains('open')) return;
        if (e.key === 'Escape')     cerrarLightbox();
        if (e.key === 'ArrowLeft')  lbPrev();
        if (e.key === 'ArrowRight') lbNext();
    });
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
function abrirCheckout() {
    if (!carrito.size) return;
    const items = [...carrito.values()];
    const total = items.reduce((s, { foto }) => s + foto.precio, 0);

    document.getElementById('checkout-resumen').innerHTML = items.map(({ foto, evento }) => `
        <div class="checkout-summary-row">
            <span>
                <span style="color:var(--text);font-size:12px">${evento.titulo}</span><br>
                <span style="color:var(--text-dim);font-size:11px">Foto #${foto.id} · Alta resolución</span>
            </span>
            <span style="color:var(--gold);font-weight:600">
                $${Number(foto.precio).toLocaleString('es-AR')}
            </span>
        </div>`).join('');

    document.getElementById('checkout-total-amount').textContent =
        `$${total.toLocaleString('es-AR')} ARS`;

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
        return;
    }

    const foto_ids = [...carrito.keys()];
    const btn      = document.getElementById('checkout-pay-btn');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        const res  = await fetch('/crear-orden', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foto_ids, email, nombre })
        });
        const data = await res.json();

        if (res.ok && data.init_point) {
            window.location.href = data.init_point;
            return;
        }

        // MP no configurado → fallback WhatsApp
        if (data.error === 'mp_no_configurado' || res.status === 503) {
            cerrarCheckout();
            const total = [...carrito.values()].reduce((s, { foto }) => s + foto.precio, 0);
            const msg   = encodeURIComponent(
                `Hola Nacho! Quiero comprar ${foto_ids.length} foto${foto_ids.length > 1 ? 's' : ''}.\n` +
                `Total: $${total.toLocaleString('es-AR')} ARS\n` +
                `Mi email para recibir las fotos: ${email}\n` +
                `¿Cómo te puedo pagar?`
            );
            const { isConfirmed } = await Swal.fire({
                icon: 'info', title: 'Coordinar por WhatsApp',
                html: `<p style="color:#999;font-size:14px;line-height:1.8">
                    El sistema de pago online se está configurando.<br>
                    Podés coordinar directamente con Nacho — te responde en minutos.
                </p>`,
                background: 'var(--ink-2)', color: 'var(--text)',
                confirmButtonText: '<i class="fa-brands fa-whatsapp"></i>&nbsp; Ir a WhatsApp',
                cancelButtonText: 'Cerrar', showCancelButton: true,
                confirmButtonColor: '#25D366', cancelButtonColor: '#333'
            });
            if (isConfirmed) window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
        } else {
            throw new Error(data.error || 'Error desconocido');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error', title: 'Error al procesar',
            html: `<p style="color:#999;font-size:14px">
                Intentá de nuevo o <a href="https://wa.me/${WA_NUMBER}" target="_blank"
                style="color:var(--gold)">contactanos por WhatsApp</a>.
            </p>`,
            background: 'var(--ink-2)', color: 'var(--text)', confirmButtonColor: '#D4A843'
        });
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Pagar con MercadoPago';
    }
}

// Botón WhatsApp manual desde checkout
function coordinarWA() {
    const nombre = document.getElementById('co-nombre')?.value.trim() || '';
    const email  = document.getElementById('co-email')?.value.trim() || '';
    const count  = carrito.size;
    const total  = [...carrito.values()].reduce((s, { foto }) => s + foto.precio, 0);
    const msg    = encodeURIComponent(
        `Hola Nacho! Quiero comprar ${count} foto${count > 1 ? 's' : ''}.\n` +
        `Total: $${total.toLocaleString('es-AR')} ARS\n` +
        (email  ? `Email para recibir las fotos: ${email}\n`  : '') +
        (nombre ? `Nombre: ${nombre}\n` : '') +
        `¿Cómo te puedo pagar?`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
}

// ─── CREAR EVENTO ─────────────────────────────────────────────────────────────
async function crearEvento() {
    const { value: vals } = await Swal.fire({
        title: 'Nuevo Evento',
        background: 'var(--ink-2)', color: 'var(--text)',
        html: `
            <input id="ev-titulo" class="swal2-input" placeholder="Título del evento"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <select id="ev-deporte"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;padding:13px;margin:0 auto 10px;display:block;font-size:14px;
                       font-family:Inter,sans-serif;">
                <option value="" disabled selected>Deporte...</option>
                <option value="Fútbol">⚽ Fútbol</option>
                <option value="Básquet">🏀 Básquet</option>
                <option value="Otro">📷 Otro</option>
            </select>
            <input id="ev-fecha" type="date" class="swal2-input"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;margin-bottom:10px;font-family:Inter,sans-serif;">
            <input id="ev-desc" class="swal2-input" placeholder="Descripción breve (opcional)"
                style="background:var(--ink-4);color:var(--text);border:1px solid var(--ink-5);
                       width:88%;font-family:Inter,sans-serif;">`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: 'Crear evento', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#D4A843', cancelButtonColor: '#555',
        preConfirm: () => {
            const titulo  = document.getElementById('ev-titulo').value.trim();
            const deporte = document.getElementById('ev-deporte').value;
            const fecha   = document.getElementById('ev-fecha').value;
            const desc    = document.getElementById('ev-desc').value.trim();
            if (!titulo || !deporte) {
                Swal.showValidationMessage('El título y el deporte son requeridos');
                return false;
            }
            return { titulo, deporte, fecha, descripcion: desc };
        }
    });
    if (!vals) return;

    const res = await fetch('/crear-evento', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vals)
    });
    if (res.ok) {
        await cargarEventos();
        Swal.fire({
            icon: 'success', title: '¡Evento creado!',
            text: 'Ya podés subir fotos desde la vista del evento.',
            timer: 2500, showConfirmButton: false,
            background: 'var(--ink-2)', color: 'var(--text)'
        });
    } else {
        Swal.fire({ icon: 'error', title: 'Error al crear', background: 'var(--ink-2)', color: 'var(--text)' });
    }
}

// ─── SUBIR FOTOS ─────────────────────────────────────────────────────────────
async function subirFotos(event, eventoId) {
    event.preventDefault();
    const input = event.target.querySelector('input[type="file"]');
    if (!input?.files.length) return;

    const files    = Array.from(input.files);
    const progWrap = document.getElementById(`uprogress-${eventoId}`);
    const progBar  = document.getElementById(`upbar-${eventoId}`);
    const label    = document.getElementById(`upload-label-${eventoId}`);

    if (progWrap) progWrap.style.display = 'block';
    let exitosas = 0;

    for (let i = 0; i < files.length; i++) {
        if (label) label.textContent = `Subiendo ${i + 1} de ${files.length}...`;
        if (progBar) progBar.style.width = `${(i / files.length) * 100}%`;

        const fd = new FormData();
        fd.append('foto',      files[i]);
        fd.append('evento_id', eventoId);
        fd.append('precio',    PRECIO_BASE);

        try {
            const res = await fetch('/subir-foto', { method: 'POST', body: fd, credentials: 'include' });
            if (res.ok) exitosas++;
        } catch {}

        if (progBar) progBar.style.width = `${((i + 1) / files.length) * 100}%`;
    }

    setTimeout(() => {
        if (progWrap) progWrap.style.display = 'none';
        if (progBar) progBar.style.width = '0';
    }, 800);
    event.target.reset();
    if (label) label.textContent = 'Subir fotos al evento';

    if (exitosas > 0) {
        await cargarEventos();
        abrirEvento(eventoId);
        Swal.fire({
            icon: 'success',
            title: `${exitosas} foto${exitosas > 1 ? 's' : ''} subida${exitosas > 1 ? 's' : ''}`,
            text: `${exitosas === files.length ? 'Todo listo' : `${exitosas} de ${files.length} subidas`}. Ya están disponibles en la galería.`,
            timer: 2800, showConfirmButton: false,
            background: 'var(--ink-2)', color: 'var(--text)'
        });
    } else {
        Swal.fire({
            icon: 'error', title: 'Error al subir',
            text: 'Verificá la conexión e intentá de nuevo.',
            background: 'var(--ink-2)', color: 'var(--text)', confirmButtonColor: '#D4A843'
        });
    }
}

// ─── BORRAR EVENTO ────────────────────────────────────────────────────────────
async function borrarEvento(id) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Borrar este evento?',
        html: '<p style="color:#999;font-size:14px">Se eliminarán el evento y <strong style="color:var(--red)">todas sus fotos</strong> permanentemente.</p>',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Sí, borrar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e84040', cancelButtonColor: '#555',
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (!isConfirmed) return;

    const res = await fetch(`/borrar-evento/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Evento eliminado', timer: 1800, showConfirmButton: false, background: 'var(--ink-2)', color: 'var(--text)' });
        cerrarEvento();
        await cargarEventos();
    } else {
        Swal.fire({ icon: 'error', title: 'Error al borrar', background: 'var(--ink-2)', color: 'var(--text)' });
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

    const res = await fetch(`/borrar-foto/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
        document.getElementById(`photo-${id}`)?.remove();
        if (carrito.has(id)) { carrito.delete(id); actualizarCarritoBar(); }
        if (eventoActual) {
            eventoActual.fotos = eventoActual.fotos.filter(f => f.id !== id);
            lbFotos = eventoActual.fotos;
        }
    }
}

// ─── LOGIN MODAL ──────────────────────────────────────────────────────────────
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
    if (inp.type === 'password') { inp.type = 'text';     icon.className = 'fa-solid fa-eye-slash'; }
    else                         { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass }),
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            isAdmin = true;
            toggleAdminUI(true);
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Acceso concedido';
            setTimeout(() => {
                cerrarLoginModal();
                btn.disabled  = false;
                btn.innerHTML = 'Ingresar';
                setTimeout(abrirAdminPanel, 400);
            }, 700);
        } else {
            errEl.style.display = 'flex';
            btn.disabled  = false;
            btn.innerHTML = 'Ingresar';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            document.querySelector('.login-box')?.classList.add('shake');
            setTimeout(() => document.querySelector('.login-box')?.classList.remove('shake'), 500);
        }
    } catch {
        errEl.style.display = 'flex';
        btn.disabled  = false;
        btn.innerHTML = 'Ingresar';
    }
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
async function abrirAdminPanel() {
    const m = document.getElementById('admin-modal');
    m.style.display = 'flex';
    requestAnimationFrame(() => m.classList.add('open'));
    document.body.style.overflow = 'hidden';
    await Promise.all([cargarCompras(), cargarConsultas()]);
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

async function cargarCompras() {
    const c = document.getElementById('tab-compras');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Cargando...</p>';
    try {
        const lista = await (await fetch('/admin/compras', { credentials: 'include' })).json();
        const pendEmail = lista.filter(p => p.estado === 'approved' && !p.email_enviado).length;
        const badge = document.getElementById('badge-compras');
        if (badge) { badge.textContent = pendEmail; badge.style.display = pendEmail > 0 ? 'inline-flex' : 'none'; }

        c.innerHTML = lista.length ? lista.map(p => {
            const cls      = p.estado === 'approved' ? 'badge-approved' : p.estado === 'rejected' ? 'badge-rejected' : 'badge-pendiente';
            const emailCls = p.email_enviado ? 'badge-approved' : 'badge-pendiente';
            return `
            <div class="admin-item" id="compra-${p.id}">
                <div class="admin-item-hdr">
                    <div>
                        <strong>${p.nombre || p.email}</strong>
                        <span class="badge ${cls}">${p.estado}</span>
                        <span class="badge ${emailCls}">${p.email_enviado ? '✓ Email enviado' : 'Email pendiente'}</span>
                        <br><span style="font-size:12px;color:var(--text-dim)">${p.email}</span>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div class="admin-item-date">${p.fecha}</div>
                        <strong style="color:var(--gold);font-size:15px">$${Number(p.total).toLocaleString('es-AR')}</strong>
                    </div>
                </div>
                <div class="admin-item-body">
                    ${p.foto_ids.length} foto${p.foto_ids.length > 1 ? 's' : ''} comprada${p.foto_ids.length > 1 ? 's' : ''} &nbsp;·&nbsp; IDs: [${p.foto_ids.join(', ')}]
                </div>
                ${p.estado === 'approved' && !p.email_enviado ? `
                <div style="margin-top:10px">
                    <button class="admin-action-btn" onclick="reenviarEmail(${p.id})">
                        <i class="fa-solid fa-paper-plane"></i> Enviar email ahora
                    </button>
                </div>` : ''}
            </div>`;
        }).join('')
        : '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Sin compras registradas aún.</p>';
    } catch {
        c.innerHTML = '<p style="color:var(--red)">Error al cargar compras.</p>';
    }
}

async function reenviarEmail(id) {
    const btn = event.target.closest('.admin-action-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }

    const res  = await fetch(`/admin/compras/${id}/reenviar-email`, { method: 'POST', credentials: 'include' });
    const data = await res.json();

    Swal.fire({
        icon:  data.ok ? 'success' : 'error',
        title: data.ok ? '✓ Email reenviado' : 'Error al reenviar',
        text:  data.ok ? 'El cliente recibió sus fotos.' : 'Verificá que SMTP esté configurado.',
        timer: 2500, showConfirmButton: false,
        background: 'var(--ink-2)', color: 'var(--text)'
    });
    if (data.ok) cargarCompras();
}

async function cargarConsultas() {
    const c = document.getElementById('tab-consultas');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Cargando...</p>';
    try {
        const lista = await (await fetch('/admin/consultas', { credentials: 'include' })).json();
        c.innerHTML = lista.length ? lista.map(m => `
            <div class="admin-item" id="msg-${m.id}">
                <div class="admin-item-hdr">
                    <div>
                        <strong>${m.nombre} — ${m.email}</strong>
                        ${!m.leida ? '<span class="badge badge-new">Nueva</span>' : ''}
                    </div>
                    <span class="admin-item-date">${m.fecha}</span>
                </div>
                <div class="admin-item-body">${m.mensaje || '<em>Sin mensaje</em>'}</div>
                ${!m.leida ? `
                <div style="margin-top:10px">
                    <button class="admin-action-btn" onclick="marcarLeida(${m.id})">
                        <i class="fa-solid fa-check"></i> Marcar como leída
                    </button>
                </div>` : ''}
            </div>`).join('')
        : '<p style="color:var(--text-dim);font-style:italic;padding:20px 0">Sin consultas.</p>';
    } catch {
        c.innerHTML = '<p style="color:var(--red)">Error al cargar consultas.</p>';
    }
}
async function marcarLeida(id) {
    await fetch(`/admin/consultas/${id}/leer`, { method: 'PATCH', credentials: 'include' });
    document.getElementById(`msg-${id}`)?.querySelector('.badge-new')?.remove();
    document.getElementById(`msg-${id}`)?.querySelector('.admin-action-btn')?.closest('div')?.remove();
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
    await fetch('/logout', { method: 'POST', credentials: 'include' });
    isAdmin = false;
    toggleAdminUI(false);
    cerrarAdminPanel();
    Swal.fire({
        icon: 'success', title: 'Sesión cerrada',
        timer: 1500, showConfirmButton: false,
        background: 'var(--ink-2)', color: 'var(--text)'
    });
}