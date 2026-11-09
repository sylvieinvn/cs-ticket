/* Settings view */
/* ---------- SETTINGS ---------- */
function renderSettings(){
  const ae=document.activeElement;if(ae&&$("#v-settings").contains(ae)&&ae.tagName==="INPUT")return;
  $("#setFrt").value=settings.frtHours;$("#setRes").value=settings.resHours;$("#setCur").value=settings.currency;
  $("#setLookback").value=settings.lookbackDays||14;$("#setRetention").value=settings.retentionDays||90;
  const keys=Object.keys(clients).sort((a,b)=>clientName(a).localeCompare(clientName(b)));
  $("#clBody").innerHTML=keys.length?keys.map(k=>{const c=clients[k];return `<tr data-cl="${esc(k)}" style="cursor:default">
    <td><input type="text" data-k="name" value="${esc(c.name||"")}" style="width:100%"></td><td class="muted mono">${esc(k)}</td>
    <td><input type="number" data-k="frtHours" value="${esc(c.frtHours||"")}" placeholder="${settings.frtHours}" style="width:90px"></td>
    <td><input type="number" data-k="resHours" value="${esc(c.resHours||"")}" placeholder="${settings.resHours}" style="width:90px"></td>
    <td>${orders.filter(o=>o.client===k).length}</td><td>${tickets.filter(t=>t.client===k&&isActive(t)).length}</td><td class="muted">${fmtDT(c.lastEmailAt)}</td></tr>`}).join(""):'<tr><td colspan="7" class="empty">Chưa có client. Client xuất hiện sau lần đồng bộ email đầu tiên.</td></tr>';
  $("#usageMsg").textContent=`Đang lưu ${tickets.length} ticket, ${orders.length} đơn, ${keys.length} client (giới hạn khoảng 25.000 bản ghi).`;
}
async function saveSettings(patch){
  settings={...settings,...patch};
  if(db){try{await db.doc("config/settings").set(settings);toast("Đã lưu cài đặt")}catch(e){toast("Không lưu được — cần quyền chỉnh sửa")}}
  renderAll();
}
$("#btnSaveSet").addEventListener("click",()=>saveSettings({frtHours:Number($("#setFrt").value)||24,resHours:Number($("#setRes").value)||72,currency:$("#setCur").value.trim()||"USD"}));
$("#btnSaveSync").addEventListener("click",()=>saveSettings({lookbackDays:Math.min(60,Number($("#setLookback").value)||14),retentionDays:Math.max(30,Number($("#setRetention").value)||90)}));
$("#btnSaveClients").addEventListener("click",async()=>{
  for(const tr of document.querySelectorAll("#clBody tr[data-cl]")){
    const k=tr.dataset.cl,c={...clients[k]};
    tr.querySelectorAll("input[data-k]").forEach(i=>{const v=i.value.trim();c[i.dataset.k]=i.type==="number"?(v?Number(v):""):v});
    if(!c.name)c.name=k.replace(/\.myshopify\.com$/,"");
    if(JSON.stringify(c)!==JSON.stringify(clients[k])){clients[k]=c;if(db)await db.collection("clients").doc(safeId(k)).set(clean(c)).catch(()=>toast("Không lưu được client"))}
  }
  toast("Đã lưu client");renderAll();
});
$("#btnBackup").addEventListener("click",()=>{
  const data=JSON.stringify({exportedAt:now(),settings,clients,tickets,orders},null,1);
  saveFile(`cs-ticket-backup_${new Date().toISOString().slice(0,10)}.json`,data);
});
