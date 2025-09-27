import React, { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';

interface AdminFileUploadsTabProps {
  settings: { [key: string]: string | undefined };
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onSave: (settings?: { [key: string]: string | undefined }) => Promise<void>;
  onCancel: () => void;
  successMessage: string | null;
  error: string | null;
}

interface FileTypeConfig {
  [mimeType: string]: boolean;
}

const AdminFileUploadsTab: React.FC<AdminFileUploadsTabProps> = ({
  settings,
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  successMessage,
  error,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [fileTypes, setFileTypes] = useState<FileTypeConfig>({});
  const [maxFileSize, setMaxFileSize] = useState(10); // MB

  // Define all possible file types with their descriptions
  const fileTypeCategories = [
    {
      name: 'Images',
      types: [
        { mime: 'image/jpeg', label: 'JPEG Images', ext: '.jpg, .jpeg' },
        { mime: 'image/png', label: 'PNG Images', ext: '.png' },
        { mime: 'image/gif', label: 'GIF Images', ext: '.gif' },
        { mime: 'image/webp', label: 'WebP Images', ext: '.webp' },
        { mime: 'image/svg+xml', label: 'SVG Images', ext: '.svg' }
      ]
    },
    {
      name: 'Documents',
      types: [
        { mime: 'application/pdf', label: 'PDF Documents', ext: '.pdf' },
        { mime: 'text/plain', label: 'Text Files', ext: '.txt' },
        { mime: 'text/csv', label: 'CSV Files', ext: '.csv' }
      ]
    },
    {
      name: 'Office Documents',
      types: [
        { mime: 'application/msword', label: 'Word Documents (Legacy)', ext: '.doc' },
        { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word Documents', ext: '.docx' },
        { mime: 'application/vnd.ms-excel', label: 'Excel Spreadsheets (Legacy)', ext: '.xls' },
        { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel Spreadsheets', ext: '.xlsx' },
        { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint Presentations (Legacy)', ext: '.ppt' },
        { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint Presentations', ext: '.pptx' }
      ]
    },
    {
      name: 'Archives',
      types: [
        { mime: 'application/zip', label: 'ZIP Archives', ext: '.zip' },
        { mime: 'application/x-rar-compressed', label: 'RAR Archives', ext: '.rar' },
        { mime: 'application/x-7z-compressed', label: '7-Zip Archives', ext: '.7z' }
      ]
    },
    {
      name: 'Code Files',
      types: [
        { mime: 'text/javascript', label: 'JavaScript Files', ext: '.js' },
        { mime: 'text/css', label: 'CSS Files', ext: '.css' },
        { mime: 'text/html', label: 'HTML Files', ext: '.html' },
        { mime: 'application/json', label: 'JSON Files', ext: '.json' }
      ]
    }
  ];

  // Initialize file types from settings
  useEffect(() => {
    try {
      const fileTypesJson = editingSettings.UPLOAD_FILETYPES || '{}';
      const parsed = JSON.parse(fileTypesJson);
      
      // Get all possible file types and set defaults
      const allPossibleTypes = fileTypeCategories.flatMap(category => 
        category.types.map(type => type.mime)
      );
      
      // Create a complete config with all types
      const completeConfig = allPossibleTypes.reduce((acc, mimeType) => {
        // If the parsed settings are empty (first time), default all to true
        // Otherwise, use the parsed value or default to true for new file types
        if (Object.keys(parsed).length === 0) {
          acc[mimeType] = true; // First time setup - enable all
        } else {
          // Handle migration from old image/jpg to image/jpeg
          if (mimeType === 'image/jpeg' && parsed['image/jpg'] !== undefined) {
            acc[mimeType] = parsed['image/jpg']; // Use old image/jpg value for image/jpeg
          } else {
            acc[mimeType] = parsed[mimeType] !== undefined ? parsed[mimeType] : true; // Use saved value or default to true
          }
        }
        return acc;
      }, {} as FileTypeConfig);
      
      console.log('File types initialization:', {
        editingSettingsUPLOAD_FILETYPES: editingSettings.UPLOAD_FILETYPES,
        parsed: parsed,
        completeConfig: completeConfig,
        rarValue: completeConfig['application/x-rar-compressed']
      });
      
      setFileTypes(completeConfig);
    } catch (error) {
      console.error('Error parsing UPLOAD_FILETYPES:', error);
      // If parsing fails, initialize with all types enabled
      const allPossibleTypes = fileTypeCategories.flatMap(category => 
        category.types.map(type => type.mime)
      );
      const defaultConfig = allPossibleTypes.reduce((acc, mimeType) => {
        acc[mimeType] = true;
        return acc;
      }, {} as FileTypeConfig);
      setFileTypes(defaultConfig);
    }
  }, [editingSettings.UPLOAD_FILETYPES]);

  // Initialize max file size from settings
  useEffect(() => {
    const sizeBytes = parseInt(editingSettings.UPLOAD_MAX_FILESIZE || '10485760');
    const sizeMB = Math.round(sizeBytes / (1024 * 1024));
    setMaxFileSize(sizeMB);
  }, [editingSettings.UPLOAD_MAX_FILESIZE]);

  const handleSave = async () => {
    console.log('🔄 handleSave called - checking if save should proceed...');
    console.log('hasChanges():', hasChanges());
    
    if (!hasChanges()) {
      console.log('❌ No changes detected - save aborted');
      return;
    }
    
    console.log('✅ Changes detected - proceeding with save');
    
    setIsSaving(true);
    try {
      // Convert max file size from MB to bytes
      const sizeBytes = maxFileSize * 1024 * 1024;
      
      const newSettings = {
        ...editingSettings,
        UPLOAD_MAX_FILESIZE: sizeBytes.toString(),
        UPLOAD_FILETYPES: JSON.stringify(fileTypes)
      };
      
      // Debug logging
      console.log('handleSave - sending settings:', {
        UPLOAD_MAX_FILESIZE: newSettings.UPLOAD_MAX_FILESIZE,
        UPLOAD_FILETYPES: newSettings.UPLOAD_FILETYPES,
        fileTypes: fileTypes,
        rarValue: fileTypes['application/x-rar-compressed']
      });
      
      // Update settings with current values - merge with existing settings
      const updatedSettings = {
        ...editingSettings,
        ...newSettings
      };
      onSettingsChange(updatedSettings);
      
      // Call onSave with the updated settings directly
      await onSave(updatedSettings);
      console.log('✅ Save completed successfully');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileTypeToggle = (mimeType: string) => {
    console.log(`Toggling ${mimeType}:`, {
      currentValue: fileTypes[mimeType],
      newValue: !fileTypes[mimeType]
    });
    
    setFileTypes(prev => ({
      ...prev,
      [mimeType]: !prev[mimeType]
    }));
  };

  const handleMaxFileSizeChange = (value: number) => {
    setMaxFileSize(value);
  };

  const toggleAllFileTypes = (enabled: boolean) => {
    // Get all possible file types from all categories
    const allPossibleTypes = fileTypeCategories.flatMap(category => 
      category.types.map(type => type.mime)
    );
    
    // Create a new config with all types set to the same value
    const updatedTypes = allPossibleTypes.reduce((acc, mimeType) => {
      acc[mimeType] = enabled;
      return acc;
    }, {} as FileTypeConfig);
    
    setFileTypes(updatedTypes);
  };

  const hasChanges = () => {
    // Compare with ORIGINAL settings, not editingSettings
    const originalSizeBytes = parseInt(settings.UPLOAD_MAX_FILESIZE || '10485760');
    const originalSizeMB = Math.round(originalSizeBytes / (1024 * 1024));
    const originalFileTypes = JSON.parse(settings.UPLOAD_FILETYPES || '{}');
    
    const sizeChanged = maxFileSize !== originalSizeMB;
    const fileTypesChanged = JSON.stringify(fileTypes) !== JSON.stringify(originalFileTypes);
    
    console.log('hasChanges check:', {
      maxFileSize,
      originalSizeMB,
      fileTypesChanged,
      sizeChanged,
      fileTypes: fileTypes,
      originalFileTypes: originalFileTypes
    });
    
    return sizeChanged || fileTypesChanged;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">File Upload Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure file upload restrictions and security settings. These settings control what types of files users can upload and their maximum size.
        </p>
      </div>

      {/* Success and Error Messages */}
      {successMessage && (
        <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Form */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">


        <div className="px-6 py-4 space-y-6">
          {/* Max File Size Setting */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Maximum File Size
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Set the maximum file size allowed for uploads. Larger files will be rejected.
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxFileSize}
                  onChange={(e) => handleMaxFileSizeChange(parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">MB</span>
              </div>
            </div>
          </div>

          {/* File Types Setting */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Allowed File Types
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select which file types are allowed for upload. Unchecked types will be rejected.
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => toggleAllFileTypes(true)}
                  className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  Allow All
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllFileTypes(false)}
                  className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  Block All
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {fileTypeCategories.map((category) => (
                <div key={category.name}>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
                    {category.name}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.types.map((fileType) => (
                      <div key={fileType.mime} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={fileType.mime}
                          checked={fileTypes[fileType.mime] || false}
                          onChange={() => handleFileTypeToggle(fileType.mime)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                        />
                        <div className="flex-1">
                          <label htmlFor={fileType.mime} className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                            {fileType.label}
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {fileType.ext}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges() || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminFileUploadsTab;
