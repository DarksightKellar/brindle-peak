
from PIL import Image
import numpy as np, glob, colorsys
np.set_printoptions(suppress=True)

def quant(im, n):
    a = np.asarray(im.convert('RGB')).reshape(-1,3).astype(np.float32)
    # simple k-means
    rng = np.random.default_rng(0)
    idx = rng.choice(len(a), n, replace=False)
    C = a[idx].copy()
    for _ in range(25):
        d = ((a[:,None,:]-C[None,:,:])**2).sum(2)
        lab = d.argmin(1)
        for k in range(n):
            m = lab==k
            if m.any(): C[k] = a[m].mean(0)
    counts = np.bincount(lab, minlength=n)
    order = np.argsort(-counts)
    return [(C[i], counts[i]/len(a)) for i in order]

for f in sorted(glob.glob('/home/kel/projects/winter-hike/research/screenshots/steam_0*.jpg')):
    im = Image.open(f)
    w,h = im.size
    print('='*70); print(f.split('/')[-1], w, h)
    # top strip sky color (top 8%)
    top = np.asarray(im.crop((0,0,w,int(h*0.08))).convert('RGB')).reshape(-1,3)
    print('  top8%% mean RGB:', top.mean(0).round(0), ' median:', np.median(top,0))
    # detect pixel block size via autocorrelation of edge map on a crop
    crop = im.crop((w//2-200, h//2-200, w//2+200, h//2+200)).convert('L')
    g = np.asarray(crop).astype(np.float32)
    dx = np.abs(np.diff(g,axis=1))
    # strong vertical edges -> columns where gradient spikes
    colprof = (dx>12).mean(0)
    # find periodicity
    ac = np.correlate(colprof-colprof.mean(), colprof-colprof.mean(), 'full')[len(colprof)-1:]
    ac = ac/ac[0]
    peaks = [(i, round(float(ac[i]),3)) for i in range(2,25)]
    print('  block-size autocorr peaks:', peaks[:10])
    pal = quant(im, 8)
    print('  palette (8 dominant):')
    for c,fr in pal:
        r,g_,b = c
        hh,l,s = colorsys.rgb_to_hls(r/255,g_/255,b/255)
        print('    #%02X%02X%02X  %5.1f%%  H=%3d L=%.2f S=%.2f' % (int(r),int(g_),int(b),fr*100,int(hh*360),l,s))
