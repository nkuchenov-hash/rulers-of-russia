import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd();
const publicRoot=path.join(root,'public');
const dataRoot=path.join(publicRoot,'data','history-core');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const monthFile=path.join(dataRoot,'generated','month-index.json');
const certFile=path.join(dataRoot,'completion-certifications.json');
if(!fs.existsSync(monthFile)) throw new Error('Month index must exist before applying completion certifications');
if(!fs.existsSync(certFile)) throw new Error('Missing completion-certifications.json');
const index=read(monthFile);
const cert=read(certFile);
const ranges=cert.monthlyRangeCertifications??[];
const outDir=path.join(dataRoot,'generated','certified');
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});
const cache=new Map();
const matching=(item)=>ranges.filter(r=>r.polityId===item.polityId&&item.month>=r.startMonth&&item.month<=r.endMonth);
let upgraded=0;
for(const item of index.months??[]){
 if(item.status!=='reconstruction-provisional') continue;
 const matches=matching(item);
 if(matches.length!==1) throw new Error(`Provisional month ${item.month} (${item.polityId}) has ${matches.length} completion certifications; expected exactly 1`);
 const row=matches[0];
 if(item.forwardProxy===true) throw new Error(`Completion certification ${row.id} cannot certify explicit forward proxy month ${item.month}`);
 const key=`${row.id}|${item.geometryFile}`;
 let cached=cache.get(key);
 if(!cached){
   const sourcePath=path.join(publicRoot,item.geometryFile);
   if(!fs.existsSync(sourcePath)) throw new Error(`Missing source geometry ${item.geometryFile}`);
   const source=read(sourcePath);
   const hash=createHash('sha1').update(key).digest('hex').slice(0,12);
   const fileName=`${row.polityId}-${hash}.geojson`;
   const relative=`data/history-core/generated/certified/${fileName}`;
   const output={
     ...source,
     metadata:{
       ...(source.metadata??{}),
       dataset:'Rulers of Russia document-corroborated History Core reconstruction',
       status:'geometry-verified',
       verificationClass:'document-corroborated-reconstruction',
       certificationId:row.id,
       confidence:row.confidence,
       uncertaintyMeters:row.uncertaintyMeters,
       bootstrapGeometry:false,
       sourceBootstrapGeometry:true,
       boundedContinuity:row.allowBoundedContinuity===true,
       evidenceDocumentIds:row.evidenceDocumentIds,
       derivedFromChangeIds:row.derivedFromChangeIds??[],
       notes:row.notes??null,
       warning:'Historical reconstruction with explicit uncertainty. Do not interpret as a surveyed or cadastral boundary.'
     },
     features:(source.features??[]).map(feature=>({
       ...feature,
       properties:{
         ...(feature.properties??{}),
         history_core_status:'geometry-verified',
         history_core_verification_class:'document-corroborated-reconstruction',
         history_core_certification_id:row.id,
         history_core_confidence:row.confidence,
         history_core_uncertainty_m:row.uncertaintyMeters,
         history_core_bounded_continuity:row.allowBoundedContinuity===true
       }
     }))
   };
   fs.writeFileSync(path.join(outDir,fileName),JSON.stringify(output));
   cached={relative,snapshotId:`certified-${row.id}-${hash}`}; cache.set(key,cached);
 }
 item.geometryFile=cached.relative;
 item.status='geometry-verified';
 item.confidence=row.confidence;
 item.evidenceDocumentIds=row.evidenceDocumentIds;
 item.bootstrapGeometry=false;
 item.sourceBootstrapGeometry=true;
 item.forwardProxy=false;
 item.snapshotId=cached.snapshotId;
 item.provisionalStateId=null;
 item.certificationId=row.id;
 item.verificationClass='document-corroborated-reconstruction';
 item.uncertaintyMeters=row.uncertaintyMeters;
 item.boundedContinuity=row.allowBoundedContinuity===true;
 item.derivedFromChangeIds=row.derivedFromChangeIds??[];
 item.notes=row.notes??item.notes??null;
 upgraded++;
}
const statusCounts={};
for(const item of index.months??[]) statusCounts[item.status]=(statusCounts[item.status]??0)+1;
index.schema_version=Math.max(4,Number(index.schema_version??0));
index.statusCounts=statusCounts;
index.provisionalStateCount=0;
index.sourceProvisionalStateCount=cache.size;
index.certifiedReconstructionStateCount=cache.size;
index.certifiedReconstructionMonthCount=upgraded;
index.completionCertificationPolicy=cert.policy;
index.resolutionRule=`${index.resolutionRule} Remaining documentary-complete gaps may be promoted by completion-certifications.json only as document-corroborated reconstructions with explicit uncertainty; this does not claim surveyed precision.`;
fs.writeFileSync(monthFile,JSON.stringify(index));
fs.writeFileSync(path.join(dataRoot,'generated','completion-certification-index.json'),JSON.stringify({schema_version:1,policy:cert.policy,monthlyRanges:ranges,spatialChanges:cert.spatialChangeCertifications??[],upgradedMonths:upgraded,certifiedGeometryStates:cache.size},null,2)+'\n');
console.log(`History completion certifications applied: ${upgraded} months upgraded across ${cache.size} certified geometry states.`);
