"""Optional calibration of a shared toon response, never a per-droid image lookup."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('--references',required=True);parser.add_argument('--manifest',required=True);parser.add_argument('--output',default='tools/portrait-renderer/scourge-calibration.json');args=parser.parse_args()
rows=json.loads(Path(args.manifest).read_text());powers=[(a,b,c) for a in range(4) for b in range(4-a) for c in range(4-a-b)]
def sample(row):
 ref=np.array(Image.open(Path(args.references)/(row['referenceId']+'_Scourge.png')))/255
 normal=np.array(Image.open(row['files'][2].lstrip('/')))/255
 opaque=(ref[:,:,3]>.99)&(ref[:,:,0]<.3);n=normal[opaque,:3]*2-1
 return np.array([n[:,0]**a*n[:,1]**b*n[:,2]**c for a,b,c in powers]).T,(ref[opaque,0]>.2).astype(float)
training=[tuple(v[::5].copy() for v in sample(row)) for row in rows if row['name'] in ['MOUSE','GONK','2BB','B2 HEAVY','EG-58']]
x=np.concatenate([a for a,b in training]);y=np.concatenate([b for a,b in training]);w=np.zeros(len(powers))
for _ in range(40):
 p=1/(1+np.exp(-np.clip(x@w,-30,30)));w-=np.linalg.solve(x.T@((p*(1-p))[:,None]*x)+np.eye(len(powers))*.003,x.T@(p-y))
metrics={}
for row in rows:
 a,b=sample(row);metrics[row['name']]=float(np.mean((a@w>0)==b))
Path(args.output).write_text(json.dumps({'description':'Global normal-map toon response calibrated against five supplied reference droids; R3 held out. No per-droid pixels or lookup textures.','powers':powers,'coefficients':list(w)},indent=2))
print(json.dumps(metrics,indent=2))
