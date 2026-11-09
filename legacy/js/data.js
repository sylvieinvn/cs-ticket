/* Persistence, ticket model helpers and name resolution */
/* ---------- persistence ---------- */
async function saveTicket(t){
  t.updatedAt=now();
  if(db){try{await db.collection("tickets").doc(t.id).set(clean(t));}catch(e){toast("Không lưu được: "+(e.message||e.code||"lỗi"));}}
  else{const i=tickets.findIndex(x=>x.id===t.id);if(i>=0)tickets[i]=t;else tickets.push(t);renderAll();}
}
async function deleteTicket(id){
  if(db){try{await db.collection("tickets").doc(id).delete();}catch(e){toast("Không xoá được");}}
  else{tickets=tickets.filter(t=>t.id!==id);renderAll();}
}
function clean(o){return JSON.parse(JSON.stringify(o))}

/* ---------- ticket helpers ---------- */
function newTicket(o={}){
  return {id:uid(),client:o.client||curClient||"",orderName:o.orderName||"",orderId:o.orderId||"",orderDate:o.orderDate||"",customerName:o.customerName||"",customerEmail:o.customerEmail||"",
    total:o.total||"",currency:o.currency||settings.currency,country:o.country||"",tracking:o.tracking||"",trackingUrl:o.trackingUrl||"",carrier:o.carrier||"",supplier:o.supplier||"",
    type:o.type||TYPES[0],priority:"normal",channel:o.channel||"email",summary:null,status:"new",shipStatus:o.shipStatus||"",dispute:"none",disputeReason:"",
    assignee:meId||"",createdAt:now(),createdBy:meId||"",firstResponseAt:"",resolvedAt:"",
    resolution:"",refundAmount:0,csat:0,qa:{},qaBy:"",log:[{at:now(),by:meId||"",kind:"system",text:"Tạo ticket"}]};
}
function isActive(t){return !["resolved","closed"].includes(t.status)}
function slaState(t){
  const n=new Date().toISOString();
  const frtH=t.firstResponseAt?hrs(t.createdAt,t.firstResponseAt):(isActive(t)?hrs(t.createdAt,n):null);
  const resH=t.resolvedAt?hrs(t.createdAt,t.resolvedAt):hrs(t.createdAt,n);
  const L=slaFor(t);
  const frtBreach=frtH!=null&&frtH>L.frt;
  const resBreach=resH>L.res&&(isActive(t)||!!t.resolvedAt);
  return {frtH,resH,frtBreach,resBreach,overdue:isActive(t)&&((!t.firstResponseAt&&frtBreach)||resBreach)};
}
function addLog(t,kind,text){t.log=t.log||[];t.log.push({at:now(),by:meId||"",kind,text})}
function setStatus(t,s){
  if(t.status===s)return;
  addLog(t,"system",`Trạng thái: ${lab(STATUSES,t.status)[1]} → ${lab(STATUSES,s)[1]}`);
  t.status=s;
  if(["resolved","closed"].includes(s)&&!t.resolvedAt)t.resolvedAt=now();
  if(!["resolved","closed"].includes(s))t.resolvedAt="";
  if(s==="wait_cus"&&!t.firstResponseAt)t.firstResponseAt=now();
}
const track17=nums=>"https://t.17track.net/en#nums="+encodeURIComponent(nums.flatMap(n=>String(n).split(/[\s,;]+/)).filter(Boolean).join(","));

/* ---------- names ---------- */
async function resolveNames(){
  if(!user)return;
  const ids=[...new Set(tickets.flatMap(t=>[t.assignee,t.createdBy,t.qaBy,...(t.log||[]).map(l=>l.by)]).filter(Boolean))];
  if(meId&&!ids.includes(meId))ids.push(meId);
  const missing=ids.filter(i=>!(i in names));
  if(!missing.length)return;
  try{const ps=await user.profiles(missing);let ch=false;for(const id of missing){const n=ps?.[id]?.name||"";names[id]=n||"Nhân viên";ch=true}if(ch)renderAll();}catch(e){}
}
