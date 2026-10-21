import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateAppConfig } from "../update-config";

let dir = "";
const compose = (app: string, helper: string) => `services:
  opentodo:
    image: ${app}
    x-runtipi:
      is_main: true
      internal_port: 8080
  opentodo-init:
    image: ${helper}
x-runtipi:
  schema_version: 2
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-config-"));
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ id: "opentodo", version: "0.6.1", tipi_version: 1, updated_at: 1 }));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test("a new OpenTodo image raises the version, tipi_version and updated_at", async () => {
  fs.writeFileSync(path.join(dir, "docker-compose.yml"), compose("ghcr.io/pixari/opentodo:0.9.0", "busybox:1.37.0"));
  const c = await updateAppConfig(path.join(dir, "docker-compose.yml"), "0.9.0", "ghcr.io/pixari/opentodo", 1000);
  expect(c.version).toBe("0.9.0");
  expect(c.tipi_version).toBe(2);
  expect(c.updated_at).toBe(1000);
});

test("a new helper image raises tipi_version but keeps the version", async () => {
  fs.writeFileSync(path.join(dir, "docker-compose.yml"), compose("ghcr.io/pixari/opentodo:0.6.1", "busybox:1.38.0"));
  const c = await updateAppConfig(path.join(dir, "docker-compose.yml"), "1.38.0", "busybox", 1000);
  expect(c.version).toBe("0.6.1");
  expect(c.tipi_version).toBe(2);
});
