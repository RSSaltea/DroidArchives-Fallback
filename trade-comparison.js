import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';
import {tradeValue,tradeDifference,tradeMoney} from './trade-values.js?v=2026-11-08-shared';
import {tradeVariantLabel} from './trade-rules.js?v=2026-11-08-shared';
export function mountTradeComparison(host,{droids,giving,receiving,picture=()=>'',leftLabel='You',rightLabel='Other player'}){
 if(!host)return;
 const catalogue=droids.filter(d=>tradeValue(d,'DEFAULT'));
 const all=catalogue.flatMap(d=>Object.keys(d.variants).filter(v=>tradeValue(d,v)).map(variant=>({name:d.name,variant})));
 const left=giving??all,right=receiving??all;
 const verb=(label,word)=>/^You(?:\b|$)/i.test(label)?word:word+'s';
 const options=rows=>rows.map((r,i)=>`<option value="${i}">${esc(r.name)} · ${esc(tradeVariantLabel(r.variant))}</option>`).join('');
 host.innerHTML=`<section class="trade-cost-panel"><h3>In-game trade cost</h3><p>Compare one droid from each side. Each currency is charged separately; multiple droids are exchanged as individual pairs.</p><div class="trade-cost-selects"><label>${esc(leftLabel)} ${verb(leftLabel,'give')}<select data-cost-left>${left.length===1?'':'<option value="">Choose a droid</option>'}${options(left)}</select></label><span aria-hidden="true">⇄</span><label>${esc(rightLabel)} ${verb(rightLabel,'give')}<select data-cost-right>${right.length===1?'':'<option value="">Choose a droid</option>'}${options(right)}</select></label></div><div data-cost-result aria-live="polite"></div></section>`;
 const update=()=>{const a=host.querySelector('[data-cost-left]').value,b=host.querySelector('[data-cost-right]').value;
 const result=host.querySelector('[data-cost-result]');if(a===''||b===''||!left[a]||!right[b]){result.textContent='Choose the two droids you will exchange to see both players’ costs.';return;}
 const x=left[a],y=right[b],dx=droids.find(d=>d.name===x.name),dy=droids.find(d=>d.name===y.name),cost=tradeDifference(tradeValue(dx,x.variant),tradeValue(dy,y.variant));
 if(!cost){result.textContent='An exact droid and variant are needed to calculate this trade.';return;}
 result.innerHTML=`<div class="trade-cost-portraits">${picture(dx,x.variant)}<span aria-hidden="true">⇄</span>${picture(dy,y.variant)}</div><p><strong>${esc(leftLabel)} ${verb(leftLabel,'pay')}:</strong> ${tradeMoney(cost.you)}</p><p><strong>${esc(rightLabel)} ${verb(rightLabel,'pay')}:</strong> ${tradeMoney(cost.other)}</p>`;};
 host.querySelectorAll('select').forEach(s=>s.onchange=update);update();
}
