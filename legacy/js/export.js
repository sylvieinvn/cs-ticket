/* CSV export and file download */
/* ---------- EXPORT ---------- */
const csvCell=v=>{v=String(v??"");return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const toCSV=rows=>"﻿"+rows.map(r=>r.map(csvCell).join(",")).join("\n");
async function saveFile(filename,data){
  if(downloads){try{await downloads.save({filename,data});return}catch(e){if(e?.code==="declined"||e?.code==="user_declined")return}}
  $("#copyArea").value=data;$("#mCopy").classList.add("on");
}
$("#copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText($("#copyArea").value);toast("Đã sao chép")}catch(e){$("#copyArea").select();toast("Nhấn Ctrl/Cmd+C để sao chép")}};
$("#copyClose").onclick=()=>$("#mCopy").classList.remove("on");
$("#btnExport").addEventListener("click",()=>{
  const set=filtered();
  const head=["Client","Mã đơn","Ngày đặt","Khách hàng","Email","Giá trị","Quốc gia","Loại vấn đề","Ưu tiên","Trạng thái","Giao hàng","Tracking","Carrier","Supplier","Tranh chấp","Lý do tranh chấp","Phụ trách","Tạo lúc","Phản hồi đầu lúc","Giải quyết lúc","TG phản hồi (giờ)","TG giải quyết (giờ)","Cách giải quyết","Tiền hoàn","CSAT","QA (/5)","Quá SLA","Kênh","Thái độ KH","Tóm tắt vấn đề","CS đã làm","Bước tiếp theo"];
  const rows=set.map(t=>{const s=slaState(t);return [clientName(t.client),t.orderName,(t.orderDate||"").slice(0,10),t.customerName,t.customerEmail,t.total,t.country,t.type,lab(PRIORITY,t.priority)[1],lab(STATUSES,t.status)[1],lab(SHIP,t.shipStatus)[1],t.tracking,t.carrier,t.supplier,lab(DISPUTE,t.dispute)[1],t.disputeReason,nameOf(t.assignee),t.createdAt,t.firstResponseAt,t.resolvedAt,
    t.firstResponseAt?s.frtH.toFixed(2):"",t.resolvedAt?s.resH.toFixed(2):"",t.resolution,t.refundAmount||0,t.csat||"",QA.filter(q=>t.qa?.[q[0]]).length,s.overdue?"Có":"",lab(CHANNELS,t.channel||"email")[1],t.summary?.sentiment?lab(SENT,t.summary.sentiment)[1]:"",t.summary?.issue||"",t.summary?.done||"",t.summary?.next||""]});
  saveFile(`tickets_${new Date().toISOString().slice(0,10)}.csv`,toCSV([head,...rows]));
});
$("#btnRepExport").addEventListener("click",()=>{
  const set=repSet();const agents=[...new Set(set.map(x=>x.assignee||""))];
  const head=["Nhân viên","Ticket","Đã giải quyết","Quá SLA","Phản hồi đầu TB (giờ)","% đúng SLA phản hồi","Giải quyết TB (giờ)","% đúng SLA giải quyết","CSAT TB","Số CSAT","QA TB (%)","Tiền hoàn","Tranh chấp","Thắng","Thua"];
  const line=(n,s)=>[n,s.total,s.resolved,s.overdue,s.frt?.toFixed(2)??"",s.frtSla?.toFixed(0)??"",s.res?.toFixed(2)??"",s.resSla?.toFixed(0)??"",s.csat?.toFixed(2)??"",s.csatN,s.qa?.toFixed(0)??"",s.refund.toFixed(2),s.disputes,s.won,s.lost];
  const rows=[["Kỳ báo cáo",$("#rFrom").value+" → "+$("#rTo").value],["Client",curClient?clientName(curClient):"Tất cả"],[],head,line("TOÀN ĐỘI",stats(set)),...agents.map(a=>line(nameOf(a)||"Chưa phân công",stats(set.filter(x=>(x.assignee||"")===a))))];
  saveFile(`bao-cao-cs_${$("#rFrom").value}_${$("#rTo").value}.csv`,toCSV(rows));
});
