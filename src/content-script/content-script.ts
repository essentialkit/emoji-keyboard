import "./content-script.css";
import { Logger } from "../utils/logger";
import Storage from "../utils/storage";
import { WinboxRenderer } from "./winbox-renderer";
import { Floatie } from "./floatie";
import { Searcher } from "./searcher";
import { packageName } from "../config";

// Listen for ":" keydown
// Show a floaty with suggestions based on last three keywords (minus articles)
// If nothing has been typed yet, show continue type for emoji suggestions.
// As the user types, filter the suggestions, prioritizing their keyword matches
class ContentScript {
  logger = new Logger(this);
  winboxRenderer = new WinboxRenderer();
  floatie = new Floatie();
  searcher = new Searcher();
  isFloatieActive = false;
  query = "";

  async init() {
    if (this.inApplicationIframe()) {
    } else {
      this.logger.listenForBgLogs();

      // Add event listeners for main window.
      window.addEventListener("message", this.onMessageHandler, false);
      document.onscroll = this.winboxRenderer.onEscHandler;
      document.onresize = this.winboxRenderer.onEscHandler;

      // Unlike keydown, keypress is not raised by noncharacter keys.
      window.addEventListener("keypress", this.floatie.keypressListener);
      window.addEventListener("keyup", this.floatie.keyupHandler);
      window.addEventListener("keydown", this.floatie.keydownHandler);
      document.addEventListener("click", this.floatie.clickHandler);

      await this.floatie.init();
      this.floatie.renderer = (msg) => this.winboxRenderer.handleMessage(msg);
      this.floatie.searchHandler = (query) => this.searcher.search(query);
      this.floatie.suggestHandler = (query) => this.searcher.suggest(query);
    }
  }

  onMessageHandler = (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.data.application !== packageName) {
      return;
    }

    if (event.data.action === "show-demo") {
      this.floatie.activateForDemo(event);
      return;
    }

    this.winboxRenderer.handleMessage(event.data);
  };

  /*
   * Returns true if this script is running inside an iframe,
   * since the content script is added to all frames.
   */
  inAnyIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  inApplicationIframe() {
    try {
      return window.name === packageName + "/mainframe";
    } catch (e) {
      return false;
    }
  }
}

Storage.get("blocked-sites").then((sites) => {
  if (
    !sites ||
    !window.location.hostname || // for file urls
    !sites.includes(window.location.hostname)
  ) {
    new ContentScript().init();
  }
});
