#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const overlayRoot = path.join(geckoRoot, "overlay");
const repositoryRoot = path.resolve(geckoRoot, "..");

function usage() {
  console.log(`Usage: node gecko/scripts/sync-overlay.mjs --checkout-dir <path>

Options:
  --checkout-dir <path>  Target Gecko source checkout directory
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.checkoutDir) {
    throw new Error("Missing required --checkout-dir argument.");
  }

  return options;
}

function ensureDirectory(targetDirectory) {
  mkdirSync(targetDirectory, { recursive: true });
}

function removeFileIfPresent(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  rmSync(targetPath, { force: true });
  console.log(`removed stale file: ${path.relative(repositoryRoot, targetPath)}`);
}

function copyDirectory(sourceDirectory, targetDirectory) {
  ensureDirectory(targetDirectory);

  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    cpSync(sourcePath, targetPath, { force: true });
  }
}

function patchFile(filePath, marker, patcher) {
  const original = readFileSync(filePath, "utf8");
  const next = patcher(original);

  if (next === original) {
    return false;
  }

  writeFileSync(filePath, next, "utf8");
  console.log(`patched ${marker}: ${path.relative(repositoryRoot, filePath)}`);
  return true;
}

function ensureUnofficialBrandingPatched(checkoutDir) {
  const configurePath = path.join(checkoutDir, "browser", "branding", "unofficial", "configure.sh");
  const brandFtlPath = path.join(checkoutDir, "browser", "branding", "unofficial", "locales", "en-US", "brand.ftl");
  const brandPropertiesPath = path.join(
    checkoutDir,
    "browser",
    "branding",
    "unofficial",
    "locales",
    "en-US",
    "brand.properties"
  );
  const brandingPrefsPath = path.join(checkoutDir, "browser", "branding", "unofficial", "pref", "firefox-branding.js");

  patchFile(configurePath, "browser/branding/unofficial/configure.sh nodely identity", (contents) => {
    let next = contents.replace("MOZ_APP_DISPLAYNAME=Nightly", 'MOZ_APP_DISPLAYNAME=Nodely');

    if (!next.includes("MOZ_APP_REMOTINGNAME=")) {
      next += "\nMOZ_APP_REMOTINGNAME=nodely\n";
    } else {
      next = next.replace(/^MOZ_APP_REMOTINGNAME=.*$/mu, "MOZ_APP_REMOTINGNAME=nodely");
    }

    if (!next.includes("MOZ_MACBUNDLE_ID=")) {
      next += "MOZ_MACBUNDLE_ID=org.nodely.browser\n";
    } else {
      next = next.replace(/^MOZ_MACBUNDLE_ID=.*$/mu, "MOZ_MACBUNDLE_ID=org.nodely.browser");
    }

    return next;
  });

  patchFile(brandFtlPath, "browser/branding/unofficial/locales/en-US/brand.ftl nodely identity", (contents) => {
    let next = contents;
    next = next.replace("-brand-shorter-name = Nightly", "-brand-shorter-name = Nodely");
    next = next.replace("-brand-short-name = Nightly", "-brand-short-name = Nodely");
    next = next.replace("-brand-shortcut-name = Nightly", "-brand-shortcut-name = Nodely");
    next = next.replace("-brand-full-name = Nightly", "-brand-full-name = Nodely Browser");
    next = next.replace("-brand-product-name = Firefox", "-brand-product-name = Nodely");
    next = next.replace("-vendor-short-name = Mozilla", "-vendor-short-name = Nodely");
    return next;
  });

  patchFile(
    brandPropertiesPath,
    "browser/branding/unofficial/locales/en-US/brand.properties nodely identity",
    (contents) =>
      contents
        .replace("brandShorterName=Nightly", "brandShorterName=Nodely")
        .replace("brandShortName=Nightly", "brandShortName=Nodely")
        .replace("brandFullName=Nightly", "brandFullName=Nodely Browser")
  );

  patchFile(brandingPrefsPath, "browser/branding/unofficial/pref/firefox-branding.js nodely update urls", (contents) => {
    let next = contents;
    next = next.replace('pref("app.update.url.manual", "https://nightly.mozilla.org");', 'pref("app.update.url.manual", "");');
    next = next.replace('pref("app.update.url.details", "https://nightly.mozilla.org");', 'pref("app.update.url.details", "");');
    return next;
  });
}

function ensureBrowserXhtmlPatched(checkoutDir) {
  const browserXhtmlPath = path.join(checkoutDir, "browser", "base", "content", "browser.xhtml");

  if (!existsSync(browserXhtmlPath)) {
    throw new Error(`Gecko checkout is missing browser.xhtml: ${browserXhtmlPath}`);
  }

  patchFile(browserXhtmlPath, "browser.xhtml stylesheet", (contents) => {
    if (contents.includes("chrome://browser/content/nodely/nodely-shell.css")) {
      return contents;
    }

    return contents.replace(
      "</head>",
      '  <html:link rel="stylesheet" href="chrome://browser/content/nodely/nodely-shell.css" />\n</head>'
    );
  });

  patchFile(browserXhtmlPath, "browser.xhtml bootstrap", (contents) => {
    if (contents.includes("chrome://browser/content/nodely/nodely-bootstrap.mjs")) {
      return contents;
    }

    if (contents.includes("</html:body>")) {
      return contents.replace(
        "</html:body>",
        '  <html:script type="module" src="chrome://browser/content/nodely/nodely-bootstrap.mjs"></html:script>\n</html:body>'
      );
    }

    return contents.replace(
      "</body>",
      '  <html:script type="module" src="chrome://browser/content/nodely/nodely-bootstrap.mjs"></html:script>\n</body>'
    );
  });
}

function ensureJarManifestPatched(checkoutDir) {
  const jarManifestPath = path.join(checkoutDir, "browser", "base", "jar.mn");

  if (!existsSync(jarManifestPath)) {
    throw new Error(`Gecko checkout is missing jar.mn: ${jarManifestPath}`);
  }

  patchFile(jarManifestPath, "browser/base/jar.mn nodely files", (contents) => {
    if (contents.includes("content/browser/nodely/nodely-bootstrap.mjs")) {
      return contents.replace(
        "        content/browser/nodely/window-context.mjs        (content/nodely/window-context.mjs)\n",
        ""
      );
    }

    const insertionPoint = "        content/browser/contentTheme.js                     (content/contentTheme.js)\n";
    const injectedBlock =
      `${insertionPoint}` +
      "        content/browser/nodely/browser-basics-bridge.mjs  (content/nodely/browser-basics-bridge.mjs)\n" +
      "        content/browser/nodely/chrome-state-controller.mjs (content/nodely/chrome-state-controller.mjs)\n" +
      "        content/browser/nodely/domain.mjs                 (content/nodely/domain.mjs)\n" +
      "        content/browser/nodely/favorites-store.mjs       (content/nodely/favorites-store.mjs)\n" +
      "        content/browser/nodely/node-runtime-manager.mjs  (content/nodely/node-runtime-manager.mjs)\n" +
      "        content/browser/nodely/nodely-bootstrap.mjs      (content/nodely/nodely-bootstrap.mjs)\n" +
      "        content/browser/nodely/nodely-graph-surface.mjs  (content/nodely/nodely-graph-surface.mjs)\n" +
      "        content/browser/nodely/nodely-shell.css          (content/nodely/nodely-shell.css)\n" +
      "        content/browser/nodely/nodely-shell.mjs          (content/nodely/nodely-shell.mjs)\n" +
      "        content/browser/nodely/nodely-upload-child.mjs   (content/nodely/nodely-upload-child.mjs)\n" +
      "        content/browser/nodely/nodely-upload-parent.mjs  (content/nodely/nodely-upload-parent.mjs)\n" +
      "        content/browser/nodely/workspace-store.mjs       (content/nodely/workspace-store.mjs)\n";

    return contents.replace(insertionPoint, injectedBlock);
  });
}

function ensureBrowserBaseMozbuildPatched(checkoutDir) {
  const mozBuildPath = path.join(checkoutDir, "browser", "base", "moz.build");

  if (!existsSync(mozBuildPath)) {
    throw new Error(`Gecko checkout is missing browser/base/moz.build: ${mozBuildPath}`);
  }

  patchFile(mozBuildPath, "browser/base/moz.build nodely tests", (contents) => {
    let next = contents.replace('    "content/test/nodely/browser.toml",\n', "");

    next = next.replace(
      '    "content/test/metaTags/browser.toml",\n',
      '    "content/test/metaTags/browser.toml",\n' +
        '    "content/test/nodely/browser.toml",\n'
    );

    return next;
  });
}

function ensureBrowserMozConfigurePatched(checkoutDir) {
  const mozConfigurePath = path.join(checkoutDir, "browser", "moz.configure");

  if (!existsSync(mozConfigurePath)) {
    throw new Error(`Gecko checkout is missing browser/moz.configure: ${mozConfigurePath}`);
  }

  patchFile(mozConfigurePath, "browser/moz.configure nodely identity", (contents) =>
    contents
      .replace('imply_option("MOZ_APP_VENDOR", "Mozilla")', 'imply_option("MOZ_APP_VENDOR", "Nodely")')
      .replace(
        'imply_option("MOZ_APP_ID", "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}")',
        'imply_option("MOZ_APP_ID", "{a75f9f03-78b1-4c8a-a2c7-f12d45088b29}")'
      )
  );
}

function ensureBrowserProfileDefaultsPatched(checkoutDir) {
  const firefoxProfilePath = path.join(checkoutDir, "browser", "app", "profile", "firefox.js");

  if (!existsSync(firefoxProfilePath)) {
    throw new Error(`Gecko checkout is missing browser/app/profile/firefox.js: ${firefoxProfilePath}`);
  }

  patchFile(firefoxProfilePath, "browser/app/profile/firefox.js nodely startup prefs", (contents) => {
    let next = contents;

    next = next.replace(
      'pref("browser.startup.page",                1);',
      'pref("browser.startup.page",                0);'
    );
    next = next.replace(
      'pref("browser.startup.homepage",            "about:home");',
      'pref("browser.startup.homepage",            "about:blank");'
    );
    next = next.replace(
      'pref("browser.aboutwelcome.enabled", true);',
      'pref("browser.aboutwelcome.enabled", false);'
    );

    if (!next.includes('pref("browser.startup.homepage_override.mstone", "ignore");')) {
      next = next.replace(
        'pref("browser.startup.homepage",            "about:blank");\n',
        'pref("browser.startup.homepage",            "about:blank");\n' +
          'pref("browser.startup.homepage_override.mstone", "ignore");\n' +
          'pref("startup.homepage_welcome_url",      "");\n' +
          'pref("startup.homepage_welcome_url.additional", "");\n'
      );
    }

    if (!next.includes('pref("browser.newtabpage.enabled", false);')) {
      next = next.replace(
        'pref("browser.aboutwelcome.enabled", false);\n',
        'pref("browser.aboutwelcome.enabled", false);\n' +
          'pref("browser.newtabpage.enabled", false);\n'
      );
    }

    return next;
  });
}

function syncOverlay({ checkoutDir }) {
  if (!existsSync(checkoutDir) || !statSync(checkoutDir).isDirectory()) {
    throw new Error(`Gecko source checkout directory not found: ${checkoutDir}`);
  }

  copyDirectory(overlayRoot, checkoutDir);
  removeFileIfPresent(path.join(checkoutDir, "browser", "base", "content", "nodely", "window-context.mjs"));
  ensureBrowserXhtmlPatched(checkoutDir);
  ensureJarManifestPatched(checkoutDir);
  ensureBrowserBaseMozbuildPatched(checkoutDir);
  ensureBrowserMozConfigurePatched(checkoutDir);
  ensureBrowserProfileDefaultsPatched(checkoutDir);
  ensureUnofficialBrandingPatched(checkoutDir);
  console.log(`Overlay synced into ${checkoutDir}`);
}

try {
  syncOverlay(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
