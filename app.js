import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { GROQ_API_KEY } from "./config.js";
import { saveMessage, loadMessages } from "./database.js";
// app.js

// app.js

async function askAI(message) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        // CORRECTION FINALE : Modèle de secours Llama 3 70B
        model: "llama3-70b-8192", 
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    // Gestion d'erreur (HTTP 4xx/5xx)
    if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch (e) {
            errorData = { message: `Erreur HTTP ${res.status}. Le corps de la requête est incorrect.` };
        }
        console.error("Groq API Error:", errorData);
        return `Erreur de l'API Groq (Code ${res.status}): ${errorData.message || JSON.stringify(errorData)}`;
    }

    const data = await res.json();
    
    // Vérification de la réponse Groq
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
        console.error("Groq response missing choices or message:", data);
        return "Erreur IA: La réponse Groq est incomplète ou vide.";
    }

    return data.choices[0].message.content;
  } catch(err) {
    console.error(err);
    // Fallback pour les erreurs de réseau ou de code
    return "Une erreur est survenue avec l’IA (Erreur de réseau ou de code).";
  }
}

// ... le reste du fichier app.js
// ... le reste du fichier app.js
const DEFAULT_RULES = [
  {"id":"greeting","patterns":["^bonjour\\b","^salut\\b","bonjour","salut","coucou"],"responses":["Bonjour ! Comment puis-je t'aider aujourd'hui ?","Salut ! Que veux-tu faire ?","Coucou ! Quel est le programme pour toi ?","Bonjour ! Je suis là pour t'aider."]},
  {"id":"howareyou","patterns":["comment ça va","comment vas","ça va","ca va"],"responses":["Je vais bien, merci ! Et toi ?","Tout va bien ici — dis-moi ce dont tu as besoin.","Ça va super ! Et de ton côté ?","Je suis en forme, prêt à t'aider !"]},
  {"id":"set_name_feedback","patterns":["je m'?appelle\\s+(.+)","mon nom est\\s+(.+)"],"responses":["Enchanté {name} ! Je vais retenir ton nom.", "Ravi de te rencontrer {name} ! J'ai enregistré ton nom."],"meta":{"autoSetNameFromCapture":true}},
  {"id":"thanks","patterns":["merci","thanks","thx"],"responses":["Avec plaisir !","De rien !","Je t'en prie !","C'est normal !"]},
  {"id":"time","patterns":["quelle heure","il est quelle heure","heure"],"responses":["Il est {time}.","Nous sommes le {date} et il est {time}."],"meta":{"builtin":"time"}},
  {"id":"personal_greet","patterns":["bonjour","salut","hello"],"responses":["Bonjour {name} ! Tu veux tester une commande ?","Salut {name} — que souhaites-tu faire ?","Coucou {name} ! Comment ça va ?"],"conditions":{"nameExists":true}},
  {"id":"demander_aide","patterns":["aide","help","quoi faire","tu fais quoi","quelles commandes"],"responses":["Je suis un assistant professionnel. Je peux : répondre à tes questions, te donner l'heure, retenir ton nom, gérer des rappels simples. Essaie 'quelle heure' ou 'je m'appelle X' !","Commandes disponibles : 'aide', 'quelle heure', 'je m'appelle NOM', 'crée un rappel'. Dis-moi ce que tu veux faire !"]},
  {"id":"remerciements","patterns":["c'est gentil","super","bien joué","excellent"],"responses":["Merci ! Je fais de mon mieux.","Content que ça te plaise !","De rien, c'est un plaisir."]},
  {"id":"oui_avec_contexte","patterns":["oui","yes","ouais"],"responses":["Super ! Dis-moi plus.","D'accord, quoi d'autre ?"],"conditions":{"attente":true}},
  {"id":"creer_rappel","patterns":["rappelle-moi","crée un rappel","rappel"],"responses":["Quel est le rappel et à quelle heure ?","Dis-moi ce que je dois te rappeler et quand."],"meta":{"setContext":{"attente":"rappel"}}},
  {"id":"fallback","patterns":[],"responses":["Désolé, je n'ai pas compris. Tu peux utiliser 'aide' pour voir les commandes.","Je ne connais pas encore la réponse à ça, essaie 'aide'."]}
];

const STORAGE_KEYS = {HISTORY: "chatbot_history_v3", RULES: "chatbot_rules_v3", THEME: "chatbot_theme_v3", STATS: "chatbot_stats_v3", CONTEXT: "chatbot_context_v3"};
let RULES = [];
let STATS = {}; // { ruleId: count }
let CONTEXT = {}; // e.g., { name: "Youssef" }
let assistantMode = false;

// DOM
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const rulesList = document.getElementById("rules-list");
const addRuleBtn = document.getElementById("add-rule-btn");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const ruleForm = document.getElementById("rule-form");
const fieldId = document.getElementById("field-id");
const fieldPatterns = document.getElementById("field-patterns");
const fieldResponses = document.getElementById("field-responses");
const fieldConditions = document.getElementById("field-conditions");
const saveRuleBtn = document.getElementById("save-rule");
const cancelRuleBtn = document.getElementById("cancel-rule");
const formMessage = document.getElementById("form-message");
const exportRulesBtn = document.getElementById("export-rules");
const importRulesBtn = document.getElementById("import-rules");
const resetRulesBtn = document.getElementById("reset-rules");
const clearStorageBtn = document.getElementById("clear-storage");
const toggleThemeBtn = document.getElementById("toggle-theme");
const toggleAssistantBtn = document.getElementById("toggle-assistant");
const statsView = document.getElementById("stats-view");
const contextView = document.getElementById("context-view");
const resetStatsBtn = document.getElementById("reset-stats");
const clearContextBtn = document.getElementById("clear-context");
const historyList = document.getElementById("history-list");

let editingRuleId = null;

// Utility
const $ = s => document.querySelector(s);
function escapeHtml(str){ return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\n","<br>"); }

// Init
init();

async function init(){
  // load context and stats first
  loadContext();
  loadStats();
  // Load online history
  loadMessages().then(msgs => {
  msgs.forEach(m => {
    if (m.role === "user") appendUserMessage(m.content);
    else appendBotMessage(m.content);
    });
  });

  // load rules localStorage -> rules.json -> default
  const stored = localStorage.getItem(STORAGE_KEYS.RULES);
  if (stored){
    try { RULES = JSON.parse(stored); }
    catch(e){ RULES = DEFAULT_RULES.slice(); localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(RULES)); }
  } else {
    try {
      const r = await fetch("rules.json");
      if (r.ok) RULES = await r.json();
      else RULES = DEFAULT_RULES.slice();
    } catch(e){ RULES = DEFAULT_RULES.slice(); }
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(RULES));
  }

  attachEvents();
  applyTheme();
  renderRulesList();
  renderStats();
  renderContext();
  loadHistory();
  renderChatSystemMessage("Bonjour ! Mode Assistant est disponible. Active 'Assistant' pour les commandes rapides.");
}

function attachEvents(){
  sendBtn.addEventListener("click", onSend);
  inputEl.addEventListener("keydown", e => { if (e.key === "Enter") onSend() });
  addRuleBtn.addEventListener("click", openModalForCreate);
  cancelRuleBtn.addEventListener("click", closeModal);
  ruleForm.addEventListener("submit", onSaveRule);
  exportRulesBtn.addEventListener("click", exportRules);
  importRulesBtn.addEventListener("click", importRules);
  resetRulesBtn.addEventListener("click", onResetRules);
  clearStorageBtn.addEventListener("click", onClearStorage);
  toggleThemeBtn.addEventListener("click", toggleTheme);
  toggleAssistantBtn.addEventListener("click", toggleAssistantMode);
  resetStatsBtn && resetStatsBtn.addEventListener("click", onResetStats);
  clearContextBtn && clearContextBtn.addEventListener("click", onClearContext);
}

// Chat UI
function renderChatSystemMessage(text){
  appendBotMessage(text);
}

function appendUserMessage(text){
  const el = document.createElement("div");
  el.className = "message user enter";
  el.innerHTML = `<div class="meta">Vous</div><div class="body">${escapeHtml(text)}</div>`;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function appendBotMessage(text){
  const el = document.createElement("div");
  el.className = "message bot enter";
  el.innerHTML = `<div class="meta">Bot</div><div class="body">${escapeHtml(text)}</div>`;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function appendBotTyping(){
  const el = document.createElement("div");
  el.className = "message bot typing enter";
  el.innerHTML = `<div class="meta">Bot</div><div class="body">...</div>`;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function onSend(){
  const text = inputEl.value.trim();
  if (!text) return;
  appendUserMessage(text);
  saveToHistory({from:"user", text, date: new Date().toISOString()});
  inputEl.value = "";
  // process: check assistant builtins first if assistantMode true
  if (assistantMode){
    const handled = handleAssistantBuiltins(text);
    if (handled) return;
    // FIX: If built-ins were not handled, use the rules engine (processInput)
    processInput(text);
    return;
  }
  processAI(text);
}
async function processAI(text) {
  const typingEl = appendBotTyping();

  // Save user message online
  saveMessage("user", text);

  const reply = await askAI(text);

  typingEl.remove();
  appendBotMessage(reply);

  saveMessage("bot", reply);
}


// Input processing & matching
function processInput(text){
  const typingEl = appendBotTyping();
  setTimeout(() => {
    typingEl.remove();
    const result = computeResponse(text);
    // increment stats if rule used
    if (result.ruleId) incrementStat(result.ruleId);
    // apply context placeholders
    const final = applyPlaceholders(result.response);
    typeBotResponse(final, 18, true);
    saveToHistory({from:"bot", text:final, date: new Date().toISOString()});
    renderStats();
  }, 300 + Math.random()*450);
}

function computeResponse(text){
  // first try pattern with captures / regex etc.
  const lower = text.toLowerCase();
  // check auto-set name pattern quickly
  for (const rule of RULES){
    if (!rule.patterns || rule.patterns.length === 0) continue;
    for (const p of rule.patterns){
      if (!p) continue;
      try {
        const re = new RegExp(p, "i");
        const m = re.exec(text);
        if (m){
          // conditions?
          if (!checkConditions(rule.conditions)) continue;
          // if meta autoSetNameFromCapture -> take capture 1 as name
          if (rule.meta && rule.meta.autoSetNameFromCapture && m[1]){
            setContext({name: capitalize(m[1].trim())});
          }
          // if meta setContext -> set context
          if (rule.meta && rule.meta.setContext){
            setContext(rule.meta.setContext);
          }
          const resp = pickResponse(rule);
          return {response: resp, ruleId: rule.id};
        }
      } catch(e){
        if (lower.includes(p.toLowerCase())){
          if (!checkConditions(rule.conditions)) continue;
          const resp = pickResponse(rule);
          return {response: resp, ruleId: rule.id};
        }
      }
    }
  }

  // If none matched, fallback
  const fallback = RULES.find(r => r.id === "fallback") || (RULES.length? RULES[RULES.length-1] : {responses:["Je n'ai pas compris."]});
  return {response: pickResponse(fallback), ruleId: fallback.id || null};
}

function pickResponse(rule){
  // some rules have meta builtin e.g., time
  if (rule.meta && rule.meta.builtin === "time"){
    // replace placeholders later
    const choice = rule.responses[Math.floor(Math.random()*rule.responses.length)];
    return choice;
  }
  // random response
  const arr = rule.responses && rule.responses.length ? rule.responses : ["Je n'ai pas de réponse pour ça."];
  return arr[Math.floor(Math.random()*arr.length)];
}

function applyPlaceholders(text){
  let out = text;
  // {name}
  if (out.includes("{name}")){
    out = out.replaceAll("{name}", CONTEXT.name || "ami");
  }
  // {time} {date}
  if (out.includes("{time}") || out.includes("{date}")){
    const d = new Date();
    const hh = d.getHours().toString().padStart(2,"0");
    const mm = d.getMinutes().toString().padStart(2,"0");
    const time = `${hh}:${mm}`;
    const date = d.toLocaleDateString();
    out = out.replaceAll("{time}", time).replaceAll("{date}", date);
  }
  return out;
}

// Conditions simple evaluator
function checkConditions(conds){
  if (!conds) return true;
  // e.g., { nameExists: true }
  if (conds.nameExists !== undefined){
    return Boolean(CONTEXT.name) === Boolean(conds.nameExists);
  }
  // e.g., { attente: true }
  if (conds.attente !== undefined){
    return Boolean(CONTEXT.attente) === Boolean(conds.attente);
  }
  // can extend
  return true;
}

// Stats
function loadStats(){
  try {
    STATS = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)) || {};
  } catch(e){ STATS = {}; }
}
function incrementStat(ruleId){
  STATS[ruleId] = (STATS[ruleId] || 0) + 1;
  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(STATS));
}
function renderStats(){
  statsView.innerHTML = "";
  const keys = Object.keys(STATS);
  if (!keys.length){
    statsView.innerHTML = `<div class="stats-item">Aucune statistique pour l'instant.</div>`;
    return;
  }
  // show rules ordered by count desc
  const sorted = keys.sort((a,b)=> STATS[b]-STATS[a]);
  for (const id of sorted){
    const div = document.createElement("div");
    div.className = "stats-item";
    div.innerHTML = `<div>${escapeHtml(id)}</div><div>${STATS[id]}</div>`;
    statsView.appendChild(div);
  }
}

// Context
function loadContext(){
  try { CONTEXT = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTEXT)) || {}; } catch(e){ CONTEXT = {}; }
}
function persistContext(){
  localStorage.setItem(STORAGE_KEYS.CONTEXT, JSON.stringify(CONTEXT));
  renderContext();
}
function setContext(obj){
  CONTEXT = {...CONTEXT, ...obj};
  persistContext();
}
function clearContext(){
  CONTEXT = {};
  persistContext();
}
function renderContext(){
  contextView.innerHTML = "";
  if (!CONTEXT || Object.keys(CONTEXT).length === 0){
    contextView.innerHTML = `<div>Aucun contexte défini.</div>`;
    return;
  }
  for (const k of Object.keys(CONTEXT)){
    const div = document.createElement("div");
    div.textContent = `${k}: ${CONTEXT[k]}`;
    contextView.appendChild(div);
  }
}

// History
function saveToHistory(item){
  const hist = loadHistoryArray();
  hist.push(item);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(hist));
  renderHistory();
}
function loadHistoryArray(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || []; } catch(e){ return []; }
}
function loadHistory(){
  renderHistory();
  const hist = loadHistoryArray();
  if (hist.length > 0){
    const last = hist.slice(-8);
    for (const it of last){
      if (it.from === "user") appendUserMessage(it.text);
      else appendBotMessage(it.text);
    }
  }
}
function renderHistory(){
  if (!historyList) return;
  const hist = loadHistoryArray();
  historyList.innerHTML = "";
  if (!hist.length){
    historyList.innerHTML = `<div class="history-item">Aucun message enregistré.</div>`;
    return;
  }
  for (let i = hist.length - 1; i >= 0; i--){
    const it = hist[i];
    const div = document.createElement("div");
    div.className = "history-item";
    const time = new Date(it.date).toLocaleString();
    div.innerHTML = `<strong>${it.from === "user" ? "Vous" : "Bot"}</strong> • <small style="color:#888">${time}</small><div style="margin-top:6px">${escapeHtml(it.text)}</div>`;
    historyList.appendChild(div);
  }
}

// Type animation + speak
function typeBotResponse(text, speed=25, speak=false){
  const el = document.createElement("div");
  el.className = "message bot";
  el.innerHTML = `<div class="meta">Bot</div><div class="body"></div>`;
  chatEl.appendChild(el);
  const body = el.querySelector(".body");
  chatEl.scrollTop = chatEl.scrollHeight;
  let i = 0;
  const t = setInterval(() => {
    body.textContent = text.slice(0, i);
    chatEl.scrollTop = chatEl.scrollHeight;
    i++;
    if (i > text.length){
      clearInterval(t);
      if (speak && "speechSynthesis" in window){
        const ut = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(ut);
      }
    }
  }, speed);
}

// Rules editor (graphical)
function renderRulesList(){
  rulesList.innerHTML = "";
  if (!RULES || RULES.length === 0){
    rulesList.innerHTML = `<div class="rule-card">Aucune règle définie.</div>`;
    return;
  }
  for (const rule of RULES){
    const card = document.createElement("div");
    card.className = "rule-card";
    const header = document.createElement("div");
    header.className = "rule-header";
    const meta = document.createElement("div"); meta.className = "rule-meta"; meta.textContent = rule.id || "(sans id)";
    const actions = document.createElement("div"); actions.className="rule-actions";
    const editBtn = document.createElement("button"); editBtn.title="Modifier"; editBtn.innerHTML="✏️"; editBtn.addEventListener("click", ()=>openModalForEdit(rule.id));
    const delBtn = document.createElement("button"); delBtn.title="Supprimer"; delBtn.innerHTML="🗑️"; delBtn.addEventListener("click", ()=>{ if(!confirm(`Supprimer ${rule.id} ?`)) return; RULES = RULES.filter(r=>r.id!==rule.id); persistRules(); renderRulesList(); });
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    header.appendChild(meta); header.appendChild(actions);
    const patternsWrap = document.createElement("div"); patternsWrap.className="patterns";
    for (const p of (rule.patterns||[])){ const span=document.createElement("span"); span.className="pattern-badge"; span.textContent=p; patternsWrap.appendChild(span); }
    const responsesWrap = document.createElement("div"); responsesWrap.className="responses"; responsesWrap.innerHTML=`<strong>Réponses:</strong><div>${(rule.responses||[]).map(r=>`<div>${escapeHtml(r)}</div>`).join("")}</div>`;
    const cond = document.createElement("div"); cond.className="responses"; cond.innerHTML = `<small style="color:#666">conditions: ${rule.conditions?JSON.stringify(rule.conditions):"aucune"}</small>`;
    card.appendChild(header); card.appendChild(patternsWrap); card.appendChild(responsesWrap); card.appendChild(cond);
    rulesList.appendChild(card);
  }
}

function openModalForCreate(){
  editingRuleId = null; modalTitle.textContent = "Nouvelle règle"; fieldId.value=""; fieldPatterns.value=""; fieldResponses.value=""; fieldConditions.value=""; formMessage.textContent=""; modal.classList.remove("hidden"); fieldId.focus();
}
function openModalForEdit(id){
  const r = RULES.find(x=>x.id===id); if(!r) return alert("Règle introuvable");
  editingRuleId = id; modalTitle.textContent = `Modifier — ${id}`; fieldId.value=r.id; fieldPatterns.value=(r.patterns||[]).join("\n"); fieldResponses.value=(r.responses||[]).join("\n"); fieldConditions.value = condToString(r.conditions); formMessage.textContent=""; modal.classList.remove("hidden"); fieldId.focus();
}
function closeModal(){ modal.classList.add("hidden"); editingRuleId=null; }
function condToString(conds){
  if (!conds) return "";
  // only nameExists supported
  const parts=[];
  if (conds.nameExists!==undefined) parts.push(`nameExists=${conds.nameExists}`);
  return parts.join("\n");
}
function parseConditions(text){
  if (!text) return null;
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const obj = {};
  for (const l of lines){
    const [k,v] = l.split("=").map(s=>s.trim());
    if (k && v!==undefined){
      if (v==="true") obj[k]=true;
      else if (v==="false") obj[k]=false;
      else obj[k]=v;
    }
  }
  return obj;
}

function onSaveRule(e){
  e.preventDefault();
  const id = fieldId.value.trim();
  const patterns = fieldPatterns.value.split("\n").map(s=>s.trim()).filter(Boolean);
  const responses = fieldResponses.value.split("\n").map(s=>s.trim()).filter(Boolean);
  const conditions = parseConditions(fieldConditions.value);

  if (!id) { formMessage.textContent = "L'identifiant est requis."; return; }
  if (responses.length === 0) { formMessage.textContent = "Ajoute au moins une réponse."; return; }
  if (editingRuleId === null && RULES.some(r=>r.id===id)){ formMessage.textContent = "Cet id existe déjà."; return; }
  if (editingRuleId !== null && editingRuleId !== id && RULES.some(r=>r.id===id)){ formMessage.textContent = "Nouvel id en conflit."; return; }

  const ruleObj = { id, patterns, responses };
  if (conditions) ruleObj.conditions = conditions;

  if (editingRuleId === null) RULES.push(ruleObj);
  else RULES = RULES.map(r=> r.id === editingRuleId ? ruleObj : r);

  persistRules(); renderRulesList(); closeModal();
}

function persistRules(){ localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(RULES)); }

// Import/Export
function exportRules(){ const blob = new Blob([JSON.stringify(RULES, null,2)], {type:"application/json"}); const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="rules_export.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function importRules(){ const input=document.createElement("input"); input.type="file"; input.accept=".json,application/json"; input.onchange = e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload = ev=>{ try{ const parsed=JSON.parse(ev.target.result); if(!Array.isArray(parsed)) throw new Error("Le fichier doit contenir un tableau"); // basic validate
    for(const it of parsed){ if(typeof it.id!=="string" || !Array.isArray(it.responses)) throw new Error("Format incorrect pour une règle"); }
    RULES = parsed; persistRules(); renderRulesList(); alert("Import réussi."); } catch(err){ alert("Erreur import: "+err.message); } }; r.readAsText(f); }; input.click(); }

// Reset & storage
function onResetRules(){ if(!confirm("Remettre les règles par défaut ?")) return; RULES = DEFAULT_RULES.slice(); persistRules(); renderRulesList(); alert("Règles remises par défaut."); }
function onClearStorage(){ if(!confirm("Tout réinitialiser (historique, règles, contexte, stats) ?")) return; localStorage.removeItem(STORAGE_KEYS.HISTORY); localStorage.removeItem(STORAGE_KEYS.RULES); localStorage.removeItem(STORAGE_KEYS.STATS); localStorage.removeItem(STORAGE_KEYS.CONTEXT); location.reload(); }
function onResetStats(){ if(!confirm("Réinitialiser toutes les statistiques ?")) return; STATS = {}; localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(STATS)); renderStats(); }
function onClearContext(){ if(!confirm("Effacer le contexte ?")) return; clearContext(); renderContext(); }

// Theme
function toggleTheme(){ const cur = localStorage.getItem(STORAGE_KEYS.THEME) || "light"; const next = cur === "light" ? "dark" : "light"; localStorage.setItem(STORAGE_KEYS.THEME, next); applyTheme(); }
function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || "light";

  if (theme === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}

// Assistant builtins
function toggleAssistantMode(){
  assistantMode = !assistantMode;
  toggleAssistantBtn.textContent = assistantMode ? "🤖 Assistant On" : "🤖 Assistant Off";
  renderChatSystemMessage(`Assistant ${assistantMode ? "activé" : "désactivé"}.`);
}
function handleAssistantBuiltins(text){
  const lower = text.toLowerCase().trim();
  // set name commands (also matched by rules but we want immediate set)
  const nameRegex1 = /je m'?appelle\s+(.+)/i;
  const nameRegex2 = /mon nom est\s+(.+)/i;
  let m = nameRegex1.exec(text) || nameRegex2.exec(text);
  if (m){
    const nm = capitalize(m[1].trim());
    setContext({name: nm});
    const feedback = `D'accord, je retiens ton nom : ${nm}.`;
    appendBotMessage(feedback);
    saveToHistory({from:"bot", text:feedback, date:new Date().toISOString()});
    incrementStat("set_name_feedback");
    renderStats();
    return true;
  }
  // help
  if (["aide","help"].includes(lower)) {
    const help = "Commandes disponibles: 'je m'appelle NOM', 'quelle heure', 'efface le contexte'. Active/Désactive Assistant pour autoriser commandes rapides.";
    appendBotMessage(help);
    saveToHistory({from:"bot", text:help, date:new Date().toISOString()});
    return true;
  }
  // clear context
  if (lower.includes("efface le contexte") || lower.includes("clear context") || lower.includes("efface le context")) {
    clearContext();
    appendBotMessage("Contexte effacé.");
    saveToHistory({from:"bot", text:"Contexte effacé.", date:new Date().toISOString()});
    return true;
  }
  // time
  if (lower.includes("quelle heure") || lower.includes("il est quelle heure") || lower === "heure") {
    const d=new Date(); const hh=d.getHours().toString().padStart(2,"0"); const mm=d.getMinutes().toString().padStart(2,"0"); const now=`${hh}:${mm}`;
    appendBotMessage(`Il est ${now}.`);
    saveToHistory({from:"bot", text:`Il est ${now}.`, date:new Date().toISOString()});
    incrementStat("time");
    renderStats();
    return true;
  }
  return false;
}

// Helpers
function capitalize(s){ return s.split(" ").map(w=> w.charAt(0).toUpperCase()+w.slice(1)).join(" "); }

// initial persist/load
(function ensureRulesLoaded(){
  const stored = localStorage.getItem(STORAGE_KEYS.RULES);
  if (stored) {
    try { RULES = JSON.parse(stored); }
    catch(e){ RULES = DEFAULT_RULES.slice(); localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(RULES)); RULES = DEFAULT_RULES.slice(); }
  } else {
    RULES = DEFAULT_RULES.slice();
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(RULES));
  }
  // stats and context loaded earlier
})();

// render on start
renderRulesList();
renderStats();
renderContext();

// small safeguard
try { /* nothing extra */ } catch(e){ RULES = DEFAULT_RULES.slice(); persistRules(); renderRulesList(); }

// End of file
document.getElementById("assist-btn").addEventListener("click", () => {
  const quick = "Donne-moi un conseil utile.";
  appendUserMessage(quick);
  processAI(quick);
});


