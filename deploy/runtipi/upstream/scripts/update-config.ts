// Run by Renovate after it changes an image tag in apps/<app>/docker-compose.yml
// (postUpgradeTasks in renovate.json): bun ./scripts/update-config.ts <packageFile> <newVersion> <packageName>
//
// Every image change raises tipi_version and updated_at, which is what makes Runtipi offer the
// update to people who installed the app. `version` follows only the main service's image, so a
// new helper image (busybox) does not change the version shown in the app store.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

type AppConfig = { tipi_version: number; version: string; updated_at: number; [key: string]: unknown };
type Compose = { services: Record<string, { image?: string; "x-runtipi"?: { is_main?: boolean } }> };

export async function updateAppConfig(packageFile: string, newVersion: string, packageName?: string, now = Date.now()) {
  const appDir = path.dirname(packageFile);
  const configPath = path.join(appDir, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf-8")) as AppConfig;
  const compose = parse(await fs.readFile(path.join(appDir, "docker-compose.yml"), "utf-8")) as Compose;

  const main = Object.values(compose.services).find((service) => service["x-runtipi"]?.is_main);
  const mainImage = main?.image ?? "";
  const mainName = mainImage.slice(0, mainImage.lastIndexOf(":"));
  if (main && (!packageName || packageName === mainName) && mainImage === `${mainName}:${newVersion}`) {
    config.version = newVersion;
  }
  config.tipi_version = config.tipi_version + 1;
  config.updated_at = now;

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [packageFile, newVersion, packageName] = process.argv.slice(2);
  if (!packageFile || !newVersion) {
    console.error("Usage: bun ./scripts/update-config.ts <packageFile> <newVersion> [packageName]");
    process.exit(1);
  }
  await updateAppConfig(packageFile, newVersion, packageName);
}
