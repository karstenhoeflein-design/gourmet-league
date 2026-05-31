import { useState, useRef, useEffect } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Aesthetic: Dark luxury dining — deep obsidian, champagne gold, blood-red accents
// Typography: Playfair Display (editorial serif) + DM Sans (clean sans)
const T = {
  bg:       "#080a0c",
  bgCard:   "#0f1215",
  bgRaised: "#151a1f",
  bgHover:  "#1c2228",
  border:   "#1e2630",
  borderHi: "#2e3d4a",
  gold:     "#c9a84c",
  goldDim:  "#7a6030",
  goldGlow: "rgba(201,168,76,0.15)",
  red:      "#c0392b",
  redDim:   "#5a1a14",
  green:    "#27ae60",
  muted:    "#4a5a68",
  sub:      "#2a3540",
  text:     "#e8e4dc",
  textDim:  "#8a9aa8",
  textFade: "#4a5a68",
};

// ─── SCORING ──────────────────────────────────────────────────────────────────
function scoreVisit(v, isFirst) {
  let p = isFirst ? 20 : 5;
  if (v.review) p += 3;
  if (v.photo)  p += 5;
  return p;
}
function calcBreakdown(visits) {
  const seen = {};
  let total = 0;
  const detail = visits.map(v => {
    const key = (v.name + "||" + v.city).toLowerCase();
    const first = !seen[key]; seen[key] = true;
    const pts = scoreVisit(v, first);
    total += pts;
    return { ...v, pts, first };
  });
  return { total, detail };
}
function calcStats(visits) {
  const { total, detail } = calcBreakdown(visits);
  const unique = new Set(visits.map(v => (v.name + "||" + v.city).toLowerCase())).size;
  const avg = visits.length ? visits.reduce((s, v) => s + v.rating, 0) / visits.length : 0;
  return { score: total, totalVisits: visits.length, uniqueRestaurants: unique, avgRating: Math.round(avg * 10) / 10, detail };
}
function getRank(score) {
  if (score >= 200) return { title: "Grand Chef",    emoji: "👑", color: "#c9a84c", tier: 4 };
  if (score >= 120) return { title: "Connaisseur",   emoji: "🍷", color: "#9b59b6", tier: 3 };
  if (score >= 60)  return { title: "Aficionado",    emoji: "🌿", color: "#27ae60", tier: 2 };
  return                   { title: "Rookie",        emoji: "🍴", color: "#4a5a68", tier: 1 };
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const ME_SEED = [
  { id: 1, name: "Zum Gemalten Haus", city: "Frankfurt", rating: 5, date: "2024-03-12", cuisine: "Deutsch",       review: "Wunderbare Rippchen.", photo: null },
  { id: 2, name: "Metropol",          city: "Frankfurt", rating: 4, date: "2024-04-02", cuisine: "International", review: null, photo: null },
  { id: 3, name: "Chez Ima",          city: "Berlin",    rating: 5, date: "2024-05-18", cuisine: "Israelisch",    review: "Bestes Shakshuka.", photo: "📸" },
];

// ─── STORAGE & AUTH ───────────────────────────────────────────────────────────
function genId()   { return Math.random().toString(36).slice(2, 10); }
function genCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
async function hashPw(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// localStorage-based persistence — reliable in Claude artifacts
const LS = {
  get(key) { try { return localStorage.getItem("gl:" + key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem("gl:" + key, val); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem("gl:" + key); } catch {} },
  keys(prefix) {
    try {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("gl:" + prefix)) out.push(k.slice(3)); // strip "gl:"
      }
      return out;
    } catch { return []; }
  }
};

async function saveEmailIndex(email, uid) { LS.set("email:" + email.toLowerCase().trim(), uid); }
async function lookupEmail(email) { return LS.get("email:" + email.toLowerCase().trim()); }
async function saveUser(user) {
  const ok = LS.set("user:" + user.id, JSON.stringify(user));
  if (!ok) throw new Error("localStorage nicht verfügbar");
}
async function loadUser(uid) {
  const v = LS.get("user:" + uid);
  return v ? JSON.parse(v) : null;
}
async function listAllUsers() {
  return LS.keys("user:").map(k => { try { const v = LS.get(k); return v ? JSON.parse(v) : null; } catch { return null; } }).filter(Boolean);
}
const AVATARS = ["🧑","👩","👨","👩‍🦱","🧔","👱","👩‍🦰","🧑‍🍳","👩‍🍳","🕵️","🧑‍🎤","👸"];

// ─── API ──────────────────────────────────────────────────────────────────────
function normalizeRestaurants(arr) {
  return arr.map((r, i) => ({
    id: String(r.id || "sr-" + i), name: r.name || "Unbekannt",
    city: r.city || "", street: r.street || "", cuisine: r.cuisine || "",
    priceRange: r.priceRange || "€€",
    globalAvg: typeof r.globalAvg === "number" ? r.globalAvg : 4.0,
    globalCount: Number(r.globalCount) || 100,
    openingHours: r.openingHours || "", website: r.website || "",
    lat: Number(r.lat), lng: Number(r.lng),
  })).filter(r => r.lat && r.lng && !isNaN(r.lat) && !isNaN(r.lng));
}
function nominatimToRestaurant(r) {
  return {
    id: "nom-" + r.place_id,
    name: r.address?.amenity || r.display_name.split(",")[0],
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.suburb || "",
    street: r.address?.road ? r.address.road + (r.address?.house_number ? " " + r.address.house_number : "") : "",
    cuisine: "",
    openingHours: "",
    website: "",
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    globalAvg: parseFloat((3.5 + Math.random() * 1.4).toFixed(1)),
    globalCount: Math.floor(50 + Math.random() * 800),
    priceRange: "€€",
  };
}
async function fetchPlaces(type, params) {
  const url = "/api/places?" + new URLSearchParams({ type, ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}
async function searchRestaurantsAI(q) {
  const qt = q.trim();
  const nomData = await fetchPlaces("search", { q: qt });

  // Direct restaurant hits
  const hits = nomData.filter(r => r.class === "amenity" && r.type === "restaurant");
  if (hits.length > 0) return normalizeRestaurants(hits.map(nominatimToRestaurant));

  // Geocode the query, then find nearby restaurants
  if (!nomData.length) throw new Error("Nichts gefunden. Tipp: Restaurantname oder Stadt eingeben.");
  const { lat, lon } = nomData[0];

  const nearby = await fetchPlaces("nearby", { lat, lon });
  const restaurants = nearby.filter(r => r.class === "amenity" && r.type === "restaurant");
  if (!restaurants.length) throw new Error("Keine Restaurants gefunden. Versuche eine andere Stadt.");
  return normalizeRestaurants(restaurants.map(nominatimToRestaurant));
}
async function fetchNearbyRestaurants(lat, lng) {
  try {
    const data = await fetchPlaces("nearby", { lat, lon: lng });
    const results = data.filter(r => r.class === "amenity" && r.type === "restaurant").map(nominatimToRestaurant);
    return results.length ? results : [];
  } catch {
    return [];
  }
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => onChange(s)}
          style={{ cursor: "pointer", fontSize: 30, display: "inline-block", color: s <= (hover||value) ? T.gold : T.sub, transform: s <= (hover||value) ? "scale(1.25)" : "scale(1)", transition: "all .15s", lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}
function Stars({ rating, size = 13 }) {
  return <span style={{ letterSpacing: 1 }}>{[1,2,3,4,5].map(s => <span key={s} style={{ color: s<=rating ? T.gold : T.sub, fontSize: size }}>★</span>)}</span>;
}

function GlassCard({ children, style, onClick, hover = false }) {
  const [ov, setOv] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hover && setOv(true)}
      onMouseLeave={() => hover && setOv(false)}
      style={{
        background: ov ? T.bgHover : T.bgCard,
        border: "1px solid " + (ov ? T.borderHi : T.border),
        borderRadius: 14,
        transition: "background .2s, border-color .2s",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}>{children}</div>
  );
}

function Badge({ children, color = T.gold }) {
  return (
    <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color, border: "1px solid " + color, borderRadius: 4, padding: "2px 6px", opacity: 0.9 }}>{children}</span>
  );
}

function GoldButton({ children, onClick, disabled, fullWidth, small }) {
  const [ov, setOv] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => !disabled && setOv(true)}
      onMouseLeave={() => setOv(false)}
      style={{
        width: fullWidth ? "100%" : undefined,
        background: disabled ? T.bgRaised : ov ? "#d4b060" : "linear-gradient(135deg, #a07828, " + T.gold + " 60%, #d4b060)",
        border: "none", borderRadius: 10,
        color: disabled ? T.muted : T.bg,
        padding: small ? "9px 16px" : "14px 20px",
        fontSize: small ? 12 : 14,
        fontFamily: "inherit", fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: 0.5,
        boxShadow: disabled ? "none" : ov ? "0 0 24px rgba(201,168,76,0.4)" : "0 0 16px rgba(201,168,76,0.2)",
        transition: "all .2s",
      }}>{children}</button>
  );
}

function GhostButton({ children, onClick, fullWidth }) {
  return (
    <button onClick={onClick} style={{ width: fullWidth ? "100%" : undefined, background: "transparent", border: "1px solid " + T.border, borderRadius: 10, color: T.textDim, padding: "13px 20px", fontSize: 14, fontFamily: "inherit", cursor: "pointer", transition: "border-color .2s, color .2s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.color = T.text; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}>
      {children}
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text", hint, error }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 10, letterSpacing: 3, color: T.textDim, textTransform: "uppercase", marginBottom: 8, fontFamily: "DM Sans, sans-serif" }}>{label}</label>}
      <input value={value} type={type} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + (error ? T.red : focus ? T.gold : T.border), borderRadius: 10, padding: "13px 16px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none", transition: "border-color .2s" }}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
      {error && <div style={{ fontSize: 11, color: T.red, marginTop: 5 }}>{error}</div>}
      {hint && !error && <div style={{ fontSize: 11, color: T.textFade, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function SectionPill({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.k} onClick={() => onChange(t.k)} style={{ flex: 1, background: active === t.k ? T.bgHover : "transparent", border: "none", borderTop: "2px solid " + (active === t.k ? T.gold : "transparent"), color: active === t.k ? T.gold : T.textDim, padding: "11px 6px", fontSize: 11, fontFamily: "DM Sans, sans-serif", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: active === t.k ? 700 : 400, position: "relative", transition: "all .2s" }}>
          {t.l}
          {t.badge > 0 && <span style={{ position: "absolute", top: 5, right: 8, background: T.red, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── TILE MAP (no external CSS dependency) ───────────────────────────────────
function TileMap({ userPos, restaurants, onSelect, selectedId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const lRef = useRef(null);
  const initialized = useRef(false);

  function injectLeaflet(cb) {
    // Inline the critical Leaflet CSS so we don't depend on CDN CSS loading
    if (!document.getElementById("lflt-css-inline")) {
      const st = document.createElement("style");
      st.id = "lflt-css-inline";
      st.textContent = `.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-pane,.leaflet-overlay-pane,.leaflet-shadow-pane,.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-popup-pane{position:absolute;left:0;top:0}.leaflet-tile-pane{z-index:2}.leaflet-overlay-pane{z-index:4}.leaflet-shadow-pane{z-index:5}.leaflet-marker-pane{z-index:6}.leaflet-tooltip-pane{z-index:650}.leaflet-popup-pane{z-index:700}.leaflet-map-pane{z-index:0;position:relative}.leaflet-container{overflow:hidden;-ms-touch-action:none;touch-action:none;background:#000;outline:0}.leaflet-tile{filter:inherit;visibility:hidden}.leaflet-tile-loaded{visibility:inherit}.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute}.leaflet-container .leaflet-tile{max-width:none;max-height:none}.leaflet-pane{z-index:400}.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}.leaflet-control{float:left;clear:both;pointer-events:auto}.leaflet-right .leaflet-control{float:right}.leaflet-top .leaflet-control{margin-top:10px}.leaflet-bottom .leaflet-control{margin-bottom:10px}.leaflet-left .leaflet-control{margin-left:10px}.leaflet-right .leaflet-control{margin-right:10px}.leaflet-fade-anim .leaflet-popup{opacity:0;transition:opacity .2s linear}.leaflet-fade-anim .leaflet-map-pane .leaflet-popup{opacity:1}.leaflet-zoom-animated{transform-origin:0 0}.leaflet-zoom-anim .leaflet-zoom-animated{will-change:transform}.leaflet-zoom-anim .leaflet-zoom-animated{transition:-webkit-transform .25s cubic-bezier(0,0,.25,1);transition:transform .25s cubic-bezier(0,0,.25,1)}.leaflet-zoom-anim .leaflet-tile,.leaflet-pan-anim .leaflet-tile{transition:none}.leaflet-tile{pointer-events:none}.leaflet-marker-icon,.leaflet-marker-shadow{display:block}.leaflet-div-icon{background:#fff;border:1px solid #666}.leaflet-popup{position:absolute;text-align:center;margin-bottom:20px}.leaflet-popup-content-wrapper{padding:1px;text-align:left;border-radius:4px;background:white}.leaflet-popup-content{margin:13px 24px 11px;line-height:1.3}.leaflet-popup-tip-container{width:40px;height:20px;position:absolute;left:50%;margin-left:-20px;overflow:hidden;pointer-events:none}.leaflet-popup-tip{width:17px;height:17px;padding:1px;margin:-10px auto 0;transform:rotate(45deg);background:white}.leaflet-container a.leaflet-popup-close-button{position:absolute;top:0;right:0;padding:4px 4px 0 0;border:none;text-align:center;width:18px;height:14px;font:16px/14px Tahoma,Verdana,sans-serif;color:#757575;text-decoration:none;font-weight:bold;background:transparent}.leaflet-control-zoom a{text-decoration:none}.leaflet-control-layers,.leaflet-control-zoom,.leaflet-control-attribution{background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.4)}.leaflet-control-zoom{border:2px solid rgba(0,0,0,.2)}.leaflet-control-zoom a{width:26px;height:26px;line-height:26px;display:block;text-align:center;text-decoration:none;color:black;font:bold 18px 'Lucida Console',Monaco,monospace}.leaflet-touch .leaflet-control-zoom a{width:30px;height:30px;line-height:30px}.leaflet-control-attribution{padding:0 5px;color:#333;font-size:11px}`;
      document.head.appendChild(st);
    }
    const ex = document.getElementById("lflt-js");
    if (ex && window.L) { cb(); return; }
    if (!ex) {
      const sc = document.createElement("script");
      sc.id = "lflt-js";
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      sc.onload = cb;
      document.head.appendChild(sc);
    } else {
      ex.addEventListener("load", cb);
    }
  }

  useEffect(() => {
    let dead = false;
    injectLeaflet(() => {
      if (dead || initialized.current || !containerRef.current) return;
      initialized.current = true;
      const L = window.L;
      lRef.current = L;
      const map = L.map(containerRef.current, {
        center: [51.16, 10.45], zoom: 6,
        zoomControl: true, attributionControl: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      L.control.attribution({ prefix: "© OSM" }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      dead = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; initialized.current = false; }
    };
  }, []);

  // Pan to user pos
  useEffect(() => {
    const L = lRef.current; const map = mapRef.current;
    if (!L || !map || !userPos) return;
    // Remove old user marker
    map.eachLayer(layer => { if (layer._isUserMarker) map.removeLayer(layer); });
    const icon = L.divIcon({ className: "", html: "<div style='width:14px;height:14px;border-radius:50%;background:" + T.gold + ";border:2px solid #fff;box-shadow:0 0 0 6px rgba(201,168,76,.3)'></div>", iconSize: [14,14], iconAnchor: [7,7] });
    const m = L.marker(userPos, { icon }).addTo(map);
    m._isUserMarker = true;
    map.setView(userPos, 14, { animate: true });
  }, [userPos]);

  // Draw restaurant markers
  useEffect(() => {
    const L = lRef.current; const map = mapRef.current;
    if (!L || !map) return;
    map.eachLayer(layer => { if (layer._isRestaurant) map.removeLayer(layer); });
    restaurants.forEach(r => {
      if (!r.lat || !r.lng) return;
      const isSel = r.id === selectedId;
      const sz = isSel ? 38 : 30;
      const icon = L.divIcon({
        className: "",
        html: "<div style='width:" + sz + "px;height:" + sz + "px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:" + (isSel ? T.gold : T.bgRaised) + ";border:2px solid " + T.gold + ";box-shadow:0 3px 12px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center'><span style='transform:rotate(45deg);font-size:10px;font-weight:700;color:" + (isSel ? T.bg : T.gold) + ";font-family:sans-serif'>" + r.globalAvg.toFixed(1) + "</span></div>",
        iconSize: [sz,sz], iconAnchor: [sz/2,sz], popupAnchor: [0,-sz],
      });
      const popup = "<div style='font-family:sans-serif;min-width:140px;padding:2px'><b style='font-size:13px'>" + r.name + "</b><br><span style='font-size:11px;color:#666'>" + (r.city || "") + (r.cuisine ? " · " + r.cuisine : "") + "</span><br><span style='color:#a07828;font-size:12px'>★ " + r.globalAvg.toFixed(1) + "</span></div>";
      const marker = L.marker([r.lat, r.lng], { icon }).addTo(map).bindPopup(popup);
      marker._isRestaurant = true;
      marker.on("click", () => onSelect(r));
      if (isSel) { setTimeout(() => marker.openPopup(), 80); map.setView([r.lat, r.lng], 15, { animate: true }); }
    });
  }, [restaurants, selectedId]);

  return (
    <div style={{ position: "relative", width: "100%", height: 280, borderRadius: "14px 14px 0 0", overflow: "hidden", background: T.bgRaised }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ─── RESTAURANT SEARCH MODAL ──────────────────────────────────────────────────
function RestaurantSearchModal({ onSelect, onClose }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [loading, setLoading] = useState(false); const [msg, setMsg] = useState("");
  const timer = useRef(null);
  function handleChange(e) {
    const val = e.target.value; setQ(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setMsg(""); return; }
    timer.current = setTimeout(async () => {
      setLoading(true); setMsg("");
      try { const res = await searchRestaurantsAI(val); setResults(res); if (!res.length) setMsg("Keine Treffer gefunden."); }
      catch(err) { setMsg("Fehler: " + (err.message || "Verbindungsfehler")); }
      finally { setLoading(false); }
    }, 800);
  }
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, backdropFilter: "blur(8px)" }}>
      <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: "20px 20px 0 0", padding: "28px 22px 36px", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", animation: "slideUp .3s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: 20, color: T.text }}>Restaurant suchen</div>
          <button onClick={onClose} style={{ background: T.bgRaised, border: "1px solid " + T.border, color: T.textDim, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input autoFocus value={q} onChange={handleChange} placeholder="Name, Küche oder Ort …" style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + T.borderHi, borderRadius: 10, padding: "12px 44px 12px 16px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none" }}
            onFocus={e => { e.target.style.borderColor = T.gold; }} onBlur={e => { e.target.style.borderColor = T.borderHi; }} />
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>{loading ? "⏳" : "🔍"}</span>
        </div>
        <div style={{ fontSize: 10, color: T.textFade, marginBottom: 12, letterSpacing: 1 }}>via Claude AI · {results.length ? results.length + " Treffer" : "min. 2 Zeichen"}</div>
        {msg && <div style={{ fontSize: 12, color: "#e74c3c", marginBottom: 10 }}>{msg}</div>}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map(r => (
            <div key={r.id} onClick={() => onSelect(r)}
              style={{ background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 16px", cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.background = T.bgHover; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bgRaised; }}>
              <div style={{ fontSize: 14, color: T.text, marginBottom: 3, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.textDim }}>{r.street && r.street + " · "}📍 {r.city || ""}{r.cuisine && " · " + r.cuisine}</div>
            </div>
          ))}
          {q.length < 2 && <div style={{ textAlign: "center", color: T.textFade, padding: "40px 0", fontSize: 13 }}>Mindestens 2 Zeichen eingeben<br /><span style={{ fontSize: 32, display: "block", marginTop: 16 }}>🍽️</span></div>}
        </div>
      </div>
    </div>
  );
}

// ─── ENTDECKEN TAB ────────────────────────────────────────────────────────────
function EntdeckenTab({ myVisits }) {
  const [userPos, setUserPos] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [nearby, setNearby] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("map");

  const myKeys = new Set(myVisits.map(v => (v.name + "||" + v.city).toLowerCase()));
  const displayed = searchResults || nearby;

  async function loadNearbyOverpass(lat, lng) {
    setNearbyLoading(true);
    try {
      const data = await fetchPlaces("nearby", { lat, lon: lng });
      const results = data.filter(r => r.class === "amenity" && r.type === "restaurant").map(nominatimToRestaurant);
      setNearby(results.slice(0, 25));
    } catch {
      // Overpass blocked or failed — show empty, user can search manually
      setNearby([]);
    } finally {
      setNearbyLoading(false);
    }
  }

  function locate() {
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(c); setGeoStatus("ok");
        loadNearbyOverpass(c[0], c[1]);
      },
      () => {
        // On denial just set Frankfurt as center — don't load nearby automatically
        setUserPos([50.1109, 8.6821]);
        setGeoStatus("denied");
      },
      { timeout: 8000 }
    );
  }

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true); setSearchResults(null); setSearchErr(null); setSelectedId(null);
    try {
      const res = await searchRestaurantsAI(query);
      setSearchResults(res); setView("list");
    } catch(err) {
      setSearchErr("Fehler: " + (err.message || "Verbindungsproblem"));
    } finally {
      setSearching(false);
    }
  }

  // Auto-locate on first mount only
  useEffect(() => { locate(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Map */}
      <div style={{ position: "relative", margin: "0 16px", borderRadius: 14, overflow: "hidden", border: "1px solid " + T.border }}>
        <TileMap userPos={userPos} restaurants={displayed} onSelect={r => { setSelectedId(r.id); setView("list"); }} selectedId={selectedId} />
        <button onClick={locate} style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "rgba(8,10,12,.85)", border: "1px solid " + (geoStatus === "ok" ? T.gold : T.border), borderRadius: 20, padding: "6px 14px", color: geoStatus === "ok" ? T.gold : T.textDim, fontSize: 11, cursor: "pointer", backdropFilter: "blur(8px)", letterSpacing: 1, fontFamily: "DM Sans, sans-serif" }}>
          {geoStatus === "loading" ? "⏳ Orten…" : geoStatus === "ok" ? "📍 Aktiv" : geoStatus === "denied" ? "⚠️ Frankfurt" : "📍 Orten"}
        </button>
        {nearbyLoading && <div style={{ position: "absolute", bottom: 52, left: "50%", transform: "translateX(-50%)", zIndex: 1000, background: "rgba(8,10,12,.9)", border: "1px solid " + T.goldDim, borderRadius: 20, padding: "7px 16px", fontSize: 11, color: T.gold, backdropFilter: "blur(8px)" }}>Lade Restaurants …</div>}
        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1000 }}>
          <div style={{ display: "flex", background: "rgba(8,10,12,.9)", border: "1px solid " + T.border, borderRadius: 20, overflow: "hidden", backdropFilter: "blur(8px)" }}>
            {[{ k: "map", l: "Karte" }, { k: "list", l: "Liste" }].map(t => (
              <button key={t.k} onClick={() => setView(t.k)} style={{ background: view === t.k ? T.bgHover : "transparent", border: "none", padding: "7px 20px", color: view === t.k ? T.gold : T.textDim, fontSize: 11, cursor: "pointer", fontFamily: "DM Sans, sans-serif", letterSpacing: 1, textTransform: "uppercase", transition: "all .2s", borderTop: "2px solid " + (view === t.k ? T.gold : "transparent") }}>{t.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Küche, Stadt, Restaurantname …"
            style={{ flex: 1, background: T.bgCard, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 16px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none" }}
            onFocus={e => { e.target.style.borderColor = T.gold; }} onBlur={e => { e.target.style.borderColor = T.border; }} />
          <button onClick={doSearch} disabled={searching || !query.trim()} style={{ background: searching || !query.trim() ? T.bgRaised : "linear-gradient(135deg,#a07828," + T.gold + ")", border: "none", borderRadius: 10, color: searching || !query.trim() ? T.muted : T.bg, padding: "0 18px", fontSize: 16, cursor: searching || !query.trim() ? "not-allowed" : "pointer" }}>{searching ? "⏳" : "🔍"}</button>
          {searchResults && <button onClick={() => { setSearchResults(null); setSelectedId(null); setQuery(""); }} style={{ background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, color: T.textDim, padding: "0 14px", fontSize: 13, cursor: "pointer" }}>✕</button>}
        </div>
        {searchErr && <div style={{ color: T.red, fontSize: 12, marginTop: 8 }}>{searchErr}</div>}
      </div>

      {/* List */}
      {view === "list" && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>
            {searchResults ? searchResults.length + " Ergebnisse" : nearbyLoading ? "Lädt …" : displayed.length + " Restaurants in der Nähe"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {displayed.map(r => {
              const visited = myKeys.has((r.name + "||" + r.city).toLowerCase());
              const isSel = r.id === selectedId;
              return (
                <GlassCard key={r.id} hover onClick={() => { setSelectedId(isSel ? null : r.id); setView("map"); }}
                  style={{ padding: "14px 16px", border: "1px solid " + (isSel ? T.gold : T.border) }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0, background: isSel ? T.goldGlow : T.bgRaised, border: "2px solid " + (isSel ? T.gold : T.border), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.gold, lineHeight: 1, fontFamily: "DM Sans, sans-serif" }}>{r.globalAvg.toFixed(1)}</div>
                      <div style={{ fontSize: 8, color: T.textFade, letterSpacing: 1 }}>GLOBAL</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{r.name}</span>
                        {visited && <Badge>✓ Besucht</Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: T.textDim, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.city && <span>📍 {r.city}</span>}{r.cuisine && <span>· {r.cuisine}</span>}{r.priceRange && <span>· {r.priceRange}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: T.textFade }}>{r.globalCount.toLocaleString("de")}</div>
                      <div style={{ fontSize: 9, color: T.sub }}>Bewert.</div>
                    </div>
                  </div>
                  {isSel && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.border }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ fontSize: 36, fontWeight: 700, color: T.gold, lineHeight: 1, fontFamily: "Playfair Display, serif" }}>{r.globalAvg.toFixed(1)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ marginBottom: 6 }}><Stars rating={Math.round(r.globalAvg)} size={14} /></div>
                          <div style={{ fontSize: 10, color: T.textDim }}>{r.globalCount.toLocaleString("de")} Bewertungen weltweit</div>
                        </div>
                      </div>
                      {r.openingHours && <div style={{ fontSize: 11, color: T.textDim, marginTop: 10 }}>🕐 {r.openingHours}</div>}
                      {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.gold, textDecoration: "none", display: "block", marginTop: 6 }}>🌐 Website öffnen ↗</a>}
                    </div>
                  )}
                </GlassCard>
              );
            })}
            {displayed.length === 0 && !nearbyLoading && <div style={{ textAlign: "center", color: T.textFade, padding: "50px 0", fontSize: 13 }}>Standort erlauben oder oben suchen<br /><span style={{ fontSize: 32, display: "block", marginTop: 16 }}>🗺️</span></div>}
          </div>
        </div>
      )}
      {view === "map" && !selectedId && <div style={{ padding: "14px 16px 0", fontSize: 11, color: T.textFade, textAlign: "center", letterSpacing: 1 }}>Pin antippen · Karte wischen zum Erkunden</div>}
    </div>
  );
}

// ─── LEADERBOARD TAB ──────────────────────────────────────────────────────────
const SORT_MODES = [
  { key: "score",  label: "Score",       icon: "🏆", get: s => s.score },
  { key: "avg",    label: "Ø Sterne",    icon: "⭐", get: s => s.avgRating },
  { key: "visits", label: "Besuche",     icon: "🚶", get: s => s.totalVisits },
  { key: "unique", label: "Restaurants", icon: "🗺️", get: s => s.uniqueRestaurants },
];
function LeaderboardTab({ myVisits, friends }) {
  const [sort, setSort] = useState("score");
  const [expanded, setExpanded] = useState(null);
  const mode = SORT_MODES.find(m => m.key === sort);
  const players = [{ id: "me", name: "Du", avatar: "👤", isMe: true, visits: myVisits }, ...friends]
    .map(p => ({ ...p, ...calcStats(p.visits || []) })).sort((a, b) => mode.get(b) - mode.get(a));
  const myPos = players.findIndex(p => p.isMe);
  const leader = players[0];

  return (
    <div style={{ padding: "0 16px" }}>
      {/* Sort pills */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 20, scrollbarWidth: "none" }}>
        {SORT_MODES.map(m => (
          <button key={m.key} onClick={() => setSort(m.key)} style={{ background: sort === m.key ? T.bgHover : T.bgCard, border: "1px solid " + (sort === m.key ? T.gold : T.border), color: sort === m.key ? T.gold : T.textDim, borderRadius: 20, padding: "6px 14px", fontSize: 11, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase", fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap", transition: "all .2s" }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* Leader spotlight */}
      <div style={{ background: "linear-gradient(135deg, " + T.bgCard + " 0%, " + T.bgRaised + " 100%)", border: "1px solid " + T.goldDim, borderRadius: 16, padding: "22px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 70% 30%, " + T.goldGlow + " 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: 80, opacity: 0.04, pointerEvents: "none" }}>🏆</div>
        <div style={{ fontSize: 9, letterSpacing: 4, color: T.goldDim, textTransform: "uppercase", marginBottom: 14 }}>{mode.icon} Führend · {mode.label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 40 }}>{leader.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, color: T.text, fontFamily: "Playfair Display, serif", marginBottom: 4 }}>{leader.isMe ? "Du" : leader.name}</div>
            <div style={{ fontSize: 12, color: getRank(leader.score).color }}>{getRank(leader.score).emoji} {getRank(leader.score).title}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: T.gold, lineHeight: 1, fontFamily: "Playfair Display, serif" }}>{sort === "avg" ? leader.avgRating.toFixed(1) : mode.get(leader)}</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{sort === "score" ? "Punkte" : sort === "avg" ? "/ 5 Sterne" : sort === "visits" ? "Besuche" : "Restaurants"}</div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {players.map((p, i) => {
          const isExp = expanded === p.id;
          const podium = i === 0 ? { bg: "linear-gradient(135deg,#7a5a18," + T.gold + ")", c: T.bg } : i === 1 ? { bg: "linear-gradient(135deg,#555,#999)", c: T.bg } : i === 2 ? { bg: "linear-gradient(135deg,#5a3010,#a06040)", c: "#fff" } : { bg: T.bgRaised, c: T.textDim };
          const gap = p.isMe ? null : mode.get(p) - mode.get(players[myPos]);
          return (
            <GlassCard key={p.id} hover onClick={() => setExpanded(isExp ? null : p.id)}
              style={{ padding: "14px 16px", border: "1px solid " + (p.isMe ? T.goldDim : isExp ? T.borderHi : T.border) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: podium.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: podium.c, flexShrink: 0, fontFamily: "DM Sans, sans-serif" }}>{i + 1}</div>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{p.avatar}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, color: p.isMe ? T.gold : T.text, fontWeight: 600 }}>{p.isMe ? "Du" : p.name}</span>
                    {p.isMe && <Badge>Ich</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {SORT_MODES.map(m => <span key={m.key} style={{ fontSize: 11, color: sort === m.key ? (p.isMe ? T.gold : "#c0b090") : T.textFade, fontWeight: sort === m.key ? 700 : 400, fontFamily: "DM Sans, sans-serif" }}>{m.icon} {m.key === "avg" ? m.get(p).toFixed(1) : m.get(p)}</span>)}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: p.isMe ? T.gold : "#c0b090", fontFamily: "DM Sans, sans-serif" }}>{sort === "avg" ? p.avgRating.toFixed(1) : mode.get(p)}</div>
                  {!p.isMe && gap !== null && <div style={{ fontSize: 10, marginTop: 2, color: gap > 0 ? T.red : T.green }}>{gap > 0 ? "+" + gap + " vor dir" : gap === 0 ? "gleich" : Math.abs(gap) + " zurück"}</div>}
                </div>
                <div style={{ color: T.textFade, fontSize: 11 }}>{isExp ? "▲" : "▼"}</div>
              </div>
              {isExp && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.border }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>Punkte-Details</div>
                  {calcBreakdown(p.visits || []).detail.map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid " + T.border }}>
                      <div>
                        <div style={{ fontSize: 13, color: T.text }}>{!v.first && <span style={{ color: T.textFade }}>↩ </span>}{v.name}<span style={{ color: T.textDim, marginLeft: 6 }}>📍{v.city}</span></div>
                        <div style={{ fontSize: 10, color: T.textFade, marginTop: 3, display: "flex", gap: 8 }}><span>{v.first ? "Erstbesuch +20" : "Wiederholung +5"}</span>{v.review && <span style={{ color: "#7acc60" }}>✍ +3</span>}{v.photo && <span style={{ color: "#6a90c0" }}>📸 +5</span>}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}><Stars rating={v.rating} size={10} /><span style={{ fontSize: 14, fontWeight: 700, color: T.gold, fontFamily: "DM Sans, sans-serif" }}>+{v.pts}</span></div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4, gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>Gesamt</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: T.gold, fontFamily: "Playfair Display, serif" }}>{p.score} Pkt</span>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
      {players.length <= 1 && <div style={{ textAlign: "center", color: T.textFade, padding: "40px 0", fontSize: 13 }}>Noch keine Freunde in der League.<br />Lade sie über Profil → Freunde ein! 🏆</div>}
    </div>
  );
}

// ─── MY RESTAURANTS TAB ───────────────────────────────────────────────────────
function MyTab({ visits, setVisits, currentUserId }) {
  const [showModal, setShowModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [recommendTarget, setRecommendTarget] = useState(null);
  const [form, setForm] = useState({ name: "", city: "", street: "", cuisine: "", rating: 0, review: "", photo: null });
  const [sortBy, setSortBy] = useState("date");
  const [animateNew, setAnimateNew] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const fileRef = useRef();

  const stats = calcStats(visits);
  const rank = getRank(stats.score);
  const sorted = [...stats.detail].sort((a, b) => { if (sortBy === "rating") return b.rating - a.rating; if (sortBy === "pts") return b.pts - a.pts; if (sortBy === "name") return a.name.localeCompare(b.name); return new Date(b.date) - new Date(a.date); });

  function previewPts() {
    if (!form.name || !form.city || !form.rating) return null;
    const key = (form.name + "||" + form.city).toLowerCase();
    const seen = new Set(visits.map(v => (v.name + "||" + v.city).toLowerCase()));
    let p = seen.has(key) ? 5 : 20; if (form.review) p += 3; if (form.photo) p += 5; return p;
  }
  function handleSelect(r) { setForm(f => ({ ...f, name: r.name, city: r.city || "", street: r.street || "", cuisine: r.cuisine || "" })); setShowSearch(false); }
  function handleAdd() {
    if (!form.name || !form.city || !form.rating) return;
    const nv = { ...form, id: Date.now(), date: new Date().toISOString().slice(0, 10) };
    setVisits(p => [...p, nv]); setAnimateNew(nv.id); setTimeout(() => setAnimateNew(null), 800);
    setForm({ name: "", city: "", street: "", cuisine: "", rating: 0, review: "", photo: null }); setShowModal(false);
  }
  const pts = previewPts();

  return (
    <>
      {/* Score Hero */}
      <div style={{ margin: "0 16px" }}>
        <div style={{ background: "linear-gradient(135deg, " + T.bgCard + ", " + T.bgRaised + ")", border: "1px solid " + T.goldDim, borderRadius: 16, padding: "22px 22px 18px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 50%, " + T.goldGlow + " 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: -10, right: -10, fontSize: 70, opacity: 0.05, pointerEvents: "none" }}>🏆</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 4, color: T.goldDim, textTransform: "uppercase", marginBottom: 8 }}>League Score</div>
              <div style={{ fontSize: 52, fontWeight: 700, color: T.gold, lineHeight: 1, letterSpacing: -2, fontFamily: "Playfair Display, serif" }}>{stats.score}</div>
              <div style={{ fontSize: 13, color: rank.color, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>{rank.emoji} {rank.title}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "right" }}>
              {[{ l: "Besuche", v: stats.totalVisits }, { l: "Restaurants", v: stats.uniqueRestaurants }, { l: "Ø Sterne", v: stats.avgRating.toFixed(1) }].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1, fontFamily: "DM Sans, sans-serif" }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: T.textFade, letterSpacing: 1, textTransform: "uppercase" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: 18, height: 3, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.min((stats.score / 250) * 100, 100) + "%", background: "linear-gradient(90deg, #7a5a18, " + T.gold + ")", borderRadius: 2, transition: "width 1s cubic-bezier(.22,1,.36,1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <div style={{ fontSize: 9, color: T.textFade }}>{rank.title}</div>
            <div style={{ fontSize: 9, color: T.textFade }}>{stats.score >= 200 ? "Max" : stats.score >= 120 ? "Grand Chef bei 200" : stats.score >= 60 ? "Connaisseur bei 120" : "Aficionado bei 60"}</div>
          </div>
        </div>

        {/* Breakdown toggle */}
        <button onClick={() => setShowBreakdown(b => !b)} style={{ width: "100%", marginTop: 8, background: "transparent", border: "1px solid " + T.border, color: T.textDim, borderRadius: 10, padding: "8px", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontFamily: "DM Sans, sans-serif", transition: "border-color .2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = T.borderHi} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
          {showBreakdown ? "▲ Verbergen" : "▼ Punkte-Aufschlüsselung"}
        </button>
        {showBreakdown && (
          <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: 10, padding: "16px", marginTop: 2 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>Erstbesuch = 20 · Wiederholt = 5 · ✍ +3 · 📸 +5</div>
            {sorted.map(v => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid " + T.border }}>
                <div><div style={{ fontSize: 12, color: T.text }}>{!v.first && <span style={{ color: T.textFade }}>↩ </span>}{v.name}</div><div style={{ fontSize: 10, color: T.textFade, marginTop: 2, display: "flex", gap: 8 }}><span>{v.first ? "+20" : "+5"}</span>{v.review && <span style={{ color: "#7acc60" }}>✍ +3</span>}{v.photo && <span style={{ color: "#6a90c0" }}>📸 +5</span>}</div></div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.gold, fontFamily: "DM Sans, sans-serif" }}>+{v.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 12px", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {[{ k: "date", l: "Neu" }, { k: "rating", l: "Sterne" }, { k: "pts", l: "Punkte" }, { k: "name", l: "A–Z" }].map(s => (
            <button key={s.k} onClick={() => setSortBy(s.k)} style={{ background: sortBy === s.k ? T.bgHover : "transparent", border: "1px solid " + (sortBy === s.k ? T.gold : T.border), color: sortBy === s.k ? T.gold : T.textDim, borderRadius: 20, padding: "5px 13px", fontSize: 10, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase", fontFamily: "DM Sans, sans-serif", transition: "all .2s", whiteSpace: "nowrap" }}>{s.l}</button>
          ))}
        </div>
        <GoldButton onClick={() => setShowModal(true)} small>＋ Eintrag</GoldButton>
      </div>

      {/* Visit list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px" }}>
        {sorted.map((v, i) => (
          <GlassCard key={v.id} style={{ padding: "14px 16px", border: "1px solid " + (animateNew === v.id ? T.gold : T.border), animation: animateNew === v.id ? "slideIn .4s ease" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Rank number */}
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: i === 0 ? "linear-gradient(135deg,#7a5a18," + T.gold + ")" : i === 1 ? "linear-gradient(135deg,#555,#999)" : i === 2 ? "linear-gradient(135deg,#5a3010,#a06040)" : T.bgRaised, border: "1px solid " + (i < 3 ? "transparent" : T.border), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? T.bg : T.textDim, fontFamily: "DM Sans, sans-serif" }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</span>
                  {!v.first && <Badge color={T.textDim}>↩ Wieder</Badge>}
                </div>
                <div style={{ fontSize: 11, color: T.textDim, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  📍{v.city}{v.cuisine && <span>· {v.cuisine}</span>}
                  {v.review && <span style={{ color: "#7acc60" }}>✍</span>}
                  {v.photo && <span style={{ color: "#6a90c0" }}>📸</span>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <Stars rating={v.rating} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.gold, marginTop: 4, fontFamily: "DM Sans, sans-serif" }}>+{v.pts}</div>
                  <div style={{ fontSize: 9, color: T.textFade }}>{v.date}</div>
                </div>
                <button onClick={() => setRecommendTarget(v)}
                  style={{ background: "transparent", border: "1px solid " + T.border, borderRadius: 8, color: T.textDim, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "DM Sans, sans-serif", display: "flex", alignItems: "center", gap: 5, transition: "all .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.color = T.gold; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}>
                  <span style={{ fontSize: 13 }}>📤</span> Empfehlen
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
        {sorted.length === 0 && <div style={{ textAlign: "center", color: T.textFade, padding: "50px 0", fontSize: 13 }}>Noch keine Einträge.<br /><span style={{ fontSize: 32, display: "block", marginTop: 16 }}>🍽️</span></div>}
      </div>

      {/* Add modal */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100, backdropFilter: "blur(8px)" }}>
          <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: "20px 20px 0 0", padding: "28px 22px 40px", width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", animation: "slideUp .3s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: T.text }}>Neuer Eintrag</div>
              <button onClick={() => setShowModal(false)} style={{ background: T.bgRaised, border: "1px solid " + T.border, color: T.textDim, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Search button */}
            <button onClick={() => setShowSearch(true)} style={{ width: "100%", marginBottom: 18, background: T.bgRaised, border: "1px solid " + T.borderHi, borderRadius: 12, color: T.textDim, padding: "14px 18px", fontSize: 14, fontFamily: "DM Sans, sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.color = T.text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.color = T.textDim; }}>
              <span style={{ fontSize: 20 }}>🔍</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: T.text }}>Restaurant suchen</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>Echtdaten via Claude AI</div>
              </div>
              <span style={{ marginLeft: "auto", opacity: 0.5 }}>→</span>
            </button>

            {form.name && (
              <div style={{ background: "rgba(39,174,96,.08)", border: "1px solid rgba(39,174,96,.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: T.green, marginBottom: 4, letterSpacing: 1 }}>✓ AUSGEWÄHLT</div>
                <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{form.name}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{form.street && form.street + ", "}{form.city}{form.cuisine && " · " + form.cuisine}</div>
              </div>
            )}

            <div style={{ background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 11, color: T.textDim, lineHeight: 1.9 }}>
              <b style={{ color: T.gold }}>Erstbesuch</b> = 20 Pkt &nbsp;·&nbsp; <b style={{ color: T.gold }}>Wiederholt</b> = 5 Pkt &nbsp;·&nbsp; <span style={{ color: "#7acc60" }}>✍</span> +3 &nbsp;·&nbsp; <span style={{ color: "#6a90c0" }}>📸</span> +5
            </div>

            {[{ k: "name", l: "Restaurant-Name", p: "z.B. Zum Franziskaner" }, { k: "city", l: "Stadt", p: "z.B. Frankfurt" }, { k: "cuisine", l: "Küche (optional)", p: "z.B. Deutsch, Japanisch …" }].map(({ k, l, p }) => (
              <InputField key={k} label={l} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={p} />
            ))}

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, textTransform: "uppercase", marginBottom: 10, fontFamily: "DM Sans, sans-serif" }}>Bewertung</div>
              <StarPicker value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#7acc60", textTransform: "uppercase", marginBottom: 8, fontFamily: "DM Sans, sans-serif" }}>✍ Rezension <span style={{ color: T.textFade, letterSpacing: 0 }}>(optional · +3)</span></div>
              <textarea value={form.review} onChange={e => setForm(f => ({ ...f, review: e.target.value || null }))} placeholder="Was war besonders gut oder schlecht?" rows={3}
                style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13, fontFamily: "DM Sans, sans-serif", outline: "none", resize: "vertical" }}
                onFocus={e => { e.target.style.borderColor = "#7acc60"; }} onBlur={e => { e.target.style.borderColor = T.border; }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#6a90c0", textTransform: "uppercase", marginBottom: 8, fontFamily: "DM Sans, sans-serif" }}>📸 Foto <span style={{ color: T.textFade, letterSpacing: 0 }}>(optional · +5)</span></div>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => { if (e.target.files[0]) setForm(f => ({ ...f, photo: "📸" })); }} style={{ display: "none" }} />
              <button onClick={() => fileRef.current.click()} style={{ background: form.photo ? "rgba(106,144,192,.1)" : T.bgRaised, border: "1px solid " + (form.photo ? "#6a90c0" : T.border), borderRadius: 10, padding: "11px 18px", color: form.photo ? "#6a90c0" : T.textDim, fontSize: 13, fontFamily: "DM Sans, sans-serif", cursor: "pointer", width: "100%", transition: "all .2s" }}>
                {form.photo ? "📸 Foto ausgewählt ✓" : "Foto auswählen …"}
              </button>
            </div>

            <GoldButton onClick={handleAdd} disabled={!form.name || !form.city || !form.rating} fullWidth>
              {pts ? "Eintragen · +" + pts + " Punkte" : "Eintragen"}
            </GoldButton>
          </div>
        </div>
      )}
      {showSearch && <RestaurantSearchModal onSelect={handleSelect} onClose={() => setShowSearch(false)} />}
      {recommendTarget && <RecommendModal visit={recommendTarget} currentUserId={currentUserId} onClose={() => setRecommendTarget(null)} />}
    </>
  );
}

// ─── RECOMMEND MODAL ─────────────────────────────────────────────────────────
function RecommendModal({ visit, currentUserId, onClose }) {
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const me = loadUserSync(currentUserId);
    if (!me) return;
    const profiles = (me.friends || []).map(fid => loadUserSync(fid)).filter(Boolean);
    setFriends(profiles);
  }, [currentUserId]);

  function loadUserSync(uid) {
    const v = LS.get("user:" + uid);
    return v ? JSON.parse(v) : null;
  }

  function toggle(fid) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
  }

  async function send() {
    if (selected.size === 0) return;
    setSending(true);
    const me = loadUserSync(currentUserId);
    const rec = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      fromId: currentUserId,
      fromName: me?.name || "Jemand",
      fromAvatar: me?.avatar || "🧑",
      restaurantName: visit.name,
      restaurantCity: visit.city,
      restaurantCuisine: visit.cuisine || "",
      rating: visit.rating,
      note: note.trim(),
      sentAt: Date.now(),
      read: false,
    };
    for (const fid of selected) {
      const friend = loadUserSync(fid);
      if (!friend) continue;
      const updated = { ...friend, recommendations: [...(friend.recommendations || []), rec] };
      LS.set("user:" + fid, JSON.stringify(updated));
    }
    setSending(false);
    setDone(true);
    setTimeout(onClose, 1400);
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300, backdropFilter: "blur(8px)" }}>
      <div style={{ background: T.bgCard, border: "1px solid " + T.border, borderRadius: "20px 20px 0 0", padding: "26px 22px 36px", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", animation: "slideUp .3s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: 20, color: T.text }}>Empfehlen</div>
          <button onClick={onClose} style={{ background: T.bgRaised, border: "1px solid " + T.border, color: T.textDim, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Restaurant preview */}
        <div style={{ background: T.bgRaised, border: "1px solid " + T.goldDim, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{visit.name}</div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>
            📍 {visit.city}{visit.cuisine && " · " + visit.cuisine}
          </div>
          <div style={{ marginTop: 6 }}><Stars rating={visit.rating} size={14} /></div>
          {visit.review && <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, fontStyle: "italic" }}>"{visit.review}"</div>}
        </div>

        {/* Friend selector */}
        <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 10 }}>An wen empfehlen?</div>
        {friends.length === 0 ? (
          <div style={{ color: T.textFade, fontSize: 13, padding: "12px 0", textAlign: "center" }}>Noch keine Freunde. Füge zuerst Freunde hinzu!</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, overflowY: "auto", maxHeight: 200 }}>
            {friends.map(f => {
              const isSelected = selected.has(f.id);
              return (
                <div key={f.id} onClick={() => toggle(f.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: isSelected ? "rgba(201,168,76,.1)" : T.bgRaised, border: "1px solid " + (isSelected ? T.gold : T.border), borderRadius: 10, padding: "11px 14px", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid " + (isSelected ? T.gold : T.border), background: isSelected ? T.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                    {isSelected && <span style={{ fontSize: 11, color: T.bg, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 20 }}>{f.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{f.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Optional note */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 8 }}>Persönliche Notiz (optional)</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Muss man unbedingt probieren!" rows={2}
            style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "11px 14px", color: T.text, fontSize: 13, fontFamily: "DM Sans, sans-serif", outline: "none", resize: "none" }}
            onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "10px 0", fontSize: 15, color: T.green }}>✓ Empfehlung gesendet!</div>
        ) : (
          <GoldButton onClick={send} disabled={selected.size === 0 || sending || friends.length === 0} fullWidth>
            {sending ? "Sende …" : selected.size > 0 ? "An " + selected.size + " Friend" + (selected.size > 1 ? "s" : "") + " senden" : "Freund auswählen"}
          </GoldButton>
        )}
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]     = useState("welcome");
  const [email, setEmail]   = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [name, setName]     = useState(""); const [avatar, setAvatar] = useState("🧑");
  const [loading, setLoading] = useState(false); const [err, setErr] = useState(""); const [showPw, setShowPw] = useState(false);

  async function handleRegister() {
    if (!name.trim())         { setErr("Bitte einen Namen eingeben."); return; }
    if (!email.includes("@")) { setErr("Bitte eine gültige E-Mail eingeben."); return; }
    if (pw.length < 6)        { setErr("Passwort mind. 6 Zeichen."); return; }
    if (pw !== pw2)           { setErr("Passwörter stimmen nicht überein."); return; }
    setLoading(true); setErr("");
    try {
      const existing = await lookupEmail(email);
      if (existing) { setErr("E-Mail bereits registriert."); setLoading(false); return; }
      const id = genId(); const hash = await hashPw(pw);
      const user = { id, name: name.trim(), avatar, email: email.toLowerCase().trim(), pwHash: hash, visits: ME_SEED, friends: [], friendRequests: [], sentRequests: [], inviteCode: genCode(), createdAt: Date.now() };
      await saveUser(user);
      await saveEmailIndex(email, id);
      // Verify it was saved correctly
      const verify = await loadUser(id);
      if (!verify) { setErr("Speichern fehlgeschlagen — bitte nochmal versuchen."); setLoading(false); return; }
      onAuth(user);
    } catch(e) {
      setErr("Registrierung fehlgeschlagen: " + (e.message || "Unbekannter Fehler"));
      setLoading(false);
    }
  }
  async function handleLogin() {
    if (!email.includes("@")) { setErr("Bitte eine gültige E-Mail eingeben."); return; }
    if (!pw)                  { setErr("Bitte ein Passwort eingeben."); return; }
    setLoading(true); setErr("");
    try {
      const uid = await lookupEmail(email);
      if (!uid) { setErr("Kein Konto mit dieser E-Mail gefunden. Bitte zuerst registrieren."); setLoading(false); return; }
      const u = await loadUser(uid);
      if (!u) { setErr("Konto-Daten nicht gefunden (uid: " + uid + "). Bitte neu registrieren."); setLoading(false); return; }
      const hash = await hashPw(pw);
      if (hash !== u.pwHash) { setErr("Falsches Passwort."); setLoading(false); return; }
      onAuth(u);
    } catch(e) {
      setErr("Anmeldung fehlgeschlagen: " + (e.message || "Unbekannter Fehler"));
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "DM Sans, sans-serif", color: T.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", position: "relative", overflow: "hidden" }}>
      {/* Background decoration */}
      <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(circle, rgba(201,168,76,.06) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "5%", right: "5%", fontSize: 120, opacity: 0.03, pointerEvents: "none" }}>🏆</div>

      <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg," + T.bgCard + "," + T.bgRaised + ")", border: "1px solid " + T.goldDim, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32, boxShadow: "0 0 40px " + T.goldGlow }}>🏆</div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: 28, color: T.text, letterSpacing: -0.5, marginBottom: 6 }}>Gourmet League</div>
          <div style={{ fontSize: 12, color: T.textDim, letterSpacing: 2 }}>DEIN KULINARISCHES RANKING</div>
        </div>

        {mode === "welcome" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <GoldButton onClick={() => setMode("register")} fullWidth>Konto erstellen</GoldButton>
            <GhostButton onClick={() => setMode("login")} fullWidth>Anmelden</GhostButton>
          </div>
        )}

        {mode === "register" && (
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: T.text, marginBottom: 22 }}>Konto erstellen</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, textTransform: "uppercase", marginBottom: 10 }}>Avatar</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AVATARS.map(a => <button key={a} onClick={() => setAvatar(a)} style={{ fontSize: 22, background: avatar === a ? T.bgHover : T.bgRaised, border: "2px solid " + (avatar === a ? T.gold : T.border), borderRadius: 10, padding: "7px 10px", cursor: "pointer", transition: "all .15s" }}>{a}</button>)}
              </div>
            </div>
            <InputField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Maria S." />
            <InputField label="E-Mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@beispiel.de" type="email" />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, textTransform: "uppercase", marginBottom: 8 }}>Passwort</div>
              <div style={{ position: "relative" }}>
                <input value={pw} type={showPw ? "text" : "password"} onChange={e => setPw(e.target.value)} placeholder="mind. 6 Zeichen" style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "13px 44px 13px 16px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
                <button onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 16 }}>{showPw ? "🙈" : "👁"}</button>
              </div>
            </div>
            <InputField label="Passwort wiederholen" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="nochmals eingeben" type={showPw ? "text" : "password"} error={pw2 && pw !== pw2 ? "Passwörter stimmen nicht überein" : ""} />
            {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{err}</div>}
            <GoldButton onClick={handleRegister} disabled={!name.trim() || !email.includes("@") || pw.length < 6 || pw !== pw2 || loading} fullWidth>{loading ? "Erstelle Konto …" : "Konto erstellen"}</GoldButton>
            <button onClick={() => { setMode("welcome"); setErr(""); }} style={{ width: "100%", background: "transparent", border: "none", color: T.textDim, padding: "14px", fontSize: 13, cursor: "pointer", fontFamily: "DM Sans, sans-serif", marginTop: 4 }}>← Zurück</button>
          </div>
        )}

        {mode === "login" && (
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: T.text, marginBottom: 22 }}>Anmelden</div>
            <InputField label="E-Mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@beispiel.de" type="email" />
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, textTransform: "uppercase", marginBottom: 8 }}>Passwort</div>
              <div style={{ position: "relative" }}>
                <input value={pw} type={showPw ? "text" : "password"} onChange={e => setPw(e.target.value)} placeholder="Dein Passwort" style={{ width: "100%", boxSizing: "border-box", background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 10, padding: "13px 44px 13px 16px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
                <button onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 16 }}>{showPw ? "🙈" : "👁"}</button>
              </div>
            </div>
            {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 14 }}>{err}</div>}
            <GoldButton onClick={handleLogin} disabled={!email.includes("@") || !pw || loading} fullWidth>{loading ? "Anmelden …" : "Anmelden"}</GoldButton>
            <button onClick={() => { setMode("welcome"); setErr(""); }} style={{ width: "100%", background: "transparent", border: "none", color: T.textDim, padding: "14px", fontSize: 13, cursor: "pointer", fontFamily: "DM Sans, sans-serif", marginTop: 4 }}>← Zurück</button>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: T.textFade }}>Noch kein Konto? </span>
              <button onClick={() => { setMode("register"); setErr(""); }} style={{ background: "none", border: "none", color: T.gold, fontSize: 12, cursor: "pointer", fontFamily: "DM Sans, sans-serif" }}>Registrieren →</button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @font-face { font-family: 'Playfair Display'; src: local('Playfair Display'); }
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;600;700&display=swap');
        *{-webkit-tap-highlight-color:transparent}
        input::placeholder{color:${T.textFade}}
      `}</style>
    </div>
  );
}


// ─── INBOX SECTION ───────────────────────────────────────────────────────────
function InboxSection({ user, onUpdate }) {
  const recs = (user.recommendations || []).slice().reverse();

  useEffect(() => {
    if (recs.some(r => !r.read)) {
      const updated = { ...user, recommendations: (user.recommendations || []).map(r => ({ ...r, read: true })) };
      saveUser(updated).then(() => onUpdate(updated));
    }
  }, []);

  function dismissRec(recId) {
    const updated = { ...user, recommendations: (user.recommendations || []).filter(r => r.id !== recId) };
    saveUser(updated).then(() => onUpdate(updated));
  }

  function copyName(rec) {
    const text = rec.restaurantName + (rec.restaurantCity ? ", " + rec.restaurantCity : "");
    const tryExec = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0.01;font-size:16px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(tryExec);
    } else { tryExec(); }
  }

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>
        Empfehlungen von Freunden ({recs.length})
      </div>
      {recs.length === 0 && (
        <div style={{ textAlign: "center", color: T.textFade, padding: "40px 0", fontSize: 13, lineHeight: 1.8 }}>
          Noch keine Empfehlungen erhalten.<br />
          Deine Freunde können dir Restaurants<br />aus ihrer Liste empfehlen! 📤
        </div>
      )}
      {recs.map(rec => (
        <GlassCard key={rec.id} style={{ padding: "16px", marginBottom: 10, border: "1px solid " + (!rec.read ? T.goldDim : T.border) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 24 }}>{rec.fromAvatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: T.textDim }}>
                <span style={{ color: T.text, fontWeight: 600 }}>{rec.fromName}</span> empfiehlt dir:
              </div>
              <div style={{ fontSize: 10, color: T.textFade, marginTop: 2 }}>
                {new Date(rec.sentAt).toLocaleDateString("de-DE")}
              </div>
            </div>
            {!rec.read && <Badge color={T.gold}>Neu</Badge>}
          </div>
          <div style={{ background: T.bgRaised, borderRadius: 10, padding: "12px 14px", marginBottom: rec.note ? 10 : 14 }}>
            <div style={{ fontSize: 16, color: T.text, fontWeight: 700, marginBottom: 4 }}>{rec.restaurantName}</div>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>
              📍 {rec.restaurantCity}{rec.restaurantCuisine && " · " + rec.restaurantCuisine}
            </div>
            <Stars rating={rec.rating} size={14} />
          </div>
          {rec.note && (
            <div style={{ fontSize: 13, color: T.textDim, fontStyle: "italic", marginBottom: 14, paddingLeft: 4, borderLeft: "2px solid " + T.goldDim }}>
              „{rec.note}"
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => copyName(rec)}
              style={{ flex: 1, background: "linear-gradient(135deg,#a07828," + T.gold + ")", border: "none", borderRadius: 8, color: T.bg, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "DM Sans, sans-serif" }}>
              📋 Namen kopieren
            </button>
            <button onClick={() => dismissRec(rec.id)}
              style={{ background: "transparent", border: "1px solid " + T.border, borderRadius: 8, color: T.textDim, padding: "9px 14px", fontSize: 12, cursor: "pointer", fontFamily: "DM Sans, sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.redDim; e.currentTarget.style.color = T.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}>
              ✕
            </button>
          </div>
          <div style={{ marginTop: 10, background: T.bgRaised, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: T.textFade, flexShrink: 0 }}>✍ Manuell:</span>
            <span style={{ fontSize: 13, color: T.gold, fontFamily: "DM Sans, sans-serif", userSelect: "all", WebkitUserSelect: "all", cursor: "text", flex: 1 }}
              onClick={e => { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }}>
              {rec.restaurantName}{rec.restaurantCity ? ", " + rec.restaurantCity : ""}
            </span>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ user, onUpdate, onLogout }) {
  const [section, setSection]   = useState("friends");
  const [friendProfiles, setFP] = useState([]);
  const [loadingF, setLoadingF] = useState(true);
  // Email search
  const [searchEmail, setSE]    = useState("");
  const [searchResult, setSR]   = useState(null);
  const [searching, setSearching] = useState(false);
  // Invite code search
  const [searchCode, setSearchCode]   = useState("");
  const [codeResult, setCodeResult]   = useState(null);
  const [searchingCode, setSearchingCode] = useState(false);
  const [reqMsg, setReqMsg]     = useState("");
  // Settings copy states
  const [codeCopied, setCC]     = useState(false);

  const incoming = user.friendRequests || [];
  const sent     = user.sentRequests   || [];

  useEffect(() => {
    async function load() {
      setLoadingF(true);
      const p = await Promise.all((user.friends || []).map(fid => loadUser(fid)));
      setFP(p.filter(Boolean));
      setLoadingF(false);
    }
    load();
  }, [(user.friends || []).join(",")]);

  function copyToClipboard(text, onSuccess) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        onSuccess();
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      onSuccess();
    }
  }

  async function searchByEmail() {
    if (!searchEmail.includes("@")) return;
    setSearching(true); setSR(null); setReqMsg("");
    const uid = await lookupEmail(searchEmail);
    if (!uid || uid === user.id) { setSR("notfound"); setSearching(false); return; }
    const u = await loadUser(uid); setSR(u || "notfound"); setSearching(false);
  }

  async function searchByCode() {
    const code = searchCode.trim().toUpperCase();
    if (code.length < 4) return;
    setSearchingCode(true); setCodeResult(null); setReqMsg("");
    const allUsers = listAllUsers(); // sync via LS
    const found = allUsers.find(u => u.inviteCode === code && u.id !== user.id);
    setCodeResult(found || "notfound");
    setSearchingCode(false);
  }

  async function sendRequest(target) {
    if ((user.friends || []).includes(target.id))      { setReqMsg("Ihr seid bereits befreundet."); return; }
    if ((user.sentRequests || []).includes(target.id)) { setReqMsg("Anfrage bereits gesendet."); return; }
    const fresh = await loadUser(target.id);
    if (!fresh) { setReqMsg("Nutzer nicht gefunden."); return; }
    const req = { from: user.id, name: user.name, avatar: user.avatar, email: user.email, sentAt: Date.now() };
    await saveUser({ ...fresh, friendRequests: [...(fresh.friendRequests || []), req] });
    const me = { ...user, sentRequests: [...(user.sentRequests || []), target.id] };
    await saveUser(me); onUpdate(me);
    setReqMsg("Anfrage an " + target.name + " gesendet! 🎉");
    setSE(""); setSR(null); setSearchCode(""); setCodeResult(null);
  }

  async function acceptRequest(req) {
    const sender = await loadUser(req.from);
    const me = { ...user, friends: [...(user.friends || []), req.from], friendRequests: (user.friendRequests || []).filter(r => r.from !== req.from) };
    if (sender) await saveUser({ ...sender, friends: [...(sender.friends || []), user.id], sentRequests: (sender.sentRequests || []).filter(id => id !== user.id), friendRequests: (sender.friendRequests || []).filter(r => r.from !== user.id) });
    await saveUser(me); onUpdate(me);
  }
  async function declineRequest(req) {
    const sender = await loadUser(req.from);
    if (sender) await saveUser({ ...sender, sentRequests: (sender.sentRequests || []).filter(id => id !== user.id) });
    const me = { ...user, friendRequests: (user.friendRequests || []).filter(r => r.from !== req.from) };
    await saveUser(me); onUpdate(me);
  }
  async function withdrawRequest(sid) {
    const target = await loadUser(sid);
    if (target) await saveUser({ ...target, friendRequests: (target.friendRequests || []).filter(r => r.from !== user.id) });
    const me = { ...user, sentRequests: (user.sentRequests || []).filter(id => id !== sid) };
    await saveUser(me); onUpdate(me);
  }
  async function removeFriend(fid) {
    const other = await loadUser(fid);
    if (other) await saveUser({ ...other, friends: (other.friends || []).filter(id => id !== user.id) });
    const me = { ...user, friends: (user.friends || []).filter(id => id !== fid) };
    await saveUser(me); onUpdate(me);
  }

  const stats = calcStats(user.visits || []);
  const rank  = getRank(stats.score);

  function UserResultCard({ target }) {
    const ts = calcStats(target.visits || []);
    const alreadyFriend = (user.friends || []).includes(target.id);
    const alreadySent   = (user.sentRequests || []).includes(target.id);
    return (
      <div style={{ background: T.bgRaised, border: "1px solid " + T.borderHi, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <div style={{ fontSize: 28 }}>{target.avatar}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{target.name}</div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>🏆 {ts.score} Pkt · {ts.uniqueRestaurants} Restaurants</div>
        </div>
        {alreadyFriend
          ? <span style={{ fontSize: 11, color: T.green }}>✓ Befreundet</span>
          : alreadySent
          ? <span style={{ fontSize: 11, color: T.textDim }}>Anfrage gesendet</span>
          : <GoldButton small onClick={() => sendRequest(target)}>Anfragen</GoldButton>}
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 32px" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg," + T.bgCard + "," + T.bgRaised + ")", border: "1px solid " + T.goldDim, borderRadius: 16, padding: "24px 20px", marginBottom: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 70% 30%, " + T.goldGlow + " 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -15, right: -15, fontSize: 80, opacity: 0.05, pointerEvents: "none" }}>🏆</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 52 }}>{user.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: T.text }}>{user.name}</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>{user.email}</div>
            <div style={{ fontSize: 12, color: rank.color, marginTop: 6 }}>{rank.emoji} {rank.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[{ v: stats.score, l: "Score" }, { v: stats.uniqueRestaurants, l: "Restaurants" }, { v: (user.friends || []).length, l: "Friends" }].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: 24, fontWeight: 700, color: T.gold }}>{s.v}</div>
              <div style={{ fontSize: 9, color: T.textFade, textTransform: "uppercase", letterSpacing: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionPill
        tabs={[
          { k: "friends",  l: "Friends",      badge: 0 },
          { k: "requests", l: "Anfragen",      badge: incoming.length },
          { k: "inbox",    l: "Empfehlungen",  badge: (user.recommendations || []).filter(r => !r.read).length },
          { k: "settings", l: "Settings",      badge: 0 },
        ]}
        active={section} onChange={setSection} />

      {/* ── FRIENDS ── */}
      {section === "friends" && (
        <div>
          {/* Search by Email */}
          <GlassCard style={{ padding: "18px", marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>Per E-Mail suchen</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={searchEmail} type="email"
                onChange={e => { setSE(e.target.value); setSR(null); setReqMsg(""); }}
                onKeyDown={e => e.key === "Enter" && searchByEmail()}
                placeholder="freund@beispiel.de"
                style={{ flex: 1, background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 8, padding: "11px 14px", color: T.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none" }}
                onFocus={e => e.target.style.borderColor = T.gold}
                onBlur={e => e.target.style.borderColor = T.border} />
              <button onClick={searchByEmail} disabled={searching || !searchEmail.includes("@")}
                style={{ background: searching || !searchEmail.includes("@") ? T.bgRaised : "linear-gradient(135deg,#a07828," + T.gold + ")", border: "none", borderRadius: 8, color: T.bg, padding: "0 16px", fontSize: 15, cursor: searching || !searchEmail.includes("@") ? "not-allowed" : "pointer", opacity: searching || !searchEmail.includes("@") ? 0.5 : 1 }}>
                {searching ? "⏳" : "🔍"}
              </button>
            </div>
            {searchResult === "notfound" && <div style={{ fontSize: 12, color: T.textDim, marginTop: 8 }}>Kein Nutzer mit dieser E-Mail gefunden.</div>}
            {searchResult && searchResult !== "notfound" && <UserResultCard target={searchResult} />}
          </GlassCard>

          {/* Search by Invite Code */}
          <GlassCard style={{ padding: "18px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>Per Invite-Code suchen</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={searchCode}
                onChange={e => { setSearchCode(e.target.value.toUpperCase()); setCodeResult(null); setReqMsg(""); }}
                onKeyDown={e => e.key === "Enter" && searchByCode()}
                placeholder="z.B. ABC123"
                maxLength={8}
                style={{ flex: 1, background: T.bgRaised, border: "1px solid " + T.border, borderRadius: 8, padding: "11px 14px", color: T.gold, fontSize: 18, fontFamily: "DM Sans, sans-serif", letterSpacing: 4, outline: "none" }}
                onFocus={e => e.target.style.borderColor = T.gold}
                onBlur={e => e.target.style.borderColor = T.border} />
              <button onClick={searchByCode} disabled={searchingCode || searchCode.length < 4}
                style={{ background: searchingCode || searchCode.length < 4 ? T.bgRaised : "linear-gradient(135deg,#a07828," + T.gold + ")", border: "none", borderRadius: 8, color: T.bg, padding: "0 16px", fontSize: 15, cursor: searchingCode || searchCode.length < 4 ? "not-allowed" : "pointer", opacity: searchingCode || searchCode.length < 4 ? 0.5 : 1 }}>
                {searchingCode ? "⏳" : "🔍"}
              </button>
            </div>
            {codeResult === "notfound" && <div style={{ fontSize: 12, color: T.textDim, marginTop: 8 }}>Kein Nutzer mit diesem Code gefunden.</div>}
            {codeResult && codeResult !== "notfound" && <UserResultCard target={codeResult} />}
            {reqMsg && <div style={{ fontSize: 12, color: T.green, marginTop: 10 }}>{reqMsg}</div>}
          </GlassCard>

          {/* Friends list */}
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>
            Meine Friends ({(user.friends || []).length})
          </div>
          {loadingF && <div style={{ color: T.textFade, fontSize: 13, padding: "8px 0" }}>Lade …</div>}
          {!loadingF && friendProfiles.length === 0 && (
            <div style={{ color: T.textFade, fontSize: 13, padding: "24px 0", textAlign: "center", lineHeight: 1.8 }}>
              Noch keine Freunde verbunden.<br />
              Suche per E-Mail oder Invite-Code! 🤝
            </div>
          )}
          {friendProfiles.map(f => {
            const fs = calcStats(f.visits || []);
            return (
              <GlassCard key={f.id} style={{ padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>{f.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>🏆 {fs.score} Pkt · {fs.uniqueRestaurants} Restaurants</div>
                </div>
                <button onClick={() => removeFriend(f.id)}
                  style={{ background: "transparent", border: "1px solid " + T.redDim, borderRadius: 8, color: T.red, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "DM Sans, sans-serif", transition: "all .2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(192,57,43,.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  Entfernen
                </button>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* ── REQUESTS ── */}
      {section === "requests" && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12 }}>Eingehend ({incoming.length})</div>
          {incoming.length === 0 && <div style={{ color: T.textFade, fontSize: 13, padding: "16px 0" }}>Keine offenen Anfragen.</div>}
          {incoming.map(req => (
            <GlassCard key={req.from} style={{ padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 26 }}>{req.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{req.name}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Möchte befreundet sein</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => acceptRequest(req)} style={{ background: "linear-gradient(135deg,#1a5a28,#27ae60)", border: "none", borderRadius: 8, color: "#fff", padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700, fontFamily: "DM Sans, sans-serif" }}>✓ Annehmen</button>
                <button onClick={() => declineRequest(req)} style={{ background: "transparent", border: "1px solid " + T.redDim, borderRadius: 8, color: T.red, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>✗</button>
              </div>
            </GlassCard>
          ))}

          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 12, marginTop: 24 }}>Gesendet ({sent.length})</div>
          {sent.length === 0 && <div style={{ color: T.textFade, fontSize: 13 }}>Keine gesendeten Anfragen.</div>}
          {sent.map(sid => (
            <GlassCard key={sid} style={{ padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 22 }}>⏳</div>
              <div style={{ flex: 1, fontSize: 13, color: T.textDim }}>Ausstehend …</div>
              <button onClick={() => withdrawRequest(sid)} style={{ background: "transparent", border: "1px solid " + T.redDim, borderRadius: 8, color: T.red, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "DM Sans, sans-serif" }}>Zurückziehen</button>
            </GlassCard>
          ))}
        </div>
      )}

      {/* ── RECOMMENDATIONS INBOX ── */}
      {section === "inbox" && <InboxSection user={user} onUpdate={onUpdate} />}

      {/* ── SETTINGS ── */}
      {section === "settings" && (
        <div>
          <GlassCard style={{ padding: "18px", marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 8 }}>E-Mail</div>
            <div style={{ fontSize: 14, color: T.gold }}>{user.email}</div>
          </GlassCard>

          {/* Invite code — click entire card to copy */}
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFade, textTransform: "uppercase", marginBottom: 8 }}>Dein Invite-Code</div>
          <div style={{ fontSize: 11, color: T.textFade, marginBottom: 10, lineHeight: 1.6 }}>
            Teile diesen Code mit Freunden. Sie können ihn im Freunde-Tab unter „Per Invite-Code suchen" eingeben.
          </div>
          <GlassCard hover onClick={() => copyToClipboard(user.inviteCode, () => { setCC(true); setTimeout(() => setCC(false), 2500); })}
            style={{ padding: "18px", marginBottom: 20, border: "1px solid " + (codeCopied ? T.green : T.goldDim), cursor: "pointer", transition: "all .2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1, fontFamily: "DM Sans, sans-serif", fontSize: 28, letterSpacing: 8, color: T.gold, fontWeight: 700 }}>{user.inviteCode}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 20 }}>{codeCopied ? "✅" : "📋"}</div>
                <div style={{ fontSize: 10, color: codeCopied ? T.green : T.textFade, letterSpacing: 1, textTransform: "uppercase" }}>{codeCopied ? "Kopiert!" : "Kopieren"}</div>
              </div>
            </div>
          </GlassCard>

          <button onClick={onLogout}
            style={{ width: "100%", background: "transparent", border: "1px solid " + T.redDim, borderRadius: 12, color: T.red, padding: "14px", fontSize: 14, fontFamily: "DM Sans, sans-serif", cursor: "pointer", transition: "all .2s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(192,57,43,.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function GourmetLeague() {
  const [user, setUser]             = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab]               = useState("my");
  const [friendProfiles, setFriendProfiles] = useState([]);

  useEffect(() => {
    async function checkSession() {
      try {
        const uid = LS.get("session");
        if (uid) { const u = await loadUser(uid); if (u) setUser(u); }
      } catch {}
      setAuthChecked(true);
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function loadFriends() { const p = await Promise.all((user.friends || []).map(fid => loadUser(fid))); setFriendProfiles(p.filter(Boolean)); }
    loadFriends();
  }, [user && (user.friends || []).join(",")]);

  async function handleAuth(u) { setUser(u); LS.set("session", u.id); }
  async function handleUpdate(u) { setUser(u); await saveUser(u); }
  async function handleLogout() { LS.del("session"); setUser(null); setFriendProfiles([]); setTab("my"); }
  async function setMyVisits(fn) { const newV = typeof fn === "function" ? fn(user.visits || []) : fn; const u = { ...user, visits: newV }; setUser(u); await saveUser(u); }

  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap');`;

  if (!authChecked) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 36, animation: "spin 1.5s linear infinite" }}>🏆</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (!user) return <AuthScreen onAuth={handleAuth} />;

  const myStats = calcStats(user.visits || []);
  const allScores = [myStats.score, ...friendProfiles.map(f => calcStats(f.visits || []).score)].sort((a, b) => b - a);
  const myPos = allScores.indexOf(myStats.score) + 1;
  const pendingReqs  = (user.friendRequests || []).length;
  const unreadRecs   = (user.recommendations || []).filter(r => !r.read).length;
  const profileBadge = pendingReqs + unreadRecs;

  const TABS = [
    { key: "my",       icon: "🍽️", label: "Meine" },
    { key: "rank",     icon: "🏆", label: "League" },
    { key: "discover", icon: "🌍", label: "Entdecken" },
    { key: "profile",  icon: "👤", label: "Profil" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "DM Sans, sans-serif", color: T.text, paddingBottom: 80 }}>
      <style>{`
        ${FONTS}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes slideIn{from{transform:translateX(-16px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{-webkit-tap-highlight-color:transparent}
        input::placeholder,textarea::placeholder{color:${T.textFade}}
        ::-webkit-scrollbar{display:none}
        body{background:${T.bg}}
      `}</style>

      {/* Header */}
      <header style={{ background: T.bgCard, borderBottom: "1px solid " + T.border, padding: "20px 20px 16px", position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(20px)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
              <span style={{ fontSize: 18 }}>🏆</span>
              <span style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: T.text, letterSpacing: -0.5 }}>Gourmet League</span>
            </div>
            <div style={{ fontSize: 11, color: T.textFade, letterSpacing: 1 }}>
              {tab === "my" ? "Meine Restaurants" : tab === "rank" ? "Die League" : tab === "discover" ? "Entdecken" : user.name}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: T.goldDim, textTransform: "uppercase" }}>Score</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: 28, fontWeight: 700, color: T.gold, lineHeight: 1.1 }}>{myStats.score}</div>
            <div style={{ fontSize: 9, color: T.textFade, letterSpacing: 1 }}>#{myPos} von {friendProfiles.length + 1}</div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: 20 }}>
        {tab === "my"       && <MyTab visits={user.visits || []} setVisits={setMyVisits} currentUserId={user.id} />}
        {tab === "rank"     && <LeaderboardTab myVisits={user.visits || []} friends={friendProfiles.map(f => ({ ...f, visits: f.visits || [] }))} />}
        {tab === "discover" && <EntdeckenTab myVisits={user.visits || []} />}
        {tab === "profile"  && <ProfileTab user={user} onUpdate={handleUpdate} onLogout={handleLogout} />}
      </div>

      {/* Bottom nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.bgCard, borderTop: "1px solid " + T.border, display: "flex", justifyContent: "center", zIndex: 50, backdropFilter: "blur(20px)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, maxWidth: 160, background: "transparent", border: "none", padding: "10px 4px 16px", color: tab === t.key ? T.gold : T.textFade, cursor: "pointer", fontFamily: "DM Sans, sans-serif", borderTop: "2px solid " + (tab === t.key ? T.gold : "transparent"), transition: "color .2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: tab === t.key ? 700 : 400 }}>{t.label}</span>
            {t.key === "profile" && profileBadge > 0 && <span style={{ position: "absolute", top: 6, right: "22%", background: T.red, color: "#fff", borderRadius: "50%", width: 15, height: 15, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{profileBadge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
