#!/usr/bin/env python3
"""Research comparison of archived OHM Tsardom vectors to the georeferenced Tornau 1598–1682 sheet.

No geometry is promoted here. The script extracts the printed red 1682 boundary,
uses the independent same-sheet GCP transform, and measures the archived vector
candidates against the raster boundary in the European/main-map extent.
"""
from __future__ import annotations
import json, math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ARCHIVE=Path('public/data/territory/archive/russian-tsardom.geojson')
RASTER=Path('tornau-tsardom-1598-1682-diagnostics/tornau-1598-1682.gif')
OUT=Path('tornau-tsardom-1598-1682-diagnostics/ohm-candidate-comparison.json')
IDS=(2851885,2851884)
FIT=[
('Moscow',834.,789.,37.6173,55.7558),('Yaroslavl',899.,696.,39.8845,57.6261),
('Vladimir',916.,774.,40.4070,56.1291),('Arkhangelsk',950.,348.,40.5169,64.5399),
('Kazan',1198.,800.,49.1064,55.7961),('Samara',1230.,915.,50.15,53.1959),
('Kyiv',584.,1044.,30.5234,50.4501),('Saratov',1110.,1028.,46.0343,51.5336)]
MAIN=(430,82,1395,1390)

def phi(x,y): return [1.,x,y,x*x,x*y,y*y]
A=np.array([phi(x,y) for _,x,y,_,_ in FIT],float)
CLON=np.linalg.lstsq(A,np.array([p[3] for p in FIT]),rcond=None)[0]
CLAT=np.linalg.lstsq(A,np.array([p[4] for p in FIT]),rcond=None)[0]

def px_to_geo(xs,ys):
    xs=np.asarray(xs,float); ys=np.asarray(ys,float)
    F=np.column_stack([np.ones(xs.size),xs,ys,xs*xs,xs*ys,ys*ys])
    return np.column_stack([F@CLON,F@CLAT])

def planar(points,lat0=55.):
    p=np.asarray(points,float)
    return np.column_stack([p[:,0]*111.32*math.cos(math.radians(lat0)),p[:,1]*110.57])

def geometry_vertices(geometry):
    out=[]
    def walk(v):
        if isinstance(v,list) and len(v)>=2 and isinstance(v[0],(int,float)) and isinstance(v[1],(int,float)):
            out.append((float(v[0]),float(v[1])))
        elif isinstance(v,list):
            for c in v: walk(c)
    walk(geometry.get('coordinates',[]))
    return np.array(out,float)

def nearest_vertex_km(a,b,chunk=500):
    # Conservative diagnostic. OHM boundaries are densely vertexed; exact line
    # distance can only improve on this nearest-vertex value.
    vals=[]
    for i in range(0,len(a),chunk):
        q=a[i:i+chunk]
        d=((q[:,None,:]-b[None,:,:])**2).sum(axis=2)
        vals.extend(np.sqrt(d.min(axis=1)).tolist())
    return np.array(vals,float)

def extract_red_boundary():
    rgb=np.array(Image.open(RASTER).convert('RGB'))
    r,g,b=[rgb[:,:,i].astype(np.int16) for i in range(3)]
    raw=(r>140)&((r-g)>85)&((r-b)>80)&(g<135)
    # Keep only substantial connected red strokes; this drops isolated scan speckle.
    n,labels,stats,_=cv2.connectedComponentsWithStats(raw.astype(np.uint8),8)
    keep=np.zeros_like(raw)
    kept=[]
    for label in range(1,n):
        area=int(stats[label,cv2.CC_STAT_AREA])
        if area>=25:
            keep|=(labels==label); kept.append(area)
    y,x=np.where(keep)
    x0,y0,x1,y1=MAIN
    sel=(x>=x0)&(x<x1)&(y>=y0)&(y<y1)
    x=x[sel]; y=y[sel]
    # Uniformly thin along scan order to keep pairwise distance work bounded.
    if len(x)>2500:
        take=np.linspace(0,len(x)-1,2500,dtype=int); x=x[take]; y=y[take]
    return x,y,kept

def summarize(v):
    return {k:round(float(val),2) for k,val in {
        'medianKm':np.median(v),'p75Km':np.percentile(v,75),'p90Km':np.percentile(v,90),
        'p95Km':np.percentile(v,95),'maxKm':np.max(v),'within50KmPct':100*np.mean(v<=50),
        'within100KmPct':100*np.mean(v<=100)}.items()}

def main():
    data=json.loads(ARCHIVE.read_text(encoding='utf-8'))
    x,y,components=extract_red_boundary()
    red_geo=px_to_geo(x,y)
    red_xy=planar(red_geo)
    bbox=[float(red_geo[:,0].min()),float(red_geo[:,1].min()),float(red_geo[:,0].max()),float(red_geo[:,1].max())]
    rows=[]
    for cid in IDS:
        feature=next((f for f in data.get('features',[]) if f.get('properties',{}).get('provenance',{}).get('capture_id')==cid),None)
        if feature is None:
            rows.append({'captureId':cid,'error':'feature not found'}); continue
        verts=geometry_vertices(feature['geometry'])
        # Compare only the portion represented by the georeferenced main sheet.
        m=(verts[:,0]>=bbox[0]-1.0)&(verts[:,0]<=bbox[2]+1.0)&(verts[:,1]>=bbox[1]-1.0)&(verts[:,1]<=bbox[3]+1.0)
        local=verts[m]
        if len(local)<2:
            rows.append({'captureId':cid,'error':'no candidate vertices in raster extent'}); continue
        cand_xy=planar(local)
        raster_to_vector=nearest_vertex_km(red_xy,cand_xy)
        vector_sample=local[::max(1,len(local)//2500)]
        vector_to_raster=nearest_vertex_km(planar(vector_sample),red_xy)
        p=feature.get('properties',{})
        rows.append({
            'captureId':cid,'startDate':p.get('start_date'),'endDate':p.get('end_date'),
            'candidateVertexCountInRasterExtent':int(len(local)),
            'rasterRedPointCount':int(len(red_geo)),
            'rasterToVector':summarize(raster_to_vector),
            'vectorToRaster':summarize(vector_to_raster),
        })
    report={
        'schemaVersion':1,
        'purpose':'research-only spatial comparison of archived Tsardom vectors to independently georeferenced Tornau 1598–1682 red 1682 boundary; no promotion',
        'redBoundary':{'threshold':'r>140, r-g>85, r-b>80, g<135','minimumConnectedComponentPixels':25,
                       'keptComponentCount':len(components),'keptComponentAreasTop20':sorted(components,reverse=True)[:20],
                       'geographicBbox':bbox,'samplePointCount':int(len(red_geo))},
        'candidates':rows,
        'interpretation':'Nearest-vertex distances are a conservative diagnostic, not a promotion gate. A historically compatible candidate must also pass date-specific legal changes, inside/outside controls and source lineage review.'
    }
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
