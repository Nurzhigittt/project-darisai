from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
W,H=1200,250
colors=[('Mint Cream','#EAF2EF','#122C34'),('Vintage Berry','#912F56','#FFFFFF'),('Jet Black','#122C34','#FFFFFF'),('Yale Blue','#224870','#FFFFFF'),('Rose Kiss','#FF70A6','#122C34')]
im=Image.new('RGB',(W,H),'#EAF2EF'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('brand/fonts/geologica-semibold.ttf',22); small=ImageFont.truetype('brand/fonts/geologica.ttf',16)
w=W//5
for i,(name,hx,fg) in enumerate(colors):
    x=i*w; d.rectangle((x,0,x+w-1,H),fill=hx)
    d.text((x+22,H//2-30),name,font=font,fill=fg)
    d.text((x+22,H//2+10),hx,font=small,fill=fg)
im.save('brand/readme/palette.png')
print('saved')
