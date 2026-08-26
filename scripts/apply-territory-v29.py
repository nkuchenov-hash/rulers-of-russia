from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
s = path.read_text()

# Remove the entire regional ETOPO overlay-mesh system. It caused both
# close-range diamond/triangle artifacts and visible color changes because
# it was a second surface/material layered over the base globe.
s, count = re.subn(
    r"const DETAIL_RELIEF_TILES=\[.*?\nfunction snapshotAt",
    "function snapshotAt",
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f'could not remove regional LOD block: {count}')

old_groups = "const detailGroup=new THREE.Group(),borderGroup=new THREE.Group(),riverGroup=new THREE.Group(),countryGroup=new THREE.Group(),cityGroup=new THREE.Group();detailGroup.visible=false;cityGroup.visible=false;scene.add(detailGroup,borderGroup,riverGroup,countryGroup,cityGroup);"
new_groups = "const borderGroup=new THREE.Group(),riverGroup=new THREE.Group(),countryGroup=new THREE.Group(),cityGroup=new THREE.Group();cityGroup.visible=false;scene.add(borderGroup,riverGroup,countryGroup,cityGroup);"
if old_groups not in s:
    raise RuntimeError('detail group creation block not found')
s = s.replace(old_groups, new_groups, 1)

s = s.replace("detailGroup,detailTiles:new Map(),detailLoader:loader,", "", 1)
s = s.replace("updateDetailTerrain(runtime,d);", "", 1)
s = s.replace("[detailGroup,borderGroup,riverGroup]", "[borderGroup,riverGroup]", 1)

# Verification: no second globe surface may remain in production renderer.
for token in [
    'DETAIL_RELIEF_TILES',
    'makeLatLonPatchGeometry',
    'ensureDetailTile',
    'updateDetailTerrain',
    'detailGroup',
    'detailTiles',
    'detailLoader',
    '/etopo30s/',
]:
    if token in s:
        raise RuntimeError(f'regional LOD token remains: {token}')

# Preserve V28 interaction/navigation behavior.
for token in [
    'adaptiveControlSpeed',
    'timelineWheelRef',
    "scrollToYear(current+(raw>0?1:-1),'auto')",
    'onPeriodJump',
    'TERRITORY_PERIODS',
]:
    if token not in s:
        raise RuntimeError(f'V28 behavior lost: {token}')

path.write_text(s)
print('V29 verified: one continuous globe surface; no regional LOD mesh.')
