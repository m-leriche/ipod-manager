// This script runs in the browser context BEFORE any app code loads.
// It sets up window.__TAURI_INTERNALS__ so Tauri API calls work outside the Tauri shell.
// Command responses are pre-set via window.__TAURI_MOCK_RESPONSES__ from a prior addInitScript call.

(function () {
  var responses = window.__TAURI_MOCK_RESPONSES__ || {};

  // Event listener registry
  var listeners = new Map();
  var callbacks = new Map();

  function registerCallback(callback, once) {
    var id = crypto.getRandomValues(new Uint32Array(1))[0];
    callbacks.set(id, function (data) {
      if (once) callbacks.delete(id);
      return callback && callback(data);
    });
    return id;
  }

  function runCallback(id, data) {
    var cb = callbacks.get(id);
    if (cb) cb(data);
  }

  function handleListen(args) {
    if (!listeners.has(args.event)) listeners.set(args.event, []);
    listeners.get(args.event).push(args.handler);
    return args.handler;
  }

  function handleEmit(args) {
    var handlers = listeners.get(args.event) || [];
    for (var i = 0; i < handlers.length; i++) {
      runCallback(handlers[i], { event: args.event, payload: args.payload });
    }
    return null;
  }

  function handleUnlisten(args) {
    var handlers = listeners.get(args.event);
    if (handlers) {
      var idx = handlers.indexOf(args.id);
      if (idx !== -1) handlers.splice(idx, 1);
    }
    callbacks.delete(args.id);
  }

  // Mock invoke
  async function invoke(cmd, args, _options) {
    // Route event plugin commands to mock event system
    if (cmd.startsWith("plugin:event|")) {
      switch (cmd) {
        case "plugin:event|listen":
          return handleListen(args);
        case "plugin:event|emit":
          return handleEmit(args);
        case "plugin:event|unlisten":
          return handleUnlisten(args);
      }
    }

    // Dialog plugin defaults
    if (cmd.startsWith("plugin:dialog|")) {
      if (cmd === "plugin:dialog|open") return null;
      if (cmd === "plugin:dialog|confirm") return true;
      if (cmd === "plugin:dialog|message") return null;
      return null;
    }

    // Window plugin defaults
    if (cmd.startsWith("plugin:window|")) {
      return null;
    }

    if (cmd in responses) return responses[cmd];
    console.warn("[tauri-mock] Unhandled command: " + cmd, args);
    return null;
  }

  function convertFileSrc(filePath, protocol) {
    protocol = protocol || "asset";
    return protocol + "://localhost/" + encodeURIComponent(filePath);
  }

  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: registerCallback,
    unregisterCallback: function (id) {
      callbacks.delete(id);
    },
    runCallback: runCallback,
    callbacks: callbacks,
    convertFileSrc: convertFileSrc,
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: function (_event, id) {
      callbacks.delete(id);
    },
  };

  // Expose emit helper for tests to trigger events via page.evaluate
  window.__TAURI_MOCK_EMIT__ = function (event, payload) {
    handleEmit({ event: event, payload: payload });
  };

  // Expose method to update command responses at runtime (no reload needed)
  window.__TAURI_MOCK_SET_RESPONSES__ = function (newResponses) {
    Object.assign(responses, newResponses);
  };
})();
