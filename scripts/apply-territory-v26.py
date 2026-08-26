from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
s = renderer.read_text()

replacements = [
    (
        "const CITY_DISTANCE=1.055;\n",
        "const CITY_DISTANCE=1.055;\nconst RUSSIAN_WORLD_RE=/(^|\\b)(russia|russian|soviet|ussr|union of soviet socialist republics|kievan rus|rus|muscovy|moscow|novgorod|vladimir)(\\b|$)/i;\n",
    ),
    (
        "function countryColor(f,i=0){const name=featureName(f);let h=23+i*17;for(let k=0;k<name.length;k++)h=((h<<5)-h+name.charCodeAt(k))|0;return COUNTRY_PALETTE[Math.abs(h)%COUNTRY_PALETTE.length]}\n",
        "function countryColor(f,i=0){const name=featureName(f);let h=23+i*17;for(let k=0;k<name.length;k++)h=((h<<5)-h+name.charCodeAt(k))|0;return COUNTRY_PALETTE[Math.abs(h)%COUNTRY_PALETTE.length]}\nfunction isRussianWorldFeature(f){return RUSSIAN_WORLD_RE.test(featureName(f))}\n",
    ),
    (
        "function buildPolygonSegments(features,radius=1.0105)",
        "function buildPolygonSegments(features,radius=1.0002)",
    ),
    (
        "function buildRiverBuckets(collection,radius=1.012)",
        "function buildRiverBuckets(collection,radius=1.00028)",
    ),
    (
        "const m=new LineMaterial({color,linewidth,transparent:true,opacity,depthWrite:false,depthTest:true});const line=new LineSegments2(g,m);",
        "const m=new LineMaterial({color,linewidth,transparent:true,opacity,depthWrite:false,depthTest:true});m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1.5;const line=new LineSegments2(g,m);",
    ),
    (
        "const m=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true});const line=new THREE.LineSegments(g,m);",
        "const m=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true});m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;const line=new THREE.LineSegments(g,m);",
    ),
    (
        "(world?.features??[]).forEach((f,i)=>{ctx.globalAlpha=.84;ctx.fillStyle=countryColor(f,i);ctx.fill(draw(f),'evenodd')});",
        "(world?.features??[]).filter(f=>!isRussianWorldFeature(f)).forEach((f,i)=>{ctx.globalAlpha=.84;ctx.fillStyle=countryColor(f,i);ctx.fill(draw(f),'evenodd')});",
    ),
    (
        "const overlayMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.88,depthWrite:false}),overlayGeometry=new THREE.SphereGeometry(1.003,compact?128:192,compact?80:128),overlay=new THREE.Mesh(overlayGeometry,overlayMaterial);overlay.renderOrder=3;scene.add(overlay);overlay.visible=false;",
        "const overlayMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.46,depthWrite:false,depthTest:true}),overlayGeometry=new THREE.SphereGeometry(1.0003,compact?128:192,compact?80:128),overlay=new THREE.Mesh(overlayGeometry,overlayMaterial);overlayMaterial.polygonOffset=true;overlayMaterial.polygonOffsetFactor=-1;overlayMaterial.polygonOffsetUnits=-1;overlay.renderOrder=3;scene.add(overlay);overlay.visible=false;",
    ),
    (
        "const loadHighRelief=()=>{if(!compact&&maxGpu>=12288)loader.load(`${base}/data/territory/terrain/earth_relief_12288.webp`,t=>applySurface(t,2),undefined,()=>{})};",
        "const loadHighRelief=()=>{if(!compact&&maxGpu>=12288)loader.load(`${base}/data/territory/terrain/earth_relief_12288.webp`,t=>applySurface(t,2),undefined,()=>{});if(!compact&&maxGpu>=16380)window.setTimeout(()=>loader.load(`${base}/data/territory/terrain/earth_relief_16380.webp`,t=>applySurface(t,3),undefined,()=>{}),850)};",
    ),
    (
        "const all=buildPolygonSegments(world.features);",
        "const worldBorderFeatures=world.features.filter(f=>!isRussianWorldFeature(f));const all=buildPolygonSegments(worldBorderFeatures,1.0002);",
    ),
    (
        "const ru=buildPolygonSegments(russiaFeatures,1.013);",
        "const ru=buildPolygonSegments(russiaFeatures,1.00022);",
    ),
]

for old, new in replacements:
    if old not in s:
        raise RuntimeError(f'missing expected renderer token: {old[:120]}')
    s = s.replace(old, new, 1)

renderer.write_text(s)

# Hard verification.
r = renderer.read_text()
required = [
    'earth_relief_16380.webp',
    'opacity:.46',
    'SphereGeometry(1.0003',
    'buildPolygonSegments(features,radius=1.0002)',
    'buildRiverBuckets(collection,radius=1.00028)',
    'world.features.filter(f=>!isRussianWorldFeature(f))',
    'buildPolygonSegments(russiaFeatures,1.00022)',
    'polygonOffsetFactor=-1',
]
for token in required:
    if token not in r:
        raise RuntimeError(f'missing V26 token: {token}')
for forbidden in [
    'buildPolygonSegments(features,radius=1.0105)',
    'buildRiverBuckets(collection,radius=1.012)',
    'buildPolygonSegments(russiaFeatures,1.013)',
    'opacity:.88,depthWrite:false',
]:
    if forbidden in r:
        raise RuntimeError(f'old V25 token remains: {forbidden}')

for relative in [
    '.github/workflows/apply-territory-v26.yml',
    'scripts/apply-territory-v26.py',
]:
    path = ROOT / relative
    if path.exists():
        path.unlink()

print('V26 renderer patch verified.')
