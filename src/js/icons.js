/* Anchor Dashboard - inline SVG icon set and category/service icon resolution. */
import { safe } from "./core/dom.js";
import { state } from "./state.js";

function svg(name){const p={
home:'<path d="m3 10.5 9-7.5 9 7.5M5.5 9v11h13V9M9.5 20v-6h5v6"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
settings:'<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 13.5 1.1 1.8-1.8 3.1-2.2-.1-1.2 1.7h-3.6l-1.2-1.7-2.2.1-1.8-3.1 1.1-1.8-.8-1.5.8-1.5-1.1-1.8 1.8-3.1 2.2.1 1.2-1.7h3.6l1.2 1.7 2.2-.1 1.8 3.1-1.1 1.8.8 1.5Z"/>',
user:'<circle cx="12" cy="8" r="3.2"/><path d="M5 20c.8-3.1 3.2-4.7 7-4.7s6.2 1.6 7 4.7"/><circle cx="12" cy="12" r="9"/>',
search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/>',
menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
cloud:'<path d="M6.5 18.5h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.1A4.6 4.6 0 0 0 6.5 18.5Z"/>',
folder:'<path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/>',
database:'<ellipse cx="12" cy="5" rx="8.5" ry="3"/><path d="M3.5 5v13.5c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V5M3.5 11c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3M3.5 16c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3"/>',
harddrive:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8" cy="15.5" r="1.2"/><path d="M12 15.5h5M7 8h10"/>',
network:'<circle cx="12" cy="5" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="m10.5 7.5-3 7.5m6-7.5 3 7.5M9 18h6"/>',
code:'<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
chart:'<path d="M4 20V11M10 20V5M16 20v-8M22 20V3"/>',
cloudflare:'<path d="M16.4 9.1a4.9 4.9 0 0 0-9.7-.9 3.8 3.8 0 0 0 .2 7.6h11a3.5 3.5 0 0 0 .1-7c-.5 0-1 .1-1.6.3Z" fill="#F38020" stroke="none"/><path d="M6.8 16.1h12.3a3.6 3.6 0 0 1-3.3 2.2H8.1a1.5 1.5 0 0 1-1.3-2.2Z" fill="#F38020" stroke="none"/>',
folder:'<path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/>',
database:'<ellipse cx="12" cy="5" rx="8.5" ry="3"/><path d="M3.5 5v13.5c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V5M3.5 11c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3M3.5 16c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3"/>',
harddrive:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8" cy="15.5" r="1.2"/><path d="M12 15.5h5M7 8h10"/>',
network:'<circle cx="12" cy="5" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="m10.5 7.5-3 7.5m6-7.5 3 7.5M9 18h6"/>',
code:'<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
chart:'<path d="M4 20V11M10 20V5M16 20v-8M22 20V3"/>',
shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
server:'<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
gauge:'<path d="M4.5 19a9 9 0 1 1 15 0"/><path d="m12 13 4-4M7 19h10"/>',
box:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
'heart-pulse':'<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/><path d="M3.5 12h4l2-3.5 3 7 2-3.5h5"/>',
landmark:'<path d="m3 9 9-6 9 6H3Z"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M2 18h20"/>',
'shopping-bag':'<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
utensils:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c-3 3-3 8 0 10h3V3"/>',
house:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/>',
'graduation-cap':'<path d="m2 9 10-6 10 6-10 6L2 9Z"/><path d="M6 12v5c4 3 8 3 12 0v-5M22 9v6"/>',
plane:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
'car-front':'<path d="m5 11 2-5h10l2 5"/><path d="M3 11h18v8H3z"/><path d="M6 19v2M18 19v2M6 15h3M15 15h3"/>',
lightbulb:'<path d="M9 18h6M10 22h4"/><path d="M8 14a7 7 0 1 1 8 0c-1.2.8-1.5 2-1.5 4h-5c0-2-.3-3.2-1.5-4Z"/>',
film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
scale:'<path d="M12 3v18M5 6h14M3 21h18"/><path d="m5 6-3 7h6L5 6ZM19 6l-3 7h6l-3-7Z"/><path d="M8 13c-.5 2 1 3 4 3s4-1 4-3"/>',
'wallet-cards':'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M7 15h4M16 15h.01"/><path d="M6 5V3h12v2"/>',
plus:'<path d="M12 5v14M5 12h14"/>'
};return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(p[name]||p.box)+'</svg>'}
function categoryIconKey(category){
const records=[...(state.categoryRecords||[]),...(state.taxonomyCategories||[])];
const record=records.find(item=>item.name===category);
const stored=String(record?.icon||"").trim().toLowerCase();
const fallback={"My Projects":"folder","Cloudflare":"cloudflare","Infrastructure":"server","SupaDock":"database","Storage":"harddrive","Networking":"network","Remote Access":"shield-check","Development":"code","Healthcare":"heart-pulse","Financial":"chart","Personal":"user"};
const raw=stored||fallback[category]||"box";
return ({infrastructure:"server",storage:"harddrive",networking:"network","remote-access":"shield-check",development:"code"})[raw]||raw;
}
function categorySvg(category){
const key=categoryIconKey(category);
if(key==="windows")return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="#F35325" stroke="none"/><rect x="13" y="3" width="8" height="8" fill="#81BC06" stroke="none"/><rect x="3" y="13" width="8" height="8" fill="#05A6F0" stroke="none"/><rect x="13" y="13" width="8" height="8" fill="#FFBA08" stroke="none"/></svg>';
return svg(key);
}
function categoryTone(category){
const key=categoryIconKey(category);
const tones={
box:["#536981","rgba(83,105,129,.14)"],cloudflare:["#F38020","rgba(243,128,32,.15)"],cloud:["#55B8E8","rgba(85,184,232,.15)"],server:["#55A8FF","rgba(85,168,255,.15)"],
folder:["#A879FF","rgba(168,121,255,.16)"],database:["#3ED99A","rgba(62,217,154,.15)"],harddrive:["#FF755F","rgba(255,117,95,.15)"],network:["#35C8DF","rgba(53,200,223,.15)"],code:["#59A8FF","rgba(89,168,255,.15)"],chart:["#39D99B","rgba(57,217,155,.15)"],
"heart-pulse":["#FB687B","rgba(251,104,123,.15)"],landmark:["#A28BFA","rgba(162,139,250,.15)"],"wallet-cards":["#36CFA7","rgba(54,207,167,.15)"],"shield-check":["#A78BFA","rgba(167,139,250,.16)"],house:["#34D399","rgba(52,211,153,.15)"],"shopping-bag":["#F5B942","rgba(245,185,66,.15)"],utensils:["#FB923C","rgba(251,146,60,.15)"],"graduation-cap":["#60A5FA","rgba(96,165,250,.15)"],plane:["#38BDF8","rgba(56,189,248,.15)"],"car-front":["#38BDF8","rgba(56,189,248,.15)"],lightbulb:["#FBBF24","rgba(251,191,36,.15)"],film:["#D879EF","rgba(216,121,239,.15)"],scale:["#A3A3A3","rgba(163,163,163,.15)"],briefcase:["#A78BFA","rgba(167,139,250,.15)"],monitor:["#60A5FA","rgba(96,165,250,.15)"],gauge:["#4ADE80","rgba(74,222,128,.15)"],windows:["#60A5FA","rgba(96,165,250,.15)"]
};
if(tones[key])return tones[key];
let hash=0;for(const char of String(category))hash=(hash*31+char.charCodeAt(0))>>>0;
const palette=[["#8B83FF","rgba(139,131,255,.15)"],["#35C8DF","rgba(53,200,223,.15)"],["#F59E0B","rgba(245,158,11,.15)"],["#34D399","rgba(52,211,153,.15)"],["#F472B6","rgba(244,114,182,.15)"],["#60A5FA","rgba(96,165,250,.15)"]];
return palette[hash%palette.length];
}
function serviceIconHtml(s){if(s.logoKey)return '<span class="icon-fallback" style="display:none">'+safe(s.icon||"◆")+'</span><img class="uploaded-logo" data-asset-key="'+safe(s.logoKey)+'" alt="" loading="lazy" decoding="async">';const key=String(s.name||"").toLowerCase();const meta=[
[/cloudflare/,{url:"https://cdn.simpleicons.org/cloudflare/F38020",fallback:"☁"}],
[/^pages$/, {svg:'<path d="M13 2 5 13h5l-1 9 10-13h-6l2-7Z" fill="#FFB21A" stroke="#FFB21A" stroke-linejoin="round"/>'}],
[/workers/, {svg:'<path d="M12 2.6 20.1 7v10L12 21.4 3.9 17V7Z" fill="#F38020" stroke="#F38020"/><path d="m9 8 4 4-4 4m4-8 4 4-4 4" fill="none" stroke="#0B1F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'}],
[/^d1$/, {svg:'<ellipse cx="12" cy="5" rx="8.5" ry="3.2" fill="#24A8FF"/><path d="M3.5 5v13.5c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2V5" fill="#1685D1"/><path d="M3.5 10c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2M3.5 15c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2" fill="none" stroke="#0E5EA8" stroke-width="1.2"/>'}],
[/microsoft 365/, {svg:'<rect x="2" y="2" width="9" height="9" fill="#F35325"/><rect x="13" y="2" width="9" height="9" fill="#81BC06"/><rect x="2" y="13" width="9" height="9" fill="#05A6F0"/><rect x="13" y="13" width="9" height="9" fill="#FFBA08"/>'}],
[/azure/, {svg:'<path d="M13.6 2.8 7.4 14.9H3L9.6 9.4 6.5 2.8h7.1Z" fill="#0078D4"/><path d="M14.6 4.6 20.9 21.2H9.4l7.2-2.3-3.6-4.8 1.6-9.5Z" fill="#40A9E0"/>'}],
[/grafana/, {url:"https://cdn.simpleicons.org/grafana/F46800",fallback:"◉"}],
[/uptime kuma/, {url:"https://cdn.simpleicons.org/uptimekuma/5BCBF7",fallback:"◉"}],
[/github/, {url:"https://cdn.simpleicons.org/github/F8FAFC",fallback:"◉",extra:"github-brand"}],
[/portainer/, {url:"https://cdn.simpleicons.org/portainer/13BEF9",fallback:"◇"}],
[/proxmox/, {url:"https://cdn.simpleicons.org/proxmox/E57000",fallback:"X"}],
[/truenas/, {url:"https://cdn.simpleicons.org/truenas/0095D5",fallback:"⬡"}]
].find(([re])=>re.test(key));
if(meta&&meta[1].svg)return '<svg class="custom-svg" viewBox="0 0 24 24" aria-hidden="true">'+meta[1].svg+'</svg>';
if(meta&&meta[1].url)return '<span class="icon-fallback">'+safe(meta[1].fallback||s.icon||"◆")+'</span><img class="'+(meta[1].extra||"")+'" src="'+meta[1].url+'" alt="" loading="lazy" onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'grid\'">';
return '<span class="icon-fallback" style="display:grid">'+safe(s.icon||"◆")+'</span>'}


export { svg, categoryIconKey, categorySvg, categoryTone, serviceIconHtml };
