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

function getOreFromUrl(){
  const p = new URLSearchParams(location.search);
  return p.get("ore") || "iron";
}
function getOreDef(id){
  return ORES.find(o => o.id === id) || ORES[0];
}

// -------------------------
// Stack helper (ore stack)
// -------------------------
function itemStackKey(it){
  return [it.type||"", it.id||"", it.name||"", it.img||""].join("::");
}
function addToInventoryStack(save, item, qty){
  const key = itemStackKey(item);
  const ex = save.inventory.find(i => i && itemStackKey(i) === key);
  if (ex){
    ex.quantity = (Number(ex.quantity) || 1) + qty;
  } else {
    save.inventory.push({ ...item, quantity: qty });
  }
}

// -------------------------
// DOM
// -------------------------
const backBtn = document.getElementById("backBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");

const oreImg  = document.getElementById("oreImg");
const oreName = document.getElementById("oreName");

const timerWrap = document.getElementById("timerWrap");
const timerText = document.getElementById("timerText");
const timerBar  = document.getElementById("timerBar");

const msgEl = document.getElementById("msg");

const targetInput  = document.getElementById("targetInput");
const targetBtn    = document.getElementById("targetBtn");
const targetStatus = document.getElementById("targetStatus");

const lvlEl  = document.getElementById("mineLevel");
const curEl  = document.getElementById("mineXPCurrent");
const nextEl = document.getElementById("mineXPNext");
const barEl  = document.getElementById("mineXPBar");

// -------------------------
// Global pause/resume from ui.js inspector
// -------------------------
window.addEventListener("ds:pause", () => {
  stopMining(true); // ✅ freeze immediately
});
window.addEventListener("ds:resume", () => {
  // ✅ do NOT auto-start (safe)
});

// -------------------------
// UI: Mining header
// -------------------------
function renderMiningHeader(){
  const save = ensureMining(loadSave());

  if (lvlEl) lvlEl.textContent = String(save.miningLevel);
  if (curEl) curEl.textContent = String(save.miningXP);
  if (nextEl) nextEl.textContent = String(save.miningXPNext);

  const pct = save.miningXPNext > 0
    ? Math.max(0, Math.min(100, (save.miningXP / save.miningXPNext) * 100))
    : 0;

  if (barEl) barEl.style.width = pct.toFixed(1) + "%";
}

// -------------------------
// Mining loop + timer bar
// -------------------------
const CD_MS = 6000;
let miningActive = false;
let miningTimer = null;

let cdAnim = null;
let cdStart = 0;

let targetRemaining = 0; // 0 = no target mode

function setMsg(t){
  if (msgEl) msgEl.textContent = t || "";
}

function stopCooldownUI(){
  if (cdAnim) cancelAnimationFrame(cdAnim);
  cdAnim = null;

  if (timerWrap) timerWrap.style.display = "none";
  if (timerBar) timerBar.style.width = "0%";
  if (timerText) timerText.textContent = (CD_MS/1000).toFixed(1) + "s";
}

function startCooldownUI(){
  if (!timerWrap || !timerBar || !timerText) return;

  timerWrap.style.display = "";
  cdStart = performance.now();

  const tick = (now) => {
    if (!miningActive || window.DS?.isPaused){
      cdAnim = null;
      return;
    }

    const elapsed = now - cdStart;
    const t = Math.min(1, elapsed / CD_MS);

    timerBar.style.width = (t * 100).toFixed(1) + "%";
    const remain = Math.max(0, (CD_MS - elapsed) / 1000);
    timerText.textContent = remain.toFixed(1) + "s";

    if (t < 1){
      cdAnim = requestAnimationFrame(tick);
    } else {
      cdAnim = null;
    }
  };

  if (cdAnim) cancelAnimationFrame(cdAnim);
  cdAnim = requestAnimationFrame(tick);
}

function updateTargetUI(){
  if (!targetStatus) return;
  if (targetRemaining > 0){
    targetStatus.textContent = `Remaining: ${targetRemaining}`;
  } else {
    targetStatus.textContent = "";
  }
}

function startMining(){
  if (window.DS?.isPaused) return;
  if (miningActive) return;

  miningActive = true;
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  setMsg("⛏ Mining started.");
  scheduleNextMine(true); // immediate first mine
}

function stopMining(silent=false){
  miningActive = false;

  if (miningTimer){
    clearTimeout(miningTimer);
    miningTimer = null;
  }

  stopCooldownUI();

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  // stop target mode as well
  targetRemaining = 0;
  updateTargetUI();

  if (!silent) setMsg("⏹ Mining stopped.");
}

function scheduleNextMine(runImmediately=false){
  if (!miningActive) return;
  if (window.DS?.isPaused) return;

  if (runImmediately){
    mineTick();
    return;
  }

  startCooldownUI();
  miningTimer = setTimeout(() => {
    mineTick();
  }, CD_MS);
}

function mineTick(){
  if (!miningActive) return;
  if (window.DS?.isPaused) return;

  const oreId = getOreFromUrl();
  const ore = getOreDef(oreId);

  const save = ensureMining(loadSave());

  // req check (σε περίπτωση που μπήκε με url ή ανέβηκε/έπεσε level σε save)
  if (save.miningLevel < ore.req){
    setMsg(`❌ Requires Mining Level ${ore.req}.`);
    stopMining(true);
    return;
  }

  // ✅ give 1 ore
  addToInventoryStack(save, {
    type: "ore",
    id: ore.id,
    name: ore.name,
    img: ore.img
  }, 1);

  // ✅ xp gain (ρυθμίζεις ό,τι θες)
  save.miningXP += 6;

  // level up
  while (save.miningXP >= save.miningXPNext){
    save.miningXP -= save.miningXPNext;
    save.miningLevel += 1;
    save.miningXPNext = Math.floor(save.miningXPNext * 1.5);
  }

  setSave(save);
  renderMiningHeader();

  // target mode decrement
  if (targetRemaining > 0){
    targetRemaining -= 1;
    updateTargetUI();
    if (targetRemaining <= 0){
      setMsg(`✅ Target completed! You obtained 1 ${ore.name} (last).`);
      stopMining(true);
      return;
    }
  }

  setMsg(`⛏ You obtained 1 ${ore.name}.`);

  // schedule next
  scheduleNextMine(false);
}

// -------------------------
// Target Mining
// -------------------------
function startTargetMining(){
  const val = Number(targetInput?.value);
  if (!Number.isFinite(val) || val <= 0){
    alert("Enter a valid target amount (e.g. 100).");
    return;
  }
  targetRemaining = Math.floor(val);
  updateTargetUI();

  // start mining if not active
  if (!miningActive) startMining();
  else setMsg(`🎯 Target set: ${targetRemaining}`);
}

// -------------------------
// Boot
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  const oreId = getOreFromUrl();
  const ore = getOreDef(oreId);

  if (oreImg) oreImg.src = ore.img;
  if (oreName) oreName.textContent = ore.name;

  renderMiningHeader();
  stopCooldownUI();

  backBtn?.addEventListener("click", () => {
    stopMining(true);
    window.location.href = "mining.html";
  });

  startBtn?.addEventListener("click", startMining);
  stopBtn?.addEventListener("click", () => stopMining(false));

  targetBtn?.addEventListener("click", startTargetMining);

  // initial buttons
  if (stopBtn) stopBtn.disabled = true;
});
