#!/usr/bin/env node

/**
 * Generate version.json at build time
 * This ensures version tracking works in both Docker Compose and Kubernetes
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get git commit hash (short version)
// Prefer environment variable (from Docker build args), fallback to git command
let gitCommit = process.env.GIT_COMMIT || 'unknown';
if (gitCommit === 'unknown') {
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('⚠️ Unable to get git commit hash:', error.message);
  }
}

// Get git branch
// Prefer environment variable (from Docker build args), fallback to git command
let gitBranch = process.env.GIT_BRANCH || 'unknown';
if (gitBranch === 'unknown') {
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('⚠️ Unable to get git branch:', error.message);
  }
}

// Read package.json version
let packageVersion = '0.0.0';
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  packageVersion = packageJson.version;
} catch (error) {
  console.warn('⚠️ Unable to read package.json version:', error.message);
}

// Build timestamp (prefer env var from Docker build arg)
const buildTime = process.env.BUILD_TIME || new Date().toISOString();

// Generate version string (semantic-version-gitCommit)
// Example: 1.2.3-a1b2c3d or 0.9-beta-a1b2c3d
const version = process.env.APP_VERSION 
  ? `${process.env.APP_VERSION}-${gitCommit}`
  : `${packageVersion}-${gitCommit}`;

// Create version object
const versionInfo = {
  version,
  packageVersion,
  gitCommit,
  gitBranch,
  buildTime,
  buildNumber: process.env.BUILD_NUMBER || null, // For CI/CD pipelines
  environment: process.env.NODE_ENV || 'production'
};

// Write version.json
const versionPath = path.join(__dirname, '../server/version.json');
fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));

console.log('✅ Generated version.json:');
console.log(JSON.stringify(versionInfo, null, 2));

