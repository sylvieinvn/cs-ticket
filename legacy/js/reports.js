/* Reports & analytics view */
/* ---------- REPORTS ---------- */
function rangeInit(days){const t=new Date(),f=new Date();if(days==="month")f.setDate(1);else f.setDate(t.getDate()-days+1);$("#rFrom").value=f.toISOString().slice(0,10);$("#rTo").value=t.toISOString().slice(0,10)}
document.querySelectorAll("[data-range]").forEach(b=>b.addEventListener("click",()=>{rangeInit(b.dataset.range==="month"?"month":Number(b.dataset.range));renderReports()}));
["#rFrom","#rTo","#rAgent"].forEach(s=>$(s).addEventListener("change",renderReports));
function repSet(){
  const f=$("#rFrom").value,t=$("#rTo").value,a=$("#rAgent").value;
  return tickets.filter(x=>{const d=(x.createdAt||"").slice(0,10);return inClient(x)&&(!f||d>=f)&&(!t||d<=t)&&(!a||x.assignee===a)});
}
function stats(set){
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const responded=set.filter(t=>t.firstResponseAt),resolved=set.filter(t=>t.resolvedAt);
  const frt=responded.map(t=>hrs(t.createdAt,t.firstResponseAt)),res=resolved.map(t=>hrs(t.createdAt,t.resolvedAt));
  const frtOk=responded.filter(t=>hrs(t.createdAt,t.firstResponseAt)<=slaFor(t).frt).length,resOk=resolved.filter(t=>hrs(t.createdAt,t.resolvedAt)<=slaFor(t).res).length;
  const csat=set.filter(t=>t.csat>0).map(t=>t.csat);
  const qa=set.filter(t=>t.qa&&Object.keys(t.qa).length).map(t=>QA.filter(q=>t.qa[q[0]]).length/5*100);
  return {total:set.length,open:set.filter(isActive).length,resolved:resolved.length,
    frt:avg(frt),res:avg(res),frtSla:frt.length?frtOk/frt.length*100:null,
    resSla:res.length?resOk/res.length*100:null,
    csat:avg(csat),csatN:csat.length,csatPos:csat.length?csat.filter(v=>v>=4).length/csat.length*100:null,qa:avg(qa),qaN:qa.length,
    refund:set.reduce((s,t)=>s+(Number(t.refundAmount)||0),0),disputes:set.filter(t=>t.dispute!=="none").length,
    won:set.filter(t=>t.dispute==="won").length,lost:set.filter(t=>t.dispute==="lost").length,overdue:set.filter(t=>slaState(t).overdue).length};
}
const pct=v=>v==null?"–":Math.round(v)+"%";
function hbars(el,pairs){const max=Math.max(1,...pairs.map(p=>p[1]));el.innerHTML=pairs.length?pairs.map(([l,v])=>`<div class="hbar"><span title="${esc(l)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l)}</span><div class="track"><div class="fill" style="width:${v/max*100}%"></div></div><b>${v}</b></div>`).join(""):'<div class="muted">Chưa có dữ liệu</div>'}
function countBy(set,fn){const m=new Map();set.forEach(t=>{const k=fn(t);if(k)m.set(k,(m.get(k)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1])}
function renderReports(){
  agentOptions($("#rAgent"),'<option value="">Toàn đội</option>');
  const set=repSet(),s=stats(set),cur=settings.currency;
  const K=[["Tổng ticket",s.total,`${s.open} đang mở · ${s.overdue} quá SLA`],["Đã giải quyết",s.resolved,s.total?pct(s.resolved/s.total*100)+" tổng số":""],
    ["TG phản hồi đầu TB",fmtH(s.frt),`Đúng SLA: ${pct(s.frtSla)}`],["TG giải quyết TB",fmtH(s.res),`Đúng SLA: ${pct(s.resSla)}`],
    ["CSAT trung bình",s.csat==null?"–":s.csat.toFixed(2)+"/5",`${s.csatN} đánh giá · ${pct(s.csatPos)} hài lòng (4–5★)`],["Điểm QA nội bộ",pct(s.qa),`${s.qaN} ticket đã chấm`],
    ["Tiền hoàn",money(s.refund)+" "+cur,""],["Tranh chấp",s.disputes,`Thắng ${s.won} · Thua ${s.lost}`]];
  $("#kpis").innerHTML=K.map(k=>`<div class="panel kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="h">${k[2]}</div></div>`).join("");
  // per day
  const f=$("#rFrom").value,t=$("#rTo").value;const days=[];
  if(f&&t){for(let d=new Date(f);d<=new Date(t)&&days.length<120;d.setDate(d.getDate()+1))days.push(d.toISOString().slice(0,10))}
  const byDay=new Map();set.forEach(x=>{const d=x.createdAt.slice(0,10);byDay.set(d,(byDay.get(d)||0)+1)});
  const mx=Math.max(1,...days.map(d=>byDay.get(d)||0));
  $("#chDays").innerHTML=days.map(d=>{const v=byDay.get(d)||0;return `<div class="c" title="${fmtD(d)}: ${v} ticket" style="height:${v/mx*100}%">${v&&days.length<=31?`<span>${v}</span>`:""}</div>`}).join("");
  $("#chDaysAx").innerHTML=days.length?`<span>${fmtD(days[0])}</span><span>${fmtD(days[days.length-1])}</span>`:"";
  hbars($("#chType"),countBy(set,x=>x.type));
  hbars($("#chRes"),countBy(set,x=>x.resolution));
  hbars($("#chChan"),countBy(set,x=>lab(CHANNELS,x.channel||"email")[1]));
  hbars($("#chSent"),countBy(set,x=>x.summary?.sentiment?lab(SENT,x.summary.sentiment)[1]:""));
  hbars($("#chShip"),countBy(set,x=>lab(SHIP,x.shipStatus)[1]));
  hbars($("#chDisp"),countBy(set.filter(x=>x.dispute!=="none"),x=>lab(DISPUTE,x.dispute)[1]+(x.disputeReason?" · "+x.disputeReason:"")));
  // agents
  const agents=[...new Set(set.map(x=>x.assignee||""))];
  const rows=agents.map(a=>[a,stats(set.filter(x=>(x.assignee||"")===a))]).sort((x,y)=>y[1].total-x[1].total);
  $("#agentTable").innerHTML=`<thead><tr><th>Nhân viên</th><th>Ticket</th><th>Đã giải quyết</th><th>Quá SLA (đang mở)</th><th>Phản hồi đầu TB</th><th>Đúng SLA phản hồi</th><th>Giải quyết TB</th><th>Đúng SLA giải quyết</th><th>CSAT</th><th>QA</th><th>Tiền hoàn</th></tr></thead><tbody>`+
    (rows.length?rows.map(([a,s])=>`<tr style="cursor:default"><td><b>${esc(nameOf(a)||"Chưa phân công")}</b></td><td>${s.total}</td><td>${s.resolved}</td><td>${s.overdue}</td><td>${fmtH(s.frt)}</td><td>${pct(s.frtSla)}</td><td>${fmtH(s.res)}</td><td>${pct(s.resSla)}</td><td>${s.csat==null?"–":s.csat.toFixed(2)}</td><td>${pct(s.qa)}</td><td>${money(s.refund)}</td></tr>`).join(""):'<tr><td colspan="11" class="empty">Chưa có dữ liệu</td></tr>')+"</tbody>";
}
