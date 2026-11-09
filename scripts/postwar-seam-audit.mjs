// Read-only antimeridian seam evidence; does not repair geometry or prove accuracy.
import fs from 'node:fs';
export function inspectSeam(doc,name='USSR'){
 const features=doc.type==='FeatureCollection'?doc.features:[doc];
 const selected=features.filter(f=>f.type==='Feature'&&String(f.properties?.NAME??'').trim().toUpperCase()===name.toUpperCase());
 if(selected.length!==1)throw Error('Expected exactly one selected feature');
 const g=selected[0].geometry;
 if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw Error('Expected polygon geometry');
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates, rings=[];
 for(const [polygonIndex,poly] of polygons.entries())for(const [ringIndex,ring] of poly.entries()){
  if(!Array.isArray(ring)||ring.length<4)throw Error('Invalid ring');
  const seamVertices=[],seamEdges=[];
  for(let i=0;i<ring.length;i++){
   const [lon,lat]=ring[i];
   if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)throw Error('Invalid coordinate');
   if(Math.abs(Math.abs(lon)-180)<1e-9)seamVertices.push({index:i,longitude:lon,latitude:lat});
   if(i&&Math.abs(Math.abs(ring[i-1][0])-180)<1e-9&&Math.abs(Math.abs(lon)-180)<1e-9&&Math.abs(ring[i-1][0]-lon)<1e-9)
    seamEdges.push({index:i-1,from:ring[i-1],to:ring[i]});
  }
  if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Unclosed ring');
  if(seamVertices.length)rings.push({polygonIndex,ringIndex,kind:ringIndex?'hole':'outer',vertices:ring.length-1,seamVertices,seamEdges});
 }
 const contacts=[];
 for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++)
  for(const a of rings[i].seamVertices)for(const b of rings[j].seamVertices)
   if(Math.abs(a.latitude-b.latitude)<1e-9)contacts.push({a:[rings[i].polygonIndex,rings[i].ringIndex,a.index],b:[rings[j].polygonIndex,rings[j].ringIndex,b.index],latitude:a.latitude});
 // A closed ring repeats its first vertex at the last index. Preserve raw
 // index-level contacts for forensics, but count each physical seam location once.
 const uniqueContacts=[];
 const seen=new Set();
 for(const contact of contacts){
  const a=rings.find(r=>r.polygonIndex===contact.a[0]&&r.ringIndex===contact.a[1]);
  const b=rings.find(r=>r.polygonIndex===contact.b[0]&&r.ringIndex===contact.b[1]);
  const av=a.seamVertices.find(v=>v.index===contact.a[2]);
  const bv=b.seamVertices.find(v=>v.index===contact.b[2]);
  // +180 and -180 are the same meridian on the globe. Deduplicate by\n  // component pair and physical latitude, while retaining raw vertex evidence.\n  const key=[contact.a[0],contact.a[1],contact.b[0],contact.b[1],contact.latitude].join('|');
  if(!seen.has(key)){seen.add(key);uniqueContacts.push(contact);}
 }
 return {name,polygonCount:polygons.length,seamRingCount:rings.length,rings,contacts,uniqueContacts,uniqueContactCount:uniqueContacts.length,limitations:'Coincident seam vertices are diagnostic candidates, not proof of invalid topology or historical accuracy.'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{if(!process.argv[2])throw Error('Usage: node scripts/postwar-seam-audit.mjs <snapshot.geojson> [NAME]');
 console.log(JSON.stringify(inspectSeam(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]??'USSR'),null,2));}
 catch(e){console.error(e.message);process.exitCode=2}
}
