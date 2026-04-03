#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--help":
        console.log("Usage: node gecko/scripts/doctor-gecko.mjs [--checkout-dir <path>]");
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8"
  });

  return {
    ok: result.status === 0,
    output: (result.stdout || result.stderr || "").trim()
  };
}

function checkCommand(command, args = ["--version"]) {
  const result = commandOutput(command, args);
  return {
    present: result.ok,
    details: result.output.split("\n")[0] || `${command} unavailable`
  };
}

function checkPkgConfig(packageName) {
  const result = commandOutput("pkg-config", ["--modversion", packageName]);
  return {
    present: result.ok,
    details: result.output || `${packageName} unavailable`
  };
}

function printStatus(label, check, recommendation = "") {
  const marker = check.present ? "OK" : "MISSING";
  console.log(`${marker.padEnd(8)} ${label}: ${check.details}`);

  if (!check.present && recommendation) {
    console.log(`         ${recommendation}`);
  }
}

function detectPythonCompatibility() {
  const pythonCheck = checkCommand("python3", ["--version"]);
  const version = pythonCheck.details.match(/Python\s+(\d+)\.(\d+)/u);
  const major = version ? Number(version[1]) : null;
  const minor = version ? Number(version[2]) : null;
  const compatible = major === 3 && minor !== null && minor <= 12;

  return {
    present: pythonCheck.present && compatible,
    details: pythonCheck.details,
    incompatible: pythonCheck.present && !compatible
  };
}

function main() {
  const { checkoutDir } = parseArguments(process.argv.slice(2));

  console.log("Nodely Gecko Doctor");
  console.log(`Gecko checkout: ${checkoutDir}`);
  console.log("");

  const checkoutPresent =
    existsSync(checkoutDir) && existsSync(path.join(checkoutDir, "browser", "base", "content", "browser.xhtml"));
  printStatus(
    "Gecko source checkout",
    {
      present: checkoutPresent,
      details: checkoutPresent ? "checkout present" : "checkout missing"
    },
    "Run `npm run gecko:bootstrap -- --checkout-dir <path> --ref esr140`."
  );

  const gitCheck = checkCommand("git");
  const pythonCheck = detectPythonCompatibility();
  const gccCheck = checkCommand("gcc");
  const ccCheck = checkCommand("cc");
  const clangCheck = checkCommand("clang");
  const rustcCheck = checkCommand("rustc");
  const cargoCheck = checkCommand("cargo");
  const pkgConfigCheck = checkCommand("pkg-config");
  const libffiCheck = checkPkgConfig("libffi");

  printStatus("git", gitCheck, "Install git before bootstrapping the Gecko source checkout.");
  printStatus(
    "python3 (Gecko tooling)",
    pythonCheck,
    pythonCheck.incompatible
      ? "This Gecko branch is not happy on Python 3.14 here; use Python 3.12 or 3.11 for mach/bootstrap."
      : "Install Python 3.12 or 3.11 and point `mach` at it."
  );
  printStatus("gcc", gccCheck, "Install a system C/C++ toolchain, for example gcc and gcc-c++.");
  printStatus("cc", ccCheck, "Ensure a default C compiler is on PATH.");
  printStatus("clang", clangCheck, "Clang is recommended for Gecko development.");
  printStatus("rustc", rustcCheck, "Install Rust via rustup and ensure rustc is on PATH.");
  printStatus("cargo", cargoCheck, "Install Rust via rustup and ensure cargo is on PATH.");
  printStatus("pkg-config", pkgConfigCheck, "Install pkg-config for native dependency discovery.");
  printStatus("libffi", libffiCheck, "Install libffi development headers so Python wheels and mach dependencies can build.");

  console.log("");
  if (checkoutPresent) {
    const browserXhtmlCheck = commandOutput("rg", [
      "-n",
      "nodely-shell|nodely-bootstrap",
      path.join(checkoutDir, "browser", "base", "content", "browser.xhtml")
    ]);
    const jarCheck = commandOutput("rg", [
      "-n",
      "content/browser/nodely/",
      path.join(checkoutDir, "browser", "base", "jar.mn")
    ]);

    printStatus(
      "Nodely browser.xhtml hooks",
      {
        present: browserXhtmlCheck.ok,
        details: browserXhtmlCheck.ok ? "stylesheet and bootstrap hooks present" : "hooks missing"
      },
      "Run `npm run gecko:sync -- --checkout-dir <path>`."
    );
    printStatus(
      "Nodely jar.mn packaging",
      {
        present: jarCheck.ok,
        details: jarCheck.ok ? "chrome packaging entries present" : "packaging entries missing"
      },
      "Run `npm run gecko:sync -- --checkout-dir <path>`."
    );

    const brandConfigCheck = commandOutput("rg", [
      "-n",
      "MOZ_APP_DISPLAYNAME=Nodely|MOZ_APP_REMOTINGNAME=nodely|MOZ_MACBUNDLE_ID=org\\.nodely\\.browser",
      path.join(checkoutDir, "browser", "branding", "unofficial", "configure.sh")
    ]);
    const brandLocaleCheck = commandOutput("rg", [
      "-n",
      "Nodely Browser|Nodely",
      path.join(checkoutDir, "browser", "branding", "unofficial", "locales", "en-US", "brand.ftl")
    ]);

    printStatus(
      "Nodely build branding",
      {
        present: brandConfigCheck.ok && brandLocaleCheck.ok,
        details: brandConfigCheck.ok && brandLocaleCheck.ok ? "display name, remoting, and locale branding present" : "branding patch missing"
      },
      "Run `npm run gecko:sync -- --checkout-dir <path>` and regenerate `mozconfig.nodely`."
    );

    const builtIdentityCheck = commandOutput("rg", [
      "-n",
      "Vendor=Nodely|Name=Nodely|RemotingName=nodely|CodeName=Nodely|ID=\\{a75f9f03-78b1-4c8a-a2c7-f12d45088b29\\}",
      path.join(checkoutDir, "obj-nodely", "build", "application.ini")
    ]);
    const nodelyAliasCheck = commandOutput("bash", [
      "-lc",
      `[ -x "${path.join(checkoutDir, "obj-nodely", "dist", "bin", "nodely")}" ]`
    ]);

    printStatus(
      "Built browser identity",
      {
        present: builtIdentityCheck.ok && nodelyAliasCheck.ok,
        details:
          builtIdentityCheck.ok && nodelyAliasCheck.ok
            ? "artifact branding refresh produced Nodely metadata and launch alias"
            : "run the artifact-branding refresh after building"
      },
      "Run `npm run gecko:refresh-branding -- --checkout-dir <path>` after building, then package again if you need refreshed staged artifacts."
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
