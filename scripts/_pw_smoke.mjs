import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
console.log('CHROMIUM_OK');
await b.close();
