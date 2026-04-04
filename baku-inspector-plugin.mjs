const INSPECTOR_SCRIPT = `
(function bakuInspector() {
  "use strict";
  if (window.__bakuInspectorActive) return;
  window.__bakuInspectorActive = true;

  let state = "idle";
  let showHighlight = true;
  let currentEl = null;
  let selectedEl = null;

  const overlay = document.createElement("div");
  overlay.id = "__baku-inspector-overlay";
  Object.assign(overlay.style, {
    position: "fixed", pointerEvents: "none", zIndex: "2147483647",
    border: "2px solid rgba(59, 130, 246, 0.8)",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderRadius: "2px", transition: "all 80ms ease-out", display: "none",
  });
  document.documentElement.appendChild(overlay);

  function positionOverlay(el) {
    if (!el || !showHighlight) { overlay.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: "block", top: r.top+"px", left: r.left+"px",
      width: r.width+"px", height: r.height+"px",
    });
  }

  function setSelectedStyle() {
    Object.assign(overlay.style, {
      border: "2px solid rgba(59, 130, 246, 1)",
      backgroundColor: "rgba(59, 130, 246, 0.12)",
    });
  }

  function setHoverStyle() {
    Object.assign(overlay.style, {
      border: "2px solid rgba(59, 130, 246, 0.8)",
      backgroundColor: "rgba(59, 130, 246, 0.08)",
    });
  }

  function getCssSelector(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\\s+/).filter(Boolean);
        if (cls.length > 0) sel += "." + cls.slice(0,3).map(c => CSS.escape(c)).join(".");
      }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (sibs.length > 1) sel += ":nth-of-type(" + (sibs.indexOf(cur)+1) + ")";
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function getXPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(cur.tagName.toLowerCase() + "[" + idx + "]");
      cur = cur.parentElement;
    }
    return "/" + parts.join("/");
  }

  function getElementInfo(el) {
    const r = el.getBoundingClientRect();
    return {
      type: "baku-inspector-click",
      selector: getCssSelector(el),
      xpath: getXPath(el),
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || "").trim().slice(0, 100),
      classList: Array.from(el.classList),
      bounds: { top: r.top, left: r.left, width: r.width, height: r.height },
    };
  }

  function isOvl(el) { return el === overlay || overlay.contains(el); }

  function onMouseMove(e) {
    if (state !== "hovering") return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOvl(el) || el === document.documentElement || el === document.body) return;
    if (el !== currentEl) {
      currentEl = el;
      positionOverlay(el);
      window.parent.postMessage({
        type: "baku-inspector-hover", selector: getCssSelector(el),
        tagName: el.tagName.toLowerCase(),
        bounds: (function() { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; })(),
      }, "*");
    }
  }

  function onClick(e) {
    if (state !== "hovering") return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOvl(el)) return;
    state = "selected"; selectedEl = el; currentEl = el;
    positionOverlay(el); setSelectedStyle();
    window.parent.postMessage(getElementInfo(el), "*");
  }

  function activate(opts) {
    showHighlight = opts && typeof opts.showHighlight === "boolean" ? opts.showHighlight : true;
    state = "hovering"; selectedEl = null; currentEl = null;
    setHoverStyle(); overlay.style.display = "none";
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.body.style.cursor = "crosshair";
  }

  function deactivate() {
    state = "idle"; selectedEl = null; currentEl = null;
    overlay.style.display = "none";
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.body.style.cursor = "";
  }

  function clearSelection() {
    if (state !== "selected") return;
    state = "hovering"; selectedEl = null; currentEl = null;
    setHoverStyle(); overlay.style.display = "none";
  }

  window.addEventListener("message", function(event) {
    if (event.source !== window.parent) return;
    if (!event.data || typeof event.data.type !== "string") return;
    switch (event.data.type) {
      case "baku-inspector-start": activate(event.data); break;
      case "baku-inspector-stop": deactivate(); break;
      case "baku-inspector-clear-selection": clearSelection(); break;
    }
  });

  window.parent.postMessage({ type: "baku-inspector-ready" }, "*");
})();
`;

const CONSOLE_CAPTURE_SCRIPT = `
(function bakuConsoleCapture() {
  "use strict";
  if (window.__bakuConsoleActive) return;
  window.__bakuConsoleActive = true;

  var MAX_TEXT_LENGTH = 4000;

  function serialize(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === undefined) { parts.push("undefined"); }
      else if (arg === null) { parts.push("null"); }
      else if (typeof arg === "string") { parts.push(arg); }
      else if (arg instanceof Error) { parts.push(arg.stack || arg.message || String(arg)); }
      else if (typeof arg === "symbol") { parts.push(String(arg)); }
      else {
        try { parts.push(JSON.stringify(arg, circularReplacer(), 2)); }
        catch (_e) { parts.push(String(arg)); }
      }
    }
    var text = parts.join(" ");
    if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH) + "… (truncated)";
    return text;
  }

  function circularReplacer() {
    var seen = new WeakSet();
    return function (_key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "function") return "[Function: " + (value.name || "anonymous") + "]";
      if (value instanceof HTMLElement) return "<" + value.tagName.toLowerCase() + ">";
      return value;
    };
  }

  function extractLocation(stack) {
    if (!stack) return {};
    var lines = stack.split("\\n");
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      // Skip frames from the capture script itself
      if (line.indexOf("bakuConsoleCapture") !== -1) continue;
      if (line.indexOf("baku-inspector-plugin") !== -1) continue;
      if (line.indexOf("baku-console-capture") !== -1) continue;
      // V8/Chrome format: "at fn (url:line:col)" or "at url:line:col"
      // Handle URLs with port numbers (e.g. https://localhost:3000/src/App.tsx:10:5)
      var match = line.match(/(?:at\\s+(?:.*?\\(|))((?:https?:\\/\\/[^:/]+(?::\\d+)?[^:)]*|[^:)]+)):(\\d+):(\\d+)/);
      if (!match) {
        // Firefox/Safari format: "fn@url:line:col"
        match = line.match(/@((?:https?:\\/\\/[^:/]+(?::\\d+)?[^:]*|[^:]+)):(\\d+):(\\d+)/);
      }
      if (match) return { source: match[1], line: parseInt(match[2], 10), column: parseInt(match[3], 10) };
    }
    return {};
  }

  function sendLog(level, text, extra) {
    var msg = { type: "baku-console-log", level: level, text: text, timestamp: Date.now() };
    if (extra) {
      if (extra.source !== undefined) msg.source = extra.source;
      if (extra.line !== undefined) msg.line = extra.line;
      if (extra.column !== undefined) msg.column = extra.column;
      if (extra.stackTrace !== undefined) msg.stackTrace = extra.stackTrace;
    }
    window.parent.postMessage(msg, "*");
  }

  var LEVELS = ["log", "warn", "error", "info", "debug"];
  var originals = {};
  var _inCapture = false;
  for (var i = 0; i < LEVELS.length; i++) {
    (function (level) {
      originals[level] = console[level];
      console[level] = function () {
        originals[level].apply(console, arguments);
        if (_inCapture) return;
        _inCapture = true;
        try {
          var text = serialize(arguments);
          var captureErr = new Error();
          var loc = extractLocation(captureErr.stack);
          var extra = loc;
          if (level === "error") {
            extra.stackTrace = captureErr.stack;
          }
          sendLog(level, text, extra);
        } catch (_e) {
          // Capture failure must never propagate to user code
        } finally {
          _inCapture = false;
        }
      };
    })(LEVELS[i]);
  }

  window.addEventListener("error", function (event) {
    var text = event.message || "Unknown error";
    if (event.filename) {
      text += " at " + event.filename;
      if (event.lineno != null) text += ":" + event.lineno;
      if (event.colno != null) text += ":" + event.colno;
    }
    var extra = { source: event.filename || undefined, line: event.lineno != null ? event.lineno : undefined, column: event.colno != null ? event.colno : undefined };
    if (event.error && event.error.stack) extra.stackTrace = event.error.stack;
    if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH) + "… (truncated)";
    sendLog("exception", text, extra);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var text;
    if (reason instanceof Error) {
      text = "Unhandled Promise Rejection: " + (reason.stack || reason.message);
    } else if (typeof reason === "symbol") {
      text = "Unhandled Promise Rejection: " + String(reason);
    } else {
      try { text = "Unhandled Promise Rejection: " + JSON.stringify(reason, circularReplacer(), 2); }
      catch (_e) { text = "Unhandled Promise Rejection: " + String(reason); }
    }
    if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH) + "… (truncated)";
    var extra = {};
    if (reason instanceof Error && reason.stack) {
      extra = extractLocation(reason.stack);
      extra.stackTrace = reason.stack;
    }
    sendLog("exception", text, extra);
  });

  window.parent.postMessage({ type: "baku-console-ready" }, "*");
})();
//# sourceURL=baku-console-capture.js
`;

const AGENT_SCRIPT = `
(function bakuAgent() {
  "use strict";
  if (window.__bakuAgentActive) return;
  window.__bakuAgentActive = true;

  // Strip __preview_token from the URL so any reload (HMR fallback, F5,
  // mobile memory discard) authenticates via the CHIPS cookie instead of
  // the embedded query param. The proxy checks query param BEFORE cookie
  // and does not fall through on expiry.
  try {
    var loc = window.location;
    var u = new URL(loc.href);
    if (u.searchParams.has("__preview_token")) {
      u.searchParams.delete("__preview_token");
      var q = u.searchParams.toString();
      window.history.replaceState(null, "", u.pathname + (q ? "?" + q : "") + u.hash);
    }
  } catch (_e) {}

  var MAX_RESULT_LENGTH = 10000;

  function circularReplacer() {
    var seen = new WeakSet();
    return function (_key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "function") return "[Function: " + (value.name || "anonymous") + "]";
      if (value instanceof HTMLElement) return "<" + value.tagName.toLowerCase() + ">";
      return value;
    };
  }

  function serialize(v) {
    if (v === undefined) return "undefined";
    var text;
    try { text = JSON.stringify(v, circularReplacer()); }
    catch (_e) { text = String(v); }
    if (text.length > MAX_RESULT_LENGTH) text = text.slice(0, MAX_RESULT_LENGTH) + "… (truncated)";
    return text;
  }

  function reply(id, result, error) {
    window.parent.postMessage({ type: "baku-agent-result", id: id, result: result, error: error }, "*");
  }

  var htmlToImagePromise = null;

  function loadHtmlToImage() {
    if (htmlToImagePromise) return htmlToImagePromise;
    htmlToImagePromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js";
      s.integrity = "sha512-iZ2ORl595Wx6miw+GuadDet4WQbdSWS3JLMoNfY8cRGoEFy6oT3G9IbcrBeL6AfkgpA51ETt/faX6yLV+/gFJg==";
      s.crossOrigin = "anonymous";
      s.referrerPolicy = "no-referrer";
      s.onload = function () {
        if (window.htmlToImage) {
          resolve(window.htmlToImage);
        } else {
          s.remove();
          htmlToImagePromise = null;
          reject(new Error("html-to-image loaded but global missing"));
        }
      };
      s.onerror = function () {
        s.remove();
        htmlToImagePromise = null;
        reject(new Error("Failed to load html-to-image from CDN"));
      };
      document.head.appendChild(s);
    });
    return htmlToImagePromise;
  }

  var THUMB_W = 600;

  function takeScreenshot(id, thumbnail) {
    loadHtmlToImage()
      .then(function (htmlToImage) {
        var src = document.documentElement;
        var srcW = src.clientWidth;
        var srcH = src.clientHeight;
        if (!srcW || !srcH) {
          throw new Error("zero-size viewport");
        }
        var opts = {
          imagePlaceholder: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdjePDgwX8ACOQDoNsk0PMAAAAASUVORK5CYII=",
          width: srcW,
          height: srcH,
          pixelRatio: 1,
        };
        if (thumbnail) {
          var w = Math.min(THUMB_W, srcW);
          opts.canvasWidth = w;
          opts.canvasHeight = Math.round(w * (srcH / srcW));
        }
        return htmlToImage.toPng(src, opts);
      })
      .then(function (dataUrl) { reply(id, dataUrl, undefined); })
      .catch(function (e) { reply(id, undefined, String((e && e.stack) || e)); });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    if (!event.data) return;

    if (event.data.type === "baku-agent-screenshot") {
      takeScreenshot(event.data.id, event.data.thumbnail);
      return;
    }

    if (event.data.type === "baku-agent-goto") {
      if (typeof event.data.path !== "string" || !event.data.path) return;
      try { window.location.assign(event.data.path); } catch (_e) {}
      return;
    }

    if (event.data.type === "baku-agent-history") {
      if (!Number.isInteger(event.data.delta)) return;
      try { window.history.go(event.data.delta); } catch (_e) {}
      return;
    }

    if (event.data.type !== "baku-agent-eval") return;

    var id = event.data.id;
    var code = event.data.code;
    var result, error;

    try {
      // Indirect eval so var declarations land on the preview's window, not this IIFE's closure.
      result = (0, eval)(code);
      // Flatten promises so Claude can await fetch() etc. in one call.
      if (result && typeof result.then === "function") {
        result.then(
          function (v) { reply(id, serialize(v), undefined); },
          function (e) { reply(id, undefined, String((e && e.stack) || e)); },
        );
        return;
      }
      result = serialize(result);
    } catch (e) {
      error = String((e && e.stack) || e);
    }

    reply(id, result, error);
  });

  // --- Navigation reporting ---------------------------------------------
  function reportNav() {
    try {
      var loc = window.location;
      window.parent.postMessage({
        type: "baku-agent-navigate",
        path: loc.pathname + loc.search + loc.hash,
      }, "*");
    } catch (_e) {}
  }
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    reportNav();
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    reportNav();
  };
  window.addEventListener("popstate", reportNav);
  window.addEventListener("hashchange", reportNav);
  reportNav();

  window.parent.postMessage({ type: "baku-agent-ready" }, "*");
})();
//# sourceURL=baku-agent.js
`;

const ERROR_FORWARD_MODULE_ID = "virtual:baku-error-forward";
const ERROR_FORWARD_RESOLVED_ID = "\0" + ERROR_FORWARD_MODULE_ID;

// Served as a real Vite module (not an inline script) so import.meta.hot is
// available — inline scripts don't go through Vite's import-analysis pass.
const ERROR_FORWARD_MODULE = `
if (import.meta.hot) {
  // Build-time errors (syntax, transform, resolve failures)
  import.meta.hot.on("vite:error", (payload) => {
    const err = payload.err || {};
    window.parent.postMessage({
      type: "baku-build-error",
      error: {
        message: err.message,
        file: err.id || err.loc?.file,
        line: err.loc?.line,
        column: err.loc?.column,
        frame: err.frame,
        stack: err.stack,
        plugin: err.plugin,
      },
    }, "*");
  });
  import.meta.hot.on("vite:beforeUpdate", () => {
    window.parent.postMessage({ type: "baku-build-error-cleared" }, "*");
  });

  // Runtime errors (uncaught exceptions, unhandled rejections). Sent to the
  // dev server over the HMR WebSocket so they land in /tmp/browser-errors.log
  // for the stop hook, and to the parent frame for the Claude Ship UI.
  const sendRuntime = (error) => {
    import.meta.hot.send("baku:runtime-error", error);
    window.parent.postMessage({ type: "baku-runtime-error", error }, "*");
  };
  window.addEventListener("error", (e) => {
    sendRuntime({
      kind: "uncaught",
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    sendRuntime({
      kind: "unhandledrejection",
      message: String(e.reason?.message ?? e.reason),
      stack: e.reason?.stack,
    });
  });
}
`;

import { appendFileSync } from "node:fs";

const RUNTIME_ERROR_LOG = "/tmp/browser-errors.log";

export default function bakuInspectorPlugin() {
  return {
    name: "baku-inspector",
    apply: "serve",
    config() {
      // Suppress Vite's built-in error overlay — the parent frame handles
      // error display via the baku-build-error postMessage instead.
      return { server: { hmr: { overlay: false } } };
    },
    configureServer(server) {
      // Receive runtime errors from the browser over the HMR WebSocket and
      // write them to disk so the stop hook can surface them to Claude.
      server.hot.on("baku:runtime-error", (data) => {
        try {
          appendFileSync(
            RUNTIME_ERROR_LOG,
            JSON.stringify({ ...data, at: new Date().toISOString() }) + "\n",
          );
        } catch {
          // Best-effort; don't crash the dev server on a logging failure.
        }
      });
    },
    resolveId(id) {
      if (id === ERROR_FORWARD_MODULE_ID) return ERROR_FORWARD_RESOLVED_ID;
    },
    load(id) {
      if (id === ERROR_FORWARD_RESOLVED_ID) return ERROR_FORWARD_MODULE;
    },
    transformIndexHtml() {
      return [
        { tag: "script", injectTo: "body", children: INSPECTOR_SCRIPT },
        { tag: "script", injectTo: "body", children: CONSOLE_CAPTURE_SCRIPT },
        { tag: "script", injectTo: "body", children: AGENT_SCRIPT },
        {
          tag: "script",
          attrs: { type: "module", src: "/@id/__x00__" + ERROR_FORWARD_MODULE_ID },
          injectTo: "body",
        },
      ];
    },
  };
}
