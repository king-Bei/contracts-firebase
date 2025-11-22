const { expect } = require('chai');

class FakeDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() {
    return this._data;
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs.map(([id, data]) => new FakeDocSnapshot(id, data));
    this.empty = this.docs.length === 0;
  }
}

class FakeDocRef {
  constructor(store, colName, id) {
    this.store = store;
    this.colName = colName;
    this.id = id;
  }
  async set(data, options = {}) {
    const existing = this.store.getDoc(this.colName, this.id) || {};
    const next = options.merge ? { ...existing, ...data } : data;
    this.store.setDoc(this.colName, this.id, next);
  }
  async get() {
    const data = this.store.getDoc(this.colName, this.id);
    return new FakeDocSnapshot(this.id, data);
  }
}

class FakeQuery {
  constructor(store, colName, filters = [], order = null, limitNum = null) {
    this.store = store;
    this.colName = colName;
    this.filters = filters;
    this.order = order;
    this.limitNum = limitNum;
  }
  where(field, op, value) {
    return new FakeQuery(this.store, this.colName, [...this.filters, { field, op, value }], this.order, this.limitNum);
  }
  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.store, this.colName, this.filters, { field, direction }, this.limitNum);
  }
  limit(n) {
    return new FakeQuery(this.store, this.colName, this.filters, this.order, n);
  }
  async get() {
    let entries = Array.from(this.store.dataFor(this.colName).entries());
    for (const f of this.filters) {
      entries = entries.filter(([, data]) => {
        if (f.op === '==') return data[f.field] === f.value;
        if (f.op === '>=') return data[f.field] >= f.value;
        return false;
      });
    }
    if (this.order) {
      const { field, direction } = this.order;
      entries.sort((a, b) => {
        const av = a[1][field];
        const bv = b[1][field];
        return direction === 'desc' ? bv - av : av - bv;
      });
    }
    if (this.limitNum != null) {
      entries = entries.slice(0, this.limitNum);
    }
    return new FakeQuerySnapshot(entries);
  }
}

class FakeCollectionRef {
  constructor(store, colName) {
    this.store = store;
    this.colName = colName;
  }
  doc(id) {
    return new FakeDocRef(this.store, this.colName, id);
  }
  where(field, op, value) {
    return new FakeQuery(this.store, this.colName, [{ field, op, value }]);
  }
  orderBy(field, direction) {
    return new FakeQuery(this.store, this.colName, [], { field, direction });
  }
  limit(n) {
    return new FakeQuery(this.store, this.colName, [], null, n);
  }
}

class FakeFirestore {
  constructor() {
    this.cols = new Map();
  }
  collection(name) {
    return new FakeCollectionRef(this, name);
  }
  dataFor(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Map());
    return this.cols.get(name);
  }
  getDoc(col, id) {
    return this.dataFor(col).get(id);
  }
  setDoc(col, id, data) {
    this.dataFor(col).set(id, data);
  }
  clear() {
    this.cols.clear();
  }
}

function useFakeFirestore(fake) {
  const adminPath = require.resolve('../src/admin');
  require.cache[adminPath] = {
    exports: { admin: {}, db: fake, storage: {} },
  };
}

describe('contracts.store (firebase-first logic)', () => {
  let contractsStore;
  let templatesStore;
  const fakeDb = new FakeFirestore();

  before(() => {
    useFakeFirestore(fakeDb);
    contractsStore = require('../src/services/contracts.store');
    templatesStore = require('../src/services/templates.store');
  });

  beforeEach(() => {
    fakeDb.clear();
  });

  it('creates drafts, sends for signing, and fetches by token', async () => {
    const tpl = await templatesStore.createTemplate({ name: 'standard', body: '<div>Hello</div>' }, 'sales-1');
    const draft = await contractsStore.createDraft({
      type: 'individual',
      travelerName: 'Alice',
      agentName: 'Jollity',
      templateId: tpl.id,
    }, 'sales-1');

    expect(draft.status).to.equal('draft');
    expect(draft.templateId).to.equal(tpl.id);

    const sent = await contractsStore.sendForSign(draft.id);
    expect(sent.status).to.equal('sent');
    expect(sent.signToken).to.be.a('string').and.to.have.length.above(10);

    const byToken = await contractsStore.getByToken(sent.signToken);
    expect(byToken).to.not.be.null;
    expect(byToken.id).to.equal(draft.id);
  });

  it('records consent and completes signing by token', async () => {
    const draft = await contractsStore.createDraft({ type: 'group', travelerName: 'Bob' }, 'sales-2');
    const sent = await contractsStore.sendForSign(draft.id);
    const consented = await contractsStore.recordConsentByToken(sent.signToken, { gdpr: true, marketing: false });

    expect(consented.consent).to.deep.equal({ gdpr: true, marketing: false });

    const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const completed = await contractsStore.completeByToken(sent.signToken, signatureDataUrl);
    expect(completed.status).to.equal('signed');
    expect(completed.signatureDataUrl).to.equal(signatureDataUrl);
    expect(completed.signedAt).to.be.a('number');
  });

  it('auto-extracts template fields from placeholders when creating/updating', async () => {
    const tpl = await templatesStore.createTemplate({ body: '<p>{{travelerName}}</p><p>{{payload.trip}}</p>' }, 'sales-1');
    expect(tpl.fields.map((f) => f.key)).to.deep.equal(['travelerName', 'payload.trip']);

    const updated = await templatesStore.updateTemplate(tpl.id, { body: '<div>{{agentName}}</div>' });
    expect(updated.fields.map((f) => f.key)).to.deep.equal(['agentName']);
  });

  it('lists contracts filtered by owner and recency', async () => {
    const now = Date.now();
    await contractsStore.createDraft({ travelerName: 'Old', createdAt: now - (200 * 24 * 3600 * 1000) }, 'sales-3');
    await contractsStore.createDraft({ travelerName: 'Recent', type: 'flight' }, 'sales-3');
    await contractsStore.createDraft({ travelerName: 'OtherOwner' }, 'sales-4');

    const recent = await contractsStore.listContracts(6, 'sales-3');
    expect(recent.every((c) => c.ownerUid === 'sales-3')).to.be.true;
    expect(recent.some((c) => c.travelerName === 'Recent')).to.be.true;
    expect(recent.some((c) => c.travelerName === 'Old')).to.be.false;
  });
});
