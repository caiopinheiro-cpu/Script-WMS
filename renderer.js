const path = require('path');

const comboModo = document.getElementById('combo-modo');
const lblInstr = document.getElementById('lbl-instr');
const txtInput = document.getElementById('txt-input');
const txtUser = document.getElementById('txt-user');
const txtPass = document.getElementById('txt-pass');
const btnSaveCreds = document.getElementById('btn-save-creds');

const fs = require('fs');
const os = require('os');
const credsPath = path.join(os.homedir(), 'arco-wms-creds.json');

// Carregar credenciais
if (fs.existsSync(credsPath)) {
    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (creds.user) txtUser.value = creds.user;
        if (creds.pass) txtPass.value = creds.pass;
    } catch (e) { }
} else {
    if (localStorage.getItem('wms_user')) txtUser.value = localStorage.getItem('wms_user');
    if (localStorage.getItem('wms_pass')) txtPass.value = localStorage.getItem('wms_pass');
}

// Salvar credenciais
btnSaveCreds.addEventListener('click', () => {
    const user = txtUser.value.trim();
    const pass = txtPass.value.trim();

    try {
        fs.writeFileSync(credsPath, JSON.stringify({ user, pass }));
    } catch (e) {
        console.error("Erro ao salvar:", e);
    }

    localStorage.setItem('wms_user', user);
    localStorage.setItem('wms_pass', pass);

    addLog("Credenciais salvas!", "sucesso");

    const originalIcon = btnSaveCreds.innerHTML;
    btnSaveCreds.innerHTML = '<i class="fa-solid fa-check"></i>';
    btnSaveCreds.style.background = "rgba(74, 222, 128, 0.2)";
    btnSaveCreds.style.color = "#166534";
    btnSaveCreds.style.borderColor = "rgba(74, 222, 128, 0.4)";

    setTimeout(() => {
        btnSaveCreds.innerHTML = originalIcon;
        btnSaveCreds.style.background = "rgba(66, 129, 203, 0.15)";
        btnSaveCreds.style.color = "var(--azul-arco)";
        btnSaveCreds.style.borderColor = "rgba(66, 129, 203, 0.2)";
    }, 2000);
});

const btnAbrir = document.getElementById('btn-abrir');
const btnIniciar = document.getElementById('btn-iniciar');
const btnParar = document.getElementById('btn-parar');
const progressBar = document.getElementById('progress-bar');
const logBox = document.getElementById('log-box');
const webview = document.getElementById('wms-view');
webview.setAttribute('preload', 'file://' + path.join(__dirname, 'preload.js'));

const WMS_SAE_URL = "https://k1.wms.ocs.oraclecloud.com/arcoed/index_pwa/vp/app/htmlrf";
const WMS_SAS_URL = "https://tk1.wms.ocs.oraclecloud.com/arcoed_test/index_pwa/vp/app/htmlrf";
let CURRENT_WMS_URL = WMS_SAE_URL;

const btnWmsSae = document.getElementById('btn-wms-sae');
const btnWmsSas = document.getElementById('btn-wms-sas');

btnWmsSae.addEventListener('click', () => {
    CURRENT_WMS_URL = WMS_SAE_URL;
    btnWmsSae.classList.add('active');
    btnWmsSae.style.background = 'var(--azul-arco)';
    btnWmsSae.style.color = 'white';
    btnWmsSas.classList.remove('active');
    btnWmsSas.style.background = 'transparent';
    btnWmsSas.style.color = 'var(--text-main)';
    addLog("WMS alterado para SAE (Produção)");
    btnAbrir.disabled = false;
});

btnWmsSas.addEventListener('click', () => {
    CURRENT_WMS_URL = WMS_SAS_URL;
    btnWmsSas.classList.add('active');
    btnWmsSas.style.background = 'var(--azul-arco)';
    btnWmsSas.style.color = 'white';
    btnWmsSae.classList.remove('active');
    btnWmsSae.style.background = 'transparent';
    btnWmsSae.style.color = 'var(--text-main)';
    addLog("WMS alterado para SAS (Teste)");
    btnAbrir.disabled = false;
});

let isRunning = false;

function atualizarInstrucoes() {
    const modo = comboModo.value;
    let texto = "";
    if (modo === "Fracionamento") texto = "📍 Tela: Fracionamento/Split\n📋 Ordem: [SKU]  [QUANTIDADE]  [NOVA LPN]";
    else if (modo === "Recebimento") texto = "📍 Tela: Recebimento\n📋 Ordem: [LPN]  [SKU]  [QUANTIDADE]";
    else if (modo === "Cancelamento") texto = "📍 Tela: Cancelar OBLPN\n📋 Ordem: [OBLPN]  [NOVA IBLPN] (Posição Fixa: ESTRP21204)";
    else if (modo === "Movimentar") texto = "📍 Tela: Movimentação LPN\n📋 Ordem: [LPN]  [POSIÇÃO]";
    else if (modo === "Retorno") texto = "📍 Tela: Retorno do Ativo\n📋 Ordem: [LPN]  [LOCAL]  [ITEM]  [QUANTIDADE]";
    else if (modo === "Carga") texto = "📍 Tela: Carga Inicial\n📋 Ordem: [LPN]  [SKU]  [QTD]  [POSIÇÃO]";
    lblInstr.innerText = texto;
}
comboModo.addEventListener('change', atualizarInstrucoes);
atualizarInstrucoes();

function addLog(msg, tipo = "info") {
    let prefix = ">> ";
    if (tipo === "erro") prefix = "!! ";
    if (tipo === "sucesso") prefix = "OK ";

    const span = document.createElement('div');
    span.innerText = `${prefix}${msg}`;

    if (tipo === "erro") {
        span.style.color = "#f87171";
    } else if (tipo === "sucesso") {
        span.style.color = "#4ade80";
    } else {
        span.style.color = "#38bdf8";
    }

    logBox.appendChild(span);
    logBox.scrollTop = logBox.scrollHeight;
}

btnAbrir.addEventListener('click', () => {
    addLog("Carregando WMS...");
    webview.src = CURRENT_WMS_URL;
    btnAbrir.disabled = true;

    webview.addEventListener('did-finish-load', () => {
        const user = txtUser.value.trim();
        const pass = txtPass.value.trim();

        if (!user || !pass) {
            addLog("Login manual necessário.", "erro");
        } else {
            addLog("Página carregada. Iniciando acesso automático...");
            webview.send('auto-login', { user, pass });
        }
        btnIniciar.disabled = false;
    }, { once: true });
});

btnParar.addEventListener('click', () => {
    isRunning = false;
    addLog("Processamento interrompido pelo usuário.", "erro");
    btnParar.innerText = "Parando...";
});

btnIniciar.addEventListener('click', async () => {
    const rawData = txtInput.value.trim();
    if (!rawData) return alert("Por favor, insira os dados para processamento.");

    const linhas = rawData.split('\n');
    const listaDados = linhas.map(l => l.split(/\s+/)).filter(l => l.length >= 2);

    if (listaDados.length === 0) return alert("Nenhum dado válido encontrado.");

    isRunning = true;
    btnIniciar.disabled = true;
    txtInput.disabled = true;
    btnParar.disabled = false;
    btnParar.innerText = "PARAR";

    progressBar.max = listaDados.length;
    progressBar.value = 0;

    let sucessos = 0, erros = 0;
    const modo = comboModo.value;

    addLog(`Iniciando lote: ${listaDados.length} registros.`);

    for (let i = 0; i < listaDados.length; i++) {
        if (!isRunning) break;

        const dados = listaDados[i];
        addLog(`Item ${i + 1}: ${dados[0]}`);

        try {
            await new Promise((resolve, reject) => {
                const handler = (e) => {
                    if (e.channel === 'rotina-result') {
                        webview.removeEventListener('ipc-message', handler);
                        if (e.args[0].success) resolve();
                        else reject(e.args[0].error);
                    }
                };
                webview.addEventListener('ipc-message', handler);
                webview.send('run-rotina', { modo, dados });
            });

            addLog(`[${i + 1}/${listaDados.length}] Sucesso`, "sucesso");
            sucessos++;

        } catch (error) {
            addLog(`[${i + 1}/${listaDados.length}] Falha: ${error}`, "erro");
            erros++;
            webview.send('recover-error', modo);
            await new Promise(r => setTimeout(r, 4000));
        }

        progressBar.value = i + 1;
    }

    addLog("------------------------------");
    addLog(`Concluído: ${sucessos} Sucessos | ${erros} Falhas`);
    alert(`Processamento Concluído!\nSucessos: ${sucessos}\nFalhas: ${erros}`);

    isRunning = false;
    btnIniciar.disabled = false;
    btnParar.disabled = true;
    btnParar.innerText = "PARAR";
    txtInput.disabled = false;
});

webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'webview-log') addLog(`[WMS] ${e.args[0]}`);
});