import fs from 'fs';
import os from 'os';

/**
 * Helper function to read container memory info
 * Supports Docker, Kubernetes, and systemd containers
 */
export const getContainerMemoryInfo = () => {
  try {
    // Try different cgroup paths for Docker and Kubernetes
    const cgroupPaths = [
      '/sys/fs/cgroup',           // Docker (cgroup v2)
      '/sys/fs/cgroup/memory',   // Docker (cgroup v1)
      '/sys/fs/cgroup/kubepods', // Kubernetes
      '/sys/fs/cgroup/system.slice', // Systemd containers
    ];
    
    const memoryUsageFiles = [
      'memory.current',           // cgroup v2
      'memory.usage_in_bytes',   // cgroup v1
    ];
    
    const memoryLimitFiles = [
      'memory.max',               // cgroup v2
      'memory.limit_in_bytes',   // cgroup v1
    ];
    
    let memoryLimit = os.totalmem(); // Fallback to host memory
    let memoryUsage = 0;
    let foundContainerInfo = false;
    
    // Try to find container memory info
    for (const cgroupPath of cgroupPaths) {
      if (!fs.existsSync(cgroupPath)) continue;
      
      // Try to read memory usage
      for (const usageFile of memoryUsageFiles) {
        const usagePath = `${cgroupPath}/${usageFile}`;
        if (fs.existsSync(usagePath)) {
          try {
            const usageData = fs.readFileSync(usagePath, 'utf8').trim();
            memoryUsage = parseInt(usageData);
            if (memoryUsage > 0) {
              foundContainerInfo = true;
              break;
            }
          } catch (usageError) {
            console.log(`Error reading ${usagePath}:`, usageError.message);
          }
        }
      }
      
      // Try to read memory limit
      for (const limitFile of memoryLimitFiles) {
        const limitPath = `${cgroupPath}/${limitFile}`;
        if (fs.existsSync(limitPath)) {
          try {
            const limitData = fs.readFileSync(limitPath, 'utf8').trim();
            if (limitData !== 'max' && limitData !== '') {
              const limitBytes = parseInt(limitData);
              if (limitBytes > 0 && limitBytes < os.totalmem()) {
                memoryLimit = limitBytes;
                break;
              }
            }
          } catch (limitError) {
            console.log(`Error reading ${limitPath}:`, limitError.message);
          }
        }
      }
      
      if (foundContainerInfo) break;
    }
    
    // If no container memory usage found, fallback to host calculation
    if (!foundContainerInfo) {
      const freeMemory = os.freemem();
      memoryUsage = os.totalmem() - freeMemory;
    }
    
    // Ensure we have valid values
    if (memoryUsage < 0) memoryUsage = 0;
    if (memoryLimit <= 0) memoryLimit = os.totalmem();
    
    return {
      total: memoryLimit,
      used: memoryUsage,
      free: memoryLimit - memoryUsage,
      percent: Math.round((memoryUsage / memoryLimit) * 100)
    };
  } catch (error) {
    console.error('Error reading container memory info:', error);
    // Fallback to host memory
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    return {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percent: Math.round((usedMemory / totalMemory) * 100)
    };
  }
};

