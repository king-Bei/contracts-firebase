const { expect } = require('chai');
const { extractVariables, renderTemplateToHtml } = require('../src/services/templateRenderer');

describe('templateRenderer', () => {
  it('extracts unique placeholders from template body', () => {
    const body = '<p>{{travelerName}} - {{trip.date}} - {{travelerName}}</p>';
    const vars = extractVariables(body);
    expect(vars).to.deep.equal(['travelerName', 'trip.date']);
  });

  it('renders placeholders with highlighted values', async () => {
    const body = '<h1>合約</h1><div>旅客：{{travelerName}}</div><div>行程：{{payload.trip}}</div>';
    const html = await renderTemplateToHtml(body, {
      travelerName: 'Alice',
      payload: { trip: '東京 3 日' }
    });
    expect(html).to.include('<span class="var-value">Alice</span>');
    expect(html).to.include('<span class="var-value">東京 3 日</span>');
    expect(html).to.include('.var-value { font-weight: 700; color: #0b3d91; }');
  });
});
