// Démarre le faux moteur et écrit engine.json pour que `psc` (et l'interface) le trouvent.

import { randomBytes } from "node:crypto";
import { DEFAULT_PORT, engineInfoPath, writeEngineInfo } from "../../api/engine-info.ts";
import { startMockEngine } from "./server.ts";

const port = Number(process.env.PLAYSCREEN_PORT ?? DEFAULT_PORT);
const token = process.env.PLAYSCREEN_TOKEN ?? randomBytes(24).toString("hex");

const engine = await startMockEngine({ port, token });
writeEngineInfo({ port: engine.port, token });

console.log(`Faux moteur Playscreen : ${engine.url}`);
console.log(`Infos de connexion écrites dans ${engineInfoPath()}`);

const stop = async () => {
  await engine.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
