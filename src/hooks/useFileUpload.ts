import { useState, useCallback, useRef } from 'react';
import { 
  uploadFiles, 
  uploadTaskAttachments, 
  uploadCommentAttachments,
  handleFileInputChange,
  createTempAttachment,
  validateFiles,
  FileValidationConfig,
  DEFAULT_FILE_CONFIG,
  getAdminValidationConfig,
  UploadedAttachment,
  FileUploadOptions,
  TaskAttachmentUploadOptions
} from '../utils/fileUploadUtils';

export interface UseFileUploadReturn {
  // State
  pendingFiles: File[];
  uploadedAttachments: UploadedAttachment[];
  isUploading: boolean;
  uploadError: string | null;
  
  // Actions
  addFiles: (files: File[], config?: FileValidationConfig) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  uploadPendingFiles: (options?: FileUploadOptions) => Promise<UploadedAttachment[]>;
  uploadTaskFiles: (taskId: string, options?: Partial<TaskAttachmentUploadOptions>) => Promise<UploadedAttachment[]>;
  uploadCommentFiles: (options?: FileUploadOptions) => Promise<UploadedAttachment[]>;
  
  // File input handlers
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  
  // Validation
  validatePendingFiles: (config?: FileValidationConfig) => { valid: boolean; errors: string[] };
}

export const useFileUpload = (
  initialFiles: File[] = [], 
  siteSettings?: { [key: string]: string }
): UseFileUploadReturn => {
  const [pendingFiles, setPendingFiles] = useState<File[]>(initialFiles);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[], config?: FileValidationConfig) => {
    // Use admin settings as default if no config provided
    const validationConfig = config || getAdminValidationConfig(siteSettings);
    
    // Validate files before adding them
    const validation = validateFiles(files, validationConfig);
    if (!validation.valid) {
      setUploadError(validation.errors.join('; '));
      return;
    }
    
    setPendingFiles(prev => [...prev, ...files]);
    setUploadError(null);
  }, [siteSettings]);

  const removeFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setPendingFiles([]);
    setUploadedAttachments([]);
    setUploadError(null);
  }, []);

  const uploadPendingFiles = useCallback(async (options: FileUploadOptions = {}): Promise<UploadedAttachment[]> => {
    if (pendingFiles.length === 0) return [];
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const uploaded = await uploadFiles(pendingFiles, {
        ...options,
        onSuccess: (attachments) => {
          setUploadedAttachments(prev => [...prev, ...attachments]);
          options.onSuccess?.(attachments);
        },
        onError: (error) => {
          setUploadError(error.message);
          options.onError?.(error);
        }
      });
      
      setPendingFiles([]);
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  }, [pendingFiles]);

  const uploadTaskFiles = useCallback(async (
    taskId: string, 
    options: Partial<TaskAttachmentUploadOptions> = {}
  ): Promise<UploadedAttachment[]> => {
    if (pendingFiles.length === 0) return [];
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const uploaded = await uploadTaskAttachments(pendingFiles, {
        taskId,
        ...options,
        onSuccess: (attachments) => {
          setUploadedAttachments(prev => [...prev, ...attachments]);
          options.onSuccess?.(attachments);
        },
        onError: (error) => {
          setUploadError(error.message);
          options.onError?.(error);
        }
      });
      
      setPendingFiles([]);
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  }, [pendingFiles]);

  const uploadCommentFiles = useCallback(async (options: FileUploadOptions = {}): Promise<UploadedAttachment[]> => {
    if (pendingFiles.length === 0) return [];
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const uploaded = await uploadCommentAttachments(pendingFiles, {
        ...options,
        onSuccess: (attachments) => {
          setUploadedAttachments(prev => [...prev, ...attachments]);
          options.onSuccess?.(attachments);
        },
        onError: (error) => {
          setUploadError(error.message);
          options.onError?.(error);
        }
      });
      
      setPendingFiles([]);
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  }, [pendingFiles]);

  const handleFileInputChangeCallback = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileInputChange(e, addFiles);
  }, [addFiles]);

  const validatePendingFiles = useCallback((config?: FileValidationConfig) => {
    const validationConfig = config || getAdminValidationConfig(siteSettings);
    return validateFiles(pendingFiles, validationConfig);
  }, [pendingFiles, siteSettings]);

  return {
    // State
    pendingFiles,
    uploadedAttachments,
    isUploading,
    uploadError,
    
    // Actions
    addFiles,
    removeFile,
    clearFiles,
    uploadPendingFiles,
    uploadTaskFiles,
    uploadCommentFiles,
    
    // File input handlers
    handleFileInputChange: handleFileInputChangeCallback,
    fileInputRef,
    
    // Validation
    validatePendingFiles
  };
};
