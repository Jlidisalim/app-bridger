import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'STRIPE_PUBLISHABLE_KEY is required'),

  // Cloudinary (optional — images are now saved locally in uploads/)
  CLOUDINARY_URL: z.string().optional(),

  // Server public URL used to build absolute URLs for uploaded files
  SERVER_URL: z.string().url().optional(),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().min(1, 'GOOGLE_MAPS_API_KEY is required'),

  // Push Notifications
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // WhatsApp / Baileys
  WHATSAPP_SESSION_PATH: z.string().default('./sessions'),
  BAILEYS_URL: z.string().url('BAILEYS_URL must be a valid URL'),
  BAILEYS_API_KEY: z.string().min(16, 'BAILEYS_API_KEY must be at least 16 characters'),

  // QR Code signing
  QR_SECRET: z.string().min(32, 'QR_SECRET must be at least 32 characters'),

  // ML / Face Service
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),

  // Twilio (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(), // SMS-capable number; defaults to TWILIO_PHONE_NUMBER

  // Admin account
  ADMIN_PHONE: z.string().optional(),      // phone number seeded as the first admin, e.g. +21626901747

  // Admin alerts (optional)
  ADMIN_EMAIL: z.string().email().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(3),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string()
    .default('http://localhost:3000,http://localhost:8081')
    .refine(
      (val) => {
        const nodeEnv = process.env.NODE_ENV || 'development';
        // Wildcard '*' is never acceptable in production
        if (nodeEnv === 'production' && val.includes('*')) {
          return false;
        }
        return true;
      },
      { message: 'ALLOWED_ORIGINS must not contain wildcards (*) in production' }
    ),
  SENTRY_DSN: z.string().optional(),

  // Redis (optional — baileys-server uses in-memory fallback when absent)
  REDIS_URL: z.string().optional(),

  // Face Verification Service
  FACE_SERVICE_URL: z.string().default('http://localhost:8001'),

  // OpenSky Network (flight tracking)
  OPENSKY_CLIENT_ID: z.string().optional(),
  OPENSKY_CLIENT_SECRET: z.string().optional(),
  OPENSKY_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
  OPENSKY_GPS_LOSS_THRESHOLD_MS: z.coerce.number().default(120_000),
});

export type EnvConfig = z.infer<typeof envSchema>;

let env: EnvConfig;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Environment validation failed:', error.errors);
    process.exit(1);
  }
  throw error;
}

export const config = {
  // Database
  databaseUrl: env.DATABASE_URL,

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    expiry: env.JWT_EXPIRY,
    refreshExpiry: env.JWT_REFRESH_EXPIRY,
  },

  // Stripe
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  },

  // Cloudinary (kept for reference but no longer used for uploads)
  cloudinary: {
    url: env.CLOUDINARY_URL,
  },

  // Google Maps
  googleMaps: {
    apiKey: env.GOOGLE_MAPS_API_KEY,
  },

  // Push Notifications
  expo: {
    accessToken: env.EXPO_ACCESS_TOKEN,
  },

  // WhatsApp
  whatsapp: {
    sessionPath: env.WHATSAPP_SESSION_PATH,
  },

  // OTP
  otp: {
    expiryMinutes: env.OTP_EXPIRY_MINUTES,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    rateLimitWindowMs: env.OTP_RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.OTP_RATE_LIMIT_MAX,
  },

  // Server
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    allowedOrigins: env.ALLOWED_ORIGINS.split(','),
    sentryDsn: env.SENTRY_DSN,
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
  },

  // Face Verification + ML
  faceService: {
    url: env.FACE_SERVICE_URL,
  },
  mlService: {
    url: env.ML_SERVICE_URL,
  },

  // Baileys
  baileys: {
    url: env.BAILEYS_URL,
    apiKey: env.BAILEYS_API_KEY,
  },

  // QR
  qr: {
    secret: env.QR_SECRET,
  },

  // Twilio
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
  },

  // Admin
  admin: {
    phone: env.ADMIN_PHONE,
    email: env.ADMIN_EMAIL,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
  },

  // OpenSky Network
  opensky: {
    clientId: env.OPENSKY_CLIENT_ID,
    clientSecret: env.OPENSKY_CLIENT_SECRET,
    pollIntervalMs: env.OPENSKY_POLL_INTERVAL_MS,
    gpsLossThresholdMs: env.OPENSKY_GPS_LOSS_THRESHOLD_MS,
  },
};

export default config;
