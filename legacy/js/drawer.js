/* Ticket detail drawer */
/* ---------- DRAWER ---------- */
function openTicket(id,fallback){
  openId=id;const t=tickets.find(x=>x.id===id)||fallback;if(!t)return;
  $("#ov").classList.add("on");$("#dr").classList.add("on");renderDrawer(t);
}
function closeDrawer(){openId=null;$("#ov").classList.remove("on");$("#dr").classList.remove("on")}
$("#ov").onclick=closeDrawer;$("#dClose").onclick=closeDrawer;
$("#dDel").onclick=async()=>{if(!openId)return;if(await confirmBox("Xoá ticket này? Không thể hoàn tác.")){const id=openId;closeDrawer();await deleteTicket(id);toast("Đã xoá ticket")}};
const opt=(arr,v)=>arr.map(a=>Array.isArray(a)?`<option value="${a[0]}" ${a[0]===v?"selected":""}>${a[1]}</option>`:`<option ${a===v?"selected":""}>${esc(a)}</option>`).join("");
function renderDrawer(t){
  const sla=slaState(t);
  const qaScore=QA.filter(q=>t.qa?.[q[0]]).length;
  $("#dTitle").textContent=(t.orderName||"Ticket mới")+(t.customerName?" · "+t.customerName:"");
  const ids=[...new Set([meId,...tickets.map(x=>x.assignee)].filter(Boolean))];
  $("#dBody").innerHTML=`
  <div class="bar">
    <span class="pill ${lab(STATUSES,t.status)[2]}">${lab(STATUSES,t.status)[1]}</span>
    <span class="muted" style="font-size:12.5px">Phản hồi đầu: <b>${fmtH(sla.frtH)}</b>${t.firstResponseAt?"":" (chưa)"} · Giải quyết: <b>${t.resolvedAt?fmtH(sla.resH):"–"}</b></span>
    ${sla.overdue?'<span class="flag">Quá SLA</span>':""}
  </div>
  <div class="sect">Xử lý</div>
  <div class="fgrid">
    <label>Trạng thái<select data-f="status">${opt(STATUSES.map(s=>[s[0],s[1]]),t.status)}</select></label>
    <label>Client<select data-f="client"><option value="">— Chưa gán —</option>${Object.keys(clients).map(k=>`<option value="${esc(k)}" ${k===t.client?"selected":""}>${esc(clientName(k))}</option>`).join("")}</select></label>
    <label>Loại vấn đề<select data-f="type">${opt(TYPES,t.type)}</select></label>
    <label>Ưu tiên<select data-f="priority">${opt(PRIORITY,t.priority)}</select></label>
    <label>Kênh liên hệ<select data-f="channel">${opt(CHANNELS,t.channel||"email")}</select></label>
    <label>Thái độ khách<select data-sf="sentiment">${opt(SENT.map(s=>[s[0],s[1]]),t.summary?.sentiment||"")}</select></label>
    <label>Phụ trách<select data-f="assignee"><option value="">— Chưa phân công —</option>${ids.map(i=>`<option value="${esc(i)}" ${i===t.assignee?"selected":""}>${esc(nameOf(i))}</option>`).join("")}</select></label>
  </div>
  <div class="sect">Tóm tắt trao đổi với khách</div>
  ${t.summary?.issue||t.summary?.done||t.summary?.next?`<div class="panel" style="padding:12px 14px;margin-bottom:10px;font-size:13px">
    <div><b>Vấn đề:</b> ${esc(t.summary.issue||"—")}</div>
    <div><b>CS đã làm:</b> ${esc(t.summary.done||"—")}</div>
    <div><b>Đang chờ:</b> ${lab(WAITING,t.summary.waitingOn||"")[1]} · <b>Bước tiếp theo:</b> ${esc(t.summary.next||"—")}</div>
    <div class="muted" style="margin-top:4px;font-size:12px">${t.summary.msgCount?t.summary.msgCount+" tin nhắn · ":""}Cập nhật ${fmtDT(t.summary.updatedAt)}${t.summary.suggestType&&t.summary.suggestType!==t.type?` · AI gợi ý loại: <a href="#" id="applyType">${esc(t.summary.suggestType)}</a>`:""}</div>
  </div>`:'<p class="muted" style="font-size:13px;margin:0 0 8px">Chưa có tóm tắt.</p>'}
  <textarea id="convoText" placeholder="Dán nội dung chat Shopify Inbox hoặc chuỗi email với khách vào đây…" style="min-height:90px"></textarea>
  <div class="bar" style="margin-top:8px">
    <button class="btn primary sm" id="btnSumm" ${sample?"":"disabled title='AI chưa sẵn sàng ở chế độ xem này'"}>Tóm tắt bằng AI</button>
    <span class="muted" id="summMsg" style="font-size:12.5px">Chỉ lưu bản tóm tắt, không lưu nội dung gốc.</span>
  </div>
  <div class="sect">Đơn hàng</div>
  <div class="fgrid">
    <label>Mã đơn<input type="text" data-f="orderName" value="${esc(t.orderName)}"></label>
    <label>Ngày đặt<input type="date" data-f="orderDate" value="${esc((t.orderDate||"").slice(0,10))}"></label>
    <label>Khách hàng<input type="text" data-f="customerName" value="${esc(t.customerName)}"></label>
    <label>Email<input type="text" data-f="customerEmail" value="${esc(t.customerEmail)}"></label>
    <label>Giá trị đơn<input type="text" data-f="total" value="${esc(t.total)}"></label>
    <label>Quốc gia<input type="text" data-f="country" value="${esc(t.country)}"></label>
  </div>
  <div class="sect">Vận chuyển</div>
  <div class="fgrid">
    <label>Tracking number<input type="text" data-f="tracking" value="${esc(t.tracking)}" class="mono"></label>
    <label>Trạng thái giao (từ 17Track)<select data-f="shipStatus">${opt(SHIP.map(s=>[s[0],s[1]]),t.shipStatus)}</select></label>
    <label>Carrier<input type="text" data-f="carrier" value="${esc(t.carrier)}"></label>
    <label>Supplier<input type="text" data-f="supplier" value="${esc(t.supplier)}"></label>
    <label class="full">${t.tracking?`<a href="${track17([t.tracking])}" target="_blank" rel="noopener" class="btn sm" style="align-self:flex-start;text-decoration:none;display:inline-block">Mở trên 17Track ↗</a>${t.trackingUrl&&/^https:\/\//.test(t.trackingUrl)?` <a href="${esc(t.trackingUrl)}" target="_blank" rel="noopener" class="btn sm" style="text-decoration:none;display:inline-block">Trang tracking của supplier ↗</a>`:""}`:'<span class="muted">Nhập tracking để tra trên 17Track</span>'}</label>
  </div>
  <div class="sect">Tranh chấp &amp; kết quả</div>
  <div class="fgrid">
    <label>Tranh chấp / chargeback<select data-f="dispute">${opt(DISPUTE.map(s=>[s[0],s[1]]),t.dispute)}</select></label>
    <label>Lý do tranh chấp<input type="text" data-f="disputeReason" value="${esc(t.disputeReason)}" placeholder="vd: Item not received"></label>
    <label>Cách giải quyết<select data-f="resolution">${opt(RESOLUTIONS.map(r=>[r,r||"— Chưa có —"]),t.resolution)}</select></label>
    <label>Số tiền hoàn (${esc(t.currency||settings.currency)})<input type="number" step="0.01" data-f="refundAmount" value="${esc(t.refundAmount||0)}"></label>
  </div>
  <div class="sect">Đánh giá chất lượng</div>
  <div class="fgrid">
    <label>CSAT khách hàng chấm
      <div class="stars" id="stars">${[1,2,3,4,5].map(n=>`<button data-n="${n}" class="${n<=t.csat?"on":""}">★</button>`).join("")}${t.csat?` <button data-n="0" style="font-size:12px;color:var(--muted)">xoá</button>`:""}</div>
    </label>
    <label>Điểm QA nội bộ: <b style="color:var(--ink)">${qaScore}/5</b>${t.qaBy?` <span>— chấm bởi ${esc(nameOf(t.qaBy))}</span>`:""}
      <div class="qa">${QA.map(q=>`<label><input type="checkbox" data-qa="${q[0]}" ${t.qa?.[q[0]]?"checked":""}> ${q[1]}</label>`).join("")}</div>
    </label>
  </div>
  <div class="sect">Trao đổi &amp; ghi chú</div>
  <textarea id="noteText" placeholder="Nội dung đã gửi khách, hoặc ghi chú nội bộ…"></textarea>
  <div class="bar" style="margin-top:8px">
    <button class="btn primary sm" id="addReply">Ghi nhận đã phản hồi khách</button>
    <button class="btn sm" id="addNote">Thêm ghi chú nội bộ</button>
  </div>
  <div class="log">${(t.log||[]).slice().reverse().map(l=>`<div class="e ${l.kind}"><div class="m">${fmtDT(l.at)} · ${esc(nameOf(l.by)||"Hệ thống")}${l.kind==="reply"?" · đã phản hồi KH":l.kind==="note"?" · ghi chú":""}</div><div class="t">${esc(l.text)}</div></div>`).join("")}</div>`;

  const cur=()=>clean(tickets.find(x=>x.id===t.id)||t);
  $("#dBody").querySelectorAll("[data-f]").forEach(el=>el.addEventListener("change",async()=>{
    const x=cur(),f=el.dataset.f;let v=el.value;
    if(f==="refundAmount")v=Number(v)||0;
    if(f==="status")setStatus(x,v);
    else{
      if(f==="assignee")addLog(x,"system","Phân công: "+(nameOf(v)||"bỏ phân công"));
      if(f==="shipStatus")addLog(x,"system","Trạng thái giao: "+lab(SHIP,v)[1]);
      if(f==="dispute")addLog(x,"system","Tranh chấp: "+lab(DISPUTE,v)[1]);
      if(f==="resolution"&&v)addLog(x,"system","Giải quyết: "+v);
      x[f]=v;
    }
    await saveTicket(x);if(!db)renderDrawer(x);
  }));
  $("#dBody").querySelectorAll("[data-sf]").forEach(el=>el.addEventListener("change",async()=>{const x=cur();x.summary={...(x.summary||{}),[el.dataset.sf]:el.value,updatedAt:now()};addLog(x,"system","Thái độ KH: "+lab(SENT,el.value)[1]);await saveTicket(x);if(!db)renderDrawer(x)}));
  const at=$("#applyType");if(at)at.onclick=async e=>{e.preventDefault();const x=cur();addLog(x,"system","Loại vấn đề: "+x.summary.suggestType);x.type=x.summary.suggestType;await saveTicket(x);if(!db)renderDrawer(x)};
  $("#btnSumm").onclick=()=>summarize(t.id);
  $("#stars").addEventListener("click",async e=>{e.preventDefault();const b=e.target.closest("button");if(!b)return;const x=cur();x.csat=Number(b.dataset.n);addLog(x,"system","CSAT: "+(x.csat||"xoá"));await saveTicket(x);if(!db)renderDrawer(x)});
  $("#dBody").querySelectorAll("[data-qa]").forEach(el=>el.addEventListener("change",async()=>{const x=cur();x.qa=x.qa||{};x.qa[el.dataset.qa]=el.checked;x.qaBy=meId||"";await saveTicket(x);if(!db)renderDrawer(x)}));
  const add=kind=>async()=>{const txt=$("#noteText").value.trim();if(!txt)return toast("Nhập nội dung trước");const x=cur();addLog(x,kind,txt);
    if(kind==="reply"){if(!x.firstResponseAt)x.firstResponseAt=now();if(x.status==="new")setStatus(x,"open");}
    await saveTicket(x);if(!db)renderDrawer(x)};
  $("#addReply").onclick=add("reply");$("#addNote").onclick=add("note");
}
