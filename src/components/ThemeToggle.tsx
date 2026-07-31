import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { KanbanChromeTooltip } from './KanbanChromeTooltip';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation('common');
  const label = theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight');

  return (
    <KanbanChromeTooltip label={label}>
      <button
        onClick={toggleTheme}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        aria-label={label}
        data-tour-id="theme-toggle"
      >
        {theme === 'light' ? (
          <Moon size={16} />
        ) : (
          <Sun size={16} />
        )}
      </button>
    </KanbanChromeTooltip>
  );
};

export default ThemeToggle;
