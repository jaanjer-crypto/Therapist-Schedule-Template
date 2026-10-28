const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual scheduling code without requiring installed browser packages.
const elements = new Map();
const storage = new Map();
const element = () => ({
  textContent: '', disabled: false, innerHTML: '', children: [], style: {}, dataset: {},
  classList: { toggle() {} },
  appendChild(child) { this.children.push(child); child.parentElement = this; },
  append(...children) { children.forEach((child) => this.appendChild(child)); },
  setAttribute(name, value) { this[name] = value; },
  querySelector(selector) {
    for (const child of this.children) {
      if ((child.className || '').split(' ').includes(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  },
  querySelectorAll() { return []; }, addEventListener() {}, removeEventListener() {},
  remove() {}, click() {},
});
const context = vm.createContext({
  document: {
    addEventListener() {},
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, body: element(), documentElement: { style: { setProperty() {} } },
  },
  window: { confirm: () => true, addEventListener() {}, removeEventListener() {}, setTimeout() {},
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
  Blob, URL: { createObjectURL(blob) { context.csvBlob = blob; return 'blob:test'; } },
});
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
vm.runInContext(source.slice(0, source.lastIndexOf('\nrenderDurationOptions();')), context);
const run = (code) => vm.runInContext(code, context);
let passed = 0;
assert.equal(run('state.blocks.length'), 0);
assert.equal(run('state.clinicianName'), '');
function test(name, fn) {
  run(`state.blocks = []; state.daysOff.fill(false); state.selectedDayIndex = 0;
    state.selectedBlockId = null; state.selectedType = 'appointment';
    state.shiftTimes = DAYS_OF_WEEK.map(() => ({start:'08:00',end:'17:00'}));`);
  fn(); passed++; console.log(`PASS ${name}`);
}

test('named templates save independent copies and restore customization', () => {
  run(`applyTemplate(BLANK_TEMPLATE); state.clinicianName = 'Dr. Test'; DAYS_OF_WEEK[0] = 'Monday';
    state.durationOptions[0].label = 'Consult';
    state.blocks = [{id:createBlockId(),dayIndex:0,type:'appointment',label:'Visit',start:480,duration:30}];
    document.getElementById('templateName').value = 'Week A'; saveTemplate();
    state.blocks[0].duration = 60;
    document.getElementById('templateName').value = 'Week B'; saveTemplate();`);
  assert.equal(run('readTemplates().length'), 2);
  assert.equal(run('readTemplates()[0].data.blocks[0].duration'), 30);
  run(`document.getElementById('savedTemplates').value = 'Week A'; loadTemplate();`);
  assert.equal(run('state.blocks[0].duration'), 30);
  assert.equal(run('DAYS_OF_WEEK[0]'), 'Monday');
  assert.equal(run('state.durationOptions[0].label'), 'Consult');
  assert.equal(run('state.clinicianName'), 'Dr. Test');
});
test('new blank preserves the saved library', () => {
  run('newBlankTemplate()');
  assert.equal(run('state.blocks.length'), 0);
  assert.equal(run('state.clinicianName'), '');
  assert.equal(run('DAYS_OF_WEEK[0]'), 'Mon');
  assert.equal(run('readTemplates().length'), 2);
});
test('reopening starts blank even when saved templates exist', () => {
  const reopened = vm.createContext({ document: context.document, window: context.window });
  vm.runInContext(source.replace(/renderDurationOptions\(\);\s*renderNonPatientCareOptions\(\);\s*attachEvents\(\);\s*render\(\);\s*$/, ''), reopened);
  assert.equal(vm.runInContext('state.blocks.length', reopened), 0);
  assert.equal(vm.runInContext('readTemplates().length', reopened), 2);
});
test('overwrite cancellation preserves existing saved data', () => {
  context.window.confirm = () => false;
  run(`state.clinicianName = 'Changed'; document.getElementById('templateName').value = 'Week A'; saveTemplate();`);
  assert.equal(run('readTemplates()[0].data.clinicianName'), 'Dr. Test');
  context.window.confirm = () => true;
});
test('deleting one template preserves the other', () => {
  run(`document.getElementById('savedTemplates').value = 'Week B'; deleteTemplate();`);
  assert.equal(run('readTemplates().length'), 1);
  assert.equal(run('readTemplates()[0].name'), 'Week A');
});
test('storage failure reports an error and preserves current work', () => {
  const setItem = context.window.localStorage.setItem;
  context.window.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  run(`state.clinicianName = 'Keep me'; document.getElementById('templateName').value = 'Failure'; saveTemplate();`);
  assert.match(elements.get('actionStatus').textContent, /Could not save/);
  assert.equal(run('state.clinicianName'), 'Keep me');
  context.window.localStorage.setItem = setItem;
});
test('corrupt storage does not replace current work', () => {
  const previous = storage.get(run('TEMPLATE_STORAGE_KEY'));
  storage.set(run('TEMPLATE_STORAGE_KEY'), '{broken');
  run('loadTemplate()');
  assert.equal(run('state.clinicianName'), 'Keep me');
  assert.match(elements.get('actionStatus').textContent, /Could not load/);
  storage.set(run('TEMPLATE_STORAGE_KEY'), previous);
});
test('duplicate labels preserve duration selection', () => {
  run(`state.durationOptions[0].label = 'Same'; state.durationOptions[1].label = 'Same';
    state.selectedDurationKey = state.durationOptions[1].id;`);
  assert.equal(run('getSelectedDuration().minutes'), 30);
});
test('placement uses the space immediately after a 20-minute block', () => {
  run(`state.shiftTimes[0].end = '09:00'; state.blocks = [{id:10,dayIndex:0,start:480,duration:20}];`);
  assert.equal(run('findNextAvailableStart(40)'), 500);
  assert.equal(run('findNextAvailableStart(45)'), null);
});
test('overlap checks handle adjacency and anonymous candidates', () => {
  assert.equal(run('hasOverlap({id:null,start:480,duration:30},{id:1,start:510,duration:30})'), false);
  assert.equal(run('hasOverlap({id:null,start:480,duration:31},{id:1,start:510,duration:30})'), true);
});
test('shift failure rolls back block positions and hours', () => {
  run(`state.blocks = [{id:10,dayIndex:0,start:480,duration:60},{id:11,dayIndex:0,start:540,duration:60}];`);
  assert.equal(run(`updateDayShift(0,'end','09:00')`), false);
  assert.equal(run('state.shiftTimes[0].end'), '17:00');
  assert.equal(run('state.blocks.map(b => b.start).join()'), '480,540');
  assert.equal(run(`updateDayShift(0,'start','08:07')`), false);
});
test('day off hides and restores blocks', () => {
  run(`state.blocks = [{id:10,dayIndex:0,start:480,duration:30}]; state.daysOff[0] = true;`);
  assert.equal(run('getBlocksForDay(0).length'), 0);
  assert.equal(run('findNextAvailableStart(30)'), null);
  run('state.daysOff[0] = false');
  assert.equal(run('getBlocksForDay(0).length'), 1);
});
test('copy/paste preserves shift and generates distinct IDs', () => {
  run(`state.blocks = [{id:createBlockId(),dayIndex:0,type:'appointment',label:'Test',start:480,duration:30}];
    copySelectedDaySchedule(); state.selectedDayIndex = 1; pasteDaySchedule();`);
  assert.equal(run('state.blocks.length'), 2);
  assert.equal(run('state.blocks[0].id !== state.blocks[1].id'), true);
  assert.equal(run('state.blocks[1].dayIndex'), 1);
  assert.equal(run('state.shiftTimes[1].start'), '08:00');
});
test('switching days clears incompatible block selection', () => {
  run('state.blocks = [{id:10,dayIndex:0}]; state.selectedBlockId = 10; updateSelectedDay(1);');
  assert.equal(run('state.selectedBlockId'), null);
});
test('calendar has thirteen hourly rows and an end label', () => {
  elements.get('timeColumn').children = [];
  run('createTimeLabels()');
  assert.equal(elements.get('timeColumn').children.length, 14);
  assert.equal(elements.get('timeColumn').children.at(-1).textContent, '8:00 PM');
});
test('block labels render literally', () => {
  elements.get('weekGrid').children = [];
  run(`state.blocks = [{id:10,dayIndex:0,type:'appointment',label:'<img onerror=alert(1)>',start:480,duration:30}]; renderBlocks();`);
  const block = elements.get('weekGrid').children[0].children[0].children[0];
  assert.equal(block.children[0].children[0].textContent, '<img onerror=alert(1)>');
  assert.equal(block.innerHTML, '');
});
test('canceling a drag restores its original time and day', () => {
  run(`state.blocks = [{id:10,dayIndex:1,type:'appointment',label:'Test',start:600,duration:30}];
    dragState = {id:10,originalStart:480,dayIndex:0,pointerId:7,
      element:{removeEventListener(){},hasPointerCapture(){return false;}}};
    stopDrag({type:'pointercancel',pointerId:7});`);
  assert.equal(run('state.blocks[0].start'), 480);
  assert.equal(run('state.blocks[0].dayIndex'), 0);
  assert.equal(run('dragState'), null);
});
test('pointer release preserves the element for its following click', () => {
  const children = elements.get('weekGrid').children;
  run(`state.blocks = [{id:10,dayIndex:0,type:'appointment',label:'Test',start:510,duration:30}];
    dragState = {id:10,originalStart:480,dayIndex:0,pointerId:7,
      element:{removeEventListener(){},hasPointerCapture(){return false;}}};
    stopDrag({type:'pointerup',pointerId:7});`);
  assert.equal(run('state.blocks[0].start'), 510);
  assert.equal(elements.get('weekGrid').children, children);
  assert.equal(run('dragState'), null);
});
test('unrelated pointer release cannot end a drag', () => {
  run(`dragState = {pointerId:7}; stopDrag({type:'pointerup',pointerId:8});`);
  assert.equal(run('dragState.pointerId'), 7);
  run('dragState = null');
});

(async () => {
  run(`state.blocks = [{id:10,dayIndex:0,type:'appointment',label:'=SUM(1,2)',start:480,duration:30}]; exportScheduleCsv();`);
  const csv = await context.csvBlob.text();
  assert.ok(csv.includes(`"'=SUM(1,2)"`));
  console.log('PASS CSV formula protection');
  console.log(`${passed + 1} checks passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
