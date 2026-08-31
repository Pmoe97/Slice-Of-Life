
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['image.js', 'peek.js'] });
const cpp = api('composePeekPrompt.toString()');
console.log('peek: intimate\\s*:\\s*true?', /intimate\s*:\s*true/.test(cpp));
console.log('peek has intimate?', cpp.includes('intimate'));
const tp = api('takePhoto.toString()');
console.log('photo: has prompt?', tp.includes('prompt'), 'has seed?', tp.includes('seed'));
const cap = api('captureSave.toString()');
console.log('cap: plateKey\\ (?', /plateKey\(/.test(cap));
console.log('cap slice:', cap.slice(cap.indexOf('plateKey') - 30, cap.indexOf('plateKey') + 40));
return 'ok';
