#!/usr/bin/env python3
"""Research-only raster registration for Tornau's 1598–1682 Tsardom sheet.

Measures whether the same-atlas 1598 sheet can inherit candidate geographic
controls from the pinned 862 Tornau reference. Output is diagnostic only.
"""
from __future__ import annotations
import hashlib, json, urllib.request
from pathlib import Path
import cv2
import numpy as np

REFERENCE={"id":"862","url":"https://upload.wikimedia.org/wikipedia/commons/8/8d/Historical_map_of_Rus%27%2C_862.gif","sha256":"d0cd3dedfec309a9a2ce670f2e8de1b17b5ce03ae0abca8e4ef9fde68620496c","width":1800,"height":2207}
TARGET={"id":"1598-1682","url":"https://commons.wikimedia.org/wiki/Special:Redirect/file/Historical_map_of_Russian,_1598-1682.gif","sha1":"5b78566787732141ad81726380a83f06b9aff491","width":1800,"height":2207}
OUT=Path("tornau-tsardom-1598-1682-diagnostics")
TARGET_RASTER=OUT/"tornau-1598-1682.gif"
REFERENCE_GCPS=[
("lake-ladoga-center",340,1470,31.5,60.83),("lake-onega-center",480,1450,35.5,61.7),("pskov-label-anchor",373,1565,28.3318,57.8193),("novgorod-label-anchor",452,1565,31.2755,58.5229),("belozersk-label-anchor",545,1528,37.8078,60.0308),("rostov-label-anchor",570,1614,39.4139,57.1859),("murom-label-anchor",575,1672,42.0426,55.575),("smolensk-label-anchor",425,1690,32.0453,54.7826),("vitebsk-label-anchor",400,1654,30.2049,55.1904),("polotsk-label-anchor",355,1635,28.784,55.487),("turov-label-anchor",330,1743,27.735,52.068),("pinsk-label-anchor",285,1740,26.095,52.115),("kyiv-label-anchor",418,1808,30.5234,50.4501),("chernihiv-label-anchor",440,1782,31.2849,51.4982),("oka-volga-confluence",605,1640,44.0,56.33),("volodymyr-label-anchor",235,1765,24.32,50.85)]

def request_bytes(url):
    req=urllib.request.Request(url,headers={"User-Agent":"RulersOfRussiaHistoryCore/1.0 (historical-map research; github.com/nkuchenov-hash/rulers-of-russia)","Accept":"image/*,*/*;q=0.5"})
    with urllib.request.urlopen(req,timeout=90) as r:return r.read()

def gray(data,spec):
    im=cv2.imdecode(np.frombuffer(data,dtype=np.uint8),cv2.IMREAD_GRAYSCALE)
    if im is None:raise RuntimeError(f"Could not decode {spec['id']}")
    h,w=im.shape[:2]
    if (w,h)!=(spec['width'],spec['height']):raise RuntimeError(f"Unexpected dimensions for {spec['id']}: {w}x{h}")
    return cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8)).apply(im)

def stats(v):
    return {"median":round(float(np.median(v)),3),"p95":round(float(np.percentile(v,95)),3),"max":round(float(np.max(v)),3)} if len(v) else {"median":None,"p95":None,"max":None}

def align(ref,tgt):
    sift=cv2.SIFT_create(nfeatures=16000,contrastThreshold=.018,edgeThreshold=12)
    kr,dr=sift.detectAndCompute(ref,None); kt,dt=sift.detectAndCompute(tgt,None)
    if dr is None or dt is None:return {"candidateReusable":False,"reason":"no descriptors"}
    pairs=cv2.BFMatcher(cv2.NORM_L2).knnMatch(dr,dt,k=2); good=[m for m,n in pairs if m.distance<.72*n.distance]
    if len(good)<12:return {"candidateReusable":False,"keypoints":{"reference":len(kr),"target":len(kt)},"goodMatches":len(good),"reason":"too few ratio-test matches"}
    rp=np.float32([kr[m.queryIdx].pt for m in good]).reshape(-1,1,2); tp=np.float32([kt[m.trainIdx].pt for m in good]).reshape(-1,1,2)
    H,mask=cv2.findHomography(rp,tp,cv2.RANSAC,4.0,maxIters=12000,confidence=.999)
    if H is None or mask is None:return {"candidateReusable":False,"goodMatches":len(good),"reason":"homography failed"}
    ins=mask.ravel().astype(bool); ir=rp[ins]; it=tp[ins]
    pred=cv2.perspectiveTransform(ir.reshape(-1,1,2),H).reshape(-1,2); ferr=np.linalg.norm(pred-it.reshape(-1,2),axis=1)
    inv=np.linalg.inv(H); rt=cv2.perspectiveTransform(cv2.perspectiveTransform(ir.reshape(-1,1,2),H),inv).reshape(-1,2); rerr=np.linalg.norm(rt-ir.reshape(-1,2),axis=1)
    ic=int(ins.sum()); ratio=ic/len(good); det=float(np.linalg.det(H[:2,:2])); fs,rs=stats(ferr),stats(rerr)
    reusable=len(good)>=80 and ic>=50 and ratio>=.30 and fs['median'] is not None and fs['median']<=3 and fs['p95'] is not None and fs['p95']<=8 and rs['median'] is not None and rs['median']<=.1 and .65<=abs(det)<=1.45
    gcps=[]
    for gid,x,y,lon,lat in REFERENCE_GCPS:
        p=cv2.perspectiveTransform(np.float32([[[x,y]]]),H)[0,0]; gcps.append({"id":gid,"sourceReferencePixel":[x,y],"targetCandidatePixel":[round(float(p[0]),2),round(float(p[1]),2)],"lonLat":[lon,lat],"basis":"candidate transferred from pinned 862 Tornau GCP by SIFT/RANSAC raster homography"})
    return {"candidateReusable":reusable,"keypoints":{"reference":len(kr),"target":len(kt)},"goodMatches":len(good),"inliers":ic,"inlierRatio":round(ratio,4),"forwardReprojectionErrorPx":fs,"roundtripErrorPx":rs,"linearDeterminant":round(det,6),"homographyReferenceToTarget":[[round(float(v),10) for v in row] for row in H],"transferredGcps":gcps,"warning":"Transferred GCPs are research candidates only; independently validate recognizable anchors on the 1598 sheet before promotion."}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    rb=request_bytes(REFERENCE['url'])
    if hashlib.sha256(rb).hexdigest()!=REFERENCE['sha256']:raise RuntimeError("862 reference SHA-256 mismatch")
    # Reuse the exact source already captured by the preceding workflow step; avoid a second network fetch of the same Commons object.
    tb=TARGET_RASTER.read_bytes() if TARGET_RASTER.exists() else request_bytes(TARGET['url'])
    tsha1=hashlib.sha1(tb).hexdigest()
    if tsha1!=TARGET['sha1']:raise RuntimeError(f"1598 target SHA-1 mismatch: {tsha1}")
    reg=align(gray(rb,REFERENCE),gray(tb,TARGET))
    report={"schemaVersion":2,"purpose":"research-only same-atlas registration candidate for Tornau 1598-1682; no geometry promotion","reference":{**REFERENCE,"observedBytes":len(rb),"observedSha256":hashlib.sha256(rb).hexdigest()},"target":{**TARGET,"observedBytes":len(tb),"observedSha1":tsha1,"inputMode":"preceding-capture-raster" if TARGET_RASTER.exists() else "network-fallback","rightsStatus":"public-domain","rightsBasis":"Wikimedia Commons file page / Public Domain Mark; published 1910"},"registration":reg,"promotionGate":{"automaticPromotionAllowed":False,"requirements":["registration candidateReusable must be true","transferred anchors must be independently checked against recognizable target-sheet geography","1598 legend-specific spatial components must be reviewed against those controls","derived boundary must pass History Core spatial and strict completion audits"]}}
    (OUT/'registration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
