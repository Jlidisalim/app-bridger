import { z } from 'zod';
import { normalizePhone } from '../utils/phone';

// Auth validators
export const sendOtpSchema = z.object({
  phone: z.string().refine(
    (val) => {
      try {
        normalizePhone(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid phone number format' }
  ),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({});

// User validators
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
  profilePhoto: z.string().url().optional(),
});

export const updatePushTokenSchema = z.object({
  pushToken: z.string().min(1),
});

export const kycSubmitSchema = z.object({
  idFront: z.any(), // Will be handled by multer
  idBack: z.any(),
  selfie: z.any(),
});

// Deal validators
export const createDealSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  fromCity: z.string().min(2).max(50),
  toCity: z.string().min(2).max(50),
  fromCountry: z.string().max(50).default(''),
  toCountry: z.string().max(50).default(''),
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
  packageSize: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']),
  isFragile: z.boolean().default(false),
  itemValue: z.number().min(0).optional(),
  weight: z.number().positive().max(50).optional(),
  price: z.number().min(0).max(10000),
  currency: z.string().length(3).default('USD'),
  pickupDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  images: z.array(z.string()).max(10).optional(),
  receiverName: z.string().min(2).max(100).optional(),
  receiverPhone: z.string().max(20).optional(),
});

export const updateDealSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().max(10000).optional(),
  pickupDate: z.string().optional(),
  deliveryDate: z.string().optional(),
});

export const dealFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['OPEN', 'MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED']).optional(),
  fromCity: z.string().optional(),
  toCity: z.string().optional(),
  fromCountry: z.string().optional(),
  toCountry: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  packageSize: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']).optional(),
  sortBy: z.enum(['createdAt', 'price', 'pickupDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Wallet validators
export const depositSchema = z.object({
  amount: z.number().positive().min(1).max(10000),
  currency: z.string().length(3).default('USD'),
});

export const withdrawSchema = z.object({
  amount: z.number().positive().min(1),
});

export const walletFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'PAYMENT', 'REFUND']).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
});

// Chat validators
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  type: z.enum(['TEXT', 'IMAGE']).default('TEXT'),
  replyToId: z.string().optional(),
});

export const chatFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Notification validators
export const notificationFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

// QR validators
export const verifyQRSchema = z.object({
  qrPayload: z.string().min(1),
});

// Trip validators
export const createTripSchema = z.object({
  fromCity: z.string().min(2).max(50),
  toCity: z.string().min(2).max(50),
  fromCountry: z.string().max(50).default(''),
  toCountry: z.string().max(50).default(''),
  departureDate: z.string().optional().transform((v) => {
    if (!v) return undefined;
    // Accept full ISO timestamps or date-only strings (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00.000Z').toISOString();
    return new Date(v).toISOString();
  }),
  departureTime: z.string().max(20).optional(),
  flightNumber: z.string().max(20).optional(),
  maxWeight: z.number().positive().max(50).default(1.0),
  price: z.number().min(0).max(10000),
  currency: z.string().length(3).default('USD'),
  negotiable: z.boolean().default(false),
});

export const updateTripSchema = z.object({
  fromCity: z.string().min(2).max(50).optional(),
  toCity: z.string().min(2).max(50).optional(),
  fromCountry: z.string().max(50).optional(),
  toCountry: z.string().max(50).optional(),
  departureDate: z.string().optional().transform((v) => {
    if (!v) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00.000Z').toISOString();
    return new Date(v).toISOString();
  }),
  departureTime: z.string().max(20).optional(),
  flightNumber: z.string().max(20).optional(),
  maxWeight: z.number().positive().max(50).optional(),
  price: z.number().positive().max(10000).optional(),
  currency: z.string().length(3).optional(),
  negotiable: z.boolean().optional(),
});

// Dispute validators
export const createDisputeSchema = z.object({
  dealId: z.string().min(1),
  reason: z.string().min(10).max(2000),
});

export const submitEvidenceSchema = z.object({
  evidence: z.union([
    z.string().min(1).max(5000),
    z.array(z.string().min(1).max(5000)).min(1).max(10),
  ]),
});

// Review validators
export const createReviewSchema = z.object({
  dealId: z.string().min(1),
  targetId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// Notification settings validators
export const updateNotificationSettingsSchema = z.object({
  deals: z.boolean().optional(),
  messages: z.boolean().optional(),
  payments: z.boolean().optional(),
  promotions: z.boolean().optional(),
});

// Search validators
export const searchDealsSchema = z.object({
  query: z.string().min(1).max(200),
  filters: z.record(z.unknown()).optional(),
});

export const searchUsersSchema = z.object({
  query: z.string().min(1).max(200),
});
