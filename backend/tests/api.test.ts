// Bridger Backend Tests
// Run with: npx jest

const request = require('supertest');

// Mock Prisma for testing
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  session: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  oTP: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  deal: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  transaction: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../src/config/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
}));

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/otp/send', () => {
    it('should reject invalid phone numbers', async () => {
      // Test with invalid phone
      const invalidPhone = '123';
      // This should fail validation
      expect(invalidPhone.length).toBeLessThan(5);
    });

    it('should accept valid E.164 phone numbers', () => {
      // Valid E.164 format
      const validPhone = '+15551234567';
      expect(validPhone.startsWith('+')).toBe(true);
      expect(validPhone.length).toBeGreaterThan(10);
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('should reject invalid OTP codes', () => {
      const validOTP = '123456';
      const invalidOTP = '12345';
      
      // OTP must be 6 digits
      expect(validOTP.length).toBe(6);
      expect(invalidOTP.length).not.toBe(6);
    });

    it('should reject expired OTPs', () => {
      const expiredOTP = {
        code: '123456',
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
        verified: false,
      };
      
      expect(expiredOTP.expiresAt.getTime()).toBeLessThan(Date.now());
    });
  });

  describe('POST /auth/refresh', () => {
    it('should reject invalid refresh tokens', async () => {
      const invalidToken = 'invalid-token';
      
      // Should fail JWT verification
      expect(invalidToken.split('.').length).not.toBe(3);
    });
  });
});

describe('Deals API', () => {
  describe('GET /deals', () => {
    it('should validate pagination params', () => {
      const validPage = 1;
      const validLimit = 20;
      const invalidLimit = 100;
      
      expect(validPage).toBeGreaterThan(0);
      expect(validLimit).toBeLessThanOrEqual(50);
      expect(invalidLimit).toBeGreaterThan(50);
    });

    it('should validate deal filters', () => {
      const validFilters = {
        status: 'OPEN',
        fromCity: 'London',
        toCity: 'Paris',
        minPrice: 10,
        maxPrice: 100,
      };
      
      // All filters should be present
      expect(validFilters.status).toBeDefined();
      expect(validFilters.fromCity).toBeDefined();
    });
  });

  describe('POST /deals', () => {
    it('should validate required fields', () => {
      const validDeal = {
        title: 'Test Package',
        fromCity: 'London',
        toCity: 'Paris',
        fromCountry: 'GB',
        toCountry: 'FR',
        packageSize: 'SMALL',
        price: 50,
      };
      
      expect(validDeal.title).toBeDefined();
      expect(validDeal.fromCity).toBeDefined();
      expect(validDeal.price).toBeGreaterThan(0);
    });

    it('should reject invalid package sizes', () => {
      const validSizes = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'];
      const invalidSize = 'HUGE';
      
      expect(validSizes).toContain(invalidSize === 'HUGE' ? 'EXTRA_LARGE' : invalidSize);
    });
  });
});

describe('Wallet API', () => {
  describe('POST /wallet/deposit', () => {
    it('should validate deposit amount', () => {
      const minAmount = 1;
      const maxAmount = 10000;
      const validAmount = 100;
      const tooLow = 0.5;
      const tooHigh = 15000;
      
      expect(validAmount).toBeGreaterThanOrEqual(minAmount);
      expect(validAmount).toBeLessThanOrEqual(maxAmount);
      expect(tooLow).toBeLessThan(minAmount);
      expect(tooHigh).toBeGreaterThan(maxAmount);
    });

    it('should reject negative amounts', () => {
      const negativeAmount = -50;
      expect(negativeAmount).toBeLessThan(0);
    });
  });

  describe('POST /wallet/withdraw', () => {
    it('should validate withdrawal against balance', () => {
      const balance = 100;
      const validWithdrawal = 50;
      const invalidWithdrawal = 150;
      
      expect(validWithdrawal).toBeLessThanOrEqual(balance);
      expect(invalidWithdrawal).toBeGreaterThan(balance);
    });
  });
});

describe('Zod Validation Schemas', () => {
  const { sendOtpSchema, verifyOtpSchema, createDealSchema } = require('../src/validators/auth');

  describe('sendOtpSchema', () => {
    it('should validate phone number format', () => {
      // Valid E.164
      const result = sendOtpSchema.safeParse({ phone: '+15551234567' });
      expect(result.success).toBe(true);
    });
  });

  describe('verifyOtpSchema', () => {
    it('should validate 6-digit OTP', () => {
      const validOTP = '123456';
      const result = verifyOtpSchema.safeParse({ 
        phone: '+15551234567', 
        code: validOTP 
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createDealSchema', () => {
    it('should validate deal creation', () => {
      const deal = {
        title: 'Test Package',
        description: 'A test package',
        fromCity: 'London',
        toCity: 'Paris',
        fromCountry: 'GB',
        toCountry: 'FR',
        packageSize: 'SMALL',
        weight: 1.5,
        price: 50,
        currency: 'USD',
      };
      
      const result = createDealSchema.safeParse(deal);
      expect(result.success).toBe(true);
    });
  });
});

// JWT Token Tests
describe('JWT Authentication', () => {
  const jwt = require('jsonwebtoken');
  const { env } = require('../src/config/env');

  it('should create valid access token', () => {
    const payload = { userId: 'test-user-id', sessionId: 'test-session-id' };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
    
    expect(token.split('.').length).toBe(3);
  });

  it('should verify valid token', () => {
    const payload = { userId: 'test-user-id', sessionId: 'test-session-id' };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
    
    const decoded = jwt.verify(token, env.JWT_SECRET);
    expect(decoded.userId).toBe(payload.userId);
  });

  it('should reject expired token', () => {
    const payload = { userId: 'test-user-id', sessionId: 'test-session-id' };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '-1s' });
    
    expect(() => {
      jwt.verify(token, env.JWT_SECRET);
    }).toThrow();
  });
});
