const SAVE_KEY = "darkstone_save_v1";

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function ensureHunting(save){
  save = save && typeof save === "object" ? save : {};
  if (!Number.isFinite(Number(save.huntingLevel))) save.huntingLevel = 1;
  if (!Number.isFinite(Number(save.huntingXP))) save.huntingXP = 0;
  if (!Number.isFinite(Number(save.huntingXPNext))) save.huntingXPNext = 100;
  if (!Array.isArray(save.inventory)) save.inventory = [];
  if (!Number.isFinite(Number(save.inventoryMaxSlots))) save.inventoryMaxSlots = 1000;
  return save;
}

const TARGETS = [
  { id:"deer", name:"Deer", req:1,  img:"images/hunting/deer.png", rawName:"Raw Deer Meat", cookedName:"Cooked Deer Meat", stamina:2 },
  { id:"boar", name:"Boar", req:5,  img:"images/hunting/boar.png", rawName:"Raw Boar Meat", cookedName:"Cooked Boar Meat", stamina:3 },
  { id:"wolf", name:"Wolf", req:10, img:"images/hunting/wolf.png", rawName:"Raw Wolf Meat", cookedName:"Cooked Wolf Meat", stamina:4 },
  { id:"bear", name:"Bear", req:15, img:"images/hunting/bear.png", rawName:"Raw Bear Meat", cookedName:"Cooked Bear Meat", stamina:5 },
];

function countByName(inv, name){
  const it = inv.find(x => x && String(x.name||"").toLowerCase() === String(name).toLowerCase());
  if (!it) return 0;
  return Math.max(1, num(it.quantity ?? it.qty, 1));
}

// used units = sum quantities
function usedUnits(inv){
  let used = 0;
  for (const it of inv){
    if (!it) continue;
    used += Math.max(1, num(it.quantity ?? it.qty, 1));
  }
  return used;
}

function renderHeader(){
  const s = ensureHunting(loadSave());

  document.getElementById("huntLevel").textContent = String(s.huntingLevel);
  document.getElementById("huntXPCurrent").textContent = String(s.huntingXP);
  document.getElementById("huntXPNext").textContent = String(s.huntingXPNext);

  const pct = s.huntingXPNext > 0 ? clamp((s.huntingXP / s.huntingXPNext) * 100, 0, 100) : 0;
  document.getElementById("huntXPBar").style.width = pct.toFixed(1) + "%";

  document.getElementById("arrowCount").textContent = String(countByName(s.inventory, "Arrows"));
}

function renderTargets(){
  const s = ensureHunting(loadSave());
  const grid = document.getElementById("targetGrid");
  const msg = document.getElementById("msg");
  if (!grid) return;

  const arrows = countByName(s.inventory, "Arrows");
  const full = usedUnits(s.inventory) >= num(s.inventoryMaxSlots, 1000);

  grid.innerHTML = "";

  TARGETS.forEach(t => {
    const locked = s.huntingLevel < t.req;
    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.cursor = locked ? "not-allowed" : "pointer";
    card.style.opacity = locked ? ".6" : "1";

    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="${t.img}" alt="${t.name}"
          style="width:74px;height:74px;border-radius:12px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div style="flex:1;text-align:left;">
          <div style="font-weight:900;font-size:18px;">${t.name}</div>
          <div style="opacity:.85;font-size:12px;margin-top:4px;">Requires Hunting Level <b>${t.req}</b></div>
          <div style="opacity:.85;font-size:12px;margin-top:4px;">Drops: <b>${t.rawName}</b></div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (locked) { msg.textContent = `❌ Requires Hunting Level ${t.req}.`; return; }
      if (full) { msg.textContent = "❌ No more inventory space"; return; }
      if (arrows <= 0) { msg.textContent = "❌ You need Arrows."; return; }

      window.location.href = `hunting_action.html?target=${encodeURIComponent(t.id)}`;
    });

    grid.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderTargets();

  // live refresh when save changes
  window.addEventListener("ds:save", () => {
    renderHeader();
    renderTargets();
  });
});
