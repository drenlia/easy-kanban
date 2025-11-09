import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus, Edit2, Trash2, Save, X, CheckCircle } from 'lucide-react';
import { toast } from '../../utils/toast';

interface PlanningPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

const AdminSprintSettingsTab: React.FC = () => {
  const { t } = useTranslation('admin');
  const [sprints, setSprints] = useState<PlanningPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    is_active: false,
    description: ''
  });

  useEffect(() => {
    fetchSprints();
  }, []);

  const fetchSprints = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/sprints', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sprints');
      }

      const data = await response.json();
      setSprints(data.sprints || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sprintSettings.failedToLoadSprints'), '');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
      is_active: false,
      description: ''
    });
  };

  const handleEdit = (sprint: PlanningPeriod) => {
    setEditingId(sprint.id);
    setFormData({
      name: sprint.name,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      is_active: sprint.is_active,
      description: sprint.description || ''
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
      is_active: false,
      description: ''
    });
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!formData.name.trim()) {
        toast.error(t('sprintSettings.sprintNameRequired'), '');
        return;
      }
      if (!formData.start_date) {
        toast.error(t('sprintSettings.startDateRequired'), '');
        return;
      }
      if (!formData.end_date) {
        toast.error(t('sprintSettings.endDateRequired'), '');
        return;
      }
      if (new Date(formData.end_date) < new Date(formData.start_date)) {
        toast.error(t('sprintSettings.endDateAfterStartDate'), '');
        return;
      }

      const url = editingId 
        ? `/api/admin/sprints/${editingId}`
        : '/api/admin/sprints';
      
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to save sprint');
      }

      toast.success(editingId ? t('sprintSettings.sprintUpdatedSuccessfully') : t('sprintSettings.sprintCreatedSuccessfully'), '');
      
      handleCancel();
      fetchSprints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sprintSettings.failedToSaveSprint'), '');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('sprintSettings.deleteSprintConfirm', { name }))) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/sprints/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete sprint');
      }

      toast.success(t('sprintSettings.sprintDeletedSuccessfully'), '');
      fetchSprints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sprintSettings.failedToDeleteSprint'), '');
    }
  };

  const handleToggleActive = async (sprint: PlanningPeriod) => {
    try {
      const response = await fetch(`/api/admin/sprints/${sprint.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...sprint,
          is_active: !sprint.is_active
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update sprint status');
      }

      fetchSprints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sprintSettings.failedToUpdateSprint'), '');
    }
  };

  const formatDate = (dateString: string) => {
    // Parse as local date to avoid timezone offset issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('sprintSettings.title')}</h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t('sprintSettings.description')}
        </p>
      </div>

      <div className="flex items-center justify-end mb-4">
        {!isCreating && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('sprintSettings.createSprint')}
          </button>
        )}
      </div>


      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? t('sprintSettings.editSprint') : t('sprintSettings.createNewSprint')}
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sprintSettings.sprintName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sprint 1, Q1 2025"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sprintSettings.startDate')}
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sprintSettings.endDate')}
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sprintSettings.descriptionLabel')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('sprintSettings.optionalDescription')}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('sprintSettings.markAsActiveSprint')}
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {editingId ? t('sprintSettings.update') : t('sprintSettings.create')}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              {t('sprintSettings.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Sprints List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {sprints.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">{t('sprintSettings.noSprintsCreated')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              {t('sprintSettings.noSprintsCreatedDescription')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('sprintSettings.sprintName')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('sprintSettings.startDate')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('sprintSettings.endDate')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('sprintSettings.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('sprintSettings.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sprints.map((sprint) => (
                  <tr key={sprint.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {sprint.name}
                        </div>
                        {sprint.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {sprint.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(sprint.start_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(sprint.end_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(sprint)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          sprint.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {sprint.is_active ? t('sprintSettings.active') : t('sprintSettings.inactive')}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(sprint)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          title={t('sprintSettings.edit')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(sprint.id, sprint.name)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title={t('sprintSettings.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              {t('sprintSettings.aboutSprints')}
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('sprintSettings.aboutSprintsDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSprintSettingsTab;

