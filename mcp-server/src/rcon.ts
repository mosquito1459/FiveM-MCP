import dgram from "node:dgram";

const PACKET_PREFIX = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const PRINT_PREFIX = /^print\s?/; // FXServer sends "print " or "print\n" before each chunk
const MAX_COMMAND_BYTES = 4096;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  quietWindowMs?: number;
  timeoutMs?: number;
}

export class RconError extends Error {}

/**
 * FXServer UDP RCON Client
 * Implements the Quake3-style UDP protocol:
 * Request:  0xFFFFFFFF + "rcon " + <password> + " " + <command>
 * Response: 0xFFFFFFFF + "print\n" + <console output>
 */
export class RconClient {
  private host: string;
  private port: number;
  private password: string;
  private quietWindowMs: number;
  private timeoutMs: number;

  constructor(opts: RconOptions) {
    this.host = opts.host;
    this.port = opts.port;
    this.password = opts.password;
    this.quietWindowMs = opts.quietWindowMs ?? 150;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  async execute(cmd: string): Promise<string> {
    if (!this.password || this.password === "changeme") {
      throw new RconError(
        "RCON_PASSWORD is not configured or still 'changeme'. Set it to match 'set rcon_password' in server.cfg."
      );
    }

    if (Buffer.byteLength(cmd, "utf8") > MAX_COMMAND_BYTES) {
      throw new RconError(`RCON command exceeds max length of ${MAX_COMMAND_BYTES} bytes.`);
    }

    const payload = Buffer.concat([
      PACKET_PREFIX,
      Buffer.from(`rcon ${this.password} ${cmd}`, "utf8"),
    ]);

    return new Promise<string>((resolve, reject) => {
      const socket = dgram.createSocket(this.host.includes(":") ? "udp6" : "udp4");
      const chunks: string[] = [];
      let responseBytes = 0;
      let quietTimer: NodeJS.Timeout | null = null;
      let overallTimer: NodeJS.Timeout | null = null;
      let settled = false;

      const cleanup = () => {
        if (quietTimer) clearTimeout(quietTimer);
        if (overallTimer) clearTimeout(overallTimer);
        try {
          socket.close();
        } catch {}
      };

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve(chunks.join(""));
      };

      const armQuietTimer = () => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(), this.quietWindowMs);
      };

      socket.on("error", (err) => finish(err));

      socket.on("message", (msg) => {
        responseBytes += msg.length;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          finish(new RconError(`RCON response exceeded ${MAX_RESPONSE_BYTES} bytes limit.`));
          return;
        }

        let text = msg.toString("utf8");
        if (msg.subarray(0, 4).equals(PACKET_PREFIX)) {
          text = msg.subarray(4).toString("utf8");
        }
        text = text.replace(PRINT_PREFIX, "");

        chunks.push(text);
        armQuietTimer();
      });

      overallTimer = setTimeout(() => {
        if (chunks.length === 0) {
          finish(
            new RconError(
              `No RCON response from ${this.host}:${this.port} within ${this.timeoutMs}ms. Verify server is running and rcon_password matches.`
            )
          );
        } else {
          finish();
        }
      }, this.timeoutMs);

      socket.send(payload, this.port, this.host, (err) => {
        if (err) finish(err);
      });
    });
  }
}
