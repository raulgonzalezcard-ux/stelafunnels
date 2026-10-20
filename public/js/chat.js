const ChatEngine = {
    init() {
        this.renderList();
        if (Store.leads.length > 0 && !Store.activeChatId) {
            this.openChat(Store.leads[0].id);
        } else if (Store.activeChatId) {
            this.openChat(Store.activeChatId);
        }
    },

    renderList() {
        const listDom = document.getElementById('chat-list-dom');
        if (!listDom) return;
        listDom.innerHTML = '';

        Store.leads.forEach(l => {
            const lastMsg = l.messages && l.messages.length ? l.messages[l.messages.length - 1].text : "Sin mensajes.";
            const isSelected = Store.activeChatId === l.id;
            
            listDom.innerHTML += `
                <div onclick="ChatEngine.openChat('${l.id}')" class="p-3 flex items-center gap-3 cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'bg-white hover:bg-slate-50'}">
                    <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-800 text-white font-bold text-xs flex items-center justify-center">${l.name.charAt(0)}</div>
                    <div class="flex-1 overflow-hidden">
                        <div class="flex justify-between items-baseline">
                            <h4 class="text-xs font-bold text-slate-800 truncate">${l.name}</h4>
                            <span class="text-[9px] text-slate-400 font-medium">Ahora</span>
                        </div>
                        <p class="text-[10px] text-slate-500 truncate mt-0.5">${lastMsg}</p>
                    </div>
                </div>`;
        });
    },

    openChat(leadId) {
        Store.activeChatId = leadId;
        this.renderList();

        const lead = Store.leads.find(l => l.id === leadId);
        const box = document.getElementById('chat-messages-box');
        if (!lead || !box) return;

        document.getElementById('chat-header-name').innerText = lead.name;
        document.getElementById('chat-header-avatar').innerText = lead.name.charAt(0);
        box.innerHTML = '';

        lead.messages.forEach(m => {
            const isLead = m.sender === 'lead';
            box.innerHTML += `
                <div class="flex max-w-[80%] ${isLead ? 'mr-auto' : 'ml-auto justify-end'}">
                    <div class="p-3 text-xs rounded-2xl shadow-sm ${isLead ? 'bg-white text-slate-800 rounded-tl-none border border-slate-200' : 'bg-blue-600 text-white rounded-tr-none'}">
                        ${m.text}
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    },

    sendMessage(e) {
        e.preventDefault();
        const inp = document.getElementById('chat-text-input');
        const val = inp.value.trim();
        if (!val) return;

        const lead = Store.leads.find(l => l.id === Store.activeChatId);
        if (lead) {
            lead.messages.push({ sender: 'agent', text: val });
            inp.value = '';
            this.openChat(Store.activeChatId);
        }
    }
};