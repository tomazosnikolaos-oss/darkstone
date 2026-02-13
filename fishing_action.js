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

function ensureFishing(save){
  save = save && typeof save === "object" ? save : {};
  if (!Number.isFinite(Number(save.fishingLevel))) save.fishingLevel = 1;
  if (!Number.isFinite(Number(save.fishingXP))) save.fishingXP = 0;
  if (!Number.isFinite(Number(save.fishingXPNext))) save.fishingXPNext = 100;
  if (!Array.isArray(save.inventory)) save.inventory = [];
  if (!Number.isFinite(Number(save.inventoryMaxSlots))) save.inventoryMaxSlots = 1000;
  return save;
}

const SPOTS = [
  {
    id:"Riverbend_Falls", req:1, title:"Riverbend Falls",
    img:"images/fishing_spots/Riverbend_Falls.png",
    fish: [
      { id:"silver_minnow", name:"Silver Minnow", img:"images/fish/silver_minnow.png", chance:0.70 },
      { id:"river_trout",   name:"River Trout",   img:"images/fish/river_trout.png",   chance:0.30 }
    ]
  },
  {
    id:"Crystal_Cove", req:5, title:"Crystal Cove",
    img:"images/fishing_spots/Crystal_Cove.png",
    fish: [
      { id:"moonlit_sardine",  name:"Moonlit Sardine",  img:"images/fish/moonlit_sardine.png",  chance:0.70 },
      { id:"crystal_snapper",  name:"Crystal Snapper",  img:"images/fish/crystal_snapper.png",  chance:0.30 }
    ]
  },
  {
    id:"Sunset_Pier", req:10, title:"Sunset Pier",
    img:"images/fishing_spots/Sunset_Pier.png",
    fish: [
      { id:"sunset_mackerel", name:"Sunset Mackerel", img:"images/fish/sunset_mackerel.png", chance:0.70 },
      { id:"ember_tuna",      name:"Ember Tuna",      img:"images/fish/ember_tuna.png",      chance:0.30 }
    ]
  },
  {
    id:"Murkwood_Swamp", req:15, title:"Murkwood Swamp",
    img:"images/fishing_spots/Murkwood_Swamp.png",
    fish: [
      { id:"bog_carp",      name:"Bog Carp",      img:"images/fish/bog_carp.png",      chance:0.70 },
      { id:"witchfin_eel",  name:"Witchfin Eel",  img:"images/fish/witchfin_eel.png",  chance:0.30 }
    ]
  }
];

function getSpotFromUrl(){
  const p = new URLSearchParams(location.search);
  return p.get("spot") || "Riverbend_Falls";
}
function getSpotDef(id){
  return SPOTS.find(s => s.id === id) || SPOTS[0];
}

// ---- inventory capacity in UNITS (sum quantities) ----
function usedUnits(inv){
  let u = 0;
  for (const it of inv){
    if (!it) continue;
    const q = Number(it.quantity ?? it.qty);
    u += Number.isFinite(q) ? Math.max(1, q) : 1;
  }
  return u;
}
function hasSpaceFor(save, addUnits){
  return usedUnits(save.inventory) + addUnits <= Number(save.inventoryMaxSlots || 1000);
}

// stack key (DO NOT include img so path changes won't break stacks)
function itemStackKey(it){
  return [it.type||"", it.id||"", it.name||""].join("::");
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

// ---- UI header render ----
function renderFishingHeader(){
  const s = ensureFishing(loadSave());
  document.getElementById("fishLevel").textContent = String(s.fishingLevel);
  document.getElementById("fishXPCurrent").textContent = String(s.fishingXP);
  document.getElementById("fishXPNext").textContent = String(s.fishingXPNext);

  const pct = s.fishingXPNext > 0 ? clamp((s.fishingXP / s.fishingXPNext) * 100, 0, 100) : 0;
  document.getElementById("fishXPBar").style.width = pct.toFixed(1) + "%";
}

// ---- timer loop (same style as mining_action) ----
const CD_MS = 6000;
let fishingActive = false;
let fishingTimer = null;

let cdAnim = null;
let cdStart = 0;

let targetRemaining = 0;

const backBtn = document.getElementById("backBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");

const spotImg = document.getElementById("spotImg");
const spotName = document.getElementById("spotName");
const spotInfo = document.getElementById("spotInfo");

const timerWrap = document.getElementById("timerWrap");
const timerText = document.getElementById("timerText");
const timerBar  = document.getElementById("timerBar");

const msgEl = document.getElementById("msg");

const targetInput  = document.getElementById("targetInput");
const targetBtn    = document.getElementById("targetBtn");
const targetStatus = document.getElementById("targetStatus");

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
    if (!fishingActive || window.DS?.isPaused){
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

// pause from inspector
window.addEventListener("ds:pause", () => stopFishing(true));
window.addEventListener("ds:resume", () => { /* no auto-start */ });

function startFishing(){
  if (window.DS?.isPaused) return;
  if (fishingActive) return;

  fishingActive = true;
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  setMsg("🎣 Fishing started.");
  scheduleNext(true);
}

function stopFishing(silent=false){
  fishingActive = false;

  if (fishingTimer){
    clearTimeout(fishingTimer);
    fishingTimer = null;
  }

  stopCooldownUI();

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  targetRemaining = 0;
  updateTargetUI();

  if (!silent) setMsg("⏹ Fishing stopped.");
}

function scheduleNext(runImmediately=false){
  if (!fishingActive) return;
  if (window.DS?.isPaused) return;

  if (runImmediately){
    fishTick();
    return;
  }

  startCooldownUI();
  fishingTimer = setTimeout(() => fishTick(), CD_MS);
}

function rollFish(spot){
  const r = Math.random();
  let acc = 0;
  for (const f of spot.fish){
    acc += f.chance;
    if (r <= acc) return f;
  }
  return spot.fish[spot.fish.length - 1];
}

function fishTick(){
  if (!fishingActive) return;
  if (window.DS?.isPaused) return;

  const spotId = getSpotFromUrl();
  const spot = getSpotDef(spotId);

  const s = ensureFishing(loadSave());

  if (s.fishingLevel < spot.req){
    setMsg(`❌ Requires Fishing Level ${spot.req}.`);
    stopFishing(true);
    return;
  }

  if (!hasSpaceFor(s, 1)){
    setMsg("❌ No more inventory space");
    stopFishing(true);
    setSave(s);
    return;
  }

  const f = rollFish(spot);

  addToInventoryStack(s, {
    type: "fish",
    id: f.id,
    name: f.name,
    img: f.img
  }, 1);

  // XP gain (simple core)
  s.fishingXP += 6;

  while (s.fishingXP >= s.fishingXPNext){
    s.fishingXP -= s.fishingXPNext;
    s.fishingLevel += 1;
    s.fishingXPNext = Math.floor(s.fishingXPNext * 1.5);
  }

  setSave(s);
  renderFishingHeader();

  if (targetRemaining > 0){
    targetRemaining -= 1;
    updateTargetUI();
    if (targetRemaining <= 0){
      setMsg(`✅ Target completed! You caught 1 ${f.name} (last).`);
      stopFishing(true);
      return;
    }
  }

  setMsg(`🎣 You caught 1 ${f.name}.`);
  scheduleNext(false);
}

function startTargetFishing(){
  const val = Number(targetInput?.value);
  if (!Number.isFinite(val) || val <= 0){
    alert("Enter a valid target amount (e.g. 100).");
    return;
  }
  targetRemaining = Math.floor(val);
  updateTargetUI();

  if (!fishingActive) startFishing();
  else setMsg(`🎯 Target set: ${targetRemaining}`);
}

window.addEventListener("DOMContentLoaded", () => {
  const spotId = getSpotFromUrl();
  const spot = getSpotDef(spotId);

  if (spotImg) spotImg.src = spot.img;
  if (spotName) spotName.textContent = spot.title;
  if (spotInfo) spotInfo.textContent = `Req Fishing Lv ${spot.req} • 70% / 30% fish`;

  renderFishingHeader();
  stopCooldownUI();

  backBtn?.addEventListener("click", () => {
    stopFishing(true);
    window.location.href = "fishing.html";
  });

  startBtn?.addEventListener("click", startFishing);
  stopBtn?.addEventListener("click", () => stopFishing(false));
  targetBtn?.addEventListener("click", startTargetFishing);

  if (stopBtn) stopBtn.disabled = true;
});
