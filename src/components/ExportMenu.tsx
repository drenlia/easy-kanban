import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Table, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Board, TeamMember, Tag, PriorityOption } from '../types';
import * as XLSX from 'xlsx';
import { 
  convertToCSV,
  generateFilename, 
  downloadFile,
  getAllTasksForExport,
  getCurrentBoardTasksForExport,
  ExportOptions,
  ExportData
} from '../utils/exportUtils';

interface ExportMenuProps {
  boards: Board[];
  selectedBoard: Board;
  members: TeamMember[];
  availableTags: Tag[];
  availablePriorities?: PriorityOption[];
  isAdmin: boolean;
}

export default function ExportMenu({ 
  boards, 
  selectedBoard, 
  members, 
  availableTags,
  availablePriorities,
  isAdmin 
}: ExportMenuProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sprints, setSprints] = useState<Array<{ id: string; name: string }>>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch sprints when component mounts
  useEffect(() => {
    const fetchSprints = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/sprints', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setSprints(data.sprints || []);
        }
      } catch (error) {
        console.error('Failed to fetch sprints:', error);
      }
    };

    fetchSprints();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Don't render if user is not admin
  if (!isAdmin) {
    return null;
  }

  const handleExport = async (options: ExportOptions) => {
    setIsExporting(true);
    
    try {
      let data;
      
      if (options.scope === 'current') {
        data = getCurrentBoardTasksForExport(selectedBoard, members, availableTags, sprints, availablePriorities);
      } else {
        data = getAllTasksForExport(boards, members, availableTags, sprints, availablePriorities);
      }

      const filename = generateFilename(
        options.format, 
        options.scope, 
        options.scope === 'current' ? selectedBoard.title : undefined
      );

      if (options.format === 'csv') {
        // For CSV, create a blob and download it
        const csvContent = convertToCSV(data, t);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, filename);
      } else {
        // For XLSX, create a blob and download it
        const workbook = createXLSXWorkbook(data, t);
        const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadFile(blob, filename);
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert(t('export.failed'));
    } finally {
      setIsExporting(false);
    }
  };

  // Create XLSX workbook for browser download
  const createXLSXWorkbook = (data: ExportData[], translateFn: (key: string) => string) => {
    const workbook = XLSX.utils.book_new();

    // Define the column mapping (data key -> translated header)
    const columnMapping = [
      { key: 'sprint', header: translateFn('export.headers.sprint') },
      { key: 'ticket', header: translateFn('export.headers.ticket') },
      { key: 'title', header: translateFn('export.headers.task') },
      { key: 'description', header: translateFn('export.headers.description') },
      { key: 'assignee', header: translateFn('export.headers.assignee') },
      { key: 'priority', header: translateFn('export.headers.priority') },
      { key: 'status', header: translateFn('export.headers.status') },
      { key: 'startDate', header: translateFn('export.headers.startDate') },
      { key: 'dueDate', header: translateFn('export.headers.dueDate') },
      { key: 'effort', header: translateFn('export.headers.effort') },
      { key: 'tags', header: translateFn('export.headers.tags') },
      { key: 'comments', header: translateFn('export.headers.comments') },
      { key: 'createdAt', header: translateFn('export.headers.created') },
      { key: 'updatedAt', header: translateFn('export.headers.updated') },
      { key: 'project', header: translateFn('export.headers.project') }
    ];

    const columnMappingWithBoard = [
      { key: 'boardName', header: translateFn('export.headers.board') },
      ...columnMapping
    ];

    // Group data by board
    const boardGroups = data.reduce((acc, task) => {
      if (!acc[task.boardName]) {
        acc[task.boardName] = [];
      }
      acc[task.boardName].push(task);
      return acc;
    }, {} as Record<string, ExportData[]>);

    // Create a sheet for each board
    Object.entries(boardGroups).forEach(([boardName, boardTasks]) => {
      // Clean sheet name (Excel has restrictions on sheet names)
      const cleanSheetName = boardName
        .replace(/[\\\/\?\*\[\]]/g, '') // Remove invalid characters
        .substring(0, 31); // Max 31 characters

      // Create worksheet with data
      const worksheet = XLSX.utils.json_to_sheet(boardTasks, {
        header: columnMapping.map(col => col.key)
      });

      // Replace headers with translated values
      columnMapping.forEach((col, index) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].v = col.header;
        }
      });

      // Set column widths
      const colWidths = [
        { wch: 20 }, // sprint
        { wch: 15 }, // ticket
        { wch: 30 }, // title
        { wch: 40 }, // description
        { wch: 20 }, // assignee
        { wch: 15 }, // priority
        { wch: 20 }, // status
        { wch: 12 }, // startDate
        { wch: 12 }, // dueDate
        { wch: 8 },  // effort
        { wch: 25 }, // tags
        { wch: 15 }, // comments
        { wch: 12 }, // createdAt
        { wch: 12 }, // updatedAt
        { wch: 20 }  // project
      ];
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName);
    });

    // If there's more than one board, also create a summary sheet
    if (Object.keys(boardGroups).length > 1) {
      const summarySheet = XLSX.utils.json_to_sheet(data, {
        header: columnMappingWithBoard.map(col => col.key)
      });

      // Replace headers with translated values
      columnMappingWithBoard.forEach((col, index) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
        if (summarySheet[cellAddress]) {
          summarySheet[cellAddress].v = col.header;
        }
      });

      XLSX.utils.book_append_sheet(workbook, summarySheet, translateFn('export.allBoards'));
    }

    return workbook;
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Export Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="opacity-60 hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity disabled:opacity-50"
        title={t('export.title')}
        data-tour-id="export-menu"
      >
        <Download size={14} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
          <div className="py-1">
            {/* CSV Options */}
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('export.csvExport')}
            </div>
            <button
              onClick={() => handleExport({ format: 'csv', scope: 'current' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <FileText size={14} />
              {t('export.currentBoard')}
            </button>
            <button
              onClick={() => handleExport({ format: 'csv', scope: 'all' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <FileText size={14} />
              {t('export.allBoards')}
            </button>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>

            {/* XLSX Options */}
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('export.excelExport')}
            </div>
            <button
              onClick={() => handleExport({ format: 'xlsx', scope: 'current' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <Table size={14} />
              {t('export.currentBoard')}
            </button>
            <button
              onClick={() => handleExport({ format: 'xlsx', scope: 'all' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <Table size={14} />
              {t('export.allBoards')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
