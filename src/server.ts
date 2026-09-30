import { buildApp } from "./app.js";
import { loadDotEnv, loadEnv } from "./config/env.js";

loadDotEnv();

const env = loadEnv();
const app = buildApp(env);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`listening on ${address}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
