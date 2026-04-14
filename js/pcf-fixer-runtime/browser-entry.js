const MODULE_CACHE = new Map();
const CSS_CACHE = new Set();
let babelPromise = null;
let importMapCache = null;

async function getBabel() {
  if (!babelPromise) {
    babelPromise = import('https://esm.sh/@babel/standalone').then(mod => {
      if (mod?.transform) return mod;
      if (mod?.default?.transform) return mod.default;
      return mod.default || mod;
    });
  }
  return babelPromise;
}

function isLocalSpecifier(spec) {
  return spec.startsWith('.') || spec.startsWith('/');
}

function hasKnownExtension(spec) {
  return /\.(?:js|jsx|mjs|cjs|json|css)(?:[?#].*)?$/i.test(spec);
}

function getImportMap() {
  if (importMapCache) return importMapCache;
  try {
    const node = document.querySelector('script[type="importmap"]');
    const parsed = node ? JSON.parse(node.textContent || '{}') : {};
    importMapCache = parsed.imports || {};
  } catch {
    importMapCache = {};
  }
  return importMapCache;
}

function resolveBareSpecifier(spec) {
  const imports = getImportMap();
  if (imports[spec]) return imports[spec];

  let bestPrefix = '';
  let bestTarget = null;
  for (const [key, target] of Object.entries(imports)) {
    if (!key.endsWith('/')) continue;
    if (!spec.startsWith(key)) continue;
    if (key.length > bestPrefix.length) {
      bestPrefix = key;
      bestTarget = `${target}${spec.slice(key.length)}`;
    }
  }
  return bestTarget || spec;
}

function candidateUrls(spec, baseUrl) {
  if (!isLocalSpecifier(spec)) return [resolveBareSpecifier(spec)];
  const resolved = new URL(spec, baseUrl).href;
  if (hasKnownExtension(resolved)) return [resolved];
  return [...new Set([
    resolved,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.mjs`,
    `${resolved}/index.js`,
    `${resolved}/index.jsx`
  ])];
}

async function replaceAsync(text, regex, replacer) {
  const matches = [...text.matchAll(regex)];
  if (!matches.length) return text;

  let out = '';
  let lastIndex = 0;
  for (const match of matches) {
    out += text.slice(lastIndex, match.index);
    out += await replacer(match);
    lastIndex = match.index + match[0].length;
  }
  out += text.slice(lastIndex);
  return out;
}

async function injectCss(spec, baseUrl) {
  const urls = candidateUrls(spec, baseUrl);
  for (const url of urls) {
    if (CSS_CACHE.has(url)) return;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const css = await response.text();
      const style = document.createElement('style');
      style.dataset.pcfFixerSource = url;
      style.textContent = css;
      document.head.appendChild(style);
      CSS_CACHE.add(url);
      return;
    } catch {
      // Try the next candidate.
    }
  }
}

async function loadModule(spec, baseUrl) {
  if (!isLocalSpecifier(spec)) return spec;
  const urls = candidateUrls(spec, baseUrl);
  let lastErr = null;
  for (const url of urls) {
    try {
      return await buildModule(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Unable to resolve ${spec} from ${baseUrl}`);
}

async function rewriteSource(source, moduleUrl) {
  source = await replaceAsync(
    source,
    /import\s+([\s\S]*?)from\s+(['"])([^'"]+)\2/g,
    async (match) => {
      const spec = match[3];
      if (!isLocalSpecifier(spec)) return match[0];
      if (spec.endsWith('.css')) {
        await injectCss(spec, moduleUrl);
        return '';
      }
      const childUrl = await loadModule(spec, moduleUrl);
      return match[0].replace(spec, childUrl);
    }
  );

  source = await replaceAsync(
    source,
    /import\s+(['"])([^'"]+)\1/g,
    async (match) => {
      const spec = match[2];
      if (!isLocalSpecifier(spec)) {
        const mapped = resolveBareSpecifier(spec);
        return mapped === spec ? match[0] : match[0].replace(spec, mapped);
      }
      if (spec.endsWith('.css')) {
        await injectCss(spec, moduleUrl);
        return '';
      }
      const childUrl = await loadModule(spec, moduleUrl);
      return `import '${childUrl}'`;
    }
  );

  source = await replaceAsync(
    source,
    /export\s+([\s\S]*?)from\s+(['"])([^'"]+)\2/g,
    async (match) => {
      const spec = match[3];
      if (!isLocalSpecifier(spec)) return match[0];
      const childUrl = await loadModule(spec, moduleUrl);
      return match[0].replace(spec, childUrl);
    }
  );

  source = await replaceAsync(
    source,
    /import\(\s*(['"])([^'"]+)\1\s*\)/g,
    async (match) => {
      const spec = match[2];
      if (!isLocalSpecifier(spec)) {
        const mapped = resolveBareSpecifier(spec);
        return mapped === spec ? match[0] : `import('${mapped}')`;
      }
      const childUrl = await loadModule(spec, moduleUrl);
      return `import('${childUrl}')`;
    }
  );

  source = await replaceAsync(
    source,
    /new\s+URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g,
    async (match) => {
      const spec = match[2];
      if (!isLocalSpecifier(spec)) return match[0];
      const childUrl = await loadModule(spec, moduleUrl);
      return `new URL('${childUrl}', import.meta.url)`;
    }
  );

  return source;
}

async function buildModule(moduleUrl) {
  if (MODULE_CACHE.has(moduleUrl)) return MODULE_CACHE.get(moduleUrl);

  const promise = (async () => {
    const response = await fetch(moduleUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${moduleUrl}: ${response.status} ${response.statusText}`);
    }

    let source = await response.text();
    source = await rewriteSource(source, moduleUrl);

    const babel = await getBabel();
    const transformed = babel.transform(source, {
      filename: moduleUrl,
      sourceType: 'module',
      presets: [['react', { runtime: 'classic', throwIfNamespace: false }]]
    }).code;

    return URL.createObjectURL(new Blob([transformed], { type: 'text/javascript' }));
  })();

  MODULE_CACHE.set(moduleUrl, promise);
  const blobUrl = await promise;
  MODULE_CACHE.set(moduleUrl, blobUrl);
  return blobUrl;
}

export async function mountBrowserPcfFixer(container) {
  if (!container) throw new Error('PCF Fixer mount container not found');

  const [reactMod, clientMod] = await Promise.all([
    import(resolveBareSpecifier('react')),
    import(resolveBareSpecifier('react-dom/client'))
  ]);
  const React = reactMod.default || reactMod;
  const createRoot = clientMod.createRoot || clientMod.default?.createRoot || clientMod.default;

  container.innerHTML = `
    <div style="padding:1.5rem;color:var(--text-muted);font-family:var(--font-code);text-align:center">
      Loading PCF Fixer...
    </div>
  `;

  const rootUrl = await buildModule(new URL('/js/pcf-fixer-runtime/App.js', import.meta.url).href);
  const mod = await import(rootUrl);
  const App = mod.default || mod.App || mod;

  if (!container.__pcfFixerRoot) {
    container.__pcfFixerRoot = createRoot(container);
  }
  container.__pcfFixerRoot.render(React.createElement(App));
}
