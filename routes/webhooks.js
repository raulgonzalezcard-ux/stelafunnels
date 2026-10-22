const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Asegurar que la tabla leads existe y tiene soporte para el webhook
db.run(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    value REAL DEFAULT 0,
    stage TEXT DEFAULT 'lead_entrante',
    source TEXT,
    status TEXT DEFAULT 'Abierto',
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 🌐 1. VERIFICACIÓN DEL WEBHOOK (Exigido por Meta en el panel de desarrolladores)
router.get('/', (req, res) => {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "stelafunnels_secure_verify_2026"; 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente ante Meta Developers.');
        return res.status(200).send(challenge);
    } 
    
    console.error('❌ Token de verificación de Meta incorrecto o faltante.');
    return res.sendStatus(403);
});

// 📥 2. RECEPCIÓN DE LEADS EN TIEMPO REAL DESDE ANUNCIOS DE FACEBOOK (LEAD ADS)
router.post('/', async (req, res) => {
    const body = req.body;

    // Responder inmediatamente a los servidores de Meta con 200 OK (Evita timeouts)
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        if (!body.entry || !Array.isArray(body.entry)) return;

        for (let entry of body.entry) {
            if (!entry.changes || !Array.isArray(entry.changes)) continue;
            
            for (let change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    const formId = change.value.form_id;

                    console.log(`🎯 ¡Nuevo Lead recibido de Meta! ID del Lead: ${leadId} (Página ID: ${pageId})`);

                    // Buscar en SQLite el token de acceso de Meta del usuario vinculado
                    db.get(`SELECT id, meta_access_token FROM users WHERE meta_access_token IS NOT NULL LIMIT 1`, [], async (err, userRow) => {
                        if (err || !userRow || !userRow.meta_access_token) {
                            console.error("❌ No hay ningún usuario con token de Meta activo en la base de datos para consultar el lead.");
                            return;
                        }

                        const targetUserToken = userRow.meta_access_token;
                        const targetUserId = userRow.id;

                        try {
                            // Consultar los datos del lead directamente a la Graph API de Meta (v25.0)
                            const fbGraphUrl = `https://graph.facebook.com/v25.0/${leadId}?access_token=${targetUserToken}`;
                            const response = await fetch(fbGraphUrl);
                            const metaData = await response.json();

                            if (metaData.error) {
                                console.error("❌ Error de la Graph API de Meta al decodificar el Lead:", metaData.error.message);
                                return;
                            }

                            const fieldData = metaData.field_data || [];
                            let clientData = { name: 'Cliente Lead Ads', email: 'sin_correo@facebook.com', phone: 'Sin teléfono' };

                            // Mapear los campos personalizados del formulario de Facebook
                            fieldData.forEach(field => {
                                const fname = field.name.toLowerCase();
                                const fval = field.values[0];

                                if (fname.includes('name') || fname.includes('nombre')) clientData.name = fval;
                                if (fname.includes('email') || fname.includes('correo')) clientData.email = fval;
                                if (fname.includes('phone') || fname.includes('telefono') || fname.includes('whatsapp')) clientData.phone = fval;
                            });

                            const leadRecordId = 'lead_' + leadId;
                            const valorTrato = 150000; // Valor predeterminado para oportunidad inmobiliaria/comercial

                            // Insertar el lead automáticamente en SQLite para que aparezca en el Pipeline Kanban y Conversaciones
                            db.run(
                                `INSERT OR REPLACE INTO leads (id, user_id, name, email, phone, value, stage, source, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [leadRecordId, targetUserId, clientData.name, clientData.email, clientData.phone, valorTrato, 'lead_entrante', 'Facebook Lead Ads', 'Abierto', JSON.stringify(['Meta Ads', 'Producción'])],
                                (insertErr) => {
                                    if (insertErr) {
                                        console.error("❌ Error guardando lead en SQLite:", insertErr);
                                    } else {
                                        console.log(`🚀 [CRM Producción] Lead "${clientData.name}" inyectado exitosamente al Kanban del inquilino ${targetUserId}`);
                                    }
                                }
                            );

                        } catch (apiError) {
                            console.error("❌ Error crítico consultando Graph API de Meta:", apiError.message);
                        }
                    });
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

module.exports = router;