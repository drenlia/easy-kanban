import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, RefreshCw } from 'lucide-react';
import { toast } from '../../utils/toast';

interface AdminFileUploadsTabProps {
  settings: { [key: string]: string | undefined };
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onSave: (settings?: { [key: string]: string | undefined }) => Promise<void>;
  onCancel: () => void;
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
}) => {
  const { t } = useTranslation('admin');
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingLimits, setIsTogglingLimits] = useState(false);
  const [fileTypes, setFileTypes] = useState<FileTypeConfig>({});
  const [maxFileSize, setMaxFileSize] = useState(10); // MB
  const [limitsEnforced, setLimitsEnforced] = useState(true); // Default enforced

  // Define all possible file types with their descriptions
  const fileTypeCategories = [
    {
      name: t('fileUploads.categories.images'),
      types: [
        { mime: 'image/jpeg', label: t('fileUploads.types.jpegImages'), ext: '.jpg, .jpeg' },
        { mime: 'image/png', label: t('fileUploads.types.pngImages'), ext: '.png' },
        { mime: 'image/gif', label: t('fileUploads.types.gifImages'), ext: '.gif' },
        { mime: 'image/webp', label: t('fileUploads.types.webpImages'), ext: '.webp' },
        { mime: 'image/svg+xml', label: t('fileUploads.types.svgImages'), ext: '.svg' },
        { mime: 'image/bmp', label: t('fileUploads.types.bmpImages'), ext: '.bmp' },
        { mime: 'image/tiff', label: t('fileUploads.types.tiffImages'), ext: '.tiff, .tif' },
        { mime: 'image/ico', label: t('fileUploads.types.iconFiles'), ext: '.ico' },
        { mime: 'image/heic', label: t('fileUploads.types.heicImages'), ext: '.heic' },
        { mime: 'image/heif', label: t('fileUploads.types.heifImages'), ext: '.heif' },
        { mime: 'image/avif', label: t('fileUploads.types.avifImages'), ext: '.avif' }
      ]
    },
    {
      name: t('fileUploads.categories.videos'),
      types: [
        { mime: 'video/mp4', label: t('fileUploads.types.mp4Videos'), ext: '.mp4' },
        { mime: 'video/webm', label: t('fileUploads.types.webmVideos'), ext: '.webm' },
        { mime: 'video/ogg', label: t('fileUploads.types.oggVideos'), ext: '.ogv' },
        { mime: 'video/quicktime', label: t('fileUploads.types.quicktimeVideos'), ext: '.mov' },
        { mime: 'video/x-msvideo', label: t('fileUploads.types.aviVideos'), ext: '.avi' },
        { mime: 'video/x-ms-wmv', label: t('fileUploads.types.wmvVideos'), ext: '.wmv' },
        { mime: 'video/x-matroska', label: t('fileUploads.types.mkvVideos'), ext: '.mkv' },
        { mime: 'video/mpeg', label: t('fileUploads.types.mpegVideos'), ext: '.mpeg, .mpg' },
        { mime: 'video/3gpp', label: t('fileUploads.types.3gpVideos'), ext: '.3gp' }
      ]
    },
    {
      name: t('fileUploads.categories.documents'),
      types: [
        { mime: 'application/pdf', label: t('fileUploads.types.pdfDocuments'), ext: '.pdf' },
        { mime: 'text/plain', label: t('fileUploads.types.textFiles'), ext: '.txt' },
        { mime: 'text/csv', label: t('fileUploads.types.csvFiles'), ext: '.csv' }
      ]
    },
    {
      name: t('fileUploads.categories.officeDocuments'),
      types: [
        { mime: 'application/msword', label: t('fileUploads.types.wordDocumentsLegacy'), ext: '.doc' },
        { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: t('fileUploads.types.wordDocuments'), ext: '.docx' },
        { mime: 'application/vnd.ms-excel', label: t('fileUploads.types.excelSpreadsheetsLegacy'), ext: '.xls' },
        { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: t('fileUploads.types.excelSpreadsheets'), ext: '.xlsx' },
        { mime: 'application/vnd.ms-powerpoint', label: t('fileUploads.types.powerPointPresentationsLegacy'), ext: '.ppt' },
        { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: t('fileUploads.types.powerPointPresentations'), ext: '.pptx' }
      ]
    },
    {
      name: t('fileUploads.categories.archives'),
      types: [
        { mime: 'application/zip', label: t('fileUploads.types.zipArchives'), ext: '.zip' },
        { mime: 'application/x-rar-compressed', label: t('fileUploads.types.rarArchives'), ext: '.rar' },
        { mime: 'application/x-7z-compressed', label: t('fileUploads.types.7zipArchives'), ext: '.7z' }
      ]
    },
    {
      name: t('fileUploads.categories.codeFiles'),
      types: [
        { mime: 'text/javascript', label: t('fileUploads.types.javascriptFiles'), ext: '.js' },
        { mime: 'text/css', label: t('fileUploads.types.cssFiles'), ext: '.css' },
        { mime: 'text/html', label: t('fileUploads.types.htmlFiles'), ext: '.html' },
        { mime: 'application/json', label: t('fileUploads.types.jsonFiles'), ext: '.json' }
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

  // Initialize limits enforced from settings
  useEffect(() => {
    const enforced = editingSettings.UPLOAD_LIMITS_ENFORCED !== 'false'; // Default to true
    setLimitsEnforced(enforced);
  }, [editingSettings.UPLOAD_LIMITS_ENFORCED]);

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
        // Note: UPLOAD_LIMITS_ENFORCED is auto-saved via handleToggleLimitsEnforced
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

  const handleToggleLimitsEnforced = async () => {
    const newValue = !limitsEnforced;
    setLimitsEnforced(newValue);
    setIsTogglingLimits(true);
    
    try {
      const updatedSettings = {
        ...editingSettings,
        UPLOAD_LIMITS_ENFORCED: newValue.toString()
      };
      
      onSettingsChange(updatedSettings);
      await onSave(updatedSettings);
      toast.success(t('fileUploads.limitsEnforcedUpdated'), '');
    } catch (error: any) {
      console.error('Failed to save limits enforced setting:', error);
      // Revert on error
      setLimitsEnforced(!newValue);
      const errorMessage = error.response?.data?.error || error.message || t('fileUploads.failedToUpdateLimitsEnforced');
      toast.error(errorMessage, '');
    } finally {
      setIsTogglingLimits(false);
    }
  };

  const hasChanges = () => {
    // Compare with ORIGINAL settings, not editingSettings
    // Note: UPLOAD_LIMITS_ENFORCED is excluded because it auto-saves
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('fileUploads.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('fileUploads.description')}
        </p>
      </div>

      {/* Success and Error Messages */}

      {/* Settings Form */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">


        <div className="px-6 py-4 space-y-6">
          {/* Enforce Upload Limits Toggle */}
          <div className="flex items-start justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                {t('fileUploads.enforceUploadRestrictions')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('fileUploads.enforceUploadRestrictionsDescription')}
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <button
                type="button"
                onClick={handleToggleLimitsEnforced}
                disabled={isTogglingLimits}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                  ${isTogglingLimits ? 'opacity-50 cursor-not-allowed' : ''}
                  ${limitsEnforced 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${limitsEnforced ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Max File Size Setting */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                {t('fileUploads.maximumFileSize')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('fileUploads.maximumFileSizeDescription')}
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
                <span className="text-sm text-gray-500 dark:text-gray-400">{t('fileUploads.mb')}</span>
              </div>
            </div>
          </div>

          {/* File Types Setting */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('fileUploads.allowedFileTypes')}
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('fileUploads.allowedFileTypesDescription')}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => toggleAllFileTypes(true)}
                  className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  {t('fileUploads.allowAll')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllFileTypes(false)}
                  className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  {t('fileUploads.blockAll')}
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
            {t('fileUploads.cancel')}
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
                {t('fileUploads.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t('fileUploads.saveChanges')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminFileUploadsTab;
