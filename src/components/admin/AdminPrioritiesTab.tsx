import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Edit, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Priority {
  id: string;
  priority: string;
  color: string;
  order: number;
  initial?: boolean;
}

interface AdminPrioritiesTabProps {
  priorities: Priority[];
  loading: boolean;
  onAddPriority: (priority: { priority: string; color: string }) => Promise<void>;
  onUpdatePriority: (priorityId: string, updates: { priority: string; color: string }) => Promise<void>;
  onDeletePriority: (priorityId: string) => void;
  onConfirmDeletePriority: (priorityId: string) => Promise<void>;
  onCancelDeletePriority: () => void;
  onReorderPriorities: (reorderedPriorities: Priority[]) => Promise<void>;
  onSetDefaultPriority: (priorityId: string) => Promise<void>;
  showDeletePriorityConfirm: string | null;
  priorityUsageCounts: { [priorityId: string]: number };
  successMessage: string | null;
  error: string | null;
}

// Sortable Priority Row Component
const SortablePriorityRow = ({ 
  priority, 
  onEdit, 
  onDelete,
  onSetDefault,
  showDeletePriorityConfirm,
  priorityUsageCounts,
  onConfirmDeletePriority,
  onCancelDeletePriority
}: { 
  priority: Priority; 
  onEdit: (priority: Priority) => void;
  onDelete: (priorityId: string) => void;
  onSetDefault: (priorityId: string) => Promise<void>;
  showDeletePriorityConfirm: string | null;
  priorityUsageCounts: { [priorityId: string]: number };
  onConfirmDeletePriority: (priorityId: string) => Promise<void>;
  onCancelDeletePriority: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: priority.id });

  // Refs for delete button positioning
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [deleteButtonPosition, setDeleteButtonPosition] = useState<{top: number, left: number} | null>(null);

  // Handle click outside to close delete confirmation
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeletePriorityConfirm === priority.id) {
        const target = event.target as Element;
        if (!target.closest('.delete-confirmation') && !target.closest(`[data-priority-id="${priority.id}"]`)) {
          onCancelDeletePriority();
        }
      }
    };

    if (showDeletePriorityConfirm === priority.id) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeletePriorityConfirm, priority.id, onCancelDeletePriority]);

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const button = deleteButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setDeleteButtonPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.right + window.scrollX - 200, // Position to the left of the button
      });
    }
    onDelete(priority.id);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? 'z-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div 
            {...attributes}
            {...listeners}
            className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-gray-100 text-gray-400 text-xs"
            title="Drag to reorder"
          >
            ⋮⋮
          </div>
          <div 
            className="w-4 h-4 rounded-full border border-gray-300"
            style={{ backgroundColor: priority.color }}
          />
          <span className="text-sm font-medium text-gray-900">{priority.priority}</span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div 
          className="px-2 py-1 rounded-full text-xs font-medium inline-block"
          style={(() => {
            if (!priority.color) {
              return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
            }
            try {
              // Convert hex to RGB for rgba - safer approach
              const hex = priority.color.replace('#', '');
              if (hex.length !== 6) {
                return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
              }
              const r = parseInt(hex.substring(0, 2), 16);
              const g = parseInt(hex.substring(2, 4), 16);
              const b = parseInt(hex.substring(4, 6), 16);
              
              // Validate RGB values
              if (isNaN(r) || isNaN(g) || isNaN(b)) {
                return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
              }
              
              return {
                backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
                color: priority.color,
                border: `1px solid rgba(${r}, ${g}, ${b}, 0.2)`
              };
            } catch (error) {
              // Fallback to gray if any error occurs
              return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
            }
          })()}
        >
          {priority.priority}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <input
          type="radio"
          name="defaultPriority"
          checked={!!priority.initial}
          onChange={() => onSetDefault(priority.id)}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2 cursor-pointer"
          title={priority.initial ? 'This is the default priority' : 'Set as default priority'}
        />
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit(priority)}
            className="p-1.5 rounded transition-colors text-blue-600 hover:text-blue-900 hover:bg-blue-50"
            title="Edit priority"
          >
            <Edit size={16} />
          </button>
          <button
            ref={deleteButtonRef}
            onClick={handleDeleteClick}
            className="p-1.5 rounded transition-colors text-red-600 hover:text-red-900 hover:bg-red-50"
            title="Delete priority"
            data-priority-id={priority.id}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
      
      {/* Portal-based Delete Confirmation Dialog */}
      {showDeletePriorityConfirm === priority.id && deleteButtonPosition && createPortal(
        <div 
          className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[9999] min-w-[200px]"
          style={{
            top: `${deleteButtonPosition.top}px`,
            left: `${deleteButtonPosition.left}px`
          }}
        >
          <div className="text-sm text-gray-700 mb-2">
            {(() => {
              if (priorityUsageCounts[priority.id] > 0) {
                return (
                  <>
                    <div className="font-medium mb-1">Delete priority?</div>
                    <div className="text-xs text-gray-700">
                      <span className="text-red-600 font-medium">
                        {priorityUsageCounts[priority.id]} task{priorityUsageCounts[priority.id] !== 1 ? 's' : ''}
                      </span>{' '}
                      will lose this priority:{' '}
                      <span className="font-medium">{priority.priority}</span>
                    </div>
                  </>
                );
              } else {
                return (
                  <>
                    <div className="font-medium mb-1">Delete priority?</div>
                    <div className="text-xs text-gray-600">
                      No tasks will be affected for{' '}
                      <span className="font-medium">{priority.priority}</span>
                    </div>
                  </>
                );
              }
            })()}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onConfirmDeletePriority(priority.id)}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={onCancelDeletePriority}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              No
            </button>
          </div>
        </div>,
        document.body
      )}
    </tr>
  );
};

const AdminPrioritiesTab: React.FC<AdminPrioritiesTabProps> = ({
  priorities,
  loading,
  onAddPriority,
  onUpdatePriority,
  onDeletePriority,
  onConfirmDeletePriority,
  onCancelDeletePriority,
  onReorderPriorities,
  onSetDefaultPriority,
  showDeletePriorityConfirm,
  priorityUsageCounts,
  successMessage,
  error,
}) => {
  const [showAddPriorityForm, setShowAddPriorityForm] = useState(false);
  const [showEditPriorityForm, setShowEditPriorityForm] = useState(false);
  const [editingPriority, setEditingPriority] = useState<Priority | null>(null);
  const [newPriority, setNewPriority] = useState({ priority: '', color: '#4CD964' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DnD sensors for priority reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle priority reordering
  const handlePriorityDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = priorities.findIndex((priority) => priority.id === active.id);
      const newIndex = priorities.findIndex((priority) => priority.id === over.id);

      const reorderedPriorities = arrayMove(priorities, oldIndex, newIndex);
      await onReorderPriorities(reorderedPriorities);
    }
  };

  const handleAddPriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriority.priority.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddPriority(newPriority);
      setShowAddPriorityForm(false);
      setNewPriority({ priority: '', color: '#4CD964' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriority || !editingPriority.priority.trim()) return;

    setIsSubmitting(true);
    try {
      await onUpdatePriority(editingPriority.id, {
        priority: editingPriority.priority,
        color: editingPriority.color,
      });
      setShowEditPriorityForm(false);
      setEditingPriority(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (priority: Priority) => {
    setEditingPriority(priority);
    setShowEditPriorityForm(true);
  };

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Priorities Management</h2>
              <p className="text-gray-600">
                Create and manage priority levels for tasks. Each priority has a custom color for visual identification.
              </p>
            </div>
            <button
              onClick={() => setShowAddPriorityForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Add Priority
            </button>
          </div>
        </div>

        {/* Success and Error Messages */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Priorities Table with Drag and Drop */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handlePriorityDragEnd}
          >
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Preview</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Default</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
                </tr>
              </thead>
              <SortableContext
                items={priorities.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(priorities) && priorities.length > 0 ? (
                    priorities.map((priority) => (
                      <SortablePriorityRow 
                        key={priority.id} 
                        priority={priority}
                        onEdit={handleEditClick}
                        onDelete={onDeletePriority}
                        onSetDefault={onSetDefaultPriority}
                        showDeletePriorityConfirm={showDeletePriorityConfirm}
                        priorityUsageCounts={priorityUsageCounts}
                        onConfirmDeletePriority={onConfirmDeletePriority}
                        onCancelDeletePriority={onCancelDeletePriority}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        {loading ? 'Loading priorities...' : 'No priorities found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>
      </div>

      {/* Add Priority Modal */}
      {showAddPriorityForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Priority</h3>
              <form onSubmit={handleAddPriority}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority Name *</label>
                    <input
                      type="text"
                      required
                      value={newPriority.priority}
                      onChange={(e) => setNewPriority(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter priority name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <input
                      type="color"
                      value={newPriority.color}
                      onChange={(e) => setNewPriority(prev => ({ ...prev, color: e.target.value }))}
                      className="w-full h-12 border border-gray-300 rounded-md cursor-pointer"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Priority'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPriorityForm(false);
                      setNewPriority({ priority: '', color: '#4CD964' });
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

      {/* Edit Priority Modal */}
      {showEditPriorityForm && editingPriority && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Priority</h3>
              <form onSubmit={handleEditPriority}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority Name *</label>
                    <input
                      type="text"
                      required
                      value={editingPriority.priority}
                      onChange={(e) => setEditingPriority(prev => prev ? { ...prev, priority: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter priority name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <input
                      type="color"
                      value={editingPriority.color}
                      onChange={(e) => setEditingPriority(prev => prev ? { ...prev, color: e.target.value } : null)}
                      className="w-full h-12 border border-gray-300 rounded-md cursor-pointer"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Updating...' : 'Update Priority'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditPriorityForm(false);
                      setEditingPriority(null);
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

export default AdminPrioritiesTab;
