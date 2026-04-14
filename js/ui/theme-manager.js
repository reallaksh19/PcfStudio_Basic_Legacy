/**
 * theme-manager.js — Handles Light/Dark mode switching
 */

class ThemeManager {
  constructor() {
    this.theme = 'light'; // Default to Light
    this.storageKey = 'pcf-theme';
    this.toggleBtn = null;
  }

  init() {
    // 1. Load from storage or default to LIGHT
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      this.theme = saved;
    } else {
      // FORCE DEFAULT LIGHT (User Requirement)
      this.theme = 'light';
    }

    // 2. Apply initial theme
    this.applyTheme();

    // 3. Listen for system changes (optional, but nice)
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (!localStorage.getItem(this.storageKey)) {
          this.theme = e.matches ? 'light' : 'dark';
          this.applyTheme();
        }
      });
    }

    console.info(`[ThemeManager] Initialized with theme: ${this.theme}`);
  }

  /** Apply the current theme to the document root */
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    this.updateToggleButton();
  }

  /** Toggle between light and dark modes */
  toggle() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(this.storageKey, this.theme);
    this.applyTheme();
    console.info(`[ThemeManager] Switched to ${this.theme} mode`);
  }

  /** Connect a UI button to the manager */
  bindToggleBtn(btnElement) {
    if (!btnElement) return;
    this.toggleBtn = btnElement;

    // Update initial state
    this.updateToggleButton();

    // Bind click
    this.toggleBtn.addEventListener('click', () => this.toggle());
  }

  /** Update button icon/text based on state */
  updateToggleButton() {
    if (!this.toggleBtn) return;

    const isLight = this.theme === 'light';
    // Icon: Sun for Light, Moon for Dark
    // We'll swap the icon inside the button
    // Sun Icon (for Light mode active)
    const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

    // Moon Icon (for Dark mode active)
    const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    // If Light is active, show Moon (to switch to Dark)? Or show Sun (to indicate Light)?
    // Standard is usually "Show what will happen" OR "Show current state".
    // GitHub shows the icon of the *current* theme usually, or a switch.
    // Let's show the icon of the CURRENT theme.

    this.toggleBtn.innerHTML = isLight ? sunIcon : moonIcon;
    this.toggleBtn.title = `Switch to ${isLight ? 'Dark' : 'Light'} Mode`;
  }
}

export const themeManager = new ThemeManager();
