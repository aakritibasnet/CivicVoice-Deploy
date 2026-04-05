import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const envDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({
    path: resolve(envDir, "../../.env"),
});
