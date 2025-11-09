import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('admin');
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
  const [deleteButtonPosition, setDeleteButtonPosition] = useState<{top: number, left: number, maxHeight?: number} | null>(null);

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
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Estimate dialog height
      const estimatedDialogHeight = priorityUsageCounts[priority.id] > 0 ? 100 : 80;
      const dialogWidth = 200;
      
      // Check if there's enough space below
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // Position above if not enough space below, but enough space above
      let top: number;
      if (spaceBelow < estimatedDialogHeight && spaceAbove > estimatedDialogHeight) {
        // Position above the button
        top = rect.top - estimatedDialogHeight - 5;
      } else {
        // Position below the button (default)
        top = rect.bottom + 5;
      }
      
      // Ensure dialog doesn't go off the right edge
      let left = rect.right - dialogWidth;
      if (left + dialogWidth > viewportWidth) {
        left = viewportWidth - dialogWidth - 10; // 10px margin from edge
      }
      
      // Ensure dialog doesn't go off the left edge
      if (left < 10) {
        left = 10; // 10px margin from edge
      }
      
      // Calculate max height based on position
      const maxHeight = top < rect.top
        ? Math.min(top - 10, 300) // If above, use space from top
        : Math.min(viewportHeight - top - 20, 300); // If below, use space to bottom
      
      setDeleteButtonPosition({
        top,
        left,
        maxHeight
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
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit(priority)}
            className="p-1.5 rounded transition-colors text-blue-600 hover:text-blue-900 hover:bg-blue-50"
            title={t('priorities.editPriority')}
          >
            <Edit size={16} />
          </button>
          <button
            ref={deleteButtonRef}
            onClick={handleDeleteClick}
            disabled={!!priority.isDefault || !!priority.initial}
            className={`p-1.5 rounded transition-colors ${
              priority.isDefault || priority.initial
                ? 'text-gray-400 cursor-not-allowed opacity-50'
                : 'text-red-600 hover:text-red-900 hover:bg-red-50'
            }`}
            title={
              priority.isDefault || priority.initial
                ? t('priorities.cannotDeleteDefault')
                : t('priorities.deletePriority')
            }
            data-priority-id={priority.id}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div 
            {...attributes}
            {...listeners}
            className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 text-xs"
            title={t('priorities.dragToReorder')}
          >
            ⋮⋮
          </div>
          <div 
            className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: priority.color }}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{priority.priority}</span>
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
          className="w-4 h-4 text-blue-600 dark:text-blue-400 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
          title={priority.initial ? t('priorities.isDefaultPriority') : t('priorities.setAsDefault')}
        />
      </td>
      
      {/* Portal-based Delete Confirmation Dialog */}
      {showDeletePriorityConfirm === priority.id && deleteButtonPosition && createPortal(
        <div 
          className="delete-confirmation fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 z-[9999] min-w-[200px]"
          style={{
            top: `${deleteButtonPosition.top}px`,
            left: `${deleteButtonPosition.left}px`,
            maxHeight: deleteButtonPosition.maxHeight ? `${deleteButtonPosition.maxHeight}px` : '300px',
            overflowY: 'auto'
          }}
        >
          <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {(() => {
              if (priorityUsageCounts[priority.id] > 0) {
                return (
                  <>
                    <div className="font-medium mb-1">{t('priorities.deletePriority')}</div>
                    <div className="text-xs text-gray-700 dark:text-gray-400">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        {t('priorities.tasksUsingPriority', { count: priorityUsageCounts[priority.id] })}
                      </span>{' '}
                      {t('priorities.using')}{' '}
                      <span className="font-medium">{priority.priority}</span>
                      {' '}{t('priorities.willBeReassignedToDefault')}
                    </div>
                  </>
                );
              } else {
                return (
                  <>
                    <div className="font-medium mb-1">{t('priorities.deletePriority')}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {t('priorities.noTasksUsing')}{' '}
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
              {t('priorities.yes')}
            </button>
            <button
              onClick={onCancelDeletePriority}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              {t('priorities.no')}
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
}) => {
  const { t } = useTranslation('admin');
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('priorities.title')}</h2>
              <p className="text-gray-600 dark:text-gray-400">
                {t('priorities.description')}
              </p>
            </div>
            <button
              onClick={() => setShowAddPriorityForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('priorities.addPriority')}
            </button>
          </div>
        </div>


        {/* Priorities Table with Drag and Drop */}
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handlePriorityDragEnd}
          >
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">{t('priorities.tableHeaders.actions')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">{t('priorities.tableHeaders.priority')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">{t('priorities.tableHeaders.preview')}</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">{t('priorities.tableHeaders.default')}</th>
                </tr>
              </thead>
              <SortableContext
                items={priorities.filter(p => p && p.id).map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
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
                        {loading ? t('priorities.loadingPriorities') : t('priorities.noPrioritiesFound')}
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
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">{t('priorities.addNewPriority')}</h3>
              <form onSubmit={handleAddPriority}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('priorities.priorityName')}</label>
                    <input
                      type="text"
                      required
                      value={newPriority.priority}
                      onChange={(e) => setNewPriority(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('priorities.enterPriorityName')}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('priorities.color')}</label>
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
                    {isSubmitting ? t('priorities.creating') : t('priorities.createPriority')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPriorityForm(false);
                      setNewPriority({ priority: '', color: '#4CD964' });
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    {t('priorities.cancel')}
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
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">{t('priorities.editPriorityTitle')}</h3>
              <form onSubmit={handleEditPriority}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('priorities.priorityName')}</label>
                    <input
                      type="text"
                      required
                      value={editingPriority.priority}
                      onChange={(e) => setEditingPriority(prev => prev ? { ...prev, priority: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('priorities.enterPriorityName')}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('priorities.color')}</label>
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
                    {isSubmitting ? t('priorities.updating') : t('priorities.updatePriority')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditPriorityForm(false);
                      setEditingPriority(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    {t('priorities.cancel')}
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
