import { Logger } from "../utils/logger";
import { WinBox } from "../utils/winbox/winbox";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { i18n } from "../utils/i18n";
import Storage from "../utils/storage";
import { CLICKED_EMOJIS } from "../utils/storage-keys";

export class WinboxRenderer {
  logger = new Logger(this);
  dialog?: WinBox;

  // Close the dialog upon any interaction with containing doc.
  onEscHandler = (evt) => {
    this.handleMessage({
      action: "escape",
      href: document.location.href,
    });
  };

  async handleMessage(message) {
    this.logger.debug("#handleMessage: ", message);
    switch (message.action) {
      case "render-emojis":
        await this.renderEmojis(
          message.data.title,
          message.data.emojis,
          message.point
        );
        break;
      case "escape":
        this.dialog?.close();
        break;
      default:
        this.logger.warn("Unhandled action: ", message.action);
        break;
    }
  }

  async renderEmojis(title: string, emojis: any[], point?: DOMRect) {
    this.logger.log("#renderEmojis: ", title, emojis, point);
    const list = document.createElement("ul");
    list.classList.add("emoji-list");

    if (!emojis) {
      this.logger.debug("No emojis to render");
      return;
    }
    emojis.forEach((emoji) => {
      const el = document.createElement("li");
      el.innerHTML = emoji.emoji;
      el.addEventListener("mouseover", (e) => {
        this.dialog!.dom.querySelector(".wb-notice").classList.remove(
          "success",
          "hidden"
        );
        const truncate = (input) =>
          input.length > 31 ? `${input.substring(0, 28)}...` : input;
        this.dialog!.dom.querySelector(".wb-notice").innerHTML =
          ":" + truncate(emoji.description);
      });
      el.addEventListener("click", (e) => {
        navigator.clipboard.writeText(emoji.emoji);
        this.dialog!.dom.querySelector(".wb-notice").classList.add("success");
        this.dialog!.dom.querySelector(".wb-notice").innerHTML =
          "copied to clipboard!";
      });

      if (emoji.selected) {
        el.classList.add("selected");
      }
      list.appendChild(el);
    });

    list.addEventListener("mouseleave", (e) => {
      this.dialog!.dom.querySelector(".wb-notice").innerHTML = "";
      this.dialog!.dom.querySelector(".wb-notice").classList.remove("success");
      this.dialog!.dom.querySelector(".wb-notice").classList.add("hidden");
    });
    const winboxOptions = await this.getWinboxOptions(list, point);

    if (!this.dialog) {
      this.logger.debug("Creating new dialog with options", winboxOptions);
      this.dialog = new WinBox(i18n(title), winboxOptions);

      // Insert notice into header.
      const notice = document.createElement("span");
      notice.classList.add("wb-notice", "hidden");
      const header = this.dialog.dom.querySelector(".wb-header") as HTMLElement;
      if (header) {
        header.insertBefore(notice, header.lastChild);
      } else {
        this.logger.warn("Couldn't find header to insert notice into.");
      }

      // Add help buttons.
      this.dialog.addControl({
        index: 2,
        class: "wb-open material-symbols-outlined",
        title: "Help",
        image: "",
        click: (event, winbox) => {
          this.logger.debug("#openOptions");
          chrome.runtime.sendMessage("open_options_page");
        },
      });
    } else {
      this.logger.debug("Restoring dialog");
      this.dialog.move(
        winboxOptions.x,
        winboxOptions.y,
        /* skipUpdate= */ false
      );
      this.dialog.setTitle(i18n(title));
      this.dialog.mount(list);
    }
  }

  async getWinboxOptions(markup: HTMLElement, point?: DOMRect) {
    let pos = { x: 0, y: 0, placement: "top" };
    if (point) {
      pos = await this.getPos(point!);
    }
    return {
      icon: "",
      x: pos.x,
      y: pos.y,
      header: 20,
      background: "white",
      color: "black",
      width: 32 * (await Storage.getConfig("emoji-columns")) + "px", // step is 32px
      height: 20 + 31 * (await Storage.getConfig("emoji-rows")) + "px", // 20px+ row is 31px, 2 => 62px
      autosize: false,
      class: [
        "no-max",
        "no-close",
        "no-full",
        "no-min",
        "no-resize",
        "no-move",
      ],
      index: await this.getMaxZIndex(),
      // Simply updating the url without changing the iframe, means the content-script doesn't get re-inserted into the frame, even though it's now out of context.
      mount: markup,
      hidden: false,
      shadowel: "smart-emoji-keyboard-window",
      cssurl: chrome.runtime.getURL("content-script/winbox-extended.css"),

      onclose: () => {
        this.logger.debug("onclose");
        this.dialog = undefined;
        document
          .querySelectorAll("smart-emoji-keyboard-window")
          ?.forEach((e) => e.remove());
      },
    };
  }

  getMaxZIndex() {
    return new Promise((resolve: (arg0: number) => void) => {
      const z = Math.max(
        ...Array.from(document.querySelectorAll("body *"), (el) =>
          parseFloat(window.getComputedStyle(el).zIndex)
        ).filter((zIndex) => !Number.isNaN(zIndex)),
        0
      );
      resolve(z);
    });
  }

  async getPos(rect: DOMRect) {
    const virtualEl = {
      getBoundingClientRect() {
        return rect;
      },
    };
    const placeholder = document.createElement("div");
    // These dimensions need to match that of the dialog precisely.
    placeholder.style.width =
      32 * (await Storage.getConfig("emoji-columns")) + "px";
    placeholder.style.height =
      20 + 31 * (await Storage.getConfig("emoji-rows")) + "px";
    placeholder.style.position = "fixed";
    placeholder.style.visibility = "hidden";
    document.body.appendChild(placeholder);
    return computePosition(virtualEl, placeholder, {
      placement: "top",
      strategy: "fixed", // If you use "fixed", x, y would change to clientX/Y.
      middleware: [
        offset(5), // Space between mouse and tooltip.
        flip(),
        shift({ padding: 5 }), // Space from the edge of the browser.
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      placeholder.remove();
      return {
        x: x,
        y: y,
        placement: placement,
      };
    });
  }
}
