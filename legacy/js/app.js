/* renderAll + app bootstrap (must load last) */
function renderAll(){
  renderClientSelects();
  if(view==="tickets")renderTickets();else renderTabs();
  if(view==="orders")renderOrders();
  if(view==="reports")renderReports();
  if(view==="settings")renderSettings();
  if(openId){const t=tickets.find(x=>x.id===openId);if(t){const ae=document.activeElement;if(!(ae&&$("#dr").contains(ae)&&(ae.tagName==="TEXTAREA"||ae.type==="text"||ae.type==="number")))renderDrawer(t)}}
}

/* ---------- boot ---------- */
fillSelects();rangeInit(30);route();
(async()=>{
  const w=window.claude;
  if(!w||!w.use){$("#dbNotice").style.display="";$("#dbNotice").textContent="Đang chạy ở chế độ thử: dữ liệu chỉ nằm trong trang này và sẽ mất khi tải lại. Mở trang trên claude.ai để lưu cho cả đội.";$("#whoami").textContent="Chế độ thử";return}
  [user,mcp,downloads,sample]=await Promise.all([w.use("user"),w.use("mcp"),w.use("downloads"),w.use("sample")]);
  if(user){try{meId=await user.id();const me=await user.me();names[meId]=me?.name||"Tôi";$("#whoami").textContent="Đăng nhập: "+names[meId]}catch(e){}}
  db=await w.use("db");
  if(!db){$("#dbNotice").style.display="";$("#dbNotice").textContent="Không kết nối được bộ lưu trữ — thay đổi sẽ không được lưu. Hãy đăng nhập claude.ai rồi tải lại trang.";return}
  const timer=setTimeout(()=>{$("#dbNotice").style.display="";$("#dbNotice").textContent="Tải dữ liệu chậm hơn bình thường…"},10000);
  const docsOf=snap=>(Array.isArray(snap)?snap:(snap.docs||[])).map(d=>{const v=typeof d.data==="function"?d.data():(d.data||d);return {...v,_id:d.id}});
  db.collection("tickets").onSnapshot(snap=>{
    clearTimeout(timer);$("#dbNotice").style.display="none";
    tickets=docsOf(snap).map(v=>{const x={...v,id:v._id||v.id};delete x._id;return x});
    renderAll();resolveNames();
  },err=>{clearTimeout(timer);$("#dbNotice").style.display="";$("#dbNotice").textContent="Lỗi tải ticket: "+(err?.message||err?.code||"")});
  db.collection("orders").onSnapshot(snap=>{orders=docsOf(snap).map(v=>{const x={...v};delete x._id;return x});if(view==="orders"||view==="settings")renderAll()},()=>{});
  db.collection("clients").onSnapshot(snap=>{clients={};for(const v of docsOf(snap)){if(v.shop){const x={...v};delete x._id;clients[v.shop]=x}}renderAll()},()=>{});
  db.doc("config/settings").onSnapshot(d=>{const v=d&&(typeof d.data==="function"?d.data():d.data);if(v&&v.frtHours){settings={...settings,...v};renderAll()}},()=>{});
  db.doc("sync/gmail").onSnapshot(d=>{const v=d&&(typeof d.data==="function"?d.data():d.data);if(v){syncState=v;renderSyncMsg()}},()=>{});
  if(!mcp){$("#btnSync").disabled=true;$("#syncMsg").textContent="Chế độ xem này không đồng bộ được email. Dữ liệu đã đồng bộ vẫn hiển thị đầy đủ."}
  else setupAuto();
  renderAll();
})();
