from pathlib import Path

path = Path('src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx')
text = path.read_text(encoding='utf-8')

old_component = "  const period=territoryPeriodAt(year),{index,historyState,world,worldYear,russia,rivers,verifiedBoundaries}=useHistoricalData(year,month,period.polityId),russiaFeatures=useMemo(()=>historyState?(russia?.features??[]):selectRussia(russia,year),[russia,year,historyState]),russiaKey=useMemo(()=>featureSetKey(russiaFeatures),[russiaFeatures]),verifiedBoundaryKey=useMemo(()=>verifiedBoundaries.map(item=>`${item.entry.id}:${item.entry.effectiveFrom}`).join('|'),[verifiedBoundaries]);"
new_component = "  const period=territoryPeriodAt(year),{index,historyState,world,worldYear,russia,rivers,verifiedBoundaries}=useHistoricalData(year,month,period.polityId),russiaFeatures=useMemo(()=>historyState?(russia?.features??[]):selectRussia(russia,year),[russia,year,historyState]),russiaKey=useMemo(()=>featureSetKey(russiaFeatures),[russiaFeatures]),verifiedBoundaryKey=useMemo(()=>verifiedBoundaries.map(item=>`${item.entry.id}:${item.entry.effectiveFrom}:${item.entry.track}`).join('|'),[verifiedBoundaries]),verifiedStateBoundaryCount=useMemo(()=>verifiedBoundaries.filter(item=>item.entry.track==='russian-legal-border').length,[verifiedBoundaries]),verifiedMaritimeCount=useMemo(()=>verifiedBoundaries.filter(item=>item.entry.track==='maritime-jurisdiction').length,[verifiedBoundaries]);"
if old_component not in text:
    raise SystemExit('Expected component History Core line not found')
text = text.replace(old_component, new_component, 1)

old_overlay = "for(const item of verifiedBoundaries){const positions=buildVerifiedBoundarySegments(item.data,1.00062);if(!positions.length)continue;const under=makeWideLines(positions,0x1b1710,mobile?3.8:5.1,.72,'verified-boundary-underlay');under.line.renderOrder=7.7;group.add(under.line);const built=makeWideLines(positions,0xf3d889,mobile?2.1:2.8,1,'verified-boundary');built.line.renderOrder=8;group.add(built.line)}"
new_overlay = "for(const item of verifiedBoundaries){const positions=buildVerifiedBoundarySegments(item.data,1.00062);if(!positions.length)continue;const maritime=item.entry.track==='maritime-jurisdiction';const under=makeWideLines(positions,maritime?0x102026:0x1b1710,maritime?(mobile?2.7:3.6):(mobile?3.8:5.1),maritime?.48:.72,maritime?'verified-maritime-underlay':'verified-boundary-underlay');under.line.renderOrder=maritime?7.55:7.7;group.add(under.line);const built=makeWideLines(positions,maritime?0xa9c7c5:0xf3d889,maritime?(mobile?1.35:1.75):(mobile?2.1:2.8),maritime?.88:1,maritime?'verified-maritime':'verified-boundary');built.line.renderOrder=maritime?7.65:8;group.add(built.line)}"
if old_overlay not in text:
    raise SystemExit('Expected verified overlay loop not found')
text = text.replace(old_overlay, new_overlay, 1)

old_modes = "else if(kind==='verified-boundary-underlay'){line.material.linewidth=mode==='states'?(mobile?4.2:5.7):(mobile?3.8:5.1);line.material.opacity=.72}else if(kind==='verified-boundary'){line.material.linewidth=mode==='states'?(mobile?2.35:3.1):(mobile?2.1:2.8);line.material.opacity=1}"
new_modes = old_modes + "else if(kind==='verified-maritime-underlay'){line.material.linewidth=mode==='states'?(mobile?3.0:4.0):(mobile?2.7:3.6);line.material.opacity=mode==='states'?.56:.48}else if(kind==='verified-maritime'){line.material.linewidth=mode==='states'?(mobile?1.55:2.0):(mobile?1.35:1.75);line.material.opacity=mode==='states'?.94:.88}"
if old_modes not in text:
    raise SystemExit('Expected verified mode styling not found')
text = text.replace(old_modes, new_modes, 1)

old_story = "{verifiedBoundaries.length?` · проверенных участков ${verifiedBoundaries.length}`:''}"
new_story = "{verifiedStateBoundaryCount?` · проверенная госграница: ${verifiedStateBoundaryCount}`:''}{verifiedMaritimeCount?` · морское разграничение: ${verifiedMaritimeCount}`:''}"
if old_story not in text:
    raise SystemExit('Expected verified boundary story text not found')
text = text.replace(old_story, new_story, 1)

path.write_text(text, encoding='utf-8')
print('Boundary track UI patch applied')
