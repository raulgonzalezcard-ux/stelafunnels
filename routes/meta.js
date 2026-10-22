const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión a la base de datos SQLite de producción
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

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

    // Verificamos el token de Meta exclusivamente para ESTE usuario logueado
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

        // Consultamos el token de Meta específico de ESTE usuario en la base de datos
        db.get(`SELECT meta_access_token FROM users WHERE id = ?`, [userId], async (err, row) => {
            if (err || !row || !row.meta_access_token) {
                console.warn(`⚠️ Usuario ${userId} intentó listar páginas sin token de Meta conectado.`);
                return res.status(401).json({ 
                    success: false, 
                    error: "Tu cuenta de Meta no está conectada. Ve al Launchpad y conéctala." 
                });
            }

            console.log(`🔍 Consultando a Meta páginas para el usuario ID: ${userId}...`);
            const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${row.meta_access_token}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error("❌ Error devuelto por Meta al listar páginas:", data.error);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            console.log(`✅ Se encontraron ${data.data ? data.data.length : 0} páginas.`);
            res.json({ success: true, pages: data.data });
        });

    } catch (error) {
        console.error("❌ Error crítico en GET /pages:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor al procesar las páginas." });
    }
});

// =========================================================================
// ✍️ 2. PUBLICAR CONTENIDO: Texto plano
// =========================================================================
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
        if (data.error) {
            return res.status(500).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, message: "¡Publicado con éxito!", postId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al publicar." });
    }
});

// =========================================================================
// 🖼️ 3. SUBIR IMÁGENES
// =========================================================================
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
        if (data.error) {
            return res.status(500).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, message: "¡Fotografía publicada con éxito!", photoId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al subir la imagen." });
    }
});

// =========================================================================
// 🎥 4. SUBIR VIDEOS
// =========================================================================
router.post('/video', requireAuth, async (req, res) => {
    try {
        const { pageId, pageToken, videoUrl, description } = req.body;
        if (!pageId || !pageToken || !videoUrl) {
            return res.status(400).json({ success: false, error: "Faltan parámetros obligatorios." });
        }

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            return res.status(400).json({ success: false, error: "No se pudo descargar el video desde la URL." });
        }

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

        if (data.error) {
            return res.status(500).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, message: "¡Video publicado con éxito!", videoId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno al subir el video." });
    }
});

module.exports = router;