/**
 * AutoPilot Immo — Chatbot Widget
 *
 * Usage:
 *   <script src="chatbot.js" data-api="http://localhost:8000"></script>
 *
 * The script is self-initializing. It injects the CSS (if not already loaded),
 * builds the DOM, and manages the WebSocket connection.
 */
(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────────────
  const currentScript =
    document.currentScript ||
    document.querySelector('script[src*="chatbot"]');
  const API_BASE =
    (currentScript && currentScript.dataset.api) || "http://localhost:8000";
  const WS_BASE = API_BASE.replace(/^http/, "ws"); // transform http:// to ws:// and https:// to wss://

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById("ap-widget-css")) return;
    const link = document.createElement("link");
    link.id = "ap-widget-css";
    link.rel = "stylesheet";
    link.href = API_BASE + "/static/chatbot.css";
    // Fallback: look for chatbot.css next to the script
    const scriptSrc = currentScript && currentScript.src;
    if (scriptSrc) {
      link.href = scriptSrc.replace("chatbot.js", "chatbot.css");
    }
    document.head.appendChild(link);
  }

  // ── Build DOM ───────────────────────────────────────────────────────────────
  function buildDOM() {
    // Toggle button
    const btn = document.createElement("button");
    btn.id = "ap-widget-btn";
    btn.setAttribute("aria-label", "Ouvrir le chat");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
      </svg>`;

    // Chat panel
    const panel = document.createElement("div");
    panel.id = "ap-chat-panel";
    panel.classList.add("ap-hidden");
    panel.innerHTML = `
      <div id="ap-chat-header">
        <div class="ap-avatar">🏠</div>
        <div class="ap-info">
          <div class="ap-name">Assistant ImmoPlus</div>
          <div class="ap-status"><span class="ap-dot"></span> En ligne</div>
        </div>
        <button id="ap-chat-close" aria-label="Fermer">✕</button>
      </div>
      <div id="ap-messages" role="log" aria-live="polite"></div>
      <div id="ap-chat-footer">
        <textarea
          id="ap-input"
          placeholder="Décrivez votre recherche…"
          rows="1"
          aria-label="Votre message"
        ></textarea>
        <button id="ap-send" aria-label="Envoyer" disabled>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
          </svg>
        </button>
      </div>`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    return { btn, panel };
  }

  // ── Widget controller ────────────────────────────────────────────────────────
  function init() {
    injectCSS();
    const { btn, panel } = buildDOM();

    const messagesEl = document.getElementById("ap-messages");
    const inputEl = document.getElementById("ap-input");
    const sendBtn = document.getElementById("ap-send");
    const closeBtn = document.getElementById("ap-chat-close");

    let ws = null;
    let conversationId = null;
    let isOpen = false;
    let typingEl = null;

    // ── Helpers ────────────────────────────────────────────────────────────
    function appendMessage(role, text) {
      removeTyping();
      const div = document.createElement("div");
      div.className = "ap-msg ap-" + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTyping() {
      if (typingEl) return;
      typingEl = document.createElement("div");
      typingEl.className = "ap-typing";
      typingEl.innerHTML = "<span></span><span></span><span></span>";
      messagesEl.appendChild(typingEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      if (typingEl) {
        typingEl.remove();
        typingEl = null;
      }
    }

    function setInputEnabled(enabled) {
      inputEl.disabled = !enabled;
      sendBtn.disabled = !enabled;
    }

    // ── WebSocket ──────────────────────────────────────────────────────────
    async function connect() {
      setInputEnabled(false);

      // Create conversation via REST
      try {
        const res = await fetch(API_BASE + "/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        conversationId = data.id;
      } catch (err) {
        appendMessage("error", "Impossible de démarrer la conversation. Réessayez.");
        return;
      }

      // Open WebSocket
      ws = new WebSocket(WS_BASE + "/chat/ws/" + conversationId);

      ws.onopen = () => {
        setInputEnabled(true);
        inputEl.focus();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "typing") {
          showTyping();
        } else if (msg.type === "assistant") {
          appendMessage("assistant", msg.content);
        } else if (msg.type === "error") {
          appendMessage("error", msg.content);
        }
      };

      ws.onclose = () => {
        setInputEnabled(false);
        removeTyping();
      };

      ws.onerror = () => {
        appendMessage("error", "Connexion perdue. Fermez et rouvrez le chat.");
        setInputEnabled(false);
      };
    }

    function disconnect() {
      if (ws) {
        ws.close();
        ws = null;
      }
      conversationId = null;
    }

    // ── Send message ───────────────────────────────────────────────────────
    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

      appendMessage("user", text);
      ws.send(JSON.stringify({ content: text }));
      inputEl.value = "";
      inputEl.style.height = "40px";
      setInputEnabled(false); // re-enabled when response arrives
    }

    // Re-enable input after assistant replies
    const _origOnMessage = null;
    ws; // will be set in connect()

    // Patch: re-enable input after each assistant message
    function patchWsOnMessage() {
      if (!ws) return;
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event) => {
        originalOnMessage(event);
        const msg = JSON.parse(event.data);
        if (msg.type === "assistant" || msg.type === "error") {
          setInputEnabled(true);
          inputEl.focus();
        }
      };
    }

    // ── Panel toggle ───────────────────────────────────────────────────────
    function openPanel() {
      isOpen = true;
      panel.classList.remove("ap-hidden");
      btn.setAttribute("aria-expanded", "true");

      if (!ws || ws.readyState === WebSocket.CLOSED) {
        // Clear previous messages
        messagesEl.innerHTML = "";
        connect().then(() => patchWsOnMessage());
      }
    }

    function closePanel() {
      isOpen = false;
      panel.classList.add("ap-hidden");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
    closeBtn.addEventListener("click", closePanel);

    // ── Input events ───────────────────────────────────────────────────────
    inputEl.addEventListener("input", () => {
      // Auto-resize textarea
      inputEl.style.height = "40px";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener("click", sendMessage);
  }

  // Run after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
