"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const STRINGS = {
    openInNewTab: (type) => `Open ${type} in new tab`,
    openInNewWindow: (type) => `Open ${type} in new window`,
    copyAddress: (type) => `Copy ${type} address`,
    undo: 'Undo',
    cut: 'Cut',
    copy: 'Copy',
    delete: 'Delete',
    paste: 'Paste',
    selectAll: 'Select All',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    inspect: 'Inspect',
};
const buildChromeContextMenu = ({ params, webContents, openLink, extensionMenuItems, strings = STRINGS, }) => {
    const menu = new electron_1.Menu();
    if (params.linkURL) {
        menu.append(new electron_1.MenuItem({
            label: strings.openInNewTab('link'),
            click: () => {
                openLink(params.linkURL, 'default', params);
            },
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.openInNewWindow('link'),
            click: () => {
                openLink(params.linkURL, 'new-window', params);
            },
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
        menu.append(new electron_1.MenuItem({
            label: strings.copyAddress('link'),
            click: () => {
                electron_1.clipboard.writeText(params.linkURL);
            },
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
    }
    else if (params.mediaType !== 'none') {
        // TODO: Loop, Show controls
        menu.append(new electron_1.MenuItem({
            label: strings.openInNewTab(params.mediaType),
            click: () => {
                openLink(params.srcURL, 'default', params);
            },
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.copyAddress(params.mediaType),
            click: () => {
                electron_1.clipboard.writeText(params.srcURL);
            },
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
    }
    if (params.isEditable) {
        menu.append(new electron_1.MenuItem({
            label: strings.undo,
            enabled: params.editFlags.canUndo,
            click: () => webContents.undo(),
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
        menu.append(new electron_1.MenuItem({
            label: strings.cut,
            enabled: params.editFlags.canCut,
            click: () => webContents.cut(),
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.copy,
            enabled: params.editFlags.canCopy,
            click: () => webContents.copy(),
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.paste,
            enabled: params.editFlags.canPaste,
            click: () => webContents.paste(),
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.delete,
            enabled: params.editFlags.canDelete,
            click: () => webContents.delete(),
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
        if (params.editFlags.canSelectAll) {
            menu.append(new electron_1.MenuItem({
                label: strings.selectAll,
                click: () => webContents.selectAll(),
            }));
            menu.append(new electron_1.MenuItem({ type: 'separator' }));
        }
    }
    else if (params.selectionText) {
        menu.append(new electron_1.MenuItem({
            label: strings.copy,
            click: () => {
                electron_1.clipboard.writeText(params.selectionText);
            },
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
    }
    if (menu.items.length === 0) {
        menu.append(new electron_1.MenuItem({
            label: strings.back,
            enabled: webContents.canGoBack(),
            click: () => webContents.goBack(),
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.forward,
            enabled: webContents.canGoForward(),
            click: () => webContents.goForward(),
        }));
        menu.append(new electron_1.MenuItem({
            label: strings.reload,
            click: () => webContents.reload(),
        }));
        menu.append(new electron_1.MenuItem({ type: 'separator' }));
    }
    if (extensionMenuItems) {
        extensionMenuItems.forEach((item) => menu.append(item));
        if (extensionMenuItems.length > 0)
            menu.append(new electron_1.MenuItem({ type: 'separator' }));
    }
    menu.append(new electron_1.MenuItem({
        label: strings.inspect,
        click: () => webContents.openDevTools(),
    }));
    return menu;
};
module.exports = buildChromeContextMenu;
module.exports.default = buildChromeContextMenu;
