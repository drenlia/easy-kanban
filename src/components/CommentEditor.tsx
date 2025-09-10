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
  X
} from 'lucide-react';

interface CommentEditorProps {
  onSubmit: (content: string, attachments: File[]) => Promise<void>;
  onCancel?: () => void;
  initialContent?: string;
  isEditing?: boolean;
}

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

const getLocalISOString = (date: Date) => {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString();
};

export default function CommentEditor({ onSubmit, onCancel, initialContent = '', isEditing = false }: CommentEditorProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 hover:text-blue-700 underline'
        }
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph']
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px] px-3 py-2'
      }
    }
  });

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;

    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent(linkText)
        .setTextSelection(editor.state.selection.from - linkText.length)
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    }

    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
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
    
    if (!isEmptyContent || attachments.length > 0) {
      try {
        await onSubmit(content, [...attachments]);
        editor.commands.clearContent();
        setAttachments([]);
      } catch (error) {
        console.error('Failed to submit comment:', error);
      }
    }
  };

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b bg-gray-50">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('bold') ? 'bg-gray-200' : ''
          }`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('italic') ? 'bg-gray-200' : ''
          }`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('underline') ? 'bg-gray-200' : ''
          }`}
          title="Underline"
        >
          <UnderlineIcon size={16} />
        </button>
        <button
          onClick={() => setShowLinkDialog(true)}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('link') ? 'bg-gray-200' : ''
          }`}
          title="Add Link"
        >
          <Link2 size={16} />
        </button>
        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('bulletList') ? 'bg-gray-200' : ''
          }`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-gray-200 ${
            editor.isActive('orderedList') ? 'bg-gray-200' : ''
          }`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded hover:bg-gray-200"
          title="Add Attachment"
        >
          <Paperclip size={16} />
        </button>
      </div>

      <EditorContent editor={editor} />

      {attachments.length > 0 && (
        <div className="p-2 border-t bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">Attachments:</p>
          <div className="space-y-1">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Paperclip size={14} className="text-gray-500" />
                <span className="text-gray-700">{file.name}</span>
                <button
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

      <div className="flex justify-end gap-2 p-2 border-t bg-gray-50">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!editor?.getText().trim() && attachments.length === 0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded ${
            !editor?.getText().trim() && attachments.length === 0
              ? 'bg-gray-300 cursor-not-allowed text-gray-500'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          <Check size={16} />
          <span>{isEditing ? 'Update Comment' : 'Add Comment'}</span>
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        multiple
      />

      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleLinkSubmit} className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-semibold mb-4">Add Link</h3>
            
            {editor.state.selection.empty && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link Text
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Enter link text"
                  required
                />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL
              </label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="https://"
                required
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLinkDialog(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Add Link
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}