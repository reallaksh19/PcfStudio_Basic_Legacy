import re

file_path = 'js/ray-concept/rc-tab.js'

with open(file_path, 'r') as f:
    content = f.read()

# Add import
if 'compactDroppedInlineComponentsForIsoPcf' not in content:
    content = re.sub(
        r'(import \{ convertAvevaXmlToRawCsv \} from \'\./rc-xml-import\.js\';)',
        r'\1\nimport { compactDroppedInlineComponentsForIsoPcf } from \'./rc-inline-drop-compactor.js\';',
        content
    )

# Replace old gasket filtering / buildIsopcfRows entirely
content = re.sub(
    r'/\*\*\n \* Build ISOPCF CSV rows by dropping GASK/INST/PCOM/MISC.*?\n\s*\}\n\s*\}\n\s*return rows\.filter\(c => \!drop\.has\(c\.type\)\);\n\}\n',
    '',
    content,
    flags=re.DOTALL
)

# In S4, we generate the pcf input components.
# Find `const baseComponents = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;`
content = re.sub(
    r'(  const baseComponents = rcState\.finalComponents\.length \? rcState\.finalComponents : rcState\.components;\n)',
    r'''\1  const compactedSource = compactDroppedInlineComponentsForIsoPcf(baseComponents, { dropTypes: ['GASKET'] });
  const pcfInputComponents = compactedSource.components && compactedSource.components.length
    ? compactedSource.components
    : baseComponents;\n''',
    content
)

# Usage 1 in runS4 (build ISOPCF CSV)
content = re.sub(
    r'rcState\.isoPcfComponents = buildIsopcfRows\(baseComponents, cfg4\);',
    r'''const compacted = compactDroppedInlineComponentsForIsoPcf(baseComponents, { dropTypes: ['GASKET'] });
    rcState.isoPcfComponents = compacted.components;
    rcState.isoPcfDropLog = compacted.dropLog || [];
    if (rcState.isoPcfDropLog.length) {
      const compactedCount = rcState.isoPcfDropLog
        .filter(x => x.status === 'compacted')
        .reduce((sum, x) => sum + (x.droppedCount || 0), 0);
      passLog(root, `🔧 ISOPCF geometry compacted: suppressed ${compactedCount} GASKET row(s), adjusted adjacent EP2/EP1 continuity.`, 'info');
    }''',
    content
)

# Usage 2 in S4 execution inside updateMastersData
content = re.sub(
    r'rcState\.isoPcfComponents = buildIsopcfRows\(targets, cfg4\);',
    r'''const compactedTarget = compactDroppedInlineComponentsForIsoPcf(targets, { dropTypes: ['GASKET'] });
    rcState.isoPcfComponents = compactedTarget.components;
    rcState.isoPcfDropLog = compactedTarget.dropLog || [];
    if (rcState.isoPcfDropLog.length) {
      const compactedCount = rcState.isoPcfDropLog
        .filter(x => x.status === 'compacted')
        .reduce((sum, x) => sum + (x.droppedCount || 0), 0);
      passLog(root, `🔧 ISOPCF geometry compacted: suppressed ${compactedCount} GASKET row(s), adjusted adjacent EP2/EP1 continuity.`, 'info');
    }''',
    content
)

# Usage 3 in _syncIsoFromLatestComponents
content = re.sub(
    r'rcState\.isoPcfComponents = buildIsopcfRows\(base, getConfig\(\)\);',
    r'''const compactedSync = compactDroppedInlineComponentsForIsoPcf(base, { dropTypes: ['GASKET'] });
  rcState.isoPcfComponents = compactedSync.components;
  rcState.isoPcfDropLog = compactedSync.dropLog || [];''',
    content
)

# Update runStage4 usages
content = re.sub(
    r'(      const withCa = )baseComponents(\.map\(c => \(\{)',
    r'\1pcfInputComponents\2',
    content
)

content = re.sub(
    r'(\(\{ pcfText \} = runStage4\(\n\s*)baseComponents(, rcState\.injectedPipes, rcState\.pipelineRef, debugLog\n\s*\)\);)',
    r'\1pcfInputComponents\2',
    content
)

content = re.sub(
    r'(      const \{ components: scaledComps \} = await maybeScaleCoords\(\n\s*\[\.\.\.)baseComponents(, \.\.\.markedBridges\],\n\s*null  // auto-scale without popup\n\s*\);)',
    r'\1pcfInputComponents\2',
    content
)


with open(file_path, 'w') as f:
    f.write(content)
