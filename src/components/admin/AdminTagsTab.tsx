import React, { useState } from 'react';
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
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Tags Management</h2>
              <p className="text-gray-600">
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
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Tag</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Color</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.isArray(tags) && tags.length > 0 ? (
                tags.map((tag) => (
                  <tr key={tag.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ backgroundColor: tag.color || '#4ECDC4' }}
                        />
                        <span className="text-sm font-medium text-gray-900">{tag.tag}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{tag.description || '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div 
                        className="w-6 h-6 rounded-full border-2 border-gray-200"
                        style={{ backgroundColor: tag.color || '#4ECDC4' }}
                      />
                    </td>
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
                            onClick={() => onDeleteTag(tag.id)}
                            className="p-1.5 rounded transition-colors text-red-600 hover:text-red-900 hover:bg-red-50"
                            title="Delete tag"
                          >
                            <Trash2 size={16} />
                          </button>
                          
                          {/* Delete Tag Confirmation Menu */}
                          {showDeleteTagConfirm === tag.id && (
                            <div className="delete-confirmation absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[200px]">
                              <div className="text-sm text-gray-700 mb-2">
                                {tagUsageCounts[tag.id] > 0 ? (
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
                                ) : (
                                  <>
                                    <div className="font-medium mb-1">Delete tag?</div>
                                    <div className="text-xs text-gray-600">
                                      No tasks will be affected for{' '}
                                      <span className="font-medium">{tag.tag}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => onConfirmDeleteTag(tag.id)}
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
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
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
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Tag</h3>
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
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Tag</h3>
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
    </>
  );
};

export default AdminTagsTab;
