#!/usr/bin/env python3
"""Research comparison of archived OHM Tsardom vectors to georeferenced Tornau 1598–1682.

No geometry is promoted here. The script extracts substantial red strokes of the
printed 1682 boundary, uses the independent same-sheet GCP transform, and
measures exact point-to-segment distance to archived candidate boundaries.
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
MIN_COMPONENT=100

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

def geometry_segments(geometry,bbox):
    segments=[]
    x0,y0,x1,y1=bbox
    def ring_segments(ring):
        pts=np.asarray(ring,float)
        if len(pts)<2:return
        for a,b in zip(pts[:-1],pts[1:]):
            # Retain segments whose endpoint box intersects the raster extent + 1° margin.
            if max(a[0],b[0])<x0-1 or min(a[0],b[0])>x1+1 or max(a[1],b[1])<y0-1 or min(a[1],b[1])>y1+1: continue
            segments.append((a,b))
    coords=geometry.get('coordinates',[])
    if geometry.get('type')=='Polygon':
        for ring in coords:ring_segments(ring)
    elif geometry.get('type')=='MultiPolygon':
        for polygon in coords:
            for ring in polygon:ring_segments(ring)
    return segments

def point_segment_distances(points,segments,chunk=250):
    seg=np.asarray(segments,float)
    a=seg[:,0,:]; b=seg[:,1,:]; ab=b-a; denom=(ab*ab).sum(axis=1)
    denom=np.where(denom==0,1.0,denom)
    out=[]
    for i in range(0,len(points),chunk):
        p=points[i:i+chunk]
        ap=p[:,None,:]-a[None,:,:]
        t=np.clip((ap*ab[None,:,:]).sum(axis=2)/denom[None,:],0.,1.)
        proj=a[None,:,:]+t[:,:,None]*ab[None,:,:]
        d=np.sqrt(((p[:,None,:]-proj)**2).sum(axis=2)).min(axis=1)
        out.extend(d.tolist())
    return np.asarray(out,float)

def extract_red_boundary():
    rgb=np.array(Image.open(RASTER).convert('RGB'))
    r,g,b=[rgb[:,:,i].astype(np.int16) for i in range(3)]
    raw=(r>140)&((r-g)>85)&((r-b)>80)&(g<135)
    n,labels,stats,_=cv2.connectedComponentsWithStats(raw.astype(np.uint8),8)
    keep=np.zeros_like(raw); kept=[]
    for label in range(1,n):
        area=int(stats[label,cv2.CC_STAT_AREA])
        if area>=MIN_COMPONENT:
            keep|=(labels==label); kept.append(area)
    y,x=np.where(keep); x0,y0,x1,y1=MAIN
    sel=(x>=x0)&(x<x1)&(y>=y0)&(y<y1); x=x[sel]; y=y[sel]
    if len(x)>3000:
        take=np.linspace(0,len(x)-1,3000,dtype=int); x=x[take]; y=y[take]
    return x,y,kept

def summarize(v):
    return {k:round(float(val),2) for k,val in {
        'medianKm':np.median(v),'p75Km':np.percentile(v,75),'p90Km':np.percentile(v,90),
        'p95Km':np.percentile(v,95),'maxKm':np.max(v),'within25KmPct':100*np.mean(v<=25),
        'within50KmPct':100*np.mean(v<=50),'within100KmPct':100*np.mean(v<=100)}.items()}

def main():
    data=json.loads(ARCHIVE.read_text(encoding='utf-8'))
    x,y,components=extract_red_boundary(); red_geo=px_to_geo(x,y); red_xy=planar(red_geo)
    bbox=[float(red_geo[:,0].min()),float(red_geo[:,1].min()),float(red_geo[:,0].max()),float(red_geo[:,1].max())]
    rows=[]
    for cid in IDS:
        feature=next((f for f in data.get('features',[]) if f.get('properties',{}).get('provenance',{}).get('capture_id')==cid),None)
        if feature is None: rows.append({'captureId':cid,'error':'feature not found'}); continue
        segments_geo=geometry_segments(feature['geometry'],bbox)
        if not segments_geo: rows.append({'captureId':cid,'error':'no candidate segments in raster extent'}); continue
        segments_xy=[planar(np.asarray([a,b])) for a,b in segments_geo]
        dist=point_segment_distances(red_xy,segments_xy)
        p=feature.get('properties',{})
        rows.append({'captureId':cid,'startDate':p.get('start_date'),'endDate':p.get('end_date'),
                     'candidateSegmentCountInRasterExtent':len(segments_xy),'rasterRedPointCount':len(red_xy),
                     'rasterToVectorSegmentDistance':summarize(dist)})
    report={'schemaVersion':2,
        'purpose':'research-only exact segment-distance comparison of archived Tsardom vectors to independently georeferenced Tornau red 1682 boundary; no promotion',
        'redBoundary':{'threshold':'r>140, r-g>85, r-b>80, g<135','minimumConnectedComponentPixels':MIN_COMPONENT,
          'keptComponentCount':len(components),'keptComponentAreas':sorted(components,reverse=True),'geographicBbox':bbox,
          'samplePointCount':len(red_geo)},
        'candidates':rows,
        'interpretation':'This removes small scan speckle and measures exact point-to-line-segment distance. It remains a corroboration diagnostic: date-specific legal changes, source lineage, full-state controls and topology are still mandatory before promotion.'}
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
