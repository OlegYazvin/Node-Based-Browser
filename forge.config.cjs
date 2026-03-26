const { MakerDeb } = require("@electron-forge/maker-deb");
const { MakerRpm } = require("@electron-forge/maker-rpm");
const { MakerZIP } = require("@electron-forge/maker-zip");
const {
  AutoUnpackNativesPlugin
} = require("@electron-forge/plugin-auto-unpack-natives");
const { VitePlugin } = require("@electron-forge/plugin-vite");

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}), new MakerDeb({}), new MakerRpm({})],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};
