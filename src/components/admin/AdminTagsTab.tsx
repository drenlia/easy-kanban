import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Edit, Trash2 } from 'lucide-react';

interface Tag {
  id: number;
  tag: string;
  description?: string;
  color: string;
}

interface AdminTagsTabProps {
  tags: Tag[];
  loading: boolean;
  onAddTag: (tag: { tag: string; description: string; color: string }) => Promise<void>;
  onUpdateTag: (tagId: number, updates: { tag: string; description: string; color: string }) => Promise<void>;
  onDeleteTag: (tagId: number) => void;
  onConfirmDeleteTag: (tagId: number) => Promise<void>;
  onCancelDeleteTag: () => void;
  showDeleteTagConfirm: number | null;
  tagUsageCounts: { [tagId: number]: number };
}

// Helper function to determine text color based on background color
const getTextColor = (backgroundColor: string): string => {
  if (!backgroundColor) return '#ffffff';
  
  // Handle white and very light colors
  const normalizedColor = backgroundColor.toLowerCase();
  if (normalizedColor === '#ffffff' || normalizedColor === '#fff' || normalizedColor === 'white') {
    return '#374151'; // gray-700 for good contrast on white
  }
  
  // For hex colors, calculate luminance to determine if we need light or dark text
  if (backgroundColor.startsWith('#')) {
    const hex = backgroundColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      // Calculate relative luminance
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      
      // Use dark text for light backgrounds, white text for dark backgrounds
      return luminance > 0.6 ? '#374151' : '#ffffff';
    }
  }
  
  // Default to white text
  return '#ffffff';
};

const AdminTagsTab: React.FC<AdminTagsTabProps> = ({
  tags,
  loading,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
  onConfirmDeleteTag,
  onCancelDeleteTag,
  showDeleteTagConfirm,
  tagUsageCounts,
}) => {
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [showEditTagForm, setShowEditTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTag, setNewTag] = useState({ tag: '', description: '', color: '#4ECDC4' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refs for delete button positioning
  const deleteButtonRefs = useRef<{[key: string]: HTMLButtonElement | null}>({});
  const [deleteButtonPosition, setDeleteButtonPosition] = useState<{top: number, left: number, tagId: number} | null>(null);

  // Handle click outside to close delete confirmation
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeleteTagConfirm && deleteButtonPosition) {
        const target = event.target as Element;
        if (!target.closest('.delete-confirmation') && !target.closest(`[data-tag-id="${showDeleteTagConfirm}"]`)) {
          onCancelDeleteTag();
        }
      }
    };

    if (showDeleteTagConfirm) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeleteTagConfirm, deleteButtonPosition, onCancelDeleteTag]);

  const handleDeleteClick = (tagId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const button = deleteButtonRefs.current[tagId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setDeleteButtonPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.right + window.scrollX - 200, // Position to the left of the button
        tagId: tagId
      });
    }
    onDeleteTag(tagId);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.tag.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddTag(newTag);
      setShowAddTagForm(false);
      setNewTag({ tag: '', description: '', color: '#4ECDC4' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag || !editingTag.tag.trim()) return;

    setIsSubmitting(true);
    try {
      await onUpdateTag(editingTag.id, {
        tag: editingTag.tag,
        description: editingTag.description || '',
        color: editingTag.color,
      });
      setShowEditTagForm(false);
      setEditingTag(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Tags Management</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Create and manage tags for organizing tasks. Tags can have custom colors and descriptions.
              </p>
            </div>
            <button
              onClick={() => setShowAddTagForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Add Tag
            </button>
          </div>
        </div>

        {/* Tags Table */}
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Actions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Tag</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Preview</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {Array.isArray(tags) && tags.length > 0 ? (
                tags.map((tag) => (
                  <tr key={tag.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setEditingTag(tag);
                            setShowEditTagForm(true);
                          }}
                          className="p-1.5 rounded transition-colors text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                          title="Edit tag"
                        >
                          <Edit size={16} />
                        </button>
                        <div className="relative">
                          <button
                            ref={(el) => { deleteButtonRefs.current[tag.id] = el; }}
                            onClick={(e) => handleDeleteClick(tag.id, e)}
                            className="p-1.5 rounded transition-colors text-red-600 hover:text-red-900 hover:bg-red-50"
                            title="Delete tag"
                            data-tag-id={tag.id}
                          >
                            <Trash2 size={16} />
                          </button>
                          
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ backgroundColor: tag.color || '#4ECDC4' }}
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tag.tag}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{tag.description || '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="px-2 py-1 rounded-full text-xs font-bold inline-block border"
                        style={(() => {
                          const bgColor = tag.color || '#4ECDC4';
                          const textColor = getTextColor(bgColor);
                          return {
                            backgroundColor: bgColor,
                            color: textColor,
                            borderColor: textColor === '#374151' ? '#d1d5db' : 'rgba(255, 255, 255, 0.3)'
                          };
                        })()}
                      >
                        {tag.tag}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    {loading ? 'Loading tags...' : 'No tags found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Tag Modal */}
      {showAddTagForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">Add New Tag</h3>
              <form onSubmit={handleAddTag}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tag Name</label>
                  <input
                    type="text"
                    value={newTag.tag}
                    onChange={(e) => setNewTag(prev => ({ ...prev, tag: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter tag name"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                  <textarea
                    value={newTag.description}
                    onChange={(e) => setNewTag(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter tag description"
                    rows={3}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                  <input
                    type="color"
                    value={newTag.color}
                    onChange={(e) => setNewTag(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full h-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Tag'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTagForm(false);
                      setNewTag({ tag: '', description: '', color: '#4ECDC4' });
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tag Modal */}
      {showEditTagForm && editingTag && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">Edit Tag</h3>
              <form onSubmit={handleEditTag}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tag Name</label>
                  <input
                    type="text"
                    value={editingTag.tag}
                    onChange={(e) => setEditingTag(prev => prev ? { ...prev, tag: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter tag name"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                  <textarea
                    value={editingTag.description || ''}
                    onChange={(e) => setEditingTag(prev => prev ? { ...prev, description: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter tag description"
                    rows={3}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                  <input
                    type="color"
                    value={editingTag.color}
                    onChange={(e) => setEditingTag(prev => prev ? { ...prev, color: e.target.value } : null)}
                    className="w-full h-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Update Tag'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditTagForm(false);
                      setEditingTag(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Portal-based Delete Confirmation Dialog */}
      {showDeleteTagConfirm && deleteButtonPosition && deleteButtonPosition.tagId === showDeleteTagConfirm && createPortal(
        <div 
          className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[9999] min-w-[200px]"
          style={{
            top: `${deleteButtonPosition.top}px`,
            left: `${deleteButtonPosition.left}px`
          }}
        >
          <div className="text-sm text-gray-700 mb-2">
            {(() => {
              const tag = tags.find(t => t.id === showDeleteTagConfirm);
              if (!tag) return null;
              
              if (tagUsageCounts[tag.id] > 0) {
                return (
                  <>
                    <div className="font-medium mb-1">Delete tag?</div>
                    <div className="text-xs text-gray-700">
                      <span className="text-red-600 font-medium">
                        {tagUsageCounts[tag.id]} task{tagUsageCounts[tag.id] !== 1 ? 's' : ''}
                      </span>{' '}
                      will lose this tag:{' '}
                      <span className="font-medium">{tag.tag}</span>
                    </div>
                  </>
                );
              } else {
                return (
                  <>
                    <div className="font-medium mb-1">Delete tag?</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      No tasks will be affected for{' '}
                      <span className="font-medium">{tag.tag}</span>
                    </div>
                  </>
                );
              }
            })()}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onConfirmDeleteTag(showDeleteTagConfirm)}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={onCancelDeleteTag}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              No
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default AdminTagsTab;
