const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Ruta hacia la base de datos JSON de tu CRM
const DB_PATH = path.join(__dirname, '../crm_database.json');

// Función auxiliar para cargar y guardar leads de forma persistente
function loadLeads() {
    try {
        if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (error) {
        console.error("❌ Error leyendo la base de datos JSON:", error.message);
        return [];
    }
}

function saveLead(newLead) {
    try {
        const leads = loadLeads();
        leads.unshift(newLead);
        fs.writeFileSync(DB_PATH, JSON.stringify(leads, null, 2));
    } catch (error) {
        console.error("❌ Error escribiendo en la base de datos JSON:", error.message);
    }
}

// 🌐 Verificación del Webhook exigido por Meta Developers
router.get('/', (req, res) => {
    const VERIFY_TOKEN = "mi_token_secreto_de_rocket_os_123"; 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Validamos de forma segura y cerramos la conexión pase lo que pase
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente ante Meta Developers.');
        return res.status(200).send(challenge);
    } 
    
    if (mode && token) {
        console.error('❌ Token de verificación de Meta no coincide.');
        return res.sendStatus(403);
    }

    // Fallback de seguridad: si entran desde el navegador o falta un parámetro, respondemos 400 en vez de congelar el servidor
    return res.status(400).send('Faltan parámetros de validación de Meta.');
});

// 📥 Recepción de Leads en tiempo real desde la API de Formularios de Meta
router.post('/', async (req, res) => {
    const body = req.body;

    // Responder rápido a Meta (dentro de los 200ms obligatorios) para evitar baneos o reintentos agresivos
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        // Control de errores por si body.entry viene indefinido
        if (!body.entry || !Array.isArray(body.entry)) return;

        for (let entry of body.entry) {
            if (!entry.changes || !Array.isArray(entry.changes)) continue;
            
            for (let change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    console.log(`🎯 ¡Nuevo Lead detectado por Meta! ID: ${leadId} en la Página: ${pageId}`);

                    // 🔄 ESTRATEGIA DE RESPALDO: Intentar usar el token de la sesión u ocupar el permanente verificado
                    let accessToken = global.metaAccessToken;

                    if (!accessToken) {
                        console.warn("⚠️ [CRM Webhook] 'global.metaAccessToken' está vacío debido a un reinicio. Usando Token Permanente de Respaldo...");
                        // Usamos tu token de página comercial definitivo de Meta
                        accessToken = "EAAdZAo1GbxjQBR7pTOH8PyvfoBpH0aTVVp3BCO6en0ltaZCHqp9MhaxibBDC9hZBlmocLMNZCgvvFcMLeoynb13LZCXuBlcZAU4rjkzdqqRZAhTy5jcaK8Tc10Y8LcWKex5CzTvZCXp2YrIKB8XBx6ss5pVsyiTZAL9Qc4oGzwxjZCOOQcajHb6fTyoZCnp04KUpfNkaw2LaiJJnO5KZA6EGiEbtSJ5ncX4KoBJHffpm7uMZD";
                    }

                    try {
                        // 🛰️ CONSULTA EN VIVO A FACEBOOK GRAPH API PARA EXTRAER LOS DATOS REALES
                        const fbGraphUrl = `https://graph.facebook.com/v25.0/${leadId}?access_token=${accessToken}`;
                        const response = await fetch(fbGraphUrl);
                        const metaData = await response.json();

                        if (metaData.error) {
                            console.error("❌ Error de Meta al decodificar el Lead ID:", metaData.error.message);
                            continue;
                        }

                        // Mapeo seguro de los campos del formulario del video
                        const fieldData = metaData.field_data || [];
                        let clientData = { name: '', email: '', phone: '' };

                        fieldData.forEach(field => {
                            if (field.name === 'full_name' || field.name === 'name') clientData.name = field.values[0];
                            if (field.name === 'email') clientData.email = field.values[0];
                            if (field.name === 'phone_number' || field.name === 'phone') clientData.phone = field.values[0];
                        });

                        // 💰 LÓGICA DE MONETIZACIÓN REAL (Calculando tus ganancias inmobiliarias)
                        const valorPropiedad = 150000; // Valor base estimado de la propiedad del video
                        const porcentajeComision = 0.05; // 5% de comisión de ganancia para tu agencia
                        const gananciaEstimada = valorPropiedad * porcentajeComision;

                        // Construcción de la oportunidad estructurada para tu base de datos
                        const nuevaOportunidad = {
                            id: leadId,
                            name: clientData.name || 'Cliente Potencial de Prueba (Meta)',
                            email: clientData.email || 'sin_email@facebook.com',
                            phone: clientData.phone || 'Sin número registrado',
                            value: valorPropiedad,            // Valor comercial total
                            earnings: gananciaEstimada,       // 💰 Monetización neta de ganancias
                            stage: 'lead_entrante',           // Columna inicial del embudo Kanban
                            source: 'Facebook Lead Ads Video',
                            status: 'Abierto',
                            tags: ['Video Captación', 'Meta Live'],
                            createdAt: new Date().toISOString(),
                            messages: [{ sender: 'lead', text: 'Vio tu video publicitario y completó el formulario de cotización.' }]
                        };

                        // Guardar permanentemente en tu crm_database.json
                        saveLead(nuevaOportunidad);
                        
                        console.log(`🚀 [CRM] ¡Oportunidad financiera inyectada con éxito!`);
                        console.log(`   👉 Cliente: ${nuevaOportunidad.name}`);
                        console.log(`   💰 Trato: $${nuevaOportunidad.value} USD | Ganancia Esperada: $${nuevaOportunidad.earnings} USD`);

                    } catch (error) {
                        console.error("❌ Error crítico procesando la información del lead:", error.message);
                    }
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

module.exports = router;