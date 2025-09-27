# File Upload Utility Migration Guide

## Overview

This guide shows how to migrate existing components to use the new `useFileUpload` hook and `fileUploadUtils` utility functions.

## Benefits

- **Reduced Code Duplication**: Common upload logic centralized
- **Consistent Error Handling**: Standardized error management
- **Better Validation**: Built-in file validation
- **Easier Testing**: Isolated upload logic
- **Type Safety**: Full TypeScript support

## Migration Examples

### 1. CommentEditor.tsx (Simple Case)

**Before:**
```typescript
const [attachments, setAttachments] = useState<File[]>([]);
const fileInputRef = React.useRef<HTMLInputElement>(null);

const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files) {
    setAttachments(prev => [...prev, ...Array.from(files)]);
  }
};
```

**After:**
```typescript
const {
  pendingFiles: attachments,
  isUploading,
  uploadError,
  addFiles,
  removeFile,
  clearFiles,
  handleFileInputChange,
  fileInputRef,
  validatePendingFiles
} = useFileUpload();
```

### 2. TaskDetails.tsx (Complex Case)

**Before:**
```typescript
const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

const savePendingAttachments = async () => {
  if (pendingAttachments.length > 0) {
    try {
      setIsUploadingAttachments(true);
      
      const uploadedAttachments = await Promise.all(
        pendingAttachments.map(async (file) => {
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

      await addTaskAttachments(task.id, uploadedAttachments);
      // ... more complex logic
    } finally {
      setIsUploadingAttachments(false);
    }
  }
};
```

**After:**
```typescript
const {
  pendingFiles: pendingAttachments,
  isUploading: isUploadingAttachments,
  uploadError,
  uploadTaskFiles,
  handleFileInputChange,
  fileInputRef
} = useFileUpload();

const savePendingAttachments = async () => {
  if (pendingAttachments.length > 0) {
    try {
      await uploadTaskFiles(task.id, {
        onTaskAttachmentsUpdate: setTaskAttachments,
        onDescriptionUpdate: (updatedDescription) => {
          setEditedTask(prev => ({ ...prev, description: updatedDescription }));
        },
        currentDescription: editedTask.description,
        currentTaskAttachments: taskAttachments
      });
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }
};
```

### 3. TextEditor.tsx (Editor Integration)

**Before:**
```typescript
const [newAttachments, setNewAttachments] = useState<File[]>([]);
const [displayedAttachments, setDisplayedAttachments] = useState<any[]>([]);

const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files) {
    const newFiles = Array.from(files);
    const updatedAttachments = [...newAttachments, ...newFiles];
    setNewAttachments(updatedAttachments);
    
    const newDisplayedAttachments = newFiles.map(file => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      isNew: true,
      file
    }));
    
    setDisplayedAttachments(prev => [...prev, ...newDisplayedAttachments]);
    
    if (onAttachmentsChange) {
      onAttachmentsChange(updatedAttachments);
    }
  }
};
```

**After:**
```typescript
const {
  pendingFiles: newAttachments,
  isUploading,
  uploadError,
  addFiles,
  handleFileInputChange,
  fileInputRef
} = useFileUpload();

const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  handleFileInputChange(e);
  
  // Update displayed attachments for UI feedback
  const files = e.target.files;
  if (files) {
    const newFiles = Array.from(files);
    const newDisplayedAttachments = newFiles.map(createTempAttachment);
    setDisplayedAttachments(prev => [...prev, ...newDisplayedAttachments]);
    
    if (onAttachmentsChange) {
      onAttachmentsChange([...newAttachments, ...newFiles]);
    }
  }
};
```

## Migration Steps

### Step 1: Install the New Utilities
```bash
# Files are already created:
# - src/utils/fileUploadUtils.ts
# - src/hooks/useFileUpload.ts
```

### Step 2: Update Imports
```typescript
import { useFileUpload, createFileInput } from '../hooks/useFileUpload';
import { createTempAttachment } from '../utils/fileUploadUtils';
```

### Step 3: Replace State Management
Replace manual state management with the hook:
```typescript
// Remove these:
const [attachments, setAttachments] = useState<File[]>([]);
const [isUploading, setIsUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);

// Replace with:
const {
  pendingFiles: attachments,
  isUploading,
  uploadError,
  // ... other methods
} = useFileUpload();
```

### Step 4: Update File Input Handling
```typescript
// Replace manual file input handling:
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files) {
    setAttachments(prev => [...prev, ...Array.from(files)]);
  }
};

// With:
const { handleFileInputChange, fileInputRef } = useFileUpload();
```

### Step 5: Update Upload Logic
```typescript
// Replace complex upload logic:
const uploadFiles = async () => {
  setIsUploading(true);
  try {
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const fileData = await uploadFile(file);
        return { /* ... */ };
      })
    );
    // ... more logic
  } finally {
    setIsUploading(false);
  }
};

// With:
const { uploadTaskFiles, uploadCommentFiles } = useFileUpload();
await uploadTaskFiles(taskId, options);
```

### Step 6: Update UI Components
```typescript
// Replace manual file input:
<input
  type="file"
  ref={fileInputRef}
  onChange={handleFileUpload}
  className="hidden"
  multiple
/>

// With:
{createFileInput(fileInputRef, handleFileInputChange)}
```

## Component-Specific Migration

### TextEditor.tsx
- **Complexity**: High (editor integration)
- **Key Changes**: Maintain displayedAttachments for UI feedback
- **Migration Time**: ~30 minutes

### TaskDetails.tsx
- **Complexity**: Medium (task attachment management)
- **Key Changes**: Use uploadTaskFiles with callbacks
- **Migration Time**: ~20 minutes

### TaskPage.tsx
- **Complexity**: Medium (similar to TaskDetails)
- **Key Changes**: Use uploadTaskFiles with callbacks
- **Migration Time**: ~20 minutes

### QuickEditModal.tsx
- **Complexity**: Low (simple task attachments)
- **Key Changes**: Use uploadTaskFiles
- **Migration Time**: ~15 minutes

### CommentEditor.tsx
- **Complexity**: Low (simple comment attachments)
- **Key Changes**: Use uploadCommentFiles
- **Migration Time**: ~10 minutes

## Testing Checklist

- [ ] File selection works
- [ ] File validation works
- [ ] Upload progress shows
- [ ] Error handling works
- [ ] File removal works
- [ ] Multiple file upload works
- [ ] Upload cancellation works
- [ ] UI updates correctly

## Rollback Plan

If issues arise, you can easily rollback by:
1. Reverting the component changes
2. Keeping the utility files for future use
3. The utilities are non-breaking additions

## Benefits After Migration

- **50% less code** in upload-related components
- **Consistent error handling** across all components
- **Better user experience** with standardized validation
- **Easier maintenance** with centralized logic
- **Better testing** with isolated utilities
