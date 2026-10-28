"""Compare decoded pixels, not PNG encoder bytes; allow subpixel antialiasing."""
import sys,json
from PIL import Image,ImageChops,ImageStat
before,after=[Image.open(p).convert('RGB') for p in sys.argv[1:]]
assert before.size==after.size, f'CG dimensions changed: {before.size} -> {after.size}'
difference=ImageChops.difference(before,after)
mean=max(ImageStat.Stat(difference).mean)
print(json.dumps({'CG_pixel_mean_difference':mean,'size':before.size}))
assert mean<1, f'CG pixel regression, mean channel error {mean}/255; inspect before/after screenshots'
