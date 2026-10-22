'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const addon of ['calendar-raster','daily-planner','mail-address-filer']) {
 const target=path.join(root,'addons',addon,'diagnostics');fs.mkdirSync(target,{recursive:true});
 for(const file of fs.readdirSync(path.join(root,'shared/diagnostics'))) fs.copyFileSync(path.join(root,'shared/diagnostics',file),path.join(target,file));
}
console.log('Diagnostic runtime synchronized to three add-ons.');
