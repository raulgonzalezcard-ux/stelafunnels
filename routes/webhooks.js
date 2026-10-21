const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión a la base de datos SQLite de producción
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Crear tabla de leads en SQLite si no existe
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

// 🌐 Verificación del Webhook exigido por Meta Developers
router.get('/', (req, res) => {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "mi_token_secreto_de_rocket_os_123"; 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente ante Meta Developers.');
        return res.status(200).send(challenge);
    } 
    
    if (mode && token) {
        console.error('❌ Token de verificación de Meta no coincide.');
        return res.sendStatus(403);
    }

    return res.status(400).send('Faltan parámetros de validación de Meta.');
});

// 📥 Recepción de Leads en tiempo real desde la API de Formularios de Meta
router.post('/', async (req, res) => {
    const body = req.body;

    // Responder rápido a Meta (dentro de los 200ms obligatorios)
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        if (!body.entry || !Array.isArray(body.entry)) return;

        for (let entry of body.entry) {
            if (!entry.changes || !Array.isArray(entry.changes)) continue;
            
            for (let change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    console.log(`🎯 ¡Nuevo Lead detectado por Meta! ID: ${leadId} en la Página ID: ${pageId}`);

                    // Buscar en la base de datos qué usuario tiene un token activo que pueda administrar esta página
                    db.all(`SELECT id, meta_access_token FROM users WHERE meta_access_token IS NOT NULL`, [], async (err, users) => {
                        if (err || !users || users.length === 0) {
                            console.error("❌ No hay usuarios con tokens de Meta registrados en la base de datos.");
                            return;
                        }

                        let targetUserToken = null;
                        let targetUserId = null;

                        for (let user of users) {
                            try {
                                const testUrl = `https://graph.facebook.com/v19.0/${pageId}?access_token=${user.meta_access_token}`;
                                const testRes = await fetch(testUrl);
                                const testData = await testRes.json();
                                if (!testData.error) {
                                    targetUserToken = user.meta_access_token;
                                    targetUserId = user.id;
                                    break;
                                }
                            } catch (e) {}
                        }

                        // Fallback si no encuentra coincidencia exacta de página
                        if (!targetUserToken) {
                            targetUserToken = global.metaAccessToken || users[0].meta_access_token;
                            targetUserId = users[0].id;
                        }

                        try {
                            const fbGraphUrl = `https://graph.facebook.com/v19.0/${leadId}?access_token=${targetUserToken}`;
                            const response = await fetch(fbGraphUrl);
                            const metaData = await response.json();

                            if (metaData.error) {
                                console.error("❌ Error de Meta al decodificar el Lead ID:", metaData.error.message);
                                return;
                            }

                            const fieldData = metaData.field_data || [];
                            let clientData = { name: '', email: '', phone: '' };

                            fieldData.forEach(field => {
                                if (field.name === 'full_name' || field.name === 'name') clientData.name = field.values[0];
                                if (field.name === 'email') clientData.email = field.values[0];
                                if (field.name === 'phone_number' || field.name === 'phone') clientData.phone = field.values[0];
                            });

                            const valorPropiedad = 150000; // Valor base del lead inmobiliario
                            const nuevaOportunidad = {
                                id: leadId,
                                user_id: targetUserId,
                                name: clientData.name || 'Cliente Potencial (Meta Ads)',
                                email: clientData.email || 'sin_email@facebook.com',
                                phone: clientData.phone || 'Sin número registrado',
                                value: valorPropiedad,
                                stage: 'lead_entrante',
                                source: 'Facebook Lead Ads',
                                status: 'Abierto',
                                tags: JSON.stringify(['Meta Ads', 'Producción'])
                            };

                            // Guardar en la base de datos SQLite asociada al inquilino correcto
                            db.run(
                                `INSERT OR REPLACE INTO leads (id, user_id, name, email, phone, value, stage, source, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [nuevaOportunidad.id, nuevaOportunidad.user_id, nuevaOportunidad.name, nuevaOportunidad.email, nuevaOportunidad.phone, nuevaOportunidad.value, nuevaOportunidad.stage, nuevaOportunidad.source, nuevaOportunidad.status, nuevaOportunidad.tags],
                                (insertErr) => {
                                    if (insertErr) {
                                        console.error("❌ Error guardando lead en SQLite:", insertErr);
                                    } else {
                                        console.log(`🚀 [CRM] Lead ${nuevaOportunidad.name} guardado en SQLite para el inquilino ID: ${targetUserId}`);
                                    }
                                }
                            );

                        } catch (error) {
                            console.error("❌ Error crítico procesando el lead de Meta:", error.message);
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
