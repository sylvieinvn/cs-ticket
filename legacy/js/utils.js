/* DOM, formatting and UI helpers (toast, confirm) */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const now=()=>new Date().toISOString();
const fmtDT=s=>s?new Date(s).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const fmtD=s=>s?new Date(s).toLocaleDateString("vi-VN"):"";
const hrs=(a,b)=>(new Date(b)-new Date(a))/36e5;
const fmtH=h=>h==null||isNaN(h)?"–":h<1?Math.round(h*60)+" phút":h<48?h.toFixed(1)+" giờ":(h/24).toFixed(1)+" ngày";
const money=v=>(Number(v)||0).toLocaleString("en-US",{maximumFractionDigits:2});
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2600)}
function confirmBox(text){return new Promise(r=>{$("#mText").textContent=text;$("#mConfirm").classList.add("on");$("#mYes").onclick=()=>{$("#mConfirm").classList.remove("on");r(true)};$("#mNo").onclick=()=>{$("#mConfirm").classList.remove("on");r(false)}})}
const nameOf=id=>id?(names[id]||(id===meId?"Tôi":"Nhân viên")):"";
