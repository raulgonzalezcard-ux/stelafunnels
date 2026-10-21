const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión a la base de datos SQLite de producción[cite: 16]
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Middleware de seguridad para verificar sesión[cite: 16]
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ success: false, error: "No autorizado. Inicia sesión en el CRM." });
};

// =========================================================================
// 🔀 0. CALLBACK DE OAUTH: Intercambiar el código por el Token y guardarlo
// =========================================================================
router.get('/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        console.error("❌ No se recibió el código de autorización de Facebook.");
        return res.redirect('/?error=no_code');
    }

    if (!req.session || !req.session.user) {
        console.error("❌ Sesión de usuario perdida durante el callback de Facebook.");
        return res.redirect('/login?error=session_lost');
    }

    const userId = req.session.user.id;
    const clientId = process.env.FACEBOOK_APP_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET;
    
    // IMPORTANTE: Debe coincidir exactamente con la URL configurada en Meta Developers
    const redirectUri = 'https://www.stelafunnels.com/auth/facebook/callback';

    try {
        // 1. Intercambiar el código por un Token de acceso de corta duración
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`;
        
        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error("❌ Error al obtener el token de Meta:", tokenData.error);
            return res.redirect('/?error=token_exchange_failed');
        }

        const shortLivedToken = tokenData.access_token;

        // 2. Intercambiar por un Token de Larga Duración (60 días)
        const longTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;
        
        const longResponse = await fetch(longTokenUrl);
        const longData = await longResponse.json();

        const finalAccessToken = longData.access_token || shortLivedToken;

        // 3. Guardar el token en la base de datos SQLite asociado al usuario actual
        db.run(`UPDATE users SET meta_access_token = ? WHERE id = ?`, [finalAccessToken, userId], (err) => {
            if (err) {
                console.error("❌ Error al guardar el token de Meta en SQLite:", err);
                return res.redirect('/?error=db_save_failed');
            }

            console.log(`✅ ¡Token de Meta guardado exitosamente para el usuario ID: ${userId}!`);
            // Redirigir de regreso al Launchpad con éxito y estatus conectado
            return res.redirect('/?success=facebook_connected');
        });

    } catch (error) {
        console.error("❌ Error crítico en el callback de Facebook:", error);
        return res.redirect('/?error=server_error');
    }
});

// =========================================================================
// 🔍 0. ESTADO DE CONEXIÓN: Verificar si el usuario tiene token de Meta activo
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

        // Consultamos el token de Meta específico de ESTE usuario en la base de datos[cite: 16]
        db.get(`SELECT meta_access_token FROM users WHERE id = ?`, [userId], async (err, row) => {
            if (err || !row || !row.meta_access_token) {
                console.warn(`⚠️ Usuario ${userId} intentó listar páginas sin token de Meta conectado.`[cite: 16]);
                return res.status(401).json({ 
                    success: false, 
                    error: "Tu cuenta de Meta no está conectada. Ve al Launchpad y conéctala." 
                });
            }

            console.log(`🔍 Consultando a Meta páginas para el usuario ID: ${userId}...`[cite: 16]);
            const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${row.meta_access_token}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error("❌ Error devuelto por Meta al listar páginas:", data.error);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            console.log(`✅ Se encontraron ${data.data ? data.data.length : 0} páginas.`[cite: 16]);
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
