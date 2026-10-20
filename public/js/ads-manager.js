const AdsManager = {
    activeTab: 'list',

    init() {
        this.renderCampaigns();
        this.setupForm();
    },

    switchTab(tabId) {
        this.activeTab = tabId;
        document.getElementById('subview-ads-list').classList.toggle('hidden', tabId !== 'list');
        document.getElementById('subview-ads-builder').classList.toggle('hidden', tabId !== 'builder');
        
        document.getElementById('btn-ads-tab-list').className = tabId === 'list' ? "px-4 py-2 border-b-2 border-blue-600 text-blue-600" : "px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800";
        document.getElementById('btn-ads-tab-builder').className = tabId === 'builder' ? "px-4 py-2 border-b-2 border-blue-600 text-blue-600" : "px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800";
    },

    renderCampaigns() {
        const tbody = document.getElementById('ads-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        Store.campaigns.forEach(c => {
            const isActive = c.status === 'Active';
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center"><input type="checkbox" class="rounded border-slate-300"></td>
                    <td class="p-4 font-bold text-slate-800">${c.name}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}">
                            ${c.status}
                        </span>
                    </td>
                    <td class="p-4 text-slate-500 font-medium">${c.created}</td>
                    <td class="p-4 font-semibold text-slate-700">€${c.budget.toFixed(2)}/día</td>
                    <td class="p-4 font-medium text-slate-600">€${c.cost.toFixed(2)}</td>
                    <td class="p-4 text-slate-500 font-medium">${c.impressions.toLocaleString()}</td>
                    <td class="p-4 font-bold text-blue-600">${c.results} Leads</td>
                    <td class="p-4 font-semibold text-slate-700">${c.results > 0 ? '€' + c.cpa.toFixed(2) : '-'}</td>
                </tr>`;
        });
    },

    setupForm() {
        const form = document.getElementById('ads-creation-form');
        if (!form) return;

        // Listener dinámico para actualizar el Mockup del teléfono en vivo en la pantalla derecha
        const fields = ['form-campaign-name', 'form-ad-title', 'form-ad-body'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.oninput = () => {
                    const campaignName = document.getElementById('form-campaign-name').value || 'Nombre de la Campaña';
                    const adTitle = document.getElementById('form-ad-title').value || 'Título del Anuncio Inmobiliario';
                    const adBody = document.getElementById('form-ad-body').value || 'Este es el texto descriptivo principal (Copy) que aparecerá arriba del video en la sección de noticias de Facebook.';

                    document.getElementById('mock-campaign-title').innerText = campaignName;
                    document.getElementById('mock-ad-body').innerText = adBody;
                    document.getElementById('mock-ad-title').innerText = adTitle;
                };
            }
        });

        // Evento de envío real del formulario y el archivo de video hacia la API
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const videoInput = document.getElementById('form-video-file');
            if (!videoInput.files || videoInput.files.length === 0) {
                alert("Por favor, selecciona un archivo de video real para subir.");
                return;
            }

            const formData = new FormData();
            formData.append('videoFile', videoInput.files[0]);
            formData.append('campaignName', document.getElementById('form-campaign-name').value);
            formData.append('dailyBudget', document.getElementById('form-daily-budget').value);
            formData.append('adText', document.getElementById('form-ad-body').value);
            formData.append('adTitle', document.getElementById('form-ad-title').value);

            // Cambiar estado del botón a cargando
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Subiendo video a Meta...</span>`;

            try {
                const response = await fetch('/api/meta/upload-video', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    alert(`✅ ¡Éxito! ${result.message}\nID asignado: ${result.metaAdId}`);
                    
                    // Agregar la nueva campaña inyectada al almacenamiento local
                    Store.campaigns.unshift({
                        id: result.metaAdId,
                        name: result.details.campaign,
                        status: 'Active',
                        created: new Date().toLocaleString(),
                        budget: result.details.budget,
                        cost: 0.00,
                        impressions: 0,
                        results: 0,
                        cpa: 0.00,
                        templateName: result.details.fileName
                    });

                    // Limpiar formulario y refrescar la tabla
                    form.reset();
                    this.renderCampaigns();
                    this.switchTab('list');
                } else {
                    alert(`❌ Error del servidor: ${result.error}`);
                }
            } catch (error) {
                console.error("Error en la petición de subida:", error);
                alert("❌ Ocurrió un fallo de conexión al intentar enviar el video a la API.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        };
    }
};