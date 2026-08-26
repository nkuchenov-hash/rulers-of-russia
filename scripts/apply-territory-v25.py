from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
sync = ROOT / 'scripts/sync-historical-world.mjs'

s = renderer.read_text()

s = s.replace("import {createTerrainQuadrantLod} from './terrainQuadrantLod';\n", '')

pattern = re.compile(
    r"    const geometry=new THREE\.SphereGeometry\(1,compact\?128:224,compact\?80:144\).*?    scene\.add\(new THREE\.HemisphereLight",
    re.S,
)
replacement = '''    const geometry=new THREE.SphereGeometry(1,compact?128:224,compact?80:144),baseMaterial=new THREE.MeshStandardMaterial({color:0x24302b,roughness:1,metalness:0,emissive:0x101713,emissiveIntensity:.22}),globe=new THREE.Mesh(geometry,baseMaterial);baseMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\\nfloat terrainLuma=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));\\nfloat waterSignal=(diffuseColor.b-diffuseColor.r)*0.9+(diffuseColor.g-diffuseColor.r)*0.25;\\nfloat waterMask=smoothstep(0.025,0.18,waterSignal);\\nfloat reliefValue=smoothstep(0.08,0.92,terrainLuma);\\nvec3 landTone=mix(vec3(0.055,0.065,0.050),vec3(0.46,0.405,0.285),reliefValue);\\nvec3 waterTone=mix(vec3(0.018,0.055,0.065),vec3(0.065,0.16,0.175),smoothstep(0.10,0.90,terrainLuma));\\ndiffuseColor.rgb=mix(landTone,waterTone,waterMask);\\ndiffuseColor.rgb=min(diffuseColor.rgb,vec3(0.54));`)};baseMaterial.customProgramCacheKey=()=>"terrain-v25-natural-earth-relief";scene.add(globe);
    const overlayMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.88,depthWrite:false}),overlayGeometry=new THREE.SphereGeometry(1.003,compact?128:192,compact?80:128),overlay=new THREE.Mesh(overlayGeometry,overlayMaterial);overlay.renderOrder=3;scene.add(overlay);overlay.visible=false;
    const loader=new THREE.TextureLoader();const base=process.env.NEXT_PUBLIC_BASE_PATH??'';let surfaceRank=-1;
    const applySurface=(raw,rank)=>{if(rank<surfaceRank){raw.dispose();return}surfaceRank=rank;raw.colorSpace=THREE.SRGBColorSpace;raw.minFilter=THREE.LinearMipmapLinearFilter;raw.magFilter=THREE.LinearFilter;raw.generateMipmaps=true;raw.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());const old=baseMaterial.map;baseMaterial.map=raw;baseMaterial.color.setHex(0xffffff);baseMaterial.needsUpdate=true;if(old&&old!==raw)old.dispose();renderRef.current()};
    loader.load(`${base}/data/territory/terrain/earth_relief_4096.webp`,t=>applySurface(t,0),undefined,()=>{});
    const maxGpu=renderer.capabilities.maxTextureSize||4096;
    if(maxGpu>=8192)loader.load(`${base}/data/territory/terrain/earth_relief_8192.webp`,t=>applySurface(t,1),undefined,()=>{});
    const loadHighRelief=()=>{if(!compact&&maxGpu>=12288)loader.load(`${base}/data/territory/terrain/earth_relief_12288.webp`,t=>applySurface(t,2),undefined,()=>{})};
    if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(loadHighRelief,{timeout:900});else window.setTimeout(loadHighRelief,260);
    scene.add(new THREE.HemisphereLight'''

s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise RuntimeError(f'globe texture block replacement count={count}')

s = s.replace(";const terrainLod=createTerrainQuadrantLod({scene,renderer,base});", ';')
s = s.replace("terrainLod.update(camera,d);", '')
s = s.replace("terrainLod.dispose();", '')
s = s.replace("const obj=new CSS2DObject(el);obj.position.copy", "const obj=new CSS2DObject(el);obj.visible=false;obj.position.copy")
s = s.replace("obj.element.style.display=show?'block':'none'", "obj.visible=show")
s = s.replace("if(!cityGate){obj.element.style.display='none';continue}", "if(!cityGate){obj.visible=false;continue}")
s = s.replace("obj.element.style.display=front&&nearEnough?'block':'none'", "obj.visible=front&&nearEnough")
s = s.replace("camDir.copy(camera.position).normalize();", '')
s = s.replace("objDir.copy(obj.position).normalize();", '')
s = s.replace(";const camDir=new THREE.Vector3(),objDir=new THREE.Vector3();", ';')

renderer.write_text(s)

t = sync.read_text()
for name in [
    'TERRAIN_NORMAL_URL',
    'TERRAIN_SURFACE_URL',
    'TERRAIN_SURFACE_8K_URL',
    'TERRAIN_SURFACE_21K_URL',
    'TERRAIN_LOD500_C1_URL',
    'TERRAIN_LOD500_D1_URL',
]:
    t = re.sub(rf"^const {name} = .*?;\n", '', t, flags=re.M)

for var in [
    'terrainNormalPath',
    'terrainSurfacePath',
    'terrainSurface8kPath',
    'terrainSurface21kPath',
    'terrainLod500C1Path',
    'terrainLod500D1Path',
]:
    t = re.sub(rf"^  const {var} = .*?;\n", '', t, flags=re.M)
    t = re.sub(rf"^    ensureBytes\({var}, .*?\),\n", '', t, flags=re.M)

terrain_pattern = re.compile(r"    terrain: \{.*?\n    \},\n    hydrography:", re.S)
terrain_replacement = '''    terrain: {
      relief_preview: 'terrain/earth_relief_4096.webp',
      relief_medium: 'terrain/earth_relief_8192.webp',
      relief_high: 'terrain/earth_relief_12288.webp',
      dataset: 'Natural Earth HYP_HR_SR_W cross-blended hypsometric shaded relief with water',
      source_resolution: '21600x10800',
      runtime_external_dependency: false
    },
    hydrography:'''
t, count = terrain_pattern.subn(terrain_replacement, t, count=1)
if count != 1:
    raise RuntimeError(f'terrain metadata replacement count={count}')

t = t.replace(
    '500m Eurasia terrain LOD, normalized polygons, rivers and modern countries vendored locally.',
    'progressive Natural Earth relief, normalized polygons, rivers and modern countries vendored locally.',
)
sync.write_text(t)

for relative in [
    'src/app/territory/terrainQuadrantLod.js',
    '.github/workflows/apply-territory-v22-patch.yml',
    '.github/workflows/apply-territory-v23-patch.yml',
    '.github/workflows/apply-territory-v24-occlusion.yml',
    '.github/workflows/vendor-terrain-relief-v25.yml',
    '.github/workflows/apply-territory-v25-relief.yml',
]:
    path = ROOT / relative
    if path.exists():
        path.unlink()

# Hard verification before any commit is allowed.
r = renderer.read_text()
t = sync.read_text()
required_renderer = [
    'earth_relief_4096.webp',
    'earth_relief_8192.webp',
    'earth_relief_12288.webp',
    'terrain-v25-natural-earth-relief',
    'obj.visible=show',
    'obj.visible=front&&nearEnough',
]
for token in required_renderer:
    if token not in r:
        raise RuntimeError(f'missing renderer token: {token}')
for forbidden in ['earth_surface_', 'terrainQuadrantLod', 'lod500_']:
    if forbidden in r:
        raise RuntimeError(f'forbidden renderer token remains: {forbidden}')
for forbidden in ['TERRAIN_SURFACE', 'TERRAIN_LOD500', 'TERRAIN_NORMAL']:
    if forbidden in t:
        raise RuntimeError(f'forbidden sync token remains: {forbidden}')
for relative in [
    'public/data/territory/terrain/earth_relief_4096.webp',
    'public/data/territory/terrain/earth_relief_8192.webp',
    'public/data/territory/terrain/earth_relief_12288.webp',
]:
    path = ROOT / relative
    if not path.exists() or path.stat().st_size <= 0:
        raise RuntimeError(f'missing relief asset: {relative}')

print('V25 clean relief patch verified.')
