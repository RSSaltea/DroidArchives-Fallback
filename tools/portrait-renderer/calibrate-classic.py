"""Fit shared normal/material colours; references are never used by generation."""
import json,argparse
from pathlib import Path
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--references',required=True);p.add_argument('--samples',required=True);p.add_argument('--output',default='tools/portrait-renderer/classic-calibration.json');a=p.parse_args()
rows=json.loads(Path(a.samples).read_text());powers=[(i,j,k) for i in range(6) for j in range(6-i) for k in range(6-i-j)]
models={}
for variant in ['Gold','Diamond','Rainbow','Beskar','Galactic','Stellar']:
 xs=[];ys=[]
 for row in rows:
  if row['name']=='EG-58':continue # New Gonk models are excluded from calibration.
  base=np.array(Image.open(row['files'][0].lstrip('/')).convert('RGBA'))/255
  mask=np.array(Image.open(row['files'][1].lstrip('/')).convert('RGB'))/255
  normal=np.array(Image.open(row['files'][2].lstrip('/')).convert('RGB'))/255*2-1
  ref=np.array(Image.open(Path(a.references)/(row['referenceId']+'_'+variant+'.png')).convert('RGBA'))/255
  valid=(base[:,:,3]>.99)&(ref[:,:,3]>.99)&(mask[:,:,1]>.95)
  n=normal[valid][::12];target=ref[valid,:3][::12]
  xs.append(np.array([n[:,0]**i*n[:,1]**j*n[:,2]**k for i,j,k in powers]).T);ys.append(target)
 x=np.concatenate(xs);y=np.concatenate(ys);w=np.linalg.solve(x.T@x+np.eye(x.shape[1])*.08,x.T@y)
 models[variant.upper()]=w.tolist();print(variant,'samples',len(x),'mean colour error',round(np.abs(np.clip(x@w,0,1)-y).mean()*255,1))
Path(a.output).write_text(json.dumps({'description':'Shared normal response fitted on five established droids, excluding all new Gonk Army droids. No reference pixels or per-droid coefficients. Procedural material detail is added from local game textures.','powers':powers,'models':models},indent=2))
