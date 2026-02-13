// index.js — Home/Town hub logic (safe with ui.js)
(() => {
  const LOG_KEY = "ds_home_log_v1";
  const LOG_MAX = 10;

  const el = (id) => document.getElementById(id);

  function loadLog() {
    try {
      const arr = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLog(arr) {
    localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(0, LOG_MAX)));
  }

  function pushLog(text) {
    const arr = loadLog();
    arr.unshift({ t: Date.now(), text });
    saveLog(arr);
    renderLog();
  }

  function renderLog() {
    const logEl = el("log");
    if (!logEl) return;

    const arr = loadLog();
    logEl.innerHTML = "";

    if (arr.length === 0) {
      const empty = document.createElement("div");
      empty.className = "log-item";
      empty.textContent = "No recent events.";
      logEl.appendChild(empty);
      return;
    }

    for (const it of arr) {
      const d = document.createElement("div");
      d.className = "log-item";
      d.textContent = it.text;
      logEl.appendChild(d);
    }
  }

  function nav(btnId, href, logText) {
    el(btnId)?.addEventListener("click", () => {
      if (logText) pushLog(logText);
      window.location.href = href;
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    renderLog();

    nav("goFight", "fight.html", "⚔️ Traveled to the Fight zone.");
nav("goDungeons", "dungeons.html", "🏰 Entered the Whispering Crypt.");

    nav("goMine", "mining.html", "⛏️ Headed to the mines.");
    nav("goForge", "forge.html", "⚒️ Entered the forge.");
nav("goFish", "fishing.html", "🎣 Traveled to a fishing spot.");
nav("goHunt", "hunting.html", "🏹 Went hunting in the wilds.");

nav("goCook", "cooking.html", "🍳 Prepared meals at the kitchen.");

    nav("goMarket", "market.html", "🛒 Visited the market.");
    nav("goEquip", "equipment.html", "🛡 Opened equipment.");
  });
})();
