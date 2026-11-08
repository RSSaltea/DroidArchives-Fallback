import {baseVariant,isIconic} from './droid-rules.js?v=2026-11-08-shared';
import {escapeHtml as escapeAttr} from './ui-text.js?v=2026-11-08-shared';
const norm=s=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
export function imageFor(droid,variant='DEFAULT',images={}){
  if(droid.portraits?.[variant])return droid.portraits[variant];
  if(baseVariant(variant)==='KYBER'&&!isIconic(droid))return `assets/droids/kyber/${droid.name.replace(/[^A-Za-z0-9-]/g,'_')}_Kyber.png`;
  if(droid.name==='D-O')return 'assets/droids/D-O.png';
  if(variant==='STELLAR'&&droid.stellarImage)return droid.stellarImage;
  const aliases={'BU-4D':'B-U4D','LO':'L0','MONO-WALKER':'MONO-WLKR','OPTI-STRIKE':'OPTI-STRK','SENATE HOVERCAM':'SENATE HOVERCAM'}; const target=norm(aliases[droid.name]||droid.name);
  const imageVariant=variant,qualityPattern='Gold|Diamond|Rainbow|Beskar|Galactic|Stellar';
  const entries=Object.entries(images).filter(([k])=>norm(k.split(' - Droid')[0].replace(new RegExp(`\\(${qualityPattern}\\)`,'i'),''))===target);
  let match=entries.find(([k])=>imageVariant==='DEFAULT'?!new RegExp(`\\(${qualityPattern}\\)`,'i').test(k):new RegExp(`\\(${imageVariant}\\)`,'i').test(k));
  match ||= entries.find(([k])=>!new RegExp(`\\(${qualityPattern}\\)`,'i').test(k)) || entries[0]; return match?.[1]||'';
}
export function droidPicture(droid,variant='DEFAULT',images={}){const src=imageFor(droid,variant,images),fallback=imageFor(droid,'DEFAULT',images);return src?`<img src="${escapeAttr(src)}" alt="${escapeAttr(droid.name)} ${variant.toLowerCase()} variant" data-portrait-fallback="${escapeAttr(fallback)}" loading="lazy">`:`<span class="fallback">${escapeAttr(droid.name.slice(0,3))}</span>`}
