#!/usr/bin/env node

/**
 * Security Check Script for Easy Kanban
 * Protects against supply chain attacks like Shai-Hulud worm
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🔒 Running security checks...\n');

// Check 1: Verify package-lock.json integrity
function checkPackageLock() {
  console.log('📦 Checking package-lock.json integrity...');
  try {
    execSync('npm ci --dry-run', { stdio: 'pipe' });
    console.log('✅ package-lock.json is valid\n');
  } catch (error) {
    console.log('❌ package-lock.json integrity check failed');
    console.log('   Run: npm install to regenerate package-lock.json\n');
  }
}

// Check 2: Scan for suspicious packages
function checkSuspiciousPackages() {
  console.log('🔍 Scanning for suspicious packages...');
  
  const suspiciousPatterns = [
    /shai-hulud/i,
    /worm/i,
    /malware/i,
    /backdoor/i,
    /trojan/i,
    /keylogger/i,
    /stealer/i
  ];
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    let foundSuspicious = false;
    for (const [name, version] of Object.entries(allDeps)) {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(name)) {
          console.log(`❌ Suspicious package found: ${name}@${version}`);
          foundSuspicious = true;
        }
      }
    }
    
    if (!foundSuspicious) {
      console.log('✅ No suspicious packages detected\n');
    }
  } catch (error) {
    console.log('❌ Error reading package.json\n');
  }
}

// Check 3: Verify npm audit
function runAudit() {
  console.log('🛡️ Running security audit...');
  try {
    const result = execSync('npm audit --audit-level=high', { encoding: 'utf8' });
    if (result.includes('found 0 vulnerabilities')) {
      console.log('✅ No high-severity vulnerabilities found\n');
    } else {
      console.log('⚠️ High-severity vulnerabilities detected:');
      console.log(result);
    }
  } catch (error) {
    console.log('⚠️ Audit found vulnerabilities (see above)\n');
  }
}

// Check 4: Verify file permissions
function checkFilePermissions() {
  console.log('🔐 Checking file permissions...');
  
  const criticalFiles = [
    'package.json',
    'package-lock.json',
    '.npmrc'
  ];
  
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const mode = stats.mode & parseInt('777', 8);
      if (mode > parseInt('644', 8)) {
        console.log(`⚠️ ${file} has overly permissive permissions: ${mode.toString(8)}`);
      }
    }
  }
  
  console.log('✅ File permissions check complete\n');
}

// Main execution
async function main() {
  try {
    checkPackageLock();
    checkSuspiciousPackages();
    runAudit();
    checkFilePermissions();
    
    console.log('🎉 Security check complete!');
    console.log('\n📋 Recommendations (No npm account needed):');
    console.log('1. Regularly run: npm run security:check');
    console.log('2. Keep dependencies updated: npm update');
    console.log('3. Monitor for suspicious activity in your repositories');
    console.log('4. Use npm ci instead of npm install in production');
    console.log('5. Consider using alternative registries if needed');
    
  } catch (error) {
    console.error('❌ Security check failed:', error.message);
    process.exit(1);
  }
}

main();
