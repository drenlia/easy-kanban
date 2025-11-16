/**
 * Hook for managing version and instance status state
 */

import { useState, useEffect } from 'react';
import { versionDetection } from '../utils/versionDetection';

export interface InstanceStatus {
  status: string;
  message: string;
  isDismissed: boolean;
}

export interface VersionInfo {
  currentVersion: string;
  newVersion: string;
}

export interface UseVersionStatusReturn {
  // Instance Status
  instanceStatus: InstanceStatus;
  setInstanceStatus: (status: InstanceStatus | ((prev: InstanceStatus) => InstanceStatus)) => void;
  
  // Version Banner
  showVersionBanner: boolean;
  setShowVersionBanner: (show: boolean) => void;
  versionInfo: VersionInfo;
  setVersionInfo: (info: VersionInfo) => void;
  
  // Handlers
  handleRefreshVersion: () => void;
  handleDismissVersionBanner: () => void;
  
  // Component
  InstanceStatusBanner: () => JSX.Element | null;
}

export const useVersionStatus = (): UseVersionStatusReturn => {
  // Instance Status Banner State
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>({
    status: 'active',
    message: '',
    isDismissed: false
  });

  // Version Update Banner State
  const [showVersionBanner, setShowVersionBanner] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    currentVersion: '',
    newVersion: ''
  });

  // Version detection setup
  useEffect(() => {
    const handleVersionChange = (oldVersion: string, newVersion: string) => {
      console.log(`🔔 Version change detected: ${oldVersion} → ${newVersion}`);
      setVersionInfo({ currentVersion: oldVersion, newVersion });
      setShowVersionBanner(true);
    };

    // Register version change listener
    versionDetection.onVersionChange(handleVersionChange);

    // Clean up listener on unmount
    return () => {
      versionDetection.offVersionChange(handleVersionChange);
    };
  }, []);

  // Handlers for version banner
  const handleRefreshVersion = () => {
    // Set flag to indicate readiness check should run after refresh
    sessionStorage.setItem('pendingVersionRefresh', 'true');
    window.location.reload();
  };

  const handleDismissVersionBanner = () => {
    setShowVersionBanner(false);
  };
  
  // Instance Status Banner Component
  const InstanceStatusBanner = () => {
    if (instanceStatus.status === 'active' || instanceStatus.isDismissed) {
      return null;
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'suspended':
          return 'bg-yellow-100 border-yellow-500 text-yellow-700';
        case 'terminated':
          return 'bg-red-100 border-red-500 text-red-700';
        case 'failed':
          return 'bg-red-100 border-red-500 text-red-700';
        case 'deploying':
          return 'bg-blue-100 border-blue-500 text-blue-700';
        default:
          return 'bg-gray-100 border-gray-500 text-gray-700';
      }
    };

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'suspended':
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          );
        case 'terminated':
        case 'failed':
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          );
        case 'deploying':
          return (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          );
        default:
          return (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          );
      }
    };

    return (
      <div className={`fixed top-0 left-0 right-0 z-50 border-l-4 p-4 ${getStatusColor(instanceStatus.status)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              {getStatusIcon(instanceStatus.status)}
            </div>
            <div>
              <p className="text-sm font-medium">
                <strong>Instance Unavailable</strong>
              </p>
              <p className="text-sm mt-1">
                {instanceStatus.message}
              </p>
            </div>
          </div>
          <button
            onClick={() => setInstanceStatus(prev => ({ ...prev, isDismissed: true }))}
            className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return {
    instanceStatus,
    setInstanceStatus,
    showVersionBanner,
    setShowVersionBanner,
    versionInfo,
    setVersionInfo,
    handleRefreshVersion,
    handleDismissVersionBanner,
    InstanceStatusBanner,
  };
};

