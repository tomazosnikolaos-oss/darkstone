// ui.js — Darkstone Chronicles (GLOBAL HUD + Inventory + GLOBAL Item Inspector)
// ✅ Hero Panel: HEALTH / STAMINA / XP bars with text inside (compact width)
// ✅ Nav buttons restored: Home / Fight / Mining / Market (+ Forge/Fishing/Cooking/Hunting)
// ✅ Online + Offline regen with independent timestamps:
//    - HP +20 / 10min (hpRegenTs)
//    - Stamina +10 / 4min (staminaRegenTs)
// ✅ Persistent HP: heroHP + heroHPMax
// ✅ Inventory: tooltip, click inspector, drag&drop swap order
// ✅ Inspector replaces left panel and PAUSES background loops (DS.pause/resume)
// ✅ Live updates via localStorage hook (ds:save)

(() => {
  const SAVE_KEY = "darkstone_save_v1";
  const REFRESH_MS = 800;

  // ===== Regen settings =====
  const HP_REGEN_AMOUNT = 20;
  const HP_REGEN_EVERY_MS = 10 * 60 * 1000; // 10 min
  const ST_REGEN_AMOUNT = 10;
  const ST_REGEN_EVERY_MS = 4 * 60 * 1000;  // 4 min

  // -------------------------
  // Global Pause API
  // -------------------------
  window.DS = window.DS || {};
  if (typeof window.DS.isPaused !== "boolean") window.DS.isPaused = false;

  window.DS.pause = () => {
    window.DS.isPaused = true;
    window.dispatchEvent(new Event("ds:pause"));
  };

  window.DS.resume = () => {
    window.DS.isPaused = false;
    window.dispatchEvent(new Event("ds:resume"));
  };

  // -------------------------
  // Helpers
  // -------------------------
  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const stripPlus = (name) => String(name || "").replace(/\s*\+\d+$/, "");

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  function setSave(next) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  }

  function calcHpMax(level){
    return 100 + (Math.max(1, num(level, 1)) - 1) * 10;
  }

  function calcStaminaMax(level){
    // ✅ base 100, +5 per hero level (level 1 => 100)
    return 100 + (Math.max(1, num(level, 1)) - 1) * 5;
  }

  function unstackGear(arr){
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++){
      const it = arr[i];
      if (!it || it.type !== "gear") continue;
      const q = num(it.quantity ?? it.qty, 1);
      if (q <= 1) { it.quantity = 1; continue; }

      // κρατάμε 1 στο slot, και σπάμε τα υπόλοιπα σε νέα slots
      it.quantity = 1;
      for (let k = 0; k < q - 1; k++){
        arr.push({ ...it, quantity: 1 });
      }
    }
  }

  function ensureSave(s) {
    s = s && typeof s === "object" ? s : {};

    if (!Array.isArray(s.inventory)) s.inventory = [];
    if (!Array.isArray(s.bank)) s.bank = [];

    // ✅ gear must NOT stack (also fixes existing stacked gear)
    unstackGear(s.inventory);
    unstackGear(s.bank);

    if (!s.equipment || typeof s.equipment !== "object") s.equipment = {};

    const slots = [
      "mainHand","offHand",
      "helmet","shoulders",
      "chest","bracers","gloves",
      "belt","pants","boots",
      "ring","amulet"
    ];
    for (const k of slots) if (!(k in s.equipment)) s.equipment[k] = null;

    s.heroLevel = num(s.heroLevel, 1);
    s.heroXP = num(s.heroXP, 0);
    s.heroXPNext = Math.max(1, num(s.heroXPNext, 100));

    // ===== Fishing =====
    s.fishingLevel = num(s.fishingLevel, 1);
    s.fishingXP = num(s.fishingXP, 0);
    s.fishingXPNext = Math.max(1, num(s.fishingXPNext, 100));

    // ===== Cooking =====
    s.cookingLevel = num(s.cookingLevel, 1);
    s.cookingXP = num(s.cookingXP, 0);
    s.cookingXPNext = Math.max(1, num(s.cookingXPNext, 100));

    // ===== Hunting (safe defaults, even if not used yet) =====
    s.huntingLevel = num(s.huntingLevel, 1);
    s.huntingXP = num(s.huntingXP, 0);
    s.huntingXPNext = Math.max(1, num(s.huntingXPNext, 100));

    // ✅ Stamina max scales with HERO level
    const stMax = calcStaminaMax(s.heroLevel);
    const prevStMax = Math.max(1, num(s.staminaMax, stMax));
    const prevSt = clamp(num(s.stamina, prevStMax), 0, prevStMax);

    if (prevStMax !== stMax) {
      // κρατάμε την ίδια αναλογία (αν ήταν full, μένει full)
      const ratio = prevStMax > 0 ? (prevSt / prevStMax) : 1;
      s.staminaMax = stMax;
      s.stamina = Math.round(clamp(ratio * s.staminaMax, 0, s.staminaMax));
    } else {
      s.staminaMax = stMax;
      // ✅ default start full stamina on fresh saves
      const hasStaminaField = Number.isFinite(Number(s.stamina));
      s.stamina = hasStaminaField ? clamp(prevSt, 0, s.staminaMax) : s.staminaMax;
    }

    s.heroAttack = num(s.heroAttack, 10);
    s.heroDefense = num(s.heroDefense, 10);
    s.attackTotal = num(s.attackTotal, s.heroAttack);
    s.defenseTotal = num(s.defenseTotal, s.heroDefense);

    s.gold = num(s.gold, 0);
    s.inventoryMaxSlots = num(s.inventoryMaxSlots, 1000);

    // HP persistent (keep ratio if hpMax changes)
    const hpMax = calcHpMax(s.heroLevel);
    const prevMax = Math.max(1, num(s.heroHPMax, hpMax));
    const prevHp = clamp(num(s.heroHP, prevMax), 0, prevMax);

    if (prevMax !== hpMax) {
      const ratio = prevMax > 0 ? (prevHp / prevMax) : 1;
      s.heroHPMax = hpMax;
      s.heroHP = Math.round(clamp(ratio * s.heroHPMax, 0, s.heroHPMax));
    } else {
      s.heroHPMax = hpMax;
      s.heroHP = clamp(prevHp, 0, s.heroHPMax);
    }

    // ✅ independent regen timestamps
    if (!Number.isFinite(Number(s.staminaRegenTs))) s.staminaRegenTs = Date.now();
    if (!Number.isFinite(Number(s.hpRegenTs))) s.hpRegenTs = Date.now();

    return s;
  }

  // -------------------------
  // localStorage hook -> ds:save (same tab)
  // -------------------------
  function hookLocalStorageOnce() {
    if (window.__dsHookedStorage) return;
    window.__dsHookedStorage = true;

    const _setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => {
      _setItem(k, v);
      if (k === SAVE_KEY) window.dispatchEvent(new Event("ds:save"));
    };
  }

  // -------------------------
  // Regen (online+offline catch-up)
  // -------------------------
  function applyRegenTick(){
    if (window.DS?.isPaused) return;

    const now = Date.now();
    const s = ensureSave(loadSave());
    let didWrite = false;

    // stamina ticks
    const stTs = num(s.staminaRegenTs, now);
    const stTicks = Math.floor(Math.max(0, now - stTs) / ST_REGEN_EVERY_MS);
    if (stTicks > 0) {
      s.stamina = clamp(num(s.stamina, 0) + stTicks * ST_REGEN_AMOUNT, 0, s.staminaMax);
      s.staminaRegenTs = stTs + stTicks * ST_REGEN_EVERY_MS;
      didWrite = true;
    }

    // hp ticks
    const hpTs = num(s.hpRegenTs, now);
    const hpTicks = Math.floor(Math.max(0, now - hpTs) / HP_REGEN_EVERY_MS);
    if (hpTicks > 0) {
      s.heroHP = clamp(num(s.heroHP, 0) + hpTicks * HP_REGEN_AMOUNT, 0, s.heroHPMax);
      s.hpRegenTs = hpTs + hpTicks * HP_REGEN_EVERY_MS;
      didWrite = true;
    }

    if (didWrite) setSave(s);
  }

  // -------------------------
  // Styles
  // -------------------------
  function injectStylesOnce() {
    if (document.getElementById("ds-core-styles")) return;
    const s = document.createElement("style");
    s.id = "ds-core-styles";
    s.textContent = `
      #hudRoot{max-width:1100px;margin:12px auto 10px;padding:0 10px;}

      #mainLayout{
        max-width:1100px;margin:0 auto;
        display:grid;
        grid-template-columns:minmax(0,1fr) 420px;
        gap:16px;align-items:start;
        padding:0 10px 24px;
      }
      #leftPanel{min-height:200px;min-width:0;}
      #inventoryPanel{min-width:0;}

      .dsHeaderRow{
        display:flex;
        gap:12px;
        align-items:flex-start;
        justify-content:flex-start;
        flex-wrap:wrap;
      }

      .dsHeroPanel{
        flex:0 0 auto;
        width:340px;
        max-width:340px;
        display:flex;gap:10px;align-items:flex-start;
        background:#151520;border:2px solid #333;border-radius:12px;
        padding:10px;box-sizing:border-box;
      }

      .dsHeroPortrait{cursor:pointer;flex:0 0 auto;}
      .dsHeroPortrait img{width:54px;height:54px;border-radius:12px;border:2px solid #333;object-fit:cover;display:block;}
      .dsHeroStats{flex:1;min-width:0;}
      .dsLine{margin:0 0 6px 0;opacity:.92;font-size:13px}

      .dsBarStack{display:flex;flex-direction:column;gap:6px;margin-top:6px;}
      .dsBarWrap{
        position:relative;
        background:#0f0f16;border:1px solid #2a2a3a;border-radius:999px;
        overflow:hidden;height:14px;
      }
      .dsBarFill{height:100%;width:0%;}
      .dsBarTextIn{
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        font-size:11px; font-weight:800;
        text-shadow:0 1px 6px rgba(0,0,0,.65);
        pointer-events:none;
        opacity:.95;
      }

      .dsNav{
        flex:0 0 auto;
        display:flex;
        gap:8px;
        align-items:stretch;
        background:#151520;border:2px solid #333;border-radius:12px;
        padding:8px;box-sizing:border-box;
        flex-wrap:wrap;
      }
      .dsNav button{
        padding:9px 10px;border-radius:10px;border:2px solid #333;
        background:#1b1b24;color:#fff;cursor:pointer;
        font-size:13px;
      }
      .dsNav button:hover{filter:brightness(1.08);}

      #inventoryPanel{background:#151520;border:2px solid #333;border-radius:12px;padding:12px;box-sizing:border-box;}
      .invHeader{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px;}
      .invTitle{font-weight:800;display:flex;align-items:baseline;gap:10px;}
      .invGold{opacity:.92;white-space:nowrap;}
      #inventoryGrid{
        display:grid;grid-template-columns:repeat(10,40px);
        gap:4px;justify-content:flex-start;padding:4px;
        max-height:520px;overflow-y:auto;box-sizing:border-box;
      }
      .dsSlot{
        width:40px;height:40px;border:1px solid #2a2a3a;border-radius:6px;
        background:#0f0f16;position:relative;overflow:hidden;cursor:pointer;
        box-sizing:border-box;
      }
      .dsSlot.dragOver{outline:2px solid #888;}
      .dsSlot img{width:100%;height:100%;object-fit:cover;display:block;}

      .dsQty{position:absolute;right:3px;bottom:2px;font-size:11px;background:rgba(0,0,0,.65);padding:1px 4px;border-radius:6px;}

      .dsUpg{
        position:absolute;
        left:3px;
        top:3px;
        font-size:8px;
        font-weight:900;
        background:rgba(0,0,0,.55);
        border:1px solid rgba(255,255,255,.10);
        padding:1px 3px;
        border-radius:7px;
        line-height:1;
        opacity:.92;
      }

      #dsInspector{
        background:#151520;border:2px solid #333;border-radius:12px;padding:12px;
        max-width:900px;margin:12px auto 0;box-sizing:border-box;
      }
      .dsBtnRow{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
      .dsBtnRow button{padding:10px 12px;border-radius:10px;border:2px solid #333;background:#1b1b24;color:#fff;cursor:pointer;}
      .dsBtnRow button:disabled{opacity:.5;cursor:not-allowed;}

      /* ✅ Keep 2 columns always (no collapse) */
      @media (max-width: 1px){
        #mainLayout{grid-template-columns:1fr;}
        .dsHeroPanel{width:100%;max-width:none;}
        .dsNav{width:100%;justify-content:space-between;}
      }
    `;
    document.head.appendChild(s);
  }

  // -------------------------
  // Ensure core DOM exists
  // -------------------------
  function ensureCoreDOM() {
    injectStylesOnce();

    let hudRoot = document.getElementById("hudRoot");
    if (!hudRoot) {
      hudRoot = document.createElement("div");
      hudRoot.id = "hudRoot";
      document.body.prepend(hudRoot);
    }

    let main = document.getElementById("mainLayout");
    if (!main) {
      main = document.createElement("div");
      main.id = "mainLayout";
      document.body.appendChild(main);
    }

    let left = document.getElementById("leftPanel");
    if (!left) {
      left = document.createElement("div");
      left.id = "leftPanel";
      main.appendChild(left);
    }

    let invPanel = document.getElementById("inventoryPanel");
    if (!invPanel) {
      invPanel = document.createElement("div");
      invPanel.id = "inventoryPanel";
      main.appendChild(invPanel);
    }

    if (!invPanel.querySelector("#inventoryGrid")) {
      invPanel.innerHTML = `
        <div class="invHeader">
          <div class="invTitle">
            <span id="invTitleText">Inventory</span>
            <span id="invCap" style="opacity:.85;font-size:12px;"></span>
          </div>
          <div class="invGold">💰 <span id="goldValue">0</span></div>
        </div>
        <div id="inventoryGrid"></div>
      `;
    } else {
      if (!invPanel.querySelector("#invCap")) {
        const cap = document.createElement("span");
        cap.id = "invCap";
        cap.style.opacity = ".85";
        cap.style.fontSize = "12px";
        invPanel.querySelector(".invTitle")?.appendChild(cap);
      }
    }
  }

  // -------------------------
  // Header render
  // -------------------------
  function renderHeader(save) {
    const hudRoot = document.getElementById("hudRoot");
    if (!hudRoot) return;

    const lvl = num(save.heroLevel, 1);

    const hpNow = clamp(num(save.heroHP, save.heroHPMax), 0, save.heroHPMax);
    const hpMax = Math.max(1, num(save.heroHPMax, calcHpMax(lvl)));
    const hpPct = clamp((hpNow / hpMax) * 100, 0, 100);

    const stNow = clamp(num(save.stamina, 0), 0, save.staminaMax);
    const stMax = Math.max(1, num(save.staminaMax, 100));
    const stPct = clamp((stNow / stMax) * 100, 0, 100);

    const xpNow = Math.max(0, num(save.heroXP, 0));
    const xpNext = Math.max(1, num(save.heroXPNext, 100));
    const xpPct = clamp((xpNow / xpNext) * 100, 0, 100);

    hudRoot.innerHTML = `
      <div class="dsHeaderRow">
        <div class="dsHeroPanel">
          <div class="dsHeroPortrait" id="heroPortrait" title="Open Equipment">
            <img src="images/hero.png" alt="Hero">
          </div>

          <div class="dsHeroStats">
            <p class="dsLine"><b>Hero Level:</b> <span>${lvl}</span></p>

            <div class="dsBarStack">
              <div class="dsBarWrap" title="Health">
                <div class="dsBarFill" style="width:${hpPct}%;background:#2dff7c;"></div>
                <div class="dsBarTextIn">HEALTH ${hpNow}/${hpMax}</div>
              </div>

              <div class="dsBarWrap" title="Stamina">
                <div class="dsBarFill" style="width:${stPct}%;background:#ff5252;"></div>
                <div class="dsBarTextIn">STAMINA ${stNow}/${stMax}</div>
              </div>

              <div class="dsBarWrap" title="Hero XP (Fights)">
                <div class="dsBarFill" style="width:${xpPct}%;background:#7dff9f;"></div>
                <div class="dsBarTextIn">XP ${xpNow}/${xpNext}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dsNav">
          <button id="navHome">🏠 Home</button>
          <button id="navFight">⚔️ Fight</button>
<button id="navDungeons">🏰 Dungeons</button>

          <button id="navMine">⛏️ Mine</button>
          <button id="navForge">⚒️ Forge</button>
          <button id="navFish">🎣 Fishing</button>
          <button id="navHunt">🏹 Hunting</button>
          <button id="navCook">🍳 Cooking</button>
          <button id="navMarket">🛒 Market</button>
        </div>
      </div>
    `;

    document.getElementById("heroPortrait")?.addEventListener("click", () => {
      window.location.href = "equipment.html";
    });

    document.getElementById("navHome")?.addEventListener("click", () => {
      window.location.href = "index.html";
    });
    document.getElementById("navFight")?.addEventListener("click", () => {
      window.location.href = "fight.html";
    });
document.getElementById("navDungeons")?.addEventListener("click", () => {
  window.location.href = "dungeons.html";
});

    document.getElementById("navMine")?.addEventListener("click", () => {
      window.location.href = "mining.html";
    });
    document.getElementById("navForge")?.addEventListener("click", () => {
      window.location.href = "forge.html";
    });
    document.getElementById("navFish")?.addEventListener("click", () => {
      window.location.href = "fishing.html";
    });
    document.getElementById("navHunt")?.addEventListener("click", () => {
      window.location.href = "hunting.html";
    });
    document.getElementById("navCook")?.addEventListener("click", () => {
      window.location.href = "cooking.html";
    });
    document.getElementById("navMarket")?.addEventListener("click", () => {
      window.location.href = "market.html";
    });
  }

  function renderGold(save) {
    const el = document.getElementById("goldValue");
    if (el) el.textContent = String(num(save.gold, 0));
  }

  // -------------------------
  // Inventory render + DnD swap
  // -------------------------
  let __invSig = "";
  let dragFromIndex = null;

  function invSignature(save) {
    const inv = Array.isArray(save.inventory) ? save.inventory : [];
    return `${num(save.gold,0)}|${num(save.heroXP,0)}|${num(save.stamina,0)}|${num(save.heroHP,0)}|${inv.length}|` + inv.map(it => {
      if (!it) return "_";
      return [
        it.type||"", it.name||"", it.slot||"", it.reqLevel??1,
        it.atk??0, it.def??0, it.rarity||"", it.img||"",
        it.quantity ?? it.qty ?? 1,
        it.upg ?? 0,
        it.baseName || "",
        it.healHp ?? 0,
        it.healStamina ?? 0
      ].join("::");
    }).join("~");
  }

  function setInvCap(save) {
    const capEl = document.getElementById("invCap");
    if (!capEl) return;

    const inv = Array.isArray(save.inventory) ? save.inventory : [];
    const maxUnits = num(save.inventoryMaxSlots, 1000);

    // ✅ Used units = sum of quantities across all stacks
    let usedUnits = 0;
    for (const it of inv) {
      if (!it) continue;
      const q = num(it.quantity ?? it.qty, 1);
      usedUnits += Math.max(1, q);
    }

    capEl.textContent = `${usedUnits}/${maxUnits}`;
  }

  function renderInventory(save) {
    const grid = document.getElementById("inventoryGrid");
    if (!grid) return;

    const sig = invSignature(save);
    if (sig === __invSig) return;
    __invSig = sig;

    setInvCap(save);

    const inv = Array.isArray(save.inventory) ? save.inventory : [];
    const prevScroll = grid.scrollTop;
    grid.innerHTML = "";

    inv.forEach((it, i) => {
      if (!it) return;

      const slot = document.createElement("div");
      slot.className = "dsSlot";
      slot.dataset.index = String(i);
      slot.draggable = true;

      slot.addEventListener("dragstart", (e) => {
        dragFromIndex = i;
        e.dataTransfer?.setData("text/plain", String(i));
      });

      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("dragOver");
      });

      slot.addEventListener("dragleave", () => {
        slot.classList.remove("dragOver");
      });

      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("dragOver");
        const from = dragFromIndex;
        const to = i;
        dragFromIndex = null;
        if (from == null || to == null || from === to) return;

        const s = ensureSave(loadSave());
        const arr = s.inventory;
        const tmp = arr[from];
        arr[from] = arr[to];
        arr[to] = tmp;
        setSave(s);
      });

      if (it.img) {
        const img = document.createElement("img");
        img.src = it.img;
        img.alt = it.name || "item";
        slot.appendChild(img);

        const upg = num(it.upg, 0);
        if (upg > 0) {
          const b = document.createElement("div");
          b.className = "dsUpg";
          b.textContent = `+${upg}`;
          slot.appendChild(b);
        }
      }

      const q = num(it.quantity ?? it.qty, 1);
      if (q > 1) {
        const qty = document.createElement("div");
        qty.className = "dsQty";
        qty.textContent = String(q);
        slot.appendChild(qty);
      }

      const atk = num(it.atk, 0);
      const def = num(it.def, 0);
      const req = num(it.reqLevel, 1);
      const rarity = it.rarity ? ` • ${it.rarity}` : "";
      const statsLine = (atk || def) ? ` • ATK +${atk} DEF +${def}` : "";
      const reqLine = it.type === "gear" ? ` • Req Lv ${req}` : "";

      const hp = num(it.healHp, 0);
      const st = num(it.healStamina, 0);
      const eatLine = (it.type === "food" && (hp > 0 || st > 0))
        ? ` • Heals${hp > 0 ? ` +${hp} HP` : ""}${st > 0 ? ` +${st} ST` : ""}`
        : "";

      // ✅ Avoid double "+N" in tooltip if name already has it
      const upg = num(it.upg, 0);
      const nameHasPlus = /\+\d+$/.test(String(it.name || ""));
      const upgLine = (upg > 0 && !nameHasPlus) ? ` • +${upg}` : "";

      slot.title = `${it.name || "Item"}${upgLine}${rarity}${reqLine}${statsLine}${eatLine}${q > 1 ? ` • x${q}` : ""}`;

      slot.addEventListener("click", () => openInspector(i, it));
      grid.appendChild(slot);
    });

    grid.scrollTop = prevScroll;
  }

  // -------------------------
  // Inspector (replace left panel)
  // -------------------------
  let __leftStashEl = null;
  let __leftScroll = 0;

  function stashLeftPanelNodes() {
    const left = document.getElementById("leftPanel");
    if (!left) return;

    if (!__leftStashEl) {
      __leftStashEl = document.createElement("div");
      __leftStashEl.id = "dsLeftStash";
      __leftStashEl.style.display = "none";
      document.body.appendChild(__leftStashEl);
    }
    if (__leftStashEl.childNodes.length > 0) return;

    __leftScroll = left.scrollTop;
    while (left.firstChild) __leftStashEl.appendChild(left.firstChild);
  }

  function restoreLeftPanelNodes() {
    const left = document.getElementById("leftPanel");
    if (!left || !__leftStashEl) return;

    while (left.firstChild) left.removeChild(left.firstChild);
    while (__leftStashEl.firstChild) left.appendChild(__leftStashEl.firstChild);

    left.scrollTop = __leftScroll;
  }

  function ensureInspectorBoxReplace() {
    const left = document.getElementById("leftPanel");
    if (!left) return null;
    stashLeftPanelNodes();
    left.innerHTML = `<div id="dsInspector"></div>`;
    return document.getElementById("dsInspector");
  }

  function itemStackKey(it) {
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

  function addToStack(arr, item, qty = 1) {
    // ✅ Gear NEVER stacks. Always add as separate items.
    if (item?.type === "gear") {
      const n = Math.max(1, num(qty, 1));
      for (let i = 0; i < n; i++) arr.push({ ...item, quantity: 1 });
      return;
    }

    const key = itemStackKey(item);
    const ex = arr.find(i => i && itemStackKey(i) === key);
    if (ex) ex.quantity = num(ex.quantity, 1) + qty;
    else arr.push({ ...item, quantity: qty });
  }

  function consumeFromInventoryIndex(save, idx, qty = 1) {
    const it = save.inventory[idx];
    if (!it) return null;
    const q = num(it.quantity, 1);
    if (q > qty) { it.quantity = q - qty; return { ...it, quantity: 1 }; }
    save.inventory.splice(idx, 1);
    return { ...it, quantity: 1 };
  }

  function removeStackAtIndex(save, idx) {
    const it = save.inventory[idx];
    if (!it) return null;
    save.inventory.splice(idx, 1);
    return it;
  }

  function cryptwardenBonusPct(equipment){
  let count = 0;
  Object.values(equipment || {}).forEach(it => {
    if(!it) return;
    if(it.setId === "cryptwarden") count++;
    // fallback αν κάποιο παλιό item δεν έχει setId:
    else if(String(it.baseName || it.name || "").toLowerCase().includes("cryptwarden")) count++;
  });

  if(count >= 4) return 0.06;
  if(count >= 3) return 0.04;
  if(count >= 2) return 0.02;
  return 0;
}

function recomputeTotals(save) {
  const baseAtk = num(save.heroAttack, 10);
  const baseDef = num(save.heroDefense, 10);

  let atkB = 0, defB = 0;
  Object.values(save.equipment || {}).forEach(it => {
    if (!it) return;
    atkB += num(it.atk, 0);
    defB += num(it.def, 0);
  });

  const rawAtk = baseAtk + atkB;
  const rawDef = baseDef + defB;

  const pct = cryptwardenBonusPct(save.equipment);
  const atkWithSet = Math.floor(rawAtk * (1 + pct));

  save.attackTotal = atkWithSet;
  save.defenseTotal = rawDef;

  // (optional) αν θες να βλέπεις κάπου το pct:
  save.setBonusAtkPct = pct; // 0, 0.02, 0.04, 0.06
}


  function canEquip(save, item) {
    if (!item || item.type !== "gear" || !item.slot) return false;
    return save.heroLevel >= num(item.reqLevel, 1);
  }

  function rarityMult(r) {
    switch ((r || "").toLowerCase()) {
      case "common": return 1;
      case "uncommon": return 2;
      case "rare": return 4;
      case "epic": return 8;
      case "mythic": return 20;
      default: return 1;
    }
  }

  function sellPrice(item) {
    const base = 5 + num(item.atk, 0) * 3 + num(item.def, 0) * 3;
    return Math.max(1, Math.floor(base * rarityMult(item.rarity)));
  }

  function openInspector(invIndex, item) {
    const box = ensureInspectorBoxReplace();
    if (!box) return;

    window.DS?.pause?.();

    const save = ensureSave(loadSave());
    const q = num(item.quantity, 1);

    const p1 = sellPrice(item);
    const pAll = p1 * q;

    const healHp = num(item.healHp, 0);
    const healSt = num(item.healStamina, 0);
    const showEat = (item.type === "food" && (healHp > 0 || healSt > 0));

    const showUpgrade = (item.type === "gear"); // μόνο για gear

    const healLine =
      showEat
        ? ` • Heals${healHp > 0 ? ` +${healHp} HP` : ""}${healSt > 0 ? ` +${healSt} ST` : ""}`
        : "";

    box.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="${item.img || ""}" alt="${item.name || "Item"}"
          style="width:84px;height:84px;border-radius:12px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div style="flex:1;">
          <div style="font-weight:900;font-size:20px;">${item.name || "Item"}</div>
          <div style="opacity:.85;margin-top:4px;">
            ${item.rarity ? `Rarity: <b>${item.rarity}</b>` : "" }
            ${item.type === "gear" ? ` • Slot: <b>${item.slot}</b>` : "" }
            ${item.type === "gear" ? ` • Req Lv <b>${num(item.reqLevel,1)}</b>` : "" }
          </div>
          <div style="opacity:.9;margin-top:6px;">
            ${(num(item.atk,0) || num(item.def,0)) ? `ATK +${num(item.atk,0)} • DEF +${num(item.def,0)}` : "—"}
            ${healLine}
            ${q > 1 ? ` • Qty x${q}` : ""}
          </div>
        </div>
      </div>

      <div class="dsBtnRow">
        <button id="dsEquip" ${canEquip(save,item) ? "" : "disabled"}>🛡 Equip</button>
        ${showUpgrade ? `<button id="dsGoUpgrade">🔧 Upgrade Station</button>` : ``}
        ${showEat ? `<button id="dsEat">🍽 Eat (${healHp > 0 ? `+${healHp} HP` : ``}${healHp > 0 && healSt > 0 ? `, ` : ``}${healSt > 0 ? `+${healSt} ST` : ``})</button>` : ``}
        <button id="dsSell1">💰 Sell 1 (+${p1})</button>
        <button id="dsSellAll">💰 Sell Stack (+${pAll})</button>
        <button id="dsBank">🏦 Send to Bank</button>
        <button id="dsBack">⬅ Back</button>
      </div>

      <div id="dsMsg" style="margin-top:10px;opacity:.9;text-align:center;"></div>
    `;

    const msg = (t) => {
      const m = document.getElementById("dsMsg");
      if (m) m.textContent = t;
    };

    document.getElementById("dsBack")?.addEventListener("click", () => {
      restoreLeftPanelNodes();
      window.DS?.resume?.();
    });

    document.getElementById("dsEquip")?.addEventListener("click", () => {
      const s = ensureSave(loadSave());
      const invIt = s.inventory[invIndex];
      if (!invIt) { msg("❌ Item missing."); return; }
      if (!canEquip(s, invIt)) { msg("❌ Cannot equip."); return; }

      const slotKey = invIt.slot;
      const prev = s.equipment[slotKey] || null;

      const picked = consumeFromInventoryIndex(s, invIndex, 1);
      if (!picked) { msg("❌ Item missing."); return; }

      s.equipment[slotKey] = picked;
      if (prev) addToStack(s.inventory, prev, 1);

      recomputeTotals(s);
      setSave(s);
      msg("✅ Equipped.");
    });

    // ✅ FIXED: writes correct pick to localStorage for upgrade_station.js
    document.getElementById("dsGoUpgrade")?.addEventListener("click", () => {
      const PICK_KEY = "ds_upgrade_pick_v1";

      const s = ensureSave(loadSave());
      const invIt = s.inventory[invIndex];
      if (!invIt) { msg("❌ Item missing."); return; }
      if (invIt.type !== "gear") { msg("❌ Not upgradeable."); return; }

      // stable base name (without "+N")
      invIt.baseName = invIt.baseName || stripPlus(invIt.name);

      // stable key (must match upgrade_station.js stableKey)
      const key = [
        invIt.type || "",
        invIt.baseName || "",
        invIt.slot || "",
        invIt.reqLevel ?? 1,
        invIt.rarity || ""
      ].join("::");

      // persist baseName on the item
      setSave(s);

      localStorage.setItem(PICK_KEY, JSON.stringify({
        index: invIndex,
        key,
        ts: Date.now()
      }));

      window.location.href = "upgrade_station.html";
    });

    document.getElementById("dsEat")?.addEventListener("click", () => {
      const s = ensureSave(loadSave());
      const invIt = s.inventory[invIndex];
      if (!invIt) { msg("❌ Item missing."); return; }

      const hp = num(invIt.healHp, 0);
      const st = num(invIt.healStamina, 0);
      if (!(invIt.type === "food" && (hp > 0 || st > 0))) { msg("❌ Cannot eat this."); return; }

      const removed = consumeFromInventoryIndex(s, invIndex, 1);
      if (!removed) { msg("❌ Item missing."); return; }

      if (hp > 0) s.heroHP = clamp(num(s.heroHP, 0) + hp, 0, s.heroHPMax);
      if (st > 0) s.stamina = clamp(num(s.stamina, 0) + st, 0, s.staminaMax);

      setSave(s);

      const parts = [];
      if (hp > 0) parts.push(`+${hp} HP`);
      if (st > 0) parts.push(`+${st} ST`);
      msg(`✅ Ate 1 ${removed.name || "Food"} (${parts.join(", ")}).`);

      if (!s.inventory[invIndex]) {
        restoreLeftPanelNodes();
        window.DS?.resume?.();
      }
    });

    document.getElementById("dsSell1")?.addEventListener("click", () => {
      const s = ensureSave(loadSave());
      const invIt = s.inventory[invIndex];
      if (!invIt) { msg("❌ Item missing."); return; }

      const removed = consumeFromInventoryIndex(s, invIndex, 1);
      if (!removed) { msg("❌ Item missing."); return; }

      s.gold = num(s.gold, 0) + sellPrice(removed);
      setSave(s);
      msg(`✅ Sold 1 for +${sellPrice(removed)} gold.`);
    });

    document.getElementById("dsSellAll")?.addEventListener("click", () => {
      const s = ensureSave(loadSave());
      const invIt = s.inventory[invIndex];
      if (!invIt) { msg("❌ Item missing."); return; }

      const qty = num(invIt.quantity, 1);
      const stack = removeStackAtIndex(s, invIndex);
      if (!stack) { msg("❌ Item missing."); return; }

      const total = sellPrice(stack) * qty;
      s.gold = num(s.gold, 0) + total;
      setSave(s);
      msg(`✅ Sold stack x${qty} for +${total} gold.`);
    });

    document.getElementById("dsBank")?.addEventListener("click", () => {
      const s = ensureSave(loadSave());
      const stack = removeStackAtIndex(s, invIndex);
      if (!stack) { msg("❌ Item missing."); return; }

      addToStack(s.bank, stack, num(stack.quantity, 1));
      setSave(s);
      msg("✅ Sent to bank.");
    });
  }

  // -------------------------
  // Render loop
  // -------------------------
  function renderAll() {
    const save = ensureSave(loadSave());
    renderHeader(save);
    renderGold(save);
    renderInventory(save);
  }

  function forceRerenderNow() {
    __invSig = "";
    renderAll();
  }

  function boot() {
    hookLocalStorageOnce();
    ensureCoreDOM();
      // ✅ Persist defaults after reset / fresh load
  const _s = ensureSave(loadSave());
  setSave(_s);


    // regen tick always (online + offline)
    setInterval(() => {
      try { applyRegenTick(); } catch(e) { console.error("[UI] regen tick failed", e); }
    }, 2000);

    window.addEventListener("ds:save", forceRerenderNow);

    renderAll();

    setInterval(() => {
      try { renderAll(); } catch(e) { console.error("[UI] renderAll failed", e); }
    }, REFRESH_MS);

    console.log("[UI] boot ok, key =", SAVE_KEY);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
