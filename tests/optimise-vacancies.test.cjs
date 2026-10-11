const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('new work occupants use displaced earners before weak idle droids, without reshuffling existing workers',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const start=source.indexOf('function repairReachableLayout('),end=source.indexOf('\nconst SLOT_RULES=',start);
 const owned=[['strong-a',1000],['strong-b',900],['existing-worker',1],['displaced-a',200],['displaced-b',100],['idle-a',2],['idle-b',3],['locked',10000],['building',20000]].map(([name,income],source)=>({name,income,source,unit:0,variant:'DEFAULT',qty:1}));
 const droids=owned.map(u=>({name:u.name,type:'WORKER',variants:{DEFAULT:{income:u.income}}}));
 const placed=(i,station,slot,extra={})=>({...owned[i],station,slot,...extra});
 const base={placed:[placed(0,'WORKER',0),placed(1,'WORKER',1),placed(2,'WORKER',2),placed(3,'ASTROMECH',0),placed(4,'ASTROMECH',1),placed(5,'LOUNGE',0),placed(6,'LOUNGE',1),placed(7,'COMPANION',0,{lockedSlot:true}),placed(8,'BUILD',0,{built:false})]};
 const assignment=(i,station,slot)=>({key:`${i}:0`,name:owned[i].name,variant:'DEFAULT',station,slot});
 const proposed={income:20000,gain:1000,assignments:[assignment(0,'ASTROMECH',0),assignment(1,'ASTROMECH',1),assignment(2,'WORKER',2),assignment(5,'WORKER',0),assignment(6,'WORKER',1)]};
 const incomeForPlaced=units=>units.reduce((sum,u)=>sum+(['WORKER','ASTROMECH'].includes(u.station)?owned[u.source].income*(u.station==='ASTROMECH'?10:1):0),0);
 const context=vm.createContext({state:{droids},PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],expandedOwned:()=>owned,stationSlotIndices:station=>Array.from({length:{WORKER:3,ASTROMECH:2}[station]||0},(_,i)=>i),isBuilding:u=>u.station==='BUILD'&&!u.built,canUseStation:()=>true,incomeForPlaced,stabiliseAssignments:x=>x,optimiseMoveLambda:()=>100000});
 vm.runInContext(source.slice(start,end),context);
 const result=context.repairReachableLayout(proposed,base);
 assert.equal(result.assignments.find(x=>x.key==='3:0')?.station,'WORKER');
 assert.equal(result.assignments.find(x=>x.key==='4:0')?.station,'WORKER');
 assert.equal(result.assignments.find(x=>x.key==='2:0')?.slot,2,'existing worker stays; this is not a threshold-free reshuffle');
 assert(!result.assignments.some(x=>['7:0','8:0'].includes(x.key)),'locked and unfinished copies are excluded');
 assert.equal(new Set(result.assignments.map(x=>x.key)).size,5);
 assert.equal(result.income,19301);
});
