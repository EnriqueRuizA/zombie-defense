import { GAME_ID_REGEX } from "@zombie-defense/engine-api/Schemas";
import { assetUrl } from "@zombie-defense/shared/AssetUrls";
import { EventBus } from "@zombie-defense/shared/EventBus";
import {
  GameInfo,
  PublicGameInfo,
  WireGameStartInfo,
} from "@zombie-defense/shared/WireSchemas";
import { ClientEnv } from "src/client/ClientEnv";
import { renderNavVersion } from "src/client/GameVersion";
import type { JoinLobbyResult } from "./ClientGameRunner";
import { loadGameClient, prefetchGameClient } from "./GameClientLoader";
import "./GameModeSelector";
import { GameModeSelector } from "./GameModeSelector";
import { GameStartingModal } from "./GameStartingModal";
import type { HelpModal } from "./HelpModal";
import type { HostLobbyModal as HostPrivateLobbyModal } from "./HostLobbyModal";
import { showInGameConfirm } from "./InGameModal";
import type { JoinLobbyModal } from "./JoinLobbyModal";
import "./LangSelector";
import { LangSelector } from "./LangSelector";
import { initLayout } from "./Layout";
import { loadModal, prefetchModals, whenModalLoaded } from "./LazyModals";
import {
  SendKickPlayerIntentEvent,
  SendToggleGameStartTimer,
  SendUpdateGameConfigIntentEvent,
} from "./LobbyEvents";
import {
  hideMenuChrome,
  menuChromeIsTornDown,
  restoreMenuChrome,
} from "./MenuChrome";
import { modalRouter } from "./ModalRouter";
import { initNavigation } from "./Navigation";
import { capturePagePin } from "./PagePin";
import { fallbackPlayerName } from "./PlayerName";
import type { SinglePlayerModal } from "./SinglePlayerModal";
import { UserSettings } from "./UserSettings";
import "./UsernameInput";
import { UsernameInput } from "./UsernameInput";
import {
  currentPagePath,
  flushReloadToast,
  homeHref,
  reloadForUpdate,
  translateText,
} from "./Utils";
import {
  installCtrlWheelZoomBlocker,
  installDoubleTapZoomBlocker,
  installSafariPinchZoomBlocker,
} from "./utilities/DisableSafariPinchZoom";

import "./components/Footer";
import "./components/MainLayout";
import "./components/DesktopNavBar";
import "./components/MobileNavBar";
import "./components/PlayPage";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import "./styles.css";
import "./styles/core/typography.css";
import "./styles/core/variables.css";
import "./styles/layout/container.css";
import "./styles/layout/header.css";

declare global {
  interface Window {
    currentPageId?: string;
    showPage?: (pageId: string) => void;
  }

  // Extend the global interfaces to include your custom events
  interface DocumentEventMap {
    "join-lobby": CustomEvent<JoinLobbyEvent>;
    "kick-player": CustomEvent;
    toggle_game_start_timer: CustomEvent;
    "join-changed": CustomEvent;
    "leave-lobby": CustomEvent;
    "game-starting": CustomEvent;
    "menu-restored": CustomEvent;
    "update-game-config": CustomEvent;
  }
}

export interface JoinLobbyEvent {
  // Multiplayer games only have gameID, gameConfig is not known until game starts.
  gameID: string;
  // GameConfig only exists when playing a singleplayer game.
  gameStartInfo?: WireGameStartInfo;
  source?: "public" | "private" | "host" | "singleplayer";
  publicLobbyInfo?: GameInfo | PublicGameInfo;
  // Host only: the play token the lobby was created under (see createLobby).
  creatorToken?: string;
}

/**
 * The single point where "a match is running" is published.
 *
 * Two consumers, and they must never disagree:
 *   - the `.in-game` body class, which the client's own markup keys off to hide
 *     the footer, the nav bars and the menu chrome;
 *   - the local build's own bookkeeping in handleLeaveLobby, which restores the
 *     menu when the class is gone.
 *
 * Every add/remove of that class goes through here so the two can never drift.
 */
function setInGameSignal(inGame: boolean): void {
  document.body.classList.toggle("in-game", inGame);
}

class Client {
  private lobbyHandle: JoinLobbyResult | null = null;
  private eventBus: EventBus = new EventBus();

  private currentUrl: string | null = null;

  private usernameInput: UsernameInput | null = null;

  private hostModal: HostPrivateLobbyModal;
  private joinModal: JoinLobbyModal;
  private gameModeSelector: GameModeSelector;
  private userSettings: UserSettings = new UserSettings();
  private mostRecentJoinEvent: number;
  // A join the player has committed to but that has not reached a lobbyHandle
  // yet. `lobbyHandle` alone does not cover this: a public-lobby join awaits
  // whenSeeded() before the handle is assigned, and rewrites the URL only once
  // `join` resolves — so throughout that window the page still looks like a
  // pristine homepage.
  private joinInFlight = false;
  /**
   * Whether the home page is currently torn down for a game.
   *
   * For listeners that may not exist when "game-starting" fires: the event
   * carries no history, so anything registered later cannot tell "no game
   * yet" from "a game started while I was loading". The menu audio chunk is
   * exactly that case.
   */
  private menuTornDown = false;

  async initialize(): Promise<void> {
    // FIRST, ahead of every history write this client performs. A page served
    // under `/v/<commit>/` is pinned to that build, and the guards that depend
    // on knowing it (isPinnedToAVersion, currentPagePath) read it from here.
    // See PagePin.ts.
    capturePagePin();
    document.documentElement.style.setProperty(
      "--hud-opacity",
      String(this.userSettings.hudOpacity()),
    );

    flushReloadToast();

    // Stale key still in existing players' storage; nothing reads it.
    localStorage.removeItem("achievements.pushed");

    // One mixer for the page: the menu theme here and the SoundManager a game
    // creates later both route through it, so the volume sliders reach both.
    // It and howler are their own chunk, so the page doesn't wait on them. A
    // game that got there first has made the mixer already, and the menu theme
    // has no business starting under it.
    //
    // gameInProgress covers the other order, where this chunk lands while a
    // game is up but before the game client has built a mixer. startMenuMusic
    // only disarms on the "game-starting" it can hear, so arming it in that
    // window would leave it live under a running game, free to start the theme
    // over the gameplay track on the next click or music-volume change.
    Promise.all([import("./sound/AudioMixer"), import("./sound/MenuMusic")]).then(
      ([{ audioMixer, initAudioMixer }, { startMenuMusic }]) => {
        if (audioMixer() === null) {
          startMenuMusic(initAudioMixer(this.userSettings), {
            gameInProgress: this.menuTornDown,
          });
        }
      },
      (err) => console.error("Menu audio failed to load:", err),
    );

    // Register modals with the URL router. Lobby modals (join/host) are
    // intentionally omitted — they own their own URL state (path-based).
    modalRouter.register("settings", {
      tag: "user-setting",
      pageId: "page-settings",
    });
    modalRouter.register("help", { tag: "help-modal", pageId: "page-help" });
    modalRouter.register("language", {
      tag: "language-modal",
      pageId: "page-language",
    });
    modalRouter.register("single-player", {
      tag: "single-player-modal",
      pageId: "page-single-player",
    });
    modalRouter.register("troubleshooting", {
      tag: "troubleshooting-modal",
      pageId: "page-troubleshooting",
    });

    // Wait for components to render before setting version
    await customElements.whenDefined("mobile-nav-bar");
    await customElements.whenDefined("desktop-nav-bar");

    const openFrontFont = new FontFace(
      "OpenFront",
      `url(${assetUrl("fonts/OpenFront.ttf")})`,
    );
    document.fonts.add(openFrontFont);
    openFrontFont.load().catch(() => {});

    // The tagged version only, so a player's version reads the same everywhere.
    if (renderNavVersion() === 0) {
      console.warn("Game version element not found");
    }

    const langSelector = document.querySelector(
      "lang-selector",
    ) as LangSelector;
    if (!langSelector) {
      console.warn("Lang selector element not found");
    }

    this.usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput;
    if (!this.usernameInput) {
      console.warn("Username input element not found");
    }

    this.gameModeSelector = document.querySelector(
      "game-mode-selector",
    ) as GameModeSelector;

    window.addEventListener("beforeunload", async () => {
      console.log("Browser is closing");
      if (this.lobbyHandle !== null) {
        setInGameSignal(false);
        this.lobbyHandle.stop(true);
      }
    });

    document.addEventListener("join-lobby", (event) => {
      // A rejected join never assigns lobbyHandle, so nothing downstream
      // clears the flag it set. Re-throw so the failure still surfaces
      // exactly as it does today.
      void this.handleJoinLobby(event).catch((error) => {
        // joinInFlight has exactly the same problem: set when the join
        // committed, and cleared only on the two paths that reach a handle.
        // Guarded on the timestamp so a join that failed after being
        // superseded cannot clear the flag its successor is relying on.
        if (joinOwnsInFlightFlag(this.mostRecentJoinEvent, event.timeStamp)) {
          this.joinInFlight = false;
        }
        throw error;
      });
    });
    document.addEventListener("leave-lobby", this.handleLeaveLobby.bind(this));
    document.addEventListener("kick-player", this.handleKickPlayer.bind(this));
    document.addEventListener(
      "toggle_game_start_timer",
      this.handleToggleGameStartTimer.bind(this),
    );
    document.addEventListener(
      "update-game-config",
      this.handleUpdateGameConfig.bind(this),
    );

    const hlpModal = document.querySelector("help-modal") as HelpModal | null;
    if (!hlpModal) {
      console.warn("Help modal element not found");
    }
    const helpButton = document.getElementById("help-button");
    if (helpButton) {
      helpButton.addEventListener("click", () => {
        loadModal("help-modal").then(
          () => hlpModal?.open(),
          (err) => console.error("help-modal failed to load:", err),
        );
      });
    }
    // Tutorial entry points (play-page card, help page): back to the play page
    // if needed (so a username problem is visible), then a default solo game
    // with the guide on.
    document.addEventListener("start-tutorial", () => {
      // The help modal loads on demand (see LazyModals); until it has, it
      // can't be open.
      if (customElements.get("help-modal") && hlpModal?.isOpen()) {
        hlpModal.close();
      }
      if (this.usernameInput && !this.usernameInput.canPlay()) return;
      whenModalLoaded("single-player-modal", () => {
        void (
          document.querySelector("single-player-modal") as SinglePlayerModal
        )?.startTutorial();
      });
    });

    // Both load on demand (see LazyModals). whenDefined resolves while a
    // modal's module is still evaluating, so they have the bus before
    // whatever loaded them can open them.
    this.hostModal = document.querySelector(
      "host-lobby-modal",
    ) as HostPrivateLobbyModal;
    if (!this.hostModal) {
      console.warn("Host private lobby modal element not found");
    } else {
      void customElements.whenDefined("host-lobby-modal").then(() => {
        this.hostModal.eventBus = this.eventBus;
      });
    }

    this.joinModal = document.querySelector(
      "join-lobby-modal",
    ) as JoinLobbyModal;
    if (!this.joinModal) {
      console.warn("Join lobby modal element not found");
    } else {
      void customElements.whenDefined("join-lobby-modal").then(() => {
        this.joinModal.eventBus = this.eventBus;
      });
    }

    // Attempt to join lobby from the current URL once the document is ready.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.handleUrl());
    } else {
      this.handleUrl();
    }

    const onHashUpdate = () => {
      // Router-managed hash changes (#modal=...) are handled by the router
      // syncing in/out; we don't need to tear down the lobby state for them.
      if (modalRouter.isHashRouted()) {
        modalRouter.routeFromHash();
        return;
      }

      // Reset the UI to its initial state.
      this.loadedJoinModal()?.close();

      onJoinChanged();
    };

    const leaveGame = () => {
      // Redirect to the home page.
      window.location.href = homeHref();
    };

    const onPopState = () => {
      if (this.currentUrl !== null && this.lobbyHandle !== null) {
        console.info("Game is active");

        if (!this.lobbyHandle.stop()) {
          console.info("Player is active, ask before leaving game");

          // We can't block navigation on an async confirmation, so restore the
          // history entry immediately and only leave once the player confirms.
          history.pushState(null, "", this.currentUrl);
          showInGameConfirm(translateText("help_modal.exit_confirmation")).then(
            (isConfirmed) => {
              if (isConfirmed) leaveGame();
            },
          );
          return;
        }

        console.info("Player is not active, leave the game immediately");

        leaveGame();
      } else {
        console.info("Game not active, handle hash update");

        onHashUpdate();
      }
    };

    const onJoinChanged = () => {
      if (this.lobbyHandle !== null) {
        this.handleLeaveLobby();
      }

      // Attempt to join lobby
      this.handleUrl();
    };

    // Handle browser navigation (back/forward) and manual hash edits.
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashUpdate);
    window.addEventListener("join-changed", onJoinChanged);

    function updateSliderProgress(slider: HTMLInputElement) {
      const percent =
        ((Number(slider.value) - Number(slider.min)) /
          (Number(slider.max) - Number(slider.min))) *
        100;
      slider.style.setProperty("--progress", `${percent}%`);
    }

    document
      .querySelectorAll<HTMLInputElement>(
        "#bots-count, #private-lobby-bots-count",
      )
      .forEach((slider) => {
        updateSliderProgress(slider);
        slider.addEventListener("input", () => updateSliderProgress(slider));
      });
  }

  /**
   * Close the menu's modals and hide its chrome, for something that replaces
   * the menu: a game at prestart. Callers dispatch "game-starting" first, so
   * the listeners that stay up through a lobby wait (menu music) stop too.
   */
  private closeMenu(): void {
    [
      "single-player-modal",
      "game-starting-modal",
      "game-top-bar",
      "help-modal",
      "user-setting",
      // The in-game instance is addressed by id: querySelector("user-setting")
      // above only ever reaches the page's inline one.
      "#game-settings",
      "troubleshooting-modal",
      "language-modal",
      "lang-selector",
    ].forEach((tag) => {
      const modal = document.querySelector(tag) as HTMLElement & {
        close?: () => void;
        isModalOpen?: boolean;
      };
      if (modal?.close) {
        modal.close();
      } else if (modal && "isModalOpen" in modal) {
        modal.isModalOpen = false;
      }
    });
    this.gameModeSelector.stop();
    hideMenuChrome();
  }

  /** A game or lobby is up, or a join is on its way to one. */
  private gameUnderway(): boolean {
    return this.lobbyHandle !== null || this.joinInFlight;
  }

  private async handleUrl() {
    const hash = window.location.hash;

    // Decode the hash first to handle encoded characters
    const decodedHash = decodeURIComponent(hash);

    // Every version's page is also served under /v/<commit>/, so the game
    // path may sit behind that prefix.
    const pathMatch = window.location.pathname.match(
      /^(?:\/v\/[^/]+)?\/(?:w\d+\/)?game\/([^/]+)/,
    );
    const lobbyId =
      pathMatch && GAME_ID_REGEX.test(pathMatch[1]) ? pathMatch[1] : null;
    if (lobbyId) {
      // ?host means the lobby creator is returning to a successor lobby they
      // reused from the win screen: reopen the host view bound to the existing
      // lobby instead of the join flow. Non-creators who hit this URL still get
      // treated as normal joiners by the server.
      const returningAsHost = new URLSearchParams(window.location.search).has(
        "host",
      );
      if (returningAsHost) {
        // open() reveals the inline page itself (it calls showPage internally).
        // Calling showPage first would open the modal once with no args and
        // spuriously create a lobby before this attach call runs.
        whenModalLoaded("host-lobby-modal", () =>
          this.hostModal.open({ existingLobbyId: lobbyId }),
        );
        console.log(`reopening host lobby ${lobbyId}`);
        return;
      }
      // Join by local id/link always resolves on this origin (R13): a missing
      // or full lobby is a local error from the join modal, never a redirect.
      whenModalLoaded("join-lobby-modal", () => {
        window.showPage?.("page-join-lobby");
        this.joinModal.open({ lobbyId });
      });
      console.log(`joining lobby ${lobbyId}`);
      return;
    }
    if (modalRouter.routeFromHash()) {
      return;
    }
    if (decodedHash.startsWith("#refresh")) {
      window.location.href = homeHref();
    }
  }

  // The lobby modals load on demand (see LazyModals); until one has, it
  // can't be open, so there's nothing to close.
  private loadedJoinModal(): JoinLobbyModal | null {
    return customElements.get("join-lobby-modal") ? this.joinModal : null;
  }

  private loadedHostModal(): HostPrivateLobbyModal | null {
    return customElements.get("host-lobby-modal") ? this.hostModal : null;
  }

  private async handleJoinLobby(event: CustomEvent<JoinLobbyEvent>) {
    const lobby = event.detail;
    if (this.usernameInput && !this.usernameInput.canPlay()) {
      // The singleplayer modal shows the starting overlay before dispatching
      // join-lobby; a refused join must release it or it stays over the menu.
      const startingModal = document.querySelector("game-starting-modal");
      if (startingModal instanceof GameStartingModal) {
        startingModal.hide();
      }
      return;
    }
    // Only once the join is actually going ahead: a refused dispatch that
    // bumped this would supersede a legitimate join still underway, stopping
    // it as stale and leaving the player nowhere.
    this.mostRecentJoinEvent = event.timeStamp;
    // Cleared on both ways out of the pre-handle window (superseded, or the
    // handle being assigned) and by handleLeaveLobby, which runs its reset
    // above its own lobbyHandle guard precisely because this window exists.
    this.joinInFlight = true;

    console.log(`joining lobby ${lobby.gameID}`);
    // Entering a lobby. Singleplayer and lobbies from the local list know
    // their config up front; everything else is filled in by the lobby_info
    // subscription in initialize() a moment later.

    if (this.lobbyHandle !== null) {
      console.log("joining lobby, stopping existing game");
      this.lobbyHandle.stop(true);
      setInGameSignal(false);
    }
    if (lobby.source === "public") {
      // Awaited so the modal opens before the join goes on to close it. A
      // modal that won't load doesn't stop the join.
      await loadModal("join-lobby-modal").catch((err) =>
        console.error("join-lobby-modal failed to load:", err),
      );
      this.loadedJoinModal()?.open({
        lobbyId: lobby.gameID,
        lobbyInfo: lobby.publicLobbyInfo,
      });
    }
    // Only update URL immediately for private lobbies, not list ones
    if (lobby.source !== "public") {
      this.updateJoinUrlForShare(lobby.gameID);
    }
    // Local identity: no session to resolve, no role to claim.
    const isSingleplayer = lobby.source === "singleplayer";
    // Ensure the local nick has settled before reading it: whenSeeded()
    // always resolves (falling back to the generated anon name on
    // failure/timeout), so this can only delay, never block.
    await this.usernameInput?.whenSeeded();
    const resolvedName =
      this.usernameInput?.resolvedName() ?? fallbackPlayerName();
    let joinLobby: typeof import("./ClientGameRunner").joinLobby;
    try {
      ({ joinLobby } = await loadGameClient());
    } catch (err) {
      // The game's chunk didn't load (a network error, or a deploy that
      // replaced it). A full page load also picks up a new deploy, unless the
      // player has since left or started another join.
      console.error("game client failed to load:", err);
      if (this.mostRecentJoinEvent !== event.timeStamp) return;
      // The URL names the singleplayer game now, which no server has.
      if (isSingleplayer) history.replaceState(null, "", "/");
      reloadForUpdate();
      return;
    }
    const newLobbyHandle = joinLobby(this.eventBus, {
      gameID: lobby.gameID,
      // No cosmetics in a local build (R6): the empty refs object is every
      // slot unset, which is what the server would have resolved for a player
      // with nothing equipped.
      cosmetics: {},
      playerName: resolvedName.name,
      playerClanTag: null,
      playerRole: null,
      gameStartInfo: lobby.gameStartInfo,
      creatorToken: lobby.creatorToken,
    });

    if (this.mostRecentJoinEvent !== event.timeStamp) {
      newLobbyHandle.stop(true);
      console.warn("Join requested, but was superseded");
      // Deliberately NOT clearing joinInFlight: the flag belongs to the newer
      // join now, and that join clears it on its own exits.
      return;
    }

    this.lobbyHandle = newLobbyHandle;
    // From here lobbyHandle is the guard.
    this.joinInFlight = false;

    this.lobbyHandle.prestart.then(() => {
      // The game is actually starting now (lobby wait is over). Let listeners
      // that stay up through the wait (the menu music) hide at this point
      // instead of on join.
      this.menuTornDown = true;
      document.dispatchEvent(new CustomEvent("game-starting"));
      console.log("Closing modals");
      if (this.usernameInput) {
        // fix edge case where username-validation-error is re-rendered and hidden tag removed
        this.usernameInput.validationError = "";
      }
      document
        .getElementById("username-validation-error")
        ?.classList.add("hidden");
      // Disarm BOTH lobby modals before closing either: closing any
      // page-modal navigates via showPage, which force-closes the currently
      // visible page — the other lobby modal. If that one is still armed,
      // its onClose leaves the lobby and disconnects the player mid
      // game-start (host or joiner, depending on close order).
      this.loadedHostModal()?.disarmLeaveOnClose();
      this.loadedJoinModal()?.disarmLeaveOnClose();
      this.loadedHostModal()?.closeWithoutLeaving();
      this.loadedJoinModal()?.closeWithoutLeaving();
      this.closeMenu();

      // show when the game loads
      const startingModal = document.querySelector(
        "game-starting-modal",
      ) as GameStartingModal;
      if (startingModal && startingModal instanceof GameStartingModal) {
        startingModal.show();
      }
    });

    this.lobbyHandle.join.then(() => {
      this.loadedJoinModal()?.closeWithoutLeaving();
      this.gameModeSelector.stop();

      hideMenuChrome();
      setInGameSignal(true);

      const lobbyIdHidden = !this.userSettings.lobbyIdVisibility();
      // Ensure there's a homepage entry in history before adding the lobby
      // entry
      if (window.location.hash === "" || window.location.hash === "#") {
        history.replaceState(null, "", window.location.origin + "#refresh");
      }
      history.pushState(
        null,
        "",
        currentPagePath(
          lobbyIdHidden
            ? "/streamer-mode"
            : `${ClientEnv.gamePath(lobby.gameID)}?live`,
        ),
      );

      // Store current URL for popstate confirmation
      this.currentUrl = window.location.href;
    });
  }

  private updateJoinUrlForShare(lobbyId: string) {
    const lobbyIdHidden = !this.userSettings.lobbyIdVisibility();
    // Version-free on purpose, unlike the in-game entry below: this is the
    // URL people copy out of the address bar to invite someone, and a local
    // recipient is routed to the same origin's own join flow.
    const targetUrl = lobbyIdHidden
      ? "/streamer-mode"
      : ClientEnv.gamePath(lobbyId);
    const currentUrl = window.location.pathname;

    if (currentUrl !== targetUrl) {
      history.replaceState(null, "", targetUrl);
    }
  }

  private async handleLeaveLobby(event?: CustomEvent) {
    // Above the lobbyHandle guard on purpose: a modal closed during the
    // pre-handle window dispatches leave-lobby, and the flag it set must not
    // be stranded forever.
    this.joinInFlight = false;
    // And supersede whatever join is still in flight. performance.now() is the
    // same clock Event.timeStamp comes from, so this is always newer than any
    // join already under way and older than any dispatched after it.
    this.mostRecentJoinEvent = performance.now();

    if (this.lobbyHandle === null) {
      return;
    }
    console.log("leaving lobby, cancelling game");
    this.lobbyHandle.stop(true);
    this.lobbyHandle = null;
    this.currentUrl = null;

    try {
      history.replaceState(null, "", "/");
    } catch (e) {
      console.warn("Failed to restore URL on leave:", e);
    }

    setInGameSignal(false);

    // The inverse of the game-start teardown. Every other exit from a started
    // game navigates, and the reload did this implicitly; this path leaves in
    // place, so it has to do it explicitly.
    if (menuChromeIsTornDown()) {
      this.gameModeSelector?.start();
      restoreMenuChrome();
      // The counterpart to "game-starting", and the only signal that the home
      // page is live again without a navigation. MenuMusic tore its gesture
      // listeners down at prestart and needs them back, or the menu theme is
      // silent for the rest of the session.
      this.menuTornDown = false;
      document.dispatchEvent(new CustomEvent("menu-restored"));
    }

    if (this.loadedJoinModal()?.isOpen()) {
      this.joinModal.close();
      if (
        event?.detail.cause === "full-lobby" ||
        event?.detail.cause === "game-started"
      ) {
        window.dispatchEvent(
          new CustomEvent("show-message", {
            detail: {
              message: translateText("public_lobby.join_timeout"),
              color: "red",
              duration: 3500,
            },
          }),
        );
      }
    }
  }

  private handleKickPlayer(event: CustomEvent) {
    const { target } = event.detail;

    // Forward to eventBus if available
    if (this.eventBus) {
      this.eventBus.emit(new SendKickPlayerIntentEvent(target));
    }
  }

  private handleToggleGameStartTimer() {
    if (this.eventBus) {
      this.eventBus.emit(new SendToggleGameStartTimer());
    }
  }

  private handleUpdateGameConfig(event: CustomEvent) {
    const { config } = event.detail;

    // Forward to eventBus if available
    if (this.eventBus) {
      this.eventBus.emit(new SendUpdateGameConfigIntentEvent(config));
    }
  }
}

/**
 * True when the join that owns `flaggedAt` is the one that set joinInFlight.
 *
 * A join that failed after being superseded must not clear the flag its
 * successor is relying on: only the join whose timestamp still matches owns it.
 */
function joinOwnsInFlightFlag(flaggedAt: number, current: number): boolean {
  return flaggedAt === current;
}

// Initialize the client when the DOM is loaded
const bootstrap = () => {
  // Prevent Safari's page-level pinch-zoom, which ignores `user-scalable=no`
  // on iOS and can softlock the HUD. See issue #2330.
  installSafariPinchZoomBlocker();

  // Same for double-tap "smart zoom", which `touch-action: manipulation`
  // alone does not reliably stop on iOS. See issue #4609.
  installDoubleTapZoomBlocker();

  // Chrome and Firefox report a trackpad pinch as ctrl+wheel, which only the
  // map canvas cancels — so pinching over a HUD panel zoomed the page instead
  // of the map. See issue #5098.
  installCtrlWheelZoomBlocker();

  initLayout();
  new Client().initialize();
  initNavigation();
  prefetchGameClient();
  prefetchModals();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
