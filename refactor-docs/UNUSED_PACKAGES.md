# Unused Packages Analysis

## Confirmed Unused Packages

### 1. `react-window` ❌
- **Status**: Not imported anywhere
- **Size**: ~50KB
- **Action**: Can be removed
- **Note**: Was likely planned for virtualization but never implemented

### 2. `react-window-infinite-loader` ❌
- **Status**: Not imported anywhere
- **Size**: ~10KB
- **Action**: Can be removed
- **Note**: Companion to react-window, also unused

### 3. `@tiptap/extension-document` ❌
- **Status**: Included in StarterKit, not explicitly imported
- **Size**: ~5KB
- **Action**: Can be removed (StarterKit includes it)
- **Note**: StarterKit automatically includes document extension

### 4. `@tiptap/extension-paragraph` ❌
- **Status**: Included in StarterKit, not explicitly imported
- **Size**: ~5KB
- **Action**: Can be removed (StarterKit includes it)
- **Note**: StarterKit automatically includes paragraph extension

### 5. `@tiptap/extension-bold` ❌
- **Status**: Included in StarterKit, not explicitly imported
- **Size**: ~5KB
- **Action**: Can be removed (StarterKit includes it)
- **Note**: StarterKit includes bold by default

### 6. `@tiptap/extension-italic` ❌
- **Status**: Included in StarterKit, not explicitly imported
- **Size**: ~5KB
- **Action**: Can be removed (StarterKit includes it)
- **Note**: StarterKit includes italic by default

### 7. `@tiptap/pm` ⚠️
- **Status**: Peer dependency, not directly imported
- **Size**: ~200KB (but required by TipTap)
- **Action**: **DO NOT REMOVE** - Required by TipTap extensions
- **Note**: This is a peer dependency, removing it will break TipTap

### 8. `@tiptap/extension-text` ⚠️
- **Status**: Included in StarterKit, but found 3 matches
- **Size**: ~5KB
- **Action**: **Verify first** - May be used indirectly
- **Note**: StarterKit includes it, but might be referenced

### 9. `@npmcli/arborist` (devDependency) ❌
- **Status**: Not used in code or scripts
- **Size**: ~500KB
- **Action**: Can be removed
- **Note**: Dev dependency, only affects development

## Summary

### Safe to Remove (Total: ~580KB)
1. `react-window` - ~50KB
2. `react-window-infinite-loader` - ~10KB
3. `@tiptap/extension-document` - ~5KB
4. `@tiptap/extension-paragraph` - ~5KB
5. `@tiptap/extension-bold` - ~5KB
6. `@tiptap/extension-italic` - ~5KB
7. `@npmcli/arborist` - ~500KB (dev only)

**Total savings: ~580KB** (mostly dev dependencies)

### Do NOT Remove
- `@tiptap/pm` - Required peer dependency
- `@tiptap/extension-text` - Verify usage first

## Memory Impact

**Server-side memory savings**: ~0KB (these are client-side packages)
**Bundle size savings**: ~80KB (production bundle)
**Development savings**: ~500KB (dev dependencies)

## Recommendation

Remove the confirmed unused packages to:
- Reduce bundle size
- Clean up dependencies
- Reduce security surface area
- Make package.json easier to maintain

