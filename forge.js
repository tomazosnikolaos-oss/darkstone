// forge.js — Forge selection page (like mining.html)
// Shows: Blacksmith Level + XP bar + grid of bars
// Click -> forge_action.html?recipe=...

(() => {
  const SAVE_KEY = "darkstone_save_v1";

  const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadSave(){
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function setSave(s){
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }

  function xpNextForLevel(lvl){
    return 100 + (lvl - 1) * 60 + Math.floor((lvl - 1) * (lvl - 1) * 10);
  }

  function ensureForge(save){
    save = save && typeof save === "object" ? save : {};
    if (!Array.isArray(save.inventory)) save.inventory = [];

    save.blacksmithLevel = Math.max(1, num(save.blacksmithLevel, 1));
    save.blacksmithXP = Math.max(0, num(save.blacksmithXP, 0));
    save.blacksmithXPNext = Math.max(1, num(save.blacksmithXPNext, xpNextForLevel(save.blacksmithLevel)));

    // ensure job object exists (used by action page too)
    if (!save.forgeJob || typeof save.forgeJob !== "object") {
      save.forgeJob = { isRunning:false, recipeId:"", remaining:0, lastTickTs: Date.now() };
    }
    return save;
  }

  // Coal stays as ore/resource (fuel), not a bar.
  const RECIPES = [
    {
      id: "iron_bar",
      name: "Iron Bar",
      reqLevel: 1,
      inputText: "2 Iron Ore + 1 Coal",
      img: "images/bars/iron_bar.png"
    },
    {
      id: "obsidian_bar",
      name: "Obsidian Bar",
      reqLevel: 10,
      inputText: "2 Obsidian + 2 Coal",
      img: "images/bars/obsidian_bar.png"
    },
    {
      id: "adamant_bar",
      name: "Adamant Bar",
      reqLevel: 20,
      inputText: "2 Adamant + 3 Coal",
      img: "images/bars/adamant_bar.png"
    },
    {
      id: "ruby_bar",
      name: "Ruby Bar",
      reqLevel: 30,
      inputText: "2 Ruby + 4 Coal",
      img: "images/bars/ruby_bar.png"
    }
  ];

  function el(id){ return document.getElementById(id); }

  function renderTop(save){
    el("bsLevel").textContent = String(save.blacksmithLevel);

    el("bsXPCurrent").textContent = String(save.blacksmithXP);
    el("bsXPNext").textContent = String(save.blacksmithXPNext);

    const pct = clamp((save.blacksmithXP / Math.max(1, save.blacksmithXPNext)) * 100, 0, 100);
    el("bsXPBar").style.width = `${pct}%`;
  }

  function renderGrid(save){
    const grid = el("barGrid");
    grid.innerHTML = "";

    RECIPES.forEach(r => {
      const locked = save.blacksmithLevel < r.reqLevel;

      const card = document.createElement("div");
      card.style.background = "#151520";
      card.style.border = "2px solid #333";
      card.style.borderRadius = "12px";
      card.style.padding = "12px";
      card.style.cursor = locked ? "not-allowed" : "pointer";
      card.style.opacity = locked ? "0.55" : "1";
      card.style.display = "flex";
      card.style.gap = "12px";
      card.style.alignItems = "center";

      const img = document.createElement("img");
      img.src = r.img;
      img.alt = r.name;
      img.style.width = "64px";
      img.style.height = "64px";
      img.style.borderRadius = "12px";
      img.style.border = "2px solid #333";
      img.style.objectFit = "cover";
      img.style.background = "#0f0f16";
      img.onerror = () => { img.style.display = "none"; };

      const info = document.createElement("div");
      info.style.flex = "1";

      const title = document.createElement("div");
      title.style.fontWeight = "900";
      title.style.fontSize = "16px";
      title.textContent = r.name;

      const req = document.createElement("div");
      req.style.opacity = ".88";
      req.style.marginTop = "4px";
      req.textContent = `Req Lv ${r.reqLevel}`;

      const mats = document.createElement("div");
      mats.style.opacity = ".85";
      mats.style.marginTop = "6px";
      mats.textContent = r.inputText;

      info.appendChild(title);
      info.appendChild(req);
      info.appendChild(mats);

      card.appendChild(img);
      card.appendChild(info);

      if (!locked) {
        card.addEventListener("click", () => {
          window.location.href = `forge_action.html?recipe=${encodeURIComponent(r.id)}`;
        });
      }

      grid.appendChild(card);
    });
  }

  function boot(){
    const save = ensureForge(loadSave());
    // keep xpNext consistent if not set
    save.blacksmithXPNext = Math.max(1, num(save.blacksmithXPNext, xpNextForLevel(save.blacksmithLevel)));
    setSave(save);

    renderTop(save);
    renderGrid(save);

    window.addEventListener("ds:save", () => {
      const s = ensureForge(loadSave());
      renderTop(s);
      renderGrid(s);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
