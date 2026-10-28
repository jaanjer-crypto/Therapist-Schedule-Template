const DAY_START_HOUR = 5;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 15;
const START_MINUTES = DAY_START_HOUR * 60;
const END_MINUTES = DAY_END_HOUR * 60;
const TOTAL_DAY_MINUTES = END_MINUTES - START_MINUTES;
const SCHEDULE_HEIGHT = TOTAL_DAY_MINUTES;
let nextBlockId = 1;
const createBlockId = () => nextBlockId++;
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const APPOINTMENT_COLORS = ['#3d6df2', '#2bb673', '#f39c12', '#8e5cf6', '#e74c3c', '#00a8a8', '#ff7f50', '#6c5ce7'];
const LUNCH_COLOR = '#ec4899';
const NON_PATIENT_COLOR = '#f4c542';

const state = {
  clinicianName: '',
  selectedDayIndex: 0,
  shiftTimes: DAYS_OF_WEEK.map(() => ({ start: '08:00', end: '17:00' })),
  daysOff: DAYS_OF_WEEK.map(() => false),
  durationOptions: [
    { label: '15 min', minutes: 15, isCustom: false, color: APPOINTMENT_COLORS[0] },
    { label: '30 min', minutes: 30, isCustom: false, color: APPOINTMENT_COLORS[1] },
    { label: '45 min', minutes: 45, isCustom: false, color: APPOINTMENT_COLORS[2] },
    { label: '60 min', minutes: 60, isCustom: false, color: APPOINTMENT_COLORS[3] },
    { label: '75 min', minutes: 75, isCustom: false, color: APPOINTMENT_COLORS[4] },
    { label: '90 min', minutes: 90, isCustom: false, color: APPOINTMENT_COLORS[5] },
    { label: '120 min', minutes: 120, isCustom: false, color: APPOINTMENT_COLORS[6] }
  ],
  nonPatientCareOptions: [
    { label: '15 min', minutes: 15, color: NON_PATIENT_COLOR },
    { label: '20 min', minutes: 20, color: NON_PATIENT_COLOR },
    { label: '30 min', minutes: 30, color: NON_PATIENT_COLOR },
    { label: '45 min', minutes: 45, color: NON_PATIENT_COLOR },
    { label: '60 min', minutes: 60, color: NON_PATIENT_COLOR },
    { label: '75 min', minutes: 75, color: NON_PATIENT_COLOR },
    { label: '90 min', minutes: 90, color: NON_PATIENT_COLOR }
  ],
  selectedDurationKey: 'appointment-30',
  selectedNonPatientCareKey: 'nonPatientCare-15',
  selectedType: 'appointment',
  selectedBlockId: null,
  dayClipboard: null,
  blocks: []
};

state.durationOptions.forEach((option) => { option.id = `appointment-${option.minutes}`; });
state.nonPatientCareOptions.forEach((option) => { option.id = `nonPatientCare-${option.minutes}`; });

const TEMPLATE_STORAGE_KEY = 'clinician-schedule-templates-v1';
const DRAFT_STORAGE_KEY = 'clinician-schedule-draft-v1';
let draftReady = false;
let draftSaveFailed = false;

function saveCurrentDraft() {
  if (!draftReady || window.templateAccount?.user) return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      name: document.getElementById('templateName').value,
      selectedDayIndex: state.selectedDayIndex,
      data: captureTemplate(),
    }));
    draftSaveFailed = false;
  } catch {
    if (!draftSaveFailed) showStatus('Automatic saving is unavailable. Keep this page open or export your schedule before closing.');
    draftSaveFailed = true;
  }
}

function restoreCurrentDraft() {
  try {
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (stored) {
      const draft = JSON.parse(stored);
      if (draft.version !== 1 || typeof draft.name !== 'string') throw new Error('Invalid draft');
      validateTemplate(draft.data);
      applyTemplate(draft.data);
      document.getElementById('templateName').value = draft.name;
      if (Number.isInteger(draft.selectedDayIndex) && draft.selectedDayIndex >= 0 && draft.selectedDayIndex < 7) {
        updateSelectedDay(draft.selectedDayIndex);
      }
      showStatus('Your last schedule was restored from this browser.');
    }
  } catch {
    showStatus('Could not restore the last schedule. Your named saved templates are still available.');
  }
  draftReady = true;
}
function captureTemplate() {
  return JSON.parse(JSON.stringify({
    clinicianName: state.clinicianName, dayNames: DAYS_OF_WEEK,
    shiftTimes: state.shiftTimes, daysOff: state.daysOff, blocks: state.blocks,
    durationOptions: state.durationOptions, nonPatientCareOptions: state.nonPatientCareOptions,
  }));
}
const BLANK_TEMPLATE = captureTemplate();
let savedCheckpoint = JSON.stringify(BLANK_TEMPLATE);

function validateTemplate(data) {
  const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validOption = (option) => option && typeof option.id === 'string' && typeof option.label === 'string' &&
    Number.isInteger(option.minutes) && option.minutes > 0 && option.minutes <= TOTAL_DAY_MINUTES;
  if (!data || typeof data.clinicianName !== 'string' ||
      !Array.isArray(data.dayNames) || data.dayNames.length !== 7 || !data.dayNames.every((day) => typeof day === 'string') ||
      !Array.isArray(data.daysOff) || data.daysOff.length !== 7 || !data.daysOff.every((off) => typeof off === 'boolean') ||
      !Array.isArray(data.shiftTimes) || data.shiftTimes.length !== 7 || !data.shiftTimes.every((shift) =>
        shift && validTime(shift.start) && validTime(shift.end) && timeStringToMinutes(shift.start) >= START_MINUTES &&
        timeStringToMinutes(shift.end) <= END_MINUTES && timeStringToMinutes(shift.start) < timeStringToMinutes(shift.end)) ||
      ![data.durationOptions, data.nonPatientCareOptions].every((options) => Array.isArray(options) && options.length &&
        options.every(validOption) && new Set(options.map((option) => option.id)).size === options.length) ||
      !Array.isArray(data.blocks) || !data.blocks.every((block) => block && Number.isInteger(block.dayIndex) &&
        block.dayIndex >= 0 && block.dayIndex < 7 && ['appointment', 'nonPatientCare', 'lunch'].includes(block.type) &&
        typeof block.label === 'string' && Number.isInteger(block.start) && Number.isInteger(block.duration) && block.duration > 0 &&
        block.start >= timeStringToMinutes(data.shiftTimes[block.dayIndex].start) &&
        block.start + block.duration <= timeStringToMinutes(data.shiftTimes[block.dayIndex].end))) {
    throw new Error('Invalid template');
  }
  if (data.blocks.some((block, index) => data.blocks.slice(index + 1).some((other) =>
    block.dayIndex === other.dayIndex && block.start < other.start + other.duration && other.start < block.start + block.duration))) {
    throw new Error('Overlapping template blocks');
  }
  return data;
}

function readTemplates() {
  const library = JSON.parse(window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || '{"version":1,"templates":[]}');
  if (library.version !== 1 || !Array.isArray(library.templates) || !library.templates.every((entry) =>
    entry && typeof entry.name === 'string' && entry.name.trim() && validateTemplate(entry.data))) throw new Error('Invalid template library');
  return library.templates;
}

function refreshTemplates(selectedName = '') {
  const select = document.getElementById('savedTemplates');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a template';
  select.appendChild(placeholder);
  (window.templateAccount?.user ? window.templateAccount.templates : readTemplates()).forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.name;
    option.textContent = entry.name;
    select.appendChild(option);
  });
  select.value = selectedName;
  document.getElementById('loadTemplate').disabled = !select.value;
  document.getElementById('deleteTemplate').disabled = !select.value;
}

function applyTemplate(data) {
  const copy = JSON.parse(JSON.stringify(validateTemplate(data)));
  DAYS_OF_WEEK.splice(0, 7, ...copy.dayNames);
  for (const key of ['clinicianName', 'shiftTimes', 'daysOff', 'durationOptions', 'nonPatientCareOptions']) state[key] = copy[key];
  state.blocks = copy.blocks.map((block) => ({ ...block, id: createBlockId() }));
  state.selectedDayIndex = 0;
  state.selectedBlockId = null;
  state.dayClipboard = null;
  state.selectedType = 'appointment';
  state.selectedDurationKey = state.durationOptions[0].id;
  state.selectedNonPatientCareKey = state.nonPatientCareOptions[0].id;
  els.scheduleCopyStatus.textContent = '';
  renderDurationOptions();
  render();
  savedCheckpoint = JSON.stringify(captureTemplate());
}

function confirmTemplateReplacement() {
  return JSON.stringify(captureTemplate()) === savedCheckpoint || window.confirm('Discard unsaved changes to the current template?');
}

function saveTemplate() {
  if (window.templateAccount?.user) return window.templateAccount.save();
  const name = document.getElementById('templateName').value.trim();
  if (!name) { showStatus('Enter a template name before saving.'); return; }
  try {
    const templates = readTemplates();
    const index = templates.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (index !== -1 && !window.confirm(`Replace the saved template "${templates[index].name}"?`)) return;
    const entry = { name, data: validateTemplate(captureTemplate()) };
    if (index === -1) templates.push(entry); else templates[index] = entry;
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({ version: 1, templates }));
    savedCheckpoint = JSON.stringify(captureTemplate());
    refreshTemplates(name);
    showStatus(`Template "${name}" saved.`);
  } catch (error) {
    showStatus('Could not save the template. Browser storage may be unavailable, full, or contain invalid saved data.');
  }
}

function loadTemplate() {
  if (window.templateAccount?.user) return window.templateAccount.load();
  try {
    const name = document.getElementById('savedTemplates').value;
    const entry = readTemplates().find((template) => template.name === name);
    if (!entry || !confirmTemplateReplacement()) return;
    applyTemplate(entry.data);
    document.getElementById('templateName').value = entry.name;
    showStatus(`Template "${entry.name}" loaded.`);
  } catch (error) { showStatus('Could not load the saved template. Current schedule unchanged.'); }
}

function deleteTemplate() {
  if (window.templateAccount?.user) return window.templateAccount.remove();
  try {
    const name = document.getElementById('savedTemplates').value;
    if (!name || !window.confirm(`Delete saved template "${name}"?`)) return;
    const templates = readTemplates().filter((entry) => entry.name !== name);
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({ version: 1, templates }));
    refreshTemplates();
    showStatus('Saved template deleted. The current schedule is still open.');
  } catch (error) { showStatus('Could not delete the saved template. Browser storage is unavailable.'); }
}

function newBlankTemplate() {
  if (!confirmTemplateReplacement()) return;
  applyTemplate(BLANK_TEMPLATE);
  document.getElementById('templateName').value = '';
  document.getElementById('savedTemplates').value = '';
  document.getElementById('loadTemplate').disabled = true;
  document.getElementById('deleteTemplate').disabled = true;
  showStatus('New blank template started. Saved templates are unchanged.');
}

function showStatus(message) {
  document.getElementById('actionStatus').textContent = message;
}

const els = {
  durationOptions: document.getElementById('durationOptions'),
  nonPatientCareOptions: document.getElementById('nonPatientCareOptions'),
  addAppointment: document.getElementById('addAppointment'),
  addLunch30: document.getElementById('addLunch30'),
  addLunch60: document.getElementById('addLunch60'),
  copyDaySchedule: document.getElementById('copyDaySchedule'),
  pasteDaySchedule: document.getElementById('pasteDaySchedule'),
  scheduleCopyStatus: document.getElementById('scheduleCopyStatus'),
  exportExcel: document.getElementById('exportExcel'),
  exportPdf: document.getElementById('exportPdf'),
  resetSchedule: document.getElementById('resetSchedule'),
  removeAppointment: document.getElementById('removeAppointment'),
  timeColumn: document.getElementById('timeColumn'),
  weekHeader: document.getElementById('weekHeader'),
  weekGrid: document.getElementById('weekGrid'),
  totalWorkValue: document.getElementById('totalWorkValue'),
  directCareValue: document.getElementById('directCareValue'),
  totalNonPatientCareValue: document.getElementById('totalNonPatientCareValue'),
  totalAppointmentsValue: document.getElementById('totalAppointmentsValue'),
  availableTimeValue: document.getElementById('availableTimeValue'),
  averageDailyAppointmentsValue: document.getElementById('averageDailyAppointmentsValue'),
  alertBox: document.getElementById('alertBox')
};

function minutesToTimeLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const normalizedHour = ((hours + 11) % 12) + 1;
  return `${normalizedHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function minutesToCompactTimeRange(startMinutes, endMinutes) {
  const startLabel = minutesToTimeLabel(startMinutes);
  const endLabel = minutesToTimeLabel(endMinutes);
  const startPeriod = startLabel.slice(-2);
  const endPeriod = endLabel.slice(-2);

  if (startPeriod === endPeriod) {
    return `${startLabel.slice(0, -3)} - ${endLabel}`;
  }

  return `${startLabel} - ${endLabel}`;
}

function timeStringToMinutes(value) {
  if (!value) return 0;
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function getShiftWindowFromValues(shift) {
  const start = timeStringToMinutes(shift.start) || START_MINUTES;
  const end = timeStringToMinutes(shift.end) || END_MINUTES;
  const boundedStart = Math.max(START_MINUTES, Math.min(start, END_MINUTES));
  const boundedEnd = Math.max(START_MINUTES, Math.min(end, END_MINUTES));
  return {
    start: boundedStart,
    end: Math.max(boundedStart, boundedEnd)
  };
}

function getShiftWindow(dayIndex = state.selectedDayIndex) {
  return getShiftWindowFromValues(state.shiftTimes[dayIndex] || { start: '08:00', end: '17:00' });
}

function createTimeLabels() {
  if (!els.timeColumn) return;
  els.timeColumn.innerHTML = '';
  for (let minute = START_MINUTES; minute < END_MINUTES; minute += 60) {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = minutesToTimeLabel(minute);
    els.timeColumn.appendChild(label);
  }
  const endLabel = document.createElement('span');
  endLabel.className = 'time-end-label';
  endLabel.textContent = minutesToTimeLabel(END_MINUTES);
  els.timeColumn.appendChild(endLabel);
}

function getBlocksForDay(dayIndex) {
  if (state.daysOff[dayIndex]) return [];
  return state.blocks.filter((block) => (block.dayIndex ?? state.selectedDayIndex) === dayIndex);
}

function getShiftDurationMinutes(dayIndex = state.selectedDayIndex) {
  if (state.daysOff[dayIndex]) return 0;
  const shiftWindow = getShiftWindow(dayIndex);
  return shiftWindow.end - shiftWindow.start;
}

function updateDayShift(dayIndex, key, value) {
  if (!['start', 'end'].includes(key) || state.daysOff[dayIndex]) return false;
  const nextMinutes = timeStringToMinutes(value);
  const otherMinutes = timeStringToMinutes(state.shiftTimes[dayIndex][key === 'start' ? 'end' : 'start']);
  if (!value || !Number.isFinite(nextMinutes) || nextMinutes < START_MINUTES || nextMinutes > END_MINUTES ||
      nextMinutes % SLOT_MINUTES !== 0 || (key === 'start' ? nextMinutes >= otherMinutes : nextMinutes <= otherMinutes)) return false;
  const previousValue = state.shiftTimes[dayIndex][key];
  const dayBlocks = getBlocksForDay(dayIndex);
  const previousStarts = dayBlocks.map((block) => block.start);

  state.shiftTimes[dayIndex][key] = value;
  const shiftWindow = getShiftWindow(dayIndex);
  const displacedBlocks = dayBlocks
    .filter((block) => block.start < shiftWindow.start || block.start + block.duration > shiftWindow.end)
    .sort((first, second) => first.start - second.start);
  const pendingIds = displacedBlocks.map((block) => block.id);

  for (const block of displacedBlocks) {
    const start = findNextAvailableStart(block.duration, block.id, shiftWindow.start, dayIndex, pendingIds);
    if (start === null) {
      state.shiftTimes[dayIndex][key] = previousValue;
      dayBlocks.forEach((dayBlock, index) => {
        dayBlock.start = previousStarts[index];
      });
      return false;
    }

    block.start = start;
    pendingIds.splice(pendingIds.indexOf(block.id), 1);
  }

  return true;
}

function getLunchMinutes(dayIndex = state.selectedDayIndex) {
  return getBlocksForDay(dayIndex).reduce((sum, block) => {
    if (block.type === 'lunch') return sum + block.duration;
    return sum;
  }, 0);
}

function getPatientCareMinutes(dayIndex = state.selectedDayIndex) {
  return getBlocksForDay(dayIndex).reduce((sum, block) => {
    if (block.type === 'appointment') return sum + block.duration;
    return sum;
  }, 0);
}

function getNonPatientCareMinutes(dayIndex = state.selectedDayIndex) {
  return getBlocksForDay(dayIndex).reduce((sum, block) => {
    if (block.type === 'nonPatientCare') return sum + block.duration;
    return sum;
  }, 0);
}

function getAppointmentCount(dayIndex = state.selectedDayIndex) {
  return getBlocksForDay(dayIndex).filter((block) => block.type === 'appointment').length;
}

function calculateScheduleSummary() {
  saveCurrentDraft();
  const weeklyNonPatientCare = DAYS_OF_WEEK.reduce((sum, _, index) => sum + getNonPatientCareMinutes(index), 0);
  const weeklyPatientCare = DAYS_OF_WEEK.reduce((sum, _, index) => sum + getPatientCareMinutes(index), 0);
  const weeklyAppointments = DAYS_OF_WEEK.reduce((sum, _, index) => sum + getAppointmentCount(index), 0);
  const workingDayCount = DAYS_OF_WEEK.filter((_, index) => !state.daysOff[index]).length;
  const weeklyWorkMinutes = DAYS_OF_WEEK.reduce((sum, _, index) => sum + Math.max(0, getShiftDurationMinutes(index) - getLunchMinutes(index)), 0);
  const weeklyAvailable = weeklyWorkMinutes - weeklyPatientCare - weeklyNonPatientCare;
  const averageDailyAppointments = workingDayCount ? weeklyAppointments / workingDayCount : 0;

  if (els.totalWorkValue) els.totalWorkValue.textContent = `${weeklyWorkMinutes} min`;
  if (els.directCareValue) els.directCareValue.textContent = `${weeklyPatientCare} min`;
  if (els.totalNonPatientCareValue) els.totalNonPatientCareValue.textContent = `${weeklyNonPatientCare} min`;
  if (els.totalAppointmentsValue) els.totalAppointmentsValue.textContent = String(weeklyAppointments);
  if (els.availableTimeValue) els.availableTimeValue.textContent = `${weeklyAvailable} min`;
  if (els.averageDailyAppointmentsValue) els.averageDailyAppointmentsValue.textContent = `${averageDailyAppointments.toFixed(2)} / day`;

  let alertText = 'Template is within capacity.';
  let alertClass = '';
  if (weeklyAvailable < 0) {
    alertText = `Week is over capacity by ${Math.abs(weeklyAvailable)} minutes.`;
    alertClass = 'danger';
  } else if (weeklyAvailable < 30) {
    alertText = 'Only a small amount of time remains this week.';
    alertClass = 'warning';
  }

  if (els.alertBox) {
    els.alertBox.textContent = alertText;
    els.alertBox.className = 'alert-box';
    if (alertClass) els.alertBox.classList.add(alertClass);
  }
}

function getAppointmentColor(label, index) {
  if (label) {
    const normalized = label.toLowerCase();
    const paletteIndex = normalized.length % APPOINTMENT_COLORS.length;
    return APPOINTMENT_COLORS[(index + paletteIndex) % APPOINTMENT_COLORS.length];
  }
  return APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length];
}

function hasOverlap(candidate, other) {
  if (candidate.id != null && candidate.id === other.id) return false;
  return candidate.start < other.start + other.duration && other.start < candidate.start + candidate.duration;
}

function findNextAvailableStart(duration, blockId = null, preferredStart = START_MINUTES, dayIndex = state.selectedDayIndex, ignoredBlockIds = []) {
  if (state.daysOff[dayIndex] || !Number.isFinite(duration) || duration <= 0) return null;
  const shiftWindow = getShiftWindow(dayIndex);
  let current = Math.max(preferredStart, shiftWindow.start);
  const occupied = getBlocksForDay(dayIndex)
    .filter((block) => block.id !== blockId && !ignoredBlockIds.includes(block.id))
    .sort((first, second) => first.start - second.start);
  for (const block of occupied) {
    if (block.start + block.duration <= current) continue;
    if (current + duration <= block.start) break;
    current = block.start + block.duration;
  }
  return current + duration <= shiftWindow.end ? current : null;
}

function updateSelectedDay(dayIndex) {
  const selectedBlock = getBlockById(state.selectedBlockId);
  if (selectedBlock && selectedBlock.dayIndex !== dayIndex) state.selectedBlockId = null;
  state.selectedDayIndex = dayIndex;
  const isDayOff = state.daysOff[dayIndex];
  [els.addAppointment, els.addLunch30, els.addLunch60].forEach((button) => {
    if (button) button.disabled = isDayOff;
  });
  updateDayScheduleButtons();
  els.weekHeader.querySelectorAll('.day-header').forEach((header, headerIndex) => {
    header.classList.toggle('selected', headerIndex === dayIndex);
  });
  els.weekGrid.querySelectorAll('.day-column').forEach((column, columnIndex) => {
    column.classList.toggle('selected', columnIndex === dayIndex);
  });
  els.weekGrid.querySelectorAll('.block').forEach((element) => {
    element.classList.toggle('selected', element.dataset.id === String(state.selectedBlockId));
  });
  if (els.removeAppointment) els.removeAppointment.disabled = state.selectedBlockId === null;
  calculateScheduleSummary();
}

function selectDay(dayIndex) {
  state.selectedBlockId = null;
  updateSelectedDay(dayIndex);
  render();
}

function renderWeekHeader() {
  if (!els.weekHeader) return;
  els.weekHeader.innerHTML = '';

  DAYS_OF_WEEK.forEach((day, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = `day-header${index === state.selectedDayIndex ? ' selected' : ''}`;
    wrapper.addEventListener('click', () => {
      selectDay(index);
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'day-name-input';
    input.value = day;
    input.setAttribute('aria-label', `Day ${index + 1} name`);
    input.addEventListener('input', (event) => {
      const value = event.target.value.trim() || DAYS_OF_WEEK[index];
      DAYS_OF_WEEK[index] = value;
    });
    input.addEventListener('click', (event) => {
      event.stopPropagation();
      updateSelectedDay(index);
    });

    wrapper.appendChild(input);

    const shiftControls = document.createElement('div');
    shiftControls.className = 'day-shift-controls';
    [['start', 'Start'], ['end', 'End']].forEach(([key, label]) => {
      const field = document.createElement('label');
      field.className = 'day-shift-field';

      const fieldLabel = document.createElement('span');
      fieldLabel.className = 'day-shift-label';
      fieldLabel.textContent = label;

      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.className = 'day-shift-input';
      timeInput.value = state.shiftTimes[index][key];
      timeInput.disabled = state.daysOff[index];
      timeInput.min = '05:00';
      timeInput.max = '20:00';
      timeInput.step = String(SLOT_MINUTES * 60);
      timeInput.setAttribute('aria-label', `${day} shift ${label.toLowerCase()}`);
      timeInput.addEventListener('click', (event) => event.stopPropagation());
      timeInput.addEventListener('focus', () => {
        updateSelectedDay(index);
      });
      const commitShiftTime = (event) => {
        const nextValue = event.target.value;
        const otherValue = state.shiftTimes[index][key === 'start' ? 'end' : 'start'];
        const nextMinutes = timeStringToMinutes(nextValue);
        const otherMinutes = timeStringToMinutes(otherValue);
        const isInvalid = !nextValue || !Number.isFinite(nextMinutes) || nextMinutes % SLOT_MINUTES !== 0 || nextMinutes < START_MINUTES || nextMinutes > END_MINUTES || (key === 'start' ? nextMinutes >= otherMinutes : nextMinutes <= otherMinutes);

        if (isInvalid) {
          // Native time fields can emit change while the user is still editing a segment.
          if (event.type === 'change') return;
          event.target.value = state.shiftTimes[index][key];
          showStatus('Use 15-minute increments between 5 AM and 8 PM, with the end after the start.');
          return;
        }

        if (!updateDayShift(index, key, nextValue)) {
          showStatus('Shift unchanged: existing blocks cannot fit inside those hours.');
          event.target.value = state.shiftTimes[index][key];
          return;
        }
        showStatus('Shift updated.');
        renderBlocks();
        calculateScheduleSummary();
      };
      timeInput.addEventListener('change', commitShiftTime);
      timeInput.addEventListener('blur', commitShiftTime);

      field.append(fieldLabel, timeInput);
      shiftControls.appendChild(field);
    });
    wrapper.appendChild(shiftControls);

    const dayOffLabel = document.createElement('label');
    dayOffLabel.className = 'day-off-toggle';
    dayOffLabel.addEventListener('click', (event) => event.stopPropagation());
    const dayOffInput = document.createElement('input');
    dayOffInput.type = 'checkbox';
    dayOffInput.checked = state.daysOff[index];
    dayOffInput.setAttribute('aria-label', `Mark ${day} as a day off`);
    dayOffInput.addEventListener('click', (event) => event.stopPropagation());
    dayOffInput.addEventListener('change', () => {
      state.selectedDayIndex = index;
      state.daysOff[index] = dayOffInput.checked;
      state.selectedBlockId = null;
      render();
    });
    const dayOffText = document.createElement('span');
    dayOffText.textContent = 'Day off';
    dayOffLabel.append(dayOffInput, dayOffText);
    wrapper.appendChild(dayOffLabel);

    els.weekHeader.appendChild(wrapper);
  });
}

function addLunchBlock(duration) {
  if (state.daysOff[state.selectedDayIndex]) return;
  const lunchStart = findNextAvailableStart(duration, null, Math.max(12 * 60, getShiftWindow(state.selectedDayIndex).start), state.selectedDayIndex);
  if (lunchStart === null) { showStatus('No available lunch slot was found from noon onward.'); return; }
  showStatus('Lunch added.');
  const newBlock = {
    id: createBlockId(),
    dayIndex: state.selectedDayIndex,
    type: 'lunch',
    label: `${duration} min lunch`,
    start: lunchStart,
    duration,
    color: LUNCH_COLOR
  };

  state.blocks.push(newBlock);
  state.selectedBlockId = newBlock.id;
  render();
}

function updateDayScheduleButtons() {
  const selectedDay = state.selectedDayIndex;
  const isDayOff = state.daysOff[selectedDay];
  if (els.copyDaySchedule) els.copyDaySchedule.disabled = isDayOff;
  if (els.pasteDaySchedule) {
    els.pasteDaySchedule.disabled = isDayOff || !state.dayClipboard || state.dayClipboard.sourceDayIndex === selectedDay;
  }
}

function copySelectedDaySchedule() {
  if (state.daysOff[state.selectedDayIndex]) return;
  state.dayClipboard = {
    sourceDayIndex: state.selectedDayIndex,
    shiftTimes: { ...state.shiftTimes[state.selectedDayIndex] },
    blocks: getBlocksForDay(state.selectedDayIndex).map((block) => ({ ...block }))
  };
  if (els.scheduleCopyStatus) {
    els.scheduleCopyStatus.textContent = `${DAYS_OF_WEEK[state.selectedDayIndex]} schedule and shift copied.`;
  }
  updateDayScheduleButtons();
}

function pasteDaySchedule() {
  const destinationDayIndex = state.selectedDayIndex;
  const clipboard = state.dayClipboard;
  if (!clipboard || state.daysOff[destinationDayIndex] || clipboard.sourceDayIndex === destinationDayIndex) return;

  const destinationBlocks = getBlocksForDay(destinationDayIndex);
  if (destinationBlocks.length && !window.confirm(`Replace the existing ${DAYS_OF_WEEK[destinationDayIndex]} schedule and shift hours with the copied version?`)) {
    return;
  }

  const shiftWindow = getShiftWindowFromValues(clipboard.shiftTimes);
  const fitsShift = clipboard.blocks.every((block) => block.start >= shiftWindow.start && block.start + block.duration <= shiftWindow.end);
  if (!fitsShift) {
    if (els.scheduleCopyStatus) {
      els.scheduleCopyStatus.textContent = `The copied schedule does not fit ${DAYS_OF_WEEK[destinationDayIndex]}'s shift.`;
    }
    return;
  }

  state.blocks = state.blocks.filter((block) => (block.dayIndex ?? state.selectedDayIndex) !== destinationDayIndex);
  state.shiftTimes[destinationDayIndex] = { ...clipboard.shiftTimes };
  const pastedBlocks = clipboard.blocks.map((block, index) => ({
    ...block,
    id: createBlockId(),
    dayIndex: destinationDayIndex
  }));
  state.blocks.push(...pastedBlocks);
  state.selectedBlockId = null;
  if (els.scheduleCopyStatus) {
    els.scheduleCopyStatus.textContent = `${DAYS_OF_WEEK[clipboard.sourceDayIndex]} schedule pasted to ${DAYS_OF_WEEK[destinationDayIndex]}.`;
  }
  render();
}

function exportScheduleCsv() {
  const rows = [[
    'Day',
    'Status',
    'Shift start',
    'Shift end',
    'Block type',
    'Block name',
    'Start time',
    'End time',
    'Duration (minutes)'
  ]];

  DAYS_OF_WEEK.forEach((day, dayIndex) => {
    const shift = state.shiftTimes[dayIndex];
    const status = state.daysOff[dayIndex] ? 'Day off' : 'Working';
    const dayBlocks = getBlocksForDay(dayIndex);

    if (dayBlocks.length === 0) {
      rows.push([day, status, shift.start, shift.end, '', '', '', '', '']);
      return;
    }

    dayBlocks.forEach((block) => {
      const blockType = block.type === 'nonPatientCare' ? 'Non-patient care' : block.type[0].toUpperCase() + block.type.slice(1);
      rows.push([
        day,
        status,
        shift.start,
        shift.end,
        blockType,
        block.label,
        minutesToTimeLabel(block.start),
        minutesToTimeLabel(block.start + block.duration),
        block.duration
      ]);
    });
  });

  const csvEscape = (value) => {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csvContent = `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;
  const blobUrl = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const clinician = (state.clinicianName || 'Clinician').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-');
  link.href = blobUrl;
  link.download = `${clinician || 'Clinician'}-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function renderBlocks() {
  if (!els.weekGrid) return;
  els.weekGrid.innerHTML = '';

  DAYS_OF_WEEK.forEach((day, dayIndex) => {
    const column = document.createElement('div');
    column.className = `day-column${dayIndex === state.selectedDayIndex ? ' selected' : ''}${state.daysOff[dayIndex] ? ' day-off' : ''}`;
    column.addEventListener('click', (event) => {
      if (event.target.closest('.block')) return;
      selectDay(dayIndex);
    });

    const canvas = document.createElement('div');
    canvas.className = 'schedule-canvas';
    canvas.style.height = `${SCHEDULE_HEIGHT}px`;

    if (state.daysOff[dayIndex]) {
      const dayOffNotice = document.createElement('div');
      dayOffNotice.className = 'day-off-notice';
      dayOffNotice.textContent = 'Day off';
      column.appendChild(dayOffNotice);
    }

    const blocks = getBlocksForDay(dayIndex);
    blocks.forEach((block, index) => {
      const element = document.createElement('div');
      const isSelected = state.selectedBlockId === block.id;
      const color = block.color || getAppointmentColor(block.label, index);
      const startLabel = minutesToTimeLabel(block.start);
      const endLabel = minutesToTimeLabel(block.start + block.duration);
      const isShortDuration = block.duration <= 15;
      const isCompactAppointment = block.type === 'appointment' && block.duration === 30;
      const blockTime = isCompactAppointment ? minutesToCompactTimeRange(block.start, block.start + block.duration) : `${startLabel} - ${endLabel}`;

      element.className = `block ${block.type}${isSelected ? ' selected' : ''}${isShortDuration ? ' short-duration' : ''}${isCompactAppointment ? ' compact-appointment' : ''}`;
      element.dataset.id = String(block.id);
      element.style.top = `${((block.start - START_MINUTES) / TOTAL_DAY_MINUTES) * 100}%`;
      element.style.height = `${(block.duration / TOTAL_DAY_MINUTES) * 100}%`;
      element.style.background = `linear-gradient(135deg, ${color}, ${color}dd)`;

      const meta = document.createElement('div');
      meta.className = 'block-meta';
      const label = document.createElement('span');
      label.className = 'block-label';
      label.textContent = block.label;
      const time = document.createElement('span');
      time.className = 'block-time';
      time.textContent = blockTime;
      meta.append(label, time);
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'block-remove';
      deleteButton.setAttribute('aria-label', `Delete ${block.label}`);
      deleteButton.textContent = '×';
      element.append(meta, deleteButton);

      if (isShortDuration) {
        element.style.fontSize = '0.68rem';
        element.style.padding = '6px 8px';
      }

      const removeButton = element.querySelector('.block-remove');
      if (removeButton) {
        removeButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const removeIndex = state.blocks.findIndex((entry) => entry.id === block.id);
          if (removeIndex !== -1) {
            state.blocks.splice(removeIndex, 1);
            if (state.selectedBlockId === block.id) state.selectedBlockId = null;
            render();
          }
        });
      }

      element.addEventListener('click', () => {
        state.selectedBlockId = block.id;
        updateSelectedDay(block.dayIndex);
        renderBlocks();
      });

      element.addEventListener('pointerdown', (event) => startDrag(event, block.id));

      canvas.appendChild(element);
    });

    column.appendChild(canvas);
    els.weekGrid.appendChild(column);
  });
}

function render() {
  document.documentElement.style.setProperty('--schedule-height', `${SCHEDULE_HEIGHT}px`);
  document.documentElement.style.setProperty('--hour-height', `${SCHEDULE_HEIGHT / (DAY_END_HOUR - DAY_START_HOUR)}px`);
  renderWeekHeader();
  createTimeLabels();
  renderNonPatientCareOptions();
  renderBlocks();
  const isSelectedDayOff = state.daysOff[state.selectedDayIndex];
  [els.addAppointment, els.addLunch30, els.addLunch60].forEach((button) => {
    if (button) button.disabled = isSelectedDayOff;
  });
  updateDayScheduleButtons();
  if (els.removeAppointment) els.removeAppointment.disabled = state.selectedBlockId === null;
  calculateScheduleSummary();
}

function getBlockById(blockId) {
  return state.blocks.find((block) => block.id === blockId);
}

let dragState = null;

function startDrag(event, blockId) {
  if (dragState || event.button !== 0 || event.isPrimary === false || event.target.closest('button')) return;
  const block = getBlockById(blockId);
  if (!block) return;

  event.preventDefault();
  state.selectedBlockId = blockId;
  showStatus('');
  updateSelectedDay(block.dayIndex);

  if (typeof event.currentTarget.setPointerCapture === 'function') {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  dragState = {
    element: event.currentTarget,
    pointerId: event.pointerId,
    id: blockId,
    originalStart: block.start,
    pointerStartY: event.clientY,
    dayIndex: block.dayIndex ?? state.selectedDayIndex
  };

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
  window.addEventListener('blur', stopDrag);
  window.addEventListener('keydown', cancelDrag);
  event.currentTarget.addEventListener('lostpointercapture', stopDrag);
}

function cancelDrag(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    stopDrag({ type: 'pointercancel' });
  }
}

function onDragMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const block = getBlockById(dragState.id);
  if (!block) return;

  const targetDayIndex = [...els.weekGrid.children].findIndex((column) => {
    const bounds = column.getBoundingClientRect();
    return event.clientX >= bounds.left && event.clientX < bounds.right;
  });
  if (targetDayIndex < 0 || state.daysOff[targetDayIndex]) {
    showStatus('Move blocked: choose a working day in the calendar.');
    return;
  }

  const deltaPixels = event.clientY - dragState.pointerStartY;
  const pixelsPerMinute = dragState.element.parentElement.getBoundingClientRect().height / TOTAL_DAY_MINUTES;
  const rawDeltaMinutes = deltaPixels / pixelsPerMinute;
  const deltaMinutes = Math.round(rawDeltaMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const nextStart = dragState.originalStart + deltaMinutes;
  const shiftWindow = getShiftWindow(targetDayIndex);
  if (shiftWindow.end - shiftWindow.start < block.duration) {
    showStatus('Move blocked: the destination shift is shorter than this block.');
    return;
  }
  const minStart = Math.max(START_MINUTES, shiftWindow.start);
  const maxStart = Math.min(END_MINUTES - block.duration, shiftWindow.end - block.duration);
  const clampedStart = Math.min(Math.max(nextStart, minStart), maxStart);

  const overlaps = state.blocks.some((other) => other.id !== block.id && (other.dayIndex ?? state.selectedDayIndex) === targetDayIndex && hasOverlap({ ...block, start: clampedStart, dayIndex: targetDayIndex }, other));
  if (!overlaps) {
    showStatus('');
    block.dayIndex = targetDayIndex;
    block.start = clampedStart;
    updateSelectedDay(targetDayIndex);
    const element = dragState.element;
    const canvas = els.weekGrid.children[targetDayIndex].querySelector('.schedule-canvas');
    if (element.parentElement !== canvas) {
      canvas.appendChild(element);
      element.setPointerCapture(dragState.pointerId);
    }
    element.style.top = `${((block.start - START_MINUTES) / TOTAL_DAY_MINUTES) * 100}%`;
    element.querySelector('.block-time').textContent = block.type === 'appointment' && block.duration === 30
      ? minutesToCompactTimeRange(block.start, block.start + block.duration)
      : `${minutesToTimeLabel(block.start)} - ${minutesToTimeLabel(block.start + block.duration)}`;
  } else {
    showStatus('Move blocked: this time overlaps another block.');
  }
}

function stopDrag(event) {
  if (!dragState || (event.pointerId != null && event.pointerId !== dragState.pointerId)) return;
  const finishedDrag = dragState;
  dragState = null;
  finishedDrag.element.removeEventListener('lostpointercapture', stopDrag);
  const canceled = ['pointercancel', 'blur', 'lostpointercapture'].includes(event.type);
  if (canceled) {
    const block = getBlockById(finishedDrag.id);
    if (block) {
      block.start = finishedDrag.originalStart;
      block.dayIndex = finishedDrag.dayIndex;
      updateSelectedDay(block.dayIndex);
    }
    showStatus('Move canceled.');
  }
  if (finishedDrag.element.hasPointerCapture(finishedDrag.pointerId)) {
    finishedDrag.element.releasePointerCapture(finishedDrag.pointerId);
  }

  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('pointercancel', stopDrag);
  window.removeEventListener('blur', stopDrag);
  window.removeEventListener('keydown', cancelDrag);
  // Keep the released element alive so a following click targets the same block.
  if (canceled) renderBlocks();
  calculateScheduleSummary();
}

function renderDurationOptions() {
  if (!els.durationOptions) return;
  els.durationOptions.innerHTML = '';

  state.durationOptions.forEach((option) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chip-wrap';

    const button = document.createElement('button');
    button.className = `chip${state.selectedType === 'appointment' && state.selectedDurationKey === option.id ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.minutes = String(option.minutes);
    button.textContent = `${option.minutes} min`;

    button.addEventListener('click', () => {
      state.selectedType = 'appointment';
      state.selectedDurationKey = option.id;
      renderDurationOptions();
      renderNonPatientCareOptions();
    });

    wrapper.appendChild(button);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'chip-label-input';
    labelInput.value = option.label;
    labelInput.setAttribute('aria-label', `Customize label for ${option.label}`);
    labelInput.addEventListener('change', (event) => {

      const nextLabel = (event.target.value || '').trim();
      const sanitizedLabel = nextLabel || `${option.minutes} min`;

      option.label = sanitizedLabel;
      renderDurationOptions();
    });

    wrapper.appendChild(labelInput);

    if (option.isCustom) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'chip-remove';
      removeButton.textContent = '×';
      removeButton.title = `Remove ${option.label}`;
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        state.durationOptions = state.durationOptions.filter((item) => item.id !== option.id);
        if (state.selectedDurationKey === option.id) {
          state.selectedDurationKey = state.durationOptions[0]?.id || 'appointment-30';
        }
        renderDurationOptions();
      });
      wrapper.appendChild(removeButton);
    }

    els.durationOptions.appendChild(wrapper);
  });
}

function renderNonPatientCareOptions() {
  if (!els.nonPatientCareOptions) return;

  els.nonPatientCareOptions.innerHTML = '';

  state.nonPatientCareOptions.forEach((option) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chip-wrap';

    const button = document.createElement('button');
    button.className = `chip non-patient-chip${state.selectedType === 'nonPatientCare' && state.selectedNonPatientCareKey === option.id ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.minutes = String(option.minutes);
    button.textContent = `${option.minutes} min`;
    button.style.borderColor = NON_PATIENT_COLOR;
    button.style.color = NON_PATIENT_COLOR;
    button.style.background = state.selectedType === 'nonPatientCare' && state.selectedNonPatientCareKey === option.id ? 'rgba(142, 92, 246, 0.12)' : '#fff';

    button.addEventListener('click', () => {
      state.selectedType = 'nonPatientCare';
      state.selectedNonPatientCareKey = option.id;
      renderDurationOptions();
      renderNonPatientCareOptions();
    });

    wrapper.appendChild(button);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'chip-label-input';
    labelInput.value = option.label;
    labelInput.setAttribute('aria-label', `Customize label for ${option.label}`);
    labelInput.addEventListener('change', (event) => {

      const nextLabel = (event.target.value || '').trim();
      const sanitizedLabel = nextLabel || `${option.minutes} min`;

      option.label = sanitizedLabel;
      renderNonPatientCareOptions();
    });

    wrapper.appendChild(labelInput);
    els.nonPatientCareOptions.appendChild(wrapper);
  });
}

function getSelectedDuration() {
  if (state.selectedType === 'nonPatientCare') {
    return state.nonPatientCareOptions.find((option) => option.id === state.selectedNonPatientCareKey) || state.nonPatientCareOptions[0] || { label: '15 min', minutes: 15, color: NON_PATIENT_COLOR };
  }

  return state.durationOptions.find((option) => option.id === state.selectedDurationKey) || state.durationOptions[0] || { label: '30 min', minutes: 30 };
}

function generateNewAppointment() {
  if (state.daysOff[state.selectedDayIndex]) return;
  const preferred = getSelectedDuration();
  const proposedStart = findNextAvailableStart(preferred.minutes, null, START_MINUTES, state.selectedDayIndex);
  if (proposedStart === null) { showStatus('No available time fits this block in the selected shift.'); return; }
  showStatus('Block added.');
  const blockType = state.selectedType === 'nonPatientCare' ? 'nonPatientCare' : 'appointment';
  const newBlock = {
    id: createBlockId(),
    dayIndex: state.selectedDayIndex,
    type: blockType,
    label: preferred.label || `Appointment ${getBlocksForDay(state.selectedDayIndex).filter((b) => b.type === 'appointment').length + 1}`,
    start: proposedStart,
    duration: preferred.minutes,
    color: preferred.color || (blockType === 'nonPatientCare' ? NON_PATIENT_COLOR : getAppointmentColor(preferred.label, state.blocks.length))
  };

  state.blocks.push(newBlock);
  state.selectedBlockId = newBlock.id;
  render();
}

function moveSelectedBlock(deltaMinutes) {
  if (!state.selectedBlockId) return;

  const block = state.blocks.find((entry) => entry.id === state.selectedBlockId);
  if (!block) return;

  const nextStart = block.start + deltaMinutes;
  const shiftWindow = getShiftWindow(block.dayIndex ?? state.selectedDayIndex);
  const minStart = Math.max(START_MINUTES, shiftWindow.start);
  const maxStart = Math.min(END_MINUTES - block.duration, shiftWindow.end - block.duration);
  const clampedStart = Math.min(Math.max(nextStart, minStart), maxStart);

  if (block.type !== 'appointment' && block.type !== 'nonPatientCare') return;

  const overlaps = state.blocks.some((other) => other.id !== block.id && (other.dayIndex ?? state.selectedDayIndex) === block.dayIndex && hasOverlap({ ...block, start: clampedStart }, other));
  if (!overlaps) {
    block.start = clampedStart;
    render();
  }
}

function removeSelectedAppointment() {
  if (!state.selectedBlockId) { showStatus('Select a block to remove.'); return; }

  const index = state.blocks.findIndex((entry) => entry.id === state.selectedBlockId);
  if (index === -1) return;

  state.blocks.splice(index, 1);
  showStatus('Block removed.');
  state.selectedBlockId = null;
  render();
}

function attachEvents() {
  document.getElementById('saveTemplate').addEventListener('click', saveTemplate);
  document.getElementById('loadTemplate').addEventListener('click', loadTemplate);
  document.getElementById('deleteTemplate').addEventListener('click', deleteTemplate);
  document.getElementById('newTemplate').addEventListener('click', newBlankTemplate);
  document.getElementById('savedTemplates').addEventListener('change', (event) => {
    document.getElementById('loadTemplate').disabled = !event.target.value;
    document.getElementById('deleteTemplate').disabled = !event.target.value;
  });
  try { refreshTemplates(); } catch (error) {
    showStatus('Saved templates are unavailable. You can still build and export a schedule.');
  }

  if (els.addAppointment) {
    els.addAppointment.addEventListener('click', () => {
      generateNewAppointment();
    });
  }

  if (els.addLunch30) {
    els.addLunch30.addEventListener('click', () => addLunchBlock(30));
  }

  if (els.addLunch60) {
    els.addLunch60.addEventListener('click', () => addLunchBlock(60));
  }

  if (els.copyDaySchedule) {
    els.copyDaySchedule.addEventListener('click', copySelectedDaySchedule);
  }

  if (els.pasteDaySchedule) {
    els.pasteDaySchedule.addEventListener('click', pasteDaySchedule);
  }

  if (els.exportExcel) {
    els.exportExcel.addEventListener('click', exportScheduleCsv);
  }

  if (els.exportPdf) {
    els.exportPdf.addEventListener('click', () => window.print());
  }

  if (els.removeAppointment) {
    els.removeAppointment.addEventListener('click', () => {
      removeSelectedAppointment();
    });
  }

  if (els.resetSchedule) {
    els.resetSchedule.addEventListener('click', () => {
      const dayIndex = state.selectedDayIndex;
      if (!window.confirm('Clear all blocks and restore default shift hours for the selected day?')) return;
      const selectedBlock = getBlockById(state.selectedBlockId);
      if (selectedBlock && (selectedBlock.dayIndex ?? dayIndex) === dayIndex) {
        state.selectedBlockId = null;
      }

      state.shiftTimes[dayIndex] = { start: '08:00', end: '17:00' };
      state.daysOff[dayIndex] = false;
      state.blocks = state.blocks.filter((block) => (block.dayIndex ?? dayIndex) !== dayIndex);
      if (els.scheduleCopyStatus) els.scheduleCopyStatus.textContent = '';
      render();
    });
  }
}

renderDurationOptions();
renderNonPatientCareOptions();
attachEvents();
render();
restoreCurrentDraft();
// Persist field edits and button actions as well as changes made by scheduling code.
document.addEventListener('input', saveCurrentDraft);
document.addEventListener('change', saveCurrentDraft);
document.addEventListener('click', saveCurrentDraft);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveCurrentDraft();
});
window.addEventListener('pagehide', saveCurrentDraft);
