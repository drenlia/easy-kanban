import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, Columns, ClipboardList, MessageSquare, ArrowRight, LayoutGrid, List, Calendar, Search, Eye, Settings, Play, BarChart3, Shield, Download } from 'lucide-react';
import { useTour } from '../contexts/TourContext';
import { versionDetection } from '../utils/versionDetection';
import { CurrentUser } from '../types';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: CurrentUser | null;
}

type TabType = 'overview' | 'kanban' | 'list' | 'gantt' | 'reports' | 'admin';

export default function HelpModal({ isOpen, onClose, currentUser }: HelpModalProps) {
  const { t } = useTranslation('common');
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const firstMatchRef = useRef<HTMLElement | null>(null);
  const { startTour } = useTour();
  
  // Check if user is admin
  const isAdmin = currentUser?.roles?.includes('admin') || false;

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Scroll to first match when search term changes
  useEffect(() => {
    if (debouncedSearchTerm.trim() && firstMatchRef.current) {
      setTimeout(() => {
        firstMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [debouncedSearchTerm, activeTab]);

  // Reset first match ref when search changes
  useEffect(() => {
    firstMatchRef.current = null;
  }, [debouncedSearchTerm, activeTab]);

  // Highlight search terms in text - returns React components
  const highlightText = useCallback((text: string, searchTerm: string): React.ReactNode => {
    if (!searchTerm.trim() || !text) {
      return text;
    }

    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = text.split(regex);
    
    // Map parts to React elements, filtering empty strings
    return parts
      .filter(part => part.length > 0) // Filter out empty strings from split
      .map((part, index) => {
        // Check if this part exactly matches the search term (case-insensitive)
        const testRegex = new RegExp(`^${escapedTerm}$`, 'i');
        const isMatch = testRegex.test(part);
        
        if (isMatch) {
          return (
            <span 
              key={index}
              className="bg-yellow-200 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 px-0.5 rounded font-medium"
            >
              {part}
            </span>
          );
        }
        // Return plain string for non-matching parts to prevent spacing issues
        return part;
      });
  }, []);

  // Check if text contains search term (case-insensitive)
  const textMatches = useCallback((text: string, searchTerm: string): boolean => {
    if (!searchTerm.trim() || !text) return false;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  }, []);

  // Check if any text in an array of strings matches
  const anyTextMatches = useCallback((texts: string[], searchTerm: string): boolean => {
    if (!searchTerm.trim()) return false;
    return texts.some(text => textMatches(text, searchTerm));
  }, [textMatches]);

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
    { id: 'reports' as TabType, label: t('help.tabs.reports'), icon: BarChart3 },
    ...(isAdmin ? [{ id: 'admin' as TabType, label: t('help.tabs.admin'), icon: Shield }] : []),
  ];

  // Helper to render a section with search highlighting
  const renderSection = useCallback((
    titleKey: string,
    contentKeys: string[],
    icon: any, // Lucide icon type
    iconColor: string
  ) => {
    const title = t(titleKey);
    const contents = contentKeys.map(key => t(key));
    const allTexts = [title, ...contents];
    const hasMatch = debouncedSearchTerm.trim() ? anyTextMatches(allTexts, debouncedSearchTerm) : false;

    const sectionRef = (node: HTMLElement | null) => {
      if (node && hasMatch && debouncedSearchTerm.trim() && !firstMatchRef.current) {
        firstMatchRef.current = node;
      }
    };

    return (
      <section
        ref={sectionRef}
        className={hasMatch && debouncedSearchTerm.trim() ? 'bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4 border-2 border-yellow-400 dark:border-yellow-600 shadow-md' : ''}
      >
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          {React.createElement(icon, { className: iconColor, size: 20 })}
          {highlightText(title, debouncedSearchTerm)}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          {contents.map((content, index) => (
            <p key={index}>{highlightText(content, debouncedSearchTerm)}</p>
          ))}
        </div>
      </section>
    );
  }, [t, debouncedSearchTerm, highlightText, anyTextMatches]);

  // Helper to render a section with list items
  const renderSectionWithList = useCallback((
    titleKey: string,
    contentKeys: string[],
    listKeys: string[],
    icon: any, // Lucide icon type
    iconColor: string
  ) => {
    const title = t(titleKey);
    const contents = contentKeys.map(key => t(key));
    const listItems = listKeys.map(key => t(key));
    const allTexts = [title, ...contents, ...listItems];
    const hasMatch = debouncedSearchTerm.trim() ? anyTextMatches(allTexts, debouncedSearchTerm) : false;

    const sectionRef = (node: HTMLElement | null) => {
      if (node && hasMatch && debouncedSearchTerm.trim() && !firstMatchRef.current) {
        firstMatchRef.current = node;
      }
    };

    return (
      <section
        ref={sectionRef}
        className={hasMatch && debouncedSearchTerm.trim() ? 'bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4 border-2 border-yellow-400 dark:border-yellow-600 shadow-md' : ''}
      >
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          {React.createElement(icon, { className: iconColor, size: 20 })}
          {highlightText(title, debouncedSearchTerm)}
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          {contents.map((content, index) => (
            <p key={index}>{highlightText(content, debouncedSearchTerm)}</p>
          ))}
          {listKeys.length > 0 && (
            <ul className="ml-4 space-y-1 text-gray-600 dark:text-gray-300">
              {listItems.map((item, index) => (
                <li key={index}>{highlightText(item, debouncedSearchTerm)}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }, [t, debouncedSearchTerm, highlightText, anyTextMatches]);

  const renderOverviewTab = () => {
    const sections = [
      renderSection(
        'help.overview.whatIsEasyKanban',
        ['help.overview.whatIsEasyKanbanDesc1', 'help.overview.whatIsEasyKanbanDesc2'],
        LayoutGrid,
        'text-blue-500'
      ),
      renderSection(
        'help.overview.navigation',
        ['help.overview.boardSelector', 'help.overview.viewModes', 'help.overview.searchFilter', 'help.overview.userProfile', 'help.overview.activityFeed', 'help.overview.adminPanel'],
        ArrowRight,
        'text-green-500'
      ),
      renderSection(
        'help.overview.sprints',
        ['help.overview.sprintsDesc1', 'help.overview.sprintsDesc2', 'help.overview.sprintFilter'],
        Calendar,
        'text-blue-500'
      ),
      renderSectionWithList(
        'help.overview.teamManagement',
        ['help.overview.teamMembers', 'help.overview.memberSelection', 'help.overview.clearButton', 'help.overview.roleBasedFiltering'],
        ['help.overview.assignees', 'help.overview.watchers', 'help.overview.collaborators', 'help.overview.requesters', 'help.overview.system'],
        Users,
        'text-purple-500'
      ),
      renderSection(
        'help.overview.tools',
        ['help.overview.views', 'help.overview.searchFilterTools', 'help.overview.taskViewModes', 'help.overview.activityFeedTools', 'help.overview.userProfileTools', 'help.overview.realtimeCollaboration', 'help.overview.keyboardShortcuts'],
        Settings,
        'text-orange-500'
      ),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

  const renderKanbanTab = () => {
    const sections = [
      renderSection(
        'help.kanban.overview',
        ['help.kanban.overviewDesc1', 'help.kanban.overviewDesc2', 'help.kanban.overviewDesc3'],
        Columns,
        'text-blue-500'
      ),
      renderSection(
        'help.kanban.taskManagement',
        ['help.kanban.createTasks', 'help.kanban.editTasks', 'help.kanban.editTasksSprint', 'help.kanban.editTasksQuick', 'help.kanban.editTasksDates', 'help.kanban.editTasksAssignee', 'help.kanban.editTasksPriority', 'help.kanban.taskDetailsClick', 'help.kanban.moveTasks', 'help.kanban.reorderTasks', 'help.kanban.copyTasks', 'help.kanban.deleteTasks', 'help.kanban.taskToolbar'],
        ClipboardList,
        'text-orange-500'
      ),
      renderSection(
        'help.kanban.dragDrop',
        ['help.kanban.crossColumnMovement', 'help.kanban.withinColumnReordering', 'help.kanban.visualFeedback', 'help.kanban.autoSave'],
        ArrowRight,
        'text-teal-500'
      ),
      renderSection(
        'help.kanban.taskDetailsComm',
        ['help.kanban.taskInformation', 'help.kanban.comments', 'help.kanban.attachments', 'help.kanban.priorityLevels', 'help.kanban.tags', 'help.kanban.watchers', 'help.kanban.collaborators', 'help.kanban.taskRelationships'],
        MessageSquare,
        'text-indigo-500'
      ),
      ...(isAdmin ? [renderSection(
        'help.kanban.columnManagement',
        ['help.kanban.createColumns', 'help.kanban.renameColumns', 'help.kanban.reorderColumns', 'help.kanban.deleteColumns', 'help.kanban.finishedColumns'],
        Columns,
        'text-purple-500'
      )] : []),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

  const renderListTab = () => {
    const sections = [
      renderSection(
        'help.list.overview',
        ['help.list.overviewDesc1', 'help.list.overviewDesc2', 'help.list.overviewDesc3'],
        List,
        'text-blue-500'
      ),
      renderSection(
        'help.list.columnConfiguration',
        ['help.list.showHideColumns', 'help.list.defaultColumns', 'help.list.columnPersistence', 'help.list.horizontalScrolling'],
        Settings,
        'text-purple-500'
      ),
      renderSection(
        'help.list.sortingFiltering',
        ['help.list.sortByColumn', 'help.list.multiLevelSorting', 'help.list.searchIntegration', 'help.list.savedFilters', 'help.list.advancedFiltering'],
        Search,
        'text-orange-500'
      ),
      renderSection(
        'help.list.taskActions',
        ['help.list.quickActions', 'help.list.statusChanges', 'help.list.directEditing', 'help.list.taskDetails'],
        ClipboardList,
        'text-green-500'
      ),
      renderSection(
        'help.list.dataDisplay',
        ['help.list.richText', 'help.list.dateFormatting', 'help.list.priorityIndicators', 'help.list.memberAvatars', 'help.list.tagDisplay', 'help.list.commentCounts', 'help.list.statusIndicators'],
        Eye,
        'text-indigo-500'
      ),
      ...(isAdmin ? [renderSection(
        'help.list.export',
        ['help.list.exportDesc', 'help.list.exportFormats', 'help.list.exportScopes', 'help.list.exportFields', 'help.list.exportExcel'],
        Download,
        'text-green-500'
      )] : []),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

  const renderGanttTab = () => {
    const sections = [
      renderSection(
        'help.gantt.overview',
        ['help.gantt.overviewDesc1', 'help.gantt.overviewDesc2', 'help.gantt.overviewDesc3'],
        Calendar,
        'text-blue-500'
      ),
      renderSection(
        'help.gantt.timelineNavigation',
        ['help.gantt.scrollNavigation', 'help.gantt.todayButton', 'help.gantt.taskNavigation', 'help.gantt.relationshipMode'],
        ArrowRight,
        'text-green-500'
      ),
      renderSection(
        'help.gantt.taskManagement',
        ['help.gantt.createTasks', 'help.gantt.editTasks', 'help.gantt.resizeTasks', 'help.gantt.moveTasks', 'help.gantt.reorderTasks', 'help.gantt.copyTasks', 'help.gantt.deleteTasks'],
        ClipboardList,
        'text-orange-500'
      ),
      renderSection(
        'help.gantt.dependencies',
        ['help.gantt.createDependencies', 'help.gantt.dependencyTypes', 'help.gantt.visualArrows', 'help.gantt.cycleDetection', 'help.gantt.taskRelationships'],
        ArrowRight,
        'text-purple-500'
      ),
      renderSection(
        'help.gantt.timelineFeatures',
        ['help.gantt.timelineNavigationDesc', 'help.gantt.todayIndicator', 'help.gantt.lateBadge', 'help.gantt.columnOrganization', 'help.gantt.realtimeUpdatesTimeline'],
        Calendar,
        'text-indigo-500'
      ),
      renderSection(
        'help.gantt.performance',
        ['help.gantt.virtualScrolling', 'help.gantt.lazyLoading', 'help.gantt.realtimeUpdates', 'help.gantt.keyboardShortcuts', 'help.gantt.performanceMonitoring'],
        Settings,
        'text-green-500'
      ),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

  const renderReportsTab = () => {
    const sections = [
      renderSection(
        'help.reports.overview',
        ['help.reports.overviewDesc'],
        BarChart3,
        'text-blue-500'
      ),
      renderSection(
        'help.reports.myStats',
        ['help.reports.myStatsDesc'],
        BarChart3,
        'text-purple-500'
      ),
      renderSection(
        'help.reports.leaderboard',
        ['help.reports.leaderboardDesc'],
        BarChart3,
        'text-orange-500'
      ),
      renderSection(
        'help.reports.burndown',
        ['help.reports.burndownDesc'],
        BarChart3,
        'text-green-500'
      ),
      renderSection(
        'help.reports.teamPerformance',
        ['help.reports.teamPerformanceDesc'],
        BarChart3,
        'text-indigo-500'
      ),
      renderSection(
        'help.reports.taskList',
        ['help.reports.taskListDesc'],
        BarChart3,
        'text-teal-500'
      ),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

  const renderAdminTab = () => {
    const sections = [
      renderSection(
        'help.admin.overview',
        ['help.admin.overviewDesc'],
        Shield,
        'text-blue-500'
      ),
      renderSection(
        'help.admin.users',
        ['help.admin.usersDesc', 'help.admin.usersSystemUser', 'help.admin.usersOwnerUser'],
        Users,
        'text-purple-500'
      ),
      renderSection(
        'help.admin.siteSettings',
        ['help.admin.siteSettingsDesc', 'help.admin.siteSettingsUrl'],
        Settings,
        'text-orange-500'
      ),
      renderSection(
        'help.admin.sso',
        ['help.admin.ssoDesc', 'help.admin.ssoGoogleOnly'],
        Settings,
        'text-green-500'
      ),
      renderSection(
        'help.admin.mailServer',
        ['help.admin.mailServerDesc', 'help.admin.mailServerTesting'],
        Settings,
        'text-indigo-500'
      ),
      renderSection(
        'help.admin.tags',
        ['help.admin.tagsDesc'],
        Settings,
        'text-teal-500'
      ),
      renderSection(
        'help.admin.priorities',
        ['help.admin.prioritiesDesc', 'help.admin.prioritiesDefault'],
        Settings,
        'text-pink-500'
      ),
      renderSection(
        'help.admin.appSettings',
        ['help.admin.appSettingsDesc', 'help.admin.appSettingsLanguage'],
        Settings,
        'text-red-500'
      ),
      renderSection(
        'help.admin.projectSettings',
        ['help.admin.projectSettingsDesc', 'help.admin.projectSettingsIdentifiers'],
        Settings,
        'text-yellow-500'
      ),
      renderSection(
        'help.admin.sprintSettings',
        ['help.admin.sprintSettingsDesc', 'help.admin.sprintSettingsImportant'],
        Calendar,
        'text-blue-500'
      ),
      renderSection(
        'help.admin.reporting',
        ['help.admin.reportingDesc', 'help.admin.reportingGamification'],
        BarChart3,
        'text-purple-500'
      ),
      renderSection(
        'help.admin.licensing',
        ['help.admin.licensingDesc'],
        Shield,
        'text-green-500'
      ),
    ].filter(Boolean);

    return <div className="space-y-8">{sections}</div>;
  };

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
      case 'reports':
        return renderReportsTab();
      case 'admin':
        return renderAdminTab();
      default:
        return renderOverviewTab();
    }
  };

  // Check which tabs have matches for highlighting
  const getTabMatches = useCallback((tabId: TabType): boolean => {
    if (!debouncedSearchTerm.trim()) return false;
    
    // Get all translation keys for this tab
    const tabKeys: string[] = [];
    switch (tabId) {
      case 'overview':
        tabKeys.push('help.overview.whatIsEasyKanban', 'help.overview.whatIsEasyKanbanDesc1', 'help.overview.whatIsEasyKanbanDesc2',
          'help.overview.navigation', 'help.overview.boardSelector', 'help.overview.viewModes', 'help.overview.searchFilter',
          'help.overview.userProfile', 'help.overview.activityFeed', 'help.overview.adminPanel', 'help.overview.sprints',
          'help.overview.sprintsDesc1', 'help.overview.sprintsDesc2', 'help.overview.sprintFilter', 'help.overview.teamManagement',
          'help.overview.teamMembers', 'help.overview.memberSelection', 'help.overview.clearButton', 'help.overview.roleBasedFiltering',
          'help.overview.assignees', 'help.overview.watchers', 'help.overview.collaborators', 'help.overview.requesters',
          'help.overview.system', 'help.overview.tools', 'help.overview.views', 'help.overview.searchFilterTools',
          'help.overview.taskViewModes', 'help.overview.activityFeedTools', 'help.overview.userProfileTools',
          'help.overview.realtimeCollaboration', 'help.overview.keyboardShortcuts');
        break;
      case 'kanban':
        tabKeys.push('help.kanban.overview', 'help.kanban.overviewDesc1', 'help.kanban.overviewDesc2', 'help.kanban.overviewDesc3',
          'help.kanban.taskManagement', 'help.kanban.createTasks', 'help.kanban.editTasks', 'help.kanban.editTasksSprint',
          'help.kanban.editTasksQuick', 'help.kanban.editTasksDates', 'help.kanban.editTasksAssignee', 'help.kanban.editTasksPriority',
          'help.kanban.taskDetailsClick', 'help.kanban.moveTasks', 'help.kanban.reorderTasks', 'help.kanban.copyTasks',
          'help.kanban.deleteTasks', 'help.kanban.taskToolbar', 'help.kanban.dragDrop', 'help.kanban.crossColumnMovement',
          'help.kanban.withinColumnReordering', 'help.kanban.visualFeedback', 'help.kanban.autoSave', 'help.kanban.taskDetailsComm',
          'help.kanban.taskInformation', 'help.kanban.comments', 'help.kanban.attachments', 'help.kanban.priorityLevels',
          'help.kanban.tags', 'help.kanban.watchers', 'help.kanban.collaborators', 'help.kanban.taskRelationships',
          'help.kanban.columnManagement', 'help.kanban.createColumns', 'help.kanban.renameColumns', 'help.kanban.reorderColumns',
          'help.kanban.deleteColumns', 'help.kanban.finishedColumns');
        break;
      case 'list':
        tabKeys.push('help.list.overview', 'help.list.overviewDesc1', 'help.list.overviewDesc2', 'help.list.overviewDesc3',
          'help.list.columnConfiguration', 'help.list.showHideColumns', 'help.list.defaultColumns', 'help.list.columnPersistence',
          'help.list.horizontalScrolling', 'help.list.sortingFiltering', 'help.list.sortByColumn', 'help.list.multiLevelSorting',
          'help.list.searchIntegration', 'help.list.savedFilters', 'help.list.advancedFiltering', 'help.list.taskActions',
          'help.list.quickActions', 'help.list.statusChanges', 'help.list.directEditing', 'help.list.taskDetails',
          'help.list.dataDisplay', 'help.list.richText', 'help.list.dateFormatting', 'help.list.priorityIndicators',
          'help.list.memberAvatars', 'help.list.tagDisplay', 'help.list.commentCounts', 'help.list.statusIndicators',
          'help.list.export', 'help.list.exportDesc', 'help.list.exportFormats', 'help.list.exportScopes',
          'help.list.exportFields', 'help.list.exportExcel');
        break;
      case 'gantt':
        tabKeys.push('help.gantt.overview', 'help.gantt.overviewDesc1', 'help.gantt.overviewDesc2', 'help.gantt.overviewDesc3',
          'help.gantt.timelineNavigation', 'help.gantt.scrollNavigation', 'help.gantt.todayButton', 'help.gantt.taskNavigation',
          'help.gantt.relationshipMode', 'help.gantt.taskManagement', 'help.gantt.createTasks', 'help.gantt.editTasks',
          'help.gantt.resizeTasks', 'help.gantt.moveTasks', 'help.gantt.reorderTasks', 'help.gantt.copyTasks',
          'help.gantt.deleteTasks', 'help.gantt.dependencies', 'help.gantt.createDependencies', 'help.gantt.dependencyTypes',
          'help.gantt.visualArrows', 'help.gantt.cycleDetection', 'help.gantt.taskRelationships', 'help.gantt.timelineFeatures',
          'help.gantt.timelineNavigationDesc', 'help.gantt.todayIndicator', 'help.gantt.lateBadge', 'help.gantt.columnOrganization',
          'help.gantt.realtimeUpdatesTimeline', 'help.gantt.performance', 'help.gantt.virtualScrolling', 'help.gantt.lazyLoading',
          'help.gantt.realtimeUpdates', 'help.gantt.keyboardShortcuts', 'help.gantt.performanceMonitoring');
        break;
      case 'reports':
        tabKeys.push('help.reports.overview', 'help.reports.overviewDesc', 'help.reports.myStats', 'help.reports.myStatsDesc',
          'help.reports.leaderboard', 'help.reports.leaderboardDesc', 'help.reports.burndown', 'help.reports.burndownDesc',
          'help.reports.teamPerformance', 'help.reports.teamPerformanceDesc', 'help.reports.taskList', 'help.reports.taskListDesc');
        break;
      case 'admin':
        if (isAdmin) {
          tabKeys.push('help.admin.overview', 'help.admin.overviewDesc', 'help.admin.users', 'help.admin.usersDesc',
            'help.admin.siteSettings', 'help.admin.siteSettingsDesc', 'help.admin.sso', 'help.admin.ssoDesc',
            'help.admin.mailServer', 'help.admin.mailServerDesc', 'help.admin.tags', 'help.admin.tagsDesc',
            'help.admin.priorities', 'help.admin.prioritiesDesc', 'help.admin.appSettings', 'help.admin.appSettingsDesc',
            'help.admin.projectSettings', 'help.admin.projectSettingsDesc', 'help.admin.sprintSettings', 'help.admin.sprintSettingsDesc',
            'help.admin.reporting', 'help.admin.reportingDesc', 'help.admin.licensing', 'help.admin.licensingDesc');
        }
        break;
    }
    
    const tabTexts = tabKeys.map(key => t(key));
    return anyTextMatches(tabTexts, debouncedSearchTerm);
  }, [t, debouncedSearchTerm, anyTextMatches, isAdmin]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div ref={modalRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-4/5 max-w-6xl h-[90vh] flex flex-col">
        {/* Sticky Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('help.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('help.pressF1')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('help.searchPlaceholder')}
                className="pl-10 pr-4 py-2 w-64 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>
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
              const hasMatch = getTabMatches(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  } ${
                    hasMatch && debouncedSearchTerm.trim() ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    {tab.label}
                    {hasMatch && debouncedSearchTerm.trim() && (
                      <span className="ml-1 w-2 h-2 bg-yellow-500 rounded-full" title="Has matches" />
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Scrollable Content */}
        <div ref={contentRef} className="p-6 space-y-8 overflow-y-auto flex-1 min-h-0">
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