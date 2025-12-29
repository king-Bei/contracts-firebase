function numberToChineseCurrency(n) {
    if (n === null || n === undefined || n === '') return '';
    const num = parseFloat(n);
    if (isNaN(num)) return '';

    const fraction = ['角', '分'];
    const digit = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
    const unit = [['元', '萬', '億'], ['', '拾', '佰', '仟']];
    const head = n < 0 ? '負' : '';
    let s = '';

    for (let i = 0; i < fraction.length; i++) {
        s += (digit[Math.floor(Math.abs(num) * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '');
    }
    s = s || '整';
    let integerPart = Math.floor(Math.abs(num));

    for (let i = 0; i < unit[0].length && integerPart > 0; i++) {
        let p = '';
        for (let j = 0; j < unit[1].length && integerPart > 0; j++) {
            p = digit[integerPart % 10] + unit[1][j] + p;
            integerPart = Math.floor(integerPart / 10);
        }
        s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
    }
    return head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整');
}

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
        const key = item.key || item.name;
        if (!key) return;

        // 1. Standard replacement
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
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

        if (filled.match(regex)) {
            let finalDisplay = displayValue;
            if (wrapBold && finalDisplay && typeof finalDisplay === 'string' && !finalDisplay.trim().startsWith('<')) {
                finalDisplay = `<strong>${finalDisplay}</strong>`;
            }
            filled = filled.replace(regex, finalDisplay);
        }

        // 2. Automatic modifiers (e.g. {{ price_upper }})
        // Only if value is somewhat numeric
        if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
            const upperKey = `${key}_upper`;
            const upperRegex = new RegExp(`{{\\s*${upperKey}\\s*}}`, 'g');
            if (filled.match(upperRegex)) {
                const upperValue = numberToChineseCurrency(value);
                let finalUpper = upperValue;
                if (wrapBold && finalUpper) {
                    finalUpper = `<strong>${finalUpper}</strong>`;
                }
                filled = filled.replace(upperRegex, finalUpper);
            }
        }
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
        } else if (type === 'image') {
            // For images, we expect data URL (string) if uploaded
            output[key] = typeof incomingValue === 'string' ? incomingValue : '';
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

const renderTemplateForInteractivePreview = (content, variableValues, templateVariables) => {
    let filled = content || '';
    const values = (variableValues || {});
    // valueMap helps lookup values by key
    const valueMap = new Map(Object.entries(values));
    const variables = Array.isArray(templateVariables) ? templateVariables : [];

    variables.forEach(variable => {
        const key = variable.key;
        if (!key) return;

        // Use global regex to replace all occurrences
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        if (!filled.match(regex)) return;

        let replacement = '';
        const currentValue = valueMap.get(key);
        // Handle undefined/null gracefully
        const valStr = (currentValue === undefined || currentValue === null) ? '' : currentValue;

        if (variable.isCustomerFillable) {
            // Logic for customer-fillable fields (interactive preview)
            if (variable.type === 'image') {
                replacement = `<img id="preview_img_${key}" src="${valStr}" alt="預覽圖片" style="max-width: 100%; max-height: 200px; display: ${valStr ? 'inline-block' : 'none'}; border: 1px dashed #ccc;" class="my-2" />`;
            } else {
                // Determine placeholder if empty
                const display = valStr || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
                replacement = `<span id="preview_text_${key}" class="text-decoration-underline text-primary fw-bold">${display}</span>`;
            }
        } else {
            // Logic for pre-filled fields (read-only for customer)
            if (variable.type === 'image') {
                if (valStr && typeof valStr === 'string' && valStr.startsWith('data:image')) {
                    replacement = `<img src="${valStr}" style="max-width: 100%; max-height: 200px;" />`;
                } else {
                    replacement = ''; // Hide broken/empty images
                }
            } else {
                let displayValue = valStr;
                // Handle booleans/checkboxes
                if (variable.type === 'checkbox' || typeof currentValue === 'boolean') {
                    const isChecked = [true, 'true', 'on', 1, '1', 'yes', '已勾選'].includes(currentValue);
                    displayValue = isChecked ? '已勾選' : '未勾選';
                } else if (Array.isArray(currentValue)) {
                    displayValue = currentValue.join(', ');
                }

                replacement = `<strong class="text-decoration-underline">${displayValue || '&nbsp;'}</strong>`;
            }
        }
        filled = filled.replace(regex, replacement);
    });

    return filled;
};

module.exports = {
    renderTemplateWithVariables,
    normalizeVariableValues,
    renderTemplateForInteractivePreview,
};
