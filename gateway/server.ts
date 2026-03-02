import { createApp, loadConfigFromEnv } from "./create_app.js";
const config = loadConfigFromEnv();
const { server, shutdown } = createApp(config);
server.listen(config.port, (): string => {
    console.log(`Gateway listening on :${config.port}`);
    return "";
});
process.on("SIGTERM", (): string => String(void shutdown().then(() => process.exit(0))));
process.on("SIGINT", (): string => String(void shutdown().then(() => process.exit(0))));
