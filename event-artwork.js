import {escapeHtml as escape} from './ui-text.js?v=2026-11-08-shared';

let artworkId=0;
// Some event banners ship their lettering separately. Keep every placement together.
export function eventArtwork(event){
  if(!event.image)return '';
  if(!event.titleImage)return `<img src="${escape(event.image)}" alt="${escape(event.name||'')}">`;
  const id=`event-title-${++artworkId}`;
  return `<div class="event-artwork-layered" role="img" aria-label="${escape(event.name||'')}"><img src="${escape(event.image)}" alt=""><svg class="event-artwork-title" viewBox="220 25 600 190" aria-hidden="true" focusable="false"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="256" style="mask-type:alpha"><image href="${escape(event.titleImage)}" width="1024" height="256"/></mask></defs><rect x="220" y="25" width="600" height="190" fill="currentColor" mask="url(#${id})"/></svg></div>`;
}
