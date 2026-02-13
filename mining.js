const SAVE_KEY = "darkstone_save_v1";

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}
function ensureMining(save){
  save = save && typeof save === "object" ? save : {};
  if (!Number.isFinite(Number(save.miningLevel))) save.miningLevel = 1;
  if (!Number.isFinite(Number(save.miningXP))) save.miningXP = 0;
  if (!Number.isFinite(Number(save.miningXPNext))) save.miningXPNext = 100;
  if (!Array.isArray(save.inventory)) save.inventory = [];
  return save;
}

const ORES = [
  { id:"iron",      name:"Iron Ore",      req:1,  img:"images/ores/iron.png" },
  { id:"coal",      name:"Coal",          req:1,  img:"images/ores/coal.png" },
  { id:"obsidian",  name:"Obsidian",      req:10, img:"images/ores/obsidian.png" },
  { id:"adamant",   name:"Adamant",       req:20, img:"images/ores/adamant.png" },
  { id:"ruby",      name:"Ruby",          req:30, img:"images/ores/ruby.png" }
];

// Αν δεν έχεις αυτά τα paths ακόμα, κράτα τα ίδια ids και άλλαξε img paths αργότερα.

function renderMiningHeader(){
  const save = ensureMining(loadSave());

  const lvlEl = document.getElementById("mineLevel");
  const curEl = document.getElementById("mineXPCurrent");
  const nextEl = document.getElementById("mineXPNext");
  const barEl = document.getElementById("mineXPBar");

  if (lvlEl) lvlEl.textContent = String(save.miningLevel);
  if (curEl) curEl.textContent = String(save.miningXP);
  if (nextEl) nextEl.textContent = String(save.miningXPNext);

  const pct = save.miningXPNext > 0 ? Math.max(0, Math.min(100, (save.miningXP / save.miningXPNext) * 100)) : 0;
  if (barEl) barEl.style.width = pct.toFixed(1) + "%";
}

function renderOreGrid(){
  const save = ensureMining(loadSave());
  const grid = document.getElementById("oreGrid");
  if (!grid) return;

  grid.innerHTML = "";

  ORES.forEach(o => {
    const locked = save.miningLevel < o.req;

    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.cursor = locked ? "not-allowed" : "pointer";
    card.style.opacity = locked ? "0.55" : "1";

    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${o.img}" alt="${o.name}" style="width:64px;height:64px;border-radius:10px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div>
          <div style="font-size:16px;font-weight:700;">${o.name}</div>
          <div style="opacity:.9;font-size:12px;margin-top:4px;">Req Mining Lv <b>${o.req}</b></div>
          <div style="opacity:.75;font-size:12px;margin-top:6px;">Click to mine</div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (locked) {
        alert(`Requires Mining Level ${o.req}`);
        return;
      }
      window.location.href = `mining_action.html?ore=${encodeURIComponent(o.id)}`;
    });

    grid.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderMiningHeader();
  renderOreGrid();
});
