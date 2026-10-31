/* Anchor Dashboard - constants shared by the shell, the catalog, and the settings screens. */
import { svg } from "./icons.js";

const APP_VERSION="0.2.0";
const MAX_IMAGE_BYTES=5*1024*1024;
const DEFAULT_PORTAL_FAVICON="data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2064%2064'%3E%3Crect%20width%3D'64'%20height%3D'64'%20rx%3D'15'%20fill%3D'%230B1F3A'%2F%3E%3Cg%20fill%3D'none'%20stroke%3D'%23FFFFFF'%20stroke-width%3D'4'%20stroke-linecap%3D'round'%3E%3Ccircle%20cx%3D'32'%20cy%3D'19'%20r%3D'4.5'%2F%3E%3Cpath%20d%3D'M32%2023.5V50M23%2031h18M20%2039c0%208%205.4%2014%2012%2014s12-6%2012-14'%2F%3E%3C%2Fg%3E%3Cpath%20d%3D'M41%2012.5%2045%2016.5%2053%208'%20fill%3D'none'%20stroke%3D'%2300A6D6'%20stroke-width%3D'4'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%2F%3E%3C%2Fsvg%3E";
const CATEGORY_ICON_OPTIONS=[
["box","General"],["heart-pulse","Healthcare / medical"],["landmark","Banking / finance"],["wallet-cards","Payments / wallet"],["shield-check","Insurance / security"],["house","Home / real estate"],["shopping-bag","Shopping / retail"],["utensils","Food / restaurants"],["graduation-cap","Education / learning"],["plane","Travel / airlines"],["car-front","Transportation / vehicles"],["lightbulb","Utilities / energy"],["film","Entertainment / media"],["scale","Legal / government"],["briefcase","Business / work"],["cloudflare","Cloudflare"],["cloud","Cloud services"],["server","Servers"],["infrastructure","Infrastructure"],["storage","Storage"],["networking","Networking"],["remote-access","Remote access"],["development","Development / code"],["monitor","Computer / monitor"],["gauge","Monitoring"],["windows","Microsoft"]
];

export { APP_VERSION, MAX_IMAGE_BYTES, DEFAULT_PORTAL_FAVICON, CATEGORY_ICON_OPTIONS };
