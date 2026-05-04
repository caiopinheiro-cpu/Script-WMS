const { ipcRenderer } = require('electron');

const POSICAO_PADRAO_CANCELAMENTO = "ESTRP21204";

const SELECTOR_INPUT_BARCODE = "//input[contains(@id, 'barcode-fld|input')]";
const SELECTOR_INPUT_NUMBER = "//input[contains(@class, 'oj-inputnumber-input')]";
const SELECTOR_BTN_OK = "//span[text()='OK' or text()='OK ' or contains(@id, '|text')]";
const SELECTOR_CAMPO_SELECAO = "//input[starts-with(@id, 'ui-id-') and contains(@id, '|input')]";
const SELECTOR_CAMPO_LPN_REQ = "//input[contains(@id, 'barcode-fld|input') and @aria-required='true']";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

async function waitForElement(xpath, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = getElementByXpath(xpath);
        if (el && el.offsetParent !== null && !el.disabled) return el;
        await sleep(200);
    }
    throw new Error(`Tempo esgotado aguardando: ${xpath}`);
}

async function sendKeys(el, text, action = null) {
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);

    if (action === 'ENTER') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, code: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, code: 'Enter', bubbles: true }));
    } else if (action === 'TAB') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, which: 9, code: 'Tab', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, which: 9, code: 'Tab', bubbles: true }));
    }
    await sleep(800);
}

async function simularCtrlE() {
    const el = document.activeElement || document.body || document;
    ipcRenderer.sendToHost('webview-log', 'Acionando comando CTRL+E...');
    
    const eventData = { 
        key: 'e', 
        keyCode: 69, 
        which: 69, 
        code: 'KeyE', 
        ctrlKey: true, 
        bubbles: true,
        cancelable: true,
        view: window
    };

    el.dispatchEvent(new KeyboardEvent('keydown', eventData));
    await sleep(50);
    el.dispatchEvent(new KeyboardEvent('keyup', eventData));
}

async function simularF2() {
    const el = document.activeElement || document.body || document;
    ipcRenderer.sendToHost('webview-log', 'Acionando comando F2...');
    
    const eventData = { 
        key: 'F2', 
        keyCode: 113, 
        which: 113, 
        code: 'F2', 
        bubbles: true,
        cancelable: true,
        view: window
    };

    el.dispatchEvent(new KeyboardEvent('keydown', eventData));
    await sleep(50);
    el.dispatchEvent(new KeyboardEvent('keyup', eventData));
}

// --- Rotinas de Automação ---

async function login(user, pass) {
    try {
        ipcRenderer.sendToHost('webview-log', 'Aguardando campos de login...');

        const userEl = await waitForElement("//*[@id='username']", 15000);
        const passEl = await waitForElement("//*[@id='password']", 15000);
        const btnSubmit = await waitForElement("//*[@id='submit']", 15000);

        if (userEl && passEl && btnSubmit) {
            await sendKeys(userEl, user);
            await sendKeys(passEl, pass);
            await sleep(500);
            btnSubmit.click();
            ipcRenderer.sendToHost('webview-log', 'Login automático iniciado.');
        }
    } catch (e) {
        ipcRenderer.sendToHost('webview-log', 'Login manual necessário: ' + e.message);
    }
}

async function rotinaFracionamento(dados) {
    const [sku, qtd, lpn] = dados;

    let campoSku = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoSku, sku, 'ENTER');
    await sleep(1000);

    let campoQtd = await waitForElement(SELECTOR_INPUT_NUMBER);
    await sendKeys(campoQtd, qtd, 'TAB');
    await sleep(1000);

    let campoLpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoLpn, lpn, 'ENTER');
    await sleep(2000);

    let btnOk = await waitForElement(SELECTOR_BTN_OK);
    btnOk.click();
    await sleep(1500);
}

async function rotinaRecebimento(dados) {
    const [lpn, sku, qtdRaw] = dados;
    const qtd = qtdRaw.replace('.', '').replace(',', '.');

    let campoLpn = await waitForElement(SELECTOR_CAMPO_LPN_REQ);
    await sendKeys(campoLpn, lpn, 'ENTER');
    await sleep(1000);

    let campoSku = document.activeElement;
    if (!campoSku || campoSku.tagName !== 'INPUT') {
        campoSku = await waitForElement(SELECTOR_INPUT_BARCODE);
    }
    await sendKeys(campoSku, sku, 'TAB');
    await sleep(1000);

    let campoQtd = await waitForElement(SELECTOR_INPUT_NUMBER);
    await sendKeys(campoQtd, qtd, 'ENTER');
    await sleep(1500);

    await simularCtrlE();
    await waitForElement(SELECTOR_CAMPO_LPN_REQ);
    await sleep(1000);
}

async function rotinaCancelamento(dados) {
    const [oblpn, iblpn] = dados;

    let campoOblpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoOblpn, oblpn, 'ENTER');

    let campoSel = await waitForElement(SELECTOR_CAMPO_SELECAO);
    await sendKeys(campoSel, "1", 'ENTER');

    let campoIblpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoIblpn, iblpn, 'ENTER');

    let btnOk = await waitForElement(SELECTOR_BTN_OK);
    btnOk.click();
    await sleep(1000);

    let campoPos = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoPos, POSICAO_PADRAO_CANCELAMENTO, 'ENTER');
    await sleep(1500);
}

async function rotinaMovimentar(dados) {
    const [lpn, posicao] = dados;
    let campoLpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoLpn, lpn, 'ENTER');
    await sleep(1500);

    let campoPos = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoPos, posicao, 'ENTER');
    await sleep(2000);
}

async function rotinaRetornoAtivo(dados) {
    const [lpn, local, sku, qtdRaw] = dados;
    const qtd = qtdRaw.replace('.', '').replace(',', '.');

    let campoLpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoLpn, lpn, 'TAB');

    let campoLocal = document.activeElement;
    await sendKeys(campoLocal, local, 'TAB');
    await sleep(1000);

    let campoItem = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoItem, sku, 'TAB');

    let campoQtd = await waitForElement(SELECTOR_INPUT_NUMBER);
    await sendKeys(campoQtd, qtd, 'ENTER');
    await sleep(1000);

    await simularCtrlE();
    await sleep(1500);
}

async function rotinaCargaInicial(dados) {
    const [lpn, sku, qtdRaw, posicao] = dados;
    const qtd = qtdRaw.replace('.', '').replace(',', '.');

    // 1. Inserir LPN (Usa ENTER)
    let campoLpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoLpn, lpn, 'ENTER');
    await sleep(800);

    // 2. Inserir SKU (Usa TAB)
    let campoSku = document.activeElement;
    if (!campoSku || !campoSku.id.includes("barcode-fld")) {
        campoSku = await waitForElement(SELECTOR_INPUT_BARCODE);
    }
    await sendKeys(campoSku, sku, 'TAB');
    await sleep(800);

    // 3. Inserir Quantidade (Usa ENTER)
    let campoQtd = await waitForElement(SELECTOR_INPUT_NUMBER);
    await sendKeys(campoQtd, qtd, 'ENTER');
    await sleep(1200); // Aumentado para garantir processamento

    // 4. Apertar CTRL+E para finalizar/confirmar
    await simularCtrlE();
    await sleep(2000); // Aguarda a transição de tela

    // 5. Inserir Posição (Usa ENTER)
    let campoPosicao = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoPosicao, posicao, 'ENTER');
    await sleep(800);
}

async function rotinaFracionamentoLPN(dados) {
    const [lpn, qtd, lpnNova] = dados;

    // 1. Inserir LPN de Origem (Usa o seletor genérico de barcode)
    let campoLpn = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoLpn, lpn, 'ENTER');
    await sleep(1200);

    // 2. Inserir Quantidade (Usa o seletor genérico de número)
    let campoQtd = await waitForElement(SELECTOR_INPUT_NUMBER);
    await sendKeys(campoQtd, qtd, 'TAB');
    await sleep(1200);

    // 3. Inserir LPN Nova (Geralmente o campo que ganha foco ou o último campo de barcode que aparece)
    let campoLpnNova = document.activeElement;
    // Se o elemento focado não for um input de barcode, tentamos buscar o último disponível na página
    if (!campoLpnNova || !campoLpnNova.id.includes('barcode-fld')) {
        campoLpnNova = await waitForElement("(//input[contains(@id, 'barcode-fld|input')])[last()]");
    }
    await sendKeys(campoLpnNova, lpnNova, 'ENTER');
    await sleep(1500);

    // 4. Confirmar Criação da LPN (Clicar em OK - Seletor dinâmico para o botão de confirmação)
    let btnOk = await waitForElement("//span[contains(@id, 'btn-yesno') and contains(@class, 'oj-button-text') and text()='OK']");
    if (!btnOk) btnOk = await waitForElement(SELECTOR_BTN_OK);
    
    btnOk.click();
    await sleep(1500);

    // 5. Apertar F2 para retornar e reiniciar o ciclo
    await simularF2();
    await sleep(1500);
}

// IPC Handlers
ipcRenderer.on('auto-login', async (event, args) => {
    const { user, pass } = args;
    await login(user, pass);
});

ipcRenderer.on('recover-error', async (event, modo) => {
    if (modo.includes("Recebimento") || modo.includes("Retorno")) {
        await simularCtrlE();
    } else {
        window.location.reload();
    }
});

ipcRenderer.on('run-rotina', async (event, args) => {
    const { modo, dados } = args;
    try {
        if (modo === "Fracionamento") await rotinaFracionamento(dados);
        else if (modo === "Recebimento") await rotinaRecebimento(dados);
        else if (modo === "Cancelamento") await rotinaCancelamento(dados);
        else if (modo === "Movimentar") await rotinaMovimentar(dados);
        else if (modo === "Retorno") await rotinaRetornoAtivo(dados);
        else if (modo === "Carga") await rotinaCargaInicial(dados);
        else if (modo === "FracionamentoLPN") await rotinaFracionamentoLPN(dados);

        ipcRenderer.sendToHost('rotina-result', { success: true });
    } catch (e) {
        ipcRenderer.sendToHost('rotina-result', { success: false, error: e.toString() });
    }
});