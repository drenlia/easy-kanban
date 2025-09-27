import React from 'react';
import { uploadFile, addTaskAttachments } from '../api';
import { getAuthenticatedAttachmentUrl } from './authImageUrl';

// Function to get admin-configured validation settings
export const getAdminValidationConfig = (siteSettings?: { [key: string]: string }): FileValidationConfig => {
  if (!siteSettings) {
    return DEFAULT_FILE_CONFIG;
  }

  try {
    // Get max file size from admin settings
    const maxSizeBytes = parseInt(siteSettings.UPLOAD_MAX_FILESIZE || '10485760'); // Default 10MB
    
    // Get allowed file types from admin settings
    const fileTypesJson = siteSettings.UPLOAD_FILETYPES || '{}';
    const allowedFileTypes = JSON.parse(fileTypesJson);
    
    // Convert the admin settings to our validation config format
    const allowedTypes = Object.keys(allowedFileTypes).filter(mimeType => allowedFileTypes[mimeType]);
    
    return {
      maxSize: maxSizeBytes,
      allowedTypes: allowedTypes,
      allowedExtensions: [], // We'll derive this from MIME types
      blockedTypes: DEFAULT_FILE_CONFIG.blockedTypes, // Keep security blocks
      blockedExtensions: DEFAULT_FILE_CONFIG.blockedExtensions // Keep security blocks
    };
  } catch (error) {
    console.error('Error parsing admin file upload settings:', error);
    return DEFAULT_FILE_CONFIG;
  }
};

// File validation configuration
export interface FileValidationConfig {
  maxSize?: number; // in bytes, default 10MB
  allowedTypes?: string[]; // MIME types, e.g., ['image/jpeg', 'image/png', 'application/pdf']
  allowedExtensions?: string[]; // file extensions, e.g., ['.jpg', '.png', '.pdf']
  blockedTypes?: string[]; // blocked MIME types for security
  blockedExtensions?: string[]; // blocked extensions for security
}

// Default validation configuration
export const DEFAULT_FILE_CONFIG: FileValidationConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 'text/plain', 'text/csv',
    // Office documents
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Code files
    'text/javascript', 'text/css', 'text/html', 'application/json'
  ],
  allowedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.pdf', '.txt', '.csv',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.7z',
    '.js', '.css', '.html', '.json'
  ],
  blockedTypes: [
    'application/x-executable', 'application/x-msdownload', 'application/x-msdos-program',
    'application/x-winexe', 'application/x-msi', 'application/x-sh', 'application/x-bat'
  ],
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.msi',
    '.sh', '.ps1', '.app', '.dmg', '.deb', '.rpm'
  ]
};

export interface UploadedAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface FileUploadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onSuccess?: (attachments: UploadedAttachment[]) => void;
}

export interface TaskAttachmentUploadOptions extends FileUploadOptions {
  taskId: string;
  onTaskAttachmentsUpdate?: (attachments: UploadedAttachment[]) => void;
  onDescriptionUpdate?: (updatedDescription: string) => void;
  currentDescription?: string;
  currentTaskAttachments?: UploadedAttachment[];
}

/**
 * Upload multiple files and return their server data
 */
export const uploadFiles = async (
  files: File[],
  options: FileUploadOptions = {}
): Promise<UploadedAttachment[]> => {
  const { onProgress, onError, onSuccess } = options;
  
  try {
    const uploadedAttachments = await Promise.all(
      files.map(async (file) => {
        const fileData = await uploadFile(file);
        return {
          id: fileData.id,
          name: fileData.name,
          url: fileData.url,
          type: fileData.type,
          size: fileData.size
        };
      })
    );

    onSuccess?.(uploadedAttachments);
    return uploadedAttachments;
  } catch (error) {
    onError?.(error as Error);
    throw error;
  }
};

/**
 * Upload files and attach them to a task
 */
export const uploadTaskAttachments = async (
  files: File[],
  options: TaskAttachmentUploadOptions
): Promise<UploadedAttachment[]> => {
  const {
    taskId,
    onTaskAttachmentsUpdate,
    onDescriptionUpdate,
    currentDescription = '',
    currentTaskAttachments = [],
    onProgress,
    onError,
    onSuccess
  } = options;

  try {
    // Upload files first
    const uploadedAttachments = await uploadFiles(files, { onProgress, onError });

    // Add attachments to task
    await addTaskAttachments(taskId, uploadedAttachments);

    // Update local state - but only add attachments that weren't deleted during upload
    const currentAttachmentNames = currentTaskAttachments.map(att => att.name);
    const newAttachments = uploadedAttachments.filter(uploaded => 
      !currentAttachmentNames.includes(uploaded.name) // Don't re-add if already deleted
    );
    
    const updatedAttachments = [...currentTaskAttachments, ...newAttachments];
    console.log('🔄 uploadTaskAttachments: Updating with', updatedAttachments.length, 'total attachments');
    console.log('🔄 uploadTaskAttachments: Current:', currentTaskAttachments.length, 'New:', newAttachments.length);
    onTaskAttachmentsUpdate?.(updatedAttachments);

    // Update the task description with server URLs immediately
    let updatedDescription = currentDescription;
    uploadedAttachments.forEach(attachment => {
      if (attachment.name.startsWith('img-')) {
        // Replace blob URLs with authenticated server URLs
        const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const authenticatedUrl = getAuthenticatedAttachmentUrl(attachment.url);
        updatedDescription = updatedDescription.replace(blobPattern, authenticatedUrl || attachment.url);
      }
    });

    // Update description if it changed
    if (updatedDescription !== currentDescription) {
      onDescriptionUpdate?.(updatedDescription);
    }

    onSuccess?.(uploadedAttachments);
    return uploadedAttachments;
  } catch (error) {
    onError?.(error as Error);
    throw error;
  }
};

/**
 * Upload comment attachments (simpler version)
 */
export const uploadCommentAttachments = async (
  files: File[],
  options: FileUploadOptions = {}
): Promise<UploadedAttachment[]> => {
  return uploadFiles(files, options);
};

/**
 * Handle file input change event
 */
export const handleFileInputChange = (
  e: React.ChangeEvent<HTMLInputElement>,
  onFilesSelected: (files: File[]) => void
) => {
  const files = e.target.files;
  if (files) {
    onFilesSelected(Array.from(files));
  }
};

/**
 * Create a file input element with proper configuration
 */
export const createFileInput = (
  ref: React.RefObject<HTMLInputElement>,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  multiple: boolean = true,
  accept: string = '*/*'
): React.ReactElement => {
  return React.createElement('input', {
    type: 'file',
    ref: ref,
    onChange: onChange,
    className: 'hidden',
    multiple: multiple,
    accept: accept
  });
};

/**
 * Generate temporary attachment object for UI display
 */
export const createTempAttachment = (file: File) => ({
  id: `temp-${Date.now()}-${Math.random()}`,
  name: file.name,
  type: file.type,
  size: file.size,
  isNew: true,
  file
});

/**
 * Get file extension from filename
 */
const getFileExtension = (filename: string): string => {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'));
};

/**
 * Validate file before upload with comprehensive checks
 */
export const validateFile = (
  file: File, 
  config: FileValidationConfig = DEFAULT_FILE_CONFIG
): { valid: boolean; error?: string } => {
  const {
    maxSize = DEFAULT_FILE_CONFIG.maxSize!,
    allowedTypes = DEFAULT_FILE_CONFIG.allowedTypes!,
    allowedExtensions = DEFAULT_FILE_CONFIG.allowedExtensions!,
    blockedTypes = DEFAULT_FILE_CONFIG.blockedTypes!,
    blockedExtensions = DEFAULT_FILE_CONFIG.blockedExtensions!
  } = config;

  // Check file size
  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `File size exceeds ${sizeMB}MB limit` };
  }

  // Check blocked MIME types (security)
  if (blockedTypes.includes(file.type)) {
    return { valid: false, error: `File type "${file.type}" is not allowed for security reasons` };
  }

  // Check blocked extensions (security)
  const extension = getFileExtension(file.name);
  if (blockedExtensions.includes(extension)) {
    return { valid: false, error: `File extension "${extension}" is not allowed for security reasons` };
  }

  // Check allowed MIME types
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type "${file.type}" is not supported` };
  }

  // Check allowed extensions
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
    return { valid: false, error: `File extension "${extension}" is not supported` };
  }

  return { valid: true };
};

/**
 * Validate multiple files with comprehensive checks
 */
export const validateFiles = (
  files: File[], 
  config: FileValidationConfig = DEFAULT_FILE_CONFIG
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  files.forEach((file, index) => {
    const validation = validateFile(file, config);
    if (!validation.valid) {
      errors.push(`File ${index + 1} (${file.name}): ${validation.error}`);
    }
  });
  
  return { valid: errors.length === 0, errors };
};

/**
 * Create a custom validation configuration
 */
export const createFileValidationConfig = (overrides: Partial<FileValidationConfig>): FileValidationConfig => {
  return {
    ...DEFAULT_FILE_CONFIG,
    ...overrides
  };
};

/**
 * Predefined validation configurations for common use cases
 */
export const VALIDATION_PRESETS = {
  // Images only
  imagesOnly: createFileValidationConfig({
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    maxSize: 5 * 1024 * 1024 // 5MB for images
  }),
  
  // Documents only
  documentsOnly: createFileValidationConfig({
    allowedTypes: [
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    allowedExtensions: ['.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
    maxSize: 20 * 1024 * 1024 // 20MB for documents
  }),
  
  // Strict security (very limited)
  strictSecurity: createFileValidationConfig({
    allowedTypes: ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf', '.txt'],
    maxSize: 2 * 1024 * 1024, // 2MB limit
    blockedTypes: [
      'application/x-executable', 'application/x-msdownload', 'application/x-msdos-program',
      'application/x-winexe', 'application/x-msi', 'application/x-sh', 'application/x-bat',
      'application/javascript', 'text/javascript' // Block JS files
    ],
    blockedExtensions: [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.msi',
      '.sh', '.ps1', '.app', '.dmg', '.deb', '.rpm', '.html', '.htm'
    ]
  })
};
