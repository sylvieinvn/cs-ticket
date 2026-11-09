/* Ticket list view: filters, table, selection */
/* ---------- TICKET LIST ---------- */
function fillSelects(){
  $("#fType").innerHTML='<option value="">Mọi loại vấn đề</option>'+TYPES.map(t=>`<option>${esc(t)}</option>`).join("");
  $("#fShip").innerHTML='<option value="">Mọi trạng thái giao</option>'+SHIP.map(s=>`<option value="${s[0]||"__unchecked"}">${s[1]}</option>`).join("");
  $("#fDispute").innerHTML='<option value="">Mọi tranh chấp</option>'+DISPUTE.map(s=>`<option value="${s[0]}">${s[1]}</option>`).join("");
  $("#fSent").innerHTML='<option value="">Mọi thái độ KH</option>'+SENT.filter(s=>s[0]).map(s=>`<option value="${s[0]}">${s[1]}</option>`).join("");
  $("#bulkType").innerHTML=TYPES.map(t=>`<option>${esc(t)}</option>`).join("");
}
function agentOptions(sel,extra){
  const ids=[...new Set(tickets.map(t=>t.assignee).filter(Boolean))];
  if(meId&&!ids.includes(meId))ids.unshift(meId);
  const cur=sel.value;
  sel.innerHTML=extra+ids.map(i=>`<option value="${esc(i)}">${esc(nameOf(i))}</option>`).join("");
  sel.value=cur;
}
function filtered(){
  const ch=$("#fChannel").value,se=$("#fSent").value;
  const q=$("#q").value.trim().toLowerCase(),ty=$("#fType").value,sh=$("#fShip").value,di=$("#fDispute").value,ag=$("#fAgent").value,od=$("#fOverdue").checked;
  return tickets.filter(t=>{
    if(!inClient(t))return false;
    if(statusTab==="active"&&!isActive(t))return false;
    if(statusTab!=="active"&&statusTab!=="all"&&t.status!==statusTab)return false;
    if(ty&&t.type!==ty)return false;
    if(ch&&(t.channel||"email")!==ch)return false;
    if(se&&t.summary?.sentiment!==se)return false;
    if(sh&&(sh==="__unchecked"?t.shipStatus:t.shipStatus!==sh))return false;
    if(di&&t.dispute!==di)return false;
    if(ag==="__me"&&t.assignee!==meId)return false;
    if(ag==="__none"&&t.assignee)return false;
    if(ag&&!ag.startsWith("__")&&t.assignee!==ag)return false;
    if(od&&!slaState(t).overdue)return false;
    if(q&&![t.orderName,t.customerEmail,t.customerName,t.tracking,t.supplier,t.carrier].join(" ").toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>{const x=sortKey==="assignee"?nameOf(a.assignee):a[sortKey]||"",y=sortKey==="assignee"?nameOf(b.assignee):b[sortKey]||"";return x>y?sortDir:x<y?-sortDir:0});
}
function renderTabs(){
  const pool=tickets.filter(inClient);
  const c=k=>k==="active"?pool.filter(isActive).length:k==="all"?pool.length:pool.filter(t=>t.status===k).length;
  const tabs=[["active","Đang mở"],...STATUSES.map(s=>[s[0],s[1]]),["all","Tất cả"]];
  $("#statusTabs").innerHTML=tabs.map(([k,l])=>`<button data-k="${k}" class="${k===statusTab?"on":""}">${l} · ${c(k)}</button>`).join("");
  $("#nOpen").textContent=c("active");
}
function renderTickets(){
  renderTabs();agentOptions($("#fAgent"),'<option value="">Mọi nhân viên</option><option value="__me">Của tôi</option><option value="__none">Chưa phân công</option>');
  const rows=filtered();
  $("#tEmpty").style.display=tickets.length?"none":"";
  $("#tBody").innerHTML=rows.map(t=>{
    const st=lab(STATUSES,t.status),sh=lab(SHIP,t.shipStatus),dp=lab(DISPUTE,t.dispute),sla=slaState(t);
    return `<tr data-id="${t.id}">
      <td data-stop><input type="checkbox" class="rowSel" data-id="${t.id}" ${selected.has(t.id)?"checked":""}></td>
      <td><strong>${esc(t.orderName||"—")}</strong>${t.priority==="urgent"||t.priority==="high"?` <span class="flag">${t.priority==="urgent"?"Khẩn":"Cao"}</span>`:""}${!curClient&&t.client?`<div class="muted" style="font-size:12px">${esc(clientName(t.client))}</div>`:""}</td>
      <td>${esc(t.customerName)}<div class="muted" style="font-size:12px">${esc(t.customerEmail)}</div></td>
      <td>${esc(t.type)}<div class="muted" style="font-size:12px">${lab(CHANNELS,t.channel||"email")[1]}${t.summary?.sentiment?` · <span class="pill ${lab(SENT,t.summary.sentiment)[2]}" style="font-size:11px;padding:0 7px">${lab(SENT,t.summary.sentiment)[1]}</span>`:""}</div></td>
      <td><span class="pill ${st[2]}">${st[1]}</span></td>
      <td><span class="pill ${sh[2]}">${sh[1]}</span></td>
      <td class="mono">${t.tracking?`<a href="${track17([t.tracking])}" target="_blank" rel="noopener" data-stop>${esc(t.tracking)}</a>`:'<span class="muted">—</span>'}</td>
      <td>${t.dispute==="none"?'<span class="muted">—</span>':`<span class="pill ${dp[2]}">${dp[1]}</span>`}</td>
      <td>${esc(nameOf(t.assignee))||'<span class="muted">—</span>'}</td>
      <td class="muted" style="font-size:12.5px">${fmtDT(t.createdAt)}</td>
      <td>${isActive(t)?(sla.overdue?'<span class="flag">Quá hạn</span>':'<span class="muted">OK</span>'):(sla.resBreach?'<span class="muted">Trễ</span>':'<span class="pill s-done">Đúng hạn</span>')}</td>
    </tr>`}).join("");
  if(tickets.length&&!rows.length)$("#tBody").innerHTML='<tr><td colspan="11" class="empty">Không có ticket khớp bộ lọc.</td></tr>';
  $("#selAll").checked=rows.length&&rows.every(t=>selected.has(t.id));
}
$("#statusTabs").addEventListener("click",e=>{const b=e.target.closest("button");if(b){statusTab=b.dataset.k;renderTickets()}});
["#q","#fChannel","#fSent","#fType","#fShip","#fDispute","#fAgent","#fOverdue"].forEach(s=>$(s).addEventListener("input",renderTickets));
document.querySelectorAll("#v-tickets th[data-s]").forEach(th=>th.addEventListener("click",()=>{const k=th.dataset.s;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}renderTickets()}));
$("#tBody").addEventListener("click",e=>{if(e.target.closest("[data-stop]"))return;const tr=e.target.closest("tr[data-id]");if(tr)openTicket(tr.dataset.id)});
$("#tBody").addEventListener("change",e=>{if(e.target.classList.contains("rowSel")){e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id)}});
$("#selAll").addEventListener("change",e=>{filtered().forEach(t=>e.target.checked?selected.add(t.id):selected.delete(t.id));renderTickets()});
$("#btn17").addEventListener("click",()=>{
  const nums=tickets.filter(t=>selected.has(t.id)&&t.tracking).map(t=>t.tracking);
  if(!nums.length)return toast("Chọn ticket có tracking trước");
  const chunks=[];for(let i=0;i<nums.length;i+=40)chunks.push(nums.slice(i,i+40));
  const a=document.createElement("a");a.href=track17(chunks[0]);a.target="_blank";a.rel="noopener";a.click();
  if(chunks.length>1)toast(`17Track tối đa 40 mã/lần — đã mở 40 mã đầu`);
});
$("#btnSyncTr").addEventListener("click",syncTracking);
$("#btnNew").addEventListener("click",async()=>{const t=newTicket();if(!db){tickets.push(t)}await saveTicket(t);openTicket(t.id,t)});
