/* ═══════════════════════════════════════════════════
   N MARKET — maps.js
   Google Maps : sélecteur de position (client) + affichage (vendeur / admin).
   Sans clé API (GOOGLE_MAPS_API_KEY vide), tout reste utilisable : GPS du navigateur + liens Google Maps.
═══════════════════════════════════════════════════ */

let _gmapsPromise = null;
function loadGoogleMaps() {
  if (typeof GOOGLE_MAPS_API_KEY === 'undefined' || !GOOGLE_MAPS_API_KEY) return Promise.resolve(false);
  if (window.google && window.google.maps) return Promise.resolve(true);
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise(resolve => {
    window.__gmapsReady = () => resolve(true);
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_API_KEY) +
            '&v=weekly&language=fr&callback=__gmapsReady';
    s.async = true; s.onerror = () => { _gmapsPromise = null; resolve(false); };
    setTimeout(() => resolve(!!(window.google && window.google.maps)), 12000);
    document.head.appendChild(s);
  });
  return _gmapsPromise;
}
/* Erreur de clé (restriction, facturation…) : Google appelle cette fonction */
window.gm_authFailure = () => { window.__gmapsBroken = true; document.querySelectorAll('.gmap-box').forEach(b => b.classList.add('gmap-broken')); };

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function gmapsViewUrl(lat, lng) { return `https://www.google.com/maps/search/?api=1&query=${_num(lat)},${_num(lng)}`; }
function gmapsDirUrl(lat, lng)  { return `https://www.google.com/maps/dir/?api=1&destination=${_num(lat)},${_num(lng)}&travelmode=walking`; }

/* ── Sélecteur de position (formulaire de commande) ── */
function createLocationPicker(boxId, { onChange } = {}) {
  const box = document.getElementById(boxId);
  const state = { lat: null, lng: null, label: '', touched: false, map: null, marker: null, geocoder: null };
  const center = () => (state.lat != null ? { lat: state.lat, lng: state.lng }
    : (typeof CAMPUS !== 'undefined' && CAMPUS.lat != null ? { lat: CAMPUS.lat, lng: CAMPUS.lng } : MAP_DEFAULT_CENTER));

  function set(lat, lng, moveMap) {
    state.lat = +(+lat).toFixed(6); state.lng = +(+lng).toFixed(6); state.touched = true;
    if (state.marker) state.marker.setPosition({ lat: state.lat, lng: state.lng });
    if (moveMap && state.map) { state.map.panTo({ lat: state.lat, lng: state.lng }); state.map.setZoom(17); }
    reverse();
    if (onChange) onChange(state);
  }
  function reverse() {
    state.label = '';
    if (!state.geocoder) { if (onChange) onChange(state); return; }
    state.geocoder.geocode({ location: { lat: state.lat, lng: state.lng } }, (res, st) => {
      if (st === 'OK' && res && res[0]) { state.label = String(res[0].formatted_address || '').slice(0, 120); if (onChange) onChange(state); }
    });
  }
  function locate() {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve({ error: 'La géolocalisation n\'est pas disponible sur cet appareil.' }); return; }
      navigator.geolocation.getCurrentPosition(
        p => { set(p.coords.latitude, p.coords.longitude, true); resolve({ ok: true, accuracy: Math.round(p.coords.accuracy || 0) }); },
        e => resolve({ error: e.code === 1 ? 'Autorise la localisation dans ton navigateur, ou place le repère toi-même sur la carte.' : 'Position introuvable. Place le repère sur la carte.' }),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }
  async function mount() {
    if (state.map || !box) return;
    const ok = await loadGoogleMaps();
    if (!ok || window.__gmapsBroken) { box.classList.add('gmap-off'); return; }   // sans carte : GPS + lien seulement
    const c = center();
    state.map = new google.maps.Map(box, { center: c, zoom: state.lat != null ? 17 : 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: 'greedy' });
    state.marker = new google.maps.Marker({ position: c, map: state.map, draggable: true, visible: true });
    try { state.geocoder = new google.maps.Geocoder(); } catch (e) {}
    state.map.addListener('click', ev => set(ev.latLng.lat(), ev.latLng.lng(), false));
    state.marker.addListener('dragend', ev => set(ev.latLng.lat(), ev.latLng.lng(), false));
  }
  function reset() { state.lat = state.lng = null; state.label = ''; state.touched = false; if (state.marker) state.marker.setPosition(center()); }
  return { state, mount, locate, set, reset, get position() { return state.touched ? { lat: state.lat, lng: state.lng, label: state.label } : null; } };
}

/* ── Carte en lecture (détail de commande, vendeur / admin) ── */
async function showMapInto(boxId, lat, lng, title) {
  const box = document.getElementById(boxId); if (!box) return;
  lat = _num(lat); lng = _num(lng); if (lat == null || lng == null) { box.style.display = 'none'; return; }
  box.style.display = ''; box.innerHTML = '';
  const ok = await loadGoogleMaps();
  if (!ok || window.__gmapsBroken) { box.style.display = 'none'; return; }   // les boutons « Ouvrir / Itinéraire » restent disponibles
  const map = new google.maps.Map(box, { center: { lat, lng }, zoom: 16, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  new google.maps.Marker({ position: { lat, lng }, map, title: title || 'Livraison' });
}
function mapLinksHtml(lat, lng) {
  lat = _num(lat); lng = _num(lng); if (lat == null || lng == null) return '';
  return `<div class="map-actions">
    <a class="btn-ghost" href="${gmapsDirUrl(lat, lng)}" target="_blank" rel="noopener noreferrer">🧭 Itinéraire</a>
    <a class="btn-ghost" href="${gmapsViewUrl(lat, lng)}" target="_blank" rel="noopener noreferrer">📍 Ouvrir dans Google Maps</a></div>`;
}
