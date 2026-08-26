from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
s = renderer.read_text()

old_apply = "const applySurface=(raw,rank)=>{if(rank<surfaceRank){raw.dispose();return}surfaceRank=rank;raw.colorSpace=THREE.SRGBColorSpace;raw.minFilter=THREE.LinearMipmapLinearFilter;raw.magFilter=THREE.LinearFilter;raw.generateMipmaps=true;raw.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());const old=baseMaterial.map;baseMaterial.map=raw;baseMaterial.color.setHex(0xffffff);baseMaterial.needsUpdate=true;if(old&&old!==raw)old.dispose();renderRef.current()};"
new_apply = "const applySurface=(raw,rank)=>{if(rank<surfaceRank){raw.dispose();return}surfaceRank=rank;raw.colorSpace=THREE.SRGBColorSpace;raw.minFilter=THREE.LinearFilter;raw.magFilter=THREE.LinearFilter;raw.generateMipmaps=false;raw.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());const old=baseMaterial.map;baseMaterial.map=raw;baseMaterial.color.setHex(0xffffff);baseMaterial.needsUpdate=true;if(old&&old!==raw)old.dispose();renderRef.current()};"
if old_apply not in s:
    raise RuntimeError('applySurface block not found')
s = s.replace(old_apply, new_apply, 1)

old_high = "    const loadHighRelief=()=>{if(!compact&&maxGpu>=12288)loader.load(`${base}/data/territory/terrain/earth_relief_12288.webp`,t=>applySurface(t,2),undefined,()=>{});if(!compact&&maxGpu>=16380)window.setTimeout(()=>loader.load(`${base}/data/territory/terrain/earth_relief_16380.webp`,t=>applySurface(t,3),undefined,()=>{}),850)};\n    if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(loadHighRelief,{timeout:900});else window.setTimeout(loadHighRelief,260);\n"
if old_high not in s:
    raise RuntimeError('12K/16K progressive load block not found')
s = s.replace(old_high, '', 1)

# CSS2DRenderer must own visibility. Never permanently hide DOM labels with display:none.
s = s.replace("el.style.cssText=`display:none;white-space:nowrap;", "el.style.cssText=`white-space:nowrap;", 1)
s = s.replace("el.style.cssText='display:none;white-space:nowrap;", "el.style.cssText='white-space:nowrap;", 1)
s = s.replace("for(const obj of group.children)obj.element.style.display='none';zoomIntentRef.current=false;", "for(const obj of group.children)obj.visible=false;zoomIntentRef.current=false;", 1)
s = s.replace("for(const obj of cityLabelsRef.current.children)obj.element.style.display='none'", "for(const obj of cityLabelsRef.current.children)obj.visible=false", 1)

renderer.write_text(s)

check = renderer.read_text()
required = [
    'earth_relief_4096.webp',
    'earth_relief_8192.webp',
    'raw.generateMipmaps=false',
    'obj.visible=show',
    'obj.visible=front&&nearEnough',
]
for token in required:
    if token not in check:
        raise RuntimeError(f'missing required token: {token}')
for forbidden in [
    'earth_relief_12288.webp',
    'earth_relief_16380.webp',
    'loadHighRelief',
    "element.style.display='none'",
    'display:none;white-space:nowrap',
]:
    if forbidden in check:
        raise RuntimeError(f'forbidden runtime token remains: {forbidden}')

print('V30 stable texture-memory patch verified.')
