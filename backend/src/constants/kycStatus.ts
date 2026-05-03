/** Canonical KYC status values — matches the kycStatus field on User */
export const KYC_STATUS = {
  PENDING:       'PENDING',
  SUBMITTED:     'SUBMITTED',
  APPROVED:      'APPROVED',
  REJECTED:      'REJECTED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;

export type KycStatus = (typeof KYC_STATUS)[keyof typeof KYC_STATUS];

/**
 * ML confidence thresholds for the tiered KYC decision pipeline.
 * Confidence is a 0.0–1.0 cosine-similarity score returned by the face
 * verification ML model.
 *
 *   confidence >= AUTO_APPROVE      → APPROVED
 *   MANUAL_REVIEW <= c < AUTO_APPROVE → MANUAL_REVIEW (admin queue)
 *   confidence <  MANUAL_REVIEW     → REJECTED
 */
export const KYC_CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE:  0.50,
  MANUAL_REVIEW: 0.20,
} as const;

export type KycDecision =
  | { status: typeof KYC_STATUS.APPROVED;      tier: 'auto-approved' }
  | { status: typeof KYC_STATUS.MANUAL_REVIEW; tier: 'manual-review' }
  | { status: typeof KYC_STATUS.REJECTED;      tier: 'auto-rejected' };

/**
 * Resolve a KYC decision from an ML confidence score.
 * Tiered thresholds keep the rule explicit and unit-testable.
 */
export function decideKycFromConfidence(confidence: number): KycDecision {
  if (confidence >= KYC_CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
    return { status: KYC_STATUS.APPROVED, tier: 'auto-approved' };
  }
  if (confidence >= KYC_CONFIDENCE_THRESHOLDS.MANUAL_REVIEW) {
    return { status: KYC_STATUS.MANUAL_REVIEW, tier: 'manual-review' };
  }
  return { status: KYC_STATUS.REJECTED, tier: 'auto-rejected' };
}
