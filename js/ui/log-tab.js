
import { subscribe, getState } from '../state.js';
import { getEntries, clearEntries, setMinLevel } from '../logger.js';

/**
 * log-tab.js — UI Controller for the Log Tab
 * Renders real-time logs, handles filtering, search, and export.
 */

let _logTabInitialized = false;

export function initLogTab() {
    if (_logTabInitialized) return; // Guard against duplicate subscriptions
    _logTabInitialized = true;

    const container = document.getElementById('log-container');
    if (!container) { _logTabInitialized = false; return; }

    // 1. Initial Render (Toolbar + Table Wrapper)
    container.innerHTML = `
    <div class="log-toolbar flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <label class="text-xs text-muted uppercase tracking-wider font-bold">Level:</label>
        <div class="btn-group flex gap-1">
            <button class="btn btn-sm btn-secondary active" data-level="DEBUG">DBG</button>
            <button class="btn btn-sm btn-secondary active" data-level="INFO" style="color:var(--blue-info)">INF</button>
            <button class="btn btn-sm btn-secondary active" data-level="WARN" style="color:var(--yellow-warn)">WRN</button>
            <button class="btn btn-sm btn-secondary active" data-level="ERROR" style="color:var(--red-err)">ERR</button>
        </div>
        <div style="width:1px;height:16px;background:var(--steel);margin:0 0.5rem"></div>
        <input type="text" id="log-search" placeholder="Search logs..." class="config-input" style="width:180px">
        <select id="log-module-filter" class="config-select" style="width:140px">
            <option value="ALL">All Modules</option>
        </select>
        <label class="flex items-center gap-1 text-xs text-muted cursor-pointer select-none">
            <input type="checkbox" id="log-autoscroll" checked> Auto-scroll
        </label>
      </div>
      <div class="flex items-center gap-2">
        <span id="test-status-indicator" class="text-xs" style="display:none;padding:0.25rem 0.5rem;border-radius:var(--radius-sm);font-weight:600;"></span>
        <button id="btn-run-tests" class="btn btn-sm btn-primary">▶ Run Tests</button>
        <button id="btn-run-regression" class="btn btn-sm btn-primary" style="background:var(--purple);border-color:var(--purple)">▶ Regression</button>
        <button id="btn-export-logs" class="btn btn-sm btn-secondary">⬇ Export</button>
        <button id="btn-clear-logs" class="btn btn-sm btn-danger">Clear</button>
      </div>
    </div>
    <div class="log-table-wrap" style="flex:1;overflow-y:auto;border:1px solid var(--steel);border-radius:var(--radius-sm);background:var(--bg-0)">
        <table class="log-table w-full">
            <thead style="position:sticky;top:0;background:var(--bg-1);z-index:10">
                <tr>
                    <th style="width:80px">Time</th>
                    <th style="width:50px">Lvl</th>
                    <th style="width:140px">Module::Fn</th>
                    <th>Message</th>
                    <th style="width:40px">Data</th>
                </tr>
            </thead>
            <tbody id="log-body"></tbody>
        </table>
    </div>
    <div class="flex items-center justify-between mt-1 px-1">
        <span class="text-xs text-muted" id="log-status">Ready.</span>
    </div>
  `;

    // 2. State & Event Binding
    let isAutoScroll = true;
    const state = {
        levels: new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']),
        search: '',
        module: 'ALL'
    };

    const tbody = document.getElementById('log-body');
    const scrollWrap = container.querySelector('.log-table-wrap');

    // Filter Handlers
    container.querySelectorAll('[data-level]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const level = e.target.dataset.level;
            if (state.levels.has(level)) {
                state.levels.delete(level);
                e.target.classList.remove('active');
                e.target.style.opacity = '0.5';
            } else {
                state.levels.add(level);
                e.target.classList.add('active');
                e.target.style.opacity = '1';
            }
            fullRedraw();
        });
    });

    document.getElementById('log-search').addEventListener('input', (e) => {
        state.search = e.target.value.toLowerCase();
        fullRedraw();
    });

    document.getElementById('log-module-filter').addEventListener('change', (e) => {
        state.module = e.target.value;
        fullRedraw();
    });

    document.getElementById('log-autoscroll').addEventListener('change', (e) => {
        isAutoScroll = e.target.checked;
    });

    document.getElementById('btn-clear-logs').addEventListener('click', () => {
        clearEntries();
        // Also clear from state (hacky but needed since logs are duplicated in state.js)
        // Ideally we'd call a state action, but for now just clear local UI
        // A full clear requires resetState() or action on state.js
        fullRedraw();
    });

    document.getElementById('btn-export-logs').addEventListener('click', exportLogs);

    // Test status indicator helper
    const setTestStatus = (status, message) => {
        const indicator = document.getElementById('test-status-indicator');
        if (!indicator) return;

        const styles = {
            running: { bg: 'var(--amber)', color: 'var(--bg-0)', text: '⏳ Running...' },
            pass: { bg: 'var(--green-ok)', color: 'var(--bg-0)', text: '✓ ' + message },
            fail: { bg: 'var(--red-err)', color: 'var(--bg-0)', text: '✗ ' + message },
            hidden: { display: 'none' }
        };

        const style = styles[status] || styles.hidden;

        if (status === 'hidden') {
            indicator.style.display = 'none';
            return;
        }

        indicator.style.display = 'inline-block';
        indicator.style.background = style.bg;
        indicator.style.color = style.color;
        indicator.textContent = style.text;

        // Auto-hide pass/fail after 5 seconds
        if (status === 'pass' || status === 'fail') {
            setTimeout(() => setTestStatus('hidden'), 5000);
        }
    };

    // Phase B: Test Runner
    document.getElementById('btn-run-tests').addEventListener('click', () => {
        setTestStatus('running', '');
        import('../tests/integration-tests.js').then(mod => {
            return mod.runTests();
        }).then(() => {
            setTestStatus('pass', 'Tests Passed');
        }).catch(err => {
            console.error('Test runner failed', err);
            setTestStatus('fail', 'Tests Failed');
        });
    });

    // Phase C: Regression Runner
    document.getElementById('btn-run-regression').addEventListener('click', () => {
        setTestStatus('running', '');
        import('../tests/regression-tests.js').then(mod => {
            return mod.runRegression();
        }).then(() => {
            setTestStatus('pass', 'Regression Passed');
        }).catch(err => {
            console.error('Regression runner failed', err);
            setTestStatus('fail', 'Regression Failed');
        });
    });

    // 3. Render Logic
    let _lastRenderedCount = 0; // Tracks how many entries we've already rendered

    /** Build a single log row (or row + detail row) as DOM elements. */
    const buildRow = (entry) => {
        const tr = document.createElement('tr');
        if (entry.data?.isGate) tr.classList.add('log-gate');

        const date = new Date(entry.timestamp);
        const ts = date.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');

        const hasData = entry.data && Object.keys(entry.data).length > 0;
        const dataBtn = hasData
            ? `<button class="log-data-toggle" style="background:none;border:none;color:var(--amber);cursor:pointer">➜</button>`
            : '';

        tr.innerHTML = `
            <td class="text-xs text-muted font-mono" style="white-space:nowrap">${ts}</td>
            <td><span class="log-level-badge ${entry.level.toLowerCase()}">${entry.level}</span></td>
            <td class="text-xs font-mono" style="color:var(--text-secondary)" title="${entry.module}::${entry.fn}">
                ${entry.module}<span style="color:var(--steel-light)">::</span>${entry.fn}
            </td>
            <td class="text-sm" style="color:var(--text-primary)">${esc(entry.message)}</td>
            <td style="text-align:center">${dataBtn}</td>
        `;

        if (hasData) {
            const trData = document.createElement('tr');
            trData.style.display = 'none';
            trData.innerHTML = `
                <td colspan="5" style="padding:0;background:var(--bg-0)">
                    <pre style="font-size:0.7rem;padding:0.5rem;overflow-x:auto;color:var(--text-code);margin:0">
${JSON.stringify(entry.data, null, 2)}
                    </pre>
                </td>
            `;
            tr.querySelector('.log-data-toggle').addEventListener('click', (e) => {
                const isHidden = trData.style.display === 'none';
                trData.style.display = isHidden ? '' : 'none';
                e.target.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
                e.target.style.transition = 'transform 0.15s ease';
            });
            return [tr, trData];
        }
        return [tr];
    };

    /** Check if entry passes current filters. */
    const matchesFilter = (entry) => {
        if (!state.levels.has(entry.level)) return false;
        if (state.module !== 'ALL' && entry.module !== state.module) return false;
        if (state.search) {
            const text = `${entry.message} ${JSON.stringify(entry.data)}`.toLowerCase();
            if (!text.includes(state.search)) return false;
        }
        return true;
    };

    /** Full redraw — used when filters change or logs are cleared. */
    const fullRedraw = () => {
        const allEntries = getEntries();
        tbody.innerHTML = '';
        _lastRenderedCount = 0;

        // Update Module Filter Options
        const modules = new Set(allEntries.map(e => e.module));
        const modSelect = document.getElementById('log-module-filter');
        if (modSelect.options.length - 1 !== modules.size) {
            modSelect.innerHTML = '<option value="ALL">All Modules</option>';
            [...modules].sort().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modSelect.appendChild(opt);
            });
            modSelect.value = state.module;
            if (modSelect.value !== state.module) state.module = 'ALL';
        }

        const frag = document.createDocumentFragment();
        let visibleCount = 0;

        allEntries.forEach(entry => {
            if (!matchesFilter(entry)) return;
            buildRow(entry).forEach(el => frag.appendChild(el));
            visibleCount++;
        });

        tbody.appendChild(frag);
        _lastRenderedCount = allEntries.length;

        document.getElementById('log-status').textContent = `Showing ${visibleCount} / ${allEntries.length} entries`;
        if (isAutoScroll) scrollWrap.scrollTop = scrollWrap.scrollHeight;
    };

    /** Incremental append — only renders NEW entries since last render. */
    const appendNew = () => {
        const allEntries = getEntries();
        if (allEntries.length <= _lastRenderedCount) return; // Nothing new

        // Update module filter if new modules appeared
        const modules = new Set(allEntries.map(e => e.module));
        const modSelect = document.getElementById('log-module-filter');
        if (modSelect.options.length - 1 !== modules.size) {
            const prev = modSelect.value;
            modSelect.innerHTML = '<option value="ALL">All Modules</option>';
            [...modules].sort().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modSelect.appendChild(opt);
            });
            modSelect.value = prev;
        }

        const frag = document.createDocumentFragment();
        let newVisible = 0;

        for (let i = _lastRenderedCount; i < allEntries.length; i++) {
            const entry = allEntries[i];
            if (!matchesFilter(entry)) continue;
            buildRow(entry).forEach(el => frag.appendChild(el));
            newVisible++;
        }

        if (newVisible > 0) tbody.appendChild(frag);
        _lastRenderedCount = allEntries.length;

        // Update status
        const totalVisible = tbody.querySelectorAll('tr:not([style*="display: none"])').length;
        document.getElementById('log-status').textContent = `Showing ${totalVisible} / ${allEntries.length} entries`;
        if (isAutoScroll) scrollWrap.scrollTop = scrollWrap.scrollHeight;
    };

    // Subscribe to log changes — incremental by default
    subscribe('logs', () => {
        requestAnimationFrame(appendNew);
    });

    // Also initial render
    fullRedraw();
}

function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function exportLogs() {
    const entries = getEntries();
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pcf-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
