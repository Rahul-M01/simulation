const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');
const re = /document\.getElementById\('btnPlay'\)\.textContent\s*=\s*[^;\n]+;/g;
const hits = c.match(re) || [];
console.log('matched:', hits.length);
hits.forEach(h => console.log(JSON.stringify(h)));
c = c.replace(re, "document.getElementById('btnPlay').classList.toggle('playing', state.playing);");
fs.writeFileSync('app.js', c);
