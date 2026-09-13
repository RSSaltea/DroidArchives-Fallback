// The DJ windows and the D-O event, checked against the times the game and the
// Discord bot actually showed. The site anchors both to UTC; the screenshots
// were taken at UTC+1, so every expectation here converts before comparing.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),LINES=src.split(/\r?\n/);
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const pick=k=>LINES.find(l=>l.trimStart().startsWith(k));
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=src.indexOf('{',i),st=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;st=true}else if(src[j]==='}'){d--;if(st&&d===0){j++;break}}}return src.slice(i,j)};
const sb={};vm.createContext(sb);
for(const k of ['const DJ_EVENT_WINDOWS=','const DJ_EVENT_DURATION_MS=','const padTime=','const eventRetentionMs='])
  vm.runInContext(pick(k),sb);
for(const k of ['function windowStarts(','function windowState(','function durationParts(','function shortDuration(',
  'function windowClock(','function eventOccurrence(','function currentEvent(','function eventStatus('])
  vm.runInContext(grab(k),sb);
const idx=JSON.parse(fs.readFileSync(ROOT+'data/events/index.json','utf8'));
sb.state={events:idx.events.map(f=>JSON.parse(fs.readFileSync(ROOT+'data/events/'+f,'utf8')))};
const BST=60*60000;                       // the screenshots were taken at UTC+1
const localOf=ms=>new Date(ms+BST).toUTCString();
const at=iso=>new Date(iso);

console.log('=== the DJ windows land where the bot said they would ===');
// Clock in the screenshot read 23:14 on 25/08/2026 local, so 22:14 UTC.
const now=at('2026-08-25T22:14:00Z');
sb.now=now;
const starts=vm.runInContext('windowStarts(DJ_EVENT_WINDOWS,now).filter(x=>x>now.getTime())',sb);
ok('the next window is the Wednesday 01:00 local run',
  localOf(starts[0]).startsWith('Wed, 26 Aug 2026 01:00'),localOf(starts[0]));
ok('the one after is the Tuesday 15:00 local run',
  localOf(starts[1]).startsWith('Tue, 01 Sep 2026 15:00'),localOf(starts[1]));
const s=vm.runInContext('windowState({windows:DJ_EVENT_WINDOWS},now)',sb);
ok('and the bot\u2019s "in 2 hours" matches the countdown',
  vm.runInContext('shortDuration('+s.ms+')',sb)==='1h 46m 0s',vm.runInContext('shortDuration('+s.ms+')',sb));
ok('the morning window is no longer the old 12:00 UTC slot',
  vm.runInContext('DJ_EVENT_WINDOWS.find(w=>w.day===2).hour',sb)===14);
ok('the evening window is unchanged, as the announcement said',
  vm.runInContext('DJ_EVENT_WINDOWS.find(w=>w.day===3).hour',sb)===0);
sb.inside=at('2026-09-01T15:30:00Z');
ok('a window reports active while it is running',
  vm.runInContext('windowState({windows:DJ_EVENT_WINDOWS},inside).active',sb)===true);

console.log('');
console.log('=== the D-O event matches the in-game countdown ===');
const named=e=>e&&e.name==='D-O Event';
sb.shot=at('2026-08-25T22:17:00Z');       // in-game sign read 03:21:42 at 23:17 local
const shot=vm.runInContext('eventStatus(currentEvent(shot),shot)',sb);
ok('it is the event being counted down to',named(vm.runInContext('currentEvent(shot)',sb)));
ok('and the countdown agrees with the sign to the minute',
  shot.value==='3d 21h 43m 0s',shot.value+' (sign truncates seconds, we round up)');
sb.open=at('2026-08-29T20:30:00Z');
ok('it is active once open',vm.runInContext('eventStatus(currentEvent(open),open)',sb).label==='Active for');
sb.late=at('2026-08-30T21:00:00Z');
ok('and reads Ended after its 24 hours',
  vm.runInContext('eventStatus(currentEvent(late),late)',sb).value==='Ended');
const doEvent=sb.state.events.find(e=>e.id==='d-o-event');
ok('its art is the file that was added for it',doEvent.image==='assets/events/D-O_Event.png');
ok('and that file is actually on disk',fs.existsSync(ROOT+doEvent.image));

console.log('');
console.log('=== a live window counts in hours, minutes and seconds ===');
{
  vm.runInContext(grab('function clockDuration('),sb);
  const shown=iso=>{sb.now=new Date(iso);
    const s=vm.runInContext('windowState({windows:DJ_EVENT_WINDOWS},now)',sb);
    return {active:s.active,text:vm.runInContext(s.active?'clockDuration('+s.ms+')':'windowClock('+s.ms+')',sb)}};
  const before=shown('2026-08-25T23:59:30Z');
  ok('before it opens it is still days:hours:minutes',before.active===false&&before.text==='00:00:00',before.text);
  const open=shown('2026-08-26T00:00:30Z');
  ok('the moment it opens it switches',open.active===true&&open.text==='02:59:30',open.text);
  // The in-game sign read 02:39:25 with the event live; the site should agree.
  const mid=shown('2026-08-26T00:20:35Z');
  ok('mid-event it matches the game\u2019s own sign',mid.text==='02:39:25',mid.text);
  const late=shown('2026-08-26T02:59:00Z');
  ok('it counts down to the close, not the next opening',late.text==='00:01:00',late.text);
  const after=shown('2026-08-26T03:00:30Z');
  ok('and switches back once the event ends',after.active===false&&after.text==='06:10:59',after.text);
  ok('the site only ever shows seconds while a window is open',
    /card\.textContent=s\.active\?clockDuration\(s\.ms\):windowClock\(s\.ms\)/.test(src));
}

console.log('');
console.log('=== the overlay does the same ===');
{
  // desktop/ is never part of the public repos, so a site-only checkout has no
  // overlay to check. Skip rather than fail, the way the companion's own
  // detector test does when its fixtures are absent.
  const overlayPath=ROOT+'desktop/renderer/overlay.js';
  if(!fs.existsSync(overlayPath))console.log('  skip desktop/ is not in this checkout');
  else{
    const overlay=fs.readFileSync(overlayPath,'utf8');
    const at=overlay.indexOf('const liveClock =');
    ok('the overlay has an hours:minutes:seconds clock',at>=0);
    if(at>=0){
      const ov={};vm.createContext(ov);
      vm.runInContext(overlay.slice(at,overlay.indexOf('};',at)+2),ov);
      ov.ms=2*3600000+39*60000+25000;
      ok('and it renders the same 02:39:25',vm.runInContext('liveClock(ms)',ov)==='02:39:25');
      ov.ms=1000;
      ok('padding holds at one second',vm.runInContext('liveClock(ms)',ov)==='00:00:01');
    }
    ok('the overlay picks it only while the window is open',
      /info\.active \? liveClock\(info\.until - now\) : longClock\(info\.until - now\)/.test(overlay));
  }
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
