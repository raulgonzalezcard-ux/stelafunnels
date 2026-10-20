const CRM = {
    renderPipeline() {
        const board = document.getElementById('kanban-board-dom');
        if (!board) return;
        board.innerHTML = '';

        Object.keys(STAGES).forEach(k => {
            const stageLeads = Store.leads.filter(l => l.stage === k && l.status === 'Abierto');
            let cards = '';
            
            stageLeads.forEach(l => {
                cards += `
                    <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2">
                        <div class="flex justify-between items-start">
                            <h4 class="font-bold text-xs text-slate-800 truncate max-w-[140px]">${l.name}</h4>
                        </div>
                        <p class="text-xs font-bold text-blue-600">€${l.value.toLocaleString()}</p>
                        <span class="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-500">${l.source}</span>
                    </div>`;
            });

            board.innerHTML += `
                <div class="w-72 bg-slate-100/80 rounded-xl p-3 flex flex-col shrink-0 max-h-full border border-slate-200/50">
                    <div class="flex justify-between items-center mb-3 px-1">
                        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">${STAGES[k]}</h3>
                        <span class="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">${stageLeads.length}</span>
                    </div>
                    <div class="space-y-2 overflow-y-auto custom-scrollbar flex-1 pb-4 min-h-[150px]">
                        ${cards || '<div class="text-[11px] text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">Sin oportunidades</div>'}
                    </div>
                </div>`;
        });
    },

    renderTable() {
        const tbody = document.getElementById('crm-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        Store.leads.forEach(l => {
            let tagBadges = l.tags.map(t => `<span class="bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-md font-medium text-[10px]">${t}</span>`).join(' ');
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-4">
                        <div class="flex items-center gap-2.5">
                            <div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs">${l.name.charAt(0)}</div>
                            <div>
                                <p class="font-bold text-slate-800">${l.name}</p>
                                <p class="text-[10px] text-slate-400">${l.email}</p>
                            </div>
                        </div>
                    </td>
                    <td class="p-4 font-medium text-slate-600">${l.phone}</td>
                    <td class="p-4 font-medium"><span class="text-blue-600">∞</span> ${l.source}</td>
                    <td class="p-4"><span class="bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-semibold text-[10px]">${STAGES[l.stage]}</span></td>
                    <td class="p-4"><div class="flex gap-1">${tagBadges}</div></td>
                    <td class="p-4 text-center">
                        <button onclick="App.navigate('conversations'); ChatEngine.openChat('${l.id}')" class="text-blue-600 hover:text-blue-800 font-bold">Chatear</button>
                    </td>
                </tr>`;
        });
    }
};