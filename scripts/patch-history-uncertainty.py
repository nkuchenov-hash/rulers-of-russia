from pathlib import Path

path = Path('src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx')
text = path.read_text(encoding='utf-8')

old_border = """  useEffect(()=>{const group=borderRef.current;if(!group||!world)return;group.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});group.clear();const worldBorderFeatures=world.features.filter(f=>!isRussianWorldFeature(f));const all=buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures);if(all.length){const built=makeWideLines(all,0xd2cfbf,mobile?1.25:1.75,.8,'world-border');built.line.renderOrder=6;group.add(built.line)}const ru=buildPolygonSegments(russiaFeatures,1.00014);if(ru.length){const built=makeWideLines(ru,0xe1c374,mobile?1.95:2.6,.95,'russia-border');built.line.renderOrder=7;group.add(built.line)}const box=hostRef.current?.getBoundingClientRect();if(box)group.children.forEach(x=>x.material?.resolution?.set?.(box.width,box.height));renderRef.current()},[world,russiaKey,mobile]);"""
new_border = """  useEffect(()=>{const group=borderRef.current;if(!group||!world)return;group.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});group.clear();const worldBorderFeatures=world.features.filter(f=>!isRussianWorldFeature(f));const all=buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures);if(all.length){const built=makeWideLines(all,0xd2cfbf,mobile?1.25:1.75,.8,'world-border');built.line.renderOrder=6;group.add(built.line)}const ru=buildPolygonSegments(russiaFeatures,1.00014),verified=historyState?.status==='geometry-verified',proxy=historyState?.forwardProxy===true,confidence=String(historyState?.confidence??'').toLowerCase();if(ru.length){if(!verified){const low=proxy||confidence==='low',halo=makeWideLines(ru,0xe1c374,mobile?(low?5.8:4.7):(low?8.2:6.6),proxy?.10:low?.14:.18,'russia-uncertainty');halo.line.renderOrder=6.5;group.add(halo.line)}const built=makeWideLines(ru,verified?0xe1c374:0xd6c58f,verified?(mobile?1.95:2.6):(mobile?1.6:2.1),verified?.95:proxy?.52:.68,'russia-border');built.line.renderOrder=7;group.add(built.line)}const box=hostRef.current?.getBoundingClientRect();if(box)group.children.forEach(x=>x.material?.resolution?.set?.(box.width,box.height));renderRef.current()},[world,russiaKey,mobile,historyState?.status,historyState?.confidence,historyState?.forwardProxy]);"""
if old_border not in text:
    raise SystemExit('Expected border effect not found; refusing unsafe patch')
text = text.replace(old_border, new_border, 1)

old_mode = """else if(kind==='russia-border'){line.material.linewidth=mode==='states'?(mobile?2.3:3.0):(mobile?1.95:2.6);line.material.opacity=mode==='states'?.99:.95}"""
new_mode = """else if(kind==='russia-border'){const verified=historyState?.status==='geometry-verified',proxy=historyState?.forwardProxy===true;line.material.linewidth=verified?(mode==='states'?(mobile?2.3:3.0):(mobile?1.95:2.6)):(mode==='states'?(mobile?1.85:2.35):(mobile?1.6:2.1));line.material.opacity=verified?(mode==='states'?.99:.95):(proxy?.52:mode==='states'?.76:.68)}else if(kind==='russia-uncertainty'){const low=historyState?.forwardProxy===true||String(historyState?.confidence??'').toLowerCase()==='low';line.material.linewidth=mode==='states'?(mobile?(low?6.4:5.2):(low?9.0:7.2)):(mobile?(low?5.8:4.7):(low?8.2:6.6));line.material.opacity=historyState?.forwardProxy===true?.10:low?.14:mode==='states'?.22:.18}"""
if old_mode not in text:
    raise SystemExit('Expected mode border styling not found; refusing unsafe patch')
text = text.replace(old_mode, new_mode, 1)
text = text.replace("},[mode,mobile]);", "},[mode,mobile,historyState?.status,historyState?.confidence,historyState?.forwardProxy]);", 1)

old_story = """<p>Исторический мировой срез {worldYear??'—'} года · {historyState?`History Core ${historyState.month} · ${historyState.status==='geometry-verified'?'проверенная геометрия':'реконструкция'}`:'аварийный архивный fallback'} · рельеф, границы, названия и гидрография</p>"""
new_story = """<p>Исторический мировой срез {worldYear??'—'} года · {historyState?`History Core ${historyState.month} · ${historyState.status==='geometry-verified'?'проверенная геометрия':`реконструкция · достоверность ${historyState.confidence??'не указана'}${historyState.forwardProxy?' · поздний proxy':''}`}`:'аварийный архивный fallback'} · рельеф, границы, названия и гидрография</p>"""
if old_story not in text:
    raise SystemExit('Expected History Core story text not found; refusing unsafe patch')
text = text.replace(old_story, new_story, 1)

path.write_text(text, encoding='utf-8')
print('History Core uncertainty styling patched successfully')
