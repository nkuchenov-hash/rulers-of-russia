import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dataRoot=path.join(root,'public','data','history-core');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const certFile=path.join(dataRoot,'completion-certifications.json');
if(!fs.existsSync(certFile)) throw new Error('Missing History Core completion certifications');
const cert=read(certFile);
if(cert.schema_version!==1) throw new Error(`Unsupported completion certification schema ${cert.schema_version}`);
if(cert.policy?.verificationClass!=='document-corroborated-reconstruction') throw new Error('Completion certification policy must declare document-corroborated-reconstruction');

const documents=read(path.join(dataRoot,'documents.json')).documents??[];
const documentIds=new Set(documents.map(x=>x.id));
const coverage=read(path.join(dataRoot,'coverage-periods.json')).periods??[];
const changes=[];
const changeDir=path.join(dataRoot,'territory-changes');
for(const name of fs.readdirSync(changeDir).filter(x=>x.endsWith('.json')).sort()) changes.push(...(read(path.join(changeDir,name)).territoryChanges??[]));
const changeById=new Map(changes.map(x=>[x.id,x]));
const assertMonth=(v,label)=>{if(!/^\d{4}-\d{2}$/.test(v??'')) throw new Error(`${label} must be YYYY-MM`);const m=Number(v.slice(5));if(m<1||m>12)throw new Error(`${label} has invalid month ${v}`)};
const seenIds=new Set();
const ranges=cert.monthlyRangeCertifications??[];
for(const row of ranges){
 if(!row.id||seenIds.has(row.id)) throw new Error(`Duplicate/missing completion certification id ${row.id}`); seenIds.add(row.id);
 assertMonth(row.startMonth,`${row.id} startMonth`); assertMonth(row.endMonth,`${row.id} endMonth`);
 if(row.startMonth>row.endMonth) throw new Error(`${row.id} has reversed range`);
 if(!row.polityId) throw new Error(`${row.id} has no polityId`);
 if(!['low','medium','high'].includes(row.confidence)) throw new Error(`${row.id} has invalid confidence`);
 if(!Number.isFinite(row.uncertaintyMeters)||row.uncertaintyMeters<=0) throw new Error(`${row.id} must have positive uncertaintyMeters`);
 if(!Array.isArray(row.evidenceDocumentIds)||!row.evidenceDocumentIds.length) throw new Error(`${row.id} has no evidence documents`);
 for(const id of row.evidenceDocumentIds) if(!documentIds.has(id)) throw new Error(`${row.id} references unknown document ${id}`);
 const period=coverage.find(p=>p.polityId===row.polityId&&row.startMonth>=p.startMonth&&row.endMonth<=p.endMonth);
 if(!period) throw new Error(`${row.id} is not contained by a matching coverage period`);
 if(row.allowBoundedContinuity===true&&!row.notes) throw new Error(`${row.id} bounded continuity requires an explanatory note`);
 for(const id of row.derivedFromChangeIds??[]) if(!changeById.has(id)) throw new Error(`${row.id} references unknown change ${id}`);
}
for(let i=0;i<ranges.length;i++) for(let j=i+1;j<ranges.length;j++){
 const a=ranges[i],b=ranges[j]; if(a.polityId!==b.polityId) continue;
 if(a.startMonth<=b.endMonth&&b.startMonth<=a.endMonth) throw new Error(`Completion certification ranges overlap: ${a.id} / ${b.id}`);
}

const changeCerts=cert.spatialChangeCertifications??[];
const seenChanges=new Set();
for(const row of changeCerts){
 if(!row.changeId||seenChanges.has(row.changeId)) throw new Error(`Duplicate/missing spatial change certification ${row.changeId}`); seenChanges.add(row.changeId);
 const change=changeById.get(row.changeId); if(!change) throw new Error(`Unknown certified spatial change ${row.changeId}`);
 if(row.representation!=='document-corroborated-reconstruction-envelope') throw new Error(`${row.changeId} has unsupported representation ${row.representation}`);
 if(!Number.isFinite(row.uncertaintyMeters)||row.uncertaintyMeters<=0) throw new Error(`${row.changeId} must have positive uncertaintyMeters`);
 if(!Array.isArray(row.evidenceDocumentIds)||!row.evidenceDocumentIds.length) throw new Error(`${row.changeId} has no evidence documents`);
 for(const id of row.evidenceDocumentIds) if(!documentIds.has(id)) throw new Error(`${row.changeId} references unknown document ${id}`);
 const changeEvidence=new Set(change.evidenceDocumentIds??[]);
 if(!row.evidenceDocumentIds.some(id=>changeEvidence.has(id))) throw new Error(`${row.changeId} certification does not cite the change's own evidence lineage`);
}

console.log(`History completion certifications valid: ${ranges.length} monthly ranges, ${changeCerts.length} spatial changes.`);
