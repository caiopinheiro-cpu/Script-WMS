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
    await sleep(100);

    if (action === 'ENTER') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    } else if (action === 'TAB') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
    }
    await sleep(800);
}

async function simularCtrlE() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }));
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
    await sleep(800);

    // 4. Apertar CTRL+E
    await simularCtrlE();
    await sleep(1500);

    // 5. Inserir Posição (Usa ENTER)
    let campoPosicao = await waitForElement(SELECTOR_INPUT_BARCODE);
    await sendKeys(campoPosicao, posicao, 'ENTER');
    await sleep(800);
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

        ipcRenderer.sendToHost('rotina-result', { success: true });
    } catch (e) {
        ipcRenderer.sendToHost('rotina-result', { success: false, error: e.toString() });
    }
});