import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Packages Sites metadata and migrations after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const hyslidesOutputDirectories = [
        resolve(root, "dist", "client", "hyslides"),
        resolve(root, "dist", "server", "public", "hyslides"),
      ];
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");
      const hyslidesFiles = [
        ["index.html", "index.html"],
        ["styles.css", "styles.css"],
        ["src", "src"],
      ];

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      for (const output of hyslidesOutputDirectories) {
        await rm(output, { recursive: true, force: true });
        await mkdir(output, { recursive: true });
      }

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
          recursive: true,
        });
      }
      for (const output of hyslidesOutputDirectories) {
        for (const [source, target] of hyslidesFiles) {
          const sourcePath = resolve(root, source);
          if (await exists(sourcePath)) {
            await cp(sourcePath, resolve(output, target), {
              recursive: true,
            });
          }
        }
      }
    },
  };
}
