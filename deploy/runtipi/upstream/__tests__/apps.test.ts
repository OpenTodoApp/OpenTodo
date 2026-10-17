import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { appInfoSchema } from "@runtipi/common/schemas";
import { type } from "arktype";
import { parse } from "yaml";

// The checks Runtipi's own app store runs (runtipi/runtipi-appstore apps/__tests__), for apps
// written as a native docker-compose.yml with x-runtipi (schema_version 2).

const appsDir = path.join(process.cwd(), "apps");
const apps = fs.readdirSync(appsDir).filter((app) => fs.statSync(path.join(appsDir, app)).isDirectory());
const read = (app: string, file: string) => {
  const p = path.join(appsDir, app, file);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
};

// The shape Runtipi 4.7+ accepts for a native docker-compose.yml (packages/common/src/schemas/compose-yaml.ts
// in runtipi/runtipi). @runtipi/common 1.1.3 on npm still ships an older draft of it that requires
// x-runtipi.overrides, so it is restated here.
const service = type({
  image: "string",
  "x-runtipi?": { "is_main?": "boolean", "internal_port?": "number | string", "add_to_main_network?": "boolean" },
  "networks?": type({ "[string]": "unknown" }).or("string[]"),
  "ports?": "unknown[]",
  "labels?": type({ "[string]": "string | number | boolean" }).or("string[]"),
});
const composeSchema = type({
  services: type({ "[string]": service }),
  "networks?": type({ "[string]": "unknown" }),
  "x-runtipi": {
    schema_version: "1 | 2",
    "overrides?": type({ architecture: "'arm64' | 'amd64'", services: type({ "[string]": "object" }) }).array(),
  },
});

type Compose = {
  services: Record<string, { image?: string; "x-runtipi"?: { is_main?: boolean; internal_port?: number } }>;
  "x-runtipi"?: { schema_version?: number };
};

test("the store has at least one app", () => {
  expect(apps.length).toBeGreaterThan(0);
});

for (const app of apps) {
  describe(app, () => {
    for (const file of ["config.json", "docker-compose.yml", "metadata/logo.jpg", "metadata/description.md"]) {
      test(`has ${file}`, () => {
        expect(read(app, file)).not.toBeNull();
      });
    }

    const config = JSON.parse(read(app, "config.json") ?? "{}");
    const compose = parse(read(app, "docker-compose.yml") ?? "services: {}") as Compose;

    test("config.json is valid", () => {
      const parsed = appInfoSchema.omit("urn")(config);
      if (parsed instanceof type.errors) console.error(`${app}/config.json: ${parsed.summary}`);
      expect(parsed instanceof type.errors).toBe(false);
    });

    test("the id is the folder name", () => {
      expect(config.id).toBe(app);
    });

    test("tipi_version, created_at and updated_at are set and in the past", () => {
      expect(config.tipi_version).toBeGreaterThan(0);
      for (const key of ["created_at", "updated_at"]) {
        expect(config[key]).toBeGreaterThan(0);
        expect(config[key]).toBeLessThan(Date.now());
        expect(new Date(config[key]).getFullYear()).toBeGreaterThanOrEqual(2023);
      }
    });

    test("docker-compose.yml is valid", () => {
      const parsed = composeSchema(compose);
      if (parsed instanceof type.errors) console.error(`${app}/docker-compose.yml: ${parsed.summary}`);
      expect(parsed instanceof type.errors).toBe(false);
      expect(compose["x-runtipi"]?.schema_version).toBe(2);
    });

    test("the main service is named after the app and its image carries the version", () => {
      const main = compose.services[app];
      expect(main).toBeDefined();
      expect(main?.["x-runtipi"]?.is_main).toBe(true);
      expect(typeof main?.["x-runtipi"]?.internal_port).toBe("number");
      const mains = Object.values(compose.services).filter((s) => s["x-runtipi"]?.is_main);
      expect(mains.length).toBe(1);
      const tag = main?.image?.split(":")[1];
      expect(tag).toContain(config.version);
    });

    test("random form fields are not required", () => {
      for (const field of config.form_fields ?? []) {
        if (field.type === "random") expect(Boolean(field.required)).toBe(false);
      }
    });
  });
}

test("every app has its own port and id", () => {
  const configs = apps.map((app) => JSON.parse(read(app, "config.json") ?? "{}"));
  const ports = configs.map((c) => c.port).filter(Boolean);
  expect(new Set(ports).size).toBe(ports.length);
  expect(new Set(configs.map((c) => c.id)).size).toBe(configs.length);
});
