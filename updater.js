const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── CONFIGURAÇÕES DO GITHUB ─────────────────────────────────────────────────
// O token é lido de config.json para não ficar exposto no código-fonte.
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        throw new Error('Arquivo config.json não encontrado. Crie-o com as credenciais do GitHub.');
    }
}

const _cfg          = loadConfig();
const GITHUB_TOKEN  = _cfg.github_token;
const GITHUB_OWNER  = _cfg.github_owner  || 'caiopinheiro-cpu';
const GITHUB_REPO   = _cfg.github_repo   || 'Script-WMS';
const GITHUB_BRANCH = _cfg.github_branch || 'main';

// Arquivos que serão verificados e atualizados automaticamente
const FILES_TO_UPDATE = [
    'index.html',
    'renderer.js',
    'preload.js',
    'splash.html',
    'update.html'
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Faz uma requisição HTTPS genérica e retorna uma Promise com os dados.
 */
function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'ArcoWMSAutomator',
                'Authorization': `token ${GITHUB_TOKEN}`,
                ...headers
            }
        };

        https.get(url, options, (res) => {
            // Segue redirecionamentos (GitHub CDN redireciona para raw content)
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} ao acessar: ${url}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Lê a versão atual gravada no arquivo local version.json.
 * Se não existir, retorna '0.0.0'.
 */
function getLocalVersion(appPath) {
    const versionFile = path.join(appPath, 'version.json');
    try {
        if (fs.existsSync(versionFile)) {
            const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
            return data.version || '0.0.0';
        }
    } catch (e) {
        // Arquivo corrompido ou inexistente
    }
    return '0.0.0';
}

/**
 * Salva a nova versão no arquivo local version.json.
 */
function saveLocalVersion(appPath, version) {
    const versionFile = path.join(appPath, 'version.json');
    fs.writeFileSync(versionFile, JSON.stringify({ version }, null, 2), 'utf-8');
}

/**
 * Compara duas strings de versão no formato semver (ex: "1.2.3").
 * Retorna true se remoteVersion > localVersion.
 */
function isNewerVersion(remoteVersion, localVersion) {
    const parse = v => v.replace(/^v/, '').split('.').map(Number);
    const remote = parse(remoteVersion);
    const local = parse(localVersion);

    for (let i = 0; i < Math.max(remote.length, local.length); i++) {
        const r = remote[i] || 0;
        const l = local[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

/**
 * Busca a última versão (tag) no repositório GitHub.
 * Retorna um objeto { version, sha } ou null se falhar.
 */
async function fetchLatestRelease() {
    try {
        // Tenta buscar o arquivo version.json do repositório para comparar
        const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/version.json?ref=${GITHUB_BRANCH}`;
        const raw = await httpsGet(apiUrl);
        const json = JSON.parse(raw);

        // O conteúdo do arquivo vem em base64
        const content = Buffer.from(json.content, 'base64').toString('utf-8');
        const versionData = JSON.parse(content);

        return {
            version: versionData.version,
            sha: json.sha
        };
    } catch (e) {
        console.error('[Updater] Erro ao buscar versão remota:', e.message);
        return null;
    }
}

/**
 * Baixa um arquivo específico do GitHub e sobrescreve o local.
 */
async function downloadFile(fileName, destPath) {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${fileName}`;
    
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'ArcoWMSAutomator',
                'Authorization': `token ${GITHUB_TOKEN}`
            }
        };

        const makeRequest = (url) => {
            https.get(url, options, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return makeRequest(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} ao baixar: ${fileName}`));
                }

                const fileStream = fs.createWriteStream(path.join(destPath, fileName));
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(fileName);
                });
                fileStream.on('error', reject);
            }).on('error', reject);
        };

        makeRequest(rawUrl);
    });
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────

/**
 * Verifica se há atualizações disponíveis no GitHub.
 * Retorna: { hasUpdate: boolean, remoteVersion: string, localVersion: string }
 */
async function checkForUpdates(appPath) {
    const localVersion = getLocalVersion(appPath);
    const remoteRelease = await fetchLatestRelease();

    if (!remoteRelease) {
        return { hasUpdate: false, localVersion, remoteVersion: localVersion, error: 'Não foi possível verificar atualizações.' };
    }

    const hasUpdate = isNewerVersion(remoteRelease.version, localVersion);

    return {
        hasUpdate,
        localVersion,
        remoteVersion: remoteRelease.version,
        error: null
    };
}

/**
 * Aplica a atualização: baixa todos os arquivos e salva a nova versão.
 * Chama onProgress(fileName, index, total) a cada arquivo baixado.
 */
async function applyUpdate(appPath, remoteVersion, onProgress) {
    const total = FILES_TO_UPDATE.length;

    for (let i = 0; i < total; i++) {
        const fileName = FILES_TO_UPDATE[i];
        if (onProgress) onProgress(fileName, i + 1, total);
        await downloadFile(fileName, appPath);
    }

    // Salva a nova versão localmente
    saveLocalVersion(appPath, remoteVersion);
}

module.exports = { checkForUpdates, applyUpdate };
