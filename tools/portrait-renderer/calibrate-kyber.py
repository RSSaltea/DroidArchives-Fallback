from PIL import Image
import numpy as np,json
from pathlib import Path
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--references',required=True);parser.add_argument('--manifest',required=True);parser.add_argument('--crystal',required=True);parser.add_argument('--output',default='tools/portrait-renderer/kyber-calibration.json');args=parser.parse_args()
rows=json.loads(Path(args.manifest).read_text());powers=[(a,b,c) for a in range(8) for b in range(8-a) for c in range(8-a-b)]
im=np.array(Image.open(args.crystal))/255;q=(np.arange(512)+.5)/512;u=(q*1.2+.3)%1*512-.5;ui=np.floor(u).astype(int);f=u-ui
pat=((im[ui[:,None]%512,ui[None,:]%512,:3]*(1-f)[None,:,None]+im[ui[:,None]%512,(ui[None,:]+1)%512,:3]*f[None,:,None])*(1-f)[:,None,None]+(im[(ui[:,None]+1)%512,ui[None,:]%512,:3]*(1-f)[None,:,None]+im[(ui[:,None]+1)%512,(ui[None,:]+1)%512,:3]*f[None,:,None])*f[:,None,None])*2-1
def data(row):
 r=np.array(Image.open(Path(args.references)/(row['referenceId']+'_Kyber_Green.png')))/255;n=np.array(Image.open(row['files'][2].lstrip('/')))/255;m=r[:,:,3]>.99;v=n[m,:3]*2-1;t=pat[m]
 X=[v[:,0]**a*v[:,1]**b*v[:,2]**c for a,b,c in powers]
 X.extend(t[:,i] for i in range(3));X.extend(t[:,i]*t[:,j] for i in range(3) for j in range(i,3));X.extend(v[:,i]*t[:,j] for i in range(3) for j in range(3))
 y=np.where(r[m,1]<.98,r[m,1],r[m,0]/.134);return np.array(X).T,y,r[m,:3]
train=[tuple(v[::45].copy() for v in data(row)) for row in rows if int(row['referenceId'][1:])%5!=0];x=np.concatenate([a for a,b,c in train]);y=np.concatenate([np.log(b+.04) for a,b,c in train]);w=np.linalg.solve(x.T@x+np.eye(x.shape[1])*.05,x.T@y)
raw=np.maximum(np.exp(x@w)-.04,.001);true=np.exp(y)-.04;targetRGB=np.minimum(true[:,None]*[.134,1,0],1);best=(1e9,1,1)
for gamma in np.linspace(.8,1.8,21):
 for gain in np.linspace(.7,1.3,25):
  pred=np.clip(gain*.65*(raw/.65)**gamma,.02,3.84);error=np.mean((np.minimum(pred[:,None]*[.134,1,0],1)-targetRGB)**2)
  if error<best[0]:best=(error,float(gamma),float(gain))
print('tone',best)
for row in rows:
 if row['name'] not in ['MOUSE','GONK','R3','2BB','B2 HEAVY','EG-58']:continue
 a,b,c=data(row);pred=np.clip(np.exp(a@w)-.04,.02,3.84);rgb=np.minimum(pred[:,None]*[.134,1,0],1);print(row['name'],'RGB MAE',round(abs(rgb-c).mean()*255,2),'intensity corr',round(np.corrcoef(pred,b)[0,1],3))
Path(args.output).write_text(json.dumps({'powers':powers,'coefficients':list(w),'textureScale':1.2,'textureOffset':.3,'logResponse':True,'toneGamma':best[1],'toneGain':best[2],'description':'Global material response calibrated from game normal and crystal textures; no per-droid pixel data. Every fifth reference ID held out.'},indent=2))
