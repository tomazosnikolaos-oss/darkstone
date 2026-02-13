// dungeon.js — Darkstone Chronicles (Dungeons: entry + run) //668
// Works on:
// - dungeon.html (list)  -> DS_DUNGEON.enterCrypt()
// - dungeon_run.html (battle) -> auto-start if active run exists

(() => {
  const SAVE_KEY = "darkstone_save_v1";
  const ACTIVE_KEY = "ds_active_dungeon_v1";

  // ===== Crypt config =====
  const CRYPT_ID = "crypt";
  const ENTRY_COST_STAMINA = 20;
  const TICK_MS = 6000;

  // Waves: normal stats (no weird 0-1). Boss: hard + can be 0–1 if cannot penetrate.
  const MAX_WAVE_ROUNDS = 15; // if wave takes 15 rounds and mob still alive => FAIL dungeon (as you asked)

  // ===== Boss Rewards =====
  const BOSS_GOLD_MIN = 500;
  const BOSS_GOLD_MAX = 800;
  const BOSS_XP_MIN = 400;
  const BOSS_XP_MAX = 600;

  // ===== Set Drops (VERY hard) =====
  // 6% chance per dungeon run to drop 1 random piece (edit freely)
  const SET_DROP_CHANCE = 0.06;

  const CRYPTWARDEN_SET = [
    {
      type: "gear",
setId:"cryptwarden",
      slot: "mainHand",
      baseName: "Cryptwarden Longsword",
      name: "Cryptwarden Longsword",
      atk: 30, def: 0,
      reqLevel: 10,
      rarity: "epic",
      img: "images/items/sets/crypt/cryptwarden_longsword_main.png"
    },
    {
      type: "gear",
setId:"cryptwarden",
      slot: "offHand",
      baseName: "Cryptwarden Longsword",
      name: "Cryptwarden Longsword",
      atk: 20, def: 0,
      reqLevel: 10,
      rarity: "epic",
      img: "images/items/sets/crypt/cryptwarden_longsword_offhand.png"
    },
    {
      type: "gear",
setId:"cryptwarden",
      slot: "helmet",
      baseName: "Cryptwarden Helm",
      name: "Cryptwarden Helm",
      atk: 0, def: 12,
      reqLevel: 10,
      rarity: "epic",
      img: "images/items/sets/crypt/cryptwarden_helm.png"
    },
    {
      type: "gear",
setId:"cryptwarden",
      slot: "chest",
      baseName: "Cryptwarden Cuirass",
      name: "Cryptwarden Cuirass",
      atk: 0, def: 18,
      reqLevel: 10,
      rarity: "epic",
      img: "images/items/sets/crypt/cryptwarden_cuirass.png"
    }
  ];

  const WAVES = [
    { id:"bone_wretch",        name:"Bone Wretch",        lvl:1, hp:120, atk:18, def:10, img:"images/mobs/dungeons/crypt/bone_wretch.png" },
    { id:"crypt_skeleton",     name:"Crypt Skeleton",     lvl:2, hp:135, atk:20, def:12, img:"images/mobs/dungeons/crypt/crypt_skeleton.png" },
    { id:"grave_acolyte",      name:"Grave Acolyte",      lvl:3, hp:150, atk:22, def:14, img:"images/mobs/dungeons/crypt/grave_acolyte.png" },
    { id:"rotting_knight",     name:"Rotting Knight",     lvl:4, hp:175, atk:25, def:16, img:"images/mobs/dungeons/crypt/rotting_knight.png" },
    { id:"tomb_guardian",      name:"Tomb Guardian",      lvl:5, hp:210, atk:28, def:18, img:"images/mobs/dungeons/crypt/tomb_guardian.png" },
    { id:"wraithbound_archer", name:"Wraithbound Archer", lvl:6, hp:190, atk:30, def:17, img:"images/mobs/dungeons/crypt/wraithbound_archer.png" },
  ];

  const BOSS = {
    id: "vorun_warden",
    name: "Vorun, the Warden",
    lvl: 10,
    hp: 500,
    atk: 80,
    def: 80,
    img: "images/mobs/dungeons/crypt/vorun_warden.png"
  };

  // ===== Helpers =====
  const el = (id) => document.getElementById(id);
  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const randInt = (min,max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function loadSave(){
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  function setSave(next){
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  }

  function savePatch(patch){
    const s = loadSave();
    Object.assign(s, patch);
    setSave(s);
  }

  function loadActive(){
    try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null"); }
    catch { return null; }
  }
  function setActive(obj){
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(obj));
  }
  function clearActive(){
    localStorage.removeItem(ACTIVE_KEY);
  }

  function fmtMMSS(totalSec){
    totalSec = Math.max(0, Math.floor(totalSec));
    const mm = String(Math.floor(totalSec/60)).padStart(2,"0");
    const ss = String(totalSec%60).padStart(2,"0");
    return `${mm}:${ss}`;
  }

  // ===== Totals from equipment (same pattern as fight.js) =====
  function recomputeTotalsAndSave(){
    const cur = loadSave();
    const baseAtk = num(cur.heroAttack, 10);
    const baseDef = num(cur.heroDefense, 10);

    let atkB = 0, defB = 0;
    const eq = (cur && typeof cur.equipment === "object") ? cur.equipment : {};
    Object.values(eq).forEach(it => {
      if(!it) return;
      atkB += num(it.atk, 0);
      defB += num(it.def, 0);
    });

    const attackTotal = baseAtk + atkB;
    const defenseTotal = baseDef + defB;

    savePatch({ attackTotal, defenseTotal });
    return { attackTotal, defenseTotal };
  }

  function getHeroRuntime(){
    const s = loadSave();
    const { attackTotal, defenseTotal } = recomputeTotalsAndSave();

    const heroLevel = Math.max(1, num(s.heroLevel, 1));

    // Use UI.js persistent hp fields
    const hpMax = Math.max(1, num(s.heroHPMax, 100));
    const hp = clamp(num(s.heroHP, hpMax), 0, hpMax);

    const stMax = Math.max(1, num(s.staminaMax, 100));
    const stamina = clamp(num(s.stamina, stMax), 0, stMax);

    return {
      level: heroLevel,
      atk: num(s.attackTotal, attackTotal),
      def: num(s.defenseTotal, defenseTotal),
      hpMax,
      hp,
      stamina,
      staminaMax: stMax
    };
  }

  function setHeroHP(hp, hpMax){
    savePatch({ heroHP: hp, heroHPMax: hpMax, lastActiveTs: Date.now() });
  }

  function spendStamina(cost){
    const s = loadSave();
    const stMax = Math.max(1, num(s.staminaMax, 100));
    const st = clamp(num(s.stamina, stMax), 0, stMax);
    if(st < cost) return false;
    s.stamina = st - cost;
    setSave(s);
    return true;
  }

  function addGold(amount){
    const s = loadSave();
    s.gold = num(s.gold, 0) + Math.max(0, num(amount, 0));
    setSave(s);
  }

  function addItemToInventory(item){
    if(!item) return;
    const s = loadSave();
    if(!Array.isArray(s.inventory)) s.inventory = [];

    // Gear never stacks in your UI.js system -> push as single
    const copy = { ...item, quantity: 1 };
    s.inventory.push(copy);
    setSave(s);
  }

  // ===== Hero XP (match your fight logic for level ups, but DO NOT hardcode hpMax formula) =====
  function addHeroXP(amount){
    const s = loadSave();

    let heroXP = num(s.heroXP, 0) + Math.max(0, num(amount, 0));
    let heroXPNext = Math.max(1, num(s.heroXPNext, 100));
    let heroLevel = Math.max(1, num(s.heroLevel, 1));

    let baseAtk = num(s.heroAttack, 10);
    let baseDef = num(s.heroDefense, 10);

    let ups = 0;
    while(heroXP >= heroXPNext){
      heroXP -= heroXPNext;
      heroLevel++;
      heroXPNext = Math.floor(heroXPNext * 1.5);
      baseAtk += 5;
      baseDef += 5;
      ups++;
    }

    s.heroXP = heroXP;
    s.heroXPNext = heroXPNext;
    s.heroLevel = heroLevel;
    s.heroAttack = baseAtk;
    s.heroDefense = baseDef;

    setSave(s);
    recomputeTotalsAndSave();

    return ups;
  }

  // ===== Damage formulas =====
  // Waves: classic min 1 (normal)
  function dmgWave(att, def){
    const v = Math.floor(num(att,0) - num(def,0) * 0.6);
    return Math.max(1, v);
  }

  // Boss: if att <= def => 0–1 dmg; else ~difference with small variance
  function dmgBoss(att, def){
    att = num(att,0); def = num(def,0);
    if(att <= def) return (Math.random() < 0.5) ? 0 : 1;
    const diff = att - def;
    const v = 0.90 + Math.random() * 0.20; // ±10%
    return Math.max(1, Math.floor(diff * v));
  }

  function rollSetDrop(){
    if(Math.random() >= SET_DROP_CHANCE) return null;
    const pick = CRYPTWARDEN_SET[randInt(0, CRYPTWARDEN_SET.length - 1)];
    return pick ? { ...pick, quantity: 1 } : null;
  }

  // ===== Dungeon Run DOM (exists only on dungeon_run.html) =====
  const runDOM = {
    stageTitle: () => el("stageTitle"),
    runTimer: () => el("runTimer"),

    heroImg: () => el("heroImg"),
    mobImg: () => el("mobImg"),
    heroInfo: () => el("heroInfo"),
    mobInfo: () => el("mobInfo"),

    heroHpBar: () => el("heroHpBar"),
    mobHpBar: () => el("mobHpBar"),
    heroHpText: () => el("heroHpText"),
    mobHpText: () => el("mobHpText"),

    battleLog: () => el("battleLog"),

    cooldownWrap: () => el("cooldownWrap"),
    cooldownBar: () => el("cooldownBar"),
    cooldownText: () => el("cooldownText"),
    cooldownLabel: () => el("cooldownLabel"),
  };

  function pushLog(text){
    const log = runDOM.battleLog();
    if(!log) return;
    const div = document.createElement("div");
    div.className = "log-item";
    div.textContent = text;
    log.prepend(div);

    const items = log.querySelectorAll(".log-item");
    for(let i=14;i<items.length;i++) items[i].remove();
  }

  function renderVS(hero, enemy, stageLabel){
    const st = runDOM.stageTitle();
    if(st) st.textContent = stageLabel || "Waves";

    const heroImg = runDOM.heroImg();
    const mobImg  = runDOM.mobImg();
    if(heroImg) heroImg.src = "images/hero.png";
    if(mobImg)  mobImg.src = enemy.img || "";

    const hi = runDOM.heroInfo();
    const mi = runDOM.mobInfo();
    if(hi) hi.textContent = `Hero • Lv ${hero.level}`;
    if(mi) mi.textContent = `${enemy.name} • Lv ${enemy.lvl}`;

    const heroHpBar = runDOM.heroHpBar();
    const heroHpText = runDOM.heroHpText();
    const mobHpBar = runDOM.mobHpBar();
    const mobHpText = runDOM.mobHpText();

    const heroPct = hero.hpMax ? (hero.hp / hero.hpMax) * 100 : 0;
    if(heroHpBar){
      heroHpBar.style.width = `${Math.max(0, heroPct)}%`;
      heroHpBar.style.background = "linear-gradient(90deg, #00ff88, #00bb55)";
    }
    if(heroHpText) heroHpText.textContent = `${Math.max(0, hero.hp)} / ${hero.hpMax} HP`;

    const ePct = enemy.hpMax ? (enemy.hp / enemy.hpMax) * 100 : 0;
    if(mobHpBar){
      mobHpBar.style.width = `${Math.max(0, ePct)}%`;
      mobHpBar.style.background = "linear-gradient(90deg, #ff5555, #bb0000)";
    }
    if(mobHpText) mobHpText.textContent = `${Math.max(0, enemy.hp)} / ${enemy.hpMax} HP`;
  }

  // ===== Cooldown UI =====
  let cdAnimId = null;
  let cdStart = 0;

  function stopCooldownUI(){
    if(cdAnimId) cancelAnimationFrame(cdAnimId);
    cdAnimId = null;
    const w = runDOM.cooldownWrap();
    const b = runDOM.cooldownBar();
    const t = runDOM.cooldownText();
    if(w) w.style.display = "none";
    if(b) b.style.width = "0%";
    if(t) t.textContent = (TICK_MS/1000).toFixed(1) + "s";
  }

  function startCooldownUI(label){
    const w = runDOM.cooldownWrap();
    const b = runDOM.cooldownBar();
    const t = runDOM.cooldownText();
    const l = runDOM.cooldownLabel();
    if(!w || !b || !t) return;

    if(l) l.textContent = label || "Next";
    w.style.display = "";
    cdStart = performance.now();

    const tick = (now) => {
      const elapsed = now - cdStart;
      const p = Math.min(1, elapsed / TICK_MS);

      b.style.width = (p * 100).toFixed(1) + "%";
      b.style.background = "linear-gradient(90deg, #ffaa00, #bb6600)";

      const remain = Math.max(0, (TICK_MS - elapsed) / 1000);
      t.textContent = remain.toFixed(1) + "s";

      if(p < 1 && state.running){
        cdAnimId = requestAnimationFrame(tick);
      } else {
        cdAnimId = null;
      }
    };

    if(cdAnimId) cancelAnimationFrame(cdAnimId);
    cdAnimId = requestAnimationFrame(tick);
  }

  // ===== Run timer =====
  let timerInt = null;
  let runStartMs = 0;

  function startRunTimer(){
    runStartMs = Date.now();
    const rt = runDOM.runTimer();
    if(rt) rt.textContent = "00:00";

    if(timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
      const sec = (Date.now() - runStartMs) / 1000;
      const elT = runDOM.runTimer();
      if(elT) elT.textContent = fmtMMSS(sec);
    }, 500);
  }

  function stopRunTimer(){
    if(timerInt) clearInterval(timerInt);
    timerInt = null;
  }

  // ===== Run state =====
  const state = {
    running: false,
    phase: "idle",   // idle | prepare | waves | boss | end
    waveIndex: 0,
    enemy: null,
    loopTimer: null,
    startedOnce: false
  };

  function clearLoop(){
    if(state.loopTimer){
      clearTimeout(state.loopTimer);
      state.loopTimer = null;
    }
  }

  function failDungeon(reason){
    state.running = false;
    state.phase = "end";
    clearLoop();
    stopCooldownUI();
    stopRunTimer();

    pushLog(`❌ Dungeon failed${reason ? `: ${reason}` : ""}`);
    clearActive();
    const st = runDOM.stageTitle();
    if(st) st.textContent = "Failed";
  }

  function winDungeon(){
    state.running = false;
    state.phase = "end";
    clearLoop();
    stopCooldownUI();
    stopRunTimer();

    // ===== Rewards =====
    const goldGain = randInt(BOSS_GOLD_MIN, BOSS_GOLD_MAX);
    const xpGain = randInt(BOSS_XP_MIN, BOSS_XP_MAX);

    addGold(goldGain);
    const ups = addHeroXP(xpGain);

    const drop = rollSetDrop();
    if(drop) addItemToInventory(drop);

    const elapsed = fmtMMSS((Date.now() - runStartMs) / 1000);

    pushLog(`🏆 Boss defeated! Time: ${elapsed}`);
    pushLog(`💰 Gold +${goldGain} • 🏅 XP +${xpGain}${ups > 0 ? ` • ✨ Level Ups: +${ups}` : ""}`);
    if(drop) pushLog(`🎁 SET DROP: ${drop.name} (${drop.slot.toUpperCase()})`);

    clearActive();
    const st = runDOM.stageTitle();
    if(st) st.textContent = "Completed";
  }

  // ===== Core loop =====
  function startPrepare(){
    state.phase = "prepare";
    pushLog("⚠️ Prepare for battle...");
    startCooldownUI("Prepare");

    const hero = getHeroRuntime();
    const first = WAVES[0];
    state.enemy = { ...first, hpMax: first.hp, hp: first.hp };
    renderVS(hero, state.enemy, "Prepare");

    clearLoop();
    state.loopTimer = setTimeout(() => {
      if(!state.running) return;
      startWaves();
    }, TICK_MS);
  }

  function startWaves(){
    state.phase = "waves";
    state.waveIndex = 0;
    nextWave();
  }

  function nextWave(){
    if(!state.running) return;

    if(state.waveIndex >= WAVES.length){
      startBossImmediateFirstRound();
      return;
    }

    const mob = WAVES[state.waveIndex];
    state.enemy = { ...mob, hpMax: mob.hp, hp: mob.hp };

    const hero = getHeroRuntime();
    renderVS(hero, state.enemy, `Wave ${state.waveIndex + 1}/6`);
    pushLog(`🧟 Wave ${state.waveIndex + 1}: ${mob.name}`);

    startCooldownUI("Next wave tick");
    clearLoop();
    state.loopTimer = setTimeout(() => {
      if(!state.running) return;
      runWaveEncounter();
    }, TICK_MS);
  }

  function runWaveEncounter(){
    if(!state.running || state.phase !== "waves") return;

    let hero = getHeroRuntime();
    const enemy = state.enemy;

    let rounds = 0;
    while(hero.hp > 0 && enemy.hp > 0 && rounds < MAX_WAVE_ROUNDS){
      rounds++;

      const hd = dmgWave(hero.atk, enemy.def);
      enemy.hp -= hd;
      if(enemy.hp <= 0) break;

      const md = dmgWave(enemy.atk, hero.def);
      hero.hp -= md;
    }

    hero.hp = Math.max(0, hero.hp);
    enemy.hp = Math.max(0, enemy.hp);

    setHeroHP(hero.hp, hero.hpMax);
    renderVS(hero, enemy, `Wave ${state.waveIndex + 1}/6`);

    if(hero.hp <= 0){
      failDungeon(`died on Wave ${state.waveIndex + 1}`);
      return;
    }

    if(enemy.hp > 0 && rounds >= MAX_WAVE_ROUNDS){
      failDungeon(`Wave ${state.waveIndex + 1} stalled (too tanky)`);
      return;
    }

    pushLog(`✅ Cleared Wave ${state.waveIndex + 1} in ${rounds} rounds.`);
    state.waveIndex++;
    nextWave();
  }

  // ===== Boss =====
  let bossRound = 0;

  function startBossImmediateFirstRound(){
    state.phase = "boss";
    bossRound = 0;

    state.enemy = { ...BOSS, hpMax: BOSS.hp, hp: BOSS.hp };
    const hero = getHeroRuntime();
    renderVS(hero, state.enemy, "Boss");
    pushLog(`👑 Boss: ${BOSS.name}`);

    // no extra 6s gap after wave 6, first hit immediately
    stopCooldownUI();
    clearLoop();
    runBossRound();
  }

  function runBossRound(){
    if(!state.running || state.phase !== "boss") return;

    bossRound++;
    let hero = getHeroRuntime();
    const boss = state.enemy;

    const heroD = dmgBoss(hero.atk, boss.def);
    boss.hp = Math.max(0, boss.hp - heroD);

    if(boss.hp <= 0){
      renderVS(hero, boss, "Boss");
      pushLog(`✅ Round ${bossRound}: You hit ${heroD}. Boss defeated.`);
      winDungeon();
      return;
    }

    const bossD = dmgBoss(boss.atk, hero.def);
    hero.hp = Math.max(0, hero.hp - bossD);

    setHeroHP(hero.hp, hero.hpMax);
    renderVS(hero, boss, "Boss");
    pushLog(`🩸 Round ${bossRound}: You dealt ${heroD} • Boss dealt ${bossD}`);

    if(hero.hp <= 0){
      failDungeon("killed by boss");
      return;
    }

    startCooldownUI("Next boss round");
    clearLoop();
    state.loopTimer = setTimeout(() => {
      if(!state.running) return;
      runBossRound();
    }, TICK_MS);
  }

  // ===== Public: enterCrypt (used by dungeon.html) =====
  function enterCrypt(){
    const hero = getHeroRuntime();
    if(hero.stamina < ENTRY_COST_STAMINA){
      return { ok:false, msg:`😴 Not enough stamina. Need ${ENTRY_COST_STAMINA} Stamina.` };
    }

    if(!spendStamina(ENTRY_COST_STAMINA)){
      return { ok:false, msg:`😴 Not enough stamina. Need ${ENTRY_COST_STAMINA} Stamina.` };
    }

    setActive({
      id: CRYPT_ID,
      startedAt: Date.now()
    });

    return { ok:true };
  }

  // ===== Public: startActiveRun (used by dungeon_run.html auto-start) =====
  function startActiveRun(){
    const active = loadActive();
    if(!active || active.id !== CRYPT_ID) return { ok:false, msg:"No active dungeon run." };

    // must be on run page (DOM exists)
    if(!runDOM.battleLog() || !runDOM.heroHpBar() || !runDOM.mobHpBar()){
      return { ok:false, msg:"Not on dungeon_run page (missing DOM)." };
    }

    // prevent double start
    if(state.running || state.startedOnce) return { ok:false, msg:"Already running." };

    state.startedOnce = true;
    state.running = true;

    // reset log
    const log = runDOM.battleLog();
    if(log) log.innerHTML = "";

    startRunTimer();
    pushLog(`🚪 Entered Whispering Crypt. (-${ENTRY_COST_STAMINA} stamina)`);

    startPrepare();
    return { ok:true };
  }

  // ===== Pause integration (inspector etc.) =====
  window.addEventListener("ds:pause", () => {
    if(!state.running) return;
    state.running = false;
    clearLoop();
    stopCooldownUI();
    stopRunTimer();
  });

  window.addEventListener("ds:resume", () => {});

  // ===== Export global =====
  window.DS_DUNGEON = {
    enterCrypt,
    startActiveRun
  };

  console.log("[DS_DUNGEON] loaded OK (enterCrypt + startActiveRun)");

  // ===== Auto-start if we are on dungeon_run.html =====
  window.addEventListener("DOMContentLoaded", () => {
    // Only attempt auto start if run DOM exists
    if(runDOM.battleLog() && runDOM.heroHpBar() && runDOM.mobHpBar()){
      const active = loadActive();
      if(active && active.id === CRYPT_ID){
        startActiveRun();
      }
    }
  });
})();
