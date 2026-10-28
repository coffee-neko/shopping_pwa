(() => {
  'use strict';

  const STORAGE_KEY = 'offline-shopping-pwa-data-v1';
  const STORE_SEEDS = [
    { id: 'welcia', name: 'ウエルシア', routines: [['牛乳', '乳製品'], ['洗濯洗剤', '日用品'], ['食パン', '日配']] },
    { id: 'belx', name: 'ベルクス', routines: [['たまご', '日配'], ['鶏もも肉', '精肉'], ['バナナ', '野菜']] },
    { id: 'gyomu', name: '業務スーパー', routines: [['冷凍うどん', '冷凍食品'], ['パスタ', 'その他'], ['調味料', '調味料']] },
    { id: 'lopia', name: 'ロピア', routines: [['豚こま肉', '精肉'], ['ヨーグルト', '乳製品'], ['玉ねぎ', '野菜']] }
  ];
  const DEFAULT_CATEGORIES = ['野菜', '精肉', '鮮魚', '乳製品', '日配', '冷凍食品', '調味料', '日用品', 'その他'];
  const $ = id => document.getElementById(id);
  let currentView = 'routine';
  let state = loadState();

  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function newStore(seed) {
    return { id: seed.id, name: seed.name, budget: 0, categoryOrder: [...DEFAULT_CATEGORIES],
      routines: seed.routines.map(([name, category]) => ({ id: uid(), name, category })), items: [], handover: { milk: false, template: false } };
  }
  function defaultState() {
    const stores = {};
    STORE_SEEDS.forEach(seed => { stores[seed.id] = newStore(seed); });
    return { version: 1, activeStoreId: 'welcia', categories: [...DEFAULT_CATEGORIES], welciaTemplate: '', stores };
  }
  function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function cleanText(value, max = 60) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
  function cleanPrice(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : '';
  }
  function cleanEntry(entry, categories) {
    if (!isPlainObject(entry)) return null;
    const name = cleanText(entry.name);
    if (!name) return null;
    return { id: cleanText(entry.id, 100) || uid(), name,
      category: categories.includes(entry.category) ? entry.category : categories[categories.length - 1],
      price: cleanPrice(entry.price), purchased: entry.purchased === true,
      sourceRoutineId: cleanText(entry.sourceRoutineId, 100) || null };
  }
  function normalize(candidate) {
    if (!isPlainObject(candidate)) throw new Error('データ形式が正しくありません。');
    const categories = Array.isArray(candidate.categories) ? candidate.categories.map(value => cleanText(value, 30)).filter(Boolean) : [];
    const uniqueCategories = [...new Set(categories)];
    if (!uniqueCategories.length) throw new Error('分類データが正しくありません。');
    const next = { version: 1, activeStoreId: '', categories: uniqueCategories, welciaTemplate: cleanText(candidate.welciaTemplate, 500), stores: {} };
    for (const seed of STORE_SEEDS) {
      const source = isPlainObject(candidate.stores) && isPlainObject(candidate.stores[seed.id]) ? candidate.stores[seed.id] : newStore(seed);
      const ordered = Array.isArray(source.categoryOrder) ? source.categoryOrder.filter(cat => uniqueCategories.includes(cat)) : [];
      const categoryOrder = [...new Set(ordered.concat(uniqueCategories))];
      const routines = Array.isArray(source.routines) ? source.routines.map(item => cleanEntry(item, uniqueCategories)).filter(Boolean).map(item => ({ id: item.id, name: item.name, category: item.category })) : [];
      const items = Array.isArray(source.items) ? source.items.map(item => cleanEntry(item, uniqueCategories)).filter(Boolean) : [];
      next.stores[seed.id] = { id: seed.id, name: seed.name, budget: cleanPrice(source.budget) === '' ? 0 : cleanPrice(source.budget), categoryOrder, routines, items,
        handover: { milk: source.handover && source.handover.milk === true, template: source.handover && source.handover.template === true } };
    }
    next.activeStoreId = next.stores[candidate.activeStoreId] ? candidate.activeStoreId : 'welcia';
    return next;
  }
  function loadState() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? normalize(JSON.parse(raw)) : defaultState(); }
    catch (error) { console.warn('保存データを読み込めませんでした。', error); return defaultState(); }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function store() { return state.stores[state.activeStoreId]; }
  function yen(value) { return `¥${Number(value || 0).toLocaleString('ja-JP')}`; }
  function selectedRoutineIds() { return new Set(store().items.filter(item => item.sourceRoutineId).map(item => item.sourceRoutineId)); }
  function categoryOptions(select, selected) {
    select.replaceChildren();
    state.categories.forEach(category => {
      const option = document.createElement('option'); option.value = category; option.textContent = category; option.selected = category === selected; select.append(option);
    });
  }
  function addButton(label, onClick, className = '') { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (className) button.className = className; button.addEventListener('click', onClick); return button; }

  function renderStoreSelect() {
    const select = $('store-select'); const oldValue = select.value;
    select.replaceChildren();
    Object.values(state.stores).forEach(s => { const option = document.createElement('option'); option.value = s.id; option.textContent = s.name; select.append(option); });
    select.value = state.stores[oldValue] ? oldValue : state.activeStoreId;
  }
  function renderRoutine() {
    const list = $('routine-list'); const current = store(); const selected = selectedRoutineIds();
    list.replaceChildren();
    current.routines.forEach(routine => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `routine-item${selected.has(routine.id) ? ' is-selected' : ''}`;
      button.setAttribute('aria-pressed', String(selected.has(routine.id)));
      button.textContent = routine.name;
      const small = document.createElement('small'); small.textContent = routine.category; button.append(small);
      button.addEventListener('click', () => toggleRoutine(routine)); list.append(button);
    });
    $('routine-empty').hidden = current.routines.length !== 0;
    $('routine-count').textContent = `選択中 ${selected.size}件`;
  }
  function toggleRoutine(routine) {
    const current = store(); const index = current.items.findIndex(item => item.sourceRoutineId === routine.id);
    if (index >= 0) current.items.splice(index, 1);
    else current.items.push({ id: uid(), name: routine.name, category: routine.category, price: '', purchased: false, sourceRoutineId: routine.id });
    save(); renderRoutine(); renderShopping();
  }
  function sortedItems() {
    const order = new Map(store().categoryOrder.map((category, index) => [category, index]));
    return store().items.map((item, index) => ({ item, index })).sort((a, b) => (order.get(a.item.category) ?? 999) - (order.get(b.item.category) ?? 999) || a.index - b.index);
  }
  function renderShopping() {
    const current = store(); const bought = current.items.filter(item => item.purchased).reduce((sum, item) => sum + (typeof item.price === 'number' ? item.price : 0), 0);
    const remaining = current.budget - bought; const panel = document.querySelector('.budget-panel');
    $('remaining-budget').textContent = yen(remaining); $('budget-detail').textContent = `使用 ${yen(bought)} / 予算 ${yen(current.budget)}`; panel.classList.toggle('is-over', remaining < 0);
    const grid = $('shopping-grid'); grid.replaceChildren();
    sortedItems().forEach(({ item }) => grid.append(createItemCard(item)));
    $('shopping-empty').hidden = current.items.length !== 0;
    categoryOptions($('quick-category'), $('quick-category').value || state.categories[0]);
    const welcia = current.id === 'welcia'; $('handover-section').hidden = !welcia;
    if (welcia) renderHandover();
  }
  function createItemCard(item) {
    const card = document.createElement('article'); card.className = `item-card${item.purchased ? ' is-purchased' : ''}`;
    const name = document.createElement('input'); name.className = 'item-name'; name.value = item.name; name.maxLength = 60; name.setAttribute('aria-label', '商品名');
    name.addEventListener('change', () => { const value = cleanText(name.value); if (!value) { name.value = item.name; return; } item.name = value; save(); renderRoutine(); renderShopping(); }); card.append(name);
    const priceLabel = document.createElement('label'); priceLabel.className = 'price-field'; priceLabel.append('¥');
    const price = document.createElement('input'); price.type = 'number'; price.min = '0'; price.step = '1'; price.inputMode = 'numeric'; price.placeholder = '金額'; price.value = item.price; price.setAttribute('aria-label', `${item.name}の金額`);
    price.addEventListener('change', () => { item.price = cleanPrice(price.value); price.value = item.price; save(); renderShopping(); }); priceLabel.append(price); card.append(priceLabel);
    const row = document.createElement('div'); row.className = 'purchase-row'; const checkLabel = document.createElement('label'); checkLabel.className = 'check-label';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.purchased; checkbox.setAttribute('aria-label', `${item.name}を購入済みにする`);
    checkbox.addEventListener('change', () => { item.purchased = checkbox.checked; save(); renderShopping(); }); checkLabel.append(checkbox, '購入済み');
    row.append(checkLabel, addButton('削除', () => { if (confirm(`「${item.name}」を今回の買い物から削除しますか？`)) { currentItemRemove(item.id); } }, 'delete-item')); card.append(row);
    return card;
  }
  function currentItemRemove(id) { const index = store().items.findIndex(item => item.id === id); if (index >= 0) { store().items.splice(index, 1); save(); renderRoutine(); renderShopping(); } }
  function handoverText() {
    const current = store(); const names = current.items.filter(item => !item.purchased).map(item => item.name);
    if (current.handover.milk && !names.some(name => name.trim() === '牛乳')) names.push('牛乳');
    const lines = names.map(name => `・${name}`);
    if (current.handover.template && state.welciaTemplate.trim()) lines.push('', state.welciaTemplate.trim());
    return lines.length ? `【買い物のお願い】\n${lines.join('\n')}` : '未購入の商品はありません。';
  }
  function renderHandover() {
    const current = store(); $('handover-text').value = handoverText();
    for (const [id, key] of [['add-milk', 'milk'], ['add-template', 'template']]) { const button = $(id); button.classList.toggle('is-on', current.handover[key]); button.setAttribute('aria-pressed', String(current.handover[key])); }
  }
  function renderAll() { renderStoreSelect(); renderRoutine(); renderShopping(); }

  function renderSettings() {
    const current = store(); $('settings-store-name').textContent = current.name; $('budget-input').value = current.budget;
    categoryOptions($('routine-category'), $('routine-category').value || state.categories[0]);
    const list = $('settings-routine-list'); list.replaceChildren();
    current.routines.forEach(routine => {
      const row = document.createElement('div'); row.className = 'settings-row'; const name = document.createElement('span'); name.className = 'row-name'; name.textContent = `${routine.name}（${routine.category}）`;
      row.append(name, addButton('編集', () => startRoutineEdit(routine)), addButton('削除', () => deleteRoutine(routine), 'delete-item')); list.append(row);
    });
    const categoryList = $('category-order-list'); categoryList.replaceChildren();
    current.categoryOrder.forEach((category, index) => {
      const row = document.createElement('div'); row.className = 'settings-row'; const name = document.createElement('span'); name.className = 'row-name'; name.textContent = category;
      const actions = document.createElement('div'); actions.className = 'order-actions';
      actions.append(addButton('↑', () => moveCategory(index, -1)), addButton('↓', () => moveCategory(index, 1)), addButton('名前', () => renameCategory(category)), addButton('削除', () => deleteCategory(category), 'delete-item'));
      row.append(name, actions); categoryList.append(row);
    });
    const templateSection = $('template-settings'); templateSection.hidden = current.id !== 'welcia'; $('template-input').value = state.welciaTemplate;
  }
  function openSettings() { renderSettings(); $('settings-dialog').showModal(); }
  function startRoutineEdit(routine) { $('routine-id').value = routine.id; $('routine-name').value = routine.name; categoryOptions($('routine-category'), routine.category); $('routine-cancel').hidden = false; $('routine-name').focus(); }
  function clearRoutineForm() { $('routine-id').value = ''; $('routine-name').value = ''; categoryOptions($('routine-category'), state.categories[0]); $('routine-cancel').hidden = true; }
  function deleteRoutine(routine) { if (!confirm(`定番商品「${routine.name}」を削除しますか？\n今回の買い物リストには影響しません。`)) return; store().routines = store().routines.filter(item => item.id !== routine.id); save(); clearRoutineForm(); renderSettings(); renderRoutine(); }
  function moveCategory(index, direction) { const target = index + direction; if (target < 0 || target >= store().categoryOrder.length) return; const list = store().categoryOrder; [list[index], list[target]] = [list[target], list[index]]; save(); renderSettings(); renderShopping(); }
  function renameCategory(oldName) {
    const value = cleanText(prompt(`「${oldName}」の新しい名前`, oldName), 30);
    if (!value || value === oldName) return; if (state.categories.includes(value)) { alert('同じ名前の分類があります。'); return; }
    state.categories = state.categories.map(category => category === oldName ? value : category);
    Object.values(state.stores).forEach(s => { s.categoryOrder = s.categoryOrder.map(category => category === oldName ? value : category); s.routines.forEach(item => { if (item.category === oldName) item.category = value; }); s.items.forEach(item => { if (item.category === oldName) item.category = value; }); });
    save(); renderSettings(); renderAll();
  }
  function deleteCategory(category) {
    if (state.categories.length === 1) { alert('分類は1つ以上必要です。'); return; }
    const fallback = state.categories.includes('その他') && category !== 'その他' ? 'その他' : state.categories.find(value => value !== category);
    if (!confirm(`分類「${category}」を削除しますか？\nこの分類の商品は「${fallback}」へ変更されます。`)) return;
    state.categories = state.categories.filter(value => value !== category);
    Object.values(state.stores).forEach(s => {
      s.categoryOrder = s.categoryOrder.filter(value => value !== category);
      s.routines.forEach(item => { if (item.category === category) item.category = fallback; });
      s.items.forEach(item => { if (item.category === category) item.category = fallback; });
    });
    save(); renderSettings(); renderAll();
  }
  function copyHandover() {
    const text = $('handover-text').value; const done = () => { $('copy-status').textContent = 'コピーしました。メールやメモに貼り付けられます。'; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(copyFallback);
    else copyFallback();
    function copyFallback() { const area = $('handover-text'); area.focus(); area.select(); try { document.execCommand('copy'); done(); } catch { $('copy-status').textContent = 'コピーできませんでした。本文を長押ししてコピーしてください。'; } window.getSelection().removeAllRanges(); }
  }
  function exportBackup() {
    const content = JSON.stringify(state, null, 2); const blob = new Blob([content], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `shopping-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); $('backup-status').textContent = 'JSONバックアップを保存しました。';
  }
  function importBackup(file) {
    if (!file) return; const reader = new FileReader();
    reader.onload = () => { try { const restored = normalize(JSON.parse(String(reader.result))); if (!confirm('現在のすべての店舗データと設定を、バックアップで置き換えますか？')) return; state = restored; save(); clearRoutineForm(); renderAll(); renderSettings(); $('backup-status').textContent = 'バックアップを復元しました。'; } catch (error) { $('backup-status').textContent = `復元できませんでした: ${error.message || 'JSON形式を確認してください。'}`; } };
    reader.onerror = () => { $('backup-status').textContent = 'ファイルを読み込めませんでした。'; }; reader.readAsText(file, 'utf-8');
  }

  $('store-select').addEventListener('change', event => { state.activeStoreId = event.target.value; save(); renderAll(); });
  document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => { currentView = button.dataset.view; document.querySelectorAll('.tab-button').forEach(tab => tab.classList.toggle('is-active', tab === button)); $('routine-view').hidden = currentView !== 'routine'; $('shopping-view').hidden = currentView !== 'shopping'; }));
  $('open-settings').addEventListener('click', openSettings);
  $('quick-add-form').addEventListener('submit', event => { event.preventDefault(); const name = cleanText($('quick-name').value); if (!name) return; store().items.push({ id: uid(), name, category: $('quick-category').value, price: '', purchased: false, sourceRoutineId: null }); $('quick-name').value = ''; save(); renderRoutine(); renderShopping(); });
  $('reset-shopping').addEventListener('click', () => { if (!confirm(`「${store().name}」の今回の買い物リストをすべてリセットしますか？\n定番商品の登録と予算は残ります。`)) return; store().items = []; store().handover = { milk: false, template: false }; save(); renderRoutine(); renderShopping(); });
  $('add-milk').addEventListener('click', () => { store().handover.milk = !store().handover.milk; save(); renderHandover(); });
  $('add-template').addEventListener('click', () => { store().handover.template = !store().handover.template; save(); renderHandover(); });
  $('copy-handover').addEventListener('click', copyHandover);
  $('budget-input').addEventListener('change', () => { store().budget = cleanPrice($('budget-input').value); if (store().budget === '') store().budget = 0; $('budget-input').value = store().budget; save(); renderShopping(); });
  $('routine-form').addEventListener('submit', event => { event.preventDefault(); const name = cleanText($('routine-name').value); if (!name) return; const id = $('routine-id').value; const routine = { id: id || uid(), name, category: $('routine-category').value }; const index = store().routines.findIndex(item => item.id === id); if (index >= 0) store().routines[index] = routine; else store().routines.push(routine); save(); clearRoutineForm(); renderSettings(); renderRoutine(); });
  $('routine-cancel').addEventListener('click', clearRoutineForm);
  $('category-form').addEventListener('submit', event => { event.preventDefault(); const category = cleanText($('new-category').value, 30); if (!category) return; if (state.categories.includes(category)) { alert('同じ名前の分類があります。'); return; } state.categories.push(category); Object.values(state.stores).forEach(s => s.categoryOrder.push(category)); $('new-category').value = ''; save(); renderSettings(); renderAll(); });
  $('save-template').addEventListener('click', () => { state.welciaTemplate = cleanText($('template-input').value, 500); $('template-input').value = state.welciaTemplate; save(); renderHandover(); $('backup-status').textContent = '定型文を保存しました。'; });
  $('export-backup').addEventListener('click', exportBackup); $('import-backup').addEventListener('change', event => importBackup(event.target.files[0]));

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service Workerの登録に失敗しました。', error)));
  renderAll();
})();
