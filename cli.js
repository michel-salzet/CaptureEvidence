#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),C=require('./core.js');
const [input,mapFile,optionsFile]=process.argv.slice(2);
if(!input||!mapFile){console.error('Usage: node src/cli.js proteinGroups.txt sample-map.json [options.json]');process.exit(2);}
try{const bytes=fs.readFileSync(input),data=C.parseMaxQuant(bytes.toString('utf8'),JSON.parse(fs.readFileSync(mapFile,'utf8')));data.sourceName=require('node:path').basename(input);data.sourceSHA256=crypto.createHash('sha256').update(bytes).digest('hex');const options=optionsFile?JSON.parse(fs.readFileSync(optionsFile,'utf8')):{};process.stdout.write(JSON.stringify(C.analyze(data,options),null,2)+'\n');}catch(e){console.error(e.message);process.exit(1);}
