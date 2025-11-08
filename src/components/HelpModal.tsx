import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, Columns, ClipboardList, MessageSquare, ArrowRight, LayoutGrid, List, Calendar, Search, Eye, Settings, Play } from 'lucide-react';
import { useTour } from '../contexts/TourContext';
import { versionDetection } from '../utils/versionDetection';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'overview' | 'kanban' | 'list' | 'gantt';

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useTranslation('common');
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const { startTour } = useTour();

  const handleStartTour = () => {
    console.log('Start Tutorial button clicked!');
    onClose(); // Close the modal first
    setTimeout(() => {
      startTour(); // Use context function
    }, 100);
  };

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview' as TabType, label: t('help.tabs.overview'), icon: LayoutGrid },
    { id: 'kanban' as TabType, label: t('help.tabs.kanbanView'), icon: Columns },
    { id: 'list' as TabType, label: t('help.tabs.listView'), icon: List },
    { id: 'gantt' as TabType, label: t('help.tabs.ganttView'), icon: Calendar },
  ];

  const renderOverviewTab = () => (
    <div className="space-y-8">
      {/* General Explanation */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <LayoutGrid className="text-blue-500" />
          {t('help.overview.whatIsEasyKanban')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.overview.whatIsEasyKanbanDesc1')}</p>
          <p>{t('help.overview.whatIsEasyKanbanDesc2')}</p>
        </div>
      </section>

      {/* Navigation */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-green-500" />
          {t('help.overview.navigation')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.overview.boardSelector')}</p>
          <p>{t('help.overview.viewModes')}</p>
          <p>{t('help.overview.searchFilter')}</p>
          <p>{t('help.overview.userProfile')}</p>
          <p>{t('help.overview.activityFeed')}</p>
          <p>{t('help.overview.adminPanel')}</p>
            </div>
          </section>

          {/* Team Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Users className="text-purple-500" />
          {t('help.overview.teamManagement')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.overview.teamMembers')}</p>
          <p>{t('help.overview.memberSelection')}</p>
          <p>{t('help.overview.roleBasedFiltering')}</p>
          <ul className="ml-4 space-y-1 text-gray-600 dark:text-gray-300">
            <li>{t('help.overview.assignees')}</li>
            <li>{t('help.overview.watchers')}</li>
            <li>{t('help.overview.collaborators')}</li>
            <li>{t('help.overview.requesters')}</li>
            <li>{t('help.overview.system')}</li>
          </ul>
          <p>{t('help.overview.filterWarning')}</p>
        </div>
      </section>

      {/* Tools */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-orange-500" />
          {t('help.overview.tools')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.overview.views')}</p>
          <p>{t('help.overview.searchFilterTools')}</p>
          <p>{t('help.overview.taskViewModes')}</p>
          <p>{t('help.overview.activityFeedTools')}</p>
          <p>{t('help.overview.userProfileTools')}</p>
          <p>{t('help.overview.realtimeCollaboration')}</p>
          <p>{t('help.overview.keyboardShortcuts')}</p>
        </div>
      </section>
    </div>
  );

  const renderKanbanTab = () => (
    <div className="space-y-8">
      {/* Kanban Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Columns className="text-blue-500" />
          {t('help.kanban.overview')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.kanban.overviewDesc1')}</p>
          <p>{t('help.kanban.overviewDesc2')}</p>
          <p>{t('help.kanban.overviewDesc3')}</p>
            </div>
          </section>

      {/* Column Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Columns className="text-purple-500" />
          {t('help.kanban.columnManagement')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.kanban.createColumns')}</p>
          <p>{t('help.kanban.renameColumns')}</p>
          <p>{t('help.kanban.reorderColumns')}</p>
          <p>{t('help.kanban.deleteColumns')}</p>
          <p>{t('help.kanban.finishedColumns')}</p>
            </div>
          </section>

          {/* Task Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ClipboardList className="text-orange-500" />
              {t('help.kanban.taskManagement')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.kanban.createTasks')}</p>
          <p>{t('help.kanban.editTasks')}</p>
          <p>{t('help.kanban.moveTasks')}</p>
          <p>{t('help.kanban.reorderTasks')}</p>
          <p>{t('help.kanban.copyTasks')}</p>
          <p>{t('help.kanban.deleteTasks')}</p>
          <p>{t('help.kanban.taskDetails')}</p>
        </div>
      </section>

      {/* Drag & Drop */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-teal-500" />
          {t('help.kanban.dragDrop')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.kanban.crossColumnMovement')}</p>
          <p>{t('help.kanban.withinColumnReordering')}</p>
          <p>{t('help.kanban.visualFeedback')}</p>
          <p>{t('help.kanban.autoSave')}</p>
            </div>
          </section>

          {/* Task Details */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <MessageSquare className="text-indigo-500" />
              {t('help.kanban.taskDetailsComm')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.kanban.taskInformation')}</p>
          <p>{t('help.kanban.comments')}</p>
          <p>{t('help.kanban.attachments')}</p>
          <p>{t('help.kanban.priorityLevels')}</p>
          <p>{t('help.kanban.tags')}</p>
          <p>{t('help.kanban.watchers')}</p>
          <p>{t('help.kanban.collaborators')}</p>
          <p>{t('help.kanban.taskRelationships')}</p>
        </div>
      </section>
    </div>
  );

  const renderListTab = () => (
    <div className="space-y-8">
      {/* List View Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <List className="text-blue-500" />
          {t('help.list.overview')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.list.overviewDesc1')}</p>
          <p>{t('help.list.overviewDesc2')}</p>
          <p>{t('help.list.overviewDesc3')}</p>
        </div>
      </section>

      {/* Column Management */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-purple-500" />
          {t('help.list.columnConfiguration')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.list.showHideColumns')}</p>
          <p>{t('help.list.resizeColumns')}</p>
          <p>{t('help.list.defaultColumns')}</p>
          <p>{t('help.list.columnPersistence')}</p>
          <p>{t('help.list.horizontalScrolling')}</p>
        </div>
      </section>

      {/* Sorting & Filtering */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Search className="text-orange-500" />
          {t('help.list.sortingFiltering')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.list.sortByColumn')}</p>
          <p>{t('help.list.multiLevelSorting')}</p>
          <p>{t('help.list.searchIntegration')}</p>
          <p>{t('help.list.savedFilters')}</p>
          <p>{t('help.list.advancedFiltering')}</p>
        </div>
      </section>

      {/* Task Actions */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ClipboardList className="text-green-500" />
          {t('help.list.taskActions')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.list.quickActions')}</p>
          <p>{t('help.list.statusChanges')}</p>
          <p>{t('help.list.directEditing')}</p>
          <p>{t('help.list.taskDetails')}</p>
        </div>
      </section>

      {/* Data Display */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Eye className="text-indigo-500" />
          {t('help.list.dataDisplay')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.list.richText')}</p>
          <p>{t('help.list.dateFormatting')}</p>
          <p>{t('help.list.priorityIndicators')}</p>
          <p>{t('help.list.memberAvatars')}</p>
          <p>{t('help.list.tagDisplay')}</p>
          <p>{t('help.list.commentCounts')}</p>
          <p>{t('help.list.statusIndicators')}</p>
        </div>
      </section>
    </div>
  );

  const renderGanttTab = () => (
    <div className="space-y-8">
      {/* Gantt Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="text-blue-500" />
          {t('help.gantt.overview')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.overviewDesc1')}</p>
          <p>{t('help.gantt.overviewDesc2')}</p>
          <p>{t('help.gantt.overviewDesc3')}</p>
        </div>
      </section>

      {/* Timeline Navigation */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-purple-500" />
          {t('help.gantt.timelineNavigation')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.scrollNavigation')}</p>
          <p>{t('help.gantt.todayButton')}</p>
          <p>{t('help.gantt.taskNavigation')}</p>
          <p>{t('help.gantt.relationshipMode')}</p>
        </div>
      </section>

      {/* Task Management */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ClipboardList className="text-orange-500" />
          {t('help.gantt.taskManagement')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.createTasks')}</p>
          <p>{t('help.gantt.editTasks')}</p>
          <p>{t('help.gantt.resizeTasks')}</p>
          <p>{t('help.gantt.moveTasks')}</p>
          <p>{t('help.gantt.reorderTasks')}</p>
          <p>{t('help.gantt.copyTasks')}</p>
          <p>{t('help.gantt.deleteTasks')}</p>
            </div>
          </section>

      {/* Dependencies */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ArrowRight className="text-teal-500" />
          {t('help.gantt.dependencies')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.createDependencies')}</p>
          <p>{t('help.gantt.dependencyTypes')}</p>
          <p>{t('help.gantt.visualArrows')}</p>
          <p>{t('help.gantt.cycleDetection')}</p>
          <p>{t('help.gantt.taskRelationships')}</p>
        </div>
      </section>

      {/* Timeline Features */}
      <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="text-indigo-500" />
          {t('help.gantt.timelineFeatures')}
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.timelineNavigationDesc')}</p>
          <p>{t('help.gantt.todayIndicator')}</p>
          <p>{t('help.gantt.lateBadge')}</p>
          <p>{t('help.gantt.columnOrganization')}</p>
          <p>{t('help.gantt.realtimeUpdatesTimeline')}</p>
            </div>
          </section>

      {/* Performance Features */}
          <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-green-500" />
          {t('help.gantt.performance')}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>{t('help.gantt.virtualScrolling')}</p>
          <p>{t('help.gantt.lazyLoading')}</p>
          <p>{t('help.gantt.realtimeUpdates')}</p>
          <p>{t('help.gantt.keyboardShortcuts')}</p>
          <p>{t('help.gantt.performanceMonitoring')}</p>
            </div>
          </section>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'kanban':
        return renderKanbanTab();
      case 'list':
        return renderListTab();
      case 'gantt':
        return renderGanttTab();
      default:
        return renderOverviewTab();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div ref={modalRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-4/5 max-w-6xl max-h-[90vh] flex flex-col">
        {/* Sticky Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('help.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('help.pressF1')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartTour}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              <Play size={16} />
              {t('help.startTutorial')}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={24} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b bg-gray-50 dark:bg-gray-700 px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {renderTabContent()}
        </div>

        {/* Sticky Footer */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50 dark:bg-gray-700 sticky bottom-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Version {versionDetection.getInitialVersion() || '0.9-beta'}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('help.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}