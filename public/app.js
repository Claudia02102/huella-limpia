'use strict';

/* ==========================================================================
   Huella Limpia · frontend
   ========================================================================== */

const LEVEL = { bajo: '#4F9A68', medio: '#E0A030', alto: '#C0392B' };
const LEVEL_TXT = { bajo: 'Baja', medio: 'Media', alto: 'Alta' };
const TYPES = { heces: 'Heces', orina: 'Orina en fachada', mascota_suelta: 'Mascota suelta', foco_infeccioso: 'Foco infeccioso' };
const KIND = { dispensador: ['B', 'Bolsas'], tacho: ['T', 'Tacho'], pipican: ['Z', 'Zona canina'] };

const state = {
  districts: [], zones: [], points: [], reports: [],
  token: null, role: null, email: null,
  district: 'ALL', type: 'heces', species: 'perro', pendingAction: null
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zone = (id) => state.zones.find((z) => z.id === id);
const district = (id) => state.districts.find((d) => d.id === id);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

/* ---------- Iconos propios (trazo grueso, colores chicha) ---------- */
function icon(type) {
  const g = {
    heces: '<path d="M10 32 H30 C33 32 33 27 29 27 C32 26 31 21 27 21 C29 18 26 14 22 15 C20 11 15 12 16 17 C12 17 11 22 14 23 C9 24 9 32 10 32 Z" fill="#C9772B" stroke="#1F3A5F" stroke-width="2.4" stroke-linejoin="round"/><circle cx="17" cy="26" r="1.4" fill="#1F3A5F"/><circle cx="24" cy="26" r="1.4" fill="#1F3A5F"/>',
    orina: '<path d="M20 5 C20 5 9 18 9 25 A11 11 0 0 0 31 25 C31 18 20 5 20 5 Z" fill="#EFC75E" stroke="#1F3A5F" stroke-width="2.4"/><path d="M14 25 A6 6 0 0 0 20 31" fill="none" stroke="#1F3A5F" stroke-width="2"/>',
    mascota_suelta: '<path d="M6 30 V22 L10 14 L14 18 H26 L30 12 L33 16 V30 M12 30 V24 M28 30 V24" fill="none" stroke="#1F3A5F" stroke-width="2.6" stroke-linejoin="round"/><path d="M10 14 L8 8 L13 12 Z" fill="#1D6FA8" stroke="#1F3A5F" stroke-width="1.6"/><circle cx="31" cy="15" r="1.3" fill="#1F3A5F"/>',
    foco_infeccioso: '<circle cx="20" cy="20" r="5" fill="#1D6FA8" stroke="#1F3A5F" stroke-width="2.2"/><circle cx="20" cy="9" r="5" fill="none" stroke="#1F3A5F" stroke-width="2.4"/><circle cx="10" cy="26" r="5" fill="none" stroke="#1F3A5F" stroke-width="2.4"/><circle cx="30" cy="26" r="5" fill="none" stroke="#1F3A5F" stroke-width="2.4"/>'
  }[type] || '';
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${g}</svg>`;
}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || (data.errors || []).join(' · ') || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Mapa ---------- */
const map = L.map('map', { zoomControl: false }).setView([-11.978, -77.068], 13);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
const hexLayer = L.layerGroup().addTo(map);
const pointLayer = L.layerGroup().addTo(map);
const pointMarkers = new Map();
const hexes = new Map();

function hexagon(lat, lng, km) {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return [lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)];
  });
}

function drawZones() {
  hexLayer.clearLayers();
  hexes.clear();
  for (const z of state.zones) {
    const poly = L.polygon(hexagon(z.lat, z.lng, 0.6), {
      color: '#1F3A5F', weight: 2, fillColor: LEVEL[z.level], fillOpacity: 0.5
    }).bindPopup(
      `<span class="pp__k">${esc(district(z.district).name)} · ${z.activeReports} reportes validados</span>` +
      `<span class="pp__t">${esc(z.name)}</span>Criticidad <b>${LEVEL_TXT[z.level]}</b> (${z.criticality})`
    ).addTo(hexLayer);
    hexes.set(z.id, poly);
    if (z.activeReports) {
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({ className: 'hexlabel', html: String(z.activeReports), iconSize: [20, 14], iconAnchor: [10, 7] }),
        interactive: false, keyboard: false
      }).addTo(hexLayer);
    }
  }
}

function drawPoints() {
  pointLayer.clearLayers();
  pointMarkers.clear();
  for (const p of state.points) {
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: `<span class="cp" data-id="${p.id}">${KIND[p.kind][0]}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: p.name
    }).bindPopup(`<span class="pp__k">Punto limpio · ${KIND[p.kind][1]}</span><span class="pp__t">${esc(p.name)}</span>`).addTo(pointLayer);
    pointMarkers.set(p.id, m);
  }
}

/* ---------- Navegación ---------- */
function showView(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle('is-on', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.view').forEach((v) => {
    const on = v.id === `view-${name}`;
    v.hidden = !on;
    v.classList.toggle('is-on', on);
  });
  if (name === 'fiscal') renderFiscal();
  if (name === 'mascota') renderMyPets();
}

/* ---------- Sesión ---------- */
function note(el, text, ok) {
  el.textContent = text;
  el.className = `note ${ok ? 'ok' : 'err'}`;
}
function renderSession() {
  const logged = Boolean(state.token);
  $('who').hidden = !logged;
  $('who').innerHTML = logged ? `<b>${esc(state.role)}</b>${esc(state.email)}` : '';
  $('btnSession').textContent = logged ? 'Salir' : 'Ingresar';
  if (logged) $('login').hidden = true;
  $('fiscalLede').textContent = state.role === 'inspector'
    ? 'Sesión de inspector: valida los reportes nuevos y marca como atendidos los puntos limpiados.'
    : 'Avance por distrito y cola de atención priorizada. Solo los inspectores pueden cambiar estados.';
}
function askLogin(reason) {
  $('login').hidden = false;
  $('login').querySelector('.login__t').textContent = reason || 'Ingresa para continuar';
  $('email').focus();
}
async function doLogin() {
  const body = JSON.stringify({ email: $('email').value, password: $('password').value });
  const { token, role } = await api('/auth/login', { method: 'POST', body });
  state.token = token;
  state.role = role;
  state.email = $('email').value.trim().toLowerCase();
  $('password').value = '';
  renderSession();
  if (state.pendingAction) { const fn = state.pendingAction; state.pendingAction = null; fn(); }
  if (!$('view-fiscal').hidden) renderFiscal();
  if (!$('view-mascota').hidden) renderMyPets();
}

/* ---------- 01 · Puntos críticos ---------- */
function renderChips() {
  $('districtChips').innerHTML = [['ALL', 'Todo Lima Norte'], ...state.districts.map((d) => [d.id, d.name])]
    .map(([id, n]) => `<button type="button" class="chip${id === state.district ? ' is-on' : ''}" data-d="${id}" aria-pressed="${id === state.district}">${esc(n)}</button>`).join('');
}
function renderRank() {
  const list = state.zones
    .filter((z) => state.district === 'ALL' || z.district === state.district)
    .sort((a, b) => b.criticality - a.criticality)
    .slice(0, 6);
  $('rank').innerHTML = list.map((z, i) => `
    <li data-z="${z.id}" tabindex="0">
      <span class="rank__n" data-l="${z.level}">${i + 1}</span>
      <span class="rank__name">${esc(z.name)}</span>
      <span class="rank__meta">${esc(district(z.district).name)} · ${z.activeReports} reportes · índice ${z.criticality}</span>
      <span class="rank__lvl" data-l="${z.level}">${LEVEL_TXT[z.level]}</span>
    </li>`).join('');
  $('rank').querySelectorAll('li').forEach((li, i) => {
    li.style.animationDelay = `${i * 45}ms`;
    li.querySelector('.rank__n').style.background = LEVEL[li.querySelector('.rank__n').dataset.l];
    li.querySelector('.rank__lvl').style.color = li.dataset.z && zone(li.dataset.z).level === 'bajo' ? '#2F7A47' : LEVEL[zone(li.dataset.z).level];
  });
  const bounds = list.map((z) => [z.lat, z.lng]);
  if (state.district !== 'ALL' && bounds.length) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: false });
}
function focusZone(id) {
  const z = zone(id);
  map.flyTo([z.lat, z.lng], 15, { duration: 0.7 });
  hexes.get(id).openPopup();
}
async function findNearest() {
  const btn = $('btnNearest');
  btn.disabled = true;
  btn.textContent = 'Buscando…';
  const center = await new Promise((resolve) => {
    const fallback = () => resolve({ ...map.getCenter(), from: 'el centro del mapa' });
    if (!navigator.geolocation) return fallback();
    const t = setTimeout(fallback, 3500);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(t); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, from: 'tu ubicación' }); },
      () => { clearTimeout(t); fallback(); },
      { timeout: 3000 }
    );
  });
  try {
    const near = await api(`/clean-points/nearest?lat=${center.lat.toFixed(5)}&lng=${center.lng.toFixed(5)}&limit=3`);
    $('near').innerHTML = near.map((p) => `<li><b>${esc(p.name)}</b><span>${p.distanceKm} km</span></li>`).join('') +
      `<li><small>Calculado desde ${center.from}.</small></li>`;
    document.querySelectorAll('.cp').forEach((el) => el.classList.toggle('is-hit', el.dataset.id === near[0].id));
    map.flyTo([near[0].lat, near[0].lng], 15, { duration: 0.7 });
  } catch (e) {
    $('near').innerHTML = `<li class="note err">${esc(e.message)}</li>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buscar cerca';
  }
}

/* ---------- 02 · Reportar ---------- */
function renderTypes() {
  $('types').innerHTML = Object.entries(TYPES).map(([k, v]) =>
    `<button type="button" class="type${k === state.type ? ' is-on' : ''}" role="radio" aria-checked="${k === state.type}" data-t="${k}">${icon(k)}${v}</button>`).join('');
}
async function sendReport() {
  const btn = $('btnReport');
  btn.classList.add('is-loading');
  try {
    const r = await api('/reports', { method: 'POST', body: JSON.stringify({ zoneId: $('zone').value, type: state.type, description: $('desc').value }) });
    $('desc').value = '';
    $('descCount').textContent = '0';
    const z = zone(r.zoneId);
    $('ticket').innerHTML = `<div class="ticket">
      <span class="stamp stamp--${r.status}">${r.status}</span>
      <h3>Ticket ${esc(r.id)}</h3>
      <dl><dt>Tipo</dt><dd>${TYPES[r.type]}</dd><dt>Zona</dt><dd>${esc(z.name)}</dd>
      <dt>Distrito</dt><dd>${esc(district(z.district).name)}</dd><dt>Fecha</dt><dd>${new Date(r.createdAt).toLocaleString('es-PE')}</dd>
      <dt>Detalle</dt><dd>${esc(r.description)}</dd></dl>
      <p>Un inspector lo validará; cuando se valide, sumará al índice de la zona.</p></div>`;
  } catch (e) {
    if (e.status === 401) { state.pendingAction = sendReport; askLogin('Ingresa para enviar tu reporte'); }
    $('ticket').innerHTML = `<p class="note err">${esc(e.message)}</p>`;
  } finally {
    btn.classList.remove('is-loading');
  }
}

/* ---------- 03 · Mascota ---------- */
function tagHtml(p) {
  return `<div class="tag${p.species === 'gato' ? ' tag--gato' : ''}">
    <div class="tag__name">${esc(p.name)}</div>
    <div class="tag__meta">${p.species === 'gato' ? 'Gato' : 'Perro'} · ${esc(p.breed)} · ${esc(district(p.district).name)}</div>
    <div class="tag__meta">${p.vaccinated ? 'Vacunas al día ✓' : 'Vacunas pendientes'}</div>
    <span class="tag__code">${esc(p.code)}</span></div>`;
}
async function renderMyPets() {
  if (!state.token) { $('tags').innerHTML = ''; return; }
  const pets = await api('/pets/mine').catch(() => []);
  $('tags').innerHTML = pets.map(tagHtml).join('');
}
async function sendPet() {
  const btn = $('btnPet');
  btn.classList.add('is-loading');
  try {
    await api('/pets', { method: 'POST', body: JSON.stringify({ name: $('petName').value, breed: $('petBreed').value, species: state.species, district: $('petDistrict').value, vaccinated: $('petVax').checked }) });
    $('petName').value = '';
    $('petBreed').value = '';
    await renderMyPets();
  } catch (e) {
    if (e.status === 401) { state.pendingAction = sendPet; askLogin('Ingresa para registrar a tu mascota'); }
    $('tags').innerHTML = `<p class="note err">${esc(e.message)}</p>`;
  } finally {
    btn.classList.remove('is-loading');
  }
}

/* ---------- 04 · Fiscalización ---------- */
async function renderFiscal() {
  const [stats, queue] = await Promise.all([api('/inspection/stats'), api('/inspection/queue')]);
  $('bars').innerHTML = stats.map((d) => `
    <div class="bar"><div class="bar__h">${esc(d.name)}<span>${d.total} reportes · ${d.pets} mascotas</span></div>
    <div class="bar__track" data-r="${d.reportado}" data-v="${d.validado}" data-a="${d.atendido}" data-t="${d.total}"><i class="i--rep"></i><i class="i--val"></i><i class="i--ate"></i></div></div>`).join('');
  requestAnimationFrame(() => document.querySelectorAll('.bar__track').forEach((t) => {
    const total = Number(t.dataset.t) || 1;
    const [r, v, a] = t.querySelectorAll('i');
    r.style.width = `${(t.dataset.r / total) * 100}%`;
    v.style.width = `${(t.dataset.v / total) * 100}%`;
    a.style.width = `${(t.dataset.a / total) * 100}%`;
  }));
  const isInspector = state.role === 'inspector';
  $('queue').innerHTML = queue.slice(0, 8).map((r) => `
    <li>
      <span class="q__p">${r.priority}<small>PRIOR.</small></span>
      <div><div class="q__t">${TYPES[r.type]} · ${esc(r.zoneName)}</div>
        <div class="q__m">${esc(r.id)} · ${esc(district(r.district).name)} · ${fmtDate(r.createdAt)} · ${r.recurrence} reincidencias</div>
        <div class="q__d">${esc(r.description)}</div></div>
      <div class="q__a"><span class="stamp stamp--${r.status}">${r.status}</span>
        ${isInspector ? `<button class="btn btn--sm" data-id="${r.id}" data-next="${r.status === 'reportado' ? 'validado' : 'atendido'}">${r.status === 'reportado' ? 'Validar' : 'Atender'}</button>` : ''}
      </div>
    </li>`).join('');
  $('queue').querySelectorAll('li').forEach((li, i) => { li.style.animationDelay = `${i * 40}ms`; });
}
async function changeStatus(btn) {
  btn.disabled = true;
  try {
    await api(`/reports/${btn.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.next }) });
    await refreshZones();
    await renderFiscal();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = e.message;
  }
}

/* ---------- Datos ---------- */
async function refreshZones() {
  state.zones = await api('/zones');
  drawZones();
  renderRank();
}

async function init() {
  [state.districts, state.points] = await Promise.all([api('/districts'), api('/clean-points')]);
  await refreshZones();
  drawPoints();
  renderChips();
  renderTypes();
  $('zone').innerHTML = state.districts.map((d) => `<optgroup label="${esc(d.name)}">${state.zones.filter((z) => z.district === d.id)
    .map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</optgroup>`).join('');
  $('petDistrict').innerHTML = state.districts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  renderSession();

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $('btnSession').addEventListener('click', () => {
    if (state.token) { Object.assign(state, { token: null, role: null, email: null }); renderSession(); showView('mapa'); return; }
    $('login').hidden = !$('login').hidden;
    if (!$('login').hidden) $('email').focus();
  });
  $('login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('btnLogin').disabled = true;
    try { await doLogin(); } catch (e) { note($('loginMsg'), e.message, false); } finally { $('btnLogin').disabled = false; }
  });
  $('btnRegister').addEventListener('click', async () => {
    $('btnRegister').disabled = true;
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
      note($('loginMsg'), 'Cuenta creada como vecino. Ahora pulsa Ingresar.', true);
    } catch (e) { note($('loginMsg'), e.message, false); } finally { $('btnRegister').disabled = false; }
  });

  $('districtChips').addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    state.district = c.dataset.d;
    renderChips();
    renderRank();
    if (state.district === 'ALL') map.setView([-11.978, -77.068], 13);
  });
  $('rank').addEventListener('click', (ev) => { const li = ev.target.closest('li'); if (li) focusZone(li.dataset.z); });
  $('rank').addEventListener('keydown', (ev) => { const li = ev.target.closest('li'); if (li && ev.key === 'Enter') focusZone(li.dataset.z); });
  $('btnNearest').addEventListener('click', findNearest);

  $('types').addEventListener('click', (ev) => { const b = ev.target.closest('.type'); if (b) { state.type = b.dataset.t; renderTypes(); } });
  $('desc').addEventListener('input', () => { $('descCount').textContent = $('desc').value.length; });
  $('reportForm').addEventListener('submit', (ev) => { ev.preventDefault(); sendReport(); });

  document.querySelectorAll('.seg__o').forEach((b) => b.addEventListener('click', () => {
    state.species = b.dataset.sp;
    document.querySelectorAll('.seg__o').forEach((x) => x.classList.toggle('is-on', x === b));
  }));
  $('petForm').addEventListener('submit', (ev) => { ev.preventDefault(); sendPet(); });
  $('lookupForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { $('lookupOut').innerHTML = `<div class="tags">${tagHtml(await api(`/pets/lookup/${encodeURIComponent($('lookupCode').value.trim())}`))}</div>`; } catch (e) { $('lookupOut').innerHTML = `<p class="note err">${esc(e.message)}</p>`; }
  });

  $('queue').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-id]'); if (b) changeStatus(b); });

  // Enlaces directos: ?view=reportar|mascota|fiscal · ?district=LOL · ?near=1 · ?code=LN-LOL-0001
  const q = new URLSearchParams(location.search);
  if (q.get('district')) { state.district = q.get('district'); renderChips(); renderRank(); }
  if (q.get('view')) showView(q.get('view'));
  if (q.get('near')) findNearest();
  if (q.get('code')) { $('lookupCode').value = q.get('code'); $('lookupForm').requestSubmit(); }
}

init();
