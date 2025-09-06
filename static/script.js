// -------------------- Utilities --------------------
const el = (q) => document.querySelector(q);
const els = (q) => Array.from(document.querySelectorAll(q));
const messagesEl = el("#messages");
const historyListEl = el("#historyList");
const searchInputEl = el("#searchInput");
const chatTitleEl = el("#chatTitle");
let ALL_CHATS = [];      // raw rows from DB
let FILTERED = [];       // filtered by search
let CURRENT_VIEW = null; // when user clicks a history item, we show its pair

function sanitize(text=""){
  return (text || "").toString().trim();
}

function renderMessage(role, content){
  const node = document.createElement("div");
  node.className = `msg ${role}`;
  node.innerHTML = `
    <div class="role">${role === "user" ? "🙂" : "🤖"}</div>
    <div class="bubble">${content}</div>
  `;
  messagesEl.appendChild(node);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setTitle(text){
  chatTitleEl.textContent = text || "New Conversation";
}

// -------------------- History --------------------
async function loadHistory(){
  const res = await fetch("/history");
  const data = await res.json();
  ALL_CHATS = data.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  FILTERED = ALL_CHATS.slice();
  paintHistory();
}

function paintHistory(){
  const term = sanitize(searchInputEl.value).toLowerCase();
  const rows = term
    ? ALL_CHATS.filter(r => (r.title||"").toLowerCase().includes(term) || (r.message||"").toLowerCase().includes(term))
    : ALL_CHATS;

  historyListEl.innerHTML = "";
  rows.forEach(row => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.id = row.id;
    li.innerHTML = `
      <div class="history-title" title="${sanitize(row.message)}">${sanitize(row.title || row.message)}</div>
      <button class="delete-btn" title="Delete chat" data-del="${row.id}">✕</button>
    `;
    historyListEl.appendChild(li);
  });
}

historyListEl.addEventListener("click", async (e) => {
  const delId = e.target.getAttribute("data-del");
  if (delId){
    if (!confirm("Delete this chat?")) return;
    await fetch(`/delete_chat/${delId}`, { method: "DELETE" });
    await loadHistory();
    if (CURRENT_VIEW && Number(CURRENT_VIEW.id) === Number(delId)){
      CURRENT_VIEW = null;
      el("#clearChatViewBtn").click();
    }
    return;
  }

  const item = e.target.closest(".history-item");
  if (!item) return;
  const id = Number(item.dataset.id);
  const row = ALL_CHATS.find(x => Number(x.id) === id);
  CURRENT_VIEW = row;
  setTitle(row.title || row.message.slice(0, 30));
  messagesEl.innerHTML = "";
  renderMessage("user", row.message);
  renderMessage("bot", row.response);
});

searchInputEl.addEventListener("input", paintHistory);

el("#clearHistoryBtn").addEventListener("click", async () => {
  if (!confirm("Clear all your chat history?")) return;
  await fetch("/clear_history", { method: "DELETE" });
  await loadHistory();
  el("#clearChatViewBtn").click();
});

// -------------------- New Chat / Clear current view --------------------
el("#newChatBtn").addEventListener("click", () => {
  CURRENT_VIEW = null;
  setTitle("New Conversation");
  messagesEl.innerHTML = "";
  renderMessage("bot", "New chat started. How can I support you today?");
  el("#userInput").focus();
});

el("#clearChatViewBtn").addEventListener("click", () => {
  CURRENT_VIEW = null;
  setTitle("New Conversation");
  messagesEl.innerHTML = "";
});

// -------------------- Sending a message --------------------
async function sendMessage(){
  const text = sanitize(el("#userInput").value);
  if (!text) return;
  el("#userInput").value = "";

  renderMessage("user", text);

  // optimistic typing indicator
  const typing = document.createElement("div");
  typing.className = "msg bot";
  typing.innerHTML = `<div class="role">🤖</div><div class="bubble">…thinking</div>`;
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    typing.remove();
    renderMessage("bot", data.reply);
    // refresh left panel so new title appears (first 30 chars of user msg)
    await loadHistory();
    setTitle(text.slice(0, 30));
  } catch (e){
    typing.remove();
    renderMessage("bot", "Sorry, I couldn’t reach the server. Please try again.");
  }
}

el("#sendBtn").addEventListener("click", sendMessage);
el("#userInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); }
});

// -------------------- FAQs --------------------
async function loadFaqs(){
  try{
    const res = await fetch("/static/../faqs.json"); // served from root
    const faqs = await res.json();
    const box = el("#faqsList");
    box.innerHTML = "";
    faqs.forEach(q => {
      const chip = document.createElement("div");
      chip.className = "faq-chip";
      chip.textContent = q;
      chip.addEventListener("click", () => {
        el("#userInput").value = q;
        el("#sendBtn").click();
      });
      box.appendChild(chip);
    });
  }catch(e){
    // fallback defaults
    const defaults = [
      "I feel stressed. Can you help me calm down?",
      "Share some quick breathing exercises.",
      "How can I improve my sleep routine?",
      "Suggest mindful journaling prompts.",
      "How do I manage negative self-talk gently?"
    ];
    const box = el("#faqsList");
    defaults.forEach(q => {
      const chip = document.createElement("div");
      chip.className = "faq-chip";
      chip.textContent = q;
      chip.addEventListener("click", () => {
        el("#userInput").value = q;
        el("#sendBtn").click();
      });
      box.appendChild(chip);
    });
  }
}

// -------------------- Boot --------------------
loadHistory();
loadFaqs();
