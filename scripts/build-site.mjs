import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const webDir = resolve(root, "web");
const compiledSrcDir = resolve(root, "dist", "src");
const siteDir = resolve(root, "site");
const siteAssetsDir = resolve(siteDir, "assets");

await rm(siteDir, { recursive: true, force: true });
await mkdir(siteAssetsDir, { recursive: true });

await cp(webDir, siteDir, {
  recursive: true,
  filter(source) {
    return !source.endsWith(".DS_Store");
  }
});

await cp(compiledSrcDir, siteAssetsDir, {
  recursive: true,
  filter(source) {
    return !source.endsWith(".DS_Store");
  }
});
