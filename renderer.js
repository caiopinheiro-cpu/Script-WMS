const path = require('path');

// Elementos da UI
const comboModo = document.getElementById('combo-modo');
const lblInstr = document.getElementById('lbl-instr');
const txtInput = document.getElementById('txt-input');
const txtUser = document.getElementById('txt-user');
const txtPass = document.getElementById('txt-pass');
const btnSaveCreds = document.getElementById('btn-save-creds');

// Carrega os dados salvos do localStorage
if (localStorage.getItem('wms_user')) txtUser.value = localStorage.getItem('wms_user');
if (localStorage.getItem('wms_pass')) txtPass.value = localStorage.getItem('wms_pass');

// Salva ao clicar no botão
btnSaveCreds.addEventListener('click', () => {
    const user = txtUser.value.trim();
    const pass = txtPass.value.trim();
    
    localStorage.setItem('wms_user', user);
    localStorage.setItem('wms_pass', pass);
    
    addLog("Credenciais salvas com sucesso!", "sucesso");
    
    // Feedback visual no botão
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

const WMS_URL = "https://k1.wms.ocs.oraclecloud.com/arcoed/index_pwa/vp/app/htmlrf";

let isRunning = false;

// Atualiza Instruções
function atualizarInstrucoes() {
    const modo = comboModo.value;
    let texto = "";
    if (modo === "Fracionamento") texto = "📍 Tela: Fracionamento/Split\n📋 Ordem: [SKU]  [QUANTIDADE]  [NOVA LPN]";
    else if (modo === "Recebimento") texto = "📍 Tela: Recebimento\n📋 Ordem: [LPN]  [SKU]  [QUANTIDADE]";
    else if (modo === "Cancelamento") texto = "📍 Tela: Cancelar OBLPN\n📋 Ordem: [OBLPN]  [NOVA IBLPN] (Posição Fixa: ESTRP21204)";
    else if (modo === "Movimentar") texto = "📍 Tela: Movimentação LPN\n📋 Ordem: [LPN]  [POSIÇÃO]";
    else if (modo === "Retorno") texto = "📍 Tela: Retorno do Ativo\n📋 Ordem: [LPN]  [LOCAL]  [ITEM]  [QUANTIDADE]";
    lblInstr.innerText = texto;
}
comboModo.addEventListener('change', atualizarInstrucoes);
atualizarInstrucoes();

// Função de Log
function addLog(msg, tipo = "info") {
    let prefix = ">> ";
    if (tipo === "erro") prefix = "!! ";
    if (tipo === "sucesso") prefix = "OK ";

    const span = document.createElement('div');
    span.innerText = `${prefix}${msg}`;

    // Cores adaptadas para o novo tema escuro do painel de logs
    if (tipo === "erro") {
        span.style.color = "#f87171"; // Vermelho claro
    } else if (tipo === "sucesso") {
        span.style.color = "#4ade80"; // Verde vibrante
    } else {
        span.style.color = "#38bdf8"; // Azul claro (padrão)
    }

    logBox.appendChild(span);
    logBox.scrollTop = logBox.scrollHeight;
}

// Abrir Navegador
btnAbrir.addEventListener('click', () => {
    addLog("Carregando WMS no painel ao lado...");
    webview.src = WMS_URL;
    btnAbrir.disabled = true;

    // Quando a página carregar, envia comando para auto-login
    webview.addEventListener('did-finish-load', () => {
        const user = txtUser.value.trim();
        const pass = txtPass.value.trim();

        if (!user || !pass) {
            addLog("Usuário ou senha não informados. Faça login manualmente.", "erro");
        } else {
            addLog("Página carregada. Tentando login automático...");
            webview.send('auto-login', { user, pass });
        }
        btnIniciar.disabled = false;
    }, { once: true });
});

// Parar Robô
btnParar.addEventListener('click', () => {
    isRunning = false;
    addLog("Parada solicitada. Aguardando fim do ciclo atual...", "erro");
    btnParar.innerText = "Parando...";
});

// Iniciar Robô
btnIniciar.addEventListener('click', async () => {
    const rawData = txtInput.value.trim();
    if (!rawData) return alert("Cole os dados na caixa de texto!");

    const linhas = rawData.split('\n');
    const listaDados = linhas.map(l => l.split(/\s+/)).filter(l => l.length >= 2);

    if (listaDados.length === 0) return alert("Formato de dados inválido.");

    isRunning = true;
    btnIniciar.disabled = true;
    txtInput.disabled = true;
    btnParar.disabled = false;
    btnParar.innerText = "PARAR";

    progressBar.max = listaDados.length;
    progressBar.value = 0;

    let sucessos = 0, erros = 0;
    const modo = comboModo.value;

    addLog(`Iniciando lote de ${listaDados.length} registros...`);

    for (let i = 0; i < listaDados.length; i++) {
        if (!isRunning) {
            addLog("Abortado pelo usuário.", "erro");
            break;
        }

        const dados = listaDados[i];
        addLog(`Processando linha ${i + 1}: ${dados[0]}...`);

        try {
            // Envia o comando para o preload executar o JS no DOM do WMS
            const resultado = await new Promise((resolve, reject) => {
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

            addLog(`[${i + 1}/${listaDados.length}] Sucesso: ${dados[0]}`, "sucesso");
            sucessos++;

        } catch (error) {
            addLog(`[${i + 1}/${listaDados.length}] Erro em ${dados[0]}: ${error}`, "erro");
            erros++;
            // Tentativa de recuperação (Recarregar página ou atalho CTRL+E)
            webview.send('recover-error', modo);
            await new Promise(r => setTimeout(r, 4000)); // Espera a recuperação
        }

        progressBar.value = i + 1;
    }

    addLog("------------------------------");
    addLog(`FIM: ${sucessos} Sucessos | ${erros} Erros`);
    alert(`Processamento Finalizado!\nSucessos: ${sucessos}\nErros: ${erros}`);

    isRunning = false;
    btnIniciar.disabled = false;
    btnParar.disabled = true;
    btnParar.innerText = "PARAR";
    txtInput.disabled = false;
});

// Escuta logs vindos de dentro do webview
webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'webview-log') addLog(`[WMS] ${e.args[0]}`);
});