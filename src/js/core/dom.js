/* Anchor Dashboard - tiny DOM helpers used everywhere. */

const $=id=>document.getElementById(id);
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

export { $, safe };
