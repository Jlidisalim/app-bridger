/** Canonical KYC status values — matches the kycStatus field on User */
export const KYC_STATUS = {
  PENDING:   'PENDING',
  SUBMITTED: 'SUBMITTED',
  APPROVED:  'APPROVED',
  REJECTED:  'REJECTED',
} as const;

export type KycStatus = (typeof KYC_STATUS)[keyof typeof KYC_STATUS];
