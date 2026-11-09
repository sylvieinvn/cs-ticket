/* Shared mutable app state */
/* ---------- state ---------- */
let db=null,user=null,mcp=null,downloads=null,sample=null,meId=null;
let tickets=[];               // {id,...}
let settings={frtHours:24,resHours:72,currency:"USD",lookbackDays:14,retentionDays:90};
let orders=[];                // đồng bộ từ email Flow (db: orders)
let names={};                 // id -> name
let view="tickets",statusTab="active",sortKey="createdAt",sortDir=-1;
let selected=new Set(),oSelected=new Set(),openId=null;
