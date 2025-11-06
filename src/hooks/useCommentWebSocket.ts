import { useCallback, RefObject } from 'react';
import { Columns, Task } from '../types';

interface UseCommentWebSocketProps {
  // State setters
  setColumns: React.Dispatch<React.SetStateAction<Columns>>;
  setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
  
  // Refs
  selectedBoardRef: RefObject<string | null>;
  
  // Selected task (for updating TaskDetails)
  selectedTask: Task | null;
}

export const useCommentWebSocket = ({
  setColumns,
  setSelectedTask,
  selectedBoardRef,
  selectedTask,
}: UseCommentWebSocketProps) => {
  
  const handleCommentCreated = useCallback((data: any) => {
    if (!data.comment || !data.boardId || !data.taskId) {
      return;
    }
    
    // Only process if this is for the current board
    const currentSelectedBoard = selectedBoardRef.current;
    if (!currentSelectedBoard || data.boardId !== currentSelectedBoard) {
      return;
    }
    
    // Find the task in the current board and add the comment
    setColumns(prevColumns => {
      // Create a completely new columns object to ensure React detects the change
      // This prevents any stale references from being preserved
      const updatedColumns: Columns = {};
      let updatedTaskForSelection = null;
      let taskFound = false;
      
      // Find the task across all columns
      Object.keys(prevColumns).forEach(columnId => {
        const column = prevColumns[columnId];
        const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
        
        if (taskIndex === -1) {
          // This column doesn't contain the task, so we can preserve the reference
          updatedColumns[columnId] = column;
          return;
        }
        
        // This column contains the task we need to update
        taskFound = true;
        const updatedTasks = [...column.tasks];
        const task = { ...updatedTasks[taskIndex] };
        
        // Preserve existing comments and add the new one if it doesn't already exist
        // IMPORTANT: Always ensure comments is an array, even if undefined/null
        const existingComments = Array.isArray(task.comments) 
          ? task.comments 
          : (task.comments ? [task.comments] : []);
        
        if (!existingComments.find(c => c && c.id === data.comment.id)) {
          // Ensure comment has all required fields for validation
          const newComment = {
            ...data.comment,
            taskId: data.taskId,
            attachments: Array.isArray(data.comment.attachments) ? data.comment.attachments : []
          };
          
          // Create new comments array IMMEDIATELY without mutating task.comments
          const newComments = [...existingComments, newComment];
          
          // Create a completely new task object to ensure React detects the change
          const updatedTask = {
            ...task,
            comments: newComments // Use the new array we created
          };
          
          updatedTasks[taskIndex] = updatedTask;
          // Create a completely new column object to ensure React detects the change
          updatedColumns[columnId] = {
            ...column,
            tasks: updatedTasks // New array reference
          };
          
          // If this is the selected task, update it for TaskDetails
          if (selectedTask && selectedTask.id === data.taskId) {
            updatedTaskForSelection = updatedTask;
          }
        } else {
          // Still need to add this column to updatedColumns even if comment already exists
          updatedColumns[columnId] = column;
        }
      });
      
      if (!taskFound) {
        console.warn('⚠️ [WebSocket] handleCommentCreated: Task not found in columns', data.taskId);
      }
      
      // Update selectedTask if it's the one that got the comment
      if (updatedTaskForSelection) {
        setSelectedTask(updatedTaskForSelection);
      }
      
      return updatedColumns;
    });
  }, [setColumns, setSelectedTask, selectedBoardRef, selectedTask]);

  const handleCommentUpdated = useCallback((data: any) => {
    if (!data.comment || !data.boardId || !data.taskId) {
      return;
    }
    
    // Only process if this is for the current board
    const currentSelectedBoard = selectedBoardRef.current;
    if (!currentSelectedBoard || data.boardId !== currentSelectedBoard) {
      return;
    }
    
    // Find the task and update the comment
    // Use functional update to ensure we're working with the latest state
    setColumns(prevColumns => {
      
      // Create a completely new columns object to ensure React detects the change
      // This prevents any stale references from being preserved
      const updatedColumns: Columns = {};
      let updatedTaskForSelection = null;
      let taskFound = false;
      
      // First, copy all columns that we're NOT modifying (preserve references)
      Object.keys(prevColumns).forEach(columnId => {
        const column = prevColumns[columnId];
        const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
        
        if (taskIndex === -1) {
          // This column doesn't contain the task, so we can preserve the reference
          updatedColumns[columnId] = column;
          return;
        }
        
        // This column contains the task we need to update
        taskFound = true;
        // Create a new array copy first
        const updatedTasks = [...column.tasks];
        // Create a new task object copy (don't mutate the original)
        const originalTask = updatedTasks[taskIndex];
        const task = { ...originalTask };
        
        // Preserve existing comments and update the specific one
        // IMPORTANT: Always ensure comments is an array, even if undefined/null
        const existingComments = Array.isArray(task.comments) 
          ? task.comments 
          : (task.comments ? [task.comments] : []);
        const commentIndex = existingComments.findIndex(c => c && c.id === data.comment.id);
        
        // Create updated comments array IMMEDIATELY without mutating task.comments
        let newComments: any[];
        if (commentIndex !== -1) {
          // Ensure updated comment has all required fields
          const updatedComment = {
            ...data.comment,
            taskId: data.taskId,
            attachments: Array.isArray(data.comment.attachments) ? data.comment.attachments : []
          };
          
          newComments = [
            ...existingComments.slice(0, commentIndex),
            updatedComment,
            ...existingComments.slice(commentIndex + 1)
          ];
        } else {
          // Comment not found, add it (shouldn't happen but handle gracefully)
          const newComment = {
            ...data.comment,
            taskId: data.taskId,
            attachments: Array.isArray(data.comment.attachments) ? data.comment.attachments : []
          };
          newComments = [...existingComments, newComment];
        }
        
        // Create a completely new task object with new comments array
        // This is critical for React.memo to detect the change and re-render TaskCard
        const updatedTask = {
          ...task,
          comments: newComments // Use the new array we created
        };
        
        updatedTasks[taskIndex] = updatedTask;
        // Create a completely new column object to ensure React detects the change
        updatedColumns[columnId] = {
          ...column,
          tasks: updatedTasks // New array reference
        };
        
        // If this is the selected task, update it for TaskDetails
        if (selectedTask && selectedTask.id === data.taskId) {
          updatedTaskForSelection = updatedTask;
        }
      });
      
      if (!taskFound) {
        console.warn('⚠️ [WebSocket] handleCommentUpdated: Task not found in columns', data.taskId);
      }
      
      // Update selectedTask if it's the one that got the comment updated
      if (updatedTaskForSelection) {
        setSelectedTask(updatedTaskForSelection);
      }
      
      return updatedColumns;
    });
  }, [setColumns, setSelectedTask, selectedBoardRef, selectedTask]);

  const handleCommentDeleted = useCallback((data: any) => {
    if (!data.commentId || !data.boardId || !data.taskId) {
      return;
    }
    
    // Only process if this is for the current board
    const currentSelectedBoard = selectedBoardRef.current;
    if (!currentSelectedBoard || data.boardId !== currentSelectedBoard) {
      return;
    }
    
    // Find the task and remove the comment
    setColumns(prevColumns => {
      // Create a completely new columns object to ensure React detects the change
      // This prevents any stale references from being preserved
      const updatedColumns: Columns = {};
      let updatedTaskForSelection = null;
      let taskFound = false;
      
      Object.keys(prevColumns).forEach(columnId => {
        const column = prevColumns[columnId];
        const taskIndex = column.tasks.findIndex(t => t.id === data.taskId);
        
        if (taskIndex === -1) {
          // This column doesn't contain the task, so we can preserve the reference
          updatedColumns[columnId] = column;
          return;
        }
        
        // This column contains the task we need to update
        taskFound = true;
        const updatedTasks = [...column.tasks];
        const task = { ...updatedTasks[taskIndex] };
        
        // Preserve existing comments and remove the deleted one
        // IMPORTANT: Always ensure comments is an array, even if undefined/null
        const existingComments = Array.isArray(task.comments) 
          ? task.comments 
          : (task.comments !== undefined && task.comments !== null ? [task.comments] : []);
        
        // Create new comments array IMMEDIATELY without mutating task.comments
        // Filter out the deleted comment
        const newComments = existingComments.filter(c => c && c.id !== data.commentId);
        
        // Create a completely new task object with new comments array
        // This is critical for React.memo to detect the change and re-render TaskCard
        const updatedTask = {
          ...task,
          comments: newComments // Use the new filtered array
        };
        
        updatedTasks[taskIndex] = updatedTask;
        // Create a completely new column object to ensure React detects the change
        updatedColumns[columnId] = {
          ...column,
          tasks: updatedTasks // New array reference
        };
        
        // Update selectedTask reference if needed
        if (selectedTask && selectedTask.id === data.taskId) {
          updatedTaskForSelection = updatedTask;
        }
      });
      
      if (!taskFound) {
        console.warn('⚠️ [WebSocket] handleCommentDeleted: Task not found in columns', data.taskId);
      }
      
      // Update selectedTask if it's the one that got the comment deleted
      if (updatedTaskForSelection) {
        setSelectedTask(updatedTaskForSelection);
      }
      
      return updatedColumns;
    });
  }, [setColumns, setSelectedTask, selectedBoardRef, selectedTask]);

  return {
    handleCommentCreated,
    handleCommentUpdated,
    handleCommentDeleted,
  };
};

