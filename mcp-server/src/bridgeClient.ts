import { config } from "./config.js";

export interface BridgeEvalResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs?: number;
}

export interface ConsoleLine {
  seq: number;
  channel: string;
  message: string;
}

/** HTTP client for the ai_dev_bridge resource (served by FXServer at /ai_dev_bridge/*). */
export class BridgeClient {
  private endpoint = config.fxServer.bridgeEndpoint.replace(/\/+$/, "");

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 25000): Promise<T> {
    if (!config.fxServer.bridgeToken) throw new Error("AI_BRIDGE_TOKEN is not set (must match `set ai_bridge_token` in server.cfg).");
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.fxServer.bridgeToken}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      throw new Error(`Cannot reach ${this.endpoint} (is FXServer running with ai_dev_bridge started?): ${err.message}`);
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`Bridge ${path} failed (${response.status}): ${text}`);
    return JSON.parse(text) as T;
  }

  evalServerLua(code: string) {
    return this.request<BridgeEvalResponse>("POST", "/eval", { code });
  }

  /** targetPlayer omitted = first connected player. */
  evalClientLua(code: string, targetPlayer?: number, timeoutMs?: number) {
    return this.request<BridgeEvalResponse>("POST", "/client-eval", { code, targetPlayer, timeoutMs });
  }

  triggerClientEvent(event: string, targetPlayer?: number, args: unknown[] = []) {
    return this.request<unknown>("POST", "/client-trigger", { event, targetPlayer, args });
  }

  /** Returns a data URI (data:image/jpeg;base64,...). */
  async captureScreenshot(targetPlayer?: number): Promise<string> {
    const r = await this.request<{ image: string }>("POST", "/screenshot", { targetPlayer });
    return r.image;
  }

  getConsole(since = 0, limit = 200) {
    return this.request<{ lines: ConsoleLine[]; lastSeq: number }>("POST", "/console", { since, limit });
  }

  getStatus() {
    return this.request<{
      players: Array<{ id: number; name: string; ping: number; coords: { x: number; y: number; z: number } }>;
      resources: Array<{ name: string; state: string }>;
      consoleSeq: number;
    }>("GET", "/status");
  }
}
