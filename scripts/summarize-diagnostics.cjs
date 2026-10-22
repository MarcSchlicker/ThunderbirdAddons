'use strict';
const fs=require('node:fs');
function summarize(report) {
  if(report?.schemaVersion!==1 || typeof report.runId!=='string' || !Array.isArray(report.checks) || report.checks.length>1000) throw new Error('INVALID_REPORT');
  const counts={passed:0,failed:0,skipped:0};
  const findings=[];
  const safe=value=>typeof value==='string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:'UNKNOWN';
  for(const check of report.checks) {
    if(!Object.hasOwn(counts,check?.status)) throw new Error('INVALID_STATUS');
    counts[check.status]++;
    if(check.status!=='passed') findings.push({id:safe(check.id),status:check.status,code:safe(check.code)});
  }
  return {counts,findings};
}
module.exports={summarize};
if(require.main===module) {
  try {
    const file=process.argv[2];
    if(!file || fs.statSync(file).size>2_000_000) throw new Error('INVALID_FILE');
    console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(file,'utf8'))),null,2));
  } catch {console.error('Diagnoseformat oder Dateigröße ungültig.');process.exitCode=1;}
}
