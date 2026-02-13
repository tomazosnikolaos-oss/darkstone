const SAVE_KEY = "darkstone_save_v1"; //0000aerrererererererer

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}
const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function ensureFishing(save){
  save = save && typeof save === "object" ? save : {};
  if (!Number.isFinite(Number(save.fishingLevel))) save.fishingLevel = 1;
  if (!Number.isFinite(Number(save.fishingXP))) save.fishingXP = 0;
  if (!Number.isFinite(Number(save.fishingXPNext))) save.fishingXPNext = 100;
  return save;
}

const SPOTS = [
  { id:"Riverbend_Falls", req:1,  title:"Riverbend Falls", img:"images/fishing_spots/Riverbend_Falls.png" },
  { id:"Crystal_Cove",    req:5,  title:"Crystal Cove",    img:"images/fishing_spots/Crystal_Cove.png" },
  { id:"Sunset_Pier",     req:10, title:"Sunset Pier",     img:"images/fishing_spots/Sunset_Pier.png" },
  { id:"Murkwood_Swamp",  req:15, title:"Murkwood Swamp",  img:"images/fishing_spots/Murkwood_Swamp.png" }
];

function renderHeader(){
  const s = ensureFishing(loadSave());

  document.getElementById("fishLevel").textContent = String(s.fishingLevel);
  document.getElementById("fishXPCurrent").textContent = String(s.fishingXP);
  document.getElementById("fishXPNext").textContent = String(s.fishingXPNext);

  const pct = s.fishingXPNext > 0 ? clamp((s.fishingXP / s.fishingXPNext) * 100, 0, 100) : 0;
  document.getElementById("fishXPBar").style.width = pct.toFixed(1) + "%";
}

function renderSpots(){
  const grid = document.getElementById("spotGrid");
  if (!grid) return;

  const s = ensureFishing(loadSave());
  grid.innerHTML = "";

  SPOTS.forEach(spot => {
    const locked = s.fishingLevel < spot.req;

    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.textAlign = "left";
    card.style.cursor = locked ? "not-allowed" : "pointer";
    card.style.opacity = locked ? "0.55" : "1";

    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${spot.img}" alt="${spot.title}"
          style="width:72px;height:72px;border-radius:12px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:900;font-size:16px;margin-bottom:4px;">${spot.title}</div>
          <div style="opacity:.85;font-size:12px;">Req Fishing Lv <b>${spot.req}</b></div>
          <div style="opacity:.75;font-size:12px;margin-top:6px;">Two fish types • 70% / 30%</div>
        </div>
      </div>
      ${locked ? `<div style="margin-top:10px;color:#ff6b6b;font-weight:800;">LOCKED</div>` : ``}
    `;

    if (!locked){
      card.addEventListener("click", () => {
        window.location.href = `fishing_action.html?spot=${encodeURIComponent(spot.id)}`;
      });
    }

    grid.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderSpots();
  window.addEventListener("ds:save", () => {
    renderHeader();
    renderSpots();
  });
});
