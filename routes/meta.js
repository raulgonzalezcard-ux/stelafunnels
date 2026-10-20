const express = require('express');
const router = express.Router();

// =========================================================================
// 📋 1. TRAER INFORMACIÓN: Listar las páginas vinculadas y sus Tokens propios
// =========================================================================
router.get('/pages', async (req, res) => {
    try {
        // Recuperamos el token maestro que guardamos globalmente en server.js
        const userToken = global.metaAccessToken;

        if (!userToken) {
            console.error("⚠️ Intento de acceso a páginas sin Token de usuario activo.");
            return res.status(401).json({ 
                success: false, 
                error: "No estás autenticado. Por favor, haz clic en 'Conectar' en el frontend primero." 
            });
        }

        console.log("🔍 Consultando a Meta la lista de páginas administradas...");
        
        // Endpoint de Graph API para traer las fanpages del usuario y sus Page Access Tokens
        const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ Error devuelto por Meta al listar páginas:", data.error);
            return res.status(500).json({ success: false, error: data.error.message });
        }

        console.log(`✅ Se encontraron ${data.data ? data.data.length : 0} páginas disponibles.`);
        
        // Devolvemos las páginas al Frontend (trae el id de la página, nombre, categoría y su token exclusivo)
        res.json({
            success: true,
            pages: data.data 
        });

    } catch (error) {
        console.error("❌ Error crítico en GET /pages:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor al procesar las páginas." });
    }
});

// =========================================================================
// ✍️ 2. PUBLICAR CONTENIDO: Crear un post de texto plano en el feed de la página
// =========================================================================
router.post('/post', async (req, res) => {
    try {
        const { pageId, pageToken, message } = req.body;

        // Validamos que el frontend envíe los datos necesarios
        if (!pageId || !pageToken || !message) {
            return res.status(400).json({ 
                success: false, 
                error: "Faltan parámetros obligatorios: pageId, pageToken o message." 
            });
        }

        console.log(`📝 Publicando texto en la página ID: ${pageId}...`);

        // Endpoint oficial de Meta para escribir en el feed de una página
        const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                access_token: pageToken // Aquí se usa obligatoriamente el token de la PÁGINA, no el de usuario
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Error de Meta al crear la publicación:", data.error);
            return res.status(500).json({ success: false, error: data.error.message });
        }

        console.log("🎉 ¡Post de texto publicado con éxito! ID del post:", data.id);
        res.json({
            success: true,
            message: "¡Contenido publicado con éxito en tu muro de Facebook!",
            postId: data.id
        });

    } catch (error) {
        console.error("❌ Error crítico en POST /post:", error);
        res.status(500).json({ success: false, error: "Error interno en el servidor al publicar." });
    }
});

// =========================================================================
// 🖼️ 3. SUBIR IMÁGENES: Publicar una foto usando una URL pública
// =========================================================================
router.post('/photo', async (req, res) => {
    try {
        const { pageId, pageToken, imageUrl, caption } = req.body;

        if (!pageId || !pageToken || !imageUrl) {
            return res.status(400).json({ 
                success: false, 
                error: "Faltan parámetros obligatorios: pageId, pageToken o imageUrl." 
            });
        }

        console.log(`🖼️ Subiendo imagen a la página ID: ${pageId}...`);

        // Endpoint oficial de Meta para la sección de fotos
        const url = `https://graph.facebook.com/v19.0/${pageId}/photos`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: imageUrl,               // URL pública de la imagen de tu propiedad/inmueble
                caption: caption || '',     // Texto que acompaña a la foto
                access_token: pageToken
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Error de Meta al subir la fotografía:", data.error);
            return res.status(500).json({ success: false, error: data.error.message });
        }

        console.log("🎉 ¡Fotografía subida con éxito! ID de la foto:", data.id);
        res.json({
            success: true,
            message: "¡Fotografía publicada con éxito en tu página!",
            photoId: data.id
        });

    } catch (error) {
        console.error("❌ Error crítico en POST /photo:", error);
        res.status(500).json({ success: false, error: "Error interno al subir la imagen." });
    }
});

// =========================================================================
// 🎥 4. SUBIR VIDEOS: Descarga el video con límite de tiempo y lo sube directo
// =========================================================================
router.post('/video', async (req, res) => {
    try {
        const { pageId, pageToken, videoUrl, description } = req.body;

        if (!pageId || !pageToken || !videoUrl) {
            return res.status(400).json({ 
                success: false, 
                error: "Faltan parámetros obligatorios: pageId, pageToken o videoUrl." 
            });
        }

        console.log(`🎥 Procesando y descargando video para la página ID: ${pageId}...`);

        // Establecemos un temporizador de cancelación para que no se quede colgado si el enlace remoto no responde
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos máximos de descarga

        let videoResponse;
        try {
            videoResponse = await fetch(videoUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            console.error("❌ El proceso de descarga remota fue abortado o falló el enlace:", fetchErr.message);
            return res.status(400).json({ success: false, error: "La descarga del video tomó demasiado tiempo o el link es inaccesible." });
        }

        if (!videoResponse.ok) {
            console.error(`❌ Error en respuesta del servidor del video: ${videoResponse.statusText}`);
            return res.status(400).json({ success: false, error: "No se pudo descargar el video desde la URL proporcionada. Verifica que el link sea directo." });
        }

        // Convertimos el contenido binario a un buffer crudo compatible con multipart/form-data en Node
        const arrayBuffer = await videoResponse.arrayBuffer();
        const videoBuffer = Buffer.from(arrayBuffer);
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

        console.log(`📤 Generando Form Data e inyectando archivo crudo a los servidores de Meta...`);

        // 2. Empaquetamos el archivo usando FormData nativo de Node.js
        const formData = new FormData();
        formData.append('source', videoBlob, 'video.mp4'); 
        formData.append('description', description || '');
        formData.append('access_token', pageToken);

        // 3. Enviamos la petición directa al endpoint de videos de la Fan Page
        const url = `https://graph.facebook.com/v19.0/${pageId}/videos`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData 
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Error de Meta al subir el video:", data.error);
            return res.status(500).json({ success: false, error: data.error.message });
        }

        console.log("🎉 ¡Video subido con éxito! ID del video:", data.id);
        res.json({
            success: true,
            message: "¡Video publicado con éxito en tu página!",
            videoId: data.id
        });

    } catch (error) {
        console.error("❌ Error crítico en POST /video:", error);
        res.status(500).json({ success: false, error: "Error interno al procesar o subir el archivo de video." });
    }
});

module.exports = router;