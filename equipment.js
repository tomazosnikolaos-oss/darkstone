// equipment.js — Darkstone Chronicles (Paperdoll Equip UI + Stats Breakout + Set Bonus)
// ✅ recomputeTotals (base + gear) + Cryptwarden set bonus (2/4=2%, 3/4=4%, 4/4=6% total ATK)
// ✅ writes: attackTotal/defenseTotal + _atkBase/_defBase/_atkFromGear/_defFromGear/setBonusAtkPct
// ✅ renders breakout UI IF you have elements with these ids:
//    baseAtk, baseDef, gearAtk, gearDef, setPct, totalAtk, totalDef

(() => {
  const SAVE_KEY = "darkstone_save_v1";

  // ---------- helpers ----------
  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function setSave(next) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  }

  function ensureEquipment(save) {
    save = save && typeof save === "object" ? save : {};

    if (!Array.isArray(save.inventory)) save.inventory = [];
    if (!save.equipment || typeof save.equipment !== "object") save.equipment = {};

    const slots = [
      "mainHand","offHand",
      "helmet","shoulders",
      "chest","bracers","gloves",
      "belt","pants","boots",
      "ring","amulet"
    ];
    for (const k of slots) if (!(k in save.equipment)) save.equipment[k] = null;

    // ✅ HARD FLOOR so you never see 0 bases by accident
    save.heroLevel   = Math.max(1, num(save.heroLevel, 1));
    save.heroAttack  = Math.max(10, num(save.heroAttack, 10));
    save.heroDefense = Math.max(10, num(save.heroDefense, 10));

    return save;
  }

  function getSave() {
    return ensureEquipment(loadSave());
  }

  // ---------- set bonus ----------
  function cryptwardenBonusPct(equipment) {
    let count = 0;

    Object.values(equipment || {}).forEach(it => {
      if (!it) return;

      // preferred: explicit setId
      if (it.setId === "cryptwarden") { count++; return; }

      // fallback: name/baseName includes cryptwarden
      const n = String(it.baseName || it.name || "").toLowerCase();
      if (n.includes("cryptwarden")) count++;
    });

    if (count >= 4) return 0.06;
    if (count >= 3) return 0.04;
    if (count >= 2) return 0.02;
    return 0;
  }

  function recomputeTotalsLocal(save) {
    // base stats
    const baseAtk = Math.max(10, num(save.heroAttack, 10));
    const baseDef = Math.max(10, num(save.heroDefense, 10));

    // gear bonuses
    let atkB = 0, defB = 0;
    Object.values(save.equipment || {}).forEach(it => {
      if (!it) return;
      atkB += Math.max(0, num(it.atk, 0));
      defB += Math.max(0, num(it.def, 0));
    });

    const rawAtk = baseAtk + atkB;
    const rawDef = baseDef + defB;

    const pct = cryptwardenBonusPct(save.equipment);
    const atkWithSet = Math.floor(rawAtk * (1 + pct));

    save.attackTotal = atkWithSet;
    save.defenseTotal = rawDef;

    // breakout fields (for your equipment page table)
    save.setBonusAtkPct = pct; // 0 / 0.02 / 0.04 / 0.06
    save._atkBase = baseAtk;
    save._defBase = baseDef;
    save._atkFromGear = atkB;
    save._defFromGear = defB;

    return save;
  }

  // ---------- labels ----------
  const SLOT_LABEL = {
    helmet: "Helmet",
    shoulders: "Shoulders",
    chest: "Chest",
    bracers: "Bracers",
    gloves: "Gloves",
    belt: "Belt",
    pants: "Pants",
    boots: "Boots",
    mainHand: "Main Hand",
    offHand: "Off Hand",
    ring: "Ring",
    amulet: "Amulet"
  };

  // ---------- styles ----------
  function injectEquipStylesOnce() {
    if (document.getElementById("ds-equip-styles")) return;
    const s = document.createElement("style");
    s.id = "ds-equip-styles";
    s.textContent = `
      .knightBg{
        position:absolute; inset:0;
        background:
          radial-gradient(70% 60% at 5 30%, rgba(255,255,255,.08), transparent 60%),
          radial-gradient(70% 60% at 50% 75%, rgba(255,255,255,.05), transparent 65%),
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,0)),
          #0f0f16;
        opacity:.95;
        pointer-events:none;
      }

      .pdSlot{
        position:absolute;
        width:64px;height:64px;
        transform:translateX(-50%);
        border-radius:14px;
        border:2px solid rgba(120,120,160,.65);
        background: rgba(15,15,22,.25);
        box-shadow: 0 10px 24px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
        user-select:none;
      }
      .pdSlot:hover{filter:brightness(1.12);}
      .pdSlot.hasItem{
        background: rgba(15,15,22,.55);
        border-color: rgba(170,170,220,.85);
      }
      .pdSlot img{
        width:58px;height:58px;border-radius:12px;
        object-fit:cover;display:block;
      }
      .pdEmpty{
        font-size:11px;
        opacity:.85;
        text-align:center;
        line-height:1.05;
        padding:0 4px;
        text-shadow: 0 1px 6px rgba(0,0,0,.6);
      }
    `;
    document.head.appendChild(s);
  }

  // ---------- stats breakout render ----------
  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(value);
  }

function renderBreakout() {
  const s = getSave();

  // σιγουρέψου ότι τα totals/breakouts είναι φρέσκα
  recomputeTotalsLocal(s);
  setSave(s);

  // base
  setText("baseAtk", num(s._atkBase, 0));
  setText("baseDef", num(s._defBase, 0));

  // gear (με +)
  const ga = num(s._atkFromGear, 0);
  const gd = num(s._defFromGear, 0);
  setText("gearAtk", (ga >= 0 ? `+${ga}` : String(ga)));
  setText("gearDef", (gd >= 0 ? `+${gd}` : String(gd)));

  // % bonus (στο δικό σου HTML είναι pctAtk/pctDef)
  const pct = num(s.setBonusAtkPct, 0);
  const pctText = `${Math.round(pct * 100)}%`;
  setText("pctAtk", pctText);

  // προς το παρόν δεν έχεις defense % bonus από set → 0%
  setText("pctDef", "0%");

  // totals
  setText("totalAtk", num(s.attackTotal, 0));
  setText("totalDef", num(s.defenseTotal, 0));
}

  // ---------- render paperdoll ----------
  function renderPaperdoll() {
    const save = getSave();
    const nodes = document.querySelectorAll(".pdSlot");

    nodes.forEach(node => {
      const slotKey = node.dataset.slot;
      const it = save.equipment?.[slotKey] || null;

      node.classList.remove("hasItem");
      node.innerHTML = "";

      if (it && it.img) {
        node.classList.add("hasItem");

        const img = document.createElement("img");
        img.src = it.img;
        img.alt = it.name || SLOT_LABEL[slotKey] || slotKey;
        node.appendChild(img);

        node.title = `${SLOT_LABEL[slotKey] || slotKey}: ${it.name || "Item"} (ATK +${num(it.atk,0)}, DEF +${num(it.def,0)})`;
      } else {
        const label = SLOT_LABEL[slotKey] || slotKey;
        const t = document.createElement("div");
        t.className = "pdEmpty";
        t.textContent = label;
        node.appendChild(t);

        node.title = `${label}: Empty`;
      }

      // click unequip if has item
      node.onclick = null;
      if (it) {
        node.addEventListener("click", () => {
          const s = getSave();
          const cur = s.equipment?.[slotKey];
          if (!cur) return;

          s.inventory.push({ ...cur, quantity: cur.quantity ?? 1 });
          s.equipment[slotKey] = null;

          recomputeTotalsLocal(s);
          setSave(s);

          renderPaperdoll();
          renderBreakout();
        });
      }
    });
  }

  // ---------- quick equip via SHIFT+click inventory ----------
  function hookInventoryShiftEquip() {
    const grid = document.getElementById("inventoryGrid");
    if (!grid) return;

    grid.addEventListener("click", (e) => {
      const slotEl = e.target.closest(".dsSlot");
      if (!slotEl) return;

      // keep normal click for global inspector
      if (!e.shiftKey) return;

      const idx = Number(slotEl.dataset.index);
      if (!Number.isFinite(idx)) return;

      const s = getSave();
      const item = s.inventory[idx];
      if (!item) return;

      if (item.type !== "gear" || !item.slot) return;

      const req = Math.max(1, num(item.reqLevel, 1));
      if (s.heroLevel < req) {
        alert(`Requires Level ${req}`);
        return;
      }

      const slotKey = item.slot;
      const prev = s.equipment[slotKey];

      // take 1 from stack if stacked (gear normally shouldn't stack, but safe)
      const q = Math.max(1, num(item.quantity ?? item.qty, 1));
      const picked = { ...item, quantity: 1 };

      if (q > 1) item.quantity = q - 1;
      else s.inventory.splice(idx, 1);

      s.equipment[slotKey] = picked;
      if (prev) s.inventory.push({ ...prev, quantity: prev.quantity ?? 1 });

      recomputeTotalsLocal(s);
      setSave(s);

      renderPaperdoll();
      renderBreakout();
    });
  }

  // ---------- boot ----------
  window.addEventListener("DOMContentLoaded", () => {
    injectEquipStylesOnce();

    // Ensure totals exist at least once on load
    const s = getSave();
    recomputeTotalsLocal(s);
    setSave(s);

    renderPaperdoll();
    renderBreakout();
    hookInventoryShiftEquip();

    // if something changes while you're on this page (equip via inspector, etc.)
    window.addEventListener("ds:save", () => {
      renderPaperdoll();
      renderBreakout();
    });
  });
})();
