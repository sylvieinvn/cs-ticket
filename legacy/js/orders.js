/* Orders view: Gmail Flow sync and CSV import */
/* ---------- ORDERS (từ email Shopify Flow) ---------- */
const safeId=s=>String(s).replace(/[^A-Za-z0-9_-]/g,"_").slice(0,140);
const orderKey=o=>(o.client||"")+"|"+o.orderName;
const orderDocId=(shop,name)=>safeId(shop+"__"+name);
const SHIPMAP={CONFIRMED:"info",LABEL_PRINTED:"info",LABEL_PURCHASED:"info",READY_FOR_PICKUP:"pickup",PICKED_UP:"transit",CARRIER_PICKED_UP:"transit",IN_TRANSIT:"transit",OUT_FOR_DELIVERY:"out",ATTEMPTED_DELIVERY:"alert",DELAYED:"alert",DELIVERED:"delivered",FAILURE:"undelivered"};
const CSD_KEYS=["event","shop","store_name","order_id","order","created_at","customer","email","country","total","financial","fulfillment","ship_status","tracking"];
/* Flow gộp các dòng thành 1 dòng → tách theo tên trường cố định */
function parseCSD(body){
  let t=String(body||"");const a=t.indexOf("CSD-BEGIN"),b=t.indexOf("CSD-END");
  if(a<0)return null;t=t.slice(a+9,b>a?b:undefined);
  const re=new RegExp("(?:^|\\s)("+CSD_KEYS.join("|")+"):","g");const marks=[];let m;
  while((m=re.exec(t)))marks.push({k:m[1],start:m.index+m[0].length,at:m.index});
  const out={};marks.forEach((mk,i)=>{const end=i+1<marks.length?marks[i+1].at:t.length;if(!(mk.k in out))out[mk.k]=t.slice(mk.start,end).trim()});
  if(!out.shop||!out.order)return null;
  const tr=(out.tracking||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const [n,c,u]=x.split("|");return {n:(n||"").trim(),c:(c||"").trim(),u:(u||"").trim()}}).filter(x=>x.n);
  const [amt,cur]=(out.total||"").split(/\s+/);
  return {event:out.event||"",shop:out.shop.toLowerCase(),storeName:out.store_name||"",orderName:out.order,orderId:out.order_id||"",orderDate:out.created_at||"",
    customerName:out.customer||"",customerEmail:out.email||"",country:out.country||"",total:amt||"",currency:cur||"",financial:out.financial||"",fulfillment:out.fulfillment||"",
    shipRaw:(out.ship_status||"").toUpperCase(),tracking:[...new Set(tr.map(x=>x.n))].join(", "),carrier:[...new Set(tr.map(x=>x.c).filter(c=>c&&c!=="Other"))].join(", "),trackingUrl:tr[0]?.u||""};
}
/* gộp một email vào đơn; trả về đơn mới nếu có thay đổi */
function mergeOrder(prev,p,msgDate){
  const o={...(prev||{}),client:p.shop,orderName:p.orderName};let ch=!prev;
  const set=(k,v)=>{if(v&&o[k]!==v){o[k]=v;ch=true}};
  for(const k of ["orderId","orderDate","customerName","customerEmail","country","total","currency"])set(k,p[k]);
  const newer=!o.statusAt||msgDate>=o.statusAt;
  if(newer){set("financial",p.financial);set("fulfillment",p.fulfillment)}
  if(p.tracking&&(newer||!o.tracking)){set("tracking",p.tracking);set("carrier",p.carrier);set("trackingUrl",p.trackingUrl)}
  if(p.shipRaw&&(!o.shipAt||msgDate>=o.shipAt)){const st=SHIPMAP[p.shipRaw]||"";if(o.shipRaw!==p.shipRaw){o.shipRaw=p.shipRaw;o.shipStatus=st||o.shipStatus||"";o.shipAt=msgDate;ch=true}}
  if(newer&&ch)o.statusAt=msgDate;
  if(ch){o.updatedAt=now();o.lastEvent=p.event}
  return ch?o:null;
}
let syncing=false,syncState={};
async function gmailCall(tool,input){
  const r=await mcp.callTool("Gmail",tool,input,{cache:false});
  let p=r?.payload??r;
  if(typeof p==="string"){try{p=JSON.parse(p)}catch(e){}}
  return p||{};
}
function syncErrText(e){
  const c=e?.code;
  if(c==="server_not_connected")return "Tài khoản này chưa kết nối Gmail nhận dữ liệu (claude.ai → Settings → Connectors → Gmail).";
  if(c==="needs_reauth")return "Kết nối Gmail đã hết hạn — kết nối lại trong claude.ai → Settings → Connectors.";
  if(c==="not_in_manifest"||c==="approval_required"||c==="consent_required")return "Chưa cho phép app đọc Gmail. Bấm Đồng bộ ngay và chọn Allow.";
  if(c==="selection_required")return "Có nhiều kết nối Gmail — chọn một kết nối khi claude.ai hỏi.";
  if(c==="server_unavailable"||c==="rate_limited")return "Gmail tạm thời không phản hồi, thử lại sau ít phút.";
  return "Lỗi đồng bộ: "+(e?.message||c||"không rõ");
}
async function syncEmails(manual){
  if(syncing)return;
  if(!mcp||!db){$("#syncMsg").textContent="Chế độ xem này không đồng bộ được email.";return}
  syncing=true;const btn=$("#btnSync");btn.disabled=true;btn.textContent="Đang đồng bộ…";
  const st=$("#syncMsg");let nMsg=0,nOrd=0,nTk=0;
  try{
    const stDoc=db.doc("sync/gmail");
    const lookback=Number(settings.lookbackDays)||14;
    const since=syncState.lastSyncAt?new Date(Date.parse(syncState.lastSyncAt)-2*864e5):new Date(Date.now()-lookback*864e5);
    const q=`subject:CSD "CSD-BEGIN" after:${since.getFullYear()}/${since.getMonth()+1}/${since.getDate()}`;
    const done=new Set(syncState.processed||[]);
    const threads=[];let pageToken="";
    for(let page=0;page<20;page++){
      const r=await gmailCall("search_threads",{query:q,pageSize:50,view:"THREAD_VIEW_METADATA_ONLY",...(pageToken?{pageToken}:{})});
      threads.push(...(r.threads||[]));pageToken=r.nextPageToken||"";if(!pageToken)break;
    }
    const todo=threads.filter(t=>{const ids=(t.messages||[]).map(m=>m.id);const cnt=t.messageCount||ids.length;return !(cnt<=ids.length&&ids.length&&ids.every(id=>done.has(id)))});
    const msgs=[];
    for(let i=0;i<todo.length;i++){
      st.textContent=`Đang đọc email ${i+1}/${todo.length}…`;
      const th=await gmailCall("get_thread",{threadId:todo[i].id,messageFormat:"PLAIN_TEXT"});
      for(const m of th.messages||[])if(!done.has(m.id))msgs.push(m);
    }
    msgs.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const changed=new Map();
    for(const m of msgs){
      const p=parseCSD(m.plaintextBody||m.snippet||"");done.add(m.id);nMsg++;
      if(!p)continue;
      await ensureClient(p.shop,p.storeName);
      if(p.storeName&&clients[p.shop])clients[p.shop].lastEmailAt=m.date;
      const key=p.shop+"|"+p.orderName;
      const prev=changed.get(key)||orders.find(o=>orderKey(o)===key);
      const o=mergeOrder(prev,p,m.date||now());
      if(o)changed.set(key,o);
    }
    for(const o of changed.values()){
      await db.collection("orders").doc(orderDocId(o.client,o.orderName)).set(clean(o));nOrd++;
      nTk+=await applyOrderToTickets(o);
    }
    for(const k of new Set([...changed.values()].map(o=>o.client)))if(clients[k]?.lastEmailAt)await db.collection("clients").doc(safeId(k)).set(clean(clients[k])).catch(()=>{});
    syncState={lastSyncAt:now(),by:meId||"",processed:[...done].slice(-4000),lastResult:{messages:nMsg,orders:nOrd,tickets:nTk},error:""};
    await stDoc.set(syncState);
    await purgeOld();
    try{localStorage.setItem("csdAuto","1")}catch(e){}
    if(manual)toast(`Đã đồng bộ: ${nMsg} email mới · ${nOrd} đơn cập nhật · ${nTk} ticket cập nhật`);
  }catch(e){
    st.textContent=syncErrText(e);
    if(manual)toast(syncErrText(e));
    syncing=false;btn.disabled=false;btn.textContent="Đồng bộ ngay";return;
  }
  syncing=false;btn.disabled=false;btn.textContent="Đồng bộ ngay";renderSyncMsg();renderAll();
}
function renderSyncMsg(){
  const s=syncState;const el=$("#syncMsg");if(!el)return;
  if(!s.lastSyncAt){el.textContent="Chưa đồng bộ lần nào.";return}
  el.textContent=`Lần gần nhất: ${fmtDT(s.lastSyncAt)}${s.by?" bởi "+nameOf(s.by):""} · ${s.lastResult?.messages||0} email mới, ${s.lastResult?.orders||0} đơn, ${s.lastResult?.tickets||0} ticket cập nhật`;
}
$("#btnSync").addEventListener("click",()=>syncEmails(true));
let autoTimer=null;
function setupAuto(){
  let on=false;try{on=localStorage.getItem("csdAutoOn")!=="0"&&localStorage.getItem("csdAuto")==="1"}catch(e){}
  $("#autoSync").checked=on;clearInterval(autoTimer);
  if(on&&mcp){autoTimer=setInterval(()=>{if(!document.hidden)syncEmails(false)},180000);setTimeout(()=>syncEmails(false),4000)}
}
$("#autoSync").addEventListener("change",e=>{try{localStorage.setItem("csdAutoOn",e.target.checked?"1":"0");if(e.target.checked)localStorage.setItem("csdAuto","1")}catch(_){};setupAuto()});
/* cập nhật ticket theo đơn */
async function applyOrderToTickets(o){
  let n=0;
  for(const t of tickets.filter(t=>t.orderName===o.orderName&&(!t.client||t.client===o.client))){
    const x=clean(t);const notes=[];
    if(!x.client){x.client=o.client;notes.push("client")}
    for(const k of ["tracking","trackingUrl","carrier","customerEmail","country","orderId"])if(o[k]&&x[k]!==o[k]){x[k]=o[k];if(k==="tracking")notes.push("tracking "+o[k])}
    if(!x.customerName&&o.customerName)x.customerName=o.customerName;
    if(o.shipStatus&&x.shipStatus!==o.shipStatus){x.shipStatus=o.shipStatus;notes.push("giao hàng: "+lab(SHIP,o.shipStatus)[1])}
    if(JSON.stringify(x)!==JSON.stringify(t)){if(notes.length)addLog(x,"system","Shopify Flow cập nhật "+notes.join(", "));await saveTicket(x);n++}
  }
  return n;
}
/* xoá đơn cũ không có ticket để giữ dữ liệu gọn */
async function purgeOld(){
  const days=Number(settings.retentionDays)||90,cut=new Date(Date.now()-days*864e5).toISOString();
  const old=orders.filter(o=>(o.orderDate||o.updatedAt||"")<cut&&!ticketFor(o)).slice(0,200);
  for(const o of old)await db.collection("orders").doc(orderDocId(o.client,o.orderName)).delete().catch(()=>{});
}
async function syncTracking(){
  let list=tickets.filter(t=>selected.has(t.id));
  if(!list.length)list=tickets.filter(t=>isActive(t)&&!t.tracking&&inClient(t));
  list=list.filter(t=>t.orderName);let upd=0;
  for(const t of list){const o=orders.find(o=>o.orderName===t.orderName&&(!t.client||o.client===t.client));if(o)upd+=await applyOrderToTickets(o)}
  toast(list.length?`Đã cập nhật ${upd}/${list.length} ticket từ dữ liệu đơn`+(upd<list.length?" — đơn chưa có tracking thì chưa cập nhật":""):"Không có ticket nào cần lấy tracking");
}
function parseCSV(text){
  const rows=[];let row=[],f="",q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===","){row.push(f);f=""}
    else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(f);rows.push(row);row=[];f=""}
    else f+=c}
  if(f||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()));
}
const norm=s=>s.toLowerCase().replace(/[^a-z]/g,"");
const HMAP={orderName:["ordernumber","ordername","name","order"],orderId:["orderid","id"],tracking:["trackingnumber","tracking","trackingno"],customerEmail:["customeremail","email"],
  customerName:["customername","customer","shippingname"],supplier:["suppliers","supplier"],carrier:["shippingcarrier","carrier"],country:["shippingcountry","country"],
  orderDate:["dateorder","createdat","orderdate","date"],statusOrder:["statusorder","status"],total:["total","totalprice"]};
$("#csvFile").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  const client=$("#csvClient").value;
  if(!client){$("#csvMsg").textContent="Chọn client của file trước.";e.target.value="";return}
  const rows=parseCSV(await file.text());if(rows.length<2){$("#csvMsg").textContent="File trống";return}
  const head=rows[0].map(norm),idx={};
  for(const [k,alts] of Object.entries(HMAP)){for(const a of alts){const i=head.indexOf(a);if(i>=0){idx[k]=i;break}}}
  if(idx.orderName==null&&idx.orderId==null){$("#csvMsg").textContent="Không tìm thấy cột mã đơn (Order Number / OrderID)";return}
  let nOrd=0,nTk=0;$("#csvMsg").textContent="Đang nhập…";
  for(const r of rows.slice(1)){
    const g=k=>idx[k]!=null?(r[idx[k]]||"").trim():"";
    let name=g("orderName")||g("orderId");if(!name)continue;
    const prev=orders.find(o=>o.client===client&&(o.orderName===name||o.orderName==="#"+name));if(prev)name=prev.orderName;
    const st=g("statusOrder").toLowerCase();
    const o={...(prev||{}),client,orderName:name};
    for(const k of ["orderId","tracking","customerEmail","customerName","supplier","carrier","country","orderDate","total"])if(g(k)&&!o[k]||k==="supplier"&&g(k))o[k]=g(k)||o[k];
    const ship=st.includes("undeliver")?"undelivered":st.includes("deliver")?"delivered":st.includes("transit")?"transit":"";
    if(ship&&!o.shipRaw)o.shipStatus=ship;
    o.updatedAt=now();o.source=o.source||"csv";
    await db.collection("orders").doc(orderDocId(client,name)).set(clean(o));nOrd++;
    if($("#csvUpdate").checked)nTk+=await applyOrderToTickets(o);
  }
  $("#csvMsg").textContent=`Đã nhập ${nOrd} đơn cho ${clientName(client)}`+(nTk?` · cập nhật ${nTk} ticket`:"");
  e.target.value="";
});
function ticketFor(o){return tickets.find(t=>t.orderName===o.orderName&&(!t.client||t.client===o.client))}
const oNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d");
function filteredOrders(){
  const terms=oNorm($("#oSearch").value).split(/[,;\n]+/).map(s=>s.trim().replace(/^#/,"")).filter(Boolean);
  const ft=$("#oFTicket").value,fr=$("#oFTrack").value,ff=$("#oFFin").value,fs=$("#oFShip").value,df=$("#oFrom").value,dt=$("#oTo").value;
  return orders.filter(o=>{
    if(!inClient(o))return false;
    const d=(o.orderDate||"").slice(0,10);if(df&&d<df||dt&&d>dt)return false;
    if(ft){const t=!!ticketFor(o);if(ft==="has"&&!t||ft==="none"&&t)return false}
    if(fr==="yes"&&!o.tracking||fr==="no"&&o.tracking)return false;
    if(ff&&o.financial!==ff)return false;
    if(fs&&(fs==="__none"?o.shipStatus:o.shipStatus!==fs))return false;
    if(terms.length){const hay=oNorm([o.orderName,o.orderId,o.customerName,o.customerEmail,o.tracking,o.carrier,o.supplier,o.country].join(" "));if(!terms.some(q=>hay.includes(q)))return false}
    return true;
  }).sort((a,b)=>(b.orderDate||"").localeCompare(a.orderDate||""));
}
let oLimit=300;
function renderOrders(){
  const pool=orders.filter(inClient);
  const fin=[...new Set(pool.map(o=>o.financial).filter(Boolean))].sort(),fsel=$("#oFFin"),fv=fsel.value;
  fsel.innerHTML='<option value="">Mọi thanh toán</option>'+fin.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join("");fsel.value=fin.includes(fv)?fv:"";
  const shs=$("#oFShip"),sv=shs.value;shs.innerHTML='<option value="">Mọi trạng thái giao</option><option value="__none">Chưa có cập nhật</option>'+SHIP.filter(x=>x[0]).map(x=>`<option value="${x[0]}">${x[1]}</option>`).join("");shs.value=sv;
  const list=filteredOrders(),isF=list.length!==pool.length;
  $("#oCount").textContent=isF?`${list.length} / ${pool.length} đơn`:pool.length+" đơn";$("#oEmpty").style.display=pool.length?"none":"";
  const shown=list.slice(0,oLimit);
  $("#oSelAll").checked=shown.length&&shown.filter(o=>!ticketFor(o)).every(o=>oSelected.has(orderKey(o)))&&shown.some(o=>!ticketFor(o));
  if(pool.length&&!list.length){$("#oBody").innerHTML=`<tr style="cursor:default"><td colspan="10" class="empty">Không có đơn nào khớp bộ lọc.</td></tr>`;$("#btnBulkCreate").disabled=!oSelected.size;return}
  $("#oBody").innerHTML=shown.map(o=>{const t=ticketFor(o),k=orderKey(o);return `<tr data-ok="${esc(k)}">
    <td data-stop><input type="checkbox" class="oSel" data-ok="${esc(k)}" ${oSelected.has(k)?"checked":""} ${t?"disabled":""}></td>
    <td style="font-size:12.5px">${esc(clientName(o.client))}</td>
    <td><strong>${esc(o.orderName)}</strong></td><td class="muted">${fmtD(o.orderDate)}</td><td>${esc(o.customerName)}<div class="muted" style="font-size:12px">${esc(o.customerEmail)}</div></td>
    <td>${o.financial?`<span class="pill ${o.financial==="PAID"?"s-done":o.financial.includes("REFUND")?"s-bad":"s-wait"}">${esc(o.financial)}</span>`:""}</td>
    <td>${o.fulfillment?`<span class="pill ${o.fulfillment==="FULFILLED"?"s-done":"s-open"}">${esc(o.fulfillment)}</span>`:""}</td>
    <td>${o.shipStatus?`<span class="pill ${lab(SHIP,o.shipStatus)[2]}" title="${esc(o.shipRaw||"")}${o.shipAt?" · "+fmtDT(o.shipAt):""}">${lab(SHIP,o.shipStatus)[1]}</span>`:'<span class="muted">—</span>'}</td>
    <td class="mono">${o.tracking?o.tracking.split(/,\s*/).map(n=>`<a href="${track17([n])}" target="_blank" rel="noopener" data-stop>${esc(n)}</a>`).join("<br>"):`<span class="muted" style="font-family:inherit">${o.fulfillment&&o.fulfillment!=="FULFILLED"?"Chưa fulfill":"—"}</span>`}</td>
    <td>${t?`<a href="#tickets" data-open="${t.id}">${lab(STATUSES,t.status)[1]}</a>`:`<button class="btn sm" data-create="${esc(k)}">Tạo ticket</button>`}</td></tr>`}).join("")+
    (list.length>shown.length?`<tr style="cursor:default"><td colspan="10" class="empty">Đang hiện ${shown.length}/${list.length} đơn. <button class="btn sm" id="oMore">Hiện thêm</button></td></tr>`:"");
  $("#btnBulkCreate").disabled=!oSelected.size;
}
$("#oBody").addEventListener("change",e=>{if(e.target.classList.contains("oSel")){e.target.checked?oSelected.add(e.target.dataset.ok):oSelected.delete(e.target.dataset.ok);$("#btnBulkCreate").disabled=!oSelected.size}});
["#oSearch","#oFTicket","#oFTrack","#oFFin","#oFShip","#oFrom","#oTo"].forEach(s=>$(s).addEventListener("input",()=>{oLimit=300;renderOrders()}));
$("#oSearch").addEventListener("keydown",e=>{if(e.key==="Escape"){e.target.value="";renderOrders()}});
$("#oSelAll").addEventListener("change",e=>{filteredOrders().slice(0,oLimit).forEach(o=>{if(!ticketFor(o))e.target.checked?oSelected.add(orderKey(o)):oSelected.delete(orderKey(o))});renderOrders()});
async function createFromOrder(o,type){const t=newTicket({...o,type});await saveTicket(t);return t}
$("#oBody").addEventListener("click",async e=>{
  if(e.target.closest("[data-stop]"))return;
  if(e.target.closest("#oMore")){oLimit+=300;renderOrders();return}
  const c=e.target.closest("[data-create]");const op=e.target.closest("[data-open]");
  if(c){const o=orders.find(x=>orderKey(x)===c.dataset.create);if(!o)return;c.disabled=true;const t=await createFromOrder(o,$("#bulkType").value);toast("Đã tạo ticket "+o.orderName);location.hash="#tickets";setTimeout(()=>openTicket(t.id,t),50)}
  if(op){setTimeout(()=>openTicket(op.dataset.open),50)}
});
$("#btnBulkCreate").addEventListener("click",async()=>{
  const ty=$("#bulkType").value;let n=0;$("#btnBulkCreate").disabled=true;
  for(const k of oSelected){const o=orders.find(x=>orderKey(x)===k);if(o&&!ticketFor(o)){await createFromOrder(o,ty);n++}}
  oSelected.clear();toast(`Đã tạo ${n} ticket`);renderOrders();
});
