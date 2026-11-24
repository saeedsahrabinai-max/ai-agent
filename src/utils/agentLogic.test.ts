import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPriorityTier,
  computeLeadPriorityScore,
  computeWorkspaceMetrics,
  filterAndSortThreads,
  interpolateTemplate,
  matchBestTemplate,
} from './agentLogic';
import { INITIAL_WORKSPACE_STATE } from '../data/seedData';

test('computeLeadPriorityScore prioritizes wholesale VIP leads over casual engagement', () => {
  const vipWholesale = computeLeadPriorityScore({
    intent: 'wholesale_inquiry',
    sentiment: 'positive',
    followers: 85000,
    isVerified: true,
    detectedSignals: ['500 units', 'Q4 launch', 'retail buyer'],
    estimatedDealValue: 18500,
    vipFollowerThreshold: 25000,
  });

  const casualComment = computeLeadPriorityScore({
    intent: 'general_engagement',
    sentiment: 'neutral',
    followers: 420,
    isVerified: false,
    detectedSignals: [],
    estimatedDealValue: 0,
    vipFollowerThreshold: 25000,
  });

  assert.ok(vipWholesale >= 90, `Expected VIP wholesale score >= 90, got ${vipWholesale}`);
  assert.ok(casualComment <= 25, `Expected casual comment score <= 25, got ${casualComment}`);
  assert.equal(classifyPriorityTier(vipWholesale, 70), 'critical');
  assert.equal(classifyPriorityTier(casualComment, 70), 'low');
});

test('computeLeadPriorityScore clamps output strictly between 0 and 100', () => {
  const maxed = computeLeadPriorityScore({
    intent: 'wholesale_inquiry',
    sentiment: 'urgent',
    followers: 2_500_000,
    isVerified: true,
    detectedSignals: ['a', 'b', 'c', 'd', 'e', 'f'],
    estimatedDealValue: 999999,
  });
  assert.equal(maxed, 100);
});

test('interpolateTemplate replaces placeholders and normalizes Instagram handles', () => {
  const result = interpolateTemplate(
    'Hi {{name}} ({{handle}}), thanks for reaching out about {{topic}}! Book here: {{calendar_link}} {{unknown_var}}',
    {
      name: 'Maya Chen',
      handle: 'mayastudio',
      topic: 'Q4 retail assortment',
      calendar_link: 'https://cal.example.com/vip',
    }
  );

  assert.equal(
    result,
    'Hi Maya (@mayastudio), thanks for reaching out about Q4 retail assortment! Book here: https://cal.example.com/vip '
  );
});

test('matchBestTemplate selects highest-affinity active template for intent and sentiment', () => {
  const templates = INITIAL_WORKSPACE_STATE.templates;

  const wholesaleMatch = matchBestTemplate(templates, 'wholesale_inquiry', 'positive', 'critical');
  assert.equal(wholesaleMatch?.id, 'tpl-wholesale-vip');

  const escalationMatch = matchBestTemplate(templates, 'support_escalation', 'urgent', 'critical');
  assert.equal(escalationMatch?.id, 'tpl-urgent-recovery');

  // Inactive templates must be ignored
  const disabledTemplates = templates.map((t) =>
    t.id === 'tpl-wholesale-vip' ? { ...t, active: false } : t
  );
  const fallbackMatch = matchBestTemplate(disabledTemplates, 'wholesale_inquiry', 'positive', 'critical');
  assert.notEqual(fallbackMatch?.id, 'tpl-wholesale-vip');
});

test('filterAndSortThreads ranks by priority score descending and respects segmented filters', () => {
  const sorted = filterAndSortThreads(INITIAL_WORKSPACE_STATE.threads, {
    searchQuery: '',
    filter: 'all',
    sortBy: 'priority',
    highPriorityThreshold: 70,
  });

  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      sorted[i - 1].priorityScore >= sorted[i].priorityScore,
      'Threads must be sorted in descending priorityScore order'
    );
  }

  const highOnly = filterAndSortThreads(INITIAL_WORKSPACE_STATE.threads, {
    searchQuery: '',
    filter: 'high_priority',
    sortBy: 'priority',
    highPriorityThreshold: 70,
  });
  assert.ok(highOnly.length > 0);
  assert.ok(highOnly.every((t) => t.priorityScore >= 70));

  const searchResult = filterAndSortThreads(INITIAL_WORKSPACE_STATE.threads, {
    searchQuery: 'nordic',
    filter: 'all',
    sortBy: 'priority',
    highPriorityThreshold: 70,
  });
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].handle, '@maya.nordichome');
});

test('computeWorkspaceMetrics computes accurate live totals from state', () => {
  const metrics = computeWorkspaceMetrics(
    INITIAL_WORKSPACE_STATE.threads,
    INITIAL_WORKSPACE_STATE.syncLogs,
    70
  );

  assert.equal(metrics.totalThreads, INITIAL_WORKSPACE_STATE.threads.length);
  assert.equal(
    metrics.sentimentBreakdown.positive +
      metrics.sentimentBreakdown.neutral +
      metrics.sentimentBreakdown.negative +
      metrics.sentimentBreakdown.urgent,
    INITIAL_WORKSPACE_STATE.threads.length
  );
  assert.ok(metrics.highPriorityCount >= 3);
  assert.ok(metrics.totalEstimatedPipeline > 0);
});
