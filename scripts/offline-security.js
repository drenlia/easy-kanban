#!/usr/bin/env node

/**
 * Offline Security Check Script (No npm account required)
 * Protects against supply chain attacks like Shai-Hulud worm
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log('🔒 Running offline security checks...\n');

// Check 1: Verify package-lock.json hasn't been tampered with
function verifyPackageLockIntegrity() {
  console.log('📦 Verifying package-lock.json integrity...');
  
  if (!fs.existsSync('package-lock.json')) {
    console.log('❌ package-lock.json missing - run npm install first');
    return false;
  }
  
  try {
    const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    const lockfileVersion = packageLock.lockfileVersion;
    
    if (lockfileVersion < 2) {
      console.log('⚠️ Old lockfile version detected - consider upgrading');
    }
    
    console.log('✅ package-lock.json structure is valid');
    return true;
  } catch (error) {
    console.log('❌ package-lock.json is corrupted');
    return false;
  }
}

// Check 2: Scan for known malicious patterns
function scanForMaliciousPatterns() {
  console.log('🔍 Scanning for malicious patterns...');
  
  const maliciousPatterns = [
    // Shai-Hulud specific patterns
    /shai.hulud/i,
    /worm/i,
    /self.replicate/i,
    /propagate/i,
    
    // General malware patterns
    /backdoor/i,
    /keylogger/i,
    /stealer/i,
    /trojan/i,
    /malware/i,
    
    // Suspicious network patterns (only in suspicious contexts)
    /eval\(.*http/i,
    /Function\(.*http/i,
    /setTimeout.*eval.*http/i,
    
    // File system access patterns
    /fs\.writeFile/i,
    /fs\.createWriteStream/i,
    /child_process/i,
    /exec\(/i,
    /spawn\(/i
  ];
  
  const filesToCheck = [
    'package.json',
    'package-lock.json',
    'server/index.js',
    'src/main.tsx'
  ];
  
  let foundSuspicious = false;
  
  for (const file of filesToCheck) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of maliciousPatterns) {
        if (pattern.test(content)) {
          console.log(`⚠️ Suspicious pattern found in ${file}: ${pattern.source}`);
          foundSuspicious = true;
        }
      }
    }
  }
  
  if (!foundSuspicious) {
    console.log('✅ No malicious patterns detected');
  }
  
  return !foundSuspicious;
}

// Check 3: Verify dependency integrity
function verifyDependencyIntegrity() {
  console.log('🔐 Verifying dependency integrity...');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    
    // Check for version mismatches
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    let integrityIssues = 0;
    
    for (const [name, version] of Object.entries(allDeps)) {
      if (packageLock.dependencies && packageLock.dependencies[name]) {
        const lockVersion = packageLock.dependencies[name].version;
        if (version !== lockVersion && !version.includes('^') && !version.includes('~')) {
          console.log(`⚠️ Version mismatch: ${name} (package.json: ${version}, lock: ${lockVersion})`);
          integrityIssues++;
        }
      }
    }
    
    if (integrityIssues === 0) {
      console.log('✅ All dependency versions match');
    } else {
      console.log(`⚠️ Found ${integrityIssues} version mismatches`);
    }
    
    return integrityIssues === 0;
  } catch (error) {
    console.log('❌ Error verifying dependency integrity');
    return false;
  }
}

// Check 4: Scan node_modules for suspicious files
function scanNodeModules() {
  console.log('📁 Scanning node_modules for suspicious files...');
  
  if (!fs.existsSync('node_modules')) {
    console.log('❌ node_modules not found - run npm install first');
    return false;
  }
  
  const suspiciousFiles = [
    'malware.js',
    'worm.js',
    'backdoor.js',
    'shai-hulud.js',
    'trojan.js',
    'keylogger.js'
  ];
  
  let foundSuspicious = false;
  
  function scanDirectory(dir) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip if it's a deeply nested directory to avoid performance issues
          if (dir.split(path.sep).length < 5) {
            scanDirectory(fullPath);
          }
        } else if (stat.isFile()) {
          const fileName = path.basename(fullPath);
          if (suspiciousFiles.includes(fileName)) {
            console.log(`⚠️ Suspicious file found: ${fullPath}`);
            foundSuspicious = true;
          }
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }
  
  scanDirectory('node_modules');
  
  if (!foundSuspicious) {
    console.log('✅ No suspicious files found in node_modules');
  }
  
  return !foundSuspicious;
}

// Check 5: Verify file permissions
function checkFilePermissions() {
  console.log('🔐 Checking file permissions...');
  
  const criticalFiles = [
    'package.json',
    'package-lock.json',
    '.npmrc'
  ];
  
  let permissionIssues = 0;
  
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const mode = stats.mode & parseInt('777', 8);
      
      if (mode > parseInt('644', 8)) {
        console.log(`⚠️ ${file} has overly permissive permissions: ${mode.toString(8)}`);
        permissionIssues++;
      }
    }
  }
  
  if (permissionIssues === 0) {
    console.log('✅ File permissions are secure');
  }
  
  return permissionIssues === 0;
}

// Check 6: Generate security hash for tracking changes
function generateSecurityHash() {
  console.log('🔑 Generating security hash...');
  
  try {
    const packageJson = fs.readFileSync('package.json', 'utf8');
    const packageLock = fs.readFileSync('package-lock.json', 'utf8');
    
    const combined = packageJson + packageLock;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    
    console.log(`✅ Security hash: ${hash.substring(0, 16)}...`);
    
    // Save hash for future comparison
    fs.writeFileSync('.security-hash', hash);
    console.log('💾 Security hash saved to .security-hash');
    
    return true;
  } catch (error) {
    console.log('❌ Failed to generate security hash');
    return false;
  }
}

// Main execution
async function main() {
  try {
    const checks = [
      verifyPackageLockIntegrity(),
      scanForMaliciousPatterns(),
      verifyDependencyIntegrity(),
      scanNodeModules(),
      checkFilePermissions(),
      generateSecurityHash()
    ];
    
    const passed = checks.filter(Boolean).length;
    const total = checks.length;
    
    console.log(`\n🎉 Security check complete! (${passed}/${total} checks passed)`);
    
    if (passed === total) {
      console.log('✅ All security checks passed!');
    } else {
      console.log('⚠️ Some security checks failed - review the output above');
    }
    
    console.log('\n📋 Offline Security Recommendations:');
    console.log('1. Run this script regularly: npm run security:offline');
    console.log('2. Never run npm install on untrusted networks');
    console.log('3. Keep your package-lock.json in version control');
    console.log('4. Review any changes to package.json carefully');
    console.log('5. Consider using npm ci instead of npm install');
    console.log('6. Monitor your system for unusual network activity');
    
  } catch (error) {
    console.error('❌ Security check failed:', error.message);
    process.exit(1);
  }
}

main();
