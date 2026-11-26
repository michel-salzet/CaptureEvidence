'use strict';
const fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'demo.json'),'utf8'));
const core=fs.readFileSync(path.join(__dirname,'core.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app.template.html'),'utf8').replace('/* CORE */',()=>core).replace('/* DATA */',()=>JSON.stringify(data).replace(/</g,'\\u003c'));
fs.mkdirSync(path.join(__dirname,'dist'),{recursive:true});fs.writeFileSync(path.join(__dirname,'dist/CaptureEvidence.html'),html);console.log('Built offline application');
