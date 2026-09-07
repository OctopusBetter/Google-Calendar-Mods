// ==UserScript==
// @name         Google Calendar DOM & UI Scanner
// @namespace    https://github.com/OctopusBetter/Google-Calendar-Mods
// @version      1.0.1
// @description  Scans Google Calendar structure, builds an element map, and downloads DOM + JSON map for analysis.
// @author       OctopusBetter
// @match        https://calendar.google.com/calendar/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function addScanButton() {
        if (document.getElementById('gcal-scanner-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'gcal-scanner-btn';
        btn.innerText = '🔍 Сканировать Календарь';
        btn.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            padding: 12px 20px;
            background: #1a73e8;
            color: #ffffff;
            font-family: 'Google Sans', Roboto, Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            border: none;
            border-radius: 28px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        btn.onmouseenter = () => btn.style.background = '#1557b0';
        btn.onmouseleave = () => btn.style.background = '#1a73e8';

        btn.onclick = () => runFullScan();
        document.body.appendChild(btn);
    }

    function downloadFile(content, fileName, contentType) {
        const a = document.createElement('a');
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    function runFullScan() {
        const btn = document.getElementById('gcal-scanner-btn');
        if (btn) btn.innerText = '⏳ Сканирование...';

        try {
            // 1. Сбор интерактивных элементов интерфейса
            const interactiveElements = [];
            const queriedNodes = document.querySelectorAll(
                'header, main, aside, nav, [role], button, input, [data-key], [data-view-heading], [aria-label]'
            );

            queriedNodes.forEach(el => {
                if (el.id === 'gcal-scanner-btn') return;
                const rect = el.getBoundingClientRect();
                
                // Фильтруем скрытые/нулевые элементы
                if (rect.width === 0 && rect.height === 0) return;

                interactiveElements.push({
                    tagName: el.tagName.toLowerCase(),
                    id: el.id || null,
                    role: el.getAttribute('role') || null,
                    ariaLabel: el.getAttribute('aria-label') || null,
                    dataAttributes: Object.fromEntries(
                        Array.from(el.attributes)
                            .filter(attr => attr.name.startsWith('data-'))
                            .map(attr => [attr.name, attr.value])
                    ),
                    classes: Array.from(el.classList).slice(0, 5),
                    textSnippet: (el.innerText || '').trim().substring(0, 50) || null,
                    dimensions: {
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                });
            });

            // 2. Сбор доступных глобальных объектов Google
            const globalDataKeys = Object.keys(window).filter(k => 
                k.startsWith('WIZ_') || k.startsWith('_') || k.includes('google') || k.includes('gcal')
            );

            const scanResult = {
                scannedAt: new Date().toISOString(),
                url: window.location.href,
                title: document.title,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                elementsCount: interactiveElements.length,
                globalKeysDetected: globalDataKeys,
                elements: interactiveElements
            };

            // Скачиваем JSON карту элементов
            downloadFile(JSON.stringify(scanResult, null, 2), 'calendar_map.json', 'application/json');

            // Скачиваем полный HTML снимок DOM
            const domClone = document.documentElement.cloneNode(true);
            const scanBtnClone = domClone.querySelector('#gcal-scanner-btn');
            if (scanBtnClone) scanBtnClone.remove();

            downloadFile(domClone.outerHTML, 'calendar_dom.html', 'text/html');

            if (btn) {
                btn.innerText = '✅ Готово! Файлы скачаны';
                btn.style.background = '#1e8e3e';
                setTimeout(() => {
                    btn.innerText = '🔍 Сканировать повторно';
                    btn.style.background = '#1a73e8';
                }, 4000);
            }
        } catch (err) {
            console.error('Scan error:', err);
            alert('Ошибка сканирования: ' + err.message);
            if (btn) btn.innerText = '❌ Ошибка';
        }
    }

    // Инициализация кнопки
    const timer = setInterval(() => {
        if (document.body) {
            addScanButton();
            clearInterval(timer);
        }
    }, 500);

    // Экспорт в глобальную область на случай ручного вызова из консоли
    window.__scanGoogleCalendar = runFullScan;
})();
