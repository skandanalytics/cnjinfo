const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

const targetMode = (process.argv[2] || '').trim().toLowerCase();

if (!['centralized', 'local'].includes(targetMode)) {
  console.error('\nUsage: node scripts/switch-mode.cjs <centralized|local>\n');
  process.exit(1);
}

console.log(`\nSwitching Foodie application to [${targetMode.toUpperCase()}] mode...\n`);

// 1. Update Frontend .env
const fTargetFile = path.join(FRONTEND_DIR, `.env.${targetMode}`);
const fFallbackFile = path.join(FRONTEND_DIR, `.env.${targetMode}.example`);
const fChosen = fs.existsSync(fTargetFile) ? fTargetFile : fFallbackFile;

if (fs.existsSync(fChosen)) {
  fs.copyFileSync(fChosen, path.join(FRONTEND_DIR, '.env'));
  console.log(` [OK] Updated frontend/.env from ${path.basename(fChosen)}`);
} else {
  console.warn(` [!] Warning: Frontend template for ${targetMode} not found.`);
}

// 2. Update Backend .env
const bTargetFile = path.join(BACKEND_DIR, `.env.${targetMode}`);
const bFallbackFile = path.join(BACKEND_DIR, `.env.${targetMode}.example`);
const bChosen = fs.existsSync(bTargetFile) ? bTargetFile : bFallbackFile;

if (fs.existsSync(bChosen)) {
  fs.copyFileSync(bChosen, path.join(BACKEND_DIR, '.env'));
  console.log(` [OK] Updated backend/.env from ${path.basename(bChosen)}`);
} else {
  console.warn(` [!] Warning: Backend template for ${targetMode} not found.`);
}

console.log('\n' + '='.repeat(64));
console.log(`   FOODIE SWITCHED TO: ${targetMode.toUpperCase()} MODE`);
console.log('='.repeat(64));
if (targetMode === 'centralized') {
  console.log(' > Frontend URL:       http://192.168.150.171:5173');
  console.log(' > Backend API URL:    http://192.168.150.171:8000/api/');
  console.log(' > Target Database:    MySQL on 192.168.150.171:3306 (foodie_db)');
} else {
  console.log(' > Frontend URL:       http://127.0.0.1:5173 (or active LAN IP)');
  console.log(' > Backend API URL:    http://127.0.0.1:8000/api/ (or active LAN IP:8000)');
  console.log(' > Target Database:    MySQL on 127.0.0.1:3306 (foodie_db)');
}
console.log('='.repeat(64) + '\n');
