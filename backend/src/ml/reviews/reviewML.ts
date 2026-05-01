/**
 * MODULE C — REVIEW SENTIMENT & FRAUD DETECTION ML
 *
 * Goal A: Sentiment classification
 *   Primary:  Python ML service → cardiffnlp/twitter-xlm-roberta-base-sentiment
 *             (multilingual: English, French, Arabic)
 *   Fallback: Local Naive Bayes classifier (40 training samples)
 *
 * Goal B: Rule-based fraud scorer → flagScore 0–1
 *
 * No changes to fraud detection rules — they remain in TypeScript.
 */

import config from '../../config/env';
import { prisma } from '../../config/db';
import logger from '../../utils/logger';

// ── Python sentiment proxy ─────────────────────────────────────────────────
async function getSentimentFromPython(
  text: string,
  rating?: number
): Promise<{ label: string; score: number; isFraud: boolean } | null> {
  try {
    const res = await fetch(`${config.mlService.url}/predict/sentiment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rating }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      label: string;
      score: number;
      is_potentially_fraudulent: boolean;
    };
    return {
      label: data.label.toLowerCase(),
      score: data.score,
      isFraud: data.is_potentially_fraudulent,
    };
  } catch {
    return null;
  }
}

// ── Naive Bayes Sentiment Classifier ──────────────────────────────────────

interface ClassVocab {
  wordCounts: Map<string, number>;
  totalWords: number;
  docCount: number;
}

class NaiveBayesClassifier {
  private classes: Map<string, ClassVocab> = new Map();
  private totalDocs = 0;
  private vocabulary = new Set<string>();

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, ' ')   // keep Arabic Unicode range
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  train(text: string, label: string): void {
    const tokens = this.tokenize(text);
    if (!this.classes.has(label)) {
      this.classes.set(label, { wordCounts: new Map(), totalWords: 0, docCount: 0 });
    }
    const cls = this.classes.get(label)!;
    cls.docCount++;
    this.totalDocs++;
    for (const token of tokens) {
      cls.wordCounts.set(token, (cls.wordCounts.get(token) ?? 0) + 1);
      cls.totalWords++;
      this.vocabulary.add(token);
    }
  }

  predict(text: string): { label: string; confidence: number; scores: Record<string, number> } {
    const tokens = this.tokenize(text);
    const vocabSize = this.vocabulary.size || 1;
    const scores: Record<string, number> = {};

    for (const [label, cls] of this.classes) {
      // Log-space to avoid underflow
      let logProb = Math.log(cls.docCount / (this.totalDocs || 1));
      for (const token of tokens) {
        // Laplace (add-1) smoothing
        const count = cls.wordCounts.get(token) ?? 0;
        logProb += Math.log((count + 1) / (cls.totalWords + vocabSize));
      }
      scores[label] = logProb;
    }

    // Softmax to get probabilities
    const maxScore = Math.max(...Object.values(scores));
    const exps: Record<string, number> = {};
    let sumExp = 0;
    for (const [k, v] of Object.entries(scores)) {
      exps[k] = Math.exp(v - maxScore);
      sumExp += exps[k];
    }
    const probs: Record<string, number> = {};
    for (const k of Object.keys(exps)) probs[k] = exps[k] / sumExp;

    const best = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
    return { label: best[0], confidence: Math.round(best[1] * 100) / 100, scores: probs };
  }

  isTrained(): boolean {
    return this.totalDocs > 0;
  }
}

const classifier = new NaiveBayesClassifier();

// ── Training examples ──────────────────────────────────────────────────────
// English, French, and transliterated Arabic (Darija/Standard)

const TRAINING_DATA: [string, 'positive' | 'negative' | 'neutral'][] = [
  // ── POSITIVE ──
  ['excellent service very fast delivery on time thank you', 'positive'],
  ['great traveler very reliable trustworthy highly recommend', 'positive'],
  ['amazing experience package arrived safe and sound', 'positive'],
  ['super fast merci beaucoup très sérieux', 'positive'],
  ['parfait livraison rapide je recommande vivement', 'positive'],
  ['très professionnel gentil ponctuel merci', 'positive'],
  ['bonne communication rapide et fiable excellent', 'positive'],
  ['wonderful traveler careful with the package five stars', 'positive'],
  ['best delivery experience ever will use again', 'positive'],
  ['mrahba bih chokran bzaf khidma momtaza', 'positive'],
  ['service 3ali mezyan wakha merci', 'positive'],
  ['trustworthy honest person great communication packaging safe', 'positive'],
  ['quick response professional delivery loved the experience', 'positive'],
  ['arrived earlier than expected package in perfect condition', 'positive'],
  ['highly recommended super fast no problems whatsoever', 'positive'],
  ['très rapide très professionnel colis bien emballé', 'positive'],
  ['top service fiable et rapide merci encore', 'positive'],
  ['صح راجل ثقة وسريع خدمة ممتازة شكرا', 'positive'],
  ['great communication easy process smooth delivery', 'positive'],
  ['everything went perfectly no issues at all amazing', 'positive'],

  // ── NEGATIVE ──
  ['terrible service package arrived broken very disappointed', 'negative'],
  ['late delivery no communication very unreliable avoid', 'negative'],
  ['worst experience ever lost my package no refund scam', 'negative'],
  ['horrible he broke my items and disappeared unprofessional', 'negative'],
  ['très déçu colis abîmé en retard sans communication', 'negative'],
  ['arnaque ne répond plus aux messages évitez absolument', 'negative'],
  ['mauvaise expérience colis perdu pas de remboursement', 'negative'],
  ['very rude person did not follow instructions bad', 'negative'],
  ['package missing dishonest traveler do not trust', 'negative'],
  ['mashia tay3aqqed bezzaf man7ech nosi7', 'negative'],
  ['disappointed very bad experience would not recommend at all', 'negative'],
  ['arrived 5 days late package damaged poor service', 'negative'],
  ['dishonest never again complete scammer avoid avoid', 'negative'],
  ['a volé mon colis menteur escroc arnaque totale', 'negative'],
  ['مسكين خسارة مشكل بزاف راه ما يستاهلش', 'negative'],
  ['no response ghosted me after taking payment fraud', 'negative'],
  ['unprofessional careless attitude refused to cooperate', 'negative'],
  ['lies told me it was delivered but nothing arrived', 'negative'],
  ['rude and inconsiderate terrible experience zero stars', 'negative'],
  ['colis endommagé voyage annulé sans prévenir honteux', 'negative'],

  // ── NEUTRAL ──
  ['ok delivery nothing special average service', 'neutral'],
  ['correct mais peut mieux faire', 'neutral'],
  ['package arrived on time nothing exceptional', 'neutral'],
  ['normale livraison correcte', 'neutral'],
  ['delivery was fine average experience', 'neutral'],
  ['acceptable service could be better', 'neutral'],
  ['ok moyen pas terrible pas excellent', 'neutral'],
  ['delivered as promised nothing more nothing less', 'neutral'],
  ['medium experience some delays but resolved', 'neutral'],
  ['mashi bezzaf w mashi khayeb', 'neutral'],
];

// ── Bootstrap classifier ───────────────────────────────────────────────────
export function initReviewClassifier(): void {
  for (const [text, label] of TRAINING_DATA) {
    classifier.train(text, label);
  }
  logger.info('Review sentiment classifier trained', {
    module: 'reviews',
    examples: TRAINING_DATA.length,
  });

  // Augment from DB asynchronously — do not block startup
  retrainFromDatabase().catch((e) =>
    logger.warn('DB review augmentation failed (non-blocking)', { module: 'reviews', error: String(e) })
  );
}

/**
 * Load approved DB reviews that have a sentiment label and use them to
 * augment the in-memory classifier. Safe to call multiple times (add-only).
 */
export async function retrainFromDatabase(): Promise<{ added: number }> {
  const dbReviews = await prisma.review.findMany({
    where: {
      status: 'approved',
      sentiment: { not: null },
      comment: { not: null },
    },
    select: { comment: true, sentiment: true },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  let added = 0;
  for (const r of dbReviews) {
    if (r.comment && r.sentiment &&
        ['positive', 'neutral', 'negative'].includes(r.sentiment)) {
      classifier.train(r.comment, r.sentiment as 'positive' | 'neutral' | 'negative');
      added++;
    }
  }

  logger.info('Review classifier augmented from DB', { module: 'reviews', added });
  return { added };
}

// ── Fraud detection ────────────────────────────────────────────────────────

export interface FraudSignal {
  signal: string;
  weight: number;
}

async function detectFraud(
  userId: string,
  targetId: string,
  rating: number,
  comment: string | undefined,
  accountCreatedAt: Date
): Promise<{ fraudScore: number; signals: FraudSignal[] }> {
  const signals: FraudSignal[] = [];
  let score = 0;

  // Rule 1: Same user reviewed same target more than twice in 24 hours
  const recent24h = await prisma.review.count({
    where: {
      authorId: userId,
      targetId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent24h >= 2) {
    signals.push({ signal: 'Duplicate reviews within 24h', weight: 0.6 });
    score += 0.6;
  }

  // Rule 2: Review text too short but extreme rating
  const textLen = (comment ?? '').trim().length;
  if (textLen < 5 && (rating === 1 || rating === 5)) {
    signals.push({ signal: 'Extreme rating with no comment', weight: 0.35 });
    score += 0.35;
  }

  // Rule 3: Account younger than 3 days
  const accountAgeDays = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < 3) {
    signals.push({ signal: 'New account (< 3 days old)', weight: 0.25 });
    score += 0.25;
  }

  // Rule 4: Burst of negative reviews against same target in 48h
  const negativesBurst = await prisma.review.count({
    where: {
      targetId,
      rating: { lte: 2 },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });
  if (negativesBurst >= 3) {
    signals.push({ signal: 'Coordinated low-rating burst on target', weight: 0.5 });
    score += 0.5;
  }

  // Rule 5: Reviewer has submitted >10 reviews in 24h (bot-like)
  const authorBurst = await prisma.review.count({
    where: {
      authorId: userId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (authorBurst >= 10) {
    signals.push({ signal: 'Reviewer posting at bot-like frequency', weight: 0.45 });
    score += 0.45;
  }

  return { fraudScore: Math.min(Math.round(score * 100) / 100, 1.0), signals };
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface ReviewAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentConfidence: number;
  fraudScore: number;
  flagged: boolean;
  status: 'approved' | 'pending_moderation';
  reason: string | null;
  signals: FraudSignal[];
}

export async function analyzeReview(params: {
  reviewText: string | undefined;
  rating: number;
  userId: string;
  targetId: string;
}): Promise<ReviewAnalysis> {
  const { reviewText, rating, userId, targetId } = params;

  // Sentiment — try Python ML service first, fallback to local Naive Bayes
  const text = reviewText ?? '';
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  let sentimentConfidence = 0.5;

  if (text.trim().length > 0) {
    const pythonSentiment = await getSentimentFromPython(text, rating);

    if (pythonSentiment) {
      sentiment = pythonSentiment.label as 'positive' | 'neutral' | 'negative';
      sentimentConfidence = pythonSentiment.score;
    } else if (classifier.isTrained()) {
      // Local Naive Bayes fallback
      const result = classifier.predict(text);
      sentiment = result.label as 'positive' | 'neutral' | 'negative';
      sentimentConfidence = result.confidence;
    }
  } else {
    // No text — infer from rating
    sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
    sentimentConfidence = 0.6;
  }

  // Contradiction check: very positive text + 1-star (suspicious)
  if (sentiment === 'positive' && rating <= 2) sentimentConfidence *= 0.6;
  if (sentiment === 'negative' && rating >= 4) sentimentConfidence *= 0.6;

  // Fraud
  const authorUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  const { fraudScore, signals } = await detectFraud(
    userId, targetId, rating, reviewText,
    authorUser?.createdAt ?? new Date()
  );

  // Flag if fraud score >= 0.4 OR contradiction detected with high confidence
  const contradictionFlagged = Math.abs(
    (sentiment === 'positive' ? 1 : sentiment === 'negative' ? -1 : 0) -
    (rating >= 4 ? 1 : rating <= 2 ? -1 : 0)
  ) === 2 && sentimentConfidence > 0.7;

  const flagged = fraudScore >= 0.4 || contradictionFlagged;
  const status: 'approved' | 'pending_moderation' = flagged ? 'pending_moderation' : 'approved';

  let reason: string | null = null;
  if (signals.length > 0) reason = signals.map(s => s.signal).join('; ');
  if (contradictionFlagged) reason = (reason ? reason + '; ' : '') + 'Sentiment contradicts rating';

  logger.info('Review analyzed', {
    module: 'reviews',
    userId,
    sentiment,
    fraudScore,
    flagged,
  });

  return {
    sentiment,
    sentimentConfidence: Math.round(sentimentConfidence * 100) / 100,
    fraudScore,
    flagged,
    status,
    reason,
    signals,
  };
}

/** Self-test */
export function selfTest(): boolean {
  try {
    if (!classifier.isTrained()) return false;
    const r = classifier.predict('excellent service very fast');
    return r.label === 'positive' && r.confidence > 0.3;
  } catch {
    return false;
  }
}
