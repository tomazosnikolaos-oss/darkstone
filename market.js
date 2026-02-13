const SAVE_KEY = "darkstone_save_v1";
const num = (v,f=0)=> (Number.isFinite(Number(v)) ? Number(v) : f);

function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function setSave(next){
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
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
function addToStack(arr, item, qty=1){
  const key = itemStackKey(item);
  const ex = arr.find(i => i && itemStackKey(i) === key);
  if (ex){
    ex.quantity = num(ex.quantity,1) + qty;
  }else{
    arr.push({ ...item, quantity: qty });
  }
}

document.getElementById("backBtn")?.addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("buyArrowsBtn")?.addEventListener("click", () => {
  const msg = document.getElementById("shopMsg");

  const s = loadSave();
  if (!Array.isArray(s.inventory)) s.inventory = [];
  s.gold = num(s.gold,0);

  const price = 10;
  if (s.gold < price){
    if (msg) msg.textContent = "❌ Not enough gold.";
    return;
  }

  s.gold -= price;

  addToStack(s.inventory, {
    type: "consumable",
    name: "Arrows",
    quantity: 100,
    rarity: "common",
    img: "images/items/arrows.png"
  }, 100);

  setSave(s);
  if (msg) msg.textContent = "✅ Bought Arrows x100 for 10 gold.";
});
