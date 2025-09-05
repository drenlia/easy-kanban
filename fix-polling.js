// Quick fix script to add includeSystem to polling
const fs = require('fs');

const appPath = '/home/daniel/projects/easy-kanban/src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Add includeSystem to the polling hook call
content = content.replace(
  'currentPriorities: availablePriorities,',
  'currentPriorities: availablePriorities,\n    includeSystem,'
);

fs.writeFileSync(appPath, content);
console.log('✅ Added includeSystem to useDataPolling call');
