/* AI conversation summary */
/* ---------- AI SUMMARY ---------- */
async function summarize(id){
  const txt=$("#convoText").value.trim();
  if(!txt)return toast("Dán nội dung trao đổi trước");
  if(!sample)return toast("AI chưa sẵn sàng ở chế độ xem này");
  const t0=tickets.find(x=>x.id===id);if(!t0)return;
  $("#btnSumm").disabled=true;$("#summMsg").textContent="Đang tóm tắt…";
  const prompt=`Bạn là trưởng nhóm CS của một shop thương mại điện tử. Đọc đoạn hội thoại giữa khách hàng và nhân viên CS (kênh: ${lab(CHANNELS,t0.channel||"email")[1]}, đơn ${t0.orderName||"không rõ"}) và trả về DUY NHẤT một object JSON, viết bằng tiếng Việt, ngắn gọn:
{"issue":"vấn đề chính khách nêu, tối đa 1 câu",
"done":"những gì CS đã làm/đã hứa, tối đa 2 câu",
"waitingOn":"customer|cs|supplier|none — ai đang cần hành động tiếp",
"next":"bước tiếp theo CS nên làm, tối đa 1 câu",
"sentiment":"positive|neutral|frustrated|angry|chargeback — chargeback nếu khách nhắc tranh chấp, chargeback, PayPal/ngân hàng, báo cáo",
"suggestType":"chọn đúng một trong: ${TYPES.join(" | ")}",
"msgCount":số tin nhắn ước tính (số nguyên),
"firstAgentReplyAt":"thời điểm CS trả lời lần đầu theo ISO 8601 nếu đoạn hội thoại có ghi giờ rõ ràng, ngược lại để chuỗi rỗng"}
Không thêm nhận xét ngoài JSON. Hội thoại:
"""
${txt.slice(0,30000)}
"""`;
  try{
    const r=await sample.json(prompt,{modelTier:"quick"});
    const x=clean(tickets.find(y=>y.id===id)||t0);
    const pick=(arr,v)=>arr.some(a=>a[0]===v)?v:"";
    x.summary={issue:String(r.issue||""),done:String(r.done||""),next:String(r.next||""),waitingOn:pick(WAITING,r.waitingOn),
      sentiment:pick(SENT,r.sentiment),suggestType:TYPES.includes(r.suggestType)?r.suggestType:"",msgCount:Number(r.msgCount)||0,updatedAt:now(),by:meId||""};
    if(r.firstAgentReplyAt&&!x.firstResponseAt){const d=new Date(r.firstAgentReplyAt);if(!isNaN(d)&&d>=new Date(x.createdAt)-30*864e5&&d<=new Date())x.firstResponseAt=d.toISOString()}
    if(x.summary.sentiment==="chargeback"&&x.priority!=="urgent"){x.priority="urgent";addLog(x,"system","Tự nâng ưu tiên: Khẩn (khách nhắc chargeback)")}
    addLog(x,"system","Cập nhật tóm tắt trao đổi bằng AI");
    await saveTicket(x);if(!db)renderDrawer(x);
    toast("Đã tóm tắt");
  }catch(e){
    $("#summMsg").textContent=e?.code==="rate_limited"?"AI đang quá tải, thử lại sau ít phút":e?.code==="not_granted"?"Chưa được cấp quyền dùng AI":"Không tóm tắt được: "+(e?.message||e?.code||"lỗi");
    const b=$("#btnSumm");if(b)b.disabled=false;
  }
}
