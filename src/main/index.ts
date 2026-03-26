import { app, BrowserWindow } from "electron";
import { AppController } from "./appController";

let controller: AppController | null = null;

async function bootstrap() {
  controller = new AppController();
  await controller.initialize();
}

app.whenReady().then(() => {
  void bootstrap();

  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) {
      void bootstrap();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
