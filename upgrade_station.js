// upgrade_station.js — Upgrades only here
// ✅ Reads selected item from localStorage "ds_upgrade_pick_v1"
// ✅ If selected gear is stacked (qty > 1), upgrade consumes ONLY 1 and splits the stack
// ✅ Consumes Iron Bars + Coal (scaling)
// ✅ Scaling success chance
// ✅ Supports upgrades +1 .. +10
// ✅ Fix: stable pick key so you can upgrade +2, +3... (no losing selection)
// ✅ Name shows as "BaseName +N" (no double +1)

(() => {
  const SAVE_KEY = "darkstone_save_v1";
  const PICK_KEY = "ds_upgrade_pick_v1";
  const MAX_UPG = 10;

  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function setSave(next) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  }

  function ensureSave(s) {
    s = s && typeof s === "object" ? s : {};
    if (!Array.isArray(s.inventory)) s.inventory = [];
    if (!s.equipment || typeof s.equipment !== "object") s.equipment = {};
    s.inventoryMaxSlots = Math.max(1, num(s.inventoryMaxSlots, 1000));
    s.heroAttack = num(s.heroAttack, 10);
    s.heroDefense = num(s.heroDefense, 10);
    return s;
  }

  // -------------------------
  // Stable key + naming
  // -------------------------
  function stripPlus(name){
    const s = String(name || "");
    return s.replace(/\s*\+\d+$/,"");
  }

  function upgradeLevel(item) {
    return Math.max(0, num(item?.upg, 0));
  }

  function ensureBaseName(item){
    if (!item) return "";
    if (item.baseName && String(item.baseName).trim()) return String(item.baseName);
    const base = stripPlus(item.name);
    item.baseName = base;
    return base;
  }

  function setUpgName(item){
    const base = ensureBaseName(item);
    const u = upgradeLevel(item);
    item.name = u > 0 ? `${base} +${u}` : base;
  }

  // ✅ Key that will NOT change when atk/def/name changes
  // Use baseName + type/slot/req/rarity as identity
  function stableKey(it) {
    const base = it?.baseName ? String(it.baseName) : stripPlus(it?.name);
    return [
      it?.type || "",
      base || "",
      it?.slot || "",
      it?.reqLevel ?? 1,
      it?.rarity || ""
    ].join("::");
  }

  // -------------------------
  // Pick
  // -------------------------
  function getPick() {
    try { return JSON.parse(localStorage.getItem(PICK_KEY) || "null"); }
    catch { return null; }
  }

  function setPick(pickObj) {
    localStorage.setItem(PICK_KEY, JSON.stringify(pickObj));
  }

  function buildPickFromItem(index, item){
    // make sure baseName exists
    const tmp = { ...item };
    ensureBaseName(tmp);
    return {
      index,
      key: stableKey(tmp),
      ts: Date.now()
    };
  }

  function findSelectedItem(save, pick) {
    if (!pick) return { idx: null, item: null };

    const idx = num(pick.index, -1);
    const key = String(pick.key || "");

    // 1) try index + key
    if (idx >= 0 && idx < save.inventory.length) {
      const it = save.inventory[idx];
      if (it) {
        ensureBaseName(it);
        if (stableKey(it) === key) return { idx, item: it };
      }
    }

    // 2) fallback: find by key
    const idx2 = save.inventory.findIndex(it => {
      if (!it) return false;
      ensureBaseName(it);
      return stableKey(it) === key;
    });
    if (idx2 >= 0) return { idx: idx2, item: save.inventory[idx2] };

    return { idx: null, item: null };
  }

  // -------------------------
  // Materials by name
  // -------------------------
  function getUnitsByName(inv, name) {
    const idx = inv.findIndex(it => it && (it.name || "").toLowerCase() === name.toLowerCase());
    if (idx < 0) return 0;
    const it = inv[idx];
    return Math.max(1, num(it.quantity ?? it.qty, 1));
  }

  function removeUnitsByName(save, name, qtyNeeded) {
    const idx = save.inventory.findIndex(it => it && (it.name || "").toLowerCase() === name.toLowerCase());
    if (idx < 0) return false;

    const it = save.inventory[idx];
    const q = Math.max(1, num(it.quantity ?? it.qty, 1));

    if (q > qtyNeeded) {
      it.quantity = q - qtyNeeded;
      return true;
    }
    if (q === qtyNeeded) {
      save.inventory.splice(idx, 1);
      return true;
    }
    return false;
  }

  // ✅ Take exactly ONE from an inventory index.
  // If stacked (qty>1), decrement stack and return a single copy (qty 1).
  // If qty==1, remove the stack and return it.
  function takeOneFromInventoryIndex(save, idx) {
    const it = save.inventory[idx];
    if (!it) return null;

    const q = Math.max(1, num(it.quantity ?? it.qty, 1));
    if (q > 1) {
      it.quantity = q - 1;
      return { ...it, quantity: 1 };
    }

    save.inventory.splice(idx, 1);
    return { ...it, quantity: 1 };
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
    save.attackTotal = baseAtk + atkB;
    save.defenseTotal = baseDef + defB;
  }

  // -------------------------
  // Upgrade model
  // -------------------------
  function costForNext(upg) {
    return {
      ironBars: 1 + upg,
      coal: 1 + Math.floor(upg / 2)
    };
  }

  function successChance(upg) {
    // keep same model but safe clamp
    return clamp(0.85 - upg * 0.10, 0.20, 0.85);
  }

  // -------------------------
  // UI
  // -------------------------
  const el = (id) => document.getElementById(id);

  let selectedIndex = null;
  let selectedItem = null;

  function setMsg(t) {
    const m = el("upMsg");
    if (m) m.textContent = t || "";
  }

  function render() {
    const save = ensureSave(loadSave());
    const pick = getPick();
    const found = findSelectedItem(save, pick);

    selectedIndex = found.idx;
    selectedItem = found.item;

    const haveIron = getUnitsByName(save.inventory, "Iron Bar");
    const haveCoal = getUnitsByName(save.inventory, "Coal");

    if (el("haveIron")) el("haveIron").textContent = String(haveIron);
    if (el("haveCoal")) el("haveCoal").textContent = String(haveCoal);

    if (!selectedItem) {
      if (el("selName")) el("selName").textContent = "No item selected";
      if (el("selInfo")) el("selInfo").textContent = "Open an item Inspector → “Upgrade Station”.";
      if (el("selStats")) el("selStats").textContent = "—";
      if (el("selImg")) el("selImg").style.display = "none";

      if (el("needIron")) el("needIron").textContent = "0";
      if (el("needCoal")) el("needCoal").textContent = "0";
      if (el("chanceText")) el("chanceText").textContent = "—";

      if (el("btnUpgrade")) el("btnUpgrade").disabled = true;
      return;
    }

    // normalize base name + display name
    ensureBaseName(selectedItem);
    setUpgName(selectedItem); // ensures correct display like "Sword +3" (no double)

    const upg = upgradeLevel(selectedItem);
    const qty = Math.max(1, num(selectedItem.quantity ?? selectedItem.qty, 1));
    const slotStr = selectedItem.slot ? `Slot: ${selectedItem.slot}` : "Slot: —";
    const reqStr = `Req Lv ${num(selectedItem.reqLevel, 1)}`;

    if (el("selName")) el("selName").textContent = selectedItem.name || "Item";
    if (el("selInfo")) el("selInfo").textContent =
      `Upgrade: +${upg} • ${slotStr} • ${reqStr}${qty > 1 ? ` • Stack x${qty}` : ""}`;

    const atk = num(selectedItem.atk, 0);
    const def = num(selectedItem.def, 0);
    if (el("selStats")) el("selStats").textContent = `ATK +${atk} • DEF +${def}`;

    if (selectedItem.img && el("selImg")) {
      el("selImg").src = selectedItem.img;
      el("selImg").alt = selectedItem.name || "Item";
      el("selImg").style.display = "block";
    } else if (el("selImg")) {
      el("selImg").style.display = "none";
    }

    // limits
    if (upg >= MAX_UPG) {
      if (el("needIron")) el("needIron").textContent = "0";
      if (el("needCoal")) el("needCoal").textContent = "0";
      if (el("chanceText")) el("chanceText").textContent = "—";
      if (el("btnUpgrade")) el("btnUpgrade").disabled = true;
      setMsg(`✅ Max upgrade reached (+${MAX_UPG}).`);
      return;
    }

    const cost = costForNext(upg);
    if (el("needIron")) el("needIron").textContent = String(cost.ironBars);
    if (el("needCoal")) el("needCoal").textContent = String(cost.coal);

    const chance = successChance(upg);
    if (el("chanceText")) el("chanceText").textContent = `${Math.round(chance * 100)}%`;

    const can = (haveIron >= cost.ironBars) && (haveCoal >= cost.coal);
    if (el("btnUpgrade")) el("btnUpgrade").disabled = !can;
  }

  function doUpgrade() {
    const save = ensureSave(loadSave());
    const pick = getPick();
    const found = findSelectedItem(save, pick);

    const idx = found.idx;
    const stackIt = found.item;

    if (idx == null || !stackIt) {
      setMsg("❌ No item selected.");
      render();
      return;
    }
    if (stackIt.type !== "gear") {
      setMsg("❌ Only gear can be upgraded.");
      return;
    }

    ensureBaseName(stackIt);

    const currentUpg = upgradeLevel(stackIt);
    if (currentUpg >= MAX_UPG) {
      setMsg(`✅ Max upgrade reached (+${MAX_UPG}).`);
      render();
      return;
    }

    const cost = costForNext(currentUpg);

    const haveIron = getUnitsByName(save.inventory, "Iron Bar");
    const haveCoal = getUnitsByName(save.inventory, "Coal");
    if (haveIron < cost.ironBars || haveCoal < cost.coal) {
      setMsg("❌ Not enough materials.");
      render();
      return;
    }

    // consume mats first
    const ok1 = removeUnitsByName(save, "Iron Bar", cost.ironBars);
    const ok2 = removeUnitsByName(save, "Coal", cost.coal);
    if (!ok1 || !ok2) {
      setMsg("❌ Material removal failed.");
      setSave(save);
      render();
      return;
    }

    // take exactly ONE gear from the stack
    const baseItem = takeOneFromInventoryIndex(save, idx);
    if (!baseItem) {
      setMsg("❌ Item missing.");
      setSave(save);
      render();
      return;
    }

    // normalize base name on the single item
    ensureBaseName(baseItem);

    const upg = upgradeLevel(baseItem);
    const chance = successChance(upg);
    const roll = Math.random();

    if (roll <= chance) {
      baseItem.upg = upg + 1;
      baseItem.atk = num(baseItem.atk, 0) + 1;
      baseItem.def = num(baseItem.def, 0) + 1;
      setUpgName(baseItem);
      setMsg(`✅ Success! Upgraded to +${baseItem.upg}.`);
    } else {
      // still keep the item (same upg), just materials consumed
      setUpgName(baseItem);
      setMsg("❌ Failed. Materials consumed.");
    }

    // put the single item back as its own stack (qty 1)
    save.inventory.push({ ...baseItem, quantity: 1 });

    // ✅ IMPORTANT: update pick to the new stack (last index)
    const newIndex = save.inventory.length - 1;
    const newPick = buildPickFromItem(newIndex, save.inventory[newIndex]);
    setPick(newPick);

    recomputeTotals(save);
    setSave(save);

    render();
  }

  function boot() {
    el("btnBack")?.addEventListener("click", () => {
      window.history.back();
    });

    el("btnUpgrade")?.addEventListener("click", () => {
      doUpgrade();
    });

    render();
    window.addEventListener("ds:save", render);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
