// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler lives in src/app.js, registered
// before connect() (the SDK requires it).
//
// The Gladys supervisor provides GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR and TZ: `new GladysIntegration()` reads them.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createBridge } from './src/bridge.js';
import { createStore } from './src/store.js';

const gladys = new GladysIntegration();
const app = createApp(gladys, {
  bridge: createBridge({ logger }),
  store: createStore(undefined, logger),
  logger,
});

gladys.handleShutdown(() => app.stop());

await gladys.connect();
app.start();
