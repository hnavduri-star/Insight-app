import { createApp } from './app.js';
import { config } from './lib/config.js';
import { startReminderLoop } from './lib/push.js';

createApp().listen(config.port, () => console.log(`Insight API on http://localhost:${config.port}`));
startReminderLoop();
