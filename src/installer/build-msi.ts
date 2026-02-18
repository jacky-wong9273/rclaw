/**
 * Windows MSI Build Script
 *
 * Generates the WiX source (.wxs) and optionally compiles the MSI.
 *
 * Usage:
 *   node --import tsx src/installer/build-msi.ts           # Generate .wxs only
 *   node --import tsx src/installer/build-msi.ts --compile  # Generate + compile MSI
 *
 * Prerequisites:
 *   - WiX Toolset v4+ (dotnet tool install --global wix)
 *   - Built dist/ output (pnpm build)
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { getDefaultMsiConfig, generateWxs } from "./msi-config.js";

const ROOT = resolve(import.meta.dirname, "../..");
const INSTALLER_DIR = join(ROOT, "installer");
const DIST_DIR = join(ROOT, "dist");

function getVersion(): string {
  const pkg = JSON.parse(
    // Read version from package.json
    require("node:fs").readFileSync(join(ROOT, "package.json"), "utf8"),
  );
  return pkg.version;
}

function main() {
  const args = process.argv.slice(2);
  const shouldCompile = args.includes("--compile");

  console.log("[msi] Reading version from package.json...");
  const version = getVersion();
  console.log(`[msi] Version: ${version}`);

  // Ensure installer output directory exists
  if (!existsSync(INSTALLER_DIR)) {
    mkdirSync(INSTALLER_DIR, { recursive: true });
  }

  // Generate WiX configuration
  console.log("[msi] Generating MSI configuration...");
  const config = getDefaultMsiConfig(version);
  const wxsContent = generateWxs(config);

  const wxsPath = join(INSTALLER_DIR, "rclaw.wxs");
  writeFileSync(wxsPath, wxsContent, "utf8");
  console.log(`[msi] WiX source written to: ${wxsPath}`);

  if (shouldCompile) {
    console.log("[msi] Compiling MSI...");
    try {
      const msiPath = join(DIST_DIR, "RClaw-Setup.msi");
      execSync(`wix build "${wxsPath}" -o "${msiPath}"`, {
        cwd: ROOT,
        stdio: "inherit",
      });
      console.log(`[msi] MSI created: ${msiPath}`);
    } catch (err) {
      console.error("[msi] MSI compilation failed. Ensure WiX Toolset v4+ is installed.");
      console.error("[msi] Install: dotnet tool install --global wix");
      process.exit(1);
    }
  } else {
    console.log("[msi] Skipping compilation (use --compile to build the MSI).");
    console.log("[msi] To compile manually:");
    console.log(`  wix build "${wxsPath}" -o dist/RClaw-Setup.msi`);
  }
}

main();
