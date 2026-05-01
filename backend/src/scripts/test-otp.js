/**
 * OTP Diagnostic Test Script
 * Run: node backend/src/scripts/test-otp.js
 * 
 * Tests each component of the OTP flow to identify where it fails
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  verifySid: process.env.TWILIO_VERIFY_SERVICE_SID,
  whatsappProvider: process.env.WHATSAPP_PROVIDER || 'twilio',
};

console.log('DEBUG: TWILIO_ACCOUNT_SID =', process.env.TWILIO_ACCOUNT_SID);
console.log('DEBUG: TWILIO_AUTH_TOKEN =', process.env.TWILIO_AUTH_TOKEN ? '(set)' : '(missing)');
console.log('DEBUG: WHATSAPP_PROVIDER =', process.env.WHATSAPP_PROVIDER);

const TEST_PHONE = process.env.TEST_PHONE || '+447911123456';

async function testTwilioCredentials() {
  console.log('\n=== Test 1: Twilio Credentials ===');
  if (!CONFIG.accountSid || !CONFIG.authToken) {
    console.log('❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    return false;
  }
  if (CONFIG.accountSid.startsWith('ACxxxxxx')) {
    console.log('❌ TWILIO_ACCOUNT_SID is still placeholder (ACxxxxxx)');
    return false;
  }
  try {
    const { default: twilio } = await import('twilio');
    const client = twilio(CONFIG.accountSid, CONFIG.authToken);
    const account = await client.api.accounts(CONFIG.accountSid).fetch();
    console.log(`✅ Twilio credentials valid. Account: ${account.friendlyName || account.sid}`);
    return true;
  } catch (err) {
    console.log(`❌ Twilio auth failed: ${err.message}`);
    return false;
  }
}

async function testTwilioVerify() {
  console.log('\n=== Test 2: Twilio Verify API ===');
  if (!CONFIG.verifySid) {
    console.log('⚠️  TWILIO_VERIFY_SERVICE_SID not set - using fallback (DB-based OTP)');
    return null;
  }
  try {
    const { default: twilio } = await import('twilio');
    const client = twilio(CONFIG.accountSid, CONFIG.authToken);
    const verification = await client.verify.v2
      .services(CONFIG.verifySid)
      .verifications.create({ to: TEST_PHONE, channel: 'sms' });
    console.log(`✅ Verify SMS sent. Status: ${verification.status}`);
    return verification;
  } catch (err) {
    console.log(`❌ Verify API failed: ${err.message}`);
    if (err.code === 20003) {
      console.log('   → Error 20003: Authentication failure - check TWILIO_AUTH_TOKEN');
    }
    if (err.code === 20404) {
      console.log('   → Error 20404: Verify Service SID not found');
    }
    return null;
  }
}

async function testTwilioWhatsApp() {
  console.log('\n=== Test 3: Twilio WhatsApp ===');
  if (CONFIG.whatsappProvider !== 'twilio') {
    console.log(`⚠️  WhatsApp provider is "${CONFIG.whatsappProvider}", skipping Twilio test`);
    return null;
  }
  try {
    const { default: twilio } = await import('twilio');
    const client = twilio(CONFIG.accountSid, CONFIG.authToken);
    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    const message = await client.messages.create({
      body: 'Test message from Bridger diagnostic',
      from,
      to: `whatsapp:${TEST_PHONE}`,
    });
    console.log(`✅ WhatsApp sent. SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.log(`❌ WhatsApp failed: ${err.message}`);
    if (err.code === 20003) {
      console.log('   → Error 20003: Authentication failure - check TWILIO_AUTH_TOKEN');
    }
    if (err.code === 21608) {
      console.log('   → Error 21608: WhatsApp number not provisioned');
    }
    return null;
  }
}

async function testRedisConnection() {
  console.log('\n=== Test 4: Redis Connection ===');
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
  });
  
  try {
    await redis.connect();
    await redis.set('test_key', 'test_value');
    const value = await redis.get('test_key');
    await redis.del('test_key');
    console.log('✅ Redis connected and working');
    await redis.quit();
    return true;
  } catch (err) {
    console.log(`❌ Redis failed: ${err.message}`);
    return false;
  }
}

async function testBackendApi() {
  console.log('\n=== Test 5: Backend OTP Endpoint ===');
  try {
    const response = await fetch('http://localhost:4000/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (response.ok) {
      console.log(`✅ OTP sent. Response: ${JSON.stringify(data)}`);
      return data;
    } else {
      console.log(`❌ Backend error (${response.status}): ${JSON.stringify(data)}`);
      return null;
    }
  } catch (err) {
    console.log(`❌ Backend request failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 OTP Diagnostic Test');
  console.log('======================');
  console.log(`Test phone: ${TEST_PHONE}`);
  console.log(`WhatsApp provider: ${CONFIG.whatsappProvider}`);
  
  const results = {
    twilioCredentials: await testTwilioCredentials(),
    redis: await testRedisConnection(),
    whatsapp: await testTwilioWhatsApp(),  // Added this test
    backend: await testBackendApi(),
  };

  console.log('\n======================');
  console.log('SUMMARY');
  console.log('======================');
  
  if (!results.twilioCredentials) {
    console.log('❌ Twilio credentials are invalid or missing');
    console.log('   → Fix in backend/.env: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  }
  
  if (!results.redis) {
    console.log('⚠️  Redis not available - rate limiting will use in-memory fallback');
  }
  
  if (!results.whatsapp) {
    console.log('❌ WhatsApp sending failed - check TWILIO_WHATSAPP_FROM and Twilio console');
  }
  
  if (!results.backend) {
    console.log('❌ Backend OTP endpoint failed');
    console.log('   → Check if backend is running on port 4000');
  } else if (results.backend.code) {
    console.log('✅ Using DB-based OTP (dev mode) - code returned in response');
    console.log('   → Set NODE_ENV=production to hide code from response');
  } else {
    console.log('✅ Using Twilio Verify (code sent via SMS/WhatsApp)');
  }
  
  console.log('\n=== Possible Issues When Switching WiFi ===');
  console.log('1. WebSocket connection drops - reconnect automatically');
  console.log('2. IP change may affect rate limiting (if using IP-based)');
  console.log('3. DNS resolution may fail temporarily');
  console.log('4. Server may see different IP → triggers new rate limit window');
  console.log('\n=== Solutions ===');
  console.log('1. In app: Add retry logic with exponential backoff for network changes');
  console.log('2. Use phone-based rate limiting (already implemented with Redis)');
  console.log('3. Clear DNS cache or wait 30s after switching networks');
  console.log('4. Ensure backend uses phone-based (not IP-based) rate limiting');
}

main().catch(console.error);
