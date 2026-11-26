/* CaptureEvidence 1.0.0 — deterministic protein-group set analysis. MIT. */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const unique = xs => [...new Set(xs)];
  function parseDelimited(text, delimiter = '\t') {
    const rows = []; let row = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || value === '') quoted = !quoted;
        else value += c;
      } else if (!quoted && c === delimiter) { row.push(value); value = ''; }
      else if (!quoted && (c === '\n' || c === '\r')) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value); if (row.some(x => x !== '')) rows.push(row);
        row = []; value = '';
      } else value += c;
    }
    if (quoted) throw Error('Unclosed quoted field.');
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows;
  }
  function validateMap(map) {
    if (!Array.isArray(map) || !map.length) throw Error('The sample map must be a non-empty JSON array.');
    const cols = new Set(), labels = new Set();
    for (const s of map) {
      if (!s.cell || !['SS','PEG','C1','C2'].includes(s.condition) || !s.column || s.culture == null) throw Error('Each sample needs cell, condition (SS/PEG/C1/C2), column and culture.');
      if (cols.has(String(s.column))) throw Error('Duplicate experiment column: ' + s.column);
      cols.add(String(s.column));
      const key = JSON.stringify([s.cell, s.condition, s.culture]);
      if (labels.has(key)) throw Error('Duplicate culture within condition: ' + key);
      labels.add(key);
    }
    for (const cell of unique(map.map(x => x.cell)))
      for (const condition of ['SS','PEG','C1','C2'])
        if (!map.some(s => s.cell === cell && s.condition === condition)) throw Error('Missing ' + condition + ' samples in ' + cell);
    return map.map(s => ({...s, column:String(s.column)}));
  }
  function parseMaxQuant(text, sampleMap) {
    const map = validateMap(sampleMap), table = parseDelimited(text), header = table.shift();
    if (!header) throw Error('Empty proteinGroups file.');
    if (unique(header).length !== header.length) throw Error('Duplicate column names.');
    const required = ['id','Protein IDs','Majority protein IDs','Peptides','Unique peptides','Reverse','Potential contaminant','Only identified by site'];
    for (const s of map) required.push('LFQ intensity ' + s.column, 'MS/MS count ' + s.column);
    const missing = required.filter(k => !header.includes(k));
    if (missing.length) throw Error('Missing required columns: ' + missing.join(', '));
    const index = Object.fromEntries(header.map((h,i) => [h,i])), ids = new Set();
    const num = (row, key, integer = false) => {
      const raw = row[index[key]], value = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw Error('Invalid nonnegative number in row ' + row[index.id] + ', ' + key);
      return value;
    };
    const groups = table.map((r,i) => {
      if (r.length !== header.length) throw Error('Row ' + (i+2) + ' has ' + r.length + ' fields; expected ' + header.length);
      const id = r[index.id]; if (!id || ids.has(id)) throw Error('Empty or duplicate group id: ' + id); ids.add(id);
      return {id, proteins:r[index['Protein IDs']], majority:r[index['Majority protein IDs']],
        peptides:num(r,'Peptides',true), unique:num(r,'Unique peptides',true),
        excluded:['Reverse','Potential contaminant','Only identified by site'].some(k=>r[index[k]] === '+'),
        lfq:map.map(s=>num(r,'LFQ intensity '+s.column)), msms:map.map(s=>num(r,'MS/MS count '+s.column,true))};
    });
    return {version:VERSION, map, groups, sourceName:'Imported proteinGroups', sourceSHA256:null};
  }
  function analyze(data, options) {
    const o = Object.assign({cell:data.map[0].cell, category:'all', rule:'direct_peptides', minimum:2, control:'none'}, options);
    if (!['all','gly'].includes(o.category) || !['lfq','direct','direct_peptides'].includes(o.rule) || !['none','c2','both'].includes(o.control)) throw Error('Unknown analysis setting.');
    const ix = c => data.map.map((s,i) => s.cell === o.cell && s.condition === c ? i : -1).filter(i=>i>=0);
    const ss = ix('SS'), peg = ix('PEG'), controls = o.control === 'none' ? [] : o.control === 'c2' ? ix('C2') : [...ix('C1'),...ix('C2')];
    if (!ss.length || !peg.length || !Number.isInteger(o.minimum) || o.minimum < 1 || o.minimum > Math.min(ss.length,peg.length)) throw Error('Culture minimum exceeds available samples or selected cell is missing.');
    const groups = data.groups.filter(g=>!g.excluded && (o.category === 'all' || g.majority.includes('GLY')));
    const supported = (g,i) => g.lfq[i] > 0 && (o.rule === 'lfq' || g.msms[i] > 0) && (o.rule !== 'direct_peptides' || (g.peptides >= 2 && g.unique >= 1));
    const removed = g => controls.some(i=>g.lfq[i]>0);
    const count = (g, indices) => indices.filter(i=>supported(g,i)).length;
    const members = groups.map(g=>({id:g.id,proteins:g.proteins,majority:g.majority,peptides:g.peptides,unique:g.unique,
      ssCount:count(g,ss),pegCount:count(g,peg),controlObserved:removed(g),
      ssSamples:ss.map(i=>({column:data.map[i].column,lfq:g.lfq[i],msms:g.msms[i],supported:supported(g,i)})),
      pegSamples:peg.map(i=>({column:data.map[i].column,lfq:g.lfq[i],msms:g.msms[i],supported:supported(g,i)}))
    })).map(g=>({...g,SS:!g.controlObserved&&g.ssCount>=o.minimum,PEG:!g.controlObserved&&g.pegCount>=o.minimum}));
    const active = members.filter(g=>g.SS||g.PEG);
    const SS = active.filter(g=>g.SS).length, PEG = active.filter(g=>g.PEG).length, shared = active.filter(g=>g.SS&&g.PEG).length;
    const omissions=[];
    if (ss.length>1 && peg.length>1) for(const a of ss) for(const b of peg) {
      const s = ss.filter(i=>i!==a), p = peg.filter(i=>i!==b);
      const A=groups.filter(g=>!removed(g)&&s.some(i=>supported(g,i))), B=groups.filter(g=>!removed(g)&&p.some(i=>supported(g,i)));
      const bset=new Set(B.map(g=>g.id));
      omissions.push({omitSS:data.map[a].column,omitPEG:data.map[b].column,SS:A.length,PEG:B.length,difference:A.length-B.length,shared:A.filter(g=>bset.has(g.id)).length});
    }
    return {version:VERSION,sourceName:data.sourceName,sourceSHA256:data.sourceSHA256,map:data.map,options:o,
      inputGroups:data.groups.length,eligibleGroups:groups.length,SS,PEG,shared,union:SS+PEG-shared,
      SSonly:SS-shared,PEGonly:PEG-shared,retention:PEG?100*shared/PEG:null,listRatio:PEG?SS/PEG:null,
      sampleCounts:[...ss,...peg].map(i=>({column:data.map[i].column,condition:data.map[i].condition,culture:data.map[i].culture,count:groups.filter(g=>supported(g,i)&&!removed(g)).length})),members:active,omissions};
  }
  function csv(rows) {
    if (!rows.length) return '';
    const fields=Object.keys(rows[0]), safe=v=>{let s=v==null?'':String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    return [fields,...rows.map(r=>fields.map(k=>r[k]))].map(r=>r.map(safe).join(',')).join('\r\n')+'\r\n';
  }
  const api={VERSION,parseDelimited,validateMap,parseMaxQuant,analyze,csv};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CaptureEvidence=api;
})(typeof globalThis==='object'?globalThis:this);
