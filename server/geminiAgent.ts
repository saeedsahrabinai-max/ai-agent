import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  IntentType,
  ResponseTemplate,
  SentimentAnalysis,
  SentimentType,
} from '../src/types/agent';
import {
  classifyPriorityTier,
  computeLeadPriorityScore,
  interpolateTemplate,
  matchBestTemplate,
} from '../src/utils/agentLogic';

export interface AnalyzeDmRequest {
  handle: string;
  displayName: string;
  company?: string;
  followers: number;
  isVerified: boolean;
  messageText: string;
  conversationHistory?: Array<{ sender: string; text: string }>;
  templates: ResponseTemplate[];
  brandVoiceNotes: string;
  defaultCalendarLink: string;
  highPriorityThreshold: number;
  vipFollowerThreshold: number;
}

export interface AnalyzeDmResponse {
  analysis: SentimentAnalysis;
  priorityScore: number;
  priorityTier: ReturnType<typeof classifyPriorityTier>;
}

const VALID_SENTIMENTS: SentimentType[] = ['positive', 'neutral', 'negative', 'urgent'];
const VALID_INTENTS: IntentType[] = [
  'wholesale_inquiry',
  'purchase_intent',
  'brand_partnership',
  'support_escalation',
  'pricing_question',
  'general_engagement',
];

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to enable AI sentiment analysis.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number; status?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON; fall through
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return 'Gemini API key is invalid or unauthorized. Check Settings > Secrets.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Gemini API rate limit reached. Please wait a moment and try again.';
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return 'The AI model is temporarily experiencing high demand. Please retry in a few seconds.';
  }
  return raw;
}

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('500') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function analyzeDmWithGemini(input: AnalyzeDmRequest): Promise<AnalyzeDmResponse> {
  const ai = createGeminiClient();
  const activeTemplates = input.templates.filter((t) => t.active);

  const templateSummary = activeTemplates
    .map(
      (t) =>
        `- ID: "${t.id}" | Name: "${t.name}" | Intent: ${t.intent} | Sentiments: [${t.sentiments.join(', ')}] | Body: "${t.body}"`
    )
    .join('\n');

  const historyContext = (input.conversationHistory ?? [])
    .slice(-5)
    .map((m) => `${m.sender.toUpperCase()}: ${m.text}`)
    .join('\n');

  const prompt = [
    `Analyze the following Instagram Direct Message for lead triage, sentiment analysis, and templated response drafting.`,
    ``,
    `Lead Profile:`,
    `- Name: ${input.displayName}`,
    `- Handle: ${input.handle}`,
    `- Company: ${input.company || 'Not specified'}`,
    `- Followers: ${input.followers}`,
    `- Verified Account: ${input.isVerified ? 'Yes' : 'No'}`,
    ``,
    historyContext ? `Recent Thread History:\n${historyContext}\n` : '',
    `Latest Inbound DM:\n"${input.messageText}"`,
    ``,
    `Available Active Response Templates:`,
    templateSummary || '(No active templates configured)',
    ``,
    `Brand Voice Notes: ${input.brandVoiceNotes}`,
    `Default Calendar Link: ${input.defaultCalendarLink}`,
    ``,
    `Instructions:`,
    `1. Classify sentiment strictly as one of: positive, neutral, negative, urgent.`,
    `2. Provide polarityScore from -1.0 (very negative) to 1.0 (very positive), and confidence from 0.0 to 1.0.`,
    `3. Classify intent strictly as one of: wholesale_inquiry, purchase_intent, brand_partnership, support_escalation, pricing_question, general_engagement.`,
    `4. Extract 1 to 4 concise detectedSignals (concrete commercial or urgency facts from the message, e.g. order volume, deadline, order ID, creator reach).`,
    `5. Estimate potential deal value in USD as an integer (0 if purely community engagement or support without revenue risk).`,
    `6. Choose recommendedTemplateId from the active template IDs listed above (or empty string if none fit).`,
    `7. Draft suggestedReply by adapting the chosen template naturally to the lead's exact message and name, filling all placeholders cleanly (do not leave raw {{...}} tokens). Keep it concise (2-4 sentences) and ready to send on Instagram DM.`,
  ].join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      sentiment: {
        type: Type.STRING,
        description: 'One of: positive, neutral, negative, urgent',
      },
      polarityScore: {
        type: Type.NUMBER,
        description: 'Sentiment polarity from -1.0 to 1.0',
      },
      confidence: {
        type: Type.NUMBER,
        description: 'Confidence score from 0.0 to 1.0',
      },
      toneSummary: {
        type: Type.STRING,
        description: 'One concise sentence summarizing emotional tone and urgency.',
      },
      intent: {
        type: Type.STRING,
        description:
          'One of: wholesale_inquiry, purchase_intent, brand_partnership, support_escalation, pricing_question, general_engagement',
      },
      detectedSignals: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '1 to 4 short factual lead or urgency signals extracted from the DM.',
      },
      estimatedDealValue: {
        type: Type.INTEGER,
        description: 'Estimated deal value in USD, or 0 if not commercial.',
      },
      recommendedTemplateId: {
        type: Type.STRING,
        description: 'Exact ID of the best matching template from the provided list.',
      },
      suggestedReply: {
        type: Type.STRING,
        description: 'Personalized, ready-to-send Instagram DM reply adapted from the chosen template.',
      },
    },
    required: [
      'sentiment',
      'polarityScore',
      'confidence',
      'toneSummary',
      'intent',
      'detectedSignals',
      'estimatedDealValue',
      'recommendedTemplateId',
      'suggestedReply',
    ],
  };

  let modelName = 'gemini-4-hydrogen';
  let response;

  try {
    response = await callWithRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              'You are a precision Instagram DM triage and customer sentiment analyst for a social commerce and B2B retail brand. Return valid structured JSON matching the schema.',
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
      1
    );
  } catch (primaryErr) {
    if (!isTransientError(primaryErr)) {
      throw new Error(formatGeminiError(primaryErr));
    }
    // Retry with Gemini 3.1 Flash Lite when primary model has transient 503 demand spike
    modelName = 'gemini-3.1-flash-lite';
    try {
      response = await callWithRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
              systemInstruction:
                'You are a precision Instagram DM triage and customer sentiment analyst for a social commerce and B2B retail brand. Return valid structured JSON matching the schema.',
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        1
      );
    } catch (fallbackErr) {
      throw new Error(formatGeminiError(fallbackErr));
    }
  }

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty analysis payload.');
  }

  const parsed = JSON.parse(rawText) as {
    sentiment?: string;
    polarityScore?: number;
    confidence?: number;
    toneSummary?: string;
    intent?: string;
    detectedSignals?: string[];
    estimatedDealValue?: number;
    recommendedTemplateId?: string;
    suggestedReply?: string;
  };

  const sentiment: SentimentType = VALID_SENTIMENTS.includes(parsed.sentiment as SentimentType)
    ? (parsed.sentiment as SentimentType)
    : 'neutral';
  const intent: IntentType = VALID_INTENTS.includes(parsed.intent as IntentType)
    ? (parsed.intent as IntentType)
    : 'general_engagement';

  const detectedSignals = Array.isArray(parsed.detectedSignals)
    ? parsed.detectedSignals
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 5)
    : [];

  const estimatedDealValue =
    typeof parsed.estimatedDealValue === 'number' && Number.isFinite(parsed.estimatedDealValue)
      ? Math.max(0, Math.round(parsed.estimatedDealValue))
      : 0;

  const priorityScore = computeLeadPriorityScore({
    intent,
    sentiment,
    followers: input.followers,
    isVerified: input.isVerified,
    detectedSignals,
    estimatedDealValue,
    vipFollowerThreshold: input.vipFollowerThreshold,
  });

  const priorityTier = classifyPriorityTier(priorityScore, input.highPriorityThreshold);

  const exactTemplate = activeTemplates.find((t) => t.id === parsed.recommendedTemplateId) ?? null;
  const matchedTemplate =
    exactTemplate ?? matchBestTemplate(activeTemplates, intent, sentiment, priorityTier);

  const suggestedReply =
    typeof parsed.suggestedReply === 'string' && parsed.suggestedReply.trim().length > 0
      ? parsed.suggestedReply.trim()
      : matchedTemplate
        ? interpolateTemplate(matchedTemplate.body, {
            name: input.displayName,
            handle: input.handle,
            company: input.company,
            calendar_link: input.defaultCalendarLink,
          })
        : `Hi ${input.displayName.split(' ')[0] || 'there'}, thanks for reaching out! We received your message and will follow up shortly.`;

  const polarityScore =
    typeof parsed.polarityScore === 'number' && Number.isFinite(parsed.polarityScore)
      ? Math.max(-1, Math.min(1, Number(parsed.polarityScore.toFixed(2))))
      : 0;

  const confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, Number(parsed.confidence.toFixed(2))))
      : 0.85;

  return {
    priorityScore,
    priorityTier,
    analysis: {
      sentiment,
      polarityScore,
      confidence,
      toneSummary:
        typeof parsed.toneSummary === 'string' && parsed.toneSummary.trim().length > 0
          ? parsed.toneSummary.trim()
          : 'Inbound message analyzed for sentiment and lead intent.',
      intent,
      detectedSignals,
      estimatedDealValue: estimatedDealValue > 0 ? estimatedDealValue : undefined,
      recommendedTemplateId: matchedTemplate?.id ?? null,
      suggestedReply,
      analyzedAt: new Date().toISOString(),
      modelUsed: modelName,
    },
  };
}
