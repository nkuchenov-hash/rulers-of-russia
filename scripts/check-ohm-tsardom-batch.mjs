import fs from 'node:fs';
const ids=['2849501','2851886','2851885','2851884','2890610'];
const out={schema_version:1,relations:[]};
for(const relationId of ids){
 const url='https://api.openhistoricalmap.org/api/0.6/relation/'+relationId;
 const res=await fetch(url,{headers:{'User-Agent':'rulers-of-russia-history-core/1.0'}});
 if(!res.ok){out.relations.push({relation_id:relationId,error:'HTTP '+res.status});continue}
 const xml=await res.text(); const rel=xml.match(/<relation\s+([^>]+)>/); if(!rel){out.relations.push({relation_id:relationId,error:'relation missing'});continue}
 const attr=k=>rel[1].match(new RegExp(k+'="([^"]*)"'))?.[1]??null;
 const tags={}; for(const m of xml.matchAll(/<tag\s+k="([^"]+)"\s+v="([^"]*)"\s*\/>/g)) tags[m[1]]=m[2];
 out.relations.push({relation_id:relationId,url,version:attr('version'),timestamp:attr('timestamp'),changeset:attr('changeset'),explicit_license_tag:tags.license??null,source:tags.source??null,source_ref:tags['source:ref']??null,source_url:tags['source:url']??null,fixme:tags.fixme??null,tags});
}
fs.writeFileSync('ohm-tsardom-batch-provenance.json',JSON.stringify(out,null,2)+'\n'); console.log(JSON.stringify(out,null,2));