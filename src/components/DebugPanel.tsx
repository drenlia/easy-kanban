import React from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface QueryLog {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'ERROR';
  query: string;
  timestamp: string;
  error?: string;
}

interface DebugPanelProps {
  logs: QueryLog[];
  onClear: () => void;
}

export default function DebugPanel({ logs, onClear }: DebugPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg hover:bg-gray-700"
      >
        Show Debug Panel
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-[600px] bg-gray-800 text-white shadow-lg">
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <h3 className="text-sm font-semibold">Database Debug Panel</h3>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
            {logs.length} queries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-[300px] overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`p-2 border-b border-gray-700 ${
                log.type === 'ERROR' ? 'bg-red-900/20' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    log.type === 'INSERT'
                      ? 'bg-green-500/20 text-green-300'
                      : log.type === 'UPDATE'
                      ? 'bg-blue-500/20 text-blue-300'
                      : log.type === 'DELETE'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {log.type}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap text-gray-300">
                {log.query}
              </pre>
              {log.error && (
                <pre className="mt-1 text-xs font-mono whitespace-pre-wrap text-red-300">
                  Error: {log.error}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}