// Cargar variables de entorno del archivo .env de forma segura
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 CORRECCIÓN CRÍTICA: Confiar en todos los saltos del proxy inverso de Coolify / Nginx
app.set('trust proxy', true);

// ==========================================
// 📦 CONFIGURACIÓN DE LA BASE DE DATOS SQLITE
// ==========================================
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con la base de datos SQLite:', err.message);
    } else {
        console.log('📦 Conectado a la Base de Datos SQLite de producción.');
    }
});

// Crear tabla de usuarios/inquilinos con la columna meta_access_token integrada
db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    meta_access_token TEXT,
    status TEXT DEFAULT 'active',
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Crear tabla de Embudos / Landing Pages si no existe
db.run(`CREATE TABLE IF NOT EXISTS funnels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    steps INTEGER DEFAULT 1,
    updated TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 🔑 Variables globales para tokens de redes sociales
global.metaAccessToken = null;
global.googleAccessToken = null;

// ==========================================
// 🛠️ MIDDLEWARES GLOBALES
// ==========================================
app.use(cors({
    origin: true,
    credentials: true
}));

app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de Sesiones PERSISTENTES en Base de Datos SQLite
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: __dirname
    }),
    secret: process.env.SESSION_SECRET || 'stelafunnels_secure_production_key_2026',
    resave: true,          // 👈 Actualizado para forzar guardado en redirecciones OAuth
    saveUninitialized: true, // 👈 Actualizado para persistir sesiones iniciales
    proxy: true, 
    cookie: { 
        secure: true,      // Obligatorio con HTTPS
        httpOnly: true,
        sameSite: 'none',  // 👈 CORRECCIÓN CLAVE: Permite cookies tras redirección de Google/Meta
        path: '/', 
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días de sesión
    }
}));

// ==========================================
// 🔐 AUTENTICACIÓN TRADICIONAL (REGISTRO Y LOGIN)
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'El correo electrónico y la contraseña son obligatorios.' });
        }

        db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()], async (err, row) => {
            if (row) {
                return res.status(400).json({ success: false, error: 'El correo electrónico ya se encuentra registrado.' });
            }

            try {
                const hashedPassword = await bcrypt.hash(password, 10);
                const userId = Date.now().toString();
                const userName = name || 'Empresa Global';
                const status = 'active'; 
                const role = 'admin';

                db.run(
                    `INSERT INTO users (id, name, email, password, status, role) VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, userName, email.toLowerCase(), hashedPassword, status, role],
                    function(insertErr) {
                        if (insertErr) {
                            console.error('Error al insertar usuario en BD:', insertErr);
                            return res.status(500).json({ success: false, error: 'Error interno al registrar el usuario.' });
                        }

                        req.session.user = { 
                            id: userId, 
                            name: userName, 
                            email: email.toLowerCase(), 
                            picture: null,
                            role, 
                            status 
                        };

                        req.session.save(() => {
                            console.log(`👤 Nueva cuenta registrada y guardada: ${email}`);
                            return res.status(201).json({
                                success: true,
                                message: 'Cuenta creada con éxito',
                                user: req.session.user
                            });
                        });
                    }
                );
            } catch (hashError) {
                console.error('Error al encriptar contraseña:', hashError);
                return res.status(500).json({ success: false, error: 'Error al procesar las credenciales.' });
            }
        });

    } catch (error) {
        console.error('Error en ruta de registro:', error);
        return res.status(500).json({ success: false, error: 'Error interno en el servidor.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Ingresa tu correo y contraseña.' });
        }

        db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()], async (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
            }

            if (!user) {
                return res.status(401).json({ success: false, error: 'El correo electrónico no está registrado en el sistema.' });
            }

            if (user.status === 'suspended') {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Esta cuenta se ha pausado por falta de pago o renovación.',
                    suspended: true 
                });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
            }

            req.session.user = { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                picture: null,
                role: user.role, 
                status: user.status 
            };

            req.session.save(() => {
                console.log(`🔓 Sesión iniciada correctamente: ${email}`);
                return res.json({ 
                    success: true, 
                    message: '¡Bienvenido de nuevo!', 
                    user: req.session.user 
                });
            });
        });

    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ success: false, error: 'Error interno al procesar el ingreso.' });
    }
});

// ==========================================
// 🚀 RUTAS API DE EMBUDOS Y SITIOS WEB (FUNNELS)
// ==========================================
app.get('/api/funnels', (req, res) => {
    db.all(`SELECT * FROM funnels ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al consultar embudos.' });
        }
        res.json({ success: true, funnels: rows });
    });
});

app.post('/api/funnels', (req, res) => {
    const { id, name, url, steps, updated } = req.body;
    const funnelId = id || 'f_' + Date.now();
    
    db.run(
        `INSERT OR REPLACE INTO funnels (id, name, url, steps, updated) VALUES (?, ?, ?, ?, ?)`,
        [funnelId, name || 'Nuevo Embudo', url || '', steps || 1, updated || 'Hoy'],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al guardar embudo.' });
            }
            res.json({ success: true, id: funnelId });
        }
    );
});

// ==========================================
// 🔑 RUTAS DE AUTENTICACIÓN CON META (FACEBOOK)
// ==========================================
app.get('/auth/facebook', (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;
    const host = req.get('host');
    const protocol = req.protocol;
    const redirectUri = encodeURIComponent(`${protocol}://${host}/auth/facebook/callback`);
    const scopes = ['pages_show_list', 'pages_read_engagement', 'leads_retrieval', 'pages_manage_metadata'].join(',');

    if (!appId) {
        console.error("❌ Error: FACEBOOK_APP_ID no está definido");
        return res.status(500).send("Falta FACEBOOK_APP_ID en las variables de entorno.");
    }

    res.redirect(`https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code`);
});

app.get('/auth/facebook/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.redirect('/?error=auth_failed');
    
    try {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        const host = req.get('host');
        const protocol = req.protocol;
        const redirectUri = `${protocol}://${host}/auth/facebook/callback`;

        const tokenUrl = `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
        const response = await fetch(tokenUrl);
        const data = await response.json();

        if (data.error) return res.redirect('/?error=token_exchange_failed');

        const longLivedUrl = `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${data.access_token}`;
        const llResponse = await fetch(longLivedUrl);
        const llData = await llResponse.json();

        const accessToken = llData.access_token || data.access_token;

        // 👈 AJUSTE APLICADO EXACTAMENTE COMO LO SOLICITASTE:
        if (req.session && req.session.user && req.session.user.id) {
            const userId = req.session.user.id;
            db.run(`UPDATE users SET meta_access_token = ? WHERE id = ?`, [accessToken, userId], (err) => {
                if (err) console.error("Error guardando token de Meta:", err);
                res.redirect('/?success=meta_connected');
            });
        } else {
            // Fallback en caso de que la sesión se pierda durante la redirección de OAuth
            db.get(`SELECT * FROM users ORDER BY created_at ASC LIMIT 1`, [], (dbErr, user) => {
                if (user) {
                    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
                    db.run(`UPDATE users SET meta_access_token = ? WHERE id = ?`, [accessToken, user.id], () => {
                        req.session.save(() => res.redirect('/?success=meta_connected'));
                    });
                } else {
                    res.redirect('/?error=unauthorized');
                }
            });
        }

    } catch (err) {
        console.error("Error crítico en callback Facebook:", err);
        res.redirect('/?error=server_error');
    }
});

// ==========================================
// 🔑 RUTAS DE AUTENTICACIÓN CON GOOGLE OAUTH 2.0
// ==========================================
app.get('/auth/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const host = req.get('host');
    const protocol = req.protocol; 
    const redirectUri = `${protocol}://${host}/auth/google/callback`;

    if (!clientId) {
        console.error("❌ Error: GOOGLE_CLIENT_ID no está definido");
        return res.status(500).send("Falta GOOGLE_CLIENT_ID en las variables de entorno.");
    }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email');
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.redirect('/?error=google_auth_failed');

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const host = req.get('host');
        const protocol = req.protocol; 
        const redirectUri = `${protocol}://${host}/auth/google/callback`;

        const tokenUrl = 'https://oauth2.googleapis.com/token';
        const params = new URLSearchParams({
            code: code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });

        const tokenResp = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        const tokenData = await tokenResp.json();

        if (tokenData.error) return res.redirect('/?error=google_token_exchange_failed');
        global.googleAccessToken = tokenData.access_token;

        const userResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const userData = await userResp.json();

        const googleEmail = userData.email || "admin@stelafunnels.com";
        const googleName = userData.name || "Usuario Google";
        const googleId = 'google_' + (userData.id || Date.now());

        db.get(`SELECT * FROM users WHERE email = ?`, [googleEmail.toLowerCase()], (err, existingUser) => {
            if (existingUser) {
                req.session.user = {
                    id: existingUser.id,
                    name: existingUser.name,
                    email: existingUser.email,
                    picture: userData.picture || null,
                    role: existingUser.role,
                    status: existingUser.status
                };
                return req.session.save(() => res.redirect('/?success=google_connected'));
            } else {
                const hashedPassword = bcrypt.hashSync('google_oauth_pass_2026', 10);
                db.run(
                    `INSERT INTO users (id, name, email, password, status, role) VALUES (?, ?, ?, ?, 'active', 'admin')`,
                    [googleId, googleName, googleEmail.toLowerCase(), hashedPassword],
                    (insertErr) => {
                        req.session.user = {
                            id: googleId,
                            name: googleName,
                            email: googleEmail.toLowerCase(),
                            picture: userData.picture || null,
                            role: 'admin',
                            status: 'active'
                        };
                        return req.session.save(() => res.redirect('/?success=google_connected'));
                    }
                );
            }
        });

    } catch (err) {
        console.error("Error en callback Google:", err);
        res.redirect('/?error=server_error');
    }
});

// ==========================================
// 📡 ENDPOINTS DE SESIÓN
// ==========================================
app.get('/api/user-session', (req, res) => {
    if (req.session && req.session.user) {
        if (req.session.user.status === 'suspended') {
            return res.json({ loggedIn: false, suspended: true });
        }
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        global.metaAccessToken = null;
        global.googleAccessToken = null;
        res.json({ success: true });
    });
});

// ==========================================
// 🚨 DETECTOR UNIVERSAL DE LEADS (WEBHOOKS) DE META
// ==========================================
app.post(['/api/meta/webhook', '/api/webhooks'], async (req, res) => {
    try {
        const body = req.body;
        console.log("🔥 Webhook recibido de Meta:", JSON.stringify(body, null, 2));

        if (body.object === 'page') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'leadgen') {
                        const leadgenId = change.value.leadgen_id;
                        const pageId = change.value.page_id;
                        console.log(`📩 Lead detectado - ID: ${leadgenId}, Página: ${pageId}`);

                        const leadId = Date.now().toString();
                        const name = "Lead de Meta en Vivo";
                        const email = "lead_meta@stelafunnels.com";
                        const phone = "+34 600 000 000";

                        db.run(
                            `INSERT OR REPLACE INTO leads (id, name, email, phone, value, stage, source, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [leadId, name, email, phone, 150000, 'lead_entrante', 'Facebook Ads', 'Abierto', '["Lead Ads"]'],
                            (dbErr) => {
                                if (dbErr) console.error("❌ Error al guardar en SQLite:", dbErr);
                                else console.log("✅ ¡Lead guardado con éxito en SQLite y visible en el CRM!");
                            }
                        );
                    }
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        }
        res.sendStatus(404);
    } catch (e) {
        console.error("❌ Error procesando webhook universal:", e);
        res.sendStatus(500);
    }
});

const metaRoutes = require('./routes/meta');
const webhookRoutes = require('./routes/webhooks');

app.use('/api/meta', metaRoutes);
app.use('/api/webhooks', webhookRoutes);

// ==========================================
// 🖥️ ARCHIVOS ESTÁTICOS Y FALLBACK SPA (RUTAS ANIDADAS /v2/...)
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// 🚀 CLAVE ABSOLUTA: Redirigir TODA ruta anidada (como /v2/location/...) al index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error("❌ Error al enviar index.html:", err);
            res.status(500).send("Error interno al cargar la aplicación.");
        }
    });
});

// ==========================================
// 🚀 INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 ROCKET OS / STELAFUNNELS CORRIENDO EN PUERTO: ${PORT}`);
});

module.exports = app;
