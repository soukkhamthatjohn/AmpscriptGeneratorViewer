/**
 * AMPscript Subject Line Generator - Core Logic
 */

// Tokenizes text, keeping placeholders and inline AMPscript blocks as atomic tokens
function tokenize(str, customMappings = {}) {
    if (!str) return [];
    
    // Escape custom mapping keys for regex
    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const mappingKeys = Object.keys(customMappings);
    
    let customPattern = '';
    if (mappingKeys.length > 0) {
        // Sort mapping keys descending by length to match longer patterns first
        const sortedKeys = [...mappingKeys].sort((a, b) => b.length - a.length);
        customPattern = sortedKeys.map(k => escapeRegex(k)).join('|') + '|';
    }

    // Insert custom mapping keys as the highest priority matching patterns
    const regexStr = `(${customPattern}%%=.*?=%%|%%[a-zA-Z0-9_]+%%|\\{\\{[a-zA-Z0-9_]+\\}\\}|\\{[a-zA-Z0-9_]+\\}|[a-zA-Z0-9_]+|\\s+|[^\\s\\w])`;
    const regex = new RegExp(regexStr, 'gi');
    return str.match(regex) || [];
}

// Compute Longest Common Subsequence and return grouped diff parts
function computeDiff(dynamicSL, fallbackSL, customMappings = {}) {
    const tokens1 = tokenize(dynamicSL, customMappings);
    const tokens2 = tokenize(fallbackSL, customMappings);

    const dp = Array(tokens1.length + 1).fill(null).map(() => Array(tokens2.length + 1).fill(0));

    for (let i = 1; i <= tokens1.length; i++) {
        for (let j = 1; j <= tokens2.length; j++) {
            if (tokens1[i - 1] === tokens2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    let i = tokens1.length;
    let j = tokens2.length;
    const diffResult = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && tokens1[i - 1] === tokens2[j - 1]) {
            diffResult.unshift({ type: 'equal', value: tokens1[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diffResult.unshift({ type: 'fallback', value: tokens2[j - 1] });
            j--;
        } else {
            diffResult.unshift({ type: 'dynamic', value: tokens1[i - 1] });
            i--;
        }
    }

    // Group adjacent tokens of same type
    const grouped = [];
    let currentGroup = null;

    for (const token of diffResult) {
        if (!currentGroup || currentGroup.type !== token.type) {
            if (currentGroup) grouped.push(currentGroup);
            currentGroup = { type: token.type, value: token.value };
        } else {
            currentGroup.value += token.value;
        }
    }
    if (currentGroup) grouped.push(currentGroup);

    // Combine consecutive non-equal groups (mismatches)
    const combined = [];
    let idx = 0;
    while (idx < grouped.length) {
        if (grouped[idx].type === 'equal') {
            combined.push(grouped[idx]);
            idx++;
        } else {
            let dynamicVal = '';
            let fallbackVal = '';
            while (idx < grouped.length && grouped[idx].type !== 'equal') {
                if (grouped[idx].type === 'dynamic') {
                    dynamicVal += grouped[idx].value;
                } else if (grouped[idx].type === 'fallback') {
                    fallbackVal += grouped[idx].value;
                }
                idx++;
            }
            combined.push({
                type: 'mismatch',
                dynamic: dynamicVal,
                fallback: fallbackVal
            });
        }
    }

    return combined;
}

// Extract variables from text including mapped ones
function extractVariables(text, customMappings = {}) {
    if (!text) return [];
    const vars = new Set();
    const reserved = new Set(['if', 'else', 'endif', 'then', 'var', 'set', 'empty', 'not', 'and', 'or', 'v']);

    // 1. Scan for custom placeholder mappings (case-insensitive)
    Object.entries(customMappings).forEach(([key, varName]) => {
        const escKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const reg = new RegExp(escKey, 'gi');
        if (reg.test(text)) {
            vars.add(varName);
        }
    });

    // 2. %%=v(@VarName)=%%
    const ampVReg = /%%=\s*v\s*\(\s*@([a-zA-Z0-9_]+)\s*\)\s*=%%/gi;
    let match;
    while ((match = ampVReg.exec(text)) !== null) {
        vars.add(match[1]);
    }

    // 3. %%=AttributeValue("VarName")=%%
    const ampAttrReg = /%%=\s*AttributeValue\s*\(\s*["']([a-zA-Z0-9_]+)["']\s*\)\s*=%%/gi;
    while ((match = ampAttrReg.exec(text)) !== null) {
        vars.add(match[1]);
    }

    // 4. %%VarName%%
    const sfmcReg = /%%([a-zA-Z0-9_]+)%%/g;
    while ((match = sfmcReg.exec(text)) !== null) {
        const val = match[1].toLowerCase();
        if (!reserved.has(val)) vars.add(match[1]);
    }

    // 5. {{VarName}} or {VarName}
    const hbarReg = /\{\{([a-zA-Z0-9_]+)\}\}|\{([a-zA-Z0-9_]+)\}/g;
    while ((match = hbarReg.exec(text)) !== null) {
        const name = match[1] || match[2];
        if (name && !reserved.has(name.toLowerCase())) vars.add(name);
    }

    // 6. Plain @VarName
    const plainAmpReg = /@([a-zA-Z0-9_]+)/g;
    while ((match = plainAmpReg.exec(text)) !== null) {
        const val = match[1].toLowerCase();
        if (!reserved.has(val)) vars.add(match[1]);
    }

    return Array.from(vars);
}

// Escape quotes for AMPscript string literals
function escapeAmpscriptString(str) {
    return str.replace(/"/g, '""');
}

// Convert a dynamic string segment into AMPscript inline variable printing
function formatDynamicSegmentInline(segment, vars, customMappings = {}) {
    let formatted = segment;

    // 1. Replace custom mappings first
    Object.entries(customMappings).forEach(([key, varName]) => {
        const escKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const reg = new RegExp(escKey, 'gi');
        formatted = formatted.replace(reg, `%%=v(@${varName})=%%`);
    });

    // 2. Replace standard variable patterns
    for (const v of vars) {
        const sfmcPlaceholder = new RegExp(`%%${v}%%`, 'gi');
        formatted = formatted.replace(sfmcPlaceholder, `%%=v(@${v})=%%`);

        const hbarPlaceholder1 = new RegExp(`{{${v}}}`, 'gi');
        formatted = formatted.replace(hbarPlaceholder1, `%%=v(@${v})=%%`);

        const hbarPlaceholder2 = new RegExp(`{${v}}`, 'gi');
        formatted = formatted.replace(hbarPlaceholder2, `%%=v(@${v})=%%`);

        const rawPlaceholder = new RegExp(`@${v}`, 'gi');
        formatted = formatted.replace(rawPlaceholder, `%%=v(@${v})=%%`);
    }
    return formatted;
}

// Parse segment into arguments for AMPscript Concat function
function parseSegmentToConcatArgs(segment, vars, customMappings = {}) {
    if (!segment) return [];

    const esc = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Combine standard variables and custom mapping keys in the split patterns
    const patterns = [];
    
    // Add custom mappings
    Object.entries(customMappings).forEach(([key]) => {
        patterns.push(esc(key));
    });
    
    // Add standard variables
    vars.forEach(v => {
        patterns.push(`%%${esc(v)}%%|\\{\\{${esc(v)}\\}\\}|\\{${esc(v)}\\}|@${esc(v)}|%%=\\s*v\\s*\\(\\s*@${esc(v)}\\s*\\)\\s*=%%`);
    });

    if (patterns.length === 0) {
        return [`"${escapeAmpscriptString(segment)}"`];
    }
    
    const combinedRegex = new RegExp(`(${patterns.join('|')})`, 'gi');
    const parts = segment.split(combinedRegex);

    const args = [];
    for (const part of parts) {
        if (!part) continue;
        let isVar = false;

        // Check custom mappings first
        for (const [key, varName] of Object.entries(customMappings)) {
            const testRegex = new RegExp(`^${esc(key)}$`, 'i');
            if (testRegex.test(part)) {
                args.push(`@${varName}`);
                isVar = true;
                break;
            }
        }

        if (!isVar) {
            // Check standard variables
            for (const v of vars) {
                const testRegex = new RegExp(`^%%${esc(v)}%%$|^{{${esc(v)}}}$|^{{${esc(v)}}}$|^@${esc(v)}$|^%%=\\s*v\\s*\\(\\s*@${esc(v)}\\s*\\)\\s*=%%$`, 'i');
                if (testRegex.test(part)) {
                    args.push(`@${v}`);
                    isVar = true;
                    break;
                }
            }
        }

        if (!isVar) {
            args.push(`"${escapeAmpscriptString(part)}"`);
        }
    }
    return args;
}

// Main generation function
function generateAmpscript(dynamicSL, fallbackSL, customMappings = {}, primaryVarOverride = null) {
    const diffParts = computeDiff(dynamicSL, fallbackSL, customMappings);

    // 1. Gather all variables
    const allVars = new Set();
    diffParts.forEach(part => {
        if (part.type === 'mismatch') {
            extractVariables(part.dynamic, customMappings).forEach(v => allVars.add(v));
        }
    });
    const variables = Array.from(allVars);

    // 2. Select primary variable
    let primaryVar = primaryVarOverride;
    if (!primaryVar && variables.length > 0) {
        primaryVar = variables[0];
    } else if (!primaryVar) {
        primaryVar = 'HasValue';
    }

    // 3. Build Inline AMPscript
    let inlineResult = '';
    diffParts.forEach(part => {
        if (part.type === 'equal') {
            inlineResult += part.value;
        } else if (part.type === 'mismatch') {
            const segmentVars = extractVariables(part.dynamic, customMappings);
            const checkVar = segmentVars.length > 0 ? segmentVars[0] : primaryVar;

            const formattedDynamic = formatDynamicSegmentInline(part.dynamic, segmentVars, customMappings);
            const formattedFallback = part.fallback;

            inlineResult += `%%[if not Empty(@${checkVar}) then]%%${formattedDynamic}%%[else]%%${formattedFallback}%%[endif]%%`;
        }
    });

    // 4. Build Block AMPscript
    let blockResult = '%%[\n';
    
    // Declarations
    const varDecls = ['@subjectLine', ...variables.map(v => `@${v}`)];
    blockResult += `Var ${varDecls.join(', ')}\n\n`;

    // Retrievals
    variables.forEach(v => {
        blockResult += `Set @${v} = AttributeValue("${v}")\n`;
    });
    if (variables.length > 0) blockResult += '\n';

    // Step-by-step logic
    let isInitialized = false;

    diffParts.forEach((part, index) => {
        if (part.type === 'equal') {
            if (!part.value) return;
            const strVal = `"${escapeAmpscriptString(part.value)}"`;
            if (!isInitialized) {
                blockResult += `Set @subjectLine = ${strVal}\n`;
                isInitialized = true;
            } else {
                blockResult += `Set @subjectLine = Concat(@subjectLine, ${strVal})\n`;
            }
        } else if (part.type === 'mismatch') {
            const segmentVars = extractVariables(part.dynamic, customMappings);
            const checkVar = segmentVars.length > 0 ? segmentVars[0] : primaryVar;

            const dynamicArgs = parseSegmentToConcatArgs(part.dynamic, segmentVars, customMappings);
            const fallbackArgs = part.fallback ? [`"${escapeAmpscriptString(part.fallback)}"`] : [];

            blockResult += `If not Empty(@${checkVar}) then\n`;
            if (dynamicArgs.length > 0) {
                if (!isInitialized) {
                    if (dynamicArgs.length === 1) {
                        blockResult += `  Set @subjectLine = ${dynamicArgs[0]}\n`;
                    } else {
                        blockResult += `  Set @subjectLine = Concat(${dynamicArgs.join(', ')})\n`;
                    }
                } else {
                    blockResult += `  Set @subjectLine = Concat(@subjectLine, ${dynamicArgs.join(', ')})\n`;
                }
            } else {
                if (!isInitialized) {
                    blockResult += `  Set @subjectLine = ""\n`;
                }
            }

            blockResult += `Else\n`;
            if (fallbackArgs.length > 0) {
                if (!isInitialized) {
                    blockResult += `  Set @subjectLine = ${fallbackArgs[0]}\n`;
                } else {
                    blockResult += `  Set @subjectLine = Concat(@subjectLine, ${fallbackArgs[0]})\n`;
                }
            } else {
                if (!isInitialized) {
                    blockResult += `  Set @subjectLine = ""\n`;
                }
            }
            blockResult += `EndIf\n`;
            isInitialized = true;
        }
    });

    blockResult += ']%%\n%%=v(@subjectLine)=%%';

    return {
        inline: inlineResult,
        block: blockResult,
        variables,
        primaryVar,
        diffParts
    };
}

// Simulates compiled subject line based on variable presence/values
function simulateSubjectLine(diffParts, varValues, primaryVar, customMappings = {}) {
    let result = '';
    diffParts.forEach(part => {
        if (part.type === 'equal') {
            result += part.value;
        } else if (part.type === 'mismatch') {
            const segmentVars = extractVariables(part.dynamic, customMappings);
            const checkVar = segmentVars.length > 0 ? segmentVars[0] : primaryVar;
            const val = varValues[checkVar];

            const isEmpty = !val || val.trim() === '';

            if (!isEmpty) {
                let dynamicCompiled = part.dynamic;
                
                // 1. Replace custom mapping placeholders with simulated values first
                Object.entries(customMappings).forEach(([key, varName]) => {
                    const actualValue = varValues[varName] || '';
                    const escKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const reg = new RegExp(escKey, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(reg, actualValue);
                });

                // 2. Replace standard variable patterns
                for (const v of segmentVars) {
                    const actualValue = varValues[v] || '';
                    
                    const sfmcPlaceholder = new RegExp(`%%${v}%%`, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(sfmcPlaceholder, actualValue);

                    const hbarPlaceholder1 = new RegExp(`{{${v}}}`, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(hbarPlaceholder1, actualValue);

                    const hbarPlaceholder2 = new RegExp(`{${v}}`, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(hbarPlaceholder2, actualValue);

                    const rawPlaceholder = new RegExp(`@${v}`, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(rawPlaceholder, actualValue);

                    const inlinePlaceholder = new RegExp(`%%=\\s*v\\s*\\(\\s*@${v}\\s*\\)\\s*=%%`, 'gi');
                    dynamicCompiled = dynamicCompiled.replace(inlinePlaceholder, actualValue);
                }
                result += dynamicCompiled;
            } else {
                result += part.fallback || '';
            }
        }
    });
    return result;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        tokenize,
        computeDiff,
        extractVariables,
        generateAmpscript,
        simulateSubjectLine
    };
} else {
    window.AmpscriptGenerator = {
        tokenize,
        computeDiff,
        extractVariables,
        generateAmpscript,
        simulateSubjectLine
    };
}
