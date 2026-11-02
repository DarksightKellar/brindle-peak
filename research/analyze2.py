
from PIL import Image
import numpy as np, glob
files = sorted(glob.glob('/home/kel/projects/winter-hike/research/screenshots/steam_0*.jpg'))
A=np.concatenate([np.asarray(Image.open(f).convert('RGB')).reshape(-1,3).astype(np.float32)/255 for f in files])
mx=A.max(1);mn=A.min(1);L=(mx+mn)/2
S=np.where(mx==mn,0,(mx-mn)/(1-np.abs(2*L-1)+1e-6))
r,g,b=A[:,0],A[:,1],A[:,2]; d=mx-mn+1e-9
H=np.zeros(len(A))
m=(mx==r); H[m]=((g[m]-b[m])/d[m])%6
m=(mx==g)&(mx!=r); H[m]=((b[m]-r[m])/d[m])+2
m=(mx==b)&(mx!=r)&(mx!=g); H[m]=((r[m]-g[m])/d[m])+4
H*=60
print('AGGREGATE over 7 screenshots, %.1fM px' % (len(A)/1e6))
print(' Luminance p1/p5/p25/p50/p75/p95/p99/max:', np.round(np.percentile(L,[1,5,25,50,75,95,99,100]),3))
print(' Saturation p5/p25/p50/p75/p95:', np.round(np.percentile(S,[5,25,50,75,95]),3))
print(' MIN lightness present:', round(float(L.min()),3), ' => no true black')
idx=np.argsort(L)
print(' darkest 0.2%% mean RGB:', np.round(A[idx[:int(len(A)*0.002)]].mean(0)*255,0))
print(' brightest 0.2%% mean RGB:', np.round(A[idx[-int(len(A)*0.002):]].mean(0)*255,0))
h,_=np.histogram(H,bins=24,range=(0,360),weights=S)
print('\n saturation-weighted hue histogram:')
for i,v in enumerate(h):
    print('   %3d-%3d  %-40s %4.1f%%' % (i*15,(i+1)*15,'#'*int(55*v/h.max()), 100*v/h.sum()))
# value histogram
lv,_=np.histogram(L,bins=10,range=(0,1))
print('\n luminance histogram (deciles):')
for i,v in enumerate(lv): print('   %.1f-%.1f %-40s %4.1f%%'%(i/10,(i+1)/10,'#'*int(50*v/lv.max()),100*v/lv.sum()))
