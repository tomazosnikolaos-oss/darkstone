const SAVE_KEY = "darkstone_save_v1"; //321ddasddasd
const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}

function ensureCooking(save){
  save = save && typeof save === "object" ? save : {};
  if (!Number.isFinite(Number(save.cookingLevel))) save.cookingLevel = 1;
  if (!Number.isFinite(Number(save.cookingXP))) save.cookingXP = 0;
  if (!Number.isFinite(Number(save.cookingXPNext))) save.cookingXPNext = 100;
  if (!Array.isArray(save.inventory)) save.inventory = [];
  return save;
}

const RECIPES = [
  // ===== Fish =====
  { id:"cooked_silver_minnow", title:"Cooked Silver Minnow", req:1,
    in:{type:"fish", id:"silver_minnow", name:"Silver Minnow", qty:1, img:"images/fish/silver_minnow.png"},
    out:{type:"food", id:"cooked_silver_minnow", name:"Cooked Silver Minnow", img:"images/food/cooked_silver_minnow.png", healHp:5, qty:1}
  },
  { id:"cooked_river_trout", title:"Cooked River Trout", req:1,
    in:{type:"fish", id:"river_trout", name:"River Trout", qty:1, img:"images/fish/river_trout.png"},
    out:{type:"food", id:"cooked_river_trout", name:"Cooked River Trout", img:"images/food/cooked_river_trout.png", healHp:7, qty:1}
  },

  { id:"cooked_moonlit_sardine", title:"Cooked Moonlit Sardine", req:5,
    in:{type:"fish", id:"moonlit_sardine", name:"Moonlit Sardine", qty:1, img:"images/fish/moonlit_sardine.png"},
    out:{type:"food", id:"cooked_moonlit_sardine", name:"Cooked Moonlit Sardine", img:"images/food/cooked_moonlit_sardine.png", healHp:5, qty:1}
  },
  { id:"cooked_crystal_snapper", title:"Cooked Crystal Snapper", req:5,
    in:{type:"fish", id:"crystal_snapper", name:"Crystal Snapper", qty:1, img:"images/fish/crystal_snapper.png"},
    out:{type:"food", id:"cooked_crystal_snapper", name:"Cooked Crystal Snapper", img:"images/food/cooked_crystal_snapper.png", healHp:7, qty:1}
  },

  { id:"cooked_sunset_mackerel", title:"Cooked Sunset Mackerel", req:10,
    in:{type:"fish", id:"sunset_mackerel", name:"Sunset Mackerel", qty:1, img:"images/fish/sunset_mackerel.png"},
    out:{type:"food", id:"cooked_sunset_mackerel", name:"Cooked Sunset Mackerel", img:"images/food/cooked_sunset_mackerel.png", healHp:5, qty:1}
  },
  { id:"cooked_ember_tuna", title:"Cooked Ember Tuna", req:10,
    in:{type:"fish", id:"ember_tuna", name:"Ember Tuna", qty:1, img:"images/fish/ember_tuna.png"},
    out:{type:"food", id:"cooked_ember_tuna", name:"Cooked Ember Tuna", img:"images/food/cooked_ember_tuna.png", healHp:7, qty:1}
  },

  { id:"cooked_bog_carp", title:"Cooked Bog Carp", req:15,
    in:{type:"fish", id:"bog_carp", name:"Bog Carp", qty:1, img:"images/fish/bog_carp.png"},
    out:{type:"food", id:"cooked_bog_carp", name:"Cooked Bog Carp", img:"images/food/cooked_bog_carp.png", healHp:5, qty:1}
  },
  { id:"cooked_witchfin_eel", title:"Cooked Witchfin Eel", req:15,
    in:{type:"fish", id:"witchfin_eel", name:"Witchfin Eel", qty:1, img:"images/fish/witchfin_eel.png"},
    out:{type:"food", id:"cooked_witchfin_eel", name:"Cooked Witchfin Eel", img:"images/food/cooked_witchfin_eel.png", healHp:7, qty:1}
  },

  // ===== Meat (Hunting) =====
  { id:"cooked_deer_meat", title:"Cooked Deer Meat", req:1,
    in:{type:"meat", id:"raw_deer_meat", name:"Raw Deer Meat", qty:1, img:"images/meat/raw_deer.png"},
    out:{type:"food", id:"cooked_deer_meat", name:"Cooked Deer Meat", img:"images/meat/cooked_deer.png", healStamina:2, qty:1}
  },
  { id:"cooked_boar_meat", title:"Cooked Boar Meat", req:5,
    in:{type:"meat", id:"raw_boar_meat", name:"Raw Boar Meat", qty:1, img:"images/meat/raw_boar.png"},
    out:{type:"food", id:"cooked_boar_meat", name:"Cooked Boar Meat", img:"images/meat/cooked_boar.png", healStamina:3, qty:1}
  },
  { id:"cooked_wolf_meat", title:"Cooked Wolf Meat", req:10,
    in:{type:"meat", id:"raw_wolf_meat", name:"Raw Wolf Meat", qty:1, img:"images/meat/raw_wolf.png"},
    out:{type:"food", id:"cooked_wolf_meat", name:"Cooked Wolf Meat", img:"images/meat/cooked_wolf.png", healStamina:4, qty:1}
  },
  { id:"cooked_bear_meat", title:"Cooked Bear Meat", req:15,
    in:{type:"meat", id:"raw_bear_meat", name:"Raw Bear Meat", qty:1, img:"images/meat/raw_bear.png"},
    out:{type:"food", id:"cooked_bear_meat", name:"Cooked Bear Meat", img:"images/meat/cooked_bear.png", healStamina:5, qty:1}
  },
];

function renderHeader(){
  const s = ensureCooking(loadSave());
  document.getElementById("cookLevel").textContent = String(s.cookingLevel);
  document.getElementById("cookXPCurrent").textContent = String(s.cookingXP);
  document.getElementById("cookXPNext").textContent = String(s.cookingXPNext);

  const pct = s.cookingXPNext > 0 ? clamp((s.cookingXP / s.cookingXPNext) * 100, 0, 100) : 0;
  document.getElementById("cookXPBar").style.width = pct.toFixed(1) + "%";
}

function invCount(save, type, id){
  let c = 0;
  for (const it of save.inventory || []){
    if (!it) continue;
    if ((it.type || "") === type && (it.id || "") === id){
      c += Math.max(1, num(it.quantity ?? it.qty, 1));
    }
  }
  return c;
}

function effectText(out){
  const hp = num(out.healHp, 0);
  const st = num(out.healStamina, 0);

  if (hp > 0 && st > 0) return `Heals <b>+${hp} HP</b> • Restores <b>+${st} ST</b>`;
  if (hp > 0) return `Heals <b>+${hp} HP</b>`;
  if (st > 0) return `Restores <b>+${st} ST</b>`;
  return `—`;
}

function renderRecipes(){
  const grid = document.getElementById("recipeGrid");
  if (!grid) return;

  const s = ensureCooking(loadSave());
  grid.innerHTML = "";

  RECIPES.forEach(r => {
    const locked = s.cookingLevel < r.req;
    const have = invCount(s, r.in.type, r.in.id);
    const enough = have >= r.in.qty;

    const card = document.createElement("div");
    card.style.background = "#151520";
    card.style.border = "2px solid #333";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.textAlign = "left";
    card.style.cursor = locked ? "not-allowed" : "pointer";
    card.style.opacity = locked ? "0.55" : "1";

    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${r.in.img}" alt="${r.in.name}"
          style="width:54px;height:54px;border-radius:12px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div style="opacity:.85;font-weight:900;">→</div>
        <img src="${r.out.img}" alt="${r.title}"
          style="width:54px;height:54px;border-radius:12px;border:2px solid #333;object-fit:cover;background:#0f0f16;">
        <div style="flex:1;min-width:0;margin-left:6px;">
          <div style="font-weight:900;font-size:16px;margin-bottom:4px;">${r.title}</div>
          <div style="opacity:.85;font-size:12px;">
            Req Cooking Lv <b>${r.req}</b> • ${effectText(r.out)}
          </div>
          <div style="opacity:.85;font-size:12px;margin-top:6px;">
            Need: <b>${r.in.name}</b> x${r.in.qty}
          </div>
          <div style="opacity:.85;font-size:12px;margin-top:4px;">
            You have: <b>${have}</b>
          </div>
        </div>
      </div>

      ${locked ? `<div style="margin-top:10px;color:#ff6b6b;font-weight:900;">LOCKED</div>` : ``}
      ${!locked && enough ? `<div style="margin-top:10px;color:#2dff7c;font-weight:900;">READY</div>` : ``}
      ${!locked && !enough ? `<div style="margin-top:10px;color:#ffcc66;font-weight:900;">MISSING INGREDIENTS</div>` : ``}
    `;

    if (!locked){
      card.addEventListener("click", () => {
        window.location.href = `cooking_action.html?recipe=${encodeURIComponent(r.id)}`;
      });
    }

    grid.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderRecipes();
  window.addEventListener("ds:save", () => {
    renderHeader();
    renderRecipes();
  });
});
