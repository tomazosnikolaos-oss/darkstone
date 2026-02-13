// forge_action.js — Forge action page (Mining-action style)
// - Start / Stop / Back
// - 6s cooldown bar + timer text (requestAnimationFrame)
// - Target amount
// - DS pause stops immediately
// - Smelt consumes inputs, produces bars, respects inventory capacity (UNITS)
// - Blacksmith XP scaling + level up

const SAVE_KEY = "darkstone_save_v1";

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

function ensureForge(save){
  save = save && typeof save === "object" ? save : {};
  if (!Array.isArray(save.inventory)) save.inventory = [];

  if (!Number.isFinite(Number(save.blacksmithLevel))) save.blacksmithLevel = 1;
  if (!Number.isFinite(Number(save.blacksmithXP))) save.blacksmithXP = 0;
  if (!Number.isFinite(Number(save.blacksmithXPNext))) save.blacksmithXPNext = 100;

  if (!Number.isFinite(Number(save.inventoryMaxSlots))) save.inventoryMaxSlots = 1000;

  return save;
}

// ------------------------------------
// Recipes (names match your mining ores)
// ------------------------------------
const RECIPES = [
  {
    id:"iron_bar",
    name:"Iron Bar",
    req:1,
    img:"images/bars/iron_bar.png",
    input:[ {name:"Iron Ore", qty:2}, {name:"Coal", qty:1} ],
    output:{ type:"material", name:"Iron Bar", img:"images/bars/iron_bar.png", qty:1 },
    baseXP: 10
  },
  {
    id:"obsidian_bar",
    name:"Obsidian Bar",
    req:10,
    img:"images/bars/obsidian_bar.png",
    input:[ {name:"Obsidian", qty:2}, {name:"Coal", qty:2} ],
    output:{ type:"material", name:"Obsidian Bar", img:"images/bars/obsidian_bar.png", qty:1 },
    baseXP: 30
  },
  {
    id:"adamant_bar",
    name:"Adamant Bar",
    req:20,
    img:"images/bars/adamant_bar.png",
    input:[ {name:"Adamant", qty:2}, {name:"Coal", qty:3} ],
    output:{ type:"material", name:"Adamant Bar", img:"images/bars/adamant_bar.png", qty:1 },
    baseXP: 60
  },
  {
    id:"ruby_bar",
    name:"Ruby Bar",
    req:30,
    img:"images/bars/ruby_bar.png",
    input:[ {name:"Ruby", qty:2}, {name:"Coal", qty:4} ],
    output:{ type:"material", name:"Ruby Bar", img:"images/bars/ruby_bar.png", qty:1 },
    baseXP: 90
  }
];

function getRecipeFromUrl(){
  const p = new URLSearchParams(location.search);
  return p.get("recipe") || "iron_bar";
}
function getRecipeDef(id){
  return RECIPES.find(r => r.id === id) || RECIPES[0];
}

// -------------------------
// Inventory helpers (units capacity)
// -------------------------
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
  const maxUnits = Number(save.inventoryMaxSlots || 1000);
  return usedUnits(save.inventory) + addUnits <= maxUnits;
}

function findStackByName(inv, name){
  return inv.findIndex(it => it && (it.name || "").toLowerCase() === name.toLowerCase());
}
function getQtyByName(inv, name){
  const idx = findStackByName(inv, name);
  if (idx < 0) return 0;
  const it = inv[idx];
  const q = Number(it.quantity ?? it.qty);
  return Number.isFinite(q) ? Math.max(1, q) : 1;
}
function removeByName(save, name, qtyNeeded){
  const idx = findStackByName(save.inventory, name);
  if (idx < 0) return false;

  const it = save.inventory[idx];
  const q = Number(it.quantity ?? it.qty);
  const have = Number.isFinite(q) ? Math.max(1, q) : 1;

  if (have > qtyNeeded){
    it.quantity = have - qtyNeeded;
    return true;
  }
  if (have === qtyNeeded){
    save.inventory.splice(idx, 1);
    return true;
  }
  return false;
}

// Stacking compatible with ui.js
function itemStackKey(it){
  return [
    it.type || "",
    it.name || "",
    it.slot || "",
    it.reqLevel ?? 1,
    it.atk ?? 0,
    it.def ?? 0,
    it.rarity || "",
    it.img || ""
  ].join("::");
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
// XP scaling
// -------------------------
function xpNextForLevel(lvl){
  const L = Math.max(1, Number(lvl) || 1);
  return 100 + (L - 1) * 60 + Math.floor((L - 1) * (L - 1) * 10);
}
function gainBlacksmithXP(save, baseXP, reqLevel){
  const mult = 1 + (Number(reqLevel || 1) / 20);
  save.blacksmithXP += Math.round(Number(baseXP || 0) * mult);

  while (save.blacksmithXP >= save.blacksmithXPNext){
    save.blacksmithXP -= save.blacksmithXPNext;
    save.blacksmithLevel += 1;
    save.blacksmithXPNext = xpNextForLevel(save.blacksmithLevel);
  }
}

// -------------------------
// DOM
// -------------------------
const backBtn  = document.getElementById("backBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");

const barImg  = document.getElementById("barImg");
const barName = document.getElementById("barName");
const barReq  = document.getElementById("barReq");

const timerWrap = document.getElementById("timerWrap");
const timerText = document.getElementById("timerText");
const timerBar  = document.getElementById("timerBar");

const msgEl = document.getElementById("msg");

const targetInput  = document.getElementById("targetInput");
const targetBtn    = document.getElementById("targetBtn");
const targetStatus = document.getElementById("targetStatus");

const lvlEl  = document.getElementById("bsLevel");
const curEl  = document.getElementById("bsXPCurrent");
const nextEl = document.getElementById("bsXPNext");
const xpBarEl  = document.getElementById("bsXPBar");

// -------------------------
// Global pause/resume from ui.js inspector
// -------------------------
window.addEventListener("ds:pause", () => {
  stopSmelt(true);
});
window.addEventListener("ds:resume", () => {
  // do NOT auto-start
});

// -------------------------
// UI: Header
// -------------------------
function renderForgeHeader(){
  const save = ensureForge(loadSave());

  if (lvlEl) lvlEl.textContent = String(save.blacksmithLevel);
  if (curEl) curEl.textContent = String(save.blacksmithXP);
  if (nextEl) nextEl.textContent = String(save.blacksmithXPNext);

  const pct = save.blacksmithXPNext > 0
    ? Math.max(0, Math.min(100, (save.blacksmithXP / save.blacksmithXPNext) * 100))
    : 0;

  if (xpBarEl) xpBarEl.style.width = pct.toFixed(1) + "%";
}

// -------------------------
// Smelting loop + timer bar
// -------------------------
const CD_MS = 6000;
let smeltActive = false;
let smeltTimer = null;

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
    if (!smeltActive || window.DS?.isPaused){
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

function startSmelt(){
  if (window.DS?.isPaused) return;
  if (smeltActive) return;

  smeltActive = true;
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  setMsg("⚒ Smelting started.");
  scheduleNextSmelt(true); // immediate first tick
}

function stopSmelt(silent=false){
  smeltActive = false;

  if (smeltTimer){
    clearTimeout(smeltTimer);
    smeltTimer = null;
  }

  stopCooldownUI();

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  // stop target mode too
  targetRemaining = 0;
  updateTargetUI();

  if (!silent) setMsg("⏹ Smelting stopped.");
}

function scheduleNextSmelt(runImmediately=false){
  if (!smeltActive) return;
  if (window.DS?.isPaused) return;

  if (runImmediately){
    smeltTick();
    return;
  }

  startCooldownUI();
  smeltTimer = setTimeout(() => {
    smeltTick();
  }, CD_MS);
}

function recipeLine(r){
  const inputs = r.input.map(x => `${x.qty} ${x.name}`).join(" + ");
  return `Req Lv ${r.req} • ${inputs} → ${r.output.qty} ${r.output.name}`;
}

function canSmelt(save, r){
  if (save.blacksmithLevel < r.req) return { ok:false, why:`❌ Requires Blacksmith Level ${r.req}.` };

  for (const x of r.input){
    const have = getQtyByName(save.inventory, x.name);
    if (have < x.qty) return { ok:false, why:`❌ Need ${x.name} x${x.qty}.` };
  }

  if (!hasSpaceFor(save, r.output.qty)){
    return { ok:false, why:"❌ No more inventory space." };
  }

  return { ok:true, why:"" };
}

function smeltTick(){
  if (!smeltActive) return;
  if (window.DS?.isPaused) return;

  const recId = getRecipeFromUrl();
  const r = getRecipeDef(recId);

  const save = ensureForge(loadSave());

  const check = canSmelt(save, r);
  if (!check.ok){
    setMsg(check.why);
    stopSmelt(true);
    return;
  }

  // consume inputs
  for (const x of r.input){
    const ok = removeByName(save, x.name, x.qty);
    if (!ok){
      setMsg(`❌ Missing ${x.name}.`);
      stopSmelt(true);
      setSave(save);
      return;
    }
  }

  // add output
  addToInventoryStack(save, { type:r.output.type, name:r.output.name, img:r.output.img }, r.output.qty);

  // xp
  save.blacksmithXPNext = xpNextForLevel(save.blacksmithLevel);
  gainBlacksmithXP(save, r.baseXP, r.req);

  setSave(save);
  renderForgeHeader();

  // target decrement
  if (targetRemaining > 0){
    targetRemaining -= 1;
    updateTargetUI();
    if (targetRemaining <= 0){
      setMsg(`✅ Target completed! You crafted 1 ${r.output.name} (last).`);
      stopSmelt(true);
      return;
    }
  }

  setMsg(`⚒ You crafted 1 ${r.output.name}.`);

  // next
  scheduleNextSmelt(false);
}

// -------------------------
// Target Smelting
// -------------------------
function startTargetSmelt(){
  const val = Number(targetInput?.value);
  if (!Number.isFinite(val) || val <= 0){
    alert("Enter a valid target amount (e.g. 100).");
    return;
  }
  targetRemaining = Math.floor(val);
  updateTargetUI();

  if (!smeltActive) startSmelt();
  else setMsg(`🎯 Target set: ${targetRemaining}`);
}

// -------------------------
// Boot
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  const recId = getRecipeFromUrl();
  const r = getRecipeDef(recId);

  if (barImg) barImg.src = r.img;
  if (barName) barName.textContent = r.name;
  if (barReq) barReq.textContent = recipeLine(r);

  renderForgeHeader();
  stopCooldownUI();

  backBtn?.addEventListener("click", () => {
    stopSmelt(true);
    window.location.href = "forge.html";
  });

  startBtn?.addEventListener("click", startSmelt);
  stopBtn?.addEventListener("click", () => stopSmelt(false));

  targetBtn?.addEventListener("click", startTargetSmelt);

  if (stopBtn) stopBtn.disabled = true;
});
