module.exports.runtime = {
  handler: async function ({ path, mode }) {
    const fs = require("fs");
    const nodePath = require("path");
    const { spawn } = require("child_process");

    const callerId = `${this.config.name}-v${this.config.version}`;

    try {
      if (process.platform !== "win32") {
        return "local_file_open only supports Windows because it relies on explorer.exe.";
      }

      const rawPath = String(path || "").trim();
      const normalizedMode = String(mode || "open").trim().toLowerCase();

      if (!rawPath) {
        return "Missing required parameter: path";
      }

      const fullPath = nodePath.resolve(rawPath);
      if (!fs.existsSync(fullPath)) {
        return `Path does not exist: ${fullPath}`;
      }

      const stat = fs.statSync(fullPath);
      let explorerArgs = [];
      let targetDescription = fullPath;

      if (normalizedMode === "select") {
        explorerArgs = ["/select,", fullPath];
      } else {
        if (stat.isDirectory()) {
          explorerArgs = [fullPath];
        } else {
          const parentDir = nodePath.dirname(fullPath);
          targetDescription = parentDir;
          explorerArgs = [parentDir];
        }
      }

      this.introspect(`${callerId} opening Windows Explorer for ${targetDescription}`);

      const child = spawn("explorer.exe", explorerArgs, {
        detached: true,
        stdio: "ignore"
      });

      child.unref();

      return `Opened Windows File Explorer for: ${targetDescription} (mode: ${normalizedMode === "select" ? "select" : "open"})`;
    } catch (error) {
      this.introspect(`${callerId} failed: ${error.message}`);
      this.logger(`${callerId} failed`, error.message);
      return `local_file_open failed: ${error.message}`;
    }
  }
};
