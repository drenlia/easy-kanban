/**
 * User Dev credentials: personal access tokens + dedicated SSH keypair (AI-gated).
 */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticateToken } from '../middleware/auth.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { requireAiEnabledMiddleware } from '../utils/aiEnabled.js';
import {
  userApiTokens as tokenQueries,
  userSshKeys as sshQueries
} from '../utils/sqlManager/index.js';
import {
  generateEd25519SshKeyPair,
  encryptSecret,
  decryptSecret
} from '../utils/sshKeyCrypto.js';
import { tokenMintLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
const requireAi = requireAiEnabledMiddleware(getRequestDatabase);

function serializeToken(row) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at
  };
}

// List tokens
router.get('/tokens', authenticateToken, requireAi, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const rows = await tokenQueries.listTokensForUser(db, req.user.id);
    res.json(rows.map(serializeToken));
  } catch (error) {
    console.error('List API tokens error:', error);
    res.status(500).json({ error: 'Failed to list API tokens' });
  }
});

// Create token (raw value returned once)
router.post('/tokens', authenticateToken, requireAi, tokenMintLimiter, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const name = (req.body?.name || 'Agent API token').toString().slice(0, 100);
    const rawToken = `ek_${crypto.randomBytes(32).toString('hex')}`;
    const tokenPrefix = rawToken.slice(0, 11);
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const id = crypto.randomUUID();

    const row = await tokenQueries.createToken(db, {
      id,
      userId: req.user.id,
      name,
      tokenPrefix,
      tokenHash
    });

    res.status(201).json({
      token: serializeToken(row),
      rawToken
    });
  } catch (error) {
    console.error('Create API token error:', error);
    res.status(500).json({ error: 'Failed to create API token' });
  }
});

// Revoke token
router.delete('/tokens/:id', authenticateToken, requireAi, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const revoked = await tokenQueries.revokeToken(db, req.params.id, req.user.id);
    if (!revoked) {
      return res.status(404).json({ error: 'Token not found or already revoked' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke API token error:', error);
    res.status(500).json({ error: 'Failed to revoke API token' });
  }
});

// SSH key metadata (public only)
router.get('/ssh-key', authenticateToken, requireAi, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const row = await sshQueries.getSshKeyMeta(db, req.user.id);
    if (!row) {
      return res.json({ key: null });
    }
    res.json({
      key: {
        publicKey: row.public_key,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error('Get SSH key error:', error);
    res.status(500).json({ error: 'Failed to get SSH key' });
  }
});

// Generate or regenerate SSH keypair
router.post('/ssh-key', authenticateToken, requireAi, tokenMintLimiter, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { publicKey, privateKey, fingerprint } = generateEd25519SshKeyPair(
      `easy-kanban-agent-${req.user.id.slice(0, 8)}`
    );
    const privateKeyEncrypted = encryptSecret(privateKey);
    const row = await sshQueries.upsertSshKey(db, {
      userId: req.user.id,
      publicKey,
      privateKeyEncrypted,
      fingerprint
    });

    res.status(201).json({
      key: {
        publicKey: row.public_key,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      // Private key returned once on generate for immediate download
      privateKey
    });
  } catch (error) {
    console.error('Generate SSH key error:', error);
    res.status(500).json({ error: 'Failed to generate SSH key' });
  }
});

// Download private key (owner only)
router.get('/ssh-key/private', authenticateToken, requireAi, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const row = await sshQueries.getSshKeyWithPrivate(db, req.user.id);
    if (!row) {
      return res.status(404).json({ error: 'No SSH key found. Generate one first.' });
    }
    const privateKey = decryptSecret(row.private_key_encrypted);
    res.json({ privateKey, fingerprint: row.fingerprint });
  } catch (error) {
    console.error('Download SSH private key error:', error);
    res.status(500).json({ error: 'Failed to download private key' });
  }
});

export default router;
