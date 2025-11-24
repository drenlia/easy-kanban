import React, { useState } from 'react';
import { X, Play, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { usePerfTest, TestResult } from './hooks/usePerfTest';
import { runDemoContentTest, runTagsTest, runSprintsTest, runBulkTasksTest, runDeleteAllContentTest } from './tests/backendTests';
import { runHumanInteractionsTest } from './tests/humanInteractions.test';
import { runRealtimeTest } from './tests/realtime.test';
import { runSearchTest } from './tests/search.test';

interface PerfTestConsoleProps {
  isVisible: boolean;
  onClose: () => void;
}

const PerfTestConsole: React.FC<PerfTestConsoleProps> = ({ isVisible, onClose }) => {
  const { results, isRunning, currentTest, runTest, clearResults } = usePerfTest();
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isVisible) return null;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const testConfigs = [
    { name: 'Demo Content', fn: runDemoContentTest, description: 'Create demo content (background)' },
    { name: 'Human Interactions', fn: runHumanInteractionsTest, description: 'Simulate user interactions' },
    { name: 'Tags', fn: runTagsTest, description: 'Create 20 tags and associate to tasks' },
    { name: 'Sprints', fn: runSprintsTest, description: 'Create 3 sprints and associate tasks' },
    { name: 'Bulk Tasks', fn: runBulkTasksTest, description: 'Create 50-100 tasks' },
    { name: 'Real-time Updates', fn: runRealtimeTest, description: 'Test WebSocket broadcast latency' },
    { name: 'Search/Filter', fn: runSearchTest, description: 'Test search with large dataset' },
  ];

  const deleteAllContent = async () => {
    const warningMessage = 
      '⚠️ WARNING: This will delete ALL content except your user account and member record.\n\n' +
      'This will permanently delete:\n' +
      '• All tasks, boards, columns\n' +
      '• All users (except you)\n' +
      '• All tags, sprints, comments, attachments\n' +
      '• All activity history, views, and saved filters\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Are you absolutely sure you want to continue?';
    
    if (!confirm(warningMessage)) {
      return;
    }
    
    // Second confirmation
    const finalMessage = 
      '⚠️ FINAL CONFIRMATION\n\n' +
      'You are about to delete ALL content. This is your last chance to cancel.\n\n' +
      'Click OK to proceed with deletion, or Cancel to abort.';
    
    if (!confirm(finalMessage)) {
      return;
    }
    
    await runTest('Delete All Content', runDeleteAllContentTest);
  };

  return (
    <div className="fixed top-0 left-0 z-50 m-2">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-80 max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Performance Tests
            </h3>
            {isRunning && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            )}
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              <X className={`w-4 h-4 text-gray-500 transition-transform ${isMinimized ? 'rotate-45' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Close"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Test Buttons */}
            <div className="p-2 space-y-1 overflow-y-auto flex-1">
              {testConfigs.map((config) => (
                <button
                  key={config.name}
                  onClick={() => runTest(config.name, config.fn)}
                  disabled={isRunning}
                  className="w-full text-left px-2 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{config.name}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{config.description}</div>
                  </div>
                  {currentTest === config.name ? (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-2" />
                  ) : (
                    <Play className="w-3 h-3 text-blue-500 ml-2" />
                  )}
                </button>
              ))}
              
              {/* Delete All Content Button - Separated with warning style */}
              <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={deleteAllContent}
                  disabled={isRunning}
                  className="w-full text-left px-2 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded border border-red-200 dark:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <div className="flex-1 flex items-center space-x-2">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    <div>
                      <div className="font-medium text-red-900 dark:text-red-100">Delete All Content</div>
                      <div className="text-[10px] text-red-600 dark:text-red-400">Remove all data except your account</div>
                    </div>
                  </div>
                  {currentTest === 'Delete All Content' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-red-500 ml-2" />
                  ) : (
                    <Trash2 className="w-3 h-3 text-red-500 ml-2" />
                  )}
                </button>
              </div>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Results</h4>
                  <button
                    onClick={clearResults}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    title="Clear results"
                  >
                    <Trash2 className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {results.map((result: TestResult, index: number) => (
                    <div
                      key={index}
                      className={`text-xs p-1.5 rounded ${
                        result.success
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {result.testName}
                        </span>
                        <span className={`font-mono ${
                          result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatDuration(result.duration)}
                        </span>
                      </div>
                      {result.message && (
                        <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                          {result.message}
                        </div>
                      )}
                      {result.details?.actions && Array.isArray(result.details.actions) && result.details.actions.length > 0 && (
                        <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
                          <div className="font-medium">Actions:</div>
                          <ul className="list-disc list-inside ml-1 space-y-0.5">
                            {result.details.actions.map((action: string, idx: number) => (
                              <li key={idx}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PerfTestConsole;

