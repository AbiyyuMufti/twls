import * as vscode from "vscode";

/**
 * Shared output channel for TWLS. Every repository operation logs a
 * timestamped line here, in addition to whatever toast is shown, so the full
 * history of what ran — and the stack trace of anything that failed — stays
 * inspectable via "TWLS: Show Output" even after the toast disappears.
 */
class Logger implements vscode.Disposable {
  private channel = vscode.window.createOutputChannel("TWLS");

  private write(level: "INFO" | "WARN" | "ERROR", message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }

  info(message: string): void {
    this.write("INFO", message);
  }

  warn(message: string): void {
    this.write("WARN", message);
  }

  error(message: string, error?: unknown): void {
    this.write("ERROR", message);

    if (error instanceof Error) {
      this.channel.appendLine(error.stack ?? error.message);
    } else if (error !== undefined) {
      const details =
        typeof error === "string" ? error : JSON.stringify(error, null, 2);
      this.channel.appendLine(details);
    }
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

export const logger = new Logger();
