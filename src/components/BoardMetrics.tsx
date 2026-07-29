import React from 'react';
import { useTranslation } from 'react-i18next';
import { Columns } from '../types';
import { formatEffortDisplay, parseEffortUnit, sumTaskEffort } from '../utils/taskUtils';

interface BoardMetricsProps {
  columns: Columns;
  filteredColumns?: Columns;
  siteSettings?: { [key: string]: string };
}

const BoardMetrics: React.FC<BoardMetricsProps> = ({ columns, filteredColumns = columns, siteSettings }) => {
  const { t } = useTranslation('common');
  const effortUnit = parseEffortUnit(siteSettings);
  // Calculate metrics from all tasks across all columns
  const allTasks = Object.values(filteredColumns).flatMap(column => column.tasks || []);
  const totalTasks = allTasks.length;
  const totalEffort = sumTaskEffort(allTasks);
  const effortDisplay = formatEffortDisplay(totalEffort, effortUnit);
  
  // Count completed tasks (tasks in finished or archived columns)
  const completedTasks = Object.values(filteredColumns)
    .filter(column => column.is_finished || column.is_archived)
    .flatMap(column => column.tasks || [])
    .length;
  
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
        <div className="p-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-100 dark:border-gray-700 w-full flex-1 flex flex-col box-border">
      {/* Same title row height/spacing as Tools + Team Members so headings share one baseline */}
      <div className="flex items-center justify-center mb-3 min-h-5 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide leading-5 text-center">
          {t('boardMetrics.progress')}
        </h2>
      </div>

      <div className="space-y-2 flex-1 flex flex-col justify-center min-h-0">
        {/* Progress */}
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {completedTasks}/{totalTasks} <span className="text-xs font-normal text-gray-600 dark:text-gray-400">({completionPercentage}%)</span>
          </div>
        </div>
        
        {/* Progress bar + optional effort on the same row (keeps card height aligned with Tools / Team Members) */}
        <div className="flex items-center gap-1.5 w-full min-w-0">
          <div className="flex-1 min-w-0">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
          {totalEffort > 0 && (
            <span
              className="shrink-0 text-[0.65rem] leading-none tabular-nums text-gray-400 dark:text-gray-500"
              title={t('boardMetrics.totalEffortTooltip', { display: effortDisplay })}
              aria-label={t('boardMetrics.totalEffortTooltip', { display: effortDisplay })}
            >
              {effortDisplay}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BoardMetrics;
