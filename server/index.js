import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import { mkdir } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'kanban.db');
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

// Initialize database
const db = new Database(dbPath);
const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Query logging
const queryLogs = [];
let queryId = 0;

function wrapQuery(stmt, type) {
  return {
    run(...params) {
      try {
        const result = stmt.run(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type,
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    },
    get(...params) {
      try {
        const result = stmt.get(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'SELECT',
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    },
    all(...params) {
      try {
        const result = stmt.all(...params);
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'SELECT',
          query: stmt.source,
          params,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        queryLogs.push({
          id: `query-${queryId++}`,
          type: 'ERROR',
          query: stmt.source,
          params,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }
  };
}

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL,
    title TEXT NOT NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    position INTEGER DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT,
    memberId TEXT NOT NULL,
    startDate TEXT NOT NULL,
    effort INTEGER NOT NULL,
    columnId TEXT NOT NULL,
    priority TEXT NOT NULL,
    requesterId TEXT NOT NULL,
    boardId TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE CASCADE,
    FOREIGN KEY (requesterId) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    text TEXT NOT NULL,
    authorId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (authorId) REFERENCES members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    commentId TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE
  );
`);

// Initialize default data if no boards exist
const boardCount = db.prepare('SELECT COUNT(*) as count FROM boards').get();
if (boardCount.count === 0) {
  const defaultBoard = {
    id: 'default-board',
    title: 'Main Board',
    columns: [
      { id: 'todo', title: 'To Do' },
      { id: 'progress', title: 'In Progress' },
      { id: 'testing', title: 'Testing' },
      { id: 'completed', title: 'Completed' }
    ]
  };

  const defaultMember = {
    id: 'default-member',
    name: 'Demo User',
    color: '#4ECDC4'
  };

  // Create default member
  const memberStmt = wrapQuery(
    db.prepare('INSERT INTO members (id, name, color) VALUES (?, ?, ?)'),
    'INSERT'
  );
  memberStmt.run(defaultMember.id, defaultMember.name, defaultMember.color);

  // Create default board
  const boardStmt = wrapQuery(
    db.prepare('INSERT INTO boards (id, title) VALUES (?, ?)'),
    'INSERT'
  );
  boardStmt.run(defaultBoard.id, defaultBoard.title);

  // Create default columns
  const columnStmt = wrapQuery(
    db.prepare('INSERT INTO columns (id, boardId, title) VALUES (?, ?, ?)'),
    'INSERT'
  );
  defaultBoard.columns.forEach(column => {
    columnStmt.run(column.id, defaultBoard.id, column.title);
  });

  // Create a sample task
  const sampleTask = {
    id: 'sample-task',
    title: 'Welcome to Kanban',
    description: 'This is a sample task to help you get started. Feel free to edit or delete it.',
    memberId: defaultMember.id,
    startDate: new Date().toISOString().split('T')[0],
    effort: 1,
    columnId: 'todo',
    priority: 'medium',
    requesterId: defaultMember.id,
    boardId: defaultBoard.id
  };

  const taskStmt = wrapQuery(
    db.prepare(`
      INSERT INTO tasks (
        id, title, description, memberId, startDate,
        effort, columnId, priority, requesterId, boardId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    'INSERT'
  );

  taskStmt.run(
    sampleTask.id,
    sampleTask.title,
    sampleTask.description,
    sampleTask.memberId,
    sampleTask.startDate,
    sampleTask.effort,
    sampleTask.columnId,
    sampleTask.priority,
    sampleTask.requesterId,
    sampleTask.boardId
  );
}

// API Endpoints
app.get('/api/members', (req, res) => {
  try {
    const stmt = wrapQuery(db.prepare('SELECT * FROM members'), 'SELECT');
    const members = stmt.all();
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.post('/api/members', (req, res) => {
  const { id, name, color } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('INSERT INTO members (id, name, color) VALUES (?, ?, ?)'),
      'INSERT'
    );
    stmt.run(id, name, color);
    res.json({ id, name, color });
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM members WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

app.get('/api/boards', (req, res) => {
  try {
    // Get all boards
    const boardsStmt = wrapQuery(db.prepare('SELECT * FROM boards'), 'SELECT');
    const boards = boardsStmt.all();
    
    // Prepare statements for related data
    const columnsStmt = wrapQuery(
      db.prepare('SELECT * FROM columns WHERE boardId = ?'),
      'SELECT'
    );
    const tasksStmt = wrapQuery(
      db.prepare(`
        SELECT t.*, 
          json_group_array(
            json_object(
              'id', c.id,
              'text', c.text,
              'authorId', c.authorId,
              'createdAt', c.createdAt
            )
          ) as comments
        FROM tasks t
        LEFT JOIN comments c ON c.taskId = t.id
        WHERE t.boardId = ?
        GROUP BY t.id
      `),
      'SELECT'
    );
    
    const boardsWithData = boards.map(board => {
      const columns = columnsStmt.all(board.id);
      const tasks = tasksStmt.all(board.id).map(task => ({
        ...task,
        comments: task.comments === '[null]' ? [] : JSON.parse(task.comments)
      }));
      
      // Create columns object with tasks
      const columnsObj = {};
      columns.forEach(column => {
        columnsObj[column.id] = {
          ...column,
          tasks: tasks.filter(task => task.columnId === column.id)
        };
      });
      
      return {
        ...board,
        columns: columnsObj
      };
    });
    
    res.json(boardsWithData);
  } catch (error) {
    console.error('Error fetching boards:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

app.post('/api/boards', (req, res) => {
  const { id, title, columns } = req.body;
  
  try {
    const boardStmt = wrapQuery(
      db.prepare('INSERT INTO boards (id, title) VALUES (?, ?)'),
      'INSERT'
    );
    boardStmt.run(id, title);
    
    const columnStmt = wrapQuery(
      db.prepare('INSERT INTO columns (id, boardId, title) VALUES (?, ?, ?)'),
      'INSERT'
    );
    
    Object.values(columns).forEach(column => {
      columnStmt.run(column.id, id, column.title);
    });
    
    res.json({ id, title, columns });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

app.put('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('UPDATE boards SET title = ? WHERE id = ?'),
      'UPDATE'
    );
    stmt.run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

app.delete('/api/boards/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM boards WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

app.post('/api/columns', (req, res) => {
  const { id, boardId, title } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('INSERT INTO columns (id, boardId, title) VALUES (?, ?, ?)'),
      'INSERT'
    );
    stmt.run(id, boardId, title);
    res.json({ id, boardId, title, tasks: [] });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

app.put('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare('UPDATE columns SET title = ? WHERE id = ?'),
      'UPDATE'
    );
    stmt.run(title, id);
    res.json({ id, title });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

app.delete('/api/columns/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM columns WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

app.get('/api/tasks', (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*,
        json_group_array(
          CASE WHEN c.id IS NOT NULL THEN json_object(
            'id', c.id,
            'text', c.text,
            'authorId', c.authorId,
            'createdAt', c.createdAt,
            'taskId', t.id
          ) ELSE NULL END
        ) as comments
      FROM tasks t
      LEFT JOIN comments c ON t.id = c.taskId
      GROUP BY t.id
    `).all();

    const processedTasks = tasks.map(task => ({
      ...task,
      comments: JSON.parse(task.comments)
        .filter(Boolean)
        .map(comment => ({
          ...comment,
          attachments: JSON.parse(comment.attachments || '[]')
            .filter(Boolean)
        }))
    }));

    res.json(processedTasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare(`
        INSERT INTO tasks (
          id, title, description, memberId, startDate, 
          effort, columnId, priority, requesterId, boardId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      'INSERT'
    );
    
    stmt.run(
      task.id,
      task.title,
      task.description,
      task.memberId,
      task.startDate,
      task.effort,
      task.columnId,
      task.priority,
      task.requesterId,
      task.boardId
    );
    
    res.json({ ...task, comments: [] });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = req.body;
  
  try {
    const stmt = wrapQuery(
      db.prepare(`
        UPDATE tasks SET 
          title = ?, description = ?, memberId = ?, 
          startDate = ?, effort = ?, columnId = ?, 
          priority = ?, requesterId = ?, boardId = ?
        WHERE id = ?
      `),
      'UPDATE'
    );
    
    stmt.run(
      task.title,
      task.description,
      task.memberId,
      task.startDate,
      task.effort,
      task.columnId,
      task.priority,
      task.requesterId,
      task.boardId,
      id
    );
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = wrapQuery(
      db.prepare('DELETE FROM tasks WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

const ATTACHMENTS_DIR = join(__dirname, 'attachments');
// Ensure attachments directory exists
try {
  await mkdir(ATTACHMENTS_DIR, { recursive: true });
} catch (error) {
  console.error('Error creating attachments directory:', error);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Add this to serve static files from the attachments directory
app.use('/attachments', express.static(ATTACHMENTS_DIR));

// Add file upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/attachments/${req.file.filename}`;
    res.json({
      id: crypto.randomUUID(),
      name: req.file.originalname,
      url: fileUrl,
      type: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Update the existing comments endpoint
app.post('/api/comments', (req, res) => {
  const comment = req.body;
  
  try {
    // Begin transaction
    db.prepare('BEGIN').run();

    try {
      // Insert comment
      const commentStmt = wrapQuery(
        db.prepare(`
          INSERT INTO comments (id, taskId, text, authorId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `),
        'INSERT'
      );
      
      commentStmt.run(
        comment.id,
        comment.taskId,
        comment.text,
        comment.authorId,
        comment.createdAt
      );
      
      // Insert attachments if any
      if (comment.attachments?.length > 0) {
        const attachmentStmt = wrapQuery(
          db.prepare(`
            INSERT INTO attachments (id, commentId, name, url, type, size)
            VALUES (?, ?, ?, ?, ?, ?)
          `),
          'INSERT'
        );
        
        comment.attachments.forEach(attachment => {
          attachmentStmt.run(
            attachment.id,
            comment.id,
            attachment.name,
            attachment.url,
            attachment.type,
            attachment.size
          );
        });
      }

      // Commit transaction
      db.prepare('COMMIT').run();
      res.json(comment);
    } catch (error) {
      // Rollback on error
      db.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Add comment deletion endpoint with file cleanup
app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get attachments before deleting the comment
    const attachmentsStmt = wrapQuery(
      db.prepare('SELECT url FROM attachments WHERE commentId = ?'),
      'SELECT'
    );
    const attachments = attachmentsStmt.all(id);

    // Delete the files from disk
    for (const attachment of attachments) {
      const filePath = join(__dirname, '..', attachment.url);
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete the comment (cascades to attachments)
    const stmt = wrapQuery(
      db.prepare('DELETE FROM comments WHERE id = ?'),
      'DELETE'
    );
    stmt.run(id);

    res.json({ message: 'Comment and attachments deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

app.get('/api/debug/logs', (req, res) => {
  res.json(queryLogs);
});

app.post('/api/debug/logs/clear', (req, res) => {
  queryLogs.length = 0;
  res.json({ message: 'Logs cleared successfully' });
});

// New endpoint to fetch comment attachments
app.get('/api/comments/:commentId/attachments', (req, res) => {
  try {
    const attachments = db.prepare(`
      SELECT 
        id,
        name,
        url,
        type,
        size
      FROM attachments
      WHERE commentId = ?
    `).all(req.params.commentId);

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Serve attachment files
app.get('/attachments/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Get the file path from the uploads directory
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).send('File not found');
    }

    // Send the file with proper content type
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error sending file');
      }
    });
    
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).send('Error serving attachment');
  }
});

const PORT = 3222;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
