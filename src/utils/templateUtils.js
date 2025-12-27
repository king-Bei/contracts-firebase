const renderTemplateWithVariables = (content, variableValues, templateVariables, options = {}) => {
    const { wrapBold = false, signatureImage = null, signaturePlaceholder = '簽署欄位' } = options;
    let filled = content || '';

    const values = (typeof variableValues === 'string')
        ? JSON.parse(variableValues || '{}')
        : (variableValues || {});

    const definitions = Array.isArray(templateVariables) ? templateVariables : [];
    const valueMap = new Map(Object.entries(values));

    // If we have definitions, iterate in that order. Otherwise, iterate over the given values.
    const iterable = definitions.length > 0 ? definitions : Array.from(valueMap.keys()).map(key => ({ key }));

    iterable.forEach(item => {
        const key = item.key;
        if (!key) return;

        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        if (!filled.match(regex)) return;

        const value = valueMap.get(key);
        let displayValue;

        if (item.type === 'checkbox') {
            const checked = [true, 'true', 'on', 1, '1', 'yes', '已勾選'].includes(value);
            displayValue = checked ? '已勾選' : '未勾選';
        } else if (item.type === 'image') {
            if (value && typeof value === 'string' && value.startsWith('data:image')) {
                // 限制顯示寬高，避免撐版
                displayValue = `<img src="${value}" style="max-height: 200px; max-width: 100%;" />`;
            } else {
                displayValue = '';
            }
        } else if (value === undefined || value === null) {
            displayValue = '';
        } else if (Array.isArray(value)) {
            displayValue = value.join(', ');
        } else {
            displayValue = String(value);
        }

        if (wrapBold && displayValue && typeof displayValue === 'string' && !displayValue.trim().startsWith('<')) {
            displayValue = `<strong>${displayValue}</strong>`;
        }

        filled = filled.replace(regex, displayValue);
    });

    // Handle signature
    if (signatureImage) {
        const signatureTag = `<div class="mt-2"><img src="${signatureImage}" alt="簽名圖片" style="max-height: 220px;"></div>`;
        const sigRegex = new RegExp(`{{\\s*${signaturePlaceholder}\\s*}}`, 'g');
        if (sigRegex.test(filled)) {
            filled = filled.replace(sigRegex, signatureTag);
        } else {
            filled += `\n\n<div>${signaturePlaceholder}：${signatureTag}</div>`;
        }
    }

    return filled;
};

const normalizeVariableValues = (rawValues, templateVariables = []) => {
    const output = {};
    const incoming = (rawValues && typeof rawValues === 'object') ? rawValues : {};
    const definitions = Array.isArray(templateVariables) ? templateVariables : [];

    definitions.forEach(variable => {
        const key = variable.key || variable.name;
        if (!key) return;
        const type = (variable.type || 'text').toLowerCase();
        const incomingValue = incoming[key];

        if (type === 'checkbox') {
            const normalized = Array.isArray(incomingValue) ? incomingValue : [incomingValue];
            const checked = normalized.some(v => v === true || v === 'true' || v === 'on' || v === 1 || v === '1' || v === 'yes' || v === '已勾選');
            output[key] = Boolean(checked);
        } else {
            output[key] = typeof incomingValue === 'string' ? incomingValue.trim() : (incomingValue ?? '');
        }
    });

    // 保留未在範本定義的其他欄位
    Object.entries(incoming).forEach(([key, value]) => {
        if (!(key in output)) {
            output[key] = value;
        }
    });

    return output;
};

module.exports = {
    renderTemplateWithVariables,
    normalizeVariableValues,
};
