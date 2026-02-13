// cooking_action.js — Darkstone Chronicles
// ✅ 6s timer loop + Start/Stop + Target
// ✅ Consumes 1 raw ingredient -> produces 1 cooked food (stackable)
// ✅ Cooking XP + Level up
// ✅ Pauses immediately when ui.js Inspector opens (ds:pause)
// ✅ FIX: Images resolved correctly on file:/// using new URL(..., document.baseURI)

(() => {
  const SAVE_KEY = "darkstone_save_v1";

  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function setSave(next) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  }

  function ensureCooking(save) {
    save = save && typeof save === "object" ? save : {};
    if (!Number.isFinite(Number(save.cookingLevel))) save.cookingLevel = 1;
    if (!Number.isFinite(Number(save.cookingXP))) save.cookingXP = 0;
    if (!Number.isFinite(Number(save.cookingXPNext))) save.cookingXPNext = 100;

    if (!Array.isArray(save.inventory)) save.inventory = [];
    if (!Number.isFinite(Number(save.inventoryMaxSlots))) save.inventoryMaxSlots = 1000;

    return save;
  }

  // --------------------------------------------------
  // Inventory helpers (units capacity like your system)
  // --------------------------------------------------
  function usedUnits(inv) {
    let u = 0;
    for (const it of inv) {
      if (!it) continue;
      const q = Number(it.quantity ?? it.qty);
      u += Number.isFinite(q) ? Math.max(1, q) : 1;
    }
    return u;
  }
  function hasSpaceFor(save, addUnits) {
    return usedUnits(save.inventory) + addUnits <= Number(save.inventoryMaxSlots || 1000);
  }

  // stack key ignores img (so changing paths later won't break stacks)
  function itemStackKey(it) {
    return [it.type || "", it.id || "", it.name || ""].join("::");
  }
  function addToInventoryStack(save, item, qty) {
    const key = itemStackKey(item);
    const ex = save.inventory.find(i => i && itemStackKey(i) === key);
    if (ex) ex.quantity = (Number(ex.quantity) || 1) + qty;
    else save.inventory.push({ ...item, quantity: qty });
  }

  function countByTypeId(save, type, id) {
    let c = 0;
    for (const it of save.inventory) {
      if (!it) continue;
      if ((it.type || "") === type && (it.id || "") === id) {
        c += Math.max(1, num(it.quantity ?? it.qty, 1));
      }
    }
    return c;
  }

  function consumeOneByTypeId(save, type, id) {
    const idx = save.inventory.findIndex(it => it && (it.type || "") === type && (it.id || "") === id);
    if (idx < 0) return false;

    const it = save.inventory[idx];
    const q = Math.max(1, num(it.quantity ?? it.qty, 1));
    if (q > 1) it.quantity = q - 1;
    else save.inventory.splice(idx, 1);
    return true;
  }

  // --------------------------------------------------
  // ✅ Robust asset url for file:/// and normal
  // --------------------------------------------------
  function absAsset(p) {
    if (!p) return "";
    try { return new URL(p, document.baseURI).href; }
    catch { return p; }
  }

  // --------------------------------------------------
  // Recipes (Fish + Meat)
  // --------------------------------------------------
  const RECIPES = [
    // =================
    // Fish -> Food (HP)
    // =================
    {
      id: "cooked_silver_minnow",
      title: "Cooked Silver Minnow",
      req: 1,
      in: { type: "fish", id: "silver_minnow", name: "Silver Minnow", qty: 1, img: "images/fish/silver_minnow.png" },
      out: { type: "food", id: "cooked_silver_minnow", name: "Cooked Silver Minnow", img: "images/food/cooked_silver_minnow.png", healHp: 5, healStamina: 0 }
    },
    {
      id: "cooked_river_trout",
      title: "Cooked River Trout",
      req: 1,
      in: { type: "fish", id: "river_trout", name: "River Trout", qty: 1, img: "images/fish/river_trout.png" },
      out: { type: "food", id: "cooked_river_trout", name: "Cooked River Trout", img: "images/food/cooked_river_trout.png", healHp: 7, healStamina: 0 }
    },

    {
      id: "cooked_moonlit_sardine",
      title: "Cooked Moonlit Sardine",
      req: 5,
      in: { type: "fish", id: "moonlit_sardine", name: "Moonlit Sardine", qty: 1, img: "images/fish/moonlit_sardine.png" },
      out: { type: "food", id: "cooked_moonlit_sardine", name: "Cooked Moonlit Sardine", img: "images/food/cooked_moonlit_sardine.png", healHp: 5, healStamina: 0 }
    },
    {
      id: "cooked_crystal_snapper",
      title: "Cooked Crystal Snapper",
      req: 5,
      in: { type: "fish", id: "crystal_snapper", name: "Crystal Snapper", qty: 1, img: "images/fish/crystal_snapper.png" },
      out: { type: "food", id: "cooked_crystal_snapper", name: "Cooked Crystal Snapper", img: "images/food/cooked_crystal_snapper.png", healHp: 7, healStamina: 0 }
    },

    {
      id: "cooked_sunset_mackerel",
      title: "Cooked Sunset Mackerel",
      req: 10,
      in: { type: "fish", id: "sunset_mackerel", name: "Sunset Mackerel", qty: 1, img: "images/fish/sunset_mackerel.png" },
      out: { type: "food", id: "cooked_sunset_mackerel", name: "Cooked Sunset Mackerel", img: "images/food/cooked_sunset_mackerel.png", healHp: 5, healStamina: 0 }
    },
    {
      id: "cooked_ember_tuna",
      title: "Cooked Ember Tuna",
      req: 10,
      in: { type: "fish", id: "ember_tuna", name: "Ember Tuna", qty: 1, img: "images/fish/ember_tuna.png" },
      out: { type: "food", id: "cooked_ember_tuna", name: "Cooked Ember Tuna", img: "images/food/cooked_ember_tuna.png", healHp: 7, healStamina: 0 }
    },

    {
      id: "cooked_bog_carp",
      title: "Cooked Bog Carp",
      req: 15,
      in: { type: "fish", id: "bog_carp", name: "Bog Carp", qty: 1, img: "images/fish/bog_carp.png" },
      out: { type: "food", id: "cooked_bog_carp", name: "Cooked Bog Carp", img: "images/food/cooked_bog_carp.png", healHp: 5, healStamina: 0 }
    },
    {
      id: "cooked_witchfin_eel",
      title: "Cooked Witchfin Eel",
      req: 15,
      in: { type: "fish", id: "witchfin_eel", name: "Witchfin Eel", qty: 1, img: "images/fish/witchfin_eel.png" },
      out: { type: "food", id: "cooked_witchfin_eel", name: "Cooked Witchfin Eel", img: "images/food/cooked_witchfin_eel.png", healHp: 7, healStamina: 0 }
    },

    // ======================
    // Meat -> Food (Stamina)
    // ======================
    {
      id: "cooked_deer_meat",
      title: "Cooked Deer Meat",
      req: 1,
      in: { type: "meat", id: "raw_deer_meat", name: "Raw Deer Meat", qty: 1, img: "images/meat/raw_deer.png" },
      out: { type: "food", id: "cooked_deer_meat", name: "Cooked Deer Meat", img: "images/meat/cooked_deer.png", healHp: 0, healStamina: 2 }
    },
    {
      id: "cooked_boar_meat",
      title: "Cooked Boar Meat",
      req: 5,
      in: { type: "meat", id: "raw_boar_meat", name: "Raw Boar Meat", qty: 1, img: "images/meat/raw_boar.png" },
      out: { type: "food", id: "cooked_boar_meat", name: "Cooked Boar Meat", img: "images/meat/cooked_boar.png", healHp: 0, healStamina: 3 }
    },
    {
      id: "cooked_wolf_meat",
      title: "Cooked Wolf Meat",
      req: 10,
      in: { type: "meat", id: "raw_wolf_meat", name: "Raw Wolf Meat", qty: 1, img: "images/meat/raw_wolf.png" },
      out: { type: "food", id: "cooked_wolf_meat", name: "Cooked Wolf Meat", img: "images/meat/cooked_wolf.png", healHp: 0, healStamina: 4 }
    },
    {
      id: "cooked_bear_meat",
      title: "Cooked Bear Meat",
      req: 15,
      in: { type: "meat", id: "raw_bear_meat", name: "Raw Bear Meat", qty: 1, img: "images/meat/raw_bear.png" },
      out: { type: "food", id: "cooked_bear_meat", name: "Cooked Bear Meat", img: "images/meat/cooked_bear.png", healHp: 0, healStamina: 5 }
    }
  ];

  function getRecipeFromUrl() {
    const p = new URLSearchParams(location.search);
    return p.get("recipe") || "cooked_silver_minnow";
  }
  function getRecipeDef(id) {
    return RECIPES.find(r => r.id === id) || RECIPES[0];
  }

  // --------------------------------------------------
  // DOM
  // --------------------------------------------------
  const backBtn = document.getElementById("backBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  const inImg = document.getElementById("inImg");
  const outImg = document.getElementById("outImg");
  const recipeName = document.getElementById("recipeName");
  const recipeInfo = document.getElementById("recipeInfo");

  const timerWrap = document.getElementById("timerWrap");
  const timerText = document.getElementById("timerText");
  const timerBar = document.getElementById("timerBar");

  const msgEl = document.getElementById("msg");

  const targetInput = document.getElementById("targetInput");
  const targetBtn = document.getElementById("targetBtn");
  const targetStatus = document.getElementById("targetStatus");

  const lvlEl = document.getElementById("cookLevel");
  const curEl = document.getElementById("cookXPCurrent");
  const nextEl = document.getElementById("cookXPNext");
  const barEl = document.getElementById("cookXPBar");

  // Pause/resume from ui.js inspector
  window.addEventListener("ds:pause", () => stopCooking(true));
  window.addEventListener("ds:resume", () => { /* never auto-start */ });

  // --------------------------------------------------
  // Header render
  // --------------------------------------------------
  function renderCookingHeader() {
    const s = ensureCooking(loadSave());

    if (lvlEl) lvlEl.textContent = String(s.cookingLevel);
    if (curEl) curEl.textContent = String(s.cookingXP);
    if (nextEl) nextEl.textContent = String(s.cookingXPNext);

    const pct = s.cookingXPNext > 0
      ? clamp((s.cookingXP / s.cookingXPNext) * 100, 0, 100)
      : 0;

    if (barEl) barEl.style.width = pct.toFixed(1) + "%";
  }

  // --------------------------------------------------
  // Loop + timer UI
  // --------------------------------------------------
  const CD_MS = 6000;
  let cookingActive = false;
  let cookingTimer = null;

  let cdAnim = null;
  let cdStart = 0;
  let targetRemaining = 0;

  function setMsg(t) {
    if (msgEl) msgEl.textContent = t || "";
  }

  function stopCooldownUI() {
    if (cdAnim) cancelAnimationFrame(cdAnim);
    cdAnim = null;

    if (timerWrap) timerWrap.style.display = "none";
    if (timerBar) timerBar.style.width = "0%";
    if (timerText) timerText.textContent = (CD_MS / 1000).toFixed(1) + "s";
  }

  function startCooldownUI() {
    if (!timerWrap || !timerBar || !timerText) return;

    timerWrap.style.display = "";
    cdStart = performance.now();

    const tick = (now) => {
      if (!cookingActive || window.DS?.isPaused) {
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

  function updateTargetUI() {
    if (!targetStatus) return;
    targetStatus.textContent = targetRemaining > 0 ? `Remaining: ${targetRemaining}` : "";
  }

  function startCooking() {
    if (window.DS?.isPaused) return;
    if (cookingActive) return;

    cookingActive = true;
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    setMsg("🍳 Cooking started.");
    scheduleNext(true); // immediate first cook
  }

  function stopCooking(silent = false) {
    cookingActive = false;

    if (cookingTimer) {
      clearTimeout(cookingTimer);
      cookingTimer = null;
    }

    stopCooldownUI();

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;

    targetRemaining = 0;
    updateTargetUI();

    if (!silent) setMsg("⏹ Cooking stopped.");
  }

  function scheduleNext(runImmediately = false) {
    if (!cookingActive) return;
    if (window.DS?.isPaused) return;

    if (runImmediately) {
      cookTick();
      return;
    }

    startCooldownUI();
    cookingTimer = setTimeout(() => cookTick(), CD_MS);
  }

  function cookTick() {
    if (!cookingActive) return;
    if (window.DS?.isPaused) return;

    const rid = getRecipeFromUrl();
    const r = getRecipeDef(rid);
    const s = ensureCooking(loadSave());

    if (s.cookingLevel < r.req) {
      setMsg(`❌ Requires Cooking Level ${r.req}.`);
      stopCooking(true);
      return;
    }

    const have = countByTypeId(s, r.in.type, r.in.id);
    if (have < r.in.qty) {
      setMsg(`❌ Need ${r.in.name} x${r.in.qty}.`);
      stopCooking(true);
      setSave(s);
      return;
    }

    if (!hasSpaceFor(s, 1)) {
      setMsg("❌ No more inventory space");
      stopCooking(true);
      setSave(s);
      return;
    }

    const ok = consumeOneByTypeId(s, r.in.type, r.in.id);
    if (!ok) {
      setMsg("❌ Ingredient missing.");
      stopCooking(true);
      setSave(s);
      return;
    }

    // add output (food)
    addToInventoryStack(s, {
      type: "food",
      id: r.out.id,
      name: r.out.name,
      img: r.out.img,
      healHp: num(r.out.healHp, 0),
      healStamina: num(r.out.healStamina, 0)
    }, 1);

    // XP gain
    s.cookingXP += 6;
    while (s.cookingXP >= s.cookingXPNext) {
      s.cookingXP -= s.cookingXPNext;
      s.cookingLevel += 1;
      s.cookingXPNext = Math.floor(s.cookingXPNext * 1.5);
    }

    setSave(s);
    renderCookingHeader();

    if (targetRemaining > 0) {
      targetRemaining -= 1;
      updateTargetUI();
      if (targetRemaining <= 0) {
        setMsg(`✅ Target completed! You cooked 1 ${r.out.name} (last).`);
        stopCooking(true);
        return;
      }
    }

    setMsg(`🍳 You cooked 1 ${r.out.name}.`);
    scheduleNext(false);
  }

  // Target cooking
  function startTargetCooking() {
    const val = Number(targetInput?.value);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Enter a valid target amount (e.g. 100).");
      return;
    }

    targetRemaining = Math.floor(val);
    updateTargetUI();

    if (!cookingActive) startCooking();
    else setMsg(`🎯 Target set: ${targetRemaining}`);
  }

  // Boot
  window.addEventListener("DOMContentLoaded", () => {
    const rid = getRecipeFromUrl();
    const r = getRecipeDef(rid);

    // images (FIXED)
    if (inImg) inImg.src = absAsset(r.in.img);
    if (outImg) outImg.src = absAsset(r.out.img);

    // labels
    if (recipeName) recipeName.textContent = r.title;

    if (recipeInfo) {
      const hp = num(r.out.healHp, 0);
      const st = num(r.out.healStamina, 0);

      const effect =
        hp > 0 && st > 0 ? `+${hp} HP, +${st} Stamina` :
        hp > 0 ? `+${hp} HP` :
        st > 0 ? `+${st} Stamina` : `—`;

      recipeInfo.textContent = `Req Cooking Lv ${r.req} • Input: ${r.in.name} x${r.in.qty} → ${effect}`;
    }

    renderCookingHeader();
    stopCooldownUI();

    backBtn?.addEventListener("click", () => {
      stopCooking(true);
      window.location.href = "cooking.html";
    });

    startBtn?.addEventListener("click", startCooking);
    stopBtn?.addEventListener("click", () => stopCooking(false));
    targetBtn?.addEventListener("click", startTargetCooking);

    if (stopBtn) stopBtn.disabled = true;
  });
})();
