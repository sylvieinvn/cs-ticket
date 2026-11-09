/* Hash-based view routing */
/* ---------- routing ---------- */
function route(){
  const h=(location.hash||"#tickets").slice(1);
  view=["tickets","orders","reports","settings"].includes(h)?h:"tickets";
  if(view!=="tickets"&&openId)closeDrawer();
  for(const v of ["tickets","orders","reports","settings"])$("#v-"+v).style.display=v===view?"":"none";
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("on",a.dataset.v===view));
  renderAll();
}
window.addEventListener("hashchange",route);
