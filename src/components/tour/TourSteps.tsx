import { Step } from 'react-joyride';
import i18n from '../../i18n/config';

export interface TourStepsConfig {
  userSteps: Step[];
  adminSteps: Step[];
}

export const getTourSteps = (): TourStepsConfig => {
  const userSteps: Step[] = [
    {
      target: 'body', // Use body as fallback for testing
      content: i18n.t('tour.steps.welcome', { ns: 'common' }),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour-id="board-tabs"]',
      content: i18n.t('tour.steps.boardTabs', { ns: 'common' }),
      placement: 'bottom',
      offset: 20,
      disableBeacon: false,
      spotlightClicks: false,
    },
    {
      target: '[data-tour-id="kanban-columns"]',
      content: i18n.t('tour.steps.kanbanColumns', { ns: 'common' }),
      placement: 'top',
    },
    {
      target: '[data-tour-id="add-task-button"]',
      content: i18n.t('tour.steps.addTaskButton', { ns: 'common' }),
      placement: 'top',
    },
    {
      target: '[data-tour-id="search-filter"]',
      content: i18n.t('tour.steps.searchFilter', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="view-mode-toggle"]',
      content: i18n.t('tour.steps.viewModeToggle', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="team-members"]',
      content: i18n.t('tour.steps.teamMembers', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="profile-menu"]',
      content: i18n.t('tour.steps.profileMenu', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="help-button"]',
      content: i18n.t('tour.steps.helpButton', { ns: 'common' }),
      placement: 'bottom',
    },
  ];

  const adminSteps: Step[] = [
    // All user steps plus admin-specific ones
    ...userSteps,
    {
      target: '[data-tour-id="add-board-button"]',
      content: i18n.t('tour.steps.addBoardButton', { ns: 'common' }),
      placement: 'bottom',
      offset: 20,
    },
    {
      target: '[data-tour-id="admin-tab"]',
      content: i18n.t('tour.steps.adminTab', { ns: 'common' }),
      placement: 'bottom',
      spotlightClicks: true,
      disableBeacon: false,
      offset: 20,
    },
    {
      target: '[data-tour-id="admin-users"]',
      content: i18n.t('tour.steps.adminUsers', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-boards"]',
      content: i18n.t('tour.steps.adminBoards', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-columns"]',
      content: i18n.t('tour.steps.adminColumns', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-settings"]',
      content: i18n.t('tour.steps.adminSettings', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-tags"]',
      content: i18n.t('tour.steps.adminTags', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-priorities"]',
      content: i18n.t('tour.steps.adminPriorities', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-app-settings"]',
      content: i18n.t('tour.steps.adminAppSettings', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-project-settings"]',
      content: i18n.t('tour.steps.adminProjectSettings', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-licensing"]',
      content: i18n.t('tour.steps.adminLicensing', { ns: 'common' }),
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="system-usage-panel"]',
      content: i18n.t('tour.steps.systemUsagePanel', { ns: 'common' }),
      placement: 'left',
    },
  ];

  return {
    userSteps,
    adminSteps,
  };
};
