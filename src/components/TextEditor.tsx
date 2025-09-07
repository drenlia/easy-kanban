import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
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
  compact = false
}: TextEditorProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [hasSelectedText, setHasSelectedText] = useState(false);
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [openInNewWindow, setOpenInNewWindow] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Merge default toolbar options with provided ones, with compact overrides
  const compactToolbarOptions = compact ? {
    bold: true,
    italic: true,
    underline: false,
    link: true,
    lists: false,
    alignment: false,
    attachments: false
  } : defaultToolbarOptions;
  
  const finalToolbarOptions = { ...compactToolbarOptions, ...toolbarOptions };

  // Compact styling
  const buttonClass = compact ? 'p-1' : 'p-2';
  const iconSize = compact ? 14 : 16;

  const editor = useEditor({
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
        // Handle Escape key for compact mode
        if (compact && event.key === 'Escape' && onCancel) {
          event.preventDefault();
          onCancel();
          return true;
        }
        
        // Handle Enter key for compact mode (save)
        if (compact && event.key === 'Enter' && !event.shiftKey && onSubmit) {
          event.preventDefault();
          const content = view.state.doc.textContent;
          onSubmit(editor?.getHTML() || '', []);
          return true;
        }
        
        return false;
      },
      handleBlur: (view, event) => {
        // Auto-save on blur for compact mode
        if (compact && onSubmit) {
          const content = editor?.getHTML() || '';
          onSubmit(content, []);
        }
      }
    }
  });

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
      setAttachments(prev => [...prev, ...Array.from(files)]);
    }
  };

  const handleSubmit = async () => {
    if (!editor) return;
    
    const content = editor.getHTML();
    const isEmptyContent = !content || content.replace(/<[^>]*>/g, '').trim() === '';
    
    if (!isEmptyContent || (showAttachments && attachments.length > 0)) {
      try {
        await onSubmit(content, showAttachments ? [...attachments] : undefined);
        editor.commands.clearContent();
        setAttachments([]);
      } catch (error) {
        console.error('Failed to submit content:', error);
      }
    }
  };

  const handleCancel = () => {
    if (editor) {
      editor.commands.clearContent();
    }
    setAttachments([]);
    onCancel?.();
  };

  if (!editor) return null;

  return (
    <div className={`${compact ? 'border rounded' : 'border rounded-lg'} overflow-hidden ${className}`}>
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
                      editor.chain().focus().setTextSelection(linkStart, linkEnd).run();
                      
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
      <div className={resizable ? "resize-y overflow-auto" : ""}>
        <EditorContent editor={editor} />
      </div>

      {/* Attachments */}
      {showAttachments && attachments.length > 0 && (
        <div className="p-2 border-t bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">Attachments:</p>
          <div className="space-y-1">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Paperclip size={14} className="text-gray-500" />
                <span className="text-gray-700">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                  className="ml-auto text-gray-500 hover:text-gray-700"
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
    </div>
  );
}
