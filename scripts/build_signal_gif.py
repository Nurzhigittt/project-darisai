from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
W,H=720,420
mint=(234,242,239); berry=(145,47,86); rose=(255,112,166); ink=(18,44,52); muted=(78,104,112)
geo=ImageFont.truetype('brand/fonts/geologica-semibold.ttf',26)
small=ImageFont.truetype('brand/fonts/geologica-semibold.ttf',13)
body=ImageFont.truetype('brand/fonts/plex.woff2'.replace('.woff2','.ttf'),16) if Path('brand/fonts/plex.ttf').exists() else ImageFont.load_default()
frames=[]
for step in range(36):
    im=Image.new('RGB',(W,H),mint); d=ImageDraw.Draw(im,'RGBA')
    # dotted texture
    for x in range(24,W,28):
        for y in range(24,H,28):
            d.ellipse((x,y,x+1,y+1),fill=(18,44,52,16))
    d.text((42,34),'DärisAI',font=geo,fill=ink)
    d.text((42,H-38),'ILLUSTRATIVE SIGNAL → RIPPLE',font=small,fill=berry)
    cx,cy=470,205
    phase=step/35
    for i,r in enumerate((48,84,124,168)):
        grow=(phase*0.65 + i*0.08)%1.0
        radius=38+grow*150
        alpha=int(150*(1-grow))
        d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),outline=(145,47,86,alpha),width=2)
    # central signal
    pulse=1+0.06*(1-abs((phase*2)%2-1))
    d.ellipse((cx-34*pulse,cy-34*pulse,cx+34*pulse,cy+34*pulse),fill=berry)
    d.ellipse((cx-15,cy-15,cx+15,cy+15),fill=mint)
    d.ellipse((cx-5,cy-5,cx+5,cy+5),fill=ink)
    for i in range(10):
        angle=(i/10)*6.283 + phase*1.2
        import math
        radius=130
        px,py=cx+math.cos(angle)*radius,cy+math.sin(angle)*radius
        a=int(110+90*max(0,math.sin(phase*6.283+i)))
        d.ellipse((px-4,py-4,px+4,py+4),fill=(255,112,166,a))
    # waveform left
    pts=[]
    for x in range(42,340,5):
        y=300+18*math.sin((x-42)/34+phase*6.283)*math.exp(-((x-170)/160)**2)
        pts.append((x,y))
    d.line(pts,fill=berry,width=3,joint='curve')
    d.text((42,258),'one quiet signal',font=small,fill=muted)
    d.text((42,330),'The room becomes visible. No individual history.',font=small,fill=muted)
    frames.append(im.convert('P',palette=Image.Palette.ADAPTIVE,colors=128))
out=Path('brand/readme/signal-ripple-demo.gif'); frames[0].save(out,save_all=True,append_images=frames[1:],duration=85,loop=0,optimize=True)
print(out, out.stat().st_size)
