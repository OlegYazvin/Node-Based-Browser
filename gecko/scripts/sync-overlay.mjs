#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const overlayRoot = path.join(geckoRoot, "overlay");
const repositoryRoot = path.resolve(geckoRoot, "..");
const runtimeOverlaySourceDirectory = path.join(
  overlayRoot,
  "browser",
  "base",
  "content",
  "nodely"
);
const NODELY_CRASH_REPORT_EMAIL = "olegyazvin@gmail.com";

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

function runCommand(command, args, { cwd = repositoryRoot, input = null } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    input
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed${output ? `: ${output}` : ""}`);
  }

  return result.stdout ?? "";
}

function readZipEntry(archivePath, entryPath) {
  const result = spawnSync("unzip", ["-p", archivePath, entryPath], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  if (result.status === 0 || result.stdout) {
    return result.stdout ?? "";
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  throw new Error(`unzip -p ${archivePath} ${entryPath} failed${output ? `: ${output}` : ""}`);
}

function maybeReadZipEntry(archivePath, entryPath) {
  const result = spawnSync("unzip", ["-p", archivePath, entryPath], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  if (result.status === 0 || result.stdout) {
    return result.stdout ?? "";
  }

  return null;
}

function normalizeZipArchive(archivePath) {
  const fixedArchivePath = path.join(
    os.tmpdir(),
    `nodely-fixed-${path.basename(archivePath)}-${process.pid}-${Date.now()}`
  );

  try {
    runCommand("zip", ["-FF", archivePath, "--out", fixedArchivePath], { input: "\n" });
    cpSync(fixedArchivePath, archivePath, { force: true });
  } finally {
    rmSync(fixedArchivePath, { force: true });
  }
}

function patchBrowserXhtmlContents(contents) {
  let next = contents;

  if (!next.includes("chrome://browser/content/nodely/nodely-shell.css")) {
    next = next.replace(
      "</head>",
      '  <html:link rel="stylesheet" href="chrome://browser/content/nodely/nodely-shell.css" />\n</head>'
    );
  }

  if (next.includes("chrome://browser/content/nodely/nodely-bootstrap.mjs")) {
    return next;
  }

  if (next.includes("</html:body>")) {
    return next.replace(
      "</html:body>",
      '  <html:script type="module" src="chrome://browser/content/nodely/nodely-bootstrap.mjs"></html:script>\n</html:body>'
    );
  }

  return next.replace(
    "</body>",
    '  <html:script type="module" src="chrome://browser/content/nodely/nodely-bootstrap.mjs"></html:script>\n</body>'
  );
}

function patchFirefoxDefaultsContents(contents) {
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
      /pref\("browser\.startup\.homepage",\s+"about:blank"\);/u,
      'pref("browser.startup.homepage",            "about:blank");\n' +
        'pref("browser.startup.homepage_override.mstone", "ignore");\n' +
        'pref("startup.homepage_welcome_url",      "");\n' +
        'pref("startup.homepage_welcome_url.additional", "");'
    );
  }

  if (!next.includes('pref("browser.newtabpage.enabled", false);')) {
    next = next.replace(
      /pref\("browser\.aboutwelcome\.enabled", false\);/u,
      'pref("browser.aboutwelcome.enabled", false);\n' + 'pref("browser.newtabpage.enabled", false);'
    );
  }

  return next;
}

export function patchCrashReporterFtlContents(contents) {
  let next = contents;

  next = next.replace(
    "crashreporter-branded-title = { -brand-short-name } Crash Reporter",
    "crashreporter-branded-title = Nodely Crash Reporter"
  );
  next = next.replace(
    "crashreporter-crashed-and-restore = { -brand-short-name } had a problem and crashed. We’ll try to restore your tabs and windows when it restarts.",
    "crashreporter-crashed-and-restore = Nodely had a problem and crashed. We’ll try to restore your tabs and windows when it restarts."
  );
  next = next.replace(
    "crashreporter-plea = To help us diagnose and fix the problem, you can send us a crash report.",
    `crashreporter-plea = To help us diagnose and fix the problem, you can send a crash report to ${NODELY_CRASH_REPORT_EMAIL}.`
  );
  next = next.replace(
    "crashreporter-information = This application is run after a crash to report the problem to { -vendor-short-name }. It should not be run directly.",
    `crashreporter-information = This application is run after a Nodely crash to report the problem to ${NODELY_CRASH_REPORT_EMAIL}. It should not be run directly.`
  );
  next = next.replace(
    "crashreporter-error = { -brand-short-name } had a problem and crashed. Unfortunately, the crash reporter is unable to submit a report for this crash.",
    "crashreporter-error = Nodely had a problem and crashed. Unfortunately, the crash reporter is unable to submit a report for this crash."
  );
  next = next.replace(
    "crashreporter-no-run-message = This application is run after a crash to report the problem to the application vendor. It should not be run directly.",
    `crashreporter-no-run-message = This application is run after a Nodely crash to report the problem to ${NODELY_CRASH_REPORT_EMAIL}. It should not be run directly.`
  );
  next = next.replace(
    "crashreporter-checkbox-send-report = Tell { -vendor-short-name } about this crash so they can fix it.",
    `crashreporter-checkbox-send-report = Send this crash report to ${NODELY_CRASH_REPORT_EMAIL} so Nodely can be fixed.`
  );
  next = next.replace(
    "crashreporter-submit-success = Report submitted successfully!",
    `crashreporter-submit-success = Crash report sent to ${NODELY_CRASH_REPORT_EMAIL}.`
  );
  next = next.replace(
    "crashreporter-submit-failure = There was a problem submitting your report.",
    `crashreporter-submit-failure = There was a problem sending your report to ${NODELY_CRASH_REPORT_EMAIL}.`
  );

  return next;
}

function patchCrashReporterUiFallbackContents(contents) {
  return contents
    .replace(
      'Window title(string_or("crashreporter-branded-title", "Firefox Crash Reporter"))',
      'Window title(string_or("crashreporter-branded-title", "Nodely Crash Reporter"))'
    )
    .replace(
      '"The application had a problem and crashed. \\',
      '"Nodely had a problem and crashed. \\'
    );
}

export function patchCrashReporterMacPlistContents(contents) {
  return contents
    .replaceAll("@APP_NAME@ Crash Reporter", "Nodely Crash Reporter")
    .replaceAll("Firefox Crash Reporter", "Nodely Crash Reporter")
    .replaceAll(">Crash Reporter<", ">Nodely Crash Reporter<")
    .replaceAll('"Crash Reporter"', '"Nodely Crash Reporter"')
    .replaceAll("org.mozilla.crashreporter", "org.nodely.crashreporter")
    .replaceAll(/Nodely(?: Nodely)+ Crash Reporter/gu, "Nodely Crash Reporter");
}

export function patchCrashReporterMacInfoStringsContents(contents) {
  return contents
    .replaceAll('CFBundleName = "Crash Reporter";', 'CFBundleName = "@APP_NAME@ Crash Reporter";')
    .replaceAll('CFBundleName = "Nodely Crash Reporter";', 'CFBundleName = "@APP_NAME@ Crash Reporter";')
    .replaceAll(
      'CFBundleDisplayName = "Crash Reporter";',
      'CFBundleDisplayName = "@APP_NAME@ Crash Reporter";'
    )
    .replaceAll(
      'CFBundleDisplayName = "Nodely Crash Reporter";',
      'CFBundleDisplayName = "@APP_NAME@ Crash Reporter";'
    )
    .replaceAll(/@APP_NAME@(?: @APP_NAME@)+ Crash Reporter/gu, "@APP_NAME@ Crash Reporter");
}

function ensureCrashReporterBrandingPatched(checkoutDir) {
  const crashReporterFtlPath = path.join(
    checkoutDir,
    "toolkit",
    "locales",
    "en-US",
    "crashreporter",
    "crashreporter.ftl"
  );
  const crashReporterUiPath = path.join(
    checkoutDir,
    "toolkit",
    "crashreporter",
    "client",
    "app",
    "src",
    "ui",
    "mod.rs"
  );
  const crashReporterMacPlistPath = path.join(
    checkoutDir,
    "toolkit",
    "crashreporter",
    "client",
    "app",
    "src",
    "ui",
    "macos",
    "plist.rs"
  );
  const crashReporterMacInfoStringsPath = path.join(
    checkoutDir,
    "toolkit",
    "crashreporter",
    "client",
    "app",
    "macos_app_bundle",
    "Resources",
    "English.lproj",
    "InfoPlist.strings.in"
  );

  patchFile(
    crashReporterFtlPath,
    "toolkit/locales/en-US/crashreporter/crashreporter.ftl nodely wording",
    patchCrashReporterFtlContents
  );
  patchFile(
    crashReporterUiPath,
    "toolkit/crashreporter/client/app/src/ui/mod.rs nodely crash reporter fallback",
    patchCrashReporterUiFallbackContents
  );
  patchFile(
    crashReporterMacPlistPath,
    "toolkit/crashreporter/client/app/src/ui/macos/plist.rs nodely crash reporter bundle",
    patchCrashReporterMacPlistContents
  );
  patchFile(
    crashReporterMacInfoStringsPath,
    "toolkit/crashreporter/client/app/macos_app_bundle InfoPlist nodely crash reporter bundle",
    patchCrashReporterMacInfoStringsContents
  );
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

  patchFile(browserXhtmlPath, "browser.xhtml nodely hooks", patchBrowserXhtmlContents);
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

  patchFile(firefoxProfilePath, "browser/app/profile/firefox.js nodely startup prefs", patchFirefoxDefaultsContents);
}

export function syncLooseRuntimeOverlay(checkoutDir) {
  const sourceDirectory = runtimeOverlaySourceDirectory;
  if (!existsSync(sourceDirectory)) {
    return false;
  }

  const runtimeOverlayDirectories = [
    {
      parentDirectory: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "bin",
        "browser",
        "chrome",
        "browser",
        "content",
        "browser"
      ),
      runtimeDirectory: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "bin",
        "browser",
        "chrome",
        "browser",
        "content",
        "browser",
        "nodely"
      )
    },
    {
      parentDirectory: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "nodely",
        "browser",
        "chrome",
        "browser",
        "content",
        "browser"
      ),
      runtimeDirectory: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "nodely",
        "browser",
        "chrome",
        "browser",
        "content",
        "browser",
        "nodely"
      )
    }
  ];
  const runtimeBrowserXhtmlPaths = [
    path.join(checkoutDir, "obj-nodely", "dist", "bin", "browser", "chrome", "browser", "content", "browser", "browser.xhtml"),
    path.join(checkoutDir, "obj-nodely", "dist", "nodely", "browser", "chrome", "browser", "content", "browser", "browser.xhtml")
  ];
  const runtimeFirefoxDefaultsPaths = [
    path.join(checkoutDir, "obj-nodely", "dist", "bin", "browser", "defaults", "preferences", "firefox.js"),
    path.join(checkoutDir, "obj-nodely", "dist", "nodely", "browser", "defaults", "preferences", "firefox.js")
  ];
  const runtimeCrashReporterFtlPaths = [
    path.join(checkoutDir, "obj-nodely", "dist", "bin", "localization", "en-US", "crashreporter", "crashreporter.ftl"),
    path.join(checkoutDir, "obj-nodely", "dist", "nodely", "localization", "en-US", "crashreporter", "crashreporter.ftl")
  ];

  let updated = false;

  for (const { parentDirectory, runtimeDirectory } of runtimeOverlayDirectories) {
    if (!existsSync(parentDirectory)) {
      continue;
    }

    copyDirectory(sourceDirectory, runtimeDirectory);
    updated = true;
  }

  for (const browserXhtmlPath of runtimeBrowserXhtmlPaths) {
    if (!existsSync(browserXhtmlPath)) {
      continue;
    }

    updated = patchFile(browserXhtmlPath, "runtime browser.xhtml nodely hooks", patchBrowserXhtmlContents) || updated;
  }

  for (const firefoxDefaultsPath of runtimeFirefoxDefaultsPaths) {
    if (!existsSync(firefoxDefaultsPath)) {
      continue;
    }

    updated =
      patchFile(firefoxDefaultsPath, "runtime firefox.js nodely startup prefs", patchFirefoxDefaultsContents) || updated;
  }

  for (const crashReporterFtlPath of runtimeCrashReporterFtlPaths) {
    if (!existsSync(crashReporterFtlPath)) {
      continue;
    }

    updated =
      patchFile(crashReporterFtlPath, "runtime crashreporter.ftl nodely wording", patchCrashReporterFtlContents) ||
      updated;
  }

  return updated;
}

function stageArchiveEntry(stagingDirectory, entryPath, contents) {
  const targetPath = path.join(stagingDirectory, entryPath);
  ensureDirectory(path.dirname(targetPath));
  writeFileSync(targetPath, contents, "utf8");
  return entryPath;
}

function syncRuntimeOmniArchive(archivePath) {
  if (!existsSync(archivePath) || !existsSync(runtimeOverlaySourceDirectory)) {
    return false;
  }

  normalizeZipArchive(archivePath);
  const stagingDirectory = mkdtempSync(path.join(os.tmpdir(), "nodely-omni-sync-"));

  try {
    const stagedEntries = [];

    for (const entry of readdirSync(runtimeOverlaySourceDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const sourcePath = path.join(runtimeOverlaySourceDirectory, entry.name);
      const entryPath = path.posix.join(
        "chrome",
        "browser",
        "content",
        "browser",
        "nodely",
        entry.name
      );
      const sourceContents = readFileSync(sourcePath, "utf8");
      stagedEntries.push(stageArchiveEntry(stagingDirectory, entryPath, sourceContents));
    }

    const browserXhtmlEntry = "chrome/browser/content/browser/browser.xhtml";
    const browserXhtml = readZipEntry(archivePath, browserXhtmlEntry);
    stagedEntries.push(
      stageArchiveEntry(stagingDirectory, browserXhtmlEntry, patchBrowserXhtmlContents(browserXhtml))
    );

    const firefoxDefaultsEntry = "defaults/preferences/firefox.js";
    const firefoxDefaults = readZipEntry(archivePath, firefoxDefaultsEntry);
    stagedEntries.push(
      stageArchiveEntry(
        stagingDirectory,
        firefoxDefaultsEntry,
        patchFirefoxDefaultsContents(firefoxDefaults)
      )
    );

    runCommand("zip", ["-q", archivePath, ...stagedEntries], {
      cwd: stagingDirectory
    });
    return true;
  } finally {
    rmSync(stagingDirectory, {
      force: true,
      recursive: true
    });
  }
}

function syncCrashReporterOmniArchive(archivePath) {
  if (!existsSync(archivePath)) {
    return false;
  }

  const crashReporterFtlEntry = "localization/en-US/crashreporter/crashreporter.ftl";
  const crashReporterFtl = maybeReadZipEntry(archivePath, crashReporterFtlEntry);
  if (crashReporterFtl === null) {
    return false;
  }

  const nextCrashReporterFtl = patchCrashReporterFtlContents(crashReporterFtl);

  if (nextCrashReporterFtl === crashReporterFtl) {
    return false;
  }

  normalizeZipArchive(archivePath);
  const stagingDirectory = mkdtempSync(path.join(os.tmpdir(), "nodely-crashreporter-omni-sync-"));

  try {
    runCommand("zip", ["-q", archivePath, stageArchiveEntry(stagingDirectory, crashReporterFtlEntry, nextCrashReporterFtl)], {
      cwd: stagingDirectory
    });
    return true;
  } finally {
    rmSync(stagingDirectory, {
      force: true,
      recursive: true
    });
  }
}

export function syncPackagedRuntimeOmniOverlay(checkoutDir) {
  const runtimeArchives = [path.join(checkoutDir, "obj-nodely", "dist", "nodely", "browser", "omni.ja")];
  const crashReporterRuntimeArchives = [
    path.join(checkoutDir, "obj-nodely", "dist", "bin", "omni.ja"),
    path.join(checkoutDir, "obj-nodely", "dist", "nodely", "omni.ja")
  ];

  let updated = false;

  for (const archivePath of runtimeArchives) {
    if (!existsSync(archivePath)) {
      continue;
    }

    updated = syncRuntimeOmniArchive(archivePath) || updated;
  }

  for (const archivePath of crashReporterRuntimeArchives) {
    if (!existsSync(archivePath)) {
      continue;
    }

    updated = syncCrashReporterOmniArchive(archivePath) || updated;
  }

  return updated;
}

export function syncOverlay({ checkoutDir }) {
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
  ensureCrashReporterBrandingPatched(checkoutDir);
  const looseRuntimeSynced = syncLooseRuntimeOverlay(checkoutDir);
  const packagedRuntimeSynced = syncPackagedRuntimeOmniOverlay(checkoutDir);
  if (looseRuntimeSynced) {
    console.log(`Overlay copied into live runtime chrome under ${path.relative(repositoryRoot, checkoutDir)}`);
  }
  if (packagedRuntimeSynced) {
    console.log(`Overlay synced into packaged runtime archives under ${path.relative(repositoryRoot, checkoutDir)}`);
  }
  console.log(`Overlay synced into ${checkoutDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    syncOverlay(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
