import puppeteer, { Browser, Frame, Page } from "puppeteer-core";
import { config } from "./config.js";

export interface ConsoleLogEntry {
  type: string;
  text: string;
  url: string;
  timestamp: number;
}

const MAX_LOGS = 1000;

// https://cfx-nui-<res>/... (normal ui_page) or nui://<res>/... (legacy / DUI)
const resourceOf = (url: string) => url.match(/^(?:https?:\/\/cfx-nui-|nui:\/\/)([^/]+)/i)?.[1]?.toLowerCase() ?? null;

/**
 * FiveM NUI = one CEF page (nui://game/ui/root.html) with each resource's ui_page
 * loaded as an iframe at https://cfx-nui-<resource>/... — so resources are frames, not pages.
 */
export class CdpClient {
  private browser: Browser | null = null;
  private logs: ConsoleLogEntry[] = [];
  private watched = new WeakSet<Page>();

  private async connect(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    try {
      this.browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${config.cefPort}`, defaultViewport: null });
    } catch (err: any) {
      throw new Error(`FiveM CEF DevTools not reachable on 127.0.0.1:${config.cefPort} (is the game running?): ${err.message}`);
    }
    this.browser.on("disconnected", () => (this.browser = null));
    return this.browser;
  }

  private async pages(): Promise<Page[]> {
    const pages = await (await this.connect()).pages();
    for (const page of pages) this.watch(page);
    return pages;
  }

  // ponytail: logs only captured while connected; anything logged before the first NUI tool call is missed
  private watch(page: Page) {
    if (this.watched.has(page)) return;
    this.watched.add(page);
    const push = (e: ConsoleLogEntry) => {
      this.logs.push(e);
      if (this.logs.length > MAX_LOGS) this.logs.shift();
    };
    page.on("console", (msg) => push({ type: msg.type(), text: msg.text(), url: msg.location()?.url ?? "", timestamp: Date.now() }));
    page.on("pageerror", (err) => push({ type: "pageerror", text: String(err), url: "", timestamp: Date.now() }));
  }

  async listFrames(): Promise<Array<{ resource: string | null; url: string }>> {
    const out: Array<{ resource: string | null; url: string }> = [];
    for (const page of await this.pages()) {
      for (const frame of page.frames()) {
        out.push({ resource: resourceOf(frame.url()), url: frame.url() });
      }
    }
    return out;
  }

  /** resource = name of a resource with a ui_page, or "root" for the whole NUI overlay. */
  private async frameFor(resource: string): Promise<{ page: Page; frame: Frame }> {
    const pages = await this.pages();
    const want = resource.toLowerCase() === "root" ? "game" : resource.toLowerCase(); // root.html is nui://game/ui/root.html
    for (const page of pages) {
      for (const frame of page.frames()) {
        if (resourceOf(frame.url()) === want) return { page, frame };
      }
    }
    const urls = pages.flatMap((p) => p.frames().map((f) => f.url()));
    throw new Error(`No NUI frame for '${resource}'. Loaded frames: ${JSON.stringify(urls)}`);
  }

  async inspectDOM(resource: string, selector?: string): Promise<string> {
    const { frame } = await this.frameFor(resource);
    if (!selector) return frame.content();
    const html = await frame.$eval(selector, (el) => el.outerHTML).catch(() => null);
    if (html === null) throw new Error(`Selector '${selector}' not found in '${resource}'.`);
    return html;
  }

  async evaluateJS(resource: string, expression: string): Promise<unknown> {
    const { frame } = await this.frameFor(resource);
    return frame.evaluate(expression);
  }

  async screenshot(resource: string, selector?: string): Promise<string> {
    const { page, frame } = await this.frameFor(resource);
    const el = selector ? await frame.$(selector) : frame === page.mainFrame() ? null : await frame.frameElement();
    if (selector && !el) throw new Error(`Selector '${selector}' not found in '${resource}'.`);
    const shot = el ? await el.screenshot({ encoding: "base64", type: "png" }) : await page.screenshot({ encoding: "base64", type: "png" });
    return shot as string;
  }

  async click(resource: string, selector: string): Promise<void> {
    const { frame } = await this.frameFor(resource);
    await frame.waitForSelector(selector, { timeout: 3000 });
    await frame.click(selector);
  }

  async type(resource: string, selector: string, text: string): Promise<void> {
    const { frame } = await this.frameFor(resource);
    await frame.waitForSelector(selector, { timeout: 3000 });
    await frame.type(selector, text);
  }

  async consoleLogs(resource?: string): Promise<ConsoleLogEntry[]> {
    await this.pages(); // make sure listeners are attached
    if (!resource) return this.logs;
    const want = resource.toLowerCase();
    return this.logs.filter((l) => l.url === "" || resourceOf(l.url) === want);
  }
}
