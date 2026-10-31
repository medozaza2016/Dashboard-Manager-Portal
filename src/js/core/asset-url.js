/* Anchor Dashboard - URL for a privately stored R2 asset.
   Kept in core/ so both the image cache and the UI layers can build asset URLs
   without importing each other (which would create a module cycle). */

function assetUrl(key){return "/api/assets?key="+encodeURIComponent(key)}

export { assetUrl };
