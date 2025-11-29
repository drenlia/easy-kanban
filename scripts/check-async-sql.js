#!/usr/bin/env node
/**
 * Script to find SQL statements that might be missing async/await
 * 
 * This script searches for patterns that indicate synchronous database calls
 * that need to be converted to async/await for proxy support.
 * 
 * Usage: node scripts/check-async-sql.js
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '../server');

// Patterns to search for
const patterns = [
  {
    name: 'Direct prepare().all/get/run() calls',
    regex: /\.prepare\([^)]+\)\.(all|get|run)\(/g,
    description: 'These need to use wrapQuery() and await'
  },
  {
    name: 'stmt.all/get/run() without await',
    regex: /(?<!await\s)(?<!await\s\()stmt\.(all|get|run)\(/g,
    description: 'These need await keyword'
  },
  {
    name: 'Statement variable .run/get/all() without await (any variable name)',
    regex: /(?<!await\s)(?<!await\s\()\w+[Ss]tmt\.(all|get|run)\(/g,
    description: 'These need await keyword and wrapQuery (catches updateStmt, insertStmt, etc.)'
  },
  {
    name: 'db.exec() without await',
    regex: /(?<!await\s)(?<!await\s\()db\.exec\(/g,
    description: 'These need await keyword'
  },
  {
    name: 'db.pragma() without await',
    regex: /(?<!await\s)(?<!await\s\()db\.pragma\(/g,
    description: 'These need await keyword'
  }
];

// Files to exclude
const excludePatterns = [
  /node_modules/,
  /\.test\.js$/,
  /\.spec\.js$/,
  /dbAsync\.js$/, // Helper file - expected to have sync patterns
  /databaseProxy\.js$/, // Proxy implementation - expected patterns
  /queryLogger\.js$/ // Query logger - expected patterns
];

async function findFiles(dir, fileList = []) {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = join(dir, file.name);
    
    if (file.isDirectory()) {
      await findFiles(filePath, fileList);
    } else if (file.name.endsWith('.js')) {
      // Check if file should be excluded
      const shouldExclude = excludePatterns.some(pattern => 
        pattern.test(filePath)
      );
      
      if (!shouldExclude) {
        fileList.push(filePath);
      }
    }
  }
  
  return fileList;
}

async function checkFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1]?.trim() || '';
      
      // Skip if it's in a comment
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
        continue;
      }
      
      // Skip if it's already using wrapQuery or dbAsync helpers
      const beforeMatch = content.substring(Math.max(0, match.index - 200), match.index);
      const afterMatch = content.substring(match.index, Math.min(content.length, match.index + 50));
      const context = beforeMatch + afterMatch;
      
      // Check if it's already wrapped or using async helpers
      if (context.includes('wrapQuery') || 
          context.includes('dbAll') || 
          context.includes('dbGet') || 
          context.includes('dbRun') ||
          context.includes('await dbRun') ||
          context.includes('await wrapQuery')) {
        continue;
      }
      
      // Skip if it's inside a dbTransaction callback that's already async
      // (check if the transaction callback is async and uses await)
      const linesBefore = content.substring(Math.max(0, match.index - 500), match.index);
      if (linesBefore.includes('dbTransaction') && 
          (linesBefore.includes('async ()') || linesBefore.includes('async('))) {
        // Check if there's an await nearby (within 10 lines)
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const startLine = Math.max(0, lineNumber - 10);
        const endLine = Math.min(lines.length, lineNumber + 10);
        const nearbyContext = lines.slice(startLine, endLine).join('\n');
        
        // If we see await in nearby context, it might be okay (but still flag for review)
        // We'll be conservative and still flag it for manual review
      }
      
      issues.push({
        pattern: pattern.name,
        description: pattern.description,
        line: lineNumber,
        code: line.substring(0, 100),
        match: match[0]
      });
    }
  }
  
  return issues;
}

async function main() {
  console.log('🔍 Scanning server directory for async/await SQL issues...\n');
  
  const files = await findFiles(serverDir);
  console.log(`Found ${files.length} files to check\n`);
  
  const allIssues = [];
  
  for (const file of files) {
    const issues = await checkFile(file);
    if (issues.length > 0) {
      allIssues.push({ file, issues });
    }
  }
  
  if (allIssues.length === 0) {
    console.log('✅ No issues found! All SQL statements appear to be properly async.\n');
    return;
  }
  
  console.log(`❌ Found ${allIssues.length} file(s) with potential issues:\n`);
  
  for (const { file, issues } of allIssues) {
    const relativePath = file.replace(join(__dirname, '../'), '');
    console.log(`📄 ${relativePath}`);
    
    // Group by pattern type
    const grouped = {};
    for (const issue of issues) {
      if (!grouped[issue.pattern]) {
        grouped[issue.pattern] = [];
      }
      grouped[issue.pattern].push(issue);
    }
    
    for (const [pattern, patternIssues] of Object.entries(grouped)) {
      console.log(`  ⚠️  ${pattern} (${patternIssues.length} occurrence(s))`);
      console.log(`     ${patternIssues[0].description}`);
      
      // Show first 3 examples
      for (const issue of patternIssues.slice(0, 3)) {
        console.log(`     Line ${issue.line}: ${issue.code}`);
      }
      
      if (patternIssues.length > 3) {
        console.log(`     ... and ${patternIssues.length - 3} more`);
      }
    }
    
    console.log('');
  }
  
  console.log(`\n📊 Summary: ${allIssues.length} file(s) need attention`);
  process.exit(1);
}

main().catch(console.error);


