import { useState } from 'react';
import { X, Edit2, Trash2, Save, XCircle } from 'lucide-react';
import { SavedFilterView, updateSavedFilterView, deleteSavedFilterView } from '../api';

interface ManageFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedFilterViews: SavedFilterView[];
  onViewsUpdated: (views: SavedFilterView[]) => void;
  currentFilterView?: SavedFilterView | null;
  onCurrentFilterViewChange?: (view: SavedFilterView | null) => void;
}

export default function ManageFiltersModal({
  isOpen,
  onClose,
  savedFilterViews,
  onViewsUpdated,
  currentFilterView,
  onCurrentFilterViewChange
}: ManageFiltersModalProps) {
  const [editingView, setEditingView] = useState<SavedFilterView | null>(null);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = (view: SavedFilterView) => {
    setEditingView(view);
    setEditName(view.filterName);
  };

  const handleCancelEdit = () => {
    setEditingView(null);
    setEditName('');
  };

  const handleSaveEdit = async () => {
    if (!editingView || !editName.trim()) return;

    // Check if name already exists (excluding current item)
    const nameExists = savedFilterViews.some(
      view => view.id !== editingView.id && view.filterName === editName.trim()
    );

    if (nameExists) {
      alert('A filter with this name already exists');
      return;
    }

    setIsLoading(true);
    try {
      const updatedView = await updateSavedFilterView(editingView.id, {
        filterName: editName.trim()
      });

      const updatedViews = savedFilterViews.map(view => 
        view.id === editingView.id ? updatedView : view
      );
      
      onViewsUpdated(updatedViews);

      // Update current filter view if it's the one being edited
      if (currentFilterView?.id === editingView.id) {
        onCurrentFilterViewChange?.(updatedView);
      }

      setEditingView(null);
      setEditName('');
    } catch (error) {
      console.error('Failed to update filter view:', error);
      alert('Failed to update filter. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (viewId: number) => {
    setDeleteConfirmId(viewId);
  };

  const handleConfirmDelete = async (viewId: number) => {
    setIsLoading(true);
    try {
      await deleteSavedFilterView(viewId);
      
      const updatedViews = savedFilterViews.filter(view => view.id !== viewId);
      onViewsUpdated(updatedViews);

      // Clear current filter view if it's the one being deleted
      if (currentFilterView?.id === viewId) {
        onCurrentFilterViewChange?.(null);
      }

      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete filter view:', error);
      alert('Failed to delete filter. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Manage Saved Filters</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isLoading}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {savedFilterViews.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No saved filters yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Create filters from the search interface to manage them here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedFilterViews.map((view) => (
                <div
                  key={view.id}
                  className={`border rounded-lg p-4 ${
                    currentFilterView?.id === view.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  {editingView?.id === view.id ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Filter name..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editName.trim()) {
                            handleSaveEdit();
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        autoFocus
                        disabled={isLoading}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                          disabled={isLoading}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editName.trim() || isLoading}
                          className="px-3 py-1.5 text-sm text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {isLoading ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : deleteConfirmId === view.id ? (
                    /* Delete Confirmation Mode */
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{view.filterName}</h4>
                        <p className="text-sm text-red-600 mt-1">
                          Are you sure you want to delete this filter? This action cannot be undone.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelDelete}
                          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                          disabled={isLoading}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleConfirmDelete(view.id)}
                          className="px-3 py-1.5 text-sm text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                          disabled={isLoading}
                        >
                          {isLoading ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{view.filterName}</h4>
                        <div className="text-xs text-gray-500 mt-1 space-y-1">
                          <p>Created: {new Date(view.created_at).toLocaleDateString()}</p>
                          {currentFilterView?.id === view.id && (
                            <p className="text-blue-600 font-medium">Currently applied</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => handleStartEdit(view)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Rename filter"
                          disabled={isLoading}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(view.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete filter"
                          disabled={isLoading}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              disabled={isLoading}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
