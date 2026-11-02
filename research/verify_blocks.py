
from PIL import Image
import numpy as np, glob
from collections import Counter
for f in sorted(glob.glob('/home/kel/projects/winter-hike/research/screenshots/steam_0*.jpg')):
    im=np.asarray(Image.open(f).convert('RGB')).astype(np.int16)
    h,w,_=im.shape
    # exact-equality run lengths along rows: a nearest-upscaled image has runs that are
    # multiples of the block size far more often than chance
    runs=Counter()
    for y in range(40,h-40,37):
        row=im[y]
        eq=np.all(row[1:]==row[:-1],axis=1)
        n=1
        for e in eq:
            if e: n+=1
            else:
                if n<40: runs[n]+=1
                n=1
    tot=sum(runs.values())
    top=sorted(runs.items(), key=lambda kv:-kv[1])[:8]
    # fraction of runs whose length is divisible by 5
    div5=sum(v for k,v in runs.items() if k%5==0)/tot
    div5c=sum(v for k,v in runs.items() if k%5==0 and k>=5)/sum(v for k,v in runs.items() if k>=5)
    print('%-14s top run lengths: %s' % (f.split('/')[-1][:14], ['%d:%.1f%%'%(k,100*v/tot) for k,v in top]))
    print('               %% runs len%%5==0 = %.1f%%   (ignoring 1px runs: %.1f%%)' % (100*div5, 100*div5c))
