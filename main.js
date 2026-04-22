const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { checkForUpdates, applyUpdate } = require('./updater');

// ─── REFERÊNCIAS DE JANELAS ───────────────────────────────────────────────────
let splashWindow = null;
let updateWindow = null;
let mainWindow   = null;

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 520,
        height: 420,
        frame: false,
        resizable: false,
        center: true,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    splashWindow.loadFile('splash.html');
    splashWindow.setSkipTaskbar(true);
}

// ─── TELA DE ATUALIZAÇÃO ──────────────────────────────────────────────────────
function createUpdateWindow(localVersion, remoteVersion) {
    updateWindow = new BrowserWindow({
        width: 580,
        height: 600,
        frame: false,
        resizable: false,
        center: true,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    updateWindow.loadFile('update.html');

    updateWindow.webContents.once('did-finish-load', () => {
        updateWindow.webContents.send('update-info', { localVersion, remoteVersion });
    });
}

// ─── JANELA PRINCIPAL DO APP ──────────────────────────────────────────────────
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Arco WMS Automator',
        autoHideMenuBar: true,
        show: false,   // só mostra depois que carregar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
        }
    });

    mainWindow.maximize();
    mainWindow.loadFile('index.html');

    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── HELPER: envia status para a splash ──────────────────────────────────────
function sendSplashStatus(type, text, subtext = '', progress = undefined, version = undefined) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('splash-status', { type, text, subtext, progress, version });
    }
}

// ─── FLUXO PRINCIPAL DE INICIALIZAÇÃO ────────────────────────────────────────
async function bootstrap() {
    // 1. Abre a splash
    createSplashWindow();

    // Aguarda a splash carregar
    await new Promise(resolve => splashWindow.webContents.once('did-finish-load', resolve));

    // Aguarda um instante para a animação de entrada aparecer
    await sleep(600);

    // 2. Verifica conexão e atualização
    sendSplashStatus('checking', 'Verificando atualizações...', 'Conectando ao GitHub');

    const appPath = app.getAppPath();
    let updateResult;

    try {
        updateResult = await checkForUpdates(appPath);
    } catch (e) {
        updateResult = { hasUpdate: false, localVersion: '0.0.0', remoteVersion: '0.0.0', error: e.message };
    }

    // Exibe a versão local na splash
    sendSplashStatus('checking', 'Verificando atualizações...', '', undefined, updateResult.localVersion);

    await sleep(800);

    // 3. Se há atualização disponível → abre tela de update
    if (updateResult.hasUpdate) {
        sendSplashStatus('checking', 'Nova versão encontrada!', `v${updateResult.localVersion} → v${updateResult.remoteVersion}`);
        await sleep(1000);

        // Fecha splash e abre tela de atualização
        splashWindow.close();
        splashWindow = null;

        createUpdateWindow(updateResult.localVersion, updateResult.remoteVersion);

    } else {
        // 4. Sem atualização → mostra OK e abre o app
        const msg = updateResult.error
            ? 'Sem conexão — continuando offline'
            : 'Aplicativo atualizado!';

        sendSplashStatus('success', msg, `Versão atual: v${updateResult.localVersion}`, 100, updateResult.localVersion);
        await sleep(1500);

        await openMainApp();
    }
}

// ─── ABRE O APP PRINCIPAL E FECHA A SPLASH ────────────────────────────────────
async function openMainApp() {
    try {
        await session.defaultSession.clearStorageData({
            storages: ['cookies']
        });
    } catch(e) {
        console.error('Falha ao limpar cache:', e);
    }

    createMainWindow();

    // Fecha a splash após o app principal carregar
    mainWindow.webContents.once('did-finish-load', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            setTimeout(() => {
                splashWindow.close();
                splashWindow = null;
            }, 400);
        }
        if (updateWindow && !updateWindow.isDestroyed()) {
            setTimeout(() => {
                updateWindow.close();
                updateWindow = null;
            }, 400);
        }
    });
}

// ─── IPC: BOTÃO "ATUALIZAR AGORA" ────────────────────────────────────────────
ipcMain.on('start-update', async () => {
    const appPath = app.getAppPath();

    // Busca versão remota novamente para garantir
    let remoteVersion = '0.0.0';
    try {
        const { checkForUpdates: check } = require('./updater');
        const result = await check(appPath);
        remoteVersion = result.remoteVersion;
    } catch (e) {}

    const { applyUpdate: apply } = require('./updater');

    try {
        await apply(appPath, remoteVersion, (file, current, total) => {
            if (updateWindow && !updateWindow.isDestroyed()) {
                updateWindow.webContents.send('update-progress', { file, current, total });
            }
        });

        // Sucesso
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update-done');
        }

        // Reinicia o app após 2s
        await sleep(2000);
        app.relaunch();
        app.exit(0);

    } catch (e) {
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update-error', `Erro ao atualizar: ${e.message}`);
        }
    }
});

// ─── IPC: BOTÃO "PULAR" ──────────────────────────────────────────────────────
ipcMain.on('skip-update', async () => {
    await openMainApp();
});

// ─── UTILS ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────
app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});