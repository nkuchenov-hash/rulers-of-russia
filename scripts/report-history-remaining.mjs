import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const monthIndex = read(path.join(dataRoot, 'generated', 'month-index.json'));
const listJson = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort().map(x=>path.join(dir,x)) : [];
const flatten = (files,key)=>files.flatMap(f=>read(f)[key]??[]);
const changes = flatten(listJson(path.join(dataRoot,'territory-changes')), 'territoryChanges');
const events = flatten(listJson(path.join(dataRoot,'events')), 'events');
const provisional = (monthIndex.months??[]).filter(x=>x.status==='reconstruction-provisional');
const nextMonth=v=>{let y=+v.slice(0,4),m=+v.slice(5,7)+1;if(m===13){m=1;y++}return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}`};
const ranges=[];let cur=null;
for(const x of provisional.sort((a,b)=>a.month.localeCompare(b.month))){
  if(!cur||cur.polityId!==(x.polityId??null)||cur.coveragePeriodId!==(x.coveragePeriodId??null)||nextMonth(cur.endMonth)!==x.month){
    if(cur)ranges.push(cur);
    cur={startMonth:x.month,endMonth:x.month,monthCount:1,polityId:x.polityId??null,coveragePeriodId:x.coveragePeriodId??null,provisionalStateId:x.provisionalStateId??null};
  } else {cur.endMonth=x.month;cur.monthCount++;}
}
if(cur)ranges.push(cur);
const incomplete = x => ['research-required','source-located'].includes(x.reviewStatus);
const spatial = changes.filter(x=>x.reviewStatus==='source-verified' && x.geometryAction!=='metadata-only');
const unresolvedChanges = changes.filter(incomplete);
const unresolvedEvents = events.filter(incomplete);
console.log(JSON.stringify({
  monthCount:monthIndex.monthCount,
  verifiedMonths:(monthIndex.months??[]).filter(x=>x.status==='geometry-verified').length,
  provisionalMonths:provisional.length,
  ranges,
  spatialBlockers:spatial.map(x=>({id:x.id,polityId:x.polityId,effectiveDate:x.effectiveDate?.normalized,operation:x.operation,geometryMethod:x.geometry?.method,evidenceDocumentIds:x.evidenceDocumentIds??[]})),
  researchChanges:unresolvedChanges.map(x=>({id:x.id,polityId:x.polityId,effectiveDate:x.effectiveDate?.normalized,operation:x.operation,evidenceDocumentIds:x.evidenceDocumentIds??[]})),
  researchEvents:unresolvedEvents.map(x=>({id:x.id,polityId:x.polityId,date:x.date?.normalized,evidenceDocumentIds:x.evidenceDocumentIds??[]}))
},null,2));
