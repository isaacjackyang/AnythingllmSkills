import { createApp, loadConfigFromEnv } from "./create_app.js";

const config = loadConfigFromEnv();
const { server, shutdown } = createApp(config);

server.listen(config.port, () => {
  console.log(`Gateway listening on :${config.port}`);
});

process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
