const fs = require('fs');

// backendGenerator.ts
let bg = fs.readFileSync('backend/src/engine/backend/backendGenerator.ts', 'utf8');
bg = bg.replace('export default router\n`', '${csvEndpoint}\nexport default router\n`');
fs.writeFileSync('backend/src/engine/backend/backendGenerator.ts', bg);

console.log("Fixed!");
