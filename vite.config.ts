import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "fcbb0de0-c639-4cfb-92e4-6fccf3b9ed5b";

const { d1, r2 } = hostingConfig;

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // Clean application routes such as /signin are served by the Worker from
  // the compiled static shell. Explicitly expose the asset fetcher binding;
  // a directory-only assets configuration bypasses the Worker for physical
  // files but does not make env.ASSETS available at runtime.
  assets: {
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: [
      "/api/*",
      "/_vinext/image",
      "/hyslides",
      "/hyslides/*",
    ],
  },
  durable_objects: {
    bindings: [{ name: "LIVE_HUB", class_name: "LiveSessionHub" }],
  },
  migrations: [
    { tag: "v1-live-session-hub", new_sqlite_classes: ["LiveSessionHub"] },
  ],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig({
  plugins: [
    vinext(),
    sites(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }),
  ],
});
