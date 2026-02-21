// ==UserScript==
// @name        Claude Usage HUD
// @namespace   http://tampermonkey.net/
// @version     2.4.5
// @description Dynamic usage HUD for Claude.ai with pace tracking for weekly limits
// @author      You
// @match       https://claude.ai/*
// @icon        https://claude.ai/favicon.ico
// @grant       none
// @run-at      document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // Configuration
    // =========================================================================
    const CONFIG = {
        POLL_INTERVAL: 60000,
        TICK_INTERVAL: 30000,
        RETRY_DELAY: 500,
        MAX_RETRIES: 20,
        COOKIE_NAME: 'lastActiveOrg',
        API_PATH: '/api/organizations/{orgId}/usage',
        OVERFLOW_MARGIN: 20, // px of breathing room from header right edge
    };

    // Bar definitions: maps API keys to display labels, in priority order.
    // Priority 1 = always shown first when space is limited.
    const BAR_DEFS = [
        { key: 'five_hour',           label: 'Session',  priority: 1, windowDays: 0 },
        { key: 'seven_day',           label: 'Weekly',   priority: 2, windowDays: 7 },
        { key: 'seven_day_sonnet',    label: 'Sonnet',   priority: 3, windowDays: 7 },
        { key: 'seven_day_opus',      label: 'Opus',     priority: 4, windowDays: 7 },
        { key: 'seven_day_oauth_apps',label: 'OAuth',    priority: 5, windowDays: 7 },
        { key: 'seven_day_cowork',    label: 'Cowork',   priority: 6, windowDays: 7 },
    ];

    // =========================================================================
    // Styles
    // =========================================================================
    const STYLES = `
        .claude-usage-hud {
            display: inline-flex;
            align-items: center;
            gap: 16px;
            padding: 6px 12px;
            user-select: none;
            z-index: 10;
            pointer-events: auto;
            isolation: isolate;
        }

        .claude-usage-hud--header {
            margin-left: 12px;
            flex-shrink: 0;
        }

        .claude-usage-hud--home {
            position: fixed;
            top: 7px;
            left: 12px;
            transition: left 0.2s ease;
        }

        .claude-usage-bar:hover {
            background-color: rgba(0, 0, 0, 0.04);
        }

        .claude-usage-bar svg {
            display: block;
        }

        .claude-usage-bar__label {
            fill: #6b6560;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            font-weight: 500;
        }

        .claude-usage-bar__track {
            fill: #e8e2d9;
        }

        .claude-usage-bar__fill {
            fill: #a8a095;
            transition: width 0.3s ease;
        }

        .claude-usage-bar__pace-tick {
            stroke: #8b857d;
            stroke-width: 1.5;
            stroke-linecap: round;
            opacity: 0.5;
            transition: opacity 0.2s ease;
        }

        .claude-usage-bar:hover .claude-usage-bar__pace-tick {
            opacity: 0.9;
        }

        .claude-usage-bar__pace-tooltip {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            left: 50%;
            transform: translateX(-50%);
            background: #2d2a27;
            color: #e8e2d9;
            padding: 6px 10px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            line-height: 1.5;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .claude-usage-bar {
            padding: 4px 8px;
            border-radius: 6px;
            transition: background-color 0.2s ease;
            position: relative;
        }

        .claude-usage-bar:hover .claude-usage-bar__pace-tooltip:not(:empty) {
            display: block;
        }

        .claude-usage-bar__percent {
            fill: #8b857d;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            font-weight: 500;
        }

        .claude-usage-bar__reset {
            fill: #8b857d;
            opacity: 0.7;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
        }

        .claude-usage-hud__divider {
            width: 1px;
            height: 14px;
            background-color: #e0d9cf;
            flex-shrink: 0;
        }

        .claude-usage-hud__error {
            color: #b35a3a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
        }

        .claude-usage-hud__overflow {
            color: #8b857d;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            font-weight: 500;
            padding: 4px 6px;
            border-radius: 6px;
            cursor: default;
            position: relative;
        }

        .claude-usage-hud__overflow:hover {
            background-color: rgba(0, 0, 0, 0.04);
            color: #6b6560;
        }

        .claude-usage-hud__overflow-tooltip {
            display: none;
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            background: #2d2a27;
            color: #e8e2d9;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            line-height: 1.6;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .claude-usage-hud__overflow:hover .claude-usage-hud__overflow-tooltip {
            display: block;
        }

        /* Hover color states */
        .claude-usage-bar:hover .claude-usage-bar__label,
        .claude-usage-bar:hover .claude-usage-bar__percent,
        .claude-usage-bar:hover .claude-usage-bar__reset {
            fill: currentColor;
        }

        .claude-usage-bar:hover .claude-usage-bar__track {
            stroke: currentColor;
            stroke-width: 1;
        }

        .claude-usage-bar[data-level="low"]:hover {
            color: #22a34a;
        }
        .claude-usage-bar[data-level="low"]:hover .claude-usage-bar__fill {
            fill: #22a34a;
        }

        .claude-usage-bar[data-level="medium"]:hover {
            color: #7cb32e;
        }
        .claude-usage-bar[data-level="medium"]:hover .claude-usage-bar__fill {
            fill: #7cb32e;
        }

        .claude-usage-bar[data-level="elevated"]:hover {
            color: #b8a018;
        }
        .claude-usage-bar[data-level="elevated"]:hover .claude-usage-bar__fill {
            fill: #b8a018;
        }

        .claude-usage-bar[data-level="high"]:hover {
            color: #d4820a;
        }
        .claude-usage-bar[data-level="high"]:hover .claude-usage-bar__fill {
            fill: #d4820a;
        }

        .claude-usage-bar[data-level="critical"]:hover {
            color: #d43a0a;
        }
        .claude-usage-bar[data-level="critical"]:hover .claude-usage-bar__fill {
            fill: #d43a0a;
        }

        /* Sidebar-aware positioning for home screen */
        nav[class*="sidebar"] ~ main .claude-usage-hud--home,
        .claude-usage-hud--home.sidebar-expanded {
            left: 300px;
        }

        .claude-usage-hud--home.sidebar-collapsed {
            left: 62px;
        }
    `;

    // =========================================================================
    // State
    // =========================================================================
    let state = {
        /** @type {Array<{key:string, label:string, usage:number, resetAt:string, priority:number}>} */
        bars: [],
        error: null,
        currentView: null,
        hudElement: null,
        pollTimer: null,
        tickTimer: null,
        observerActive: false,
        dataLoaded: false,
    };

    // =========================================================================
    // Utility Functions
    // =========================================================================
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function formatTimeUntilShort(isoString) {
        if (!isoString) return '';
        const resetTime = new Date(isoString);
        const now = new Date();
        const diffMs = resetTime - now;

        if (diffMs <= 0) return 'now';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            return `${days}d${remHours > 0 ? ` ${remHours}h` : ''}`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    function getUsageLevel(percentage) {
        if (percentage >= 90) return 'critical';
        if (percentage >= 70) return 'high';
        if (percentage >= 50) return 'elevated';
        if (percentage >= 30) return 'medium';
        return 'low';
    }

    function normalizeUtilization(value) {
        if (value == null || typeof value !== 'number' || isNaN(value)) return null;
        if (value > 0 && value < 1) return Math.round(value * 100);
        return Math.max(0, Math.min(100, Math.round(value)));
    }

    /**
     * Calculate pacing info for a weekly bar.
     * Returns null if not applicable (non-weekly, 0% usage, or missing data).
     * @returns {{ idealPace: number, dailyBudget: number, daysLeft: number, ahead: boolean }}
     */
    function calculatePace(bar) {
        if (!bar.windowDays || bar.windowDays <= 0 || bar.usage <= 0 || !bar.resetAt) return null;

        const now = new Date();
        const resetTime = new Date(bar.resetAt);
        const msPerDay = 24 * 60 * 60 * 1000;
        const windowMs = bar.windowDays * msPerDay;
        const windowStart = new Date(resetTime.getTime() - windowMs);

        const elapsed = now - windowStart;
        const daysElapsed = Math.max(0, elapsed / msPerDay);
        const daysLeft = Math.max(0, (resetTime - now) / msPerDay);

        // idealPace: what % you "should" be at if using evenly
        const idealPace = Math.min(100, (daysElapsed / bar.windowDays) * 100);

        // dailyBudget: how much % per day you can still spend
        const dailyBudget = daysLeft > 0 ? (100 - bar.usage) / daysLeft : 0;

        return {
            idealPace: Math.round(idealPace),
            dailyBudget: Math.round(dailyBudget * 10) / 10,
            daysLeft: Math.round(daysLeft * 10) / 10,
            ahead: bar.usage > idealPace,
        };
    }

    function isOnChatPage() {
        return location.pathname.startsWith('/chat/');
    }

    function isChatHeaderReady() {
        const chatTitle = document.querySelector('button[data-testid="chat-title-button"]');
        const titleText = chatTitle?.textContent?.trim();
        const dropdown = document.querySelector('button[data-testid="chat-menu-trigger"]');
        return !!(chatTitle && titleText && titleText.length > 0 && dropdown);
    }

    function getSidebarState() {
        const nav = document.querySelector('nav');
        if (!nav) return 'expanded';
        const width = nav.getBoundingClientRect().width;
        return width < 100 ? 'collapsed' : 'expanded';
    }

    // =========================================================================
    // Network Interceptor
    // =========================================================================
    const _originalFetch = window.fetch.bind(window);

    function setupFetchInterceptor() {
        if (window._claudeHudInterceptorAttached) return;
        window._claudeHudInterceptorAttached = true;

        window.fetch = async function(...args) {
            const [resource] = args;
            const response = await _originalFetch.apply(this, args);

            const url = typeof resource === 'string' ? resource : resource.url;

            if (url && url.includes('/completion') && response.ok && response.body) {
                try {
                    const clone = response.clone();
                    const reader = clone.body.getReader();
                    const readStream = async () => {
                        try {
                            while (true) {
                                const { done } = await reader.read();
                                if (done) {
                                    setTimeout(() => updateUsageData(), 1000);
                                    break;
                                }
                            }
                        } catch (err) { /* ignore stream errors */ }
                    };
                    readStream();
                } catch (err) {
                    console.error('[Claude Usage HUD] Interceptor error:', err);
                }
            }

            return response;
        };
    }

    // =========================================================================
    // API Functions
    // =========================================================================
    async function fetchUsage() {
        const orgId = getCookie(CONFIG.COOKIE_NAME);
        if (!orgId) throw new Error('Organization ID not found');

        const url = CONFIG.API_PATH.replace('{orgId}', orgId);
        const response = await _originalFetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();

        // Dynamically build bars from API response matched against BAR_DEFS
        const bars = [];
        for (const def of BAR_DEFS) {
            const entry = data[def.key];
            if (entry && entry.utilization != null) {
                bars.push({
                    key: def.key,
                    label: def.label,
                    usage: normalizeUtilization(entry.utilization),
                    resetAt: entry.resets_at ?? null,
                    priority: def.priority,
                    windowDays: def.windowDays,
                });
            }
        }

        // Pick up any unknown keys that have utilization (future-proofing)
        for (const [key, entry] of Object.entries(data)) {
            if (entry && typeof entry === 'object' && entry.utilization != null) {
                if (!BAR_DEFS.some(d => d.key === key)) {
                    bars.push({
                        key,
                        label: key.replace(/^seven_day_?/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) || key,
                        usage: normalizeUtilization(entry.utilization),
                        resetAt: entry.resets_at ?? null,
                        priority: 100,
                        windowDays: key.startsWith('seven_day') ? 7 : 0,
                    });
                }
            }
        }

        bars.sort((a, b) => a.priority - b.priority);
        return bars;
    }

    async function updateUsageData() {
        try {
            state.bars = await fetchUsage();
            state.error = null;
            state.dataLoaded = true;
        } catch (err) {
            console.error('[Claude Usage HUD] Failed to fetch usage:', err);
            state.error = err.message;
        }
        renderHUD();
    }

    // =========================================================================
    // Rendering
    // =========================================================================
    function createUsageBarSVG(label) {
        const width = 216;
        const height = 14;
        const y = 11;
        const barY = 4;

        return `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <text x="0" y="${y}" class="claude-usage-bar__label">${label}</text>
                <rect x="50" y="${barY}" width="60" height="6" rx="3" class="claude-usage-bar__track"/>
                <rect x="50" y="${barY}" width="0" height="6" rx="3" class="claude-usage-bar__fill"/>
                <line x1="50" y1="1" x2="50" y2="13" class="claude-usage-bar__pace-tick" style="display:none"/>
                <text x="146" y="${y}" class="claude-usage-bar__percent" text-anchor="end">--%</text>
                <text x="154" y="${y}" class="claude-usage-bar__reset"></text>
            </svg>
        `;
    }

    function createHUDElement() {
        const hud = document.createElement('div');
        hud.className = 'claude-usage-hud';
        return hud;
    }

    function buildBarHTML(bar, index) {
        const divider = index > 0 ? '<div class="claude-usage-hud__divider"></div>' : '';
        return `${divider}<div class="claude-usage-bar" data-type="${bar.key}" data-level="${getUsageLevel(bar.usage)}">
            ${createUsageBarSVG(bar.label)}
            <div class="claude-usage-bar__pace-tooltip"></div>
        </div>`;
    }

    function buildOverflowBadge(hiddenBars) {
        const lines = hiddenBars.map((b, i) => {
            const timeLeft = formatTimeUntilShort(b.resetAt);
            const resetStr = timeLeft ? ` · ↻ ${timeLeft}` : '';
            const pace = calculatePace(b);
            const paceStr = pace ? ` · ≤${pace.idealPace}%` : '';
            const border = i < hiddenBars.length - 1
                ? 'border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px; margin-bottom: 4px;'
                : '';
            return `<div style="${border}">${b.label}: ${b.usage}%${resetStr}${paceStr}</div>`;
        }).join('');

        return `<div class="claude-usage-hud__overflow">+${hiddenBars.length}<div class="claude-usage-hud__overflow-tooltip">${lines}</div></div>`;
    }

    /** Render N bars (plus overflow badge) into the HUD and update their values */
    function renderBarsIntoHud(hud, visibleCount) {
        const visibleBars = state.bars.slice(0, visibleCount);
        const hiddenBars = state.bars.slice(visibleCount);

        let html = '';
        visibleBars.forEach((bar, i) => {
            html += buildBarHTML(bar, i);
        });
        if (hiddenBars.length > 0) {
            html += buildOverflowBadge(hiddenBars);
        }
        hud.innerHTML = html;

        // Update fill widths, dynamic values, and pace indicators
        visibleBars.forEach(bar => {
            const barEl = hud.querySelector(`[data-type="${bar.key}"]`);
            if (!barEl) return;

            const fill = barEl.querySelector('.claude-usage-bar__fill');
            const percent = barEl.querySelector('.claude-usage-bar__percent');
            const reset = barEl.querySelector('.claude-usage-bar__reset');
            const paceTick = barEl.querySelector('.claude-usage-bar__pace-tick');
            const paceTooltip = barEl.querySelector('.claude-usage-bar__pace-tooltip');

            fill.setAttribute('width', (bar.usage / 100) * 60);
            percent.textContent = `${bar.usage}%`;
            barEl.setAttribute('data-level', getUsageLevel(bar.usage));

            const timeLeft = formatTimeUntilShort(bar.resetAt);
            reset.textContent = timeLeft ? `↻ ${timeLeft}` : '';

            // Pace indicator (weekly bars with usage > 0 only)
            const pace = calculatePace(bar);
            if (pace && paceTick && paceTooltip) {
                const tickX = 50 + (pace.idealPace / 100) * 60;
                paceTick.setAttribute('x1', tickX);
                paceTick.setAttribute('x2', tickX);
                paceTick.style.display = '';
                paceTick.style.stroke = pace.ahead ? '#d4820a' : '#8b857d';

                const delta = Math.abs(bar.usage - pace.idealPace);
                const status = pace.ahead
                    ? `⚠ ${delta}% over pace`
                    : `✓ ${delta > 0 ? delta + '% under pace' : 'On pace'}`;
                paceTooltip.innerHTML =
                    `${status}<br>` +
                    `Budget: ~${pace.dailyBudget}%/day remaining<br>` +
                    `On track up to: ${pace.idealPace}%`;
            } else if (paceTick) {
                paceTick.style.display = 'none';
            }
            if (!pace && paceTooltip) {
                paceTooltip.innerHTML = '';
            }
        });
    }

    /**
     * Calculate available width for the HUD without rendering any bars.
     * Clears the HUD (caller will re-render immediately after) and
     * measures the space the title leaves behind.
     */
    function measureAvailableWidth(hud) {
        const parent = hud.parentElement;
        if (!parent) return Infinity;

        // Clear HUD to let the title take its natural width
        hud.innerHTML = '';

        const parentRect = parent.getBoundingClientRect();
        const paddingRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
        const parentContentRight = parentRect.right - paddingRight;
        const hudLeft = hud.getBoundingClientRect().left;

        // Don't restore — caller renders the final bars immediately
        return parentContentRight - hudLeft - CONFIG.OVERFLOW_MARGIN;
    }

    /**
     * Calculate how many bars fit using fixed layout math.
     * Each bar is a fixed-width SVG (216px) + padding (16px) = 232px.
     * Between bars: 16px gap + 1px divider + 16px gap = 33px overhead.
     * HUD has 12px padding on each side.
     */
    function calculateFitCount(available, totalBars) {
        // HUD padding: 12px left + 12px right
        const hudPadding = 24;
        // Bar: 216px SVG + 4px top/bot + 8px left + 8px right padding = 232px
        const barWidth = 232;
        // Between bars: 16px flex gap, then 1px divider, then 16px gap = 33px
        const separatorWidth = 33;
        // Overflow badge approximate width: "+N" text + gap
        const badgeWidth = 50;

        let remaining = available - hudPadding;
        if (remaining <= 0) return 1;

        let count = 0;
        for (let i = 0; i < totalBars; i++) {
            let needed = barWidth;
            if (i > 0) needed += separatorWidth;

            // If this isn't the last bar, account for the overflow badge
            // that would be needed if we stop here
            const wouldHaveHidden = totalBars - (i + 1);
            const badgeSpace = wouldHaveHidden > 0 ? badgeWidth : 0;

            if (remaining >= needed + badgeSpace) {
                remaining -= needed;
                count++;
            } else if (count === 0) {
                // Always show at least one bar
                count = 1;
                break;
            } else {
                break;
            }
        }

        return count;
    }

    function updateHUDContent(hud) {
        if (state.error) {
            hud.innerHTML = '<span class="claude-usage-hud__error">Usage unavailable</span>';
            return;
        }

        if (state.bars.length === 0) {
            hud.innerHTML = '<span class="claude-usage-hud__error">No usage data</span>';
            return;
        }

        if (state.currentView !== 'chat') {
            renderBarsIntoHud(hud, state.bars.length);
            return;
        }

        // Measure available space (no bars rendered = no flicker)
        const available = measureAvailableWidth(hud);
        const fitCount = calculateFitCount(available, state.bars.length);

        // Single render — only the bars that fit
        renderBarsIntoHud(hud, fitCount);
    }

    function renderHUD() {
        if (!state.dataLoaded) return;

        const onChatPage = isOnChatPage();
        const currentView = onChatPage ? 'chat' : 'home';
        const sidebarState = getSidebarState();

        if (state.hudElement && state.currentView !== currentView) {
            state.hudElement.remove();
            state.hudElement = null;
        }

        state.currentView = currentView;

        if (currentView === 'chat') {
            if (!isChatHeaderReady()) {
                waitForChatHeader(() => renderChatHUD());
                return;
            }
            renderChatHUD();
        } else {
            renderHomeHUD(sidebarState);
        }
    }

    function renderChatHUD() {
        const header = document.querySelector('header[data-testid="page-header"]');
        if (!header) return;

        const chatTitle = header.querySelector('button[data-testid="chat-title-button"]');
        if (!chatTitle) return;

        const titleText = chatTitle.textContent?.trim();
        if (!titleText || titleText.length === 0) return;

        const dropdownTrigger = header.querySelector('button[data-testid="chat-menu-trigger"]');
        if (!dropdownTrigger) return;

        let hud = header.querySelector('.claude-usage-hud');

        if (!hud) {
            hud = createHUDElement();
            hud.classList.add('claude-usage-hud--header');

            const hoverContainer = dropdownTrigger.parentElement;
            const wrapperContainer = hoverContainer?.parentElement;

            if (wrapperContainer && wrapperContainer !== header) {
                wrapperContainer.insertAdjacentElement('afterend', hud);
            } else if (hoverContainer && hoverContainer !== header) {
                hoverContainer.insertAdjacentElement('afterend', hud);
            } else {
                header.appendChild(hud);
            }

            state.hudElement = hud;
        }

        updateHUDContent(hud);
    }

    function renderHomeHUD(sidebarState) {
        let hud = document.querySelector('.claude-usage-hud--home');

        if (!hud) {
            hud = createHUDElement();
            hud.classList.add('claude-usage-hud--home');
            document.body.appendChild(hud);
            state.hudElement = hud;
        }

        hud.classList.remove('sidebar-expanded', 'sidebar-collapsed');
        hud.classList.add(`sidebar-${sidebarState}`);

        updateHUDContent(hud);
    }

    // =========================================================================
    // Initialization & Observers
    // =========================================================================
    function injectStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'claude-usage-hud-styles';
        styleEl.textContent = STYLES;
        document.head.appendChild(styleEl);
    }

    function startPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        updateUsageData();
        state.pollTimer = setInterval(updateUsageData, CONFIG.POLL_INTERVAL);

        if (state.tickTimer) clearInterval(state.tickTimer);
        state.tickTimer = setInterval(() => {
            if (state.dataLoaded && state.hudElement && document.contains(state.hudElement)) {
                updateHUDContent(state.hudElement);
            }
        }, CONFIG.TICK_INTERVAL);
    }

    function waitForChatHeader(callback, retries = 0) {
        const chatTitle = document.querySelector('button[data-testid="chat-title-button"]');
        const titleText = chatTitle?.textContent?.trim();
        const dropdownTrigger = document.querySelector('button[data-testid="chat-menu-trigger"]');

        if (chatTitle && titleText && titleText.length > 0 && dropdownTrigger) {
            callback();
            return;
        }

        if (retries < CONFIG.MAX_RETRIES) {
            setTimeout(() => waitForChatHeader(callback, retries + 1), CONFIG.RETRY_DELAY);
        }
    }

    function observePageChanges() {
        if (state.observerActive) return;

        let lastUrl = location.href;
        let renderTimeout = null;

        const observer = new MutationObserver(() => {
            const currentUrl = location.href;

            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                if (renderTimeout) clearTimeout(renderTimeout);

                if (state.hudElement) {
                    state.hudElement.remove();
                    state.hudElement = null;
                }

                if (currentUrl.includes('/chat/')) {
                    waitForChatHeader(() => renderHUD());
                } else {
                    renderTimeout = setTimeout(() => {
                        renderHUD();
                        setTimeout(() => {
                            if (state.currentView === 'home' && state.hudElement) {
                                const sidebarState = getSidebarState();
                                state.hudElement.classList.remove('sidebar-expanded', 'sidebar-collapsed');
                                state.hudElement.classList.add(`sidebar-${sidebarState}`);
                            }
                        }, 350);
                    }, 150);
                }
                return;
            }

            if (state.hudElement && !document.contains(state.hudElement)) {
                state.hudElement = null;
                if (renderTimeout) clearTimeout(renderTimeout);
                renderTimeout = setTimeout(() => {
                    if (state.currentView === 'chat') {
                        waitForChatHeader(() => renderHUD());
                    } else {
                        renderHUD();
                    }
                }, 100);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Sidebar resize → reposition home HUD + re-evaluate overflow
        const nav = document.querySelector('nav');
        if (nav) {
            const resizeObserver = new ResizeObserver(() => {
                if (!state.hudElement || !state.dataLoaded) return;
                if (state.currentView === 'home') {
                    const sidebarState = getSidebarState();
                    state.hudElement.classList.remove('sidebar-expanded', 'sidebar-collapsed');
                    state.hudElement.classList.add(`sidebar-${sidebarState}`);
                }
                updateHUDContent(state.hudElement);
            });
            resizeObserver.observe(nav);
        }

        // Header resize → re-evaluate overflow (artifact panel open/close)
        const attachHeaderObserver = () => {
            const header = document.querySelector('header[data-testid="page-header"]');
            if (header && !header._hudResizeObserver) {
                const ro = new ResizeObserver(() => {
                    if (state.dataLoaded && state.hudElement && state.currentView === 'chat') {
                        updateHUDContent(state.hudElement);
                    }
                });
                ro.observe(header);
                header._hudResizeObserver = true;
            }
        };
        attachHeaderObserver();
        setInterval(attachHeaderObserver, 2000);

        state.observerActive = true;
    }

    function init() {
        if (window._claudeHudInitialized) return;
        window._claudeHudInitialized = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                window._claudeHudInitialized = false;
                init();
            });
            return;
        }

        if (!document.getElementById('claude-usage-hud-styles')) {
            injectStyles();
        }

        setupFetchInterceptor();
        startPolling();
        observePageChanges();

        console.log('[Claude Usage HUD] Initialized v2.4.5');
    }

    init();
})();
