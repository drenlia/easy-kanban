import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const logs = await db.queryLog.findMany({
        orderBy: { timestamp: 'desc' }
      });
      res.status(200).json(logs);
    } catch (error) {
      console.error('Failed to fetch query logs:', error);
      res.status(500).json({ error: 'Failed to fetch query logs' });
    }
  }
  
  else if (req.method === 'DELETE') {
    try {
      await db.queryLog.deleteMany({});
      res.status(200).json({ message: 'Query logs cleared successfully' });
    } catch (error) {
      console.error('Failed to clear query logs:', error);
      res.status(500).json({ error: 'Failed to clear query logs' });
    }
  }
  
  else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 