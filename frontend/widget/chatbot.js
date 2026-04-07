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
    (currentScript && currentScript.dataset.api) ||
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8000'
      : window.location.origin);
  const WS_BASE = API_BASE.replace(/^http/, "ws"); // transform http:// to ws:// and https:// to wss://

  // ── Load marked.js for markdown rendering ───────────────────────────────────
  function loadMarked() {
    return new Promise((resolve) => {
      if (window.marked) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
      s.onload = resolve;
      s.onerror = resolve; // graceful fallback
      document.head.appendChild(s);
    });
  }

  function renderMarkdown(text) {
    if (window.marked) {
      try {
        return window.marked.parse(text, { breaks: true, gfm: true });
      } catch (_) {}
    }
    // Fallback: escape HTML and preserve line breaks
    return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
  }

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
      if (role === "assistant") {
        div.innerHTML = renderMarkdown(text);
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendPropertyCards(items) {
      removeTyping();
      if (!items || items.length === 0) return;
      const wrapper = document.createElement("div");
      wrapper.className = "ap-property-cards";
      items.slice(0, 3).forEach(p => {
        const fmt = (n) => n ? Number(n).toLocaleString("fr-FR") + " €" : "";
        const card = document.createElement("div");
        card.className = "ap-prop-card";
        card.innerHTML = `
          <img class="ap-prop-img" src="${p.image}" alt="${p.title}" loading="lazy" />
          <div class="ap-prop-body">
            <div class="ap-prop-price">${fmt(p.price)}</div>
            <div class="ap-prop-title">${p.title}</div>
            <div class="ap-prop-location">📍 ${p.city}${p.zipcode ? " · " + p.zipcode : ""}</div>
            <div class="ap-prop-specs">
              <span>📐 ${p.surface} m²</span>
              <span>🚪 ${p.nb_rooms} p.</span>
              ${p.has_parking ? "<span>🅿️</span>" : ""}
              ${p.has_balcony ? "<span>🌿</span>" : ""}
              ${p.energy_class ? "<span>⚡ " + p.energy_class + "</span>" : ""}
            </div>
          </div>`;
        wrapper.appendChild(card);
      });
      messagesEl.appendChild(wrapper);
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
        } else if (msg.type === "properties") {
          appendPropertyCards(msg.items);
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
        // properties cards don't re-enable input (assistant message follows)
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

    // Auto-open after 2.5s to greet the visitor
    setTimeout(() => { if (!isOpen) openPanel(); }, 2500);

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
    document.addEventListener("DOMContentLoaded", () => loadMarked().then(init));
  } else {
    loadMarked().then(init);
  }
})();
