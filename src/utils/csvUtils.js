function convertToCSV(data) {
    if (!data || data.length === 0) {
        return 'ID,狀態,客戶名稱,簽署日期,建立日期,業務員,合約屬性\n';
    }
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
        headers.map(header => JSON.stringify(row[header], (key, value) => value === null ? '' : value)).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
}

module.exports = {
    convertToCSV,
};
