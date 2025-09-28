import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Table, ChevronDown } from 'lucide-react';
import { Board, TeamMember, Tag } from '../types';
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
  isAdmin: boolean;
}

export default function ExportMenu({ 
  boards, 
  selectedBoard, 
  members, 
  availableTags, 
  isAdmin 
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        data = getCurrentBoardTasksForExport(selectedBoard, members, availableTags);
      } else {
        data = getAllTasksForExport(boards, members, availableTags);
      }

      const filename = generateFilename(
        options.format, 
        options.scope, 
        options.scope === 'current' ? selectedBoard.title : undefined
      );

      if (options.format === 'csv') {
        // For CSV, create a blob and download it
        const csvContent = convertToCSV(data);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, filename);
      } else {
        // For XLSX, create a blob and download it
        const workbook = createXLSXWorkbook(data);
        const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadFile(blob, filename);
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Create XLSX workbook for browser download
  const createXLSXWorkbook = (data: ExportData[]) => {
    const workbook = XLSX.utils.book_new();

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

      const worksheet = XLSX.utils.json_to_sheet(boardTasks, {
        header: [
          'ticket', 'title', 'description', 'assignee', 'priority', 'status',
          'startDate', 'dueDate', 'effort', 'tags', 'comments', 'createdAt', 'updatedAt', 'project'
        ]
      });

      // Set column widths
      const colWidths = [
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

    // If there's only one board, also create a summary sheet
    if (Object.keys(boardGroups).length > 1) {
      const summarySheet = XLSX.utils.json_to_sheet(data, {
        header: [
          'boardName', 'ticket', 'title', 'description', 'assignee', 'priority', 'status',
          'startDate', 'dueDate', 'effort', 'tags', 'comments', 'createdAt', 'updatedAt', 'project'
        ]
      });
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'All Boards');
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
        title="Export Data"
      >
        <Download size={14} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
          <div className="py-1">
            {/* CSV Options */}
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              CSV Export
            </div>
            <button
              onClick={() => handleExport({ format: 'csv', scope: 'current' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <FileText size={14} />
              Current Board
            </button>
            <button
              onClick={() => handleExport({ format: 'csv', scope: 'all' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <FileText size={14} />
              All Boards
            </button>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>

            {/* XLSX Options */}
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Excel Export
            </div>
            <button
              onClick={() => handleExport({ format: 'xlsx', scope: 'current' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <Table size={14} />
              Current Board
            </button>
            <button
              onClick={() => handleExport({ format: 'xlsx', scope: 'all' })}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-50"
            >
              <Table size={14} />
              All Boards
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
