// Constantes del sistema
const STAGES = {
    'lead_entrante': 'Lead Entrante',
    'contacto_establecido': 'Contacto Establecido',
    'cita_agendada': 'Cita Agendada',
    'propuesta_enviada': 'Propuesta Enviada',
    'negociacion_cierre': 'Negociación / Cierre'
};

// Almacenamiento Centralizado (State Management)
const Store = {
    campaigns: [],
    leads: [],
    activeChatId: null,

    init() {
        this.campaigns = [
            { id: 'c1', name: 'Captación Exclusiva - Costa Brava', status: 'Paused', created: '14/06/2026 11:24 AM', budget: 15.00, cost: 245.50, impressions: 14205, results: 28, cpa: 8.76, templateName: 'video v1' },
            { id: 'c2', name: 'Inversores - Alta Rentabilidad Madrid', status: 'Active', created: '19/06/2026 09:15 AM', budget: 25.00, cost: 75.00, impressions: 4500, results: 12, cpa: 6.25, templateName: 'video v2' },
            { id: 'c3', name: 'Casas Adosadas Premium Sevilla', status: 'Paused', created: '05/05/2026 07:38 PM', budget: 10.00, cost: 5.23, impressions: 817, results: 0, cpa: 0.00, templateName: 'valoracion v1' }
        ];

        this.leads = [
            { id: '1', name: 'Carlos Mendoza', email: 'carlos@mendoza.com', phone: '+52 55 1234 5678', value: 145000, stage: 'lead_entrante', source: 'Facebook Ads', status: 'Abierto', tags: ['Inversionista'], messages: [{ sender: 'lead', text: 'Hola, vi el anuncio del video. Solicito información de la propiedad.' }, { sender: 'agent', text: 'Hola Carlos. Un gusto saludarte, ¿buscas invertir o vivienda propia?' }] },
            { id: '2', name: 'Laura Restrepo', email: 'laura.res@gmail.com', phone: '+57 300 987 6543', value: 280000, stage: 'cita_agendada', source: 'Google Ads', status: 'Abierto', tags: ['Alta Gama'], messages: [{ sender: 'lead', text: 'Confirmado para la visita de la propiedad el sábado.' }] }
        ];
    },
    save() {
        // Listo para expandir a persistencia con localStorage o base de datos externa
    }
};

// Controlador de Rutas e Interfaz General
const App = {
    chartInstance: null,

    init() {
        Store.init();
        lucide.createIcons();
        this.navigate('launchpad'); // Vista por defecto inicial
        
        // Sincronizar el botón del Launchpad con el backend real de inicio de sesión de Facebook
        const btnConnect = document.querySelector('#view-launchpad button');
        if (btnConnect) {
            btnConnect.onclick = () => {
                fetch('/api/meta/auth-url')
                    .then(res => res.json())
                    .then(data => {
                        if (data.url) {
                            window.open(data.url, 'Facebook Login', 'width=600,height=600');
                        }
                    })
                    .catch(err => console.error("Error al obtener URL de autenticación:", err));
            };
        }
    },

    navigate(viewId) {
        // Ocultar todas las secciones del router
        document.querySelectorAll('#main-view-router > section').forEach(sec => sec.classList.add('hidden'));
        
        // Quitar estilos activos de la barra de navegación lateral
        document.querySelectorAll('aside nav button').forEach(btn => {
            btn.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
            btn.classList.add('text-slate-400', 'hover:bg-slate-800/50', 'hover:text-white');
        });

        // Mostrar sección activa
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove('hidden');

        // Resaltar botón seleccionado en el Sidebar
        const targetNav = document.getElementById(`nav-${viewId}`);
        if (targetNav) {
            targetNav.classList.remove('text-slate-400', 'hover:bg-slate-800/50');
            targetNav.classList.add('bg-blue-600', 'text-white', 'shadow-md');
        }

        // Actualizar título dinámico del Header principal
        const titleMap = {
            'launchpad': 'Launchpad Inicial', 'dashboard': 'Tablero de Control',
            'conversations': 'Conversaciones Omnicanal', 'pipeline': 'Oportunidades (Opps)',
            'contacts': 'Contactos / CRM', 'ads-manager': 'Ads Manager (Rocket)',
            'funnels': 'Embudos y Sitios Web', 'automations': 'Workflow Builder'
        };
        document.getElementById('current-view-title').innerText = titleMap[viewId] || 'Panel de Control';

        // Renderizar componentes específicos según la vista
        if (viewId === 'dashboard') this.renderDashboard();
        if (viewId === 'pipeline') CRM.renderPipeline();
        if (viewId === 'contacts') CRM.renderTable();
        if (viewId === 'conversations') ChatEngine.init();
        if (viewId === 'ads-manager') AdsManager.init();
        
        lucide.createIcons();
    },

    renderDashboard() {
        document.getElementById('dash-total-leads').innerText = Store.leads.length;
        const pipelineVal = Store.leads.reduce((acc, l) => acc + (l.status === 'Abierto' ? l.value : 0), 0);
        document.getElementById('dash-pipeline-value').innerText = `€${pipelineVal.toLocaleString()}`;
        
        // Renderizar Funnel Visual
        const funnelDom = document.getElementById('dash-funnel-container');
        funnelDom.innerHTML = '';
        Object.keys(STAGES).forEach(k => {
            const count = Store.leads.filter(l => l.stage === k).length;
            funnelDom.innerHTML += `
                <div class="space-y-1">
                    <div class="flex justify-between text-xs font-semibold">
                        <span class="text-slate-600">${STAGES[k]}</span>
                        <span class="text-slate-900">${count} Leads</span>
                    </div>
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="bg-blue-600 h-full" style="width: ${Store.leads.length ? (count / Store.leads.length) * 100 : 0}%"></div>
                    </div>
                </div>`;
        });

        // Gráfico Financiero de Chart.js
        if (this.chartInstance) this.chartInstance.destroy();
        const ctx = document.getElementById('dash-chart-canvas').getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.values(STAGES),
                datasets: [{
                    label: 'Volumen Monetario (€)',
                    data: Object.keys(STAGES).map(k => Store.leads.filter(l => l.stage === k).reduce((s, l) => s + l.value, 0)),
                    backgroundColor: '#2563eb',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }
};

window.onload = () => App.init();