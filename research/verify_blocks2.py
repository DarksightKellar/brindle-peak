
from PIL import Image
import numpy as np
L=np.asarray(Image.open('/home/kel/projects/winter-hike/research/screenshots/steam_00.jpg').convert('L')).astype(np.float64)
L2=np.asarray(Image.open('/home/kel/projects/winter-hike/research/screenshots/steam_04.jpg').convert('L')).astype(np.float64)
L3=np.asarray(Image.open('/home/kel/projects/winter-hike/research/screenshots/steam_02.jpg').convert('L')).astype(np.float64)

def block_flatness(img,k,origin_x=0,origin_y=0):
    h=(img.shape[0]-origin_y)//k*k
    w=(img.shape[1]-origin_x)//k*k
    a=img[origin_y:origin_y+h, origin_x:origin_x+w]
    b=a.reshape(h//k,k,w//k,k).transpose(0,2,1,3).reshape(-1,k*k)
    within=b.var(axis=1).mean()
    between=b.mean(axis=1).var()
    return within, between, within/(between+1e-9)

for name,img in (('steam_00',L),('steam_04',L2),('steam_02',L3)):
    print('==',name)
    best=None
    for k in range(2,13):
        # try all phase offsets, take the best (lowest within-block variance)
        res=[]
        for ox in range(k):
            for oy in range(k):
                res.append(block_flatness(img,k,ox,oy))
        wv=min(r[0] for r in res)
        print('  k=%2d  min within-block variance = %8.3f' % (k,wv), end='')
        if best is None or wv<best[1]: best=(k,wv); print('   <-- better')
        else: print()
    print('  => most block-constant at k =', best[0])
