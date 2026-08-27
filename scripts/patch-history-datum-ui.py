from pathlib import Path

path = Path('src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx')
text = path.read_text(encoding='utf-8')

old = "verifiedMaritimeCount=useMemo(()=>verifiedBoundaries.filter(item=>item.entry.track==='maritime-jurisdiction').length,[verifiedBoundaries]);"
new = "verifiedMaritimeCount=useMemo(()=>verifiedBoundaries.filter(item=>item.entry.track==='maritime-jurisdiction').length,[verifiedBoundaries]),verifiedDatumWarningCount=useMemo(()=>verifiedBoundaries.filter(item=>item.entry.displayDatumStatus==='source-geographic-untransformed').length,[verifiedBoundaries]);"
if old not in text:
    raise SystemExit('verified count marker not found')
text = text.replace(old, new, 1)

old_loop = "for(const item of verifiedBoundaries){const positions=buildVerifiedBoundarySegments(item.data,1.00062);if(!positions.length)continue;const maritime=item.entry.track==='maritime-jurisdiction';const under=makeWideLines(positions,maritime?0x102026:0x1b1710,maritime?(mobile?2.7:3.6):(mobile?3.8:5.1),maritime?.48:.72,maritime?'verified-maritime-underlay':'verified-boundary-underlay');under.line.renderOrder=maritime?7.55:7.7;group.add(under.line);const built=makeWideLines(positions,maritime?0xa9c7c5:0xf3d889,maritime?(mobile?1.35:1.75):(mobile?2.1:2.8),maritime?.88:1,maritime?'verified-maritime':'verified-boundary');built.line.renderOrder=maritime?7.65:8;group.add(built.line)}"
new_loop = "for(const item of verifiedBoundaries){const positions=buildVerifiedBoundarySegments(item.data,1.00062);if(!positions.length)continue;const maritime=item.entry.track==='maritime-jurisdiction',datumApprox=item.entry.displayDatumStatus==='source-geographic-untransformed';const underKind=maritime?(datumApprox?'verified-maritime-datum-underlay':'verified-maritime-underlay'):(datumApprox?'verified-boundary-datum-underlay':'verified-boundary-underlay');const lineKind=maritime?(datumApprox?'verified-maritime-datum':'verified-maritime'):(datumApprox?'verified-boundary-datum':'verified-boundary');const under=makeWideLines(positions,maritime?0x102026:0x1b1710,maritime?(mobile?(datumApprox?3.2:2.7):(datumApprox?4.2:3.6)):(mobile?(datumApprox?4.5:3.8):(datumApprox?6.0:5.1)),datumApprox?(maritime?.30:.42):(maritime?.48:.72),underKind);under.line.renderOrder=maritime?7.55:7.7;group.add(under.line);const built=makeWideLines(positions,maritime?0xa9c7c5:0xf3d889,maritime?(mobile?1.35:1.75):(mobile?2.1:2.8),datumApprox?(maritime?.72:.78):(maritime?.88:1),lineKind);built.line.renderOrder=maritime?7.65:8;group.add(built.line)}"
if old_loop not in text:
    raise SystemExit('verified overlay loop marker not found')
text = text.replace(old_loop, new_loop, 1)

old_modes = "else if(kind==='verified-maritime'){line.material.linewidth=mode==='states'?(mobile?1.55:2.0):(mobile?1.35:1.75);line.material.opacity=mode==='states'?.94:.88}"
new_modes = old_modes + "else if(kind==='verified-boundary-datum-underlay'){line.material.linewidth=mode==='states'?(mobile?4.9:6.6):(mobile?4.5:6.0);line.material.opacity=mode==='states'?.48:.42}else if(kind==='verified-boundary-datum'){line.material.linewidth=mode==='states'?(mobile?2.25:3.0):(mobile?2.1:2.8);line.material.opacity=mode==='states'?.84:.78}else if(kind==='verified-maritime-datum-underlay'){line.material.linewidth=mode==='states'?(mobile?3.5:4.6):(mobile?3.2:4.2);line.material.opacity=mode==='states'?.36:.30}else if(kind==='verified-maritime-datum'){line.material.linewidth=mode==='states'?(mobile?1.55:2.0):(mobile?1.35:1.75);line.material.opacity=mode==='states'?.80:.72}"
if old_modes not in text:
    raise SystemExit('verified mode styling marker not found')
text = text.replace(old_modes, new_modes, 1)

old_story = "{verifiedMaritimeCount?` · морское разграничение: ${verifiedMaritimeCount}`:''}"
new_story = old_story + "{verifiedDatumWarningCount?` · исходная СК: ${verifiedDatumWarningCount}`:''}"
if old_story not in text:
    raise SystemExit('story marker not found')
text = text.replace(old_story, new_story, 1)

path.write_text(text, encoding='utf-8')
print('Datum-aware territory UI patch applied')
