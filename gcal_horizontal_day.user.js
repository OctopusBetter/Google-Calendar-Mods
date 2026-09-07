// ==UserScript==
// @name         Google Calendar Horizontal Day Timeline
// @namespace    https://github.com/OctopusBetter/Google-Calendar-Mods
// @version      1.1.0
// @description  Adds a horizontal 24-hour Day timeline with calendar swimlanes, zoom modes, live time indicator, and Google Material 3 styling.
// @author       OctopusBetter
// @match        https://calendar.google.com/calendar/*
// @updateURL    https://raw.githubusercontent.com/OctopusBetter/Google-Calendar-Mods/main/gcal_horizontal_day.user.js
// @downloadURL  https://raw.githubusercontent.com/OctopusBetter/Google-Calendar-Mods/main/gcal_horizontal_day.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- Trusted Types Policy Fallback (Google CSP) ---
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
      window.trustedTypes.createPolicy('default', {
        createHTML: string => string
      });
    } catch (e) {
      // Policy might already exist or be restricted
    }
  }

  // --- Constants & State ---
  const VIEW_NAME = 'Горизонтальний день';
  const VIEW_ACCELERATOR = 'H';
  const STORAGE_KEY_SCALE = 'gcal_horizontal_scale_mode';
  const STORAGE_KEY_ZOOM = 'gcal_horizontal_zoom_px';

  let isHorizontalActive = false;
  let scaleMode = localStorage.getItem(STORAGE_KEY_SCALE) || 'fit'; // 'fit' | 'scroll'
  let hourWidthPx = parseInt(localStorage.getItem(STORAGE_KEY_ZOOM) || '100', 10);
  let parsedEvents = [];
  let calendarsList = [];
  let updateClockTimer = null;
  let lastNativeViewLabel = 'День';

  // --- Google Material 3 Styles ---
  function injectStyles() {
    if (document.getElementById('gcal-horizontal-styles')) return;

    const style = document.createElement('style');
    style.id = 'gcal-horizontal-styles';
    style.textContent = `
      /* Main Content Container (#YPCqFe is Google Calendar's center view container) */
      #YPCqFe, .lYYbjc {
        position: relative !important;
      }

      /* Viewport Container for Horizontal Mode */
      #gcal-horizontal-container {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        background: #ffffff !important;
        color: #1f1f1f !important;
        font-family: 'Google Sans', 'Google Sans Text', Roboto, Arial, sans-serif !important;
        overflow: hidden !important;
        z-index: 10 !important;
      }

      /* Fallback if mounted on document.body directly */
      #gcal-horizontal-container.gcal-ht-fallback-overlay {
        position: fixed !important;
        top: 56px !important;
        left: 256px !important;
        right: 56px !important;
        bottom: 0 !important;
        width: auto !important;
        height: auto !important;
        z-index: 10 !important;
      }

      /* Control Toolbar */
      .gcal-ht-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        background: #f8fafd;
        border-bottom: 1px solid #e0e2ec;
        user-select: none;
        gap: 12px;
        flex-shrink: 0;
        height: 48px;
        box-sizing: border-box;
      }

      .gcal-ht-toolbar-left, .gcal-ht-toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Segmented Button Group (Material 3) */
      .gcal-m3-segmented-btn-group {
        display: inline-flex;
        background: #e9eef6;
        border-radius: 20px;
        padding: 2px;
      }

      .gcal-m3-segmented-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        background: transparent;
        color: #444746;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 5px 12px;
        border-radius: 18px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
      }

      .gcal-m3-segmented-btn:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #1f1f1f;
      }

      .gcal-m3-segmented-btn.active {
        background: #ffffff;
        color: #0b57d0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }

      /* Standard M3 Pill Button */
      .gcal-m3-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #74777f;
        background: #ffffff;
        color: #0b57d0;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 5px 12px;
        border-radius: 18px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .gcal-m3-pill-btn:hover {
        background: #f0f4f9;
        border-color: #0b57d0;
      }

      /* Zoom Slider */
      .gcal-ht-zoom-slider-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #444746;
        margin-left: 8px;
      }

      .gcal-ht-zoom-slider {
        width: 80px;
        accent-color: #0b57d0;
        cursor: pointer;
      }

      /* Timeline Main Scroll Area */
      .gcal-ht-scroll-area {
        flex: 1;
        overflow-x: auto;
        overflow-y: auto;
        position: relative;
        background: #ffffff;
      }

      .gcal-ht-canvas {
        position: relative;
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }

      /* Time Ruler */
      .gcal-ht-ruler {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        height: 36px;
        background: #ffffff;
        border-bottom: 1px solid #c4c7c5;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .gcal-ht-ruler-lane-header {
        position: sticky;
        left: 0;
        z-index: 60;
        width: 170px;
        min-width: 170px;
        background: #ffffff;
        border-right: 1px solid #e0e2ec;
        padding: 6px 14px;
        font-size: 11px;
        font-weight: 600;
        color: #74777f;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        box-sizing: border-box;
      }

      .gcal-ht-ruler-ticks {
        flex: 1;
        position: relative;
        height: 100%;
      }

      .gcal-ht-ruler-hour {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        padding-left: 6px;
        font-size: 11px;
        font-weight: 500;
        color: #444746;
        border-left: 1px solid #e0e2ec;
        user-select: none;
        pointer-events: none;
        box-sizing: border-box;
      }

      .gcal-ht-ruler-hour.primary {
        border-left: 1px solid #c4c7c5;
        color: #1f1f1f;
        font-weight: 600;
      }

      /* Swimlanes */
      .gcal-ht-lanes {
        display: flex;
        flex-direction: column;
        flex: 1;
        position: relative;
      }

      .gcal-ht-lane-row {
        display: flex;
        min-height: 52px;
        border-bottom: 1px solid #e0e2ec;
        position: relative;
        transition: background 0.15s ease;
      }

      .gcal-ht-lane-row:hover {
        background: #fbfcfe;
      }

      /* Left Lane Header */
      .gcal-ht-lane-meta {
        position: sticky;
        left: 0;
        z-index: 40;
        width: 170px;
        min-width: 170px;
        background: #ffffff;
        border-right: 1px solid #e0e2ec;
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 2px 0 4px rgba(0, 0, 0, 0.02);
        box-sizing: border-box;
      }

      .gcal-ht-lane-badge {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .gcal-ht-lane-title {
        font-size: 13px;
        font-weight: 500;
        color: #1f1f1f;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Track Timeline Column */
      .gcal-ht-lane-track {
        flex: 1;
        position: relative;
        min-height: 52px;
      }

      /* Grid Lines */
      .gcal-ht-grid-lines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
      }

      .gcal-ht-grid-line {
        position: absolute;
        top: 0;
        bottom: 0;
        border-left: 1px dashed #f0f2f5;
        box-sizing: border-box;
      }

      .gcal-ht-grid-line.major {
        border-left: 1px solid #e8eaed;
      }

      /* Event Chips */
      .gcal-ht-chip {
        position: absolute;
        height: 38px;
        border-radius: 8px;
        padding: 3px 8px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        color: #1f1f1f;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        border: 1px solid rgba(0, 0, 0, 0.1);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        z-index: 20;
      }

      .gcal-ht-chip:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.22);
        z-index: 30;
      }

      .gcal-ht-chip-title {
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gcal-ht-chip-time {
        font-size: 10px;
        font-weight: 500;
        opacity: 0.85;
        white-space: nowrap;
        margin-top: 1px;
      }

      /* LIVE TIME RED LINE */
      .gcal-ht-live-line {
        position: absolute !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 2px !important;
        background: #ea4335 !important;
        z-index: 45 !important;
        pointer-events: none !important;
      }

      .gcal-ht-live-badge {
        position: sticky !important;
        top: 4px !important;
        transform: translateX(-50%) !important;
        background: #ea4335 !important;
        color: #ffffff !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        padding: 2px 6px !important;
        border-radius: 10px !important;
        white-space: nowrap !important;
        box-shadow: 0 2px 4px rgba(234, 67, 53, 0.35) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Helpers ---
  function parseTimeToMinutes(str) {
    if (!str) return null;
    const match = str.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function formatMinutesToTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function isColorLight(color) {
    if (!color) return false;
    const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 175;
    }
    return false;
  }

  // --- Extract Events ---
  function extractNativeEvents() {
    const events = [];
    const eventChips = document.querySelectorAll('[data-eventchip]');

    eventChips.forEach(chip => {
      const summaryEl = chip.querySelector('.XuJrye');
      const text = (summaryEl ? summaryEl.textContent : (chip.textContent || chip.getAttribute('aria-label') || '')).trim();
      const eventId = chip.getAttribute('data-eventid') || '';

      let startTime = null;
      let endTime = null;
      let title = '';
      let calendarName = '';

      // 1. Task detection: "завдання: L, Завершено, 6 вересня 2026, 15:00 – 15:30"
      const isTask = text.toLowerCase().startsWith('завдання:') || text.toLowerCase().startsWith('task:') || chip.classList.contains('LLspoc');
      if (isTask) {
        calendarName = 'Завдання';
        const taskMatch = text.match(/завдання:\s*([^,]+)/i) || text.match(/task:\s*([^,]+)/i);
        if (taskMatch) {
          title = taskMatch[1].trim();
        }
        const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[–\-—]\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          startTime = parseTimeToMinutes(timeMatch[1]);
          endTime = parseTimeToMinutes(timeMatch[2]);
        }
      } else {
        // 2. Standard Google Calendar event
        const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[–\-—]\s*(?:[^,\d]*\s*)?(\d{1,2}:\d{2})/);
        if (timeMatch) {
          startTime = parseTimeToMinutes(timeMatch[1]);
          endTime = parseTimeToMinutes(timeMatch[2]);
          if (endTime === 0) endTime = 24 * 60; // 00:00 midnight end
        }

        const parts = text.split(',').map(p => p.trim()).filter(Boolean);
        if (parts[0] && parts[0].includes(':') && (parts[0].includes('–') || parts[0].includes('-'))) {
          title = parts[1] || '';
          calendarName = parts[2] || '';
        } else if (parts.length >= 4) {
          const timeIdx = parts.findIndex(p => p.includes(':') && (p.includes('–') || p.includes('-')));
          if (timeIdx !== -1) {
            title = parts[timeIdx + 1] || '';
            calendarName = parts[timeIdx + 2] || '';
          }
        }
      }

      // Title fallback
      if (!title) {
        const titleSpan = chip.querySelector('.I0UMhf, .KcY3wb, .lhydbb');
        if (titleSpan) title = titleSpan.textContent.trim();
        else title = text.split('\n')[0] || 'Подія';
      }

      // Calendar name fallback: default to user's primary calendar 'Владислав'
      if (!calendarName || calendarName.includes('Немає') || calendarName.includes('2026') || calendarName.length > 25) {
        calendarName = 'Владислав';
      }

      if (startTime === null) {
        startTime = 9 * 60;
        endTime = startTime + 60;
      }
      if (endTime === null || endTime <= startTime) {
        endTime = startTime + 60;
      }

      // Read colors directly from chip style or computed style
      let bgColor = chip.style.backgroundColor;
      let borderColor = chip.style.borderColor;

      if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
        const computed = window.getComputedStyle(chip);
        bgColor = computed.backgroundColor;
        borderColor = computed.borderColor;
      }

      if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
        bgColor = '#0b57d0';
      }

      events.push({
        id: eventId,
        title: title || 'Подія',
        calendarName: calendarName,
        startTime: startTime,
        endTime: endTime,
        duration: Math.max(15, endTime - startTime),
        color: bgColor,
        borderColor: borderColor || bgColor,
        isTask: !!isTask,
        rawChip: chip
      });
    });

    const detectedCalendars = new Set();
    // Prioritize calendars with events
    events.forEach(e => detectedCalendars.add(e.calendarName));

    // Also collect names from left sidebar
    document.querySelectorAll('.snByac, .xxIdIf, [data-calendar-id]').forEach(el => {
      const name = el.textContent.trim();
      if (name && name.length < 25 && !name.includes('Календар') && !name.includes('Створити') && !name.includes('Пошук')) {
        detectedCalendars.add(name);
      }
    });

    if (detectedCalendars.size === 0) {
      detectedCalendars.add('Владислав');
      detectedCalendars.add('WORK');
      detectedCalendars.add('ВАЖНО');
      detectedCalendars.add('Завдання');
      detectedCalendars.add('Карина');
      detectedCalendars.add('Оля');
    }

    const preferredOrder = [
      'Владислав',
      'WORK',
      'ВАЖНО',
      'Завдання',
      'Карина',
      'Оля',
      'Свята України',
      'Семейная группа',
      'Сімейна группа',
      'Сімейна група',
      'Дні народження'
    ];

    calendarsList = Array.from(detectedCalendars).sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    parsedEvents = events;
    return events;
  }

  // --- Dynamic Drawer Position (only for fallback overlay mode) ---
  function updateOverlayPosition() {
    const container = document.getElementById('gcal-horizontal-container');
    if (!container || !isHorizontalActive) return;
    if (!container.classList.contains('gcal-ht-fallback-overlay')) return;

    const leftDrawer = document.querySelector('.QQYuzf') || document.querySelector('.YO50ue');
    if (leftDrawer) {
      const drawerRect = leftDrawer.getBoundingClientRect();
      const leftOffset = drawerRect.width > 50 ? `${Math.round(drawerRect.right)}px` : '0px';
      container.style.left = leftOffset;
    }
  }

  function getMountTarget() {
    return document.getElementById('YPCqFe') ||
           document.querySelector('.lYYbjc') ||
           document.querySelector('div[role="main"]')?.parentElement ||
           document.body;
  }

  function autoScrollToCurrentTime() {
    const scrollArea = document.getElementById('gcal-ht-scroll-area');
    if (!scrollArea) return;

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const pxPerMin = hourWidthPx / 60;
    const targetX = 170 + (currentMins * pxPerMin) - (scrollArea.clientWidth * 0.35);
    scrollArea.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
  }

  // --- Render Timeline DOM ---
  function renderHorizontalTimeline() {
    try {
      const mountTarget = getMountTarget();
      let container = document.getElementById('gcal-horizontal-container');

      if (!container) {
        container = document.createElement('div');
        container.id = 'gcal-horizontal-container';
        mountTarget.appendChild(container);
      } else if (container.parentElement !== mountTarget) {
        mountTarget.appendChild(container);
      }

      // Hide Google's native day grid to eliminate ghosting and native vertical/horizontal lines
      const nativeMain = mountTarget.querySelector('div[role="main"]');
      if (nativeMain) {
        nativeMain.style.display = 'none';
      }

      if (mountTarget === document.body) {
        container.classList.add('gcal-ht-fallback-overlay');
        updateOverlayPosition();
      } else {
        container.classList.remove('gcal-ht-fallback-overlay');
        mountTarget.style.position = 'relative';
      }

      container.style.display = 'flex';

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      // 1. Control Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'gcal-ht-toolbar';

      const leftControls = document.createElement('div');
      leftControls.className = 'gcal-ht-toolbar-left';

      const segmentGroup = document.createElement('div');
      segmentGroup.className = 'gcal-m3-segmented-btn-group';

      const btnFit = document.createElement('button');
      btnFit.className = `gcal-m3-segmented-btn ${scaleMode === 'fit' ? 'active' : ''}`;
      btnFit.textContent = '↔️ По ширині';
      btnFit.onclick = () => {
        scaleMode = 'fit';
        localStorage.setItem(STORAGE_KEY_SCALE, 'fit');
        renderHorizontalTimeline();
      };

      const btnScroll = document.createElement('button');
      btnScroll.className = `gcal-m3-segmented-btn ${scaleMode === 'scroll' ? 'active' : ''}`;
      btnScroll.textContent = '🔍 Скролл';
      btnScroll.onclick = () => {
        scaleMode = 'scroll';
        localStorage.setItem(STORAGE_KEY_SCALE, 'scroll');
        renderHorizontalTimeline();
      };

      segmentGroup.appendChild(btnFit);
      segmentGroup.appendChild(btnScroll);
      leftControls.appendChild(segmentGroup);

      if (scaleMode === 'scroll') {
        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'gcal-ht-zoom-slider-wrap';

        const sliderLabel = document.createElement('span');
        sliderLabel.textContent = 'Зум:';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'gcal-ht-zoom-slider';
        slider.min = '60';
        slider.max = '220';
        slider.step = '10';
        slider.value = String(hourWidthPx);

        const zoomVal = document.createElement('span');
        zoomVal.id = 'gcal-zoom-val';
        zoomVal.textContent = `${hourWidthPx}px`;

        slider.oninput = (e) => {
          hourWidthPx = parseInt(e.target.value, 10);
          localStorage.setItem(STORAGE_KEY_ZOOM, hourWidthPx);
          zoomVal.textContent = `${hourWidthPx}px`;
          applyCanvasWidth();
        };

        sliderWrap.appendChild(sliderLabel);
        sliderWrap.appendChild(slider);
        sliderWrap.appendChild(zoomVal);
        leftControls.appendChild(sliderWrap);
      }

      const rightControls = document.createElement('div');
      rightControls.className = 'gcal-ht-toolbar-right';

      const btnJumpNow = document.createElement('button');
      btnJumpNow.className = 'gcal-m3-pill-btn';
      btnJumpNow.textContent = '🎯 Зараз';
      btnJumpNow.onclick = () => jumpToCurrentTime();
      rightControls.appendChild(btnJumpNow);

      toolbar.appendChild(leftControls);
      toolbar.appendChild(rightControls);
      container.appendChild(toolbar);

      // 2. Scrollable Canvas
      const scrollArea = document.createElement('div');
      scrollArea.className = 'gcal-ht-scroll-area';
      scrollArea.id = 'gcal-ht-scroll-area';

      const canvas = document.createElement('div');
      canvas.className = 'gcal-ht-canvas';
      canvas.id = 'gcal-ht-canvas';

      // 3. Ruler
      const ruler = document.createElement('div');
      ruler.className = 'gcal-ht-ruler';

      const rulerHeader = document.createElement('div');
      rulerHeader.className = 'gcal-ht-ruler-lane-header';
      rulerHeader.textContent = 'Календар';
      ruler.appendChild(rulerHeader);

      const rulerTicks = document.createElement('div');
      rulerTicks.className = 'gcal-ht-ruler-ticks';
      rulerTicks.id = 'gcal-ruler-ticks';

      for (let h = 0; h < 24; h++) {
        const hourDiv = document.createElement('div');
        hourDiv.className = `gcal-ht-ruler-hour ${h % 3 === 0 ? 'primary' : ''}`;
        hourDiv.textContent = `${String(h).padStart(2, '0')}:00`;
        hourDiv.dataset.hour = String(h);
        rulerTicks.appendChild(hourDiv);
      }
      ruler.appendChild(rulerTicks);
      canvas.appendChild(ruler);

      // 4. Swimlanes
      const lanesContainer = document.createElement('div');
      lanesContainer.className = 'gcal-ht-lanes';
      lanesContainer.id = 'gcal-ht-lanes';

      const CALENDAR_COLORS = {
        'Владислав': '#f6bf26',
        'WORK': '#039be5',
        'ВАЖНО': '#d50000',
        'Завдання': '#4285f4',
        'Карина': '#8e24aa',
        'Оля': '#7b1fa2',
        'Свята України': '#0b8043',
        'Семейная группа': '#f4511e',
        'Сімейна группа': '#f4511e',
        'Сімейна група': '#f4511e',
        'Дні народження': '#33b679'
      };

      calendarsList.forEach(calName => {
        const row = document.createElement('div');
        row.className = 'gcal-ht-lane-row';
        row.dataset.calendar = calName;

        const calEvents = parsedEvents.filter(e => e.calendarName.toLowerCase() === calName.toLowerCase());

        // Assign slots for overlapping events
        calEvents.sort((a, b) => a.startTime - b.startTime || b.duration - a.duration);
        const slotEnds = [];
        calEvents.forEach(ev => {
          let placed = false;
          for (let s = 0; s < slotEnds.length; s++) {
            if (slotEnds[s] <= ev.startTime) {
              slotEnds[s] = ev.endTime;
              ev.slotIndex = s;
              placed = true;
              break;
            }
          }
          if (!placed) {
            ev.slotIndex = slotEnds.length;
            slotEnds.push(ev.endTime);
          }
        });
        const totalSlots = Math.max(1, slotEnds.length);

        const meta = document.createElement('div');
        meta.className = 'gcal-ht-lane-meta';

        const dot = document.createElement('div');
        dot.className = 'gcal-ht-lane-badge';
        dot.style.background = (calEvents[0] && calEvents[0].color) || CALENDAR_COLORS[calName] || '#0b57d0';

        const title = document.createElement('div');
        title.className = 'gcal-ht-lane-title';
        title.textContent = calName;
        title.title = calName;

        meta.appendChild(dot);
        meta.appendChild(title);
        row.appendChild(meta);

        const track = document.createElement('div');
        track.className = 'gcal-ht-lane-track';
        track.dataset.calendar = calName;

        if (totalSlots > 1) {
          const rowHeight = totalSlots * 42 + 10;
          row.style.minHeight = `${rowHeight}px`;
          track.style.minHeight = `${rowHeight}px`;
        }

        const grid = document.createElement('div');
        grid.className = 'gcal-ht-grid-lines';
        for (let h = 0; h < 24; h++) {
          const line = document.createElement('div');
          line.className = `gcal-ht-grid-line ${h % 3 === 0 ? 'major' : ''}`;
          line.dataset.hour = String(h);
          grid.appendChild(line);
        }
        track.appendChild(grid);

        calEvents.forEach(ev => {
          const chip = createEventChipElement(ev);
          if (totalSlots > 1) {
            chip.style.top = `${6 + (ev.slotIndex || 0) * 42}px`;
          } else {
            chip.style.top = '6px';
          }
          track.appendChild(chip);
        });

        row.appendChild(track);
        lanesContainer.appendChild(row);
      });

      canvas.appendChild(lanesContainer);

      // 5. Live Red Line
      const liveLine = document.createElement('div');
      liveLine.className = 'gcal-ht-live-line';
      liveLine.id = 'gcal-ht-live-line';

      const liveBadge = document.createElement('div');
      liveBadge.className = 'gcal-ht-live-badge';
      liveBadge.id = 'gcal-ht-live-badge';
      liveLine.appendChild(liveBadge);

      canvas.appendChild(liveLine);

      scrollArea.appendChild(canvas);
      container.appendChild(scrollArea);

      applyCanvasWidth();
      updateLiveClock();

      if (scaleMode === 'scroll') {
        setTimeout(autoScrollToCurrentTime, 60);
      }
    } catch (err) {
      console.error('Render Horizontal Timeline Error:', err);
    }
  }

  // --- Create Event Chip Element ---
  function createEventChipElement(ev) {
    const chip = document.createElement('div');
    chip.className = 'gcal-ht-chip';
    chip.style.backgroundColor = ev.color || '#0b57d0';
    chip.style.borderColor = ev.borderColor || 'rgba(0, 0, 0, 0.12)';
    chip.dataset.eventId = ev.id;
    chip.dataset.startTime = String(ev.startTime);
    chip.dataset.duration = String(ev.duration);

    const isLight = isColorLight(ev.color);
    chip.style.color = isLight ? '#1f1f1f' : '#ffffff';

    const timeStr = `${formatMinutesToTime(ev.startTime)} – ${formatMinutesToTime(ev.endTime)}`;
    chip.title = `${ev.title} (${timeStr})\nКалендар: ${ev.calendarName}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'gcal-ht-chip-title';
    titleEl.textContent = ev.title;

    const timeEl = document.createElement('div');
    timeEl.className = 'gcal-ht-chip-time';
    timeEl.textContent = timeStr;
    timeEl.style.opacity = isLight ? '0.75' : '0.9';

    chip.appendChild(titleEl);
    chip.appendChild(timeEl);

    chip.onclick = (e) => {
      e.stopPropagation();
      if (ev.rawChip && typeof ev.rawChip.click === 'function') {
        ev.rawChip.click();
      }
    };

    return chip;
  }

  // --- Calculate Positions ---
  function applyCanvasWidth() {
    const canvas = document.getElementById('gcal-ht-canvas');
    const rulerTicks = document.getElementById('gcal-ruler-ticks');
    if (!canvas || !rulerTicks) return;

    const totalWidthPx = scaleMode === 'fit' ? '100%' : `${170 + 24 * hourWidthPx}px`;
    canvas.style.width = totalWidthPx;

    const hourNodes = rulerTicks.querySelectorAll('.gcal-ht-ruler-hour');
    hourNodes.forEach(node => {
      const h = parseInt(node.dataset.hour, 10);
      if (scaleMode === 'fit') {
        node.style.left = `${(h / 24) * 100}%`;
        node.style.width = `${(1 / 24) * 100}%`;
      } else {
        node.style.left = `${h * hourWidthPx}px`;
        node.style.width = `${hourWidthPx}px`;
      }
    });

    document.querySelectorAll('.gcal-ht-grid-line').forEach(line => {
      const h = parseInt(line.dataset.hour, 10);
      if (scaleMode === 'fit') {
        line.style.left = `${(h / 24) * 100}%`;
      } else {
        line.style.left = `${h * hourWidthPx}px`;
      }
    });

    document.querySelectorAll('.gcal-ht-chip').forEach(chip => {
      const startMins = parseInt(chip.dataset.startTime, 10);
      const durationMins = parseInt(chip.dataset.duration, 10);

      if (scaleMode === 'fit') {
        chip.style.left = `${(startMins / 1440) * 100}%`;
        chip.style.width = `max(36px, ${(durationMins / 1440) * 100}%)`;
      } else {
        const pxPerMin = hourWidthPx / 60;
        chip.style.left = `${startMins * pxPerMin}px`;
        chip.style.width = `max(36px, ${durationMins * pxPerMin}px)`;
      }
    });

    updateLiveLinePosition();
  }

  // --- Live Clock ---
  function updateLiveClock() {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const badge = document.getElementById('gcal-ht-live-badge');
    if (badge) {
      badge.textContent = `● Зараз ${formatMinutesToTime(currentMins)}`;
    }
    updateLiveLinePosition();
  }

  function updateLiveLinePosition() {
    const liveLine = document.getElementById('gcal-ht-live-line');
    if (!liveLine) return;

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    if (scaleMode === 'fit') {
      liveLine.style.left = `calc(170px + (100% - 170px) * ${currentMins / 1440})`;
    } else {
      const pxPerMin = hourWidthPx / 60;
      liveLine.style.left = `${170 + currentMins * pxPerMin}px`;
    }
  }

  function jumpToCurrentTime() {
    const scrollArea = document.getElementById('gcal-ht-scroll-area');
    const liveLine = document.getElementById('gcal-ht-live-line');
    if (!scrollArea || !liveLine) return;

    if (scaleMode === 'fit') {
      scrollArea.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      const targetX = liveLine.offsetLeft - scrollArea.clientWidth * 0.3;
      scrollArea.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
    }
  }

  // --- Header View Switcher Dropdown Text Synchronization ---
  function findHeaderViewDropdownButton() {
    // 1. Direct jsname or idom class from Google Calendar DOM
    const direct = document.querySelector('button[jsname="jnPWCc"]') ||
                   document.querySelector('button.I2n60c') ||
                   document.querySelector('button[aria-describedby="VjyWCf"]') ||
                   document.querySelector('.Cd9hpd button');
    if (direct) return direct;

    // 2. Button in header whose text starts with known view names
    const viewNames = ['День', 'Тиждень', 'Місяць', 'Рік', 'Розклад', '7 днів', VIEW_NAME, 'Day', 'Week', 'Month', 'Year', 'Schedule', '7 days'];
    const buttons = document.querySelectorAll('header button, #gb button, [role="banner"] button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      for (const name of viewNames) {
        if (text.startsWith(name)) {
          return btn;
        }
      }
    }
    return document.querySelector('header button[aria-haspopup="menu"]') ||
           document.querySelector('header button[aria-expanded]');
  }

  function getHeaderButtonText() {
    const triggerBtn = findHeaderViewDropdownButton();
    if (!triggerBtn) return null;

    const textSpan = triggerBtn.querySelector('[jsname="V67aGc"], .AeBiU-vQzf8d');
    if (textSpan) {
      const txt = textSpan.textContent.trim();
      if (txt && txt !== VIEW_NAME) return txt;
    }

    const walker = document.createTreeWalker(triggerBtn, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (['День', 'Тиждень', 'Місяць', 'Рік', 'Розклад', '7 днів', 'Day', 'Week', 'Month', 'Year', 'Schedule'].includes(val)) {
        return val;
      }
    }
    return null;
  }

  function updateHeaderButtonText(text) {
    const triggerBtn = findHeaderViewDropdownButton();
    if (!triggerBtn) return;

    const textSpan = triggerBtn.querySelector('[jsname="V67aGc"], .AeBiU-vQzf8d');
    if (textSpan) {
      textSpan.textContent = text;
      return;
    }

    const walker = document.createTreeWalker(triggerBtn, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (['День', 'Тиждень', 'Місяць', 'Рік', 'Розклад', '7 днів', VIEW_NAME, 'Day', 'Week', 'Month', 'Year', 'Schedule'].includes(val)) {
        node.nodeValue = text;
        break;
      }
    }
  }

  // --- View State Controller ---
  function activateHorizontalView() {
    try {
      isHorizontalActive = true;
      injectStyles();

      const currentHeader = getHeaderButtonText();
      if (currentHeader) {
        lastNativeViewLabel = currentHeader;
      }
      updateHeaderButtonText(VIEW_NAME);

      extractNativeEvents();
      renderHorizontalTimeline();

      if (!updateClockTimer) {
        updateClockTimer = setInterval(updateLiveClock, 30000);
      }
      console.log('✅ Google Calendar Horizontal: Activated successfully!');
    } catch (e) {
      console.error('Activate Horizontal View Error:', e);
    }
  }

  function deactivateHorizontalView() {
    if (!isHorizontalActive) return;
    isHorizontalActive = false;

    const container = document.getElementById('gcal-horizontal-container');
    if (container) container.style.display = 'none';

    // Restore Google's native main grid
    const mountTarget = getMountTarget();
    const nativeMain = mountTarget ? mountTarget.querySelector('div[role="main"]') : null;
    if (nativeMain) {
      nativeMain.style.display = '';
    }

    if (updateClockTimer) {
      clearInterval(updateClockTimer);
      updateClockTimer = null;
    }

    // Determine target view label from URL or fallback to last known
    let targetLabel = lastNativeViewLabel || 'День';
    const path = window.location.pathname;
    if (path.includes('/week')) targetLabel = 'Тиждень';
    else if (path.includes('/month')) targetLabel = 'Місяць';
    else if (path.includes('/year')) targetLabel = 'Рік';
    else if (path.includes('/agenda')) targetLabel = 'Розклад';
    else if (path.includes('/customday')) targetLabel = '7 днів';
    else if (path.includes('/day')) targetLabel = 'День';

    updateHeaderButtonText(targetLabel);
    console.log('Google Calendar Horizontal: Deactivated, restored to', targetLabel);
  }

  // --- Inject Directly into the Native View Dropdown Menu & Wire Two-Way Switching ---
  function injectIntoViewDropdownMenu() {
    try {
      // Find candidate menu instances (static or hoisted)
      const menus = document.querySelectorAll('ul[jsname="rymPhb"][role="menu"], .Cd9hpd ul[role="menu"], .XyKLOd ul[role="menu"], [data-menu-uid] ul[role="menu"], ul[role="menu"]');

      for (const menu of menus) {
        // Skip menus that don't contain view switching items
        const hasViewItems = menu.querySelector('[data-viewkey="day"], [data-viewkey="week"], [data-viewkey="custom_days"]') ||
                             menu.querySelector('[data-accelerator="D"], [data-accelerator="W"], [data-accelerator="X"]');
        if (!hasViewItems) continue;

        // Wire sibling clicks so selecting any native view automatically deactivates horizontal mode
        const siblingItems = menu.querySelectorAll('[role="menuitem"], li.aqdrmf-rymPhb-ibnC6b');
        siblingItems.forEach(item => {
          if (item.id === 'gcal-ht-menu-item' || item.dataset.gcalHtBound) return;
          item.dataset.gcalHtBound = 'true';
          item.addEventListener('click', () => {
            if (isHorizontalActive) {
              deactivateHorizontalView();
            }
          }, true);
        });

        // Avoid duplicate injection
        if (menu.querySelector('#gcal-ht-menu-item')) continue;

        // Find separator (right after custom_days) or target row
        const separator = menu.querySelector('li.aqdrmf-clz4Ic[role="separator"], li[role="separator"]');
        const customDaysRow = menu.querySelector('li[data-viewkey="custom_days"]');
        const targetRow = customDaysRow || (separator ? separator.previousElementSibling : null) || menu.querySelector('li[data-viewkey="day"]');

        if (!targetRow || !targetRow.parentElement) continue;

        // Clone target row to inherit Google Calendar's exact classes, styles, and ripple effect
        const newItem = targetRow.cloneNode(true);
        newItem.id = 'gcal-ht-menu-item';
        newItem.setAttribute('data-viewkey', 'horizontal_day');
        newItem.setAttribute('data-accelerator', VIEW_ACCELERATOR);
        newItem.removeAttribute('jsaction');
        newItem.removeAttribute('jslog');
        newItem.setAttribute('role', 'menuitem');
        newItem.style.cursor = 'pointer';

        // Update text and accelerator in cloned row
        const labelSpan = newItem.querySelector('[jsname="K4r5Ff"], .aqdrmf-rymPhb-fpDzbe-fmcmS, .wXd1sd, .t4s5jd');
        const shortcutSpan = newItem.querySelector('[jsname="orbTae"], .aqdrmf-rymPhb-JMEf7e');

        if (labelSpan) {
          labelSpan.textContent = VIEW_NAME;
        }
        if (shortcutSpan) {
          shortcutSpan.textContent = VIEW_ACCELERATOR;
        }

        if (!labelSpan) {
          const textNodes = [];
          const walker = document.createTreeWalker(newItem, NodeFilter.SHOW_TEXT);
          let textNode;
          while ((textNode = walker.nextNode())) {
            if (textNode.nodeValue.trim().length > 0) {
              textNodes.push(textNode);
            }
          }
          if (textNodes.length >= 2) {
            textNodes[0].nodeValue = VIEW_NAME;
            textNodes[1].nodeValue = VIEW_ACCELERATOR;
          } else if (textNodes.length === 1) {
            textNodes[0].nodeValue = `${VIEW_NAME}   ${VIEW_ACCELERATOR}`;
          }
        }

        // Attach click handler
        newItem.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Close open dropdown menu
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
          const popup = newItem.closest('.tB5Jxf-xl07Ob-XxIAqe, .O68mGe-xl07Ob, [data-is-hoisted], [role="menu"]');
          if (popup) {
            popup.style.display = 'none';
          }
          const triggerBtn = findHeaderViewDropdownButton();
          if (triggerBtn) {
            triggerBtn.setAttribute('aria-expanded', 'false');
          }

          activateHorizontalView();
        };

        // Insert immediately before separator (or after target row)
        if (separator && separator.parentElement === menu) {
          menu.insertBefore(newItem, separator);
        } else {
          targetRow.parentElement.insertBefore(newItem, targetRow.nextSibling);
        }

        console.log('✅ Google Calendar: "Горизонтальний день" successfully injected into View Menu!');
      }
    } catch (err) {
      console.error('injectIntoViewDropdownMenu error:', err);
    }
  }

  function watchHeaderDropdown() {
    const btn = findHeaderViewDropdownButton();
    if (!btn || btn.dataset.gcalHtWatched) return;
    btn.dataset.gcalHtWatched = 'true';

    btn.addEventListener('click', () => {
      injectIntoViewDropdownMenu();
      setTimeout(injectIntoViewDropdownMenu, 25);
      setTimeout(injectIntoViewDropdownMenu, 75);
      setTimeout(injectIntoViewDropdownMenu, 150);
      setTimeout(injectIntoViewDropdownMenu, 300);
    }, true);
  }

  // --- Observers & Global Listeners ---
  function setupObservers() {
    let lastDocumentTitle = document.title;

    const bodyObserver = new MutationObserver(() => {
      watchHeaderDropdown();
      injectIntoViewDropdownMenu();

      if (isHorizontalActive) {
        updateOverlayPosition();

        // If date changed (<, >, or Today clicked), refresh events
        if (document.title && document.title !== lastDocumentTitle) {
          lastDocumentTitle = document.title;
          setTimeout(() => {
            extractNativeEvents();
            renderHorizontalTimeline();
          }, 300);
        }
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', updateOverlayPosition);

    // Global capture listener:
    // 1. Any click on header triggers injection check as popups render
    // 2. Clicking any native view item or radiogroup button automatically closes horizontal mode
    document.addEventListener('click', (e) => {
      const isHeaderClick = e.target.closest('header, #gb, .gb_Fd, [role="banner"], button');
      if (isHeaderClick) {
        setTimeout(injectIntoViewDropdownMenu, 25);
        setTimeout(injectIntoViewDropdownMenu, 75);
        setTimeout(injectIntoViewDropdownMenu, 150);
      }

      if (!isHorizontalActive) return;
      const clickedItem = e.target.closest('[role="menuitem"], [role="menuitemradio"], [role="radio"], [data-scheduler-view-mode], .uG4DKd > button');
      if (clickedItem && clickedItem.id !== 'gcal-ht-menu-item') {
        deactivateHorizontalView();
      }
    }, true);

    // History / SPA route change hooks
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      handleNavigationChange();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      handleNavigationChange();
      return result;
    };

    window.addEventListener('popstate', handleNavigationChange);

    function handleNavigationChange() {
      if (!isHorizontalActive) return;
      const path = window.location.pathname;
      if (path.includes('/week') || path.includes('/month') || path.includes('/year') || path.includes('/agenda') || path.includes('/customday')) {
        deactivateHorizontalView();
      }
    }

    // Keyboard shortcuts: H (toggle) and native D, W, M, Y, A, X (switch to native view)
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      if ((key === 'h' || e.key === 'р' || e.key === 'Р') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (isHorizontalActive) {
          deactivateHorizontalView();
        } else {
          activateHorizontalView();
        }
      } else if (isHorizontalActive && ['d', 'w', 'm', 'y', 'a', 'x'].includes(key)) {
        deactivateHorizontalView();
      }
    }, true);
  }

  function init() {
    injectStyles();
    watchHeaderDropdown();
    injectIntoViewDropdownMenu();
    setupObservers();
    console.log('🚀 Google Calendar Horizontal Timeline initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
