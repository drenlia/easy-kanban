import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Trash2, CheckSquare, Square, RefreshCw, ChevronDown, Search } from 'lucide-react';
import { getNotificationQueue, sendNotificationsImmediately, deleteNotifications } from '../../api';
import { toast } from '../../utils/toast';
import { formatToYYYYMMDDHHmmss as formatDateTimeLocal } from '../../utils/dateUtils';

interface NotificationQueueItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  taskTitle: string;
  taskTicket: string;
  columnTitle: string;
  boardTitle: string;
  notificationType: string;
  action: string;
  details: string;
  oldValue: string | null;
  newValue: string | null;
  status: string;
  scheduledSendTime: string;
  firstChangeTime: string;
  lastChangeTime: string;
  changeCount: number;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  actor: {
    name: string;
    email: string;
  } | null;
}

const AdminNotificationQueueTab: React.FC = () => {
  const { t } = useTranslation('admin');
  const [notifications, setNotifications] = useState<NotificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotificationQueue();
      setNotifications(data);
    } catch (error: any) {
      console.error('Failed to fetch notification queue:', error);
      toast.error(t('notificationQueue.fetchError') || 'Failed to fetch notification queue', '');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Filter notifications based on search query
  const filteredNotifications = notifications.filter((notification: NotificationQueueItem) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      notification.recipientEmail?.toLowerCase().includes(query) ||
      notification.recipientName?.toLowerCase().includes(query) ||
      notification.taskTitle?.toLowerCase().includes(query) ||
      notification.taskTicket?.toLowerCase().includes(query) ||
      notification.columnTitle?.toLowerCase().includes(query) ||
      notification.boardTitle?.toLowerCase().includes(query) ||
      notification.notificationType?.toLowerCase().includes(query) ||
      notification.action?.toLowerCase().includes(query) ||
      notification.status?.toLowerCase().includes(query) ||
      notification.actor?.name?.toLowerCase().includes(query) ||
      notification.actor?.email?.toLowerCase().includes(query)
    );
  });

  const handleSelectAll = () => {
    // Only select visible notifications (up to displayLimit)
    const visibleNotifications = filteredNotifications.slice(0, displayLimit);
    const visibleIds = new Set(visibleNotifications.map(n => n.id));
    
    // Check if all visible items are already selected
    const allVisibleSelected = visibleIds.size > 0 && Array.from(visibleIds).every(id => selectedIds.has(id));
    
    if (allVisibleSelected) {
      // Deselect all visible items
      const newSelected = new Set(selectedIds);
      visibleIds.forEach(id => newSelected.delete(id));
      setSelectedIds(newSelected);
    } else {
      // Select all visible items
      const newSelected = new Set(selectedIds);
      visibleIds.forEach(id => newSelected.add(id));
      setSelectedIds(newSelected);
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSendImmediately = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('notificationQueue.noSelection') || 'Please select at least one notification', '');
      return;
    }

    // Filter out sent notifications - only allow sending pending/failed notifications
    const selectedNotifications = filteredNotifications.filter(n => selectedIds.has(n.id));
    const sendableNotifications = selectedNotifications.filter(n => n.status !== 'sent');
    
    if (sendableNotifications.length === 0) {
      toast.error(t('notificationQueue.noUnsentNotifications') || 'No unsent notifications selected. Only pending or failed notifications can be sent.', '');
      return;
    }
    
    if (sendableNotifications.length < selectedNotifications.length) {
      toast.warning(
        t('notificationQueue.someAlreadySent', { 
          total: selectedNotifications.length,
          sendable: sendableNotifications.length 
        }) || `${sendableNotifications.length} of ${selectedNotifications.length} selected notifications can be sent. Already sent notifications will be skipped.`,
        ''
      );
    }

    try {
      setIsSending(true);
      const result = await sendNotificationsImmediately(sendableNotifications.map(n => n.id));
      
      if (result.success) {
        toast.success(
          t('notificationQueue.sendSuccess', { count: result.sentCount }) || `Successfully sent ${result.sentCount} notification(s)`,
          ''
        );
        
        if (result.errors && result.errors.length > 0) {
          console.warn('Some notifications failed to send:', result.errors);
        }
        
        setSelectedIds(new Set());
        await fetchNotifications();
      }
    } catch (error: any) {
      console.error('Failed to send notifications:', error);
      toast.error(t('notificationQueue.sendError') || 'Failed to send notifications', '');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('notificationQueue.noSelection') || 'Please select at least one notification', '');
      return;
    }

    if (!confirm(t('notificationQueue.deleteConfirm', { count: selectedIds.size }) || `Are you sure you want to delete ${selectedIds.size} notification(s)?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      const result = await deleteNotifications(Array.from(selectedIds));
      
      if (result.success) {
        toast.success(
          t('notificationQueue.deleteSuccess', { count: result.deletedCount }) || `Successfully deleted ${result.deletedCount} notification(s)`,
          ''
        );
        
        setSelectedIds(new Set());
        await fetchNotifications();
      }
    } catch (error: any) {
      console.error('Failed to delete notifications:', error);
      toast.error(t('notificationQueue.deleteError') || 'Failed to delete notifications', '');
    } finally {
      setIsDeleting(false);
      setShowDeleteMenu(false);
    }
  };

  const handleDeleteAllSent = async () => {
    const sentNotifications = notifications.filter(n => n.status === 'sent');
    
    if (sentNotifications.length === 0) {
      toast.error(t('notificationQueue.noSentNotifications') || 'No sent notifications found in queue', '');
      setShowDeleteMenu(false);
      return;
    }

    if (!confirm(t('notificationQueue.deleteAllSentConfirm', { count: sentNotifications.length }) || `Are you sure you want to delete all ${sentNotifications.length} sent notification(s)?`)) {
      setShowDeleteMenu(false);
      return;
    }

    try {
      setIsDeleting(true);
      const result = await deleteNotifications(sentNotifications.map(n => n.id));
      
      if (result.success) {
        toast.success(
          t('notificationQueue.deleteAllSentSuccess', { count: result.deletedCount }) || `Successfully deleted ${result.deletedCount} sent notification(s)`,
          ''
        );
        
        setSelectedIds(new Set());
        await fetchNotifications();
      }
    } catch (error: any) {
      console.error('Failed to delete all sent notifications:', error);
      toast.error(t('notificationQueue.deleteError') || 'Failed to delete notifications', '');
    } finally {
      setIsDeleting(false);
      setShowDeleteMenu(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
        {t(`notificationQueue.statusLabels.${status}`, status)}
      </span>
    );
  };

  const getNotificationTypeLabel = (type: string) => {
    const translationKey = `notificationQueue.type.${type}`;
    const translated = t(translationKey);
    // If translation returns the key itself or an object, fallback to the type
    if (translated === translationKey || typeof translated !== 'string') {
      return type;
    }
    return translated;
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('notificationQueue.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('notificationQueue.title') || 'Notification Queue'}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('notificationQueue.description') || 'Manage pending email notifications'}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('notificationQueue.searchPlaceholder') || 'Search notifications...'}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {filteredNotifications.length > 0 ? (
              <>
                {t('notificationQueue.showing', { 
                  count: Math.min(displayLimit, filteredNotifications.length),
                  total: filteredNotifications.length 
                }) || `Showing ${Math.min(displayLimit, filteredNotifications.length)} of ${filteredNotifications.length} notification(s)`}
              </>
            ) : (
              <span>{t('notificationQueue.noResults') || 'No notifications found'}</span>
            )}
          </div>
          <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(() => {
              const visibleNotifications = filteredNotifications.slice(0, displayLimit);
              const visibleIds = new Set(visibleNotifications.map(n => n.id));
              const allVisibleSelected = visibleIds.size > 0 && Array.from(visibleIds).every(id => selectedIds.has(id));
              
              return allVisibleSelected ? (
                <>
                  <Square className="inline-block w-4 h-4 mr-2" />
                  {t('notificationQueue.selectNone') || 'Select None'}
                </>
              ) : (
                <>
                  <CheckSquare className="inline-block w-4 h-4 mr-2" />
                  {t('notificationQueue.selectAll') || 'Select All'}
                </>
              );
            })()}
          </button>
          <button
            onClick={handleSendImmediately}
            disabled={(() => {
              if (selectedIds.size === 0 || isSending || isDeleting) return true;
              // Disable if only sent notifications are selected
              const selectedNotifications = filteredNotifications.filter(n => selectedIds.has(n.id));
              const hasUnsentNotifications = selectedNotifications.some(n => n.status !== 'sent');
              return !hasUnsentNotifications;
            })()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSending ? (t('notificationQueue.sending') || 'Sending...') : (t('notificationQueue.sendNow') || 'Send Now')}
          </button>
          <div className="relative">
            <button
              onClick={() => {
                if (selectedIds.size > 0) {
                  handleDelete();
                } else {
                  setShowDeleteMenu(!showDeleteMenu);
                }
              }}
              disabled={isSending || isDeleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? (t('notificationQueue.deleting') || 'Deleting...') : (t('notificationQueue.delete') || 'Delete')}
              <ChevronDown className="w-4 h-4 ml-2" />
            </button>
            
            {showDeleteMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowDeleteMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-20">
                  <div className="py-1">
                    <button
                      onClick={handleDelete}
                      disabled={selectedIds.size === 0 || isDeleting}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('notificationQueue.deleteSelected') || 'Delete Selected'}
                      {selectedIds.size > 0 && ` (${selectedIds.size})`}
                    </button>
                    <button
                      onClick={handleDeleteAllSent}
                      disabled={isDeleting || notifications.filter((n: NotificationQueueItem) => n.status === 'sent').length === 0}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('notificationQueue.deleteAllSent') || 'Delete All Sent'}
                      {notifications.filter((n: NotificationQueueItem) => n.status === 'sent').length > 0 && ` (${notifications.filter((n: NotificationQueueItem) => n.status === 'sent').length})`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={fetchNotifications}
            disabled={loading || isSending || isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('notificationQueue.refresh') || 'Refresh'}
          </button>
          </div>
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery.trim() 
              ? (t('notificationQueue.noResults') || 'No notifications found matching your search')
              : (t('notificationQueue.empty') || 'No notifications in queue')
            }
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={(() => {
                      const visibleNotifications = filteredNotifications.slice(0, displayLimit);
                      const visibleIds = new Set(visibleNotifications.map(n => n.id));
                      return visibleIds.size > 0 && Array.from(visibleIds).every(id => selectedIds.has(id));
                    })()}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.recipient', 'Recipient')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.task', 'Task')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.status', 'Status')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.scheduled', 'Scheduled')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.changes', 'Changes')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('notificationQueue.updated', 'Updated')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredNotifications.slice(0, displayLimit).map((notification) => (
                <tr
                  key={notification.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    selectedIds.has(notification.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(notification.id)}
                      onChange={() => handleSelectOne(notification.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {notification.recipientName || notification.recipientEmail}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {notification.recipientEmail}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {notification.taskTicket ? `[${notification.taskTicket}]` : ''} {notification.taskTitle || t('notificationQueue.unknownTask', 'Unknown Task')}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {notification.boardTitle && `${notification.boardTitle} → `}
                      {notification.columnTitle || t('notificationQueue.unknownColumn', 'Unknown Column')}
                    </div>
                    {notification.actor && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t('notificationQueue.by', 'by')} {notification.actor.name}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {getNotificationTypeLabel(notification.notificationType)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {notification.action}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(notification.status)}
                    {notification.errorMessage && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs truncate" title={notification.errorMessage}>
                        {notification.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDateTimeLocal(notification.scheduledSendTime)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {notification.changeCount > 1 ? (
                      <span className="font-medium">{notification.changeCount} {t('notificationQueue.changesPlural', 'changes')}</span>
                    ) : (
                      <span>1 {t('notificationQueue.change', 'change')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDateTimeLocal(notification.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More Button */}
      {filteredNotifications.length > displayLimit && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setDisplayLimit(prev => prev + 50)}
            className="px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t('notificationQueue.loadMore', { 
              count: Math.min(50, filteredNotifications.length - displayLimit),
              remaining: filteredNotifications.length - displayLimit
            }) || `Load More (${Math.min(50, filteredNotifications.length - displayLimit)} of ${filteredNotifications.length - displayLimit} remaining)`}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminNotificationQueueTab;

