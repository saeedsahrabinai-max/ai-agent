import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { INITIAL_WORKSPACE_STATE } from './src/data/seedData';
import type {
  CrmConnector,
  CrmSyncRecord,
  LeadThread,
  ResponseTemplate,
  WorkspaceState,
} from './src/types/agent';
import { analyzeDmWithGemini } from './server/geminiAgent';
import { resolveAndValidateWebhookUrl, sanitizeShortString } from './server/security';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const WORKSPACE_FILE = path.resolve(DATA_DIR, 'workspace.json');

let workspaceCache: WorkspaceState = structuredClone(INITIAL_WORKSPACE_STATE);

async function loadWorkspaceFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(WORKSPACE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as WorkspaceState;
    if (
      parsed &&
      Array.isArray(parsed.threads) &&
      Array.isArray(parsed.templates) &&
      Array.isArray(parsed.connectors) &&
      Array.isArray(parsed.syncLogs) &&
      parsed.settings
    ) {
      workspaceCache = parsed;
    }
  } catch {
    workspaceCache = structuredClone(INITIAL_WORKSPACE_STATE);
  }
}

async function saveWorkspaceToDisk(state: WorkspaceState): Promise<void> {
  workspaceCache = state;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = path.resolve(DATA_DIR, `workspace.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tempPath, WORKSPACE_FILE);
}

function buildCrmPayload(thread: LeadThread, connector: CrmConnector): Record<string, unknown> {
  const latestMessage = thread.messages[thread.messages.length - 1]?.text ?? '';
  const sourceValues: Record<string, unknown> = {
    'lead.handle': thread.handle,
    'lead.displayName': thread.displayName,
    'lead.priorityScore': thread.priorityScore,
    'lead.followers': thread.followers,
    'analysis.sentiment': thread.analysis.sentiment,
    'analysis.intent': thread.analysis.intent,
    'analysis.toneSummary': thread.analysis.toneSummary,
    'analysis.estimatedDealValue': thread.analysis.estimatedDealValue ?? 0,
    'messages.latest': latestMessage,
    lead: {
      handle: thread.handle,
      displayName: thread.displayName,
      company: thread.company ?? null,
      followers: thread.followers,
      priorityScore: thread.priorityScore,
      priorityTier: thread.priorityTier,
    },
    analysis: {
      sentiment: thread.analysis.sentiment,
      polarityScore: thread.analysis.polarityScore,
      intent: thread.analysis.intent,
      signals: thread.analysis.detectedSignals,
    },
  };

  const mapped: Record<string, unknown> = {
    provider: connector.id,
    object: connector.objectType,
    synced_at: new Date().toISOString(),
  };

  for (const mapping of connector.fieldMappings) {
    if (!mapping.enabled) continue;
    mapped[mapping.targetField] = sourceValues[mapping.sourceField] ?? null;
  }

  return mapped;
}

async function startServer() {
  await loadWorkspaceFromDisk();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Workspace state persistence API
  app.get('/api/workspace', (_req, res) => {
    res.json({
      workspace: workspaceCache,
      serverCapabilities: {
        geminiConfigured:
          Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
        crmEnvWebhookConfigured: Boolean(process.env.CRM_WEBHOOK_URL),
        instagramWebhookPath: '/api/webhooks/instagram',
      },
    });
  });

  app.put('/api/workspace', async (req, res) => {
    try {
      const body = req.body as Partial<WorkspaceState>;
      if (
        !body ||
        !Array.isArray(body.threads) ||
        !Array.isArray(body.templates) ||
        !Array.isArray(body.connectors) ||
        !Array.isArray(body.syncLogs) ||
        !body.settings
      ) {
        return res.status(400).json({ error: 'Invalid workspace payload.' });
      }
      await saveWorkspaceToDisk(body as WorkspaceState);
      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save workspace state.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/workspace/reset', async (_req, res) => {
    try {
      const fresh = structuredClone(INITIAL_WORKSPACE_STATE);
      await saveWorkspaceToDisk(fresh);
      return res.json({ workspace: fresh });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset workspace.';
      return res.status(500).json({ error: message });
    }
  });

  // Real Gemini AI sentiment analysis & templated DM drafting
  app.post('/api/agent/analyze', async (req, res) => {
    try {
      const body = req.body as {
        handle?: unknown;
        displayName?: unknown;
        company?: unknown;
        followers?: unknown;
        isVerified?: unknown;
        messageText?: unknown;
        conversationHistory?: Array<{ sender: string; text: string }>;
        templates?: ResponseTemplate[];
        brandVoiceNotes?: unknown;
        defaultCalendarLink?: unknown;
        highPriorityThreshold?: unknown;
        vipFollowerThreshold?: unknown;
      };

      const messageText = sanitizeShortString(body.messageText, 4000);
      if (!messageText) {
        return res.status(400).json({ error: 'Message text is required for AI sentiment analysis.' });
      }

      const handle = sanitizeShortString(body.handle, 80, '@instagram_user');
      const displayName = sanitizeShortString(body.displayName, 120, handle.replace(/^@/, ''));
      const company = sanitizeShortString(body.company, 120);
      const followers =
        typeof body.followers === 'number' && Number.isFinite(body.followers)
          ? Math.max(0, Math.min(500_000_000, Math.round(body.followers)))
          : 0;
      const isVerified = Boolean(body.isVerified);
      const templates = Array.isArray(body.templates)
        ? body.templates.slice(0, 50)
        : workspaceCache.templates;

      const result = await analyzeDmWithGemini({
        handle,
        displayName,
        company: company || undefined,
        followers,
        isVerified,
        messageText,
        conversationHistory: Array.isArray(body.conversationHistory)
          ? body.conversationHistory.slice(-6)
          : [],
        templates,
        brandVoiceNotes: sanitizeShortString(
          body.brandVoiceNotes,
          600,
          workspaceCache.settings.brandVoiceNotes
        ),
        defaultCalendarLink: sanitizeShortString(
          body.defaultCalendarLink,
          300,
          workspaceCache.settings.defaultCalendarLink
        ),
        highPriorityThreshold:
          typeof body.highPriorityThreshold === 'number'
            ? body.highPriorityThreshold
            : workspaceCache.settings.highPriorityThreshold,
        vipFollowerThreshold:
          typeof body.vipFollowerThreshold === 'number'
            ? body.vipFollowerThreshold
            : workspaceCache.settings.vipFollowerThreshold,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI sentiment analysis failed.';
      const status =
        message.includes('GEMINI_API_KEY') || message.includes('API_KEY_INVALID') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  // External CRM Synchronization endpoint (with SSRF defense for live webhooks + verified sandbox delivery)
  app.post('/api/crm/sync', async (req, res) => {
    try {
      const body = req.body as {
        thread?: LeadThread;
        connector?: CrmConnector;
      };

      if (!body?.thread || !body?.connector) {
        return res.status(400).json({ error: 'Both thread and connector details are required.' });
      }

      const { thread, connector } = body;
      const payload = buildCrmPayload(thread, connector);
      const targetUrl =
        sanitizeShortString(connector.webhookUrl, 2048) ||
        sanitizeShortString(process.env.CRM_WEBHOOK_URL, 2048);

      const prefixMap: Record<string, string> = {
        hubspot: 'hs_deal',
        salesforce: 'sf_lead',
        pipedrive: 'pd_deal',
        custom_webhook: 'wh_evt',
      };
      const externalRecordId = `${prefixMap[connector.id] ?? 'crm'}_${crypto.randomBytes(4).toString('hex')}`;

      if (targetUrl) {
        const validation = await resolveAndValidateWebhookUrl(targetUrl);
        if (!validation.valid || !validation.normalizedUrl) {
          return res.status(400).json({
            error: `Blocked CRM webhook URL: ${validation.reason}`,
          });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Threadline-CRM-Sync/1.0',
          };
          if (process.env.CRM_BEARER_TOKEN) {
            headers.Authorization = `Bearer ${process.env.CRM_BEARER_TOKEN}`;
          }

          const upstream = await fetch(validation.normalizedUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            redirect: 'error',
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const syncRecord: CrmSyncRecord = {
            id: `sync_${crypto.randomBytes(4).toString('hex')}`,
            threadId: thread.id,
            leadHandle: thread.handle,
            leadName: thread.displayName,
            providerId: connector.id,
            providerName: connector.name,
            priorityScore: thread.priorityScore,
            sentiment: thread.analysis.sentiment,
            status: upstream.ok ? 'delivered' : 'failed',
            httpStatus: upstream.status,
            externalRecordId,
            timestamp: new Date().toISOString(),
            payloadPreview: payload,
            errorMessage: upstream.ok ? undefined : `Remote endpoint returned HTTP ${upstream.status}`,
          };

          return res.status(upstream.ok ? 200 : 502).json({ syncRecord });
        } catch (fetchErr) {
          clearTimeout(timeout);
          const errMsg =
            fetchErr instanceof Error ? fetchErr.message : 'Outbound webhook delivery failed.';
          const failedRecord: CrmSyncRecord = {
            id: `sync_${crypto.randomBytes(4).toString('hex')}`,
            threadId: thread.id,
            leadHandle: thread.handle,
            leadName: thread.displayName,
            providerId: connector.id,
            providerName: connector.name,
            priorityScore: thread.priorityScore,
            sentiment: thread.analysis.sentiment,
            status: 'failed',
            httpStatus: 502,
            externalRecordId,
            timestamp: new Date().toISOString(),
            payloadPreview: payload,
            errorMessage: errMsg,
          };
          return res.status(502).json({ syncRecord: failedRecord, error: errMsg });
        }
      }

      // Sandbox delivery mode when no external webhook URL is configured
      const sandboxRecord: CrmSyncRecord = {
        id: `sync_${crypto.randomBytes(4).toString('hex')}`,
        threadId: thread.id,
        leadHandle: thread.handle,
        leadName: thread.displayName,
        providerId: connector.id,
        providerName: connector.name,
        priorityScore: thread.priorityScore,
        sentiment: thread.analysis.sentiment,
        status: 'sandbox_delivered',
        httpStatus: 200,
        externalRecordId,
        timestamp: new Date().toISOString(),
        payloadPreview: payload,
      };

      return res.json({ syncRecord: sandboxRecord });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CRM sync failed.';
      return res.status(500).json({ error: message });
    }
  });

  // Real Meta / Instagram Graph API Webhook verification endpoint
  app.get('/api/webhooks/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = process.env.INSTAGRAM_VERIFY_TOKEN;

    if (mode === 'subscribe' && expectedToken && token === expectedToken && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({
      error: 'Webhook verification failed. Set INSTAGRAM_VERIFY_TOKEN in server environment variables.',
    });
  });

  app.post('/api/webhooks/instagram', (req, res) => {
    const entry = req.body?.entry;
    if (!Array.isArray(entry)) {
      return res.status(400).json({ error: 'Invalid Instagram webhook payload.' });
    }
    return res.status(200).json({ received: true, events: entry.length });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Threadline server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Threadline server:', err);
  process.exit(1);
});
