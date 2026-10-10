"""Generate static, lazy-loaded legal-dong map paths; no patient data or runtime API key.
Source/license and pinned checksums: public/maps/korea-v1/NOTICE.txt.
Usage: python3 scripts/build-region-maps.py (downloads the three public source datasets).
"""
import json, math, pathlib, urllib.request, hashlib
root=pathlib.Path('public/maps/korea-v1')
root.mkdir(parents=True,exist_ok=True)
base='https://raw.githubusercontent.com/KnellBalm/kr-admin-geojson/main/'
sources={}
expected={"ctprvn":"c90ca4db1c97435da3946b4fce738efe65a9cf32936e9685cda2152cdb2cc62b","sig":"76b2c60ded464e7adeaab36e69b9032ed868845374d53d98186ac22483195b8e","emd":"ca8d03b0df83e5d90f78b83090ef0ef03143c1be339cce9c448260005ac1e004"}
for kind in ['ctprvn','sig','emd']:
    cached=pathlib.Path('/tmp/'+kind+'.geojson')
    raw=cached.read_bytes() if cached.exists() else urllib.request.urlopen(base+kind+'.geojson').read()
    assert hashlib.sha256(raw).hexdigest()==expected[kind], 'Source changed; review boundaries/license before regenerating'
    sources[kind]=json.loads(raw)['features']
    print(kind,hashlib.sha256(raw).hexdigest())
def name(s):return s.replace('전라북도','전북특별자치도').replace('강원도','강원특별자치도').replace('세종특별자치시 세종특별자치시','세종특별자치시')
def code(s):return '52'+s[2:] if s.startswith('45') else s
# Ramer-Douglas-Peucker: simplify only for display, preserving each polygon/hole.
def simplify(points,tol):
    if len(points)<4:return points
    a,b=points[0],points[-1];dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
    best,at=0,0
    for i,p in enumerate(points[1:-1],1):
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
        dist=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
        if dist>best:best,at=dist,i
    if best<=tol*tol:return [a,b]
    return simplify(points[:at+1],tol)[:-1]+simplify(points[at:],tol)
def shape(f,level):
    p=f['properties'];key=['CTPRVN_CD','SIG_CD','EMD_CD'][level];nk=['CTP_KOR_NM','FULL_NM','FULL_NM'][level]
    g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    rings=[];allpts=[]
    for poly in polys:
        for ring in poly:
            pts=simplify(ring,[.003,.0012,.0003][level])
            if len(pts)<4:pts=ring
            pts=[(round((x-124)*800,2),round((39-y)*1000,2)) for x,y,*_ in pts]
            allpts+=pts
            rings.append('M'+'L'.join(f'{x:g},{y:g}' for x,y in pts)+'Z')
    xs,ys=zip(*allpts);bounds=[min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys)]
    return {'id':code(p[key]),'name':name(p[nk]),'path':''.join(rings),'bounds':bounds}
def write(key,features):
    out={'features':features}
    (root/(key+'.json')).write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
write('national',[shape(f,0) for f in sources['ctprvn']])
cities={}
for prov in sources['ctprvn']:
    pc=prov['properties']['CTPRVN_CD']
    write(code(pc),[shape(f,1) for f in sources['sig'] if f['properties']['CTPRVN_CD']==pc])
for city in sources['sig']:
    sc=city['properties']['SIG_CD'];cities[name(city['properties']['FULL_NM'])]=code(sc)
    write(code(sc),[shape(f,2) for f in sources['emd'] if f['properties']['SIG_CD']==sc])
pathlib.Path('src/data/regionCities.json').write_text(json.dumps(cities,ensure_ascii=False,indent=2)+'\n')
print('files',len(list(root.glob('*.json'))),'bytes',sum(p.stat().st_size for p in root.glob('*.json')))
