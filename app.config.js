const os = require('os');

function getLocalIp() {
  const nets = os.networkInterfaces();
  const priority = ['en0', 'en1', 'wlan0', 'eth0'];
  // Try preferred interfaces first
  for (const name of priority) {
    const iface = nets[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  // Fallback: any non-internal IPv4
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

const localIp       = process.env.EXPO_PUBLIC_API_IP || getLocalIp();
const apiUrl        = process.env.EXPO_PUBLIC_API_URL        || `http://${localIp}:4000`;
const baileysUrl    = process.env.EXPO_PUBLIC_BAILEYS_URL    || `http://${localIp}:3001`;
const appJson       = require('./app.json');

console.log(`[app.config.js] API URL     → ${apiUrl}`);
console.log(`[app.config.js] Baileys URL → ${baileysUrl}`);

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    apiUrl,
    baileysServerUrl: baileysUrl,
    stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
};
