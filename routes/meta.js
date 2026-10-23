const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión a la base de datos SQLite de producción
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Asegurar que la tabla de leads exista para guardar los prospectos de Meta
db.run(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    value INTEGER DEFAULT 150000,
    stage TEXT DEFAULT 'lead_entrante',
    source TEXT DEFAULT 'Facebook Ads',
    status TEXT DEFAULT 'Abierto',
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Middleware de seguridad para verificar sesión
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ success: false, error: "No autorizado. Inicia sesión en el CRM." });
};

// =========================================================================
// 🔍 0. ESTADO DE CONEXIÓN: Verificar si hay token de Meta por subcuenta
// =========================================================================
router.get('/status', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    db.get(`SELECT meta_access_token FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err || !row || !row.meta_access_token) {
            return res.json({ connected: false });
        }
        res.json({ connected: true });
    });
});

// =========================================================================
// 📋 1. TRAER INFORMACIÓN: Listar las páginas vinculadas del usuario actual
// =========================================================================
router.get('/pages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        db.get(`SELECT meta_access_token FROM users WHERE id = ?`, [userId], async (err, row) => {
            if (err || !row || !row.meta_access_token) {
                return res.status(401).json({ 
                    success: false, 
                    error: "Tu cuenta de Meta no está conectada. Ve al Launchpad y conéctala." 
                });
            }

            const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${row.meta_access_token}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                return res.status(500).json({ success: false, error: data.error.message });
            }

            res.json({ success: true, pages: data.data });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno del servidor al procesar las páginas." });
    }
});

// =========================================================================
// 📊 1.2. OBTENER LEADS DE SQLITE PARA EL PIPELINE COMERCIAL
// =========================================================================
router.get('/leads', requireAuth, (req, res) => {
    db.all(`SELECT * FROM leads ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, leads: rows });
    });
});

// =========================================================================
// 🎯 1.1. SELECCIONAR PÁGINA Y SUSCRIBIR WEBHOOKS DE LEADS
// =========================================================================
router.post('/select-page', requireAuth, async (req, res) => {
    const { pageId, pageAccessToken } = req.body;
    
    if (!pageId) {
        return res.status(400).json({ success: false, error: 'El ID de la página es obligatorio.' });
    }

    try {
        const userId = req.session.user.id;

        db.get(`SELECT meta_access_token FROM users WHERE id = ?`, [userId], async (err, row) => {
            const tokenToUse = pageAccessToken || (row ? row.meta_access_token : global.metaAccessToken);

            const subscribeUrl = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${tokenToUse}`;
            const subscribeResp = await fetch(subscribeUrl, { method: 'POST' });
            const subData = await subscribeResp.json();

            if (subData.error) {
                return res.status(400).json({ success: false, error: subData.error.message });
            }

            if (req.session.user) {
                req.session.selectedPageId = pageId;
            }

            res.json({ success: true, message: 'Página vinculada y webhooks suscritos correctamente', subData });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al conectar con la API de Meta.' });
    }
});

// =========================================================================
// 🔔 WEBHOOK DE ENTRADA: Verificación y Recepción de LeadGen de Meta
// =========================================================================

// 1. Verificación Inicial del Webhook por Meta (GET)
router.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'stelafunnels_secret_token';

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook de Meta verificado correctamente con el servidor!');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    res.sendStatus(400);
});

// 2. Recepción de Leads en Tiempo Real (POST)
router.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'page') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'leadgen') {
                        const leadgenId = change.value.leadgen_id;
                        const pageId = change.value.page_id;
                        console.log(`📩 Nuevo Lead detectado con ID: ${leadgenId} en la página: ${pageId}`);

                        db.get(`SELECT meta_access_token FROM users WHERE meta_access_token IS NOT NULL LIMIT 1`, [], async (err, row) => {
                            const userToken = (row ? row.meta_access_token : null) || process.env.META_ACCESS_TOKEN || global.metaAccessToken;

                            let name = 'Lead de Meta (Prueba)';
                            let email = 'lead_meta@stelafunnels.com';
                            let phone = '+34 600 000 000';

                            if (userToken) {
                                try {
                                    const leadRes = await fetch(`https://graph.facebook.com/v19.0/${leadgenId}?access_token=${userToken}`);
                                    const leadData = await leadRes.json();

                                    if (leadData && leadData.field_data) {
                                        leadData.field_data.forEach(field => {
                                            if (field.name === 'full_name' || field.name === 'nombre_completo') name = field.values[0];
                                            if (field.name === 'email' || field.name === 'correo') email = field.values[0];
                                            if (field.name === 'phone_number' || field.name === 'telefono') phone = field.values[0];
                                        });
                                    }
                                } catch (apiErr) {
                                    console.log("⚠️ No se pudo consultar la Graph API de Meta, usando datos base de la prueba.");
                                }
                            }

                            console.log(`🎉 Lead Procesado: ${name} | ${email} | ${phone}`);

                            // Guardar el lead en SQLite para que aparezca en el Pipeline y Contactos del CRM
                            const leadId = Date.now().toString();
                            db.run(
                                `INSERT OR REPLACE INTO leads (id, name, email, phone, value, stage, source, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [leadId, name, email, phone, 150000, 'lead_entrante', 'Facebook Ads', 'Abierto', '["Lead Ads"]'],
                                (dbErr) => {
                                    if (dbErr) {
                                        console.error("❌ Error guardando lead en BD:", dbErr);
                                    } else {
                                        console.log("✅ ¡Lead guardado en SQLite con éxito y listo para el CRM!");
                                    }
                                }
                            );
                        });
                    }
                }
            }
            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("❌ Error procesando webhook de Meta:", error);
        res.sendStatus(500);
    }
});

// ==========================================
// ✍️ RESTO DE RUTAS DE PUBLICACIÓN (POST, FOTO, VIDEO)
// ==========================================
router.post('/post', requireAuth, async (req, res) => {
    try {
        const { pageId, pageToken, message } = req.body;
        if (!pageId || !pageToken || !message) {
            return res.status(400).json({ success: false, error: "Faltan parámetros obligatorios." });
        }
        const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, access_token: pageToken })
        });
        const data = await response.json();
        if (data.error) return res.status(500).json({ success: false, error: data.error.message });
        res.json({ success: true, message: "¡Publicado con éxito!", postId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al publicar." });
    }
});

router.post('/photo', requireAuth, async (req, res) => {
    try {
        const { pageId, pageToken, imageUrl, caption } = req.body;
        if (!pageId || !pageToken || !imageUrl) {
            return res.status(400).json({ success: false, error: "Faltan parámetros obligatorios." });
        }
        const url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imageUrl, caption: caption || '', access_token: pageToken })
        });
        const data = await response.json();
        if (data.error) return res.status(500).json({ success: false, error: data.error.message });
        res.json({ success: true, message: "¡Fotografía publicada con éxito!", photoId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al subir la imagen." });
    }
});

router.post('/video', requireAuth, async (req, res) => {
    try {
        const { pageId, pageToken, videoUrl, description } = req.body;
        if (!pageId || !pageToken || !videoUrl) {
            return res.status(400).json({ success: false, error: "Faltan parámetros obligatorios." });
        }
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) return res.status(400).json({ success: false, error: "No se pudo descargar el video." });

        const arrayBuffer = await videoResponse.arrayBuffer();
        const videoBuffer = Buffer.from(arrayBuffer);
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

        const formData = new FormData();
        formData.append('source', videoBlob, 'video.mp4');
        formData.append('description', description || '');
        formData.append('access_token', pageToken);

        const url = `https://graph.facebook.com/v19.0/${pageId}/videos`;
        const response = await fetch(url, { method: 'POST', body: formData });
        const data = await response.json();

        if (data.error) return res.status(500).json({ success: false, error: data.error.message });
        res.json({ success: true, message: "¡Video publicado con éxito!", videoId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al subir el video." });
    }
});

module.exports = router;