// fight.js — Darkstone Chronicles (UPDATED)
// ✅ Auto-fight encounter every 6s
// ✅ -2 stamina / encounter
// ✅ NEW damage formula:
//    - if ATK <= DEF => 0–1 dmg (chip)
//    - else => (ATK-DEF) with ±10% variance
// ✅ NEW anti-soup cap: MAX_ROUNDS = 15, then enemy flees (no rewards)
// ✅ Zones now use reqLevel (locked if hero level too low)
// ✅ No start/stop buttons needed (Attack starts loop)
// ✅ Battle hero HP uses persistent save heroHP/heroHPMax (matches global HUD)

const SAVE_KEY = "darkstone_save_v1";

// =========================
// SAVE / LOAD
// =========================
function loadSave(){
  const raw = localStorage.getItem(SAVE_KEY);
  if(!raw) return {};
  try { return JSON.parse(raw); } catch(e){ return {}; }
}

function savePatch(patch){
  const raw = localStorage.getItem(SAVE_KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch(e){ data = {}; }
  Object.assign(data, patch);
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function getCurrentSave(){
  return loadSave();
}

const num = (v, f=0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

// =========================
// SETTINGS
// =========================
const ENCOUNTER_COST = 2;
const ENCOUNTER_CD_MS = 6000;
const MAX_ROUNDS = 15;

// variance for diff-based damage (±10%)
const VAR_MIN = 0.90;
const VAR_MAX = 1.10;

// =========================
// DATA: Zones + Mobs
// =========================
const ZONES = [
  {
    id: "undead",
    name: "Undead Territory",
    reqLevel: 1,
    img: "images/zones/undead.png",
    mobs: [
      { id:"skeleton",    name:"Skeleton",     lvl:2,  hp:35, atk:8,  def:3,  img:"images/mobs/skeleton.png" },
      { id:"zombie",      name:"Zombie",       lvl:3,  hp:40, atk:9,  def:4,  img:"images/mobs/zombie.png" },
      { id:"ghoul",       name:"Ghoul",        lvl:4,  hp:45, atk:10, def:5,  img:"images/mobs/ghoul.png" },
      { id:"wraith",      name:"Wraith",       lvl:6,  hp:50, atk:12, def:6,  img:"images/mobs/wraith.png" },
      { id:"cryptknight", name:"Crypt Knight", lvl:9,  hp:70, atk:16, def:9,  img:"images/mobs/cryptknight.png" }
    ]
  },
  {
    id: "necropolis",
    name: "Necropolis",
    reqLevel: 10,
    img: "images/zones/necropolis.png",
    mobs: [
      { id:"boneguard",       name:"Bone Guard",    lvl:11, hp:80,  atk:18, def:10, img:"images/mobs/boneguard.png" },
      { id:"plague bearer",   name:"Plague Bearer", lvl:12, hp:90,  atk:19, def:11, img:"images/mobs/plaguebearer.png" },
      { id:"deathmage",       name:"Death Mage",    lvl:14, hp:85,  atk:22, def:10, img:"images/mobs/deathmage.png" },
      { id:"reaper",          name:"Reaper",        lvl:16, hp:100, atk:24, def:12, img:"images/mobs/reaper.png" },
      { id:"lich",            name:"Lich Lord",     lvl:19, hp:130, atk:28, def:15, img:"images/mobs/lich.png" }
    ]
  }
];

// =========================
// DROPS HELPERS (Gold + Inventory)
// =========================
function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max){
  return min + Math.random() * (max - min);
}

function addGold(amount){
  const raw = localStorage.getItem(SAVE_KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch(e){ data = {}; }
  data.gold = (data.gold ?? 0) + amount;
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

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

function addItemToSave(item){
  const raw = localStorage.getItem(SAVE_KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch(e){ data = {}; }
  if(!Array.isArray(data.inventory)) data.inventory = [];

  // NOTE: ui.js unstackGear makes gear non-stack in final render/save,
  // but keeping this logic doesn't break anything.
  const stackableTypes = new Set(["ore","material","consumable","gear"]);

  if(stackableTypes.has(item.type)){
    const key = itemStackKey(item);
    const ex = data.inventory.find(i => i && itemStackKey(i) === key);
    if(ex) ex.quantity = (ex.quantity ?? 1) + (item.quantity ?? 1);
    else data.inventory.push({ ...item, quantity: item.quantity ?? 1 });
  }else{
    data.inventory.push({ ...item, quantity: item.quantity ?? 1 });
  }

  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function rollGold(zoneId, mobLvl){
  const base = zoneId === "necropolis" ? { min: 6, max: 12 } : { min: 2, max: 6 };
  const bonusMin = Math.floor(mobLvl / 4);
  const bonusMax = Math.floor(mobLvl / 2);
  return randInt(base.min + bonusMin, base.max + bonusMax);
}

// =========================
// UNIQUE DROPS PER MOB + ZONE MYTHIC
// =========================
const RARITY_CHANCE = { epic: 0.008, rare: 0.03, uncommon: 0.10, common: 0.20 };
const MYTHIC_CHANCE = 0.001;

const ITEM_LIBRARY = {
  rusty_sword:    { type:"gear", slot:"mainHand", name:"Rusty Sword", atk:2, def:0, reqLevel:1, rarity:"common", img:"images/items/rusty_sword.png" },
  cracked_shield: { type:"gear", slot:"offHand",  name:"Cracked Shield", atk:0, def:2, reqLevel:1, rarity:"common", img:"images/items/cracked_shield.png" },
  tattered_boots: { type:"gear", slot:"boots",    name:"Tattered Boots", atk:0, def:1, reqLevel:2, rarity:"common", img:"images/items/tattered_boots.png" },
  leather_bracers:{ type:"gear", slot:"bracers",  name:"Leather Bracers", atk:0, def:2, reqLevel:4, rarity:"uncommon", img:"images/items/leather_bracers.png" },
  shadow_blade:   { type:"gear", slot:"mainHand", name:"Shadow Blade", atk:7, def:0, reqLevel:9, rarity:"epic", img:"images/items/shadow_blade.png" },

  bone_club:      { type:"gear", slot:"mainHand", name:"Bone Club", atk:4, def:0, reqLevel:10, rarity:"common", img:"images/items/bone_club.png" },
  plague_mask:    { type:"gear", slot:"helmet",   name:"Plague Mask", atk:0, def:4, reqLevel:12, rarity:"uncommon", img:"images/items/plague_mask.png" },
  death_shroud:   { type:"gear", slot:"chest",    name:"Death Shroud", atk:2, def:4, reqLevel:14, rarity:"rare", img:"images/items/death_shroud.png" },
  reaper_scythe:  { type:"gear", slot:"mainHand", name:"Reaper’s Scythe", atk:10, def:0, reqLevel:16, rarity:"epic", img:"images/items/reaper_scythe.png" },
  necro_ring:     { type:"gear", slot:"ring",     name:"Necromancer’s Ring", atk:4, def:4, reqLevel:18, rarity:"epic", img:"images/items/necro_ring.png" }
};

const MOB_UNIQUE_DROP = {
  undead: {
    skeleton: ITEM_LIBRARY.rusty_sword,
    zombie: ITEM_LIBRARY.cracked_shield,
    ghoul: ITEM_LIBRARY.tattered_boots,
    wraith: ITEM_LIBRARY.leather_bracers,
    cryptknight: ITEM_LIBRARY.shadow_blade
  },
  necropolis: {
    boneguard: ITEM_LIBRARY.bone_club,
    "plague bearer": ITEM_LIBRARY.plague_mask,
    deathmage: ITEM_LIBRARY.death_shroud,
    reaper: ITEM_LIBRARY.reaper_scythe,
    lich: ITEM_LIBRARY.necro_ring
  }
};

const ZONE_MYTHIC = {
  undead: {
    type:"gear", slot:"mainHand", name:"Graveborn Blade",
    atk:12, def:4, reqLevel:10, rarity:"mythic", img:"images/items/graveborn_blade.png"
  },
  necropolis: {
    type:"gear", slot:"amulet", name:"Lich King’s Amulet",
    atk:6, def:6, reqLevel:18, rarity:"mythic", img:"images/items/lich_kings_amulet.png"
  }
};

function canUse(it, heroLevel){
  return it && (it.reqLevel ?? 1) <= heroLevel;
}

function rollMobUniqueDrop(zoneId, mobId, heroLevel){
  const z = MOB_UNIQUE_DROP[zoneId];
  if(!z) return null;
  const it = z[mobId];
  if(!it) return null;
  if(!canUse(it, heroLevel)) return null;

  const p = RARITY_CHANCE[it.rarity] ?? 0.20;
  return (Math.random() < p) ? { ...it, quantity: 1 } : null;
}

function rollZoneMythic(zoneId, heroLevel){
  const m = ZONE_MYTHIC[zoneId];
  if(!m) return null;
  if(!canUse(m, heroLevel)) return null;
  return (Math.random() < MYTHIC_CHANCE) ? { ...m, quantity: 1 } : null;
}

// =========================
// DAMAGE FORMULA (NEW)
// =========================
function calcDamage(att, def){
  att = num(att, 0);
  def = num(def, 0);
function roundXPNext(v){
  v = Number(v) || 0;
  if (v <= 0) return 0;

  const step = (v >= 10000) ? 500 : 100;
  return Math.ceil(v / step) * step;
}

  // chip if you cannot penetrate defense
  if(att <= def){
    return (Math.random() < 0.5) ? 0 : 1; // 0–1
  }

  const diff = att - def; // positive
  const v = randFloat(VAR_MIN, VAR_MAX); // ±10%
  // diff-based with mild variance
  const dmg = Math.floor(diff * v);

  // still ensure at least 1
  return Math.max(1, dmg);
}

// =========================
// EQUIPMENT TOTALS SYNC (same as your logic)
// =========================
function getEquipBonuses(saveObj){
  let atkB = 0, defB = 0;
  const eq = (saveObj && typeof saveObj.equipment === "object") ? saveObj.equipment : {};
  Object.keys(eq).forEach(k => {
    const it = eq[k];
    if(!it) return;
    atkB += Number.isFinite(Number(it.atk)) ? Number(it.atk) : 0;
    defB += Number.isFinite(Number(it.def)) ? Number(it.def) : 0;
  });
  return { atkB, defB };
}

function recomputeTotalsAndSave(){
  const cur = getCurrentSave();

  const baseAtk = cur.heroAttack ?? 10;
  const baseDef = cur.heroDefense ?? 10;

  const { atkB, defB } = getEquipBonuses(cur);

  const totalAtk = baseAtk + atkB;
  const totalDef = baseDef + defB;

  savePatch({ attackTotal: totalAtk, defenseTotal: totalDef });

  return { baseAtk, baseDef, totalAtk, totalDef };
}

// =========================
// DOM (must exist in fight.html)
// =========================
const zonesGrid = document.getElementById("zonesGrid");
const zonesWrap = document.getElementById("zonesWrap");
const mobsWrap  = document.getElementById("mobsWrap");
const mobsGrid  = document.getElementById("mobsGrid");
const zoneTitle = document.getElementById("zoneTitle");

const battleWrap = document.getElementById("battleWrap");
const heroImg = document.getElementById("heroImg");
const mobImg  = document.getElementById("mobImg");
const heroInfo = document.getElementById("heroInfo");
const mobInfo  = document.getElementById("mobInfo");
const heroHpBar = document.getElementById("heroHpBar");
const mobHpBar  = document.getElementById("mobHpBar");
const heroHpText = document.getElementById("heroHpText");
const mobHpText  = document.getElementById("mobHpText");
const battleLog  = document.getElementById("battleLog");

const attackBtn = document.getElementById("attackBtn");
const runBtn    = document.getElementById("runBtn");
const backBtn   = document.getElementById("backBtn");
const toZonesBtn= document.getElementById("toZonesBtn");

const cooldownWrap = document.getElementById("cooldownWrap");
const cooldownBar  = document.getElementById("cooldownBar");
const cooldownText = document.getElementById("cooldownText");

// =========================
// RUNTIME STATE
// =========================
let currentZone = null;
let currentMobData = null; // template
let currentMob = null;     // runtime

let autoFighting = false;
let autoTimer = null;
let cdAnimId = null;
let cdStart = 0;

function pushBattleLog(text){
  const div = document.createElement("div");
  div.className = "log-item";
  div.textContent = text;
  battleLog.prepend(div);

  const items = battleLog.querySelectorAll(".log-item");
  for(let i=10;i<items.length;i++) items[i].remove();
}

// =========================
// HERO STATE from save (always sync each encounter)
// =========================
function getHeroState(){
  const s = loadSave();

  // recompute totals so attackTotal/defenseTotal always correct
  const totals = recomputeTotalsAndSave();
  const heroLevel = num(s.heroLevel, 1);

  // IMPORTANT: Use persistent HP from save (matches HUD)
  const hpMax = Math.max(1, num(s.heroHPMax, 100));
  const hpNow = clamp(num(s.heroHP, hpMax), 0, hpMax);

  const staminaMax = Math.max(1, num(s.staminaMax, 100));
  const staminaNow = clamp(num(s.stamina, staminaMax), 0, staminaMax);

  return {
    level: heroLevel,
    atk: num(s.attackTotal, totals.totalAtk),
    def: num(s.defenseTotal, totals.totalDef),
    hpMax,
    hp: hpNow,
    staminaMax,
    stamina: staminaNow,
    heroXP: num(s.heroXP, 0),
    heroXPNext: Math.max(1, num(s.heroXPNext, 100))
  };
}

function setHeroHPToSave(hp, hpMax){
  savePatch({
    heroHP: hp,
    heroHPMax: hpMax,
    lastActiveTs: Date.now()
  });
}

function spendStamina(cost){
  const s = loadSave();
  const st = clamp(num(s.stamina, 0), 0, num(s.staminaMax, 100));
  if(st < cost) return false;
  savePatch({ stamina: st - cost });
  return true;
}

// =========================
// UI helpers
// =========================
function setHpBars(hero){
  const heroPct = hero.hpMax > 0 ? Math.max(0, (hero.hp / hero.hpMax) * 100) : 0;
  heroHpBar.style.width = heroPct + "%";
  heroHpBar.style.background = "linear-gradient(90deg, #00ff88, #00bb55)";
  heroHpText.textContent = `${Math.max(0, hero.hp)} / ${hero.hpMax} HP`;

  const mobPct = currentMob.hpMax > 0 ? Math.max(0, (currentMob.hp / currentMob.hpMax) * 100) : 0;
  mobHpBar.style.width = mobPct + "%";
  mobHpBar.style.background = "linear-gradient(90deg, #ff5555, #bb0000)";
  mobHpText.textContent = `${Math.max(0, currentMob.hp)} / ${currentMob.hpMax} HP`;
}

function refreshHeroInfo(hero){
  // keep it minimal as you requested (name later)
  heroInfo.textContent = `Hero • Lv ${hero.level}`;
}

// =========================
// Cooldown UI (6s bar)
// =========================
function stopCooldownUI(){
  if(cdAnimId) cancelAnimationFrame(cdAnimId);
  cdAnimId = null;
  if(cooldownWrap) cooldownWrap.style.display = "none";
  if(cooldownBar) cooldownBar.style.width = "0%";
  if(cooldownText) cooldownText.textContent = (ENCOUNTER_CD_MS/1000).toFixed(1) + "s";
}

function startCooldownUI(){
  if(!cooldownWrap || !cooldownBar || !cooldownText) return;
  cooldownWrap.style.display = "";
  cdStart = performance.now();

  const tick = (now) => {
    const elapsed = now - cdStart;
    const t = Math.min(1, elapsed / ENCOUNTER_CD_MS);

    cooldownBar.style.width = (t * 100).toFixed(1) + "%";
    cooldownBar.style.background = "linear-gradient(90deg, #ffaa00, #bb6600)";

    const remain = Math.max(0, (ENCOUNTER_CD_MS - elapsed) / 1000);
    cooldownText.textContent = remain.toFixed(1) + "s";

    if(t < 1 && autoFighting){
      cdAnimId = requestAnimationFrame(tick);
    } else {
      cdAnimId = null;
    }
  };

  if(cdAnimId) cancelAnimationFrame(cdAnimId);
  cdAnimId = requestAnimationFrame(tick);
}

function stopAutoFight(silent=false){
  autoFighting = false;
  if(autoTimer){
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  if(!silent) pushBattleLog("⏹ Stopped.");
  stopCooldownUI();
}

function scheduleNextEncounter(){
  if(!autoFighting) return;
  if (window.DS?.isPaused) return;

  startCooldownUI();
  autoTimer = setTimeout(() => {
    runEncounter();
  }, ENCOUNTER_CD_MS);
}

// Pause integration
window.addEventListener("ds:pause", () => stopAutoFight(true));

// =========================
// Zones UI (req level lock)
// =========================
function showZones(){
  stopAutoFight(true);

  const hero = getHeroState();

  zonesWrap.style.display = "";
  mobsWrap.style.display = "none";
  battleWrap.style.display = "none";
  zonesGrid.innerHTML = "";

  ZONES.forEach(z => {
    const locked = hero.level < (z.reqLevel ?? 1);

    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.cursor = locked ? "not-allowed" : "pointer";
    card.style.textAlign = "left";
    card.style.opacity = locked ? "0.55" : "1";

    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="${z.img}" alt="${z.name}"
             style="width:84px;height:84px;border-radius:10px;border:2px solid #333;object-fit:cover;filter:${locked ? "grayscale(0.9)" : "none"};">
        <div>
          <div style="font-size:18px;font-weight:bold;">${z.name}</div>
          <div style="opacity:.9;margin-top:4px;">Req Lv ${z.reqLevel ?? 1}</div>
          ${locked ? `<div style="opacity:.85;margin-top:4px;font-size:12px;">Locked</div>` : ``}
        </div>
      </div>
    `;

    if(!locked){
      card.addEventListener("click", () => showMobs(z));
    }
    zonesGrid.appendChild(card);
  });
}

function showMobs(zone){
  stopAutoFight(true);

  currentZone = zone;
  zonesWrap.style.display = "none";
  mobsWrap.style.display = "";
  battleWrap.style.display = "none";

  zoneTitle.textContent = `${zone.name} (Req Lv ${zone.reqLevel ?? 1})`;
  mobsGrid.innerHTML = "";

  zone.mobs.forEach(m => {
    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.cursor = "pointer";
    card.style.textAlign = "left";

    // ✅ show only name + level (no stats)
    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${m.img}" alt="${m.name}" style="width:64px;height:64px;border-radius:10px;border:2px solid #333;object-fit:cover;">
        <div>
          <div style="font-size:16px;font-weight:bold;">${m.name}</div>
          <div style="opacity:.9;">Lvl ${m.lvl}</div>
          <div style="opacity:.85;font-size:12px;">Click to fight</div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => startBattle(m));
    mobsGrid.appendChild(card);
  });
}

// =========================
// Battle start
// =========================
function startBattle(mobData){
  stopAutoFight(true);

  currentMobData = mobData;

  mobsWrap.style.display = "none";
  battleWrap.style.display = "";

  heroImg.src = "images/hero.png";
  mobImg.src = mobData.img;

  battleLog.innerHTML = "";

  // load hero from save (persistent HP)
  const hero = getHeroState();

  // minimal mob header (name + level only)
  mobInfo.textContent = `${mobData.name} • Lv ${mobData.lvl}`;
  refreshHeroInfo(hero);

  currentMob = { ...mobData, hpMax: mobData.hp, hp: mobData.hp };
  setHpBars(hero);

  pushBattleLog(`⚔️ Engaged ${mobData.name}. Press Attack to start auto-resolve.`);
}

// =========================
// Encounter resolve (instant)
// =========================
function runEncounter(){
  if (window.DS?.isPaused) return;
  if(!autoFighting) return;

  if(!currentMobData || !currentZone){
    pushBattleLog("❌ No target selected.");
    stopAutoFight(true);
    return;
  }

  // pay stamina
  const heroBefore = getHeroState();
  if(heroBefore.stamina < ENCOUNTER_COST){
    pushBattleLog(`😴 Not enough stamina. Need ${ENCOUNTER_COST}.`);
    stopAutoFight(true);
    return;
  }
  if(!spendStamina(ENCOUNTER_COST)){
    pushBattleLog(`😴 Not enough stamina. Need ${ENCOUNTER_COST}.`);
    stopAutoFight(true);
    return;
  }

  // reload hero after stamina patch + totals
  let hero = getHeroState();

  // fresh mob each encounter
  currentMob = { ...currentMobData, hpMax: currentMobData.hp, hp: currentMobData.hp };

  let rounds = 0;

  while(hero.hp > 0 && currentMob.hp > 0 && rounds < MAX_ROUNDS){
    rounds++;

    // hero hits first
    const heroDmg = calcDamage(hero.atk, currentMob.def);
    currentMob.hp -= heroDmg;
    if(currentMob.hp <= 0) break;

    // mob hits
    const mobDmg = calcDamage(currentMob.atk, hero.def);
    hero.hp -= mobDmg;
  }

  // clamp
  hero.hp = Math.max(0, hero.hp);
  currentMob.hp = Math.max(0, currentMob.hp);

  // persist hero HP (this keeps HUD in sync)
  setHeroHPToSave(hero.hp, hero.hpMax);

  // UI update
  setHpBars(hero);
  refreshHeroInfo(hero);

  // lose
  if(hero.hp <= 0){
    pushBattleLog(`❌ You were defeated by ${currentMob.name} in ${rounds} rounds. (-${ENCOUNTER_COST} stamina)`);
    stopAutoFight(true);
    return;
  }

  // stalemate -> enemy flees
  if(currentMob.hp > 0 && rounds >= MAX_ROUNDS){
    pushBattleLog(`🏃 ${currentMob.name} fled after ${MAX_ROUNDS} rounds. (No rewards) (-${ENCOUNTER_COST} stamina)`);
    scheduleNextEncounter();
    return;
  }

  // win rewards
  const zoneId = currentZone.id;
  const xpGain = Math.max(5, 8 + currentMob.lvl * 2);
  const goldGain = rollGold(zoneId, currentMob.lvl);
  addGold(goldGain);

  const heroLevel = hero.level;
  const mobId = currentMobData.id;
  const item = rollMobUniqueDrop(zoneId, mobId, heroLevel);
  const mythic = rollZoneMythic(zoneId, heroLevel);

  if(item) addItemToSave(item);
  if(mythic) addItemToSave(mythic);

  pushBattleLog(`✅ Won vs ${currentMob.name} in ${rounds} rounds. 🏆 XP +${xpGain} | 💰 Gold +${goldGain} (-${ENCOUNTER_COST} stamina)`);
  if(item) pushBattleLog(`🎁 Drop: ${item.name} (Req Lv ${item.reqLevel})`);
  if(mythic) pushBattleLog(`🌟 MYTHIC DROP: ${mythic.name} (Req Lv ${mythic.reqLevel}) !!!`);

  // hero XP / level logic (unchanged from your old code)
  addHeroXP(xpGain);

  // refresh hero + persist hp again (level up may change hpMax in your old logic)
  hero = getHeroState();
  setHeroHPToSave(hero.hp, hero.hpMax);

  scheduleNextEncounter();
}

// =========================
// Hero XP (same as your old behavior)
// =========================
function addHeroXP(xp){
  const s = loadSave();

  let heroXP = num(s.heroXP, 0) + xp;
  let heroXPNext = Math.max(1, num(s.heroXPNext, 100));
  let heroLevel = Math.max(1, num(s.heroLevel, 1));

  let baseAtk = num(s.heroAttack, 10);
  let baseDef = num(s.heroDefense, 10);

  while(heroXP >= heroXPNext){
    heroXP -= heroXPNext;
    heroLevel++;
heroXPNext = Math.floor(heroXPNext * 1.5);
heroXPNext = Math.floor(heroXPNext * 1.5);
if (typeof roundXPNext === "function") heroXPNext = roundXPNext(heroXPNext);

  


    baseAtk += 5;
    baseDef += 5;

    pushBattleLog(`✨ Level Up! Hero Level ${heroLevel} (+5 ATK, +5 DEF)`);
  }

  // NOTE: ui.js calculates hpMax from heroLevel differently (100 + 10/level),
  // but we do NOT overwrite heroHPMax here; ui.js owns that scaling.
  // We only persist hero stats/xp.
  savePatch({
    heroLevel,
    heroXP,
    heroXPNext,
    heroAttack: baseAtk,
    heroDefense: baseDef
  });

  // recompute totals
  recomputeTotalsAndSave();
}

// =========================
// Buttons / Nav
// =========================
backBtn?.addEventListener("click", () => window.location.href = "index.html");
toZonesBtn?.addEventListener("click", () => showZones());

attackBtn?.addEventListener("click", () => {
  if(!currentMobData || !currentZone){
    pushBattleLog("❌ Select a mob first.");
    return;
  }

  if(!autoFighting){
    autoFighting = true;
    pushBattleLog(`▶ Auto-Resolve started. Encounter every ${ENCOUNTER_CD_MS/1000}s.`);
    runEncounter(); // run immediately
    return;
  }

  pushBattleLog("ℹ️ Already running...");
});

runBtn?.addEventListener("click", () => {
  stopAutoFight(true);
  if(currentZone) showMobs(currentZone);
});

// =========================
// Start page
// =========================
showZones();
