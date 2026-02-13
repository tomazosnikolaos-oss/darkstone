const SAVE_KEY = "darkstone_save_v1";

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

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
  { id:"deer", name:"Deer", req:1,  img:"images/hunting/deer.png", rawName:"Raw Deer Meat", rawImg:"images/meat/raw_deer.png", cookedName:"Cooked Deer Meat", cookedImg:"images/meat/cooked_deer.png", stamina:2 },
  { id:"boar", name:"Boar", req:5,  img:"images/hunting/boar.png", rawName:"Raw Boar Meat", rawImg:"images/meat/raw_boar.png", cookedName:"Cooked Boar Meat", cookedImg:"images/meat/cooked_boar.png", stamina:3 },
  { id:"wolf", name:"Wolf", req:10, img:"images/hunting/wolf.png", rawName:"Raw Wolf Meat", rawImg:"images/meat/raw_wolf.png", cookedName:"Cooked Wolf Meat", cookedImg:"images/meat/cooked_wolf.png", stamina:4 },
  { id:"bear", name:"Bear", req:15, img:"images/hunting/bear.png", rawName:"Raw Bear Meat", rawImg:"images/meat/raw_bear.png", cookedName:"Cooked Bear Meat", cookedImg:"images/meat/cooked_bear.png", stamina:5 },
];

function getTargetId(){
  const p = new URLSearchParams(location.search);
  return p.get("target") || "deer";
}
function getTargetDef(id){
  return TARGETS.find(t => t.id === id) || TARGETS[0];
}

function usedUnits(inv){
  let used = 0;
  for (const it of inv){
    if (!it) continue;
    used += Math.max(1, num(it.quantity ?? it.qty, 1));
  }
  return used;
}

function itemStackKey(it){
  // stack by type+id/name+img to keep it simple (raw meat stacks)
  return [it.type||"", it.id||"", it.name||"", it.img||""].join("::");
}
function addToInventoryStack(save, item, qty){
  const key = itemStackKey(item);
  const ex = save.inventory.find(i => i && itemStackKey(i) === key);
  if (ex) ex.quantity = Math.max(1, num(ex.quantity, 1)) + qty;
  else save.inventory.push({ ...item, quantity: qty });
}

function countByName(inv, name){
  const it = inv.find(x => x && String(x.name||"").toLowerCase() === String(name).toLowerCase());
  if (!it) return 0;
  return Math.max(1, num(it.quantity ?? it.qty, 1));
}

function consumeByName(save, name, qtyNeeded){
  const idx = save.inventory.findIndex(it => it && String(it.name||"").toLowerCase() === String(name).toLowerCase());
  if (idx < 0) return false;
  const it = save.inventory[idx];
  const q = Math.max(1, num(it.quantity ?? it.qty, 1));
  if (q > qtyNeeded){ it.quantity = q - qtyNeeded; return true; }
  if (q === qtyNeeded){ save.inventory.splice(idx, 1); return true; }
  return false;
}

// -------------------------
// DOM
// -------------------------
const backBtn = document.getElementById("backBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");

const targetImgEl = document.getElementById("targetImg");
const targetNameEl = document.getElementById("targetName");
const dropNameEl = document.getElementById("dropName");

const timerWrap = document.getElementById("timerWrap");
const timerText = document.getElementById("timerText");
const timerBar  = document.getElementById("timerBar");

const msgEl = document.getElementById("msg");

const targetInput  = document.getElementById("targetInput");
const targetBtn    = document.getElementById("targetBtn");
const targetStatus = document.getElementById("targetStatus");

const lvlEl  = document.getElementById("huntLevel");
const curEl  = document.getElementById("huntXPCurrent");
const nextEl = document.getElementById("huntXPNext");
const barEl  = document.getElementById("huntXPBar");
const arrowEl = document.getElementById("arrowCount");

// -------------------------
// Pause from inspector
// -------------------------
window.addEventListener("ds:pause", () => stopHunting(true));
window.addEventListener("ds:resume", () => { /* no auto-start */ });

// -------------------------
// UI header
// -------------------------
function renderHuntHeader(){
  const save = ensureHunting(loadSave());

  if (lvlEl) lvlEl.textContent = String(save.huntingLevel);
  if (curEl) curEl.textContent = String(save.huntingXP);
  if (nextEl) nextEl.textContent = String(save.huntingXPNext);

  const pct = save.huntingXPNext > 0
    ? clamp((save.huntingXP / save.huntingXPNext) * 100, 0, 100)
    : 0;
  if (barEl) barEl.style.width = pct.toFixed(1) + "%";

  if (arrowEl) arrowEl.textContent = String(countByName(save.inventory, "Arrows"));
}

// -------------------------
// Loop + timer bar
// -------------------------
const CD_MS = 6000;
let huntingActive = false;
let huntingTimer = null;

let cdAnim = null;
let cdStart = 0;

let targetRemaining = 0;

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
    if (!huntingActive || window.DS?.isPaused){
      cdAnim = null;
      return;
    }
    const elapsed = now - cdStart;
    const t = Math.min(1, elapsed / CD_MS);

    timerBar.style.width = (t * 100).toFixed(1) + "%";
    const remain = Math.max(0, (CD_MS - elapsed) / 1000);
    timerText.textContent = remain.toFixed(1) + "s";

    if (t < 1) cdAnim = requestAnimationFrame(tick);
    else cdAnim = null;
  };

  if (cdAnim) cancelAnimationFrame(cdAnim);
  cdAnim = requestAnimationFrame(tick);
}

function updateTargetUI(){
  if (!targetStatus) return;
  targetStatus.textContent = targetRemaining > 0 ? `Remaining: ${targetRemaining}` : "";
}

function startHunting(){
  if (window.DS?.isPaused) return;
  if (huntingActive) return;

  // precheck arrows + space
  const s = ensureHunting(loadSave());
  if (countByName(s.inventory, "Arrows") <= 0){
    setMsg("❌ You need Arrows.");
    return;
  }
  if (usedUnits(s.inventory) >= num(s.inventoryMaxSlots, 1000)){
    setMsg("❌ No more inventory space");
    return;
  }

  huntingActive = true;
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  setMsg("🏹 Hunting started.");
  scheduleNext(true);
}

function stopHunting(silent=false){
  huntingActive = false;

  if (huntingTimer){
    clearTimeout(huntingTimer);
    huntingTimer = null;
  }

  stopCooldownUI();

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  targetRemaining = 0;
  updateTargetUI();

  if (!silent) setMsg("⏹ Hunting stopped.");
}

function scheduleNext(runImmediately=false){
  if (!huntingActive) return;
  if (window.DS?.isPaused) return;

  if (runImmediately){
    huntTick();
    return;
  }

  startCooldownUI();
  huntingTimer = setTimeout(() => huntTick(), CD_MS);
}

function grantHuntXP(save, amount){
  save.huntingXP += amount;

  while (save.huntingXP >= save.huntingXPNext){
    save.huntingXP -= save.huntingXPNext;
    save.huntingLevel += 1;
    save.huntingXPNext = Math.floor(save.huntingXPNext * 1.5);
  }
}

function huntTick(){
  if (!huntingActive) return;
  if (window.DS?.isPaused) return;

  const targetId = getTargetId();
  const t = getTargetDef(targetId);

  const save = ensureHunting(loadSave());

  // level req check
  if (save.huntingLevel < t.req){
    setMsg(`❌ Requires Hunting Level ${t.req}.`);
    stopHunting(true);
    return;
  }

  // arrows check (consume 1)
  const haveArrows = countByName(save.inventory, "Arrows");
  if (haveArrows <= 0){
    setMsg("❌ Out of arrows.");
    stopHunting(true);
    setSave(save);
    renderHuntHeader();
    return;
  }

  // capacity check
  if (usedUnits(save.inventory) >= num(save.inventoryMaxSlots, 1000)){
    setMsg("❌ No more inventory space");
    stopHunting(true);
    setSave(save);
    renderHuntHeader();
    return;
  }

  const okConsume = consumeByName(save, "Arrows", 1);
  if (!okConsume){
    setMsg("❌ Out of arrows.");
    stopHunting(true);
    setSave(save);
    renderHuntHeader();
    return;
  }

  // give raw meat
 addToInventoryStack(save, {
  type: "meat",
  id: `raw_${t.id}_meat`,
  name: t.rawName,
  img: t.rawImg
}, 1);


  // XP gain (ρυθμίζεις αν θες)
  grantHuntXP(save, 6);

  setSave(save);
  renderHuntHeader();

  // target mode decrement
  if (targetRemaining > 0){
    targetRemaining -= 1;
    updateTargetUI();
    if (targetRemaining <= 0){
      setMsg(`✅ Target completed! Last drop: 1 ${t.rawName}.`);
      stopHunting(true);
      return;
    }
  }

  setMsg(`🏹 You obtained 1 ${t.rawName}. (-1 Arrow)`);

  scheduleNext(false);
}

// -------------------------
// Target Hunting
// -------------------------
function startTarget(){
  const val = Number(targetInput?.value);
  if (!Number.isFinite(val) || val <= 0){
    alert("Enter a valid target amount (e.g. 100).");
    return;
  }
  targetRemaining = Math.floor(val);
  updateTargetUI();

  if (!huntingActive) startHunting();
  else setMsg(`🎯 Target set: ${targetRemaining}`);
}

// -------------------------
// Boot
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  const t = getTargetDef(getTargetId());

  if (targetImgEl) targetImgEl.src = t.img;
  if (targetNameEl) targetNameEl.textContent = t.name;
  if (dropNameEl) dropNameEl.textContent = `Drops: ${t.rawName}`;

  renderHuntHeader();
  stopCooldownUI();

  backBtn?.addEventListener("click", () => {
    stopHunting(true);
    window.location.href = "hunting.html";
  });

  startBtn?.addEventListener("click", startHunting);
  stopBtn?.addEventListener("click", () => stopHunting(false));
  targetBtn?.addEventListener("click", startTarget);

  if (stopBtn) stopBtn.disabled = true;
});
