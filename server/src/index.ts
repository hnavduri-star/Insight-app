import { createApp } from './app.js';
import { config } from './lib/config.js';

createApp().listen(config.port, () => console.log(`Insight API on http://localhost:${config.port}`));
