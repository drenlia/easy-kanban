import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Image from '@tiptap/extension-image';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Link2, 
  Paperclip,
  List,
  ListOrdered,
  Check,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';

interface ToolbarOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  link?: boolean;
  lists?: boolean;
  alignment?: boolean;
  attachments?: boolean;
}

interface TextEditorProps {
  onSubmit: (content: string, attachments?: File[]) => Promise<void>;
  onCancel?: () => void;
  onChange?: (content: string) => void;
  onAttachmentsChange?: (attachments: File[]) => void;
  onAttachmentDelete?: (attachmentId: string) => Promise<void>;
  onImageRemovalNeeded?: (attachmentName: string) => void; // Called when image is removed to sync attachments
  initialContent?: string;
  isEditing?: boolean;
  showAttachments?: boolean;
  placeholder?: string;
  minHeight?: string;
  showToolbar?: boolean;
  showSubmitButtons?: boolean;
  submitButtonText?: string;
  cancelButtonText?: string;
  toolbarOptions?: ToolbarOptions;
  className?: string;
  editorClassName?: string;
  resizable?: boolean;
  compact?: boolean;
  // New props for attachment context
  attachmentContext?: 'task' | 'comment';
  attachmentParentId?: string;
  existingAttachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
  // Image behavior control props
  allowImagePaste?: boolean;   // Allow pasting new images (default: true)
  allowImageDelete?: boolean;  // Show delete button on images (default: true)
  allowImageResize?: boolean;  // Allow resizing images (default: true)
  imageDisplayMode?: 'full' | 'compact'; // Image display size (default: 'full')
}

const defaultToolbarOptions: ToolbarOptions = {
  bold: true,
  italic: true,
  underline: true,
  link: true,
  lists: true,
  alignment: false,
  attachments: false,
};

export default function TextEditor({
  onSubmit,
  onCancel,
  onChange,
  onAttachmentsChange,
  onAttachmentDelete,
  onImageRemovalNeeded,
  initialContent = '',
  isEditing = false,
  showAttachments = false,
  placeholder = 'Start typing...',
  minHeight = '100px',
  showToolbar = true,
  showSubmitButtons = true,
  submitButtonText = 'Submit',
  cancelButtonText = 'Cancel',
  toolbarOptions = defaultToolbarOptions,
  className = '',
  editorClassName = '',
  resizable = true,
  compact = false,
  attachmentContext = 'comment',
  attachmentParentId,
  existingAttachments = [],
  // Image behavior control props with defaults
  allowImagePaste = true,
  allowImageDelete = true,
  allowImageResize = true,
  imageDisplayMode = 'full'
}: TextEditorProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [hasSelectedText, setHasSelectedText] = useState(false);
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [openInNewWindow, setOpenInNewWindow] = useState(true);
  // Handle both new files and existing attachments
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [displayedAttachments, setDisplayedAttachments] = useState<Array<{
    id: string;
    name: string;
    url?: string;
    type: string;
    size: number;
    isNew?: boolean;
    file?: File;
  }>>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);

  // Track previous existingAttachments to prevent infinite updates
  const prevExistingAttachmentsRef = React.useRef<string>('');
  
  // Initialize displayed attachments when existingAttachments changes
  React.useEffect(() => {
    const currentKey = JSON.stringify(existingAttachments.map(att => att.id).sort());
    
    console.log('🔄 TextEditor: existingAttachments changed');
    console.log('🔄 Previous key:', prevExistingAttachmentsRef.current);
    console.log('🔄 Current key:', currentKey);
    console.log('🔄 existingAttachments:', existingAttachments.map(att => ({id: att.id, name: att.name})));
    
    // Only update if the attachments actually changed
    if (prevExistingAttachmentsRef.current !== currentKey) {
      prevExistingAttachmentsRef.current = currentKey;
      console.log('🔄 TextEditor: Updating displayedAttachments');
      setDisplayedAttachments(prev => {
        console.log('🔄 Previous displayedAttachments:', prev.map(att => ({id: att.id, name: att.name, isNew: att.isNew})));
        
        // When parent attachments change, trust the parent's state completely
        // Only keep "New" attachments if they're truly new and not represented in parent
        const existingNames = existingAttachments.map(att => att.name);
        const newAttachmentsToKeep = prev.filter(att => 
          att.isNew && 
          !existingNames.includes(att.name) &&
          att.file // Only keep if it's actually a new file being uploaded
        );
        
        const newDisplayed = [
          ...existingAttachments.map(att => ({ ...att, isNew: false })),
          ...newAttachmentsToKeep
        ];
        console.log('🔄 TextEditor: New displayedAttachments:', newDisplayed.map(att => ({id: att.id, name: att.name, isNew: att.isNew})));
        return newDisplayed;
      });
    } else {
      console.log('🔄 TextEditor: No change detected, skipping update');
    }
  }, [existingAttachments]);

  // Merge default toolbar options with provided ones, with compact overrides
  const compactToolbarOptions = compact ? {
    bold: true,
    italic: true,
    underline: false,
    link: true,
    lists: true,
    alignment: false,
    attachments: false
  } : defaultToolbarOptions;
  
  const finalToolbarOptions = { ...compactToolbarOptions, ...toolbarOptions };

  // Compact styling
  const buttonClass = compact ? 'p-1' : 'p-2';
  const iconSize = compact ? 14 : 16;

  // Generate unique filename for pasted images
  const generateImageFilename = React.useCallback((file: File): string => {
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = file.type.includes('png') ? 'png' : 
                     file.type.includes('jpg') || file.type.includes('jpeg') ? 'jpg' :
                     file.type.includes('gif') ? 'gif' :
                     file.type.includes('webp') ? 'webp' : 'png';
    return `img-${randomId}.${extension}`;
  }, []);


  const editor = useEditor({
    autofocus: compact ? 'end' : false,
    extensions: [
      StarterKit.configure({
        // Disable the default list extensions from StarterKit
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      // Add explicit list extensions with proper configuration
      BulletList.configure({
        keepMarks: true,
        keepAttributes: false,
        HTMLAttributes: {
          class: 'tiptap-bullet-list',
        },
      }),
      OrderedList.configure({
        keepMarks: true,
        keepAttributes: false,
        HTMLAttributes: {
          class: 'tiptap-ordered-list',
        },
      }),
      ListItem.configure({
        HTMLAttributes: {
          class: 'tiptap-list-item',
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false, // We'll handle clicks manually
        HTMLAttributes: {
          class: 'text-blue-500 hover:text-blue-700 underline cursor-pointer',
          rel: 'noopener noreferrer',
          target: '_blank'
        },
        protocols: ['http', 'https', 'mailto'],
        validate: href => /^https?:\/\//.test(href)
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph']
      }),
      Image.extend({
        name: 'resizableImage',
        addNodeView() {
          return ({ node, updateAttributes, getPos, editor }) => {
            // Access the outer component's state through a closure
            const container = document.createElement('div');
            container.className = 'tiptap-image-container relative inline-block';
            
            const img = document.createElement('img');
            img.src = node.attrs.src;
            img.className = 'tiptap-image block';
            // Add compact data attribute for CSS styling
            if (imageDisplayMode === 'compact') {
              img.setAttribute('data-compact', 'true');
            }
            img.style.width = node.attrs.width || (imageDisplayMode === 'compact' ? '150px' : '300px');
            img.style.height = 'auto';
            img.style.borderRadius = '4px';
            img.style.cursor = 'pointer';
            
            // Make image non-selectable if deletion is not allowed
            if (!allowImageDelete) {
              img.style.userSelect = 'none';
              img.style.pointerEvents = 'none';
              img.draggable = false;
            }
            
            // Apply existing border styles if any
            if (node.attrs['data-border-style']) {
              img.style.border = node.attrs['data-border-style'];
            }
            
            // Border options popup
            const createBorderOptions = () => {
              // Remove any existing popup
              const existingPopup = document.querySelector('.border-options-popup');
              if (existingPopup) {
                existingPopup.remove();
              }
              
              const popup = document.createElement('div');
              popup.className = 'border-options-popup absolute z-20 bg-white border border-gray-300 rounded-md shadow-lg p-2';
              popup.style.cssText = 'top: 100%; left: 0; min-width: 200px; margin-top: 4px;';
              
              const borderOptions = [
                { label: 'No Border', value: 'none' },
                { label: 'Thin Black', value: '1px solid #000' },
                { label: 'Thick Black', value: '3px solid #000' },
                { label: 'Thin Gray', value: '1px solid #666' },
                { label: 'Thin Blue', value: '2px solid #3b82f6' },
                { label: 'Dashed Gray', value: '2px dashed #666' },
                { label: 'Dotted Blue', value: '2px dotted #3b82f6' }
              ];
              
              borderOptions.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option.label;
                button.className = 'block w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded';
                button.onclick = (e) => {
                  e.stopPropagation();
                  
                  // Update the image border
                  const borderStyle = option.value === 'none' ? '' : option.value;
                  img.style.border = borderStyle;
                  
                  // Update the node attributes
                  if (updateAttributes && typeof updateAttributes === 'function') {
                    updateAttributes({ 
                      'data-border-style': borderStyle || null 
                    });
                  } else {
                    console.warn('updateAttributes not available');
                  }
                  
                  popup.remove();
                };
                popup.appendChild(button);
              });
              
              // Close popup when clicking outside
              const closePopup = (e: Event) => {
                if (!popup.contains(e.target as Node)) {
                  popup.remove();
                  document.removeEventListener('click', closePopup);
                }
              };
              
              setTimeout(() => {
                document.addEventListener('click', closePopup);
              }, 100);
              
              container.appendChild(popup);
            };
            
            // Click handler for border options
            img.onclick = (e) => {
              e.stopPropagation();
              createBorderOptions();
            };
            
            // Delete button (only if deletion is allowed)
            let deleteBtn: HTMLButtonElement | null = null;
            if (allowImageDelete) {
              deleteBtn = document.createElement('button');
              deleteBtn.innerHTML = '×';
              deleteBtn.className = 'absolute bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center z-10';
              deleteBtn.style.cssText = 'display: none; width: 18px; height: 18px; top: -6px; right: -6px; font-size: 12px; line-height: 1;';
              deleteBtn.onclick = (e) => {
                e.preventDefault();
                console.log('🔴 Image X clicked - removing image immediately');
                
                // STEP 1: Remove image from editor immediately
                const pos = getPos();
                if (typeof pos === 'number') {
                  editor.commands.deleteRange({ from: pos, to: pos + 1 });
                  console.log('✅ Image removed from editor');
                }
                
                // STEP 2: Extract filename for deletion
                const imageFilename = node.attrs['data-filename'] || node.attrs.alt;
                if (imageFilename) {
                  console.log('🔍 Found filename for cleanup:', imageFilename);
                  
                  // STEP 3: Clean up local state immediately
                  setNewAttachments(prev => prev.filter(att => att.name !== imageFilename));
                  setDisplayedAttachments(prev => prev.filter(att => att.name !== imageFilename));
                  
                  // STEP 4: Use the global cleanup function to handle server deletion
                  if (onImageRemovalNeeded) {
                    console.log('🧹 Calling global cleanup for:', imageFilename);
                    onImageRemovalNeeded(imageFilename);
                  }
                }
              };
            }
            
            // Resize handle (only if resizing is allowed)
            let resizeHandle: HTMLDivElement | null = null;
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;
            let handleMouseMove: ((e: MouseEvent) => void) | null = null;
            let handleMouseUp: (() => void) | null = null;
            
            if (allowImageResize) {
              resizeHandle = document.createElement('div');
              resizeHandle.className = 'absolute bg-blue-500 cursor-se-resize rounded-tl-md z-10';
              resizeHandle.style.cssText = 'display: none; width: 12px; height: 12px; bottom: -2px; right: -2px;';
              
              // Define the event handlers outside so they can be cleaned up
              handleMouseMove = (e: MouseEvent) => {
                if (!isResizing) return;
                const width = startWidth + (e.clientX - startX);
                const newWidth = Math.max(100, Math.min(800, width));
                img.style.width = newWidth + 'px';
                
                // Safety check for updateAttributes function
                if (updateAttributes && typeof updateAttributes === 'function') {
                  try {
                    updateAttributes({ width: newWidth + 'px' });
                  } catch (error) {
                    console.warn('⚠️ Failed to update image attributes during resize:', error);
                  }
                } else {
                  console.warn('⚠️ updateAttributes function is not available during resize');
                }
              };
              
              handleMouseUp = () => {
                isResizing = false;
                if (handleMouseMove) document.removeEventListener('mousemove', handleMouseMove);
                if (handleMouseUp) document.removeEventListener('mouseup', handleMouseUp);
              };
              
              resizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                startX = e.clientX;
                startWidth = parseInt(window.getComputedStyle(img).width, 10);
                
                if (handleMouseMove) document.addEventListener('mousemove', handleMouseMove);
                if (handleMouseUp) document.addEventListener('mouseup', handleMouseUp);
              });
            }
            
            // Show/hide controls on hover
            container.addEventListener('mouseenter', () => {
              if (deleteBtn) deleteBtn.style.display = 'flex';
              if (resizeHandle) resizeHandle.style.display = 'block';
            });
            
            container.addEventListener('mouseleave', () => {
              if (!isResizing) {
                if (deleteBtn) deleteBtn.style.display = 'none';
                if (resizeHandle) resizeHandle.style.display = 'none';
              }
            });
            
            container.appendChild(img);
            if (deleteBtn) container.appendChild(deleteBtn);
            if (resizeHandle) container.appendChild(resizeHandle);
            
            return {
              dom: container,
              update: (updatedNode) => {
                if (updatedNode.type.name !== 'resizableImage') return false;
                img.src = updatedNode.attrs.src;
                img.style.width = updatedNode.attrs.width || '300px';
                return true;
              },
              destroy: () => {
                // Clean up event listeners when the node is destroyed
                if (isResizing) {
                  if (handleMouseMove) document.removeEventListener('mousemove', handleMouseMove);
                  if (handleMouseUp) document.removeEventListener('mouseup', handleMouseUp);
                  isResizing = false;
                }
              }
            };
          };
        }
      }).configure({
        HTMLAttributes: {
          class: 'tiptap-image',
        },
        allowBase64: false,
      })
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      if (onChange) {
        const content = editor.getHTML();
        onChange(content);
      }
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${editorClassName}`,
        style: `min-height: ${compact ? '60px' : minHeight}`,
        placeholder: placeholder
      },
      handleClick: (view, pos, event) => {
        // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
        const isModifierPressed = event.ctrlKey || event.metaKey;
        
        if (isModifierPressed) {
          // Get the node at the clicked position
          const { doc, schema } = view.state;
          const $pos = doc.resolve(pos);
          
          // Check if we clicked on a link
          const link = $pos.marks().find(mark => mark.type === schema.marks.link);
          
          if (link && link.attrs.href) {
            // Prevent default editor behavior
            event.preventDefault();
            event.stopPropagation();
            
            // Open the link
            window.open(link.attrs.href, '_blank', 'noopener,noreferrer');
            return true; // Handled
          }
        }
        
        return false; // Not handled, let editor handle normally
      },
      handleKeyDown: (view, event) => {
        // Prevent image deletion via keyboard when allowImageDelete is false
        if (!allowImageDelete) {
          const { state } = view;
          const { selection } = state;
          const { $from, $to } = selection;
          
          // For specific deletion keys (Backspace, Delete)
          if (event.key === 'Backspace' || event.key === 'Delete') {
            const nodeAfter = $from.nodeAfter;
            const nodeBefore = $from.nodeBefore;
            
            // For Backspace: check node before cursor
            if (event.key === 'Backspace' && nodeBefore && nodeBefore.type.name === 'resizableImage') {
              event.preventDefault();
              return true;
            }
            
            // For Delete: check node after cursor  
            if (event.key === 'Delete' && nodeAfter && nodeAfter.type.name === 'resizableImage') {
              event.preventDefault();
              return true;
            }
          }
          
          // Prevent ANY key that would replace selected content when image is selected
          if (!selection.empty) {
            let hasSelectedImage = false;
            state.doc.nodesBetween(selection.from, selection.to, (node) => {
              if (node.type.name === 'resizableImage') {
                hasSelectedImage = true;
                return false; // Stop iteration
              }
            });
            
            if (hasSelectedImage) {
              // Prevent any key that would replace the selection (including Shift+Enter, typing, etc.)
              event.preventDefault();
              return true;
            }
          }
        }
        
        // Handle Escape key for compact mode
        if (compact && event.key === 'Escape' && onCancel) {
          event.preventDefault();
          onCancel();
          return true;
        }
        
        // Handle Enter key for compact mode (save)
        if (compact && event.key === 'Enter' && !event.shiftKey && onSubmit && editor) {
          // Don't save if we're in a list - let TipTap handle list item creation
          const { $from } = view.state.selection;
          const isInList = $from.parent.type.name === 'listItem' || 
                          editor.isActive('bulletList') || 
                          editor.isActive('orderedList');
          
          if (!isInList) {
            event.preventDefault();
            onSubmit(editor.getHTML() || '', []);
            return true;
          }
        }
        
        return false;
      }
    }
  });

  // Update editor content when initialContent prop changes
  React.useEffect(() => {
    if (editor && initialContent !== undefined) {
      const currentContent = editor.getHTML();
      if (currentContent !== initialContent) {
        console.log('🔄 TextEditor: initialContent changed, updating editor content');
        console.log('🔄 From:', currentContent.substring(0, 100) + '...');
        console.log('🔄 To:', initialContent.substring(0, 100) + '...');
        editor.commands.setContent(initialContent);
      }
    }
  }, [editor, initialContent]);

  // Handle pasted images
  const handleImagePaste = React.useCallback(async (file: File): Promise<void> => {
    // Check if image pasting is allowed
    if (!allowImagePaste) {
      console.log('🚫 Image pasting disabled in this editor mode');
      return;
    }
    
    try {
      // Generate unique filename and attachment ID
      const filename = generateImageFilename(file);
      const attachmentId = `temp-${Date.now()}-${Math.random()}`;
      
      // Create a temporary blob URL for immediate display
      const tempUrl = URL.createObjectURL(file);
      
      if (!editor) {
        console.error('❌ Editor not available');
        return;
      }
      
      // Add the image to the editor immediately with temp URL
      // Store filename in the URL itself to survive content updates
      const urlWithFilename = `${tempUrl}#${filename}`;
      editor.chain().focus().insertContent({
        type: 'resizableImage',
        attrs: {
          src: urlWithFilename,
          'data-filename': filename,
          'data-attachment-id': attachmentId,
          'data-temp': 'true',
          width: imageDisplayMode === 'compact' ? '150px' : '300px',
          alt: filename // Also store in alt attribute as backup
        }
      }).run();
      
      console.log('✅ Image pasted:', filename);
      
      // Create a new File object with the generated filename to avoid "image.png" duplication
      const renamedFile = new File([file], filename, { type: file.type });
      
      // Add to attachments for later upload
      const updatedAttachments = [...newAttachments, renamedFile];
      setNewAttachments(updatedAttachments);
      
      // Add to displayed attachments
      const newDisplayedAttachment = {
        id: attachmentId,
        name: filename,
        type: file.type,
        size: file.size,
        isNew: true,
        file: renamedFile
      };
      
      setDisplayedAttachments(prev => [...prev, newDisplayedAttachment]);
      
      // Notify parent component
      if (onAttachmentsChange) {
        onAttachmentsChange(updatedAttachments);
      }
      
    } catch (error) {
      console.error('❌ Error handling pasted image:', error);
    }
  }, [editor, generateImageFilename]);

  // Function to remove images from editor when attachments are deleted
  const removeImageByAttachment = React.useCallback((attachmentName: string) => {
    if (!editor) {
      console.log('❌ removeImageByAttachment: Editor not available');
      return;
    }
    
    console.log('🔍 removeImageByAttachment: Looking for images with filename:', attachmentName);
    
    // Find and remove images with matching filename
    const { doc } = editor.state;
    const ranges: { from: number; to: number }[] = [];
    
    doc.descendants((node, pos) => {
      if (node.type.name === 'resizableImage') {
        const nodeFilename = node.attrs['data-filename'];
        const nodeAlt = node.attrs.alt;
        const nodeSrc = node.attrs.src;
        
        console.log('🔍 Found image:', {
          nodeFilename,
          nodeAlt,
          nodeSrc: nodeSrc?.substring(0, 100) + '...',
          lookingFor: attachmentName
        });
        
        // Check multiple sources for filename match
        const matches = 
          nodeFilename === attachmentName ||
          nodeAlt === attachmentName ||
          (nodeSrc && nodeSrc.includes(`#${attachmentName}`)) ||
          (nodeSrc && nodeSrc.includes(attachmentName));
          
        if (matches) {
          console.log('✅ Image matches, will remove');
          ranges.push({ from: pos, to: pos + node.nodeSize });
        }
      }
    });
    
    // Remove images in reverse order to maintain positions
    ranges.reverse().forEach(range => {
      editor.commands.deleteRange(range);
    });
    
    if (ranges.length === 0) {
      console.log(`❌ removeImageByAttachment: No images found to remove for: ${attachmentName}`);
    } else {
      console.log(`🗑️ removeImageByAttachment: Removed ${ranges.length} image(s) for attachment: ${attachmentName}`);
    }
  }, [editor]);

  // Provide removeImageByAttachment function globally for parent to call
  React.useEffect(() => {
    (window as any).textEditorRemoveImage = removeImageByAttachment;
    return () => {
      delete (window as any).textEditorRemoveImage;
    };
  }, [removeImageByAttachment]);

  // Handle paste events for images
  React.useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          console.log('🖼️ Image paste detected:', item.type);
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleImagePaste(file);
          }
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('paste', handlePaste);
    console.log('📋 Paste event listener added to editor');

    return () => {
      editorElement.removeEventListener('paste', handlePaste);
      console.log('📋 Paste event listener removed');
    };
  }, [editor, handleImagePaste]);

  // Handle clicks in empty space to move cursor to end
  const handleEditorContainerClick = React.useCallback((event: React.MouseEvent) => {
    if (!editor) return;
    
    const target = event.target as HTMLElement;
    const clickY = event.clientY;
    
    // Check if we're clicking in the editor area
    const editorElement = editor.view.dom;
    if (!editorElement.contains(target)) return;
    
    // Get the bounds of the actual content
    const children = editorElement.children;
    
    if (children.length > 0) {
      const lastChild = children[children.length - 1] as HTMLElement;
      const lastChildRect = lastChild.getBoundingClientRect();
      
      // If clicking below the last content element (with some tolerance), move cursor to end
      if (clickY > lastChildRect.bottom + 5) {
        event.preventDefault();
        editor.commands.focus('end');
        console.log('📍 Moved cursor to end due to empty space click');
      }
    } else {
      // If no content at all, always move to end
      editor.commands.focus('end');
    }
  }, [editor]);

  // Handle outside clicks for compact mode (moved after useEditor)
  React.useEffect(() => {
    if (!compact || !onSubmit || !editor) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Safety checks
      if (!event.target || !editorRef.current) return;
      
      try {
        if (!editorRef.current.contains(event.target as Node)) {
          // Save and close when clicking outside
          const content = editor.getHTML();
          onSubmit(content, []);
        }
      } catch (error) {
        console.error('Error in handleClickOutside:', error);
      }
    };

    // Add a small delay to ensure editor is fully initialized
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [compact, onSubmit, editor]);

  const handleLinkSubmit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editor || !linkUrl.trim()) return;

    // Ensure URL has a protocol
    let formattedUrl = linkUrl.trim();
    if (!formattedUrl.match(/^https?:\/\//)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Adding link:', { hasSelectedText, formattedUrl, linkText, openInNewWindow, isEditingExistingLink });

    // Build link attributes based on options
    const linkAttributes: any = { href: formattedUrl };
    if (openInNewWindow) {
      linkAttributes.target = '_blank';
      linkAttributes.rel = 'noopener noreferrer';
    }
    
    console.log('Link attributes:', linkAttributes);

    if (isEditingExistingLink) {
      // We're editing an existing link - update it directly
      console.log('Updating existing link with attributes:', linkAttributes);
      
      // Extend the selection to cover the entire link mark and then update it
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink(linkAttributes)
        .run();
      
      console.log('Link updated, checking if active:', editor.isActive('link'));
      console.log('Current selection:', editor.state.selection);
      console.log('Editor HTML after update:', editor.getHTML());
    } else if (hasSelectedText) {
      // Text was selected when dialog opened - add link to selection
      console.log('Adding link to selected text');
      editor.chain().focus().setLink(linkAttributes).run();
    } else {
      // No text was selected - insert new text with link
      const textToInsert = linkText.trim() || formattedUrl;
      console.log('Inserting new linked text:', textToInsert);
      
      // Build HTML attributes string
      const targetAttr = openInNewWindow ? ' target="_blank" rel="noopener noreferrer"' : '';
      
      // Use a simpler approach - insert content with link in one go
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${formattedUrl}" class="text-blue-500 hover:text-blue-700 underline"${targetAttr}>${textToInsert}</a>`)
        .run();
    }

    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
    setHasSelectedText(false);
    setIsEditingExistingLink(false);
    setOpenInNewWindow(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      const updatedAttachments = [...newAttachments, ...newFiles];
      setNewAttachments(updatedAttachments);
      
      // Add to displayed attachments for immediate UI feedback
      const newDisplayedAttachments = newFiles.map(file => ({
        id: `temp-${Date.now()}-${Math.random()}`, // Temporary ID
        name: file.name,
        type: file.type,
        size: file.size,
        isNew: true,
        file
      }));
      
      setDisplayedAttachments(prev => [...prev, ...newDisplayedAttachments]);
      
      // Notify parent component about attachment changes
      if (onAttachmentsChange) {
        onAttachmentsChange(updatedAttachments);
      }
    }
  };

  const handleSubmit = async () => {
    if (!editor) return;
    
    const content = editor.getHTML();
    const isEmptyContent = !content || content.replace(/<[^>]*>/g, '').trim() === '';
    
    if (!isEmptyContent || (showAttachments && newAttachments.length > 0)) {
      try {
        // Only pass new attachments to onSubmit - existing ones are already saved
        await onSubmit(content, showAttachments ? [...newAttachments] : undefined);
        editor.commands.clearContent();
        setNewAttachments([]);
        setDisplayedAttachments(existingAttachments.map(att => ({ ...att, isNew: false })));
      } catch (error) {
        console.error('Failed to submit content:', error);
      }
    }
  };

  const handleCancel = () => {
    if (editor) {
      editor.commands.clearContent();
    }
    setNewAttachments([]);
    setDisplayedAttachments(existingAttachments.map(att => ({ ...att, isNew: false })));
    onCancel?.();
  };

  if (!editor) return null;

  return (
    <div 
      ref={editorRef}
      className={`${compact ? 'border rounded' : 'border rounded-lg'} overflow-hidden ${className}`}
    >
      {/* Toolbar */}
      {showToolbar && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'p-1' : 'p-2'} border-b bg-gray-50`}>
          {finalToolbarOptions.bold && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`${buttonClass} rounded hover:bg-gray-200 ${
                editor.isActive('bold') ? 'bg-gray-200' : ''
              }`}
              title="Bold"
            >
              <Bold size={iconSize} />
            </button>
          )}
          
          {finalToolbarOptions.italic && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`${buttonClass} rounded hover:bg-gray-200 ${
                editor.isActive('italic') ? 'bg-gray-200' : ''
              }`}
              title="Italic"
            >
              <Italic size={iconSize} />
            </button>
          )}
          
          {finalToolbarOptions.underline && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`${buttonClass} rounded hover:bg-gray-200 ${
                editor.isActive('underline') ? 'bg-gray-200' : ''
              }`}
              title="Underline"
            >
              <UnderlineIcon size={iconSize} />
            </button>
          )}
          
          {finalToolbarOptions.link && (
            <button
              type="button"
              onClick={() => {
                if (editor) {
                  const hasSelection = !editor.state.selection.empty;
                  const isOnLink = editor.isActive('link');
                  
                  if (isOnLink) {
                    // Cursor is on an existing link - get link attributes
                    const { from } = editor.state.selection;
                    const { doc, schema } = editor.state;
                    
                    // Find the link mark at the current position
                    const $pos = doc.resolve(from);
                    const linkMark = $pos.marks().find(mark => mark.type === schema.marks.link);
                    
                    if (linkMark) {
                      // Find the full extent of the link
                      let linkStart = from;
                      let linkEnd = from;
                      
                      // Expand backwards to find link start
                      while (linkStart > 0) {
                        const $prevPos = doc.resolve(linkStart - 1);
                        const prevLinkMark = $prevPos.marks().find(mark => 
                          mark.type === schema.marks.link && mark.attrs.href === linkMark.attrs.href
                        );
                        if (prevLinkMark) {
                          linkStart--;
                        } else {
                          break;
                        }
                      }
                      
                      // Expand forwards to find link end
                      while (linkEnd < doc.content.size) {
                        const $nextPos = doc.resolve(linkEnd);
                        const nextLinkMark = $nextPos.marks().find(mark => 
                          mark.type === schema.marks.link && mark.attrs.href === linkMark.attrs.href
                        );
                        if (nextLinkMark) {
                          linkEnd++;
                        } else {
                          break;
                        }
                      }
                      
                      // Select the entire link for editing
                      editor.chain().focus().setTextSelection({ from: linkStart, to: linkEnd }).run();
                      
                      // Get the link text and URL
                      const linkText = doc.textBetween(linkStart, linkEnd);
                      const linkUrl = linkMark.attrs.href;
                      
                      console.log('Editing existing link:', { linkUrl, linkText, linkStart, linkEnd });
                      
                      // Pre-populate the dialog
                      setLinkUrl(linkUrl);
                      setLinkText(linkText);
                      setHasSelectedText(true);
                      setIsEditingExistingLink(true);
                      
                      // Check if it opens in new window
                      const opensInNewWindow = linkMark.attrs.target === '_blank';
                      setOpenInNewWindow(opensInNewWindow);
                    }
                  } else {
                    // Normal behavior for new links
                    setHasSelectedText(hasSelection);
                    if (hasSelection) {
                      // Get the selected text to pre-fill the link text field
                      const selectedText = editor.state.doc.textBetween(
                        editor.state.selection.from,
                        editor.state.selection.to
                      );
                      setLinkText(selectedText);
                    } else {
                      setLinkText('');
                    }
                    setLinkUrl('');
                    setOpenInNewWindow(true);
                    setIsEditingExistingLink(false);
                  }
                }
                setShowLinkDialog(true);
              }}
              className={`${buttonClass} rounded hover:bg-gray-200 ${
                editor.isActive('link') ? 'bg-gray-200' : ''
              }`}
              title={editor?.isActive('link') ? 'Edit Link' : 'Add Link'}
            >
              <Link2 size={iconSize} />
            </button>
          )}
          
          {(finalToolbarOptions.bold || finalToolbarOptions.italic || finalToolbarOptions.underline || finalToolbarOptions.link) && 
           (finalToolbarOptions.lists || finalToolbarOptions.alignment || finalToolbarOptions.attachments) && (
            <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
          )}
          
          {finalToolbarOptions.lists && (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-2 rounded hover:bg-gray-200 ${
                  editor.isActive('bulletList') ? 'bg-gray-200' : ''
                }`}
                title="Bullet List"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-2 rounded hover:bg-gray-200 ${
                  editor.isActive('orderedList') ? 'bg-gray-200' : ''
                }`}
                title="Numbered List"
              >
                <ListOrdered size={16} />
              </button>
            </>
          )}
          
          {finalToolbarOptions.alignment && (
            <>
              {finalToolbarOptions.lists && (
                <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
              )}
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                className={`p-2 rounded hover:bg-gray-200 ${
                  editor.isActive({ textAlign: 'left' }) ? 'bg-gray-200' : ''
                }`}
                title="Align Left"
              >
                <AlignLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                className={`p-2 rounded hover:bg-gray-200 ${
                  editor.isActive({ textAlign: 'center' }) ? 'bg-gray-200' : ''
                }`}
                title="Align Center"
              >
                <AlignCenter size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                className={`p-2 rounded hover:bg-gray-200 ${
                  editor.isActive({ textAlign: 'right' }) ? 'bg-gray-200' : ''
                }`}
                title="Align Right"
              >
                <AlignRight size={16} />
              </button>
            </>
          )}
          
          {finalToolbarOptions.attachments && showAttachments && (
            <>
              <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded hover:bg-gray-200"
                title="Add Attachment"
              >
                <Paperclip size={16} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Editor Content */}
      <div 
        className={resizable ? "resize-y overflow-auto" : ""}
        onClick={(e) => {
          if (compact && editor && !editor.isFocused) {
            editor.commands.focus('end');
          }
          // Handle clicks in empty space
          handleEditorContainerClick(e);
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Attachments */}
      {showAttachments && displayedAttachments.length > 0 && (
        <div className="p-2 border-t bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">Attachments:</p>
          <div className="space-y-1">
            {displayedAttachments
              .filter((attachment, index, array) => {
                // Remove duplicates: keep only the first occurrence of each name
                // Prioritize existing attachments over new ones
                const firstIndex = array.findIndex(att => att.name === attachment.name);
                if (firstIndex !== index) {
                  // This is a duplicate - keep it only if it's existing and the first occurrence is new
                  const firstOccurrence = array[firstIndex];
                  return !attachment.isNew && firstOccurrence.isNew;
                }
                return true;
              })
              .map((attachment, index) => (
              <div key={attachment.id} className="flex items-center gap-2 text-sm">
                <Paperclip size={14} className="text-gray-500" />
                <span className="text-gray-700">{attachment.name}</span>
                {attachment.isNew ? (
                  <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">New</span>
                ) : (
                  <span className="text-xs text-green-600 bg-green-100 px-1 rounded">Saved</span>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    console.log('🖱️ Attachment X clicked:', {
                      name: attachment.name,
                      id: attachment.id,
                      isNew: attachment.isNew,
                      type: attachment.type,
                      startsWithPending: attachment.id.startsWith('pending-'),
                      buttonType: attachment.isNew ? 'new' : 'existing'
                    });
                    
                    if (attachment.isNew) {
                      console.log('🆕 Processing NEW attachment deletion');
                      
                      // Remove from new attachments and displayed attachments
                      const updatedNewAttachments = newAttachments.filter(file => file.name !== attachment.name);
                      console.log('🔄 Filtered newAttachments:', {
                        before: newAttachments.length,
                        after: updatedNewAttachments.length,
                        removedName: attachment.name
                      });
                      
                      setNewAttachments(updatedNewAttachments);
                      setDisplayedAttachments(prev => prev.filter((_, i) => i !== index));
                      
                      // Notify parent of attachment changes
                      if (onAttachmentsChange) {
                        console.log('📞 Calling onAttachmentsChange with updated attachments');
                        onAttachmentsChange(updatedNewAttachments);
                      } else {
                        console.log('⚠️ No onAttachmentsChange handler provided');
                      }
                      
                      // CRITICAL: Also remove the image from the editor content!
                      console.log('🖼️ Removing image from editor for new attachment:', attachment.name);
                      removeImageByAttachment(attachment.name);
                    } else {
                      // For existing attachments, delete immediately from database
                      if (onAttachmentDelete && !attachment.id.startsWith('pending-')) {
                        try {
                          await onAttachmentDelete(attachment.id);
                          // Don't modify local state - let parent handle updates via existingAttachments
                          
                          // Also remove corresponding image from editor if it exists
                          console.log('🔄 Attachment deleted, removing image from editor:', attachment.name);
                          removeImageByAttachment(attachment.name);
                        } catch (error) {
                          console.error('Failed to delete attachment:', error);
                        }
                      } else {
                        // For new attachments, remove from display and newAttachments
                        setDisplayedAttachments(prev => prev.filter((_, i) => i !== index));
                        
                        // Update newAttachments and notify parent
                        setNewAttachments(prev => {
                          const updated = prev.filter(att => att.name !== attachment.name);
                          if (onAttachmentsChange) {
                            onAttachmentsChange(updated);
                          }
                          return updated;
                        });
                        
                        // Also remove corresponding image from editor if it exists
                        console.log('🔄 New attachment removed, removing image from editor:', attachment.name);
                        console.log('🔍 Attachment details:', {
                          name: attachment.name,
                          id: attachment.id,
                          isNew: attachment.isNew,
                          type: attachment.type
                        });
                        removeImageByAttachment(attachment.name);
                      }
                    }
                  }}
                  className="ml-auto text-gray-500 hover:text-gray-700"
                  title={attachment.isNew ? "Remove attachment" : "Delete attachment"}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Buttons */}
      {showSubmitButtons && (
        <div className="flex justify-end gap-2 p-2 border-t bg-gray-50">
          {onCancel && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              {cancelButtonText}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
          >
            <Check size={14} />
            {submitButtonText}
          </button>
        </div>
      )}

      {/* Link Dialog */}
      {showLinkDialog && (
        <div 
          className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            e.stopPropagation();
            setShowLinkDialog(false);
            setLinkUrl('');
            setLinkText('');
            setHasSelectedText(false);
            setIsEditingExistingLink(false);
            setOpenInNewWindow(true);
          }}
        >
          <div 
            className="bg-white p-4 rounded-lg shadow-lg w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-3">
              {isEditingExistingLink 
                ? 'Edit Link' 
                : hasSelectedText 
                  ? 'Add Link to Selected Text' 
                  : 'Add Link'
              }
            </h3>
            <div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLinkSubmit(e);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                  autoFocus
                />
              </div>
              {!hasSelectedText && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link Text (optional)
                  </label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleLinkSubmit(e);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Link text"
                  />
                </div>
              )}
              {hasSelectedText && (
                <div className="mb-4 p-2 bg-gray-50 rounded border">
                  <span className="text-sm text-gray-600">Selected text: </span>
                  <span className="text-sm font-medium">&ldquo;{linkText}&rdquo;</span>
                </div>
              )}
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={openInNewWindow}
                    onChange={(e) => setOpenInNewWindow(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Open in new window</span>
                </label>
              </div>
              <div className="flex justify-between">
                <div>
                  {isEditingExistingLink && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editor) {
                          editor.chain().focus().unsetLink().run();
                        }
                        setShowLinkDialog(false);
                        setLinkUrl('');
                        setLinkText('');
                        setHasSelectedText(false);
                        setIsEditingExistingLink(false);
                        setOpenInNewWindow(true);
                      }}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                    >
                      Remove Link
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLinkDialog(false);
                      setLinkUrl('');
                      setLinkText('');
                      setHasSelectedText(false);
                      setIsEditingExistingLink(false);
                      setOpenInNewWindow(true);
                    }}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLinkSubmit(e);
                    }}
                    className="px-4 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    {isEditingExistingLink ? 'Update Link' : 'Add Link'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      {showAttachments && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
      )}

      {/* Styles for TipTap images */}
      <style>{`
        .tiptap-image {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          cursor: pointer;
          display: block;
          margin: 8px 0;
        }
        .tiptap-image:hover {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .tiptap-image[data-temp="true"] {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
