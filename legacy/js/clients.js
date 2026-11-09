/* Client (store) registry and selector */
/* ---------- CLIENTS ---------- */
let clients={};               // shop -> {shop,name,frtHours,resHours,lastEmailAt}
let curClient="";try{curClient=localStorage.getItem("csdClient")||""}catch(e){}
const clientName=k=>k?(clients[k]?.name||k.replace(/\.myshopify\.com$/,"")):"";
const inClient=x=>!curClient||(x.client||"")===curClient;
function slaFor(t){const c=clients[t.client||""];return {frt:Number(c?.frtHours)||settings.frtHours,res:Number(c?.resHours)||settings.resHours}}
function renderClientSelects(){
  const keys=Object.keys(clients).sort((a,b)=>clientName(a).localeCompare(clientName(b)));
  const g=$("#gClient");g.innerHTML='<option value="">Tất cả client</option>'+keys.map(k=>`<option value="${esc(k)}">${esc(clientName(k))}</option>`).join("");
  g.value=keys.includes(curClient)?curClient:"";if(g.value!==curClient)curClient=g.value;
  const c=$("#csvClient"),cv=c.value;c.innerHTML='<option value="">— Chọn client của file —</option>'+keys.map(k=>`<option value="${esc(k)}">${esc(clientName(k))}</option>`).join("");c.value=keys.includes(cv)?cv:(curClient||"");
}
$("#gClient").addEventListener("change",e=>{curClient=e.target.value;try{localStorage.setItem("csdClient",curClient)}catch(_){};selected.clear();oSelected.clear();renderAll()});
async function ensureClient(shop,name){
  if(!shop)return;
  const c=clients[shop];
  if(!c){clients[shop]={shop,name:name||shop.replace(/\.myshopify\.com$/,""),createdAt:now()};if(db)await db.collection("clients").doc(safeId(shop)).set(clients[shop]).catch(()=>{});renderClientSelects()}
}
